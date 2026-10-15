import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { findResetUser } from "@/lib/passwordReset";
import ResetForm from "./ResetForm";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? "";
  const valid = token ? !!(await findResetUser(token)) : false;

  return (
    <AuthShell
      tagline="Pick something you'll remember this time."
      footer={
        <Link href="/login" className="font-medium text-sand-400 hover:text-white">
          ← Back to sign in
        </Link>
      }
    >
      {valid ? (
        <ResetForm token={token} />
      ) : (
        <div className="space-y-3 rounded-2xl border border-sand-200 bg-white p-6 text-sm text-ink-800 shadow-sm">
          <p className="font-semibold text-ink-900">That link has expired.</p>
          <p>Reset links work once and only for an hour.</p>
          <Link
            href="/forgot-password"
            className="inline-block rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-800"
          >
            Send me a new one
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
