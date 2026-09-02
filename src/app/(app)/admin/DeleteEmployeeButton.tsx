"use client";

import { useFormState, useFormStatus } from "react-dom";
import { deleteEmployee, type AdminResult } from "./actions";

function Button({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (
          !confirm(
            `Remove ${name}?\n\nThis permanently deletes their account, leave balances and full leave history. This cannot be undone.`
          )
        ) {
          e.preventDefault();
        }
      }}
      className="rounded-lg border border-rose-200 bg-white px-4 py-1.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
    >
      {pending ? "Removing…" : "Remove employee"}
    </button>
  );
}

export default function DeleteEmployeeButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const [state, formAction] = useFormState(
    async (_prev: AdminResult, formData: FormData) =>
      deleteEmployee(formData),
    {} as AdminResult
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Button name={name} />
      {state?.error ? (
        <span className="text-xs text-rose-600">{state.error}</span>
      ) : null}
    </form>
  );
}
