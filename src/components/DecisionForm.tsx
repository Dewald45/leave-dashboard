import { decideRequest } from "@/app/(app)/actions";

/** Approve / reject controls, shared by the approvals list and the request page. */
export default function DecisionForm({
  requestId,
  stacked = false,
}: {
  requestId: string;
  /** Always stack vertically (for narrow sidebars). */
  stacked?: boolean;
}) {
  const noteId = `note-${requestId}`;
  return (
    <form
      action={decideRequest}
      className={`flex flex-col gap-3 ${stacked ? "" : "sm:flex-row sm:items-end"}`}
    >
      <input type="hidden" name="id" value={requestId} />
      <div className="flex-1">
        <label htmlFor={noteId} className="mb-1 block text-xs font-medium text-sand-600">
          Note to employee (optional)
        </label>
        <input
          id={noteId}
          name="note"
          type="text"
          placeholder="Justify yourself (optional, but kind)…"
          className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div className={`flex gap-2 ${stacked ? "[&>button]:flex-1" : ""}`}>
        <button
          type="submit"
          name="decision"
          value="rejected"
          className="min-h-[40px] rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
        >
          Reject
        </button>
        <button
          type="submit"
          name="decision"
          value="approved"
          className="min-h-[40px] rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Approve
        </button>
      </div>
    </form>
  );
}
