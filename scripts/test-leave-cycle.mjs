/**
 * Leave-cycle regression tests.
 *
 * Loads db/schema.sql into a throwaway in-process PGlite database (nothing
 * touches your dev or live data) and checks the accrual, carry-over and
 * adjustment maths against the company's rules:
 *
 *   Annual leave: 15 days a cycle, cycle runs from the employee's start date.
 *   5 of those are held back from day one for the year-end closure, so 10 are
 *   bookable. Unused bookable days carry into the next cycle and expire six
 *   months in (BCEA s20(4)). Carry-over never stacks: days that expired are
 *   gone and are not handed on again.
 *
 * Run: node scripts/test-leave-cycle.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = readFileSync(join(ROOT, "db/schema.sql"), "utf8");
const P = "11111111-1111-1111-1111-111111111111";

let pass = 0;
const failures = [];

function check(name, actual, expected) {
  const a = Number(actual), e = Number(expected);
  if (Math.abs(a - e) < 1e-6) { pass++; console.log(`  ok   ${name}`); }
  else { failures.push(`${name}: expected ${e}, got ${a}`); console.log(`  FAIL ${name}: expected ${e}, got ${a}`); }
}

async function newDb(startDate, { gender = "male" } = {}) {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(`
    insert into users (id, email, password_hash)
      values ('${P}', 'test@example.com', 'x');
    insert into profiles (id, full_name, email, role, gender, employment_start_date)
      values ('${P}', 'Test Person', 'test@example.com', 'employee', '${gender}', '${startDate}');`);
  return db;
}

async function typeId(db, code) {
  return (await db.query("select id from leave_types where code = $1", [code])).rows[0].id;
}

async function addLeave(db, code, start, end, days, status = "approved") {
  await db.query(
    `insert into leave_requests (profile_id, leave_type_id, start_date, end_date, days, status, source)
     values ($1, $2, $3, $4, $5, $6, 'import')`,
    [P, await typeId(db, code), start, end, days, status]
  );
}

/** Provision like the app does: oldest cycle first, then today. */
async function provision(db, asOf = []) {
  for (const d of [...new Set([...asOf])].sort()) {
    await db.query("select provision_balances($1, $2::date)", [P, d]);
  }
  await db.query("select provision_balances($1, current_date)", [P]);
}

async function current(db, code) {
  const r = await db.query(
    `select entitled_days::float8 ent, reserved_days::float8 res, carried_days::float8 carried,
            used_days::float8 used, pending_days::float8 pending, carry_left::float8 carry_left,
            carry_forward::float8 carry_forward, adjusted_days::float8 adjusted,
            available_days::float8 avail, accrued_days::float8 accrued,
            cycle_start::text cs, cycle_end::text ce
       from balance_summary where leave_code = $1 and is_current`, [code]);
  return r.rows[0];
}

/** Today, shifted so the employee's anniversary is N months ago. */
function startDateMonthsAgo(months) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- tests
console.log("\n1. Brand-new employee, nothing taken");
{
  const db = await newDb(startDateMonthsAgo(1));
  await provision(db);
  const b = await current(db, "annual");
  check("entitled is 15", b.ent, 15);
  check("5 held back for closure", b.res, 5);
  check("10 bookable", b.avail, 10);
  check("nothing carried in", b.carried, 0);
}

console.log("\n2. Cycle reset with 9.5 unused days (the reported bug)");
{
  // Anniversary was 1 month ago, so the cycle that just ended is the one before.
  const db = await newDb(startDateMonthsAgo(61)); // ~5 years + 1 month
  const prev = startDateMonthsAgo(7);            // inside the cycle that just ended
  await addLeave(db, "annual", prev, prev, 0.5);
  await provision(db, [prev]);
  const b = await current(db, "annual");
  check("carried in = last cycle's 9.5 unused", b.carried, 9.5);
  check("available = 10 new + 9.5 carried", b.avail, 19.5);
  check("9.5 is flagged as expiring", b.carry_left, 9.5);
}

