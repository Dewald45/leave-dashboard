"use server";

import { revalidatePath } from "next/cache";
import { q1 } from "@/lib/db";
import { findDecisionLink, claimDecisionLink } from "@/lib/decisionLinks";
import { applyDecision } from "@/lib/decide";

export type DecideResult = { error?: string; done?: "approved" | "rejected" };

/** Decide a request from an emailed link. The token is the only credential. */
export async function decideViaLink(_prev: DecideResult, formData: FormData): Promise<DecideResult> {
  const token = String(formData.get("token") || "");
  const decision = String(formData.get("decision") || "");
  const note = String(formData.get("note") || "").trim().slice(0, 1000) || null;
  if (decision !== "approved" && decision !== "rejected") return { error: "Choose Approve or Decline." };

  const link = await findDecisionLink(token);
  if (!link || link.expired || link.used) return { error: "This link has expired or was already used. Open the request in TimeOff instead." };

  const me = await q1<{ id: string; full_name: string; email: string }>(
    "select id, full_name, email from profiles where id = $1",
    [link.approver_id]
  );
  if (!me) return { error: "This link is no longer valid." };
  if (!(await claimDecisionLink(token))) return { error: "This link was already used." };

  const outcome = await applyDecision(me, link.request_id, decision, note, "email");
  if (outcome === "not_pending") return { error: "Someone already decided this request, or it was cancelled." };
  if (outcome !== "done") return { error: "You can't decide this request any more." };

  revalidatePath("/approvals");
  revalidatePath(`/requests/${link.request_id}`);
  return { done: decision };
}
