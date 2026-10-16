import AuthShell from "@/components/AuthShell";
import { findDecisionLink } from "@/lib/decisionLinks";
import { getRequestForDecision, canApproveRequest } from "@/lib/data";
import { formatDate } from "@/lib/leave";
import DecideForm from "./DecideForm";

// Opening this page never changes anything: email scanners follow links, so the
// decision only happens when the person presses Confirm.
export default async function DecidePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { d?: string };
}) {
  const link = await findDecisionLink(params.token);
  const req = link ? await getRequestForDecision(link.request_id) : null;
  const allowed = req && link ? await canApproveRequest(req.id, link.approver_id) : false;
  const verdict: Record<string, string> = {
    approved: "approved",
    rejected: "declined",
    cancelled: "cancelled",
  };

  let problem: string | null = null;
  if (!link || (link.expired && !link.used)) problem = "This link has expired. Open the request in TimeOff to decide it.";
  else if (!req) problem = "This request no longer exists.";
  // Covers the moment right after confirming, too: the page refreshes and the
  // link is now used, so say what happened rather than "link used".
  else if (req.status !== "pending") problem = `Done. ${req.employee_name}'s leave is ${verdict[req.status] ?? req.status}.`;
  else if (link.used) problem = "This link has already been used.";
  else if (!allowed) problem = "This request can't be decided from this link any more.";

  return (
    <AuthShell tagline="A leave request needs your verdict." footer={<a href="/login" className="hover:text-white">Sign in to TimeOff instead</a>}>
      <div className="rounded-3xl bg-white p-6">
        {problem || !req ? (
          <p className="text-sm text-ink-800">{problem}</p>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-ink-900">{req.employee_name}</h2>
            <p className="mt-1 text-sm text-sand-600">
              {req.leave_name} · {formatDate(req.start_date)} → {formatDate(req.end_date)} · {Number(req.days)} working day{Number(req.days) === 1 ? "" : "s"}
            </p>
            <div className="mt-5">
              <DecideForm token={params.token} initial={searchParams.d === "rejected" ? "rejected" : "approved"} />
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}
