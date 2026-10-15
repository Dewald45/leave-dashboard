#!/usr/bin/env node
/**
 * Apply db/schema.sql (idempotent) and optionally seed the first admin.
 * Runs on container start (see docker-entrypoint.sh) and via `npm run db:migrate`.
 *
 * Env:
 *   DATABASE_URL          required — Postgres connection string
 *   SEED_ADMIN_EMAIL      optional — create this admin if no such user exists
 *   SEED_ADMIN_PASSWORD   optional — plaintext; hashed with bcrypt at seed time
 *   SEED_ADMIN_NAME       optional — display name (default "Administrator")
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import bcrypt from "bcryptjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

async function main() {
  await client.connect();

  const schema = readFileSync(join(__dirname, "..", "db", "schema.sql"), "utf8");
  await client.query(schema);
  console.log("[migrate] schema applied");

  const email = (process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "";
  const name = (process.env.SEED_ADMIN_NAME || "Administrator").trim();

  if (email && password) {
    const { rows } = await client.query(
      "select id from users where lower(email) = lower($1)",
      [email]
    );
    if (rows.length === 0) {
      const hash = bcrypt.hashSync(password, 10);
      const {
        rows: [user],
      } = await client.query(
        "insert into users (email, password_hash) values ($1, $2) returning id",
        [email, hash]
      );
      await client.query(
        `insert into profiles (id, full_name, email, role, employment_start_date)
         values ($1, $2, $3, 'admin', current_date)`,
        [user.id, name, email]
      );
      await client.query(
        "select public.provision_balances($1, current_date)",
        [user.id]
      );
      await client.query(
        `insert into audit_log (action, entity_type, entity_id, subject_id, subject_name, summary)
         values ('employee.created', 'profile', $1::text, $1::uuid, $2, $3)`,
        [user.id, name, `Seeded first administrator ${name} (${email})`]
      );
      console.log(`[migrate] seeded admin ${email}`);
    } else {
      console.log("[migrate] admin already exists — skipping seed");
    }
  } else {
    console.log("[migrate] SEED_ADMIN_EMAIL/PASSWORD not set — skipping admin seed");
  }
}

main()
  .then(() => client.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[migrate] failed:", err);
    client.end().finally(() => process.exit(1));
  });