console.log("\n3. Carry-over does not stack over several idle years");
{
  // Five years of service, never took a day. Should be 10 new + 10 carried,
  // not 10 x 5 -- everything older than one cycle has expired.
  const db = await newDb(startDateMonthsAgo(61));
  await provision(db, [startDateMonthsAgo(50), startDateMonthsAgo(38), startDateMonthsAgo(26), startDateMonthsAgo(14)]);
  const b = await current(db, "annual");
  check("carried in capped at one cycle", b.carried, 10);
  check("available = 20, not 30/40/50", b.avail, 20);
}

console.log("\n4. Expired carry-over is not handed on again");
{
  const db = await newDb(startDateMonthsAgo(61));
  const old = startDateMonthsAgo(50);
  await addLeave(db, "annual", old, old, 0.5);
  await provision(db, [old]);
  const b = await current(db, "annual");
  check("old unused days have expired, not accumulated", b.avail, 20);
}

console.log("\n5. Held-back closure days are never bookable");
{
  const db = await newDb(startDateMonthsAgo(3));
  await provision(db);
  const b = await current(db, "annual");
  check("available excludes the 5 held back", b.avail, 10);
  check("entitled still records all 15", b.ent, 15);
}

console.log("\n6. Pending requests hold days back from carry-over");
{
  const db = await newDb(startDateMonthsAgo(61));
  const prev = startDateMonthsAgo(7);
  await addLeave(db, "annual", prev, prev, 3, "pending");
  await provision(db, [prev]);
  const b = await current(db, "annual");
  check("pending 3 days not carried", b.carried, 7);
}

console.log("\n7. Adjustment deducts from the balance");
{
  const db = await newDb(startDateMonthsAgo(1));
  await provision(db);
  const bal = (await db.query(
    `select b.id from leave_balances b join leave_types lt on lt.id = b.leave_type_id
      where lt.code = 'annual' and b.profile_id = $1`, [P])).rows[0].id;
  await db.query(
    `insert into leave_adjustments (balance_id, days, reason) values ($1, -10, 'correction')`, [bal]);
  const b = await current(db, "annual");
  check("10 days deducted", b.avail, 0);
  check("adjustment recorded", b.adjusted, -10);
  check("entitlement itself untouched", b.ent, 15);
}

console.log("\n8. Start-date correction re-settles every cycle");
{
  const db = await newDb(startDateMonthsAgo(61));
  const prev = startDateMonthsAgo(7);
  await addLeave(db, "annual", prev, prev, 0.5);
  await provision(db, [prev]);
  // Admin corrects the start date by a month, moving every cycle boundary.
  await db.query("update profiles set employment_start_date = $1 where id = $2",
    [startDateMonthsAgo(62), P]);
  await db.query("select settle_carry($1, true)", [P]);
  await provision(db, [prev]);
  const b = await current(db, "annual");
  check("carry re-derived, not left stale", b.carried, 9.5);
  check("available still sane", b.avail, 19.5);
}

console.log("\n9. Sick leave: 36-month cycle, first-six-months cap");
{
  const db = await newDb(startDateMonthsAgo(1));
  await provision(db);
  const b = await current(db, "sick");
  check("capped in the first six months", b.ent <= 30 ? 1 : 0, 1);
  check("no carry-over on sick leave", b.carried, 0);
}
{
  const db = await newDb(startDateMonthsAgo(12));
  await provision(db);
  const b = await current(db, "sick");
  check("full 30 days after six months", b.ent, 30);
}

console.log("\n10. Schema is idempotent (applies twice cleanly)");
{
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(SCHEMA);
  const r = await db.query("select count(*)::int n from leave_types");
  check("leave types not duplicated", r.rows[0].n, 5);
}

// ---------------------------------------------------------------- summary
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
