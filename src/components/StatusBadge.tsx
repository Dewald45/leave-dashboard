import { STATUS_STYLES } from "@/lib/leave";

export default function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? {
    label: status,
    className: "bg-sand-100 text-sand-600 ring-sand-600/20",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.className}`}
    >
      {s.label}
    </span>
  );
}
