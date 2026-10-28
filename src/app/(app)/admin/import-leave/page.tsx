import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import LeaveImportWizard from "./LeaveImportWizard";

export default async function ImportLeavePage() {
  const { profile } = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeader
        title="Import past leave"
        action={
          <a
            href="/admin"
            className="inline-flex min-h-11 items-center rounded-full border border-sand-300 px-4 text-sm font-semibold text-ink-800 hover:bg-sand-50"
          >
            ← Back to Admin
          </a>
        }
      >
        Upload a Leave Transactions Report (.xlsx). Each person&apos;s approved
        leave is recorded as real entries, so their balances and history update
        automatically — using the same rules as the rest of the app.
      </PageHeader>
      <LeaveImportWizard />
    </div>
  );
}
