import type { BookingStatus, ConversationStatus, Priority, Reliability, Source } from "@/lib/mock/types";
import {
  bookingStatusLabels,
  conversationStatusLabels,
  deliveryStatusLabels,
  reliabilityLabels,
  sourceLabels,
} from "@/lib/labels";

const statusStyles: Record<BookingStatus, string> = {
  received: "bg-blue-100 text-blue-800",
  proposal_sent: "bg-indigo-100 text-indigo-800",
  interested: "bg-amber-100 text-amber-800",
  to_verify: "bg-orange-100 text-orange-800",
  availability_blocked: "bg-purple-100 text-purple-800",
  awaiting_payment: "bg-fuchsia-100 text-fuchsia-800",
  confirmed: "bg-green-100 text-green-800",
  expired: "bg-gray-200 text-gray-600",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-200 text-gray-600",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${statusStyles[status]}`}
    >
      {bookingStatusLabels[status]}
    </span>
  );
}

const deliveryStyles: Record<string, string> = {
  draft: "bg-amber-100 text-amber-900",
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-700",
  autosend_off: "bg-orange-100 text-orange-900",
};
const deliveryIcon: Record<string, string> = {
  draft: "📝",
  sent: "✓",
  failed: "⚠",
  autosend_off: "⏸",
};

/** Stato di CONSEGNA di un messaggio (bozza / inviata / fallita / autosend OFF). */
export function DeliveryBadge({ status }: { status?: string | null }) {
  if (!status || !deliveryStatusLabels[status]) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${deliveryStyles[status] ?? "bg-slate-100 text-slate-700"}`}
    >
      {deliveryIcon[status] ?? ""} {deliveryStatusLabels[status]}
    </span>
  );
}

const priorityDot: Record<Priority, string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-green-500",
};

export function ScoreBadge({ score, priority }: { score: number; priority: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-800">
      <span className={`h-2.5 w-2.5 rounded-full ${priorityDot[priority]}`} aria-hidden />
      {score}
    </span>
  );
}

export function SourceChip({ source }: { source: Source }) {
  return (
    <span className="inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-600">
      {sourceLabels[source]}
    </span>
  );
}

const reliabilityStyles: Record<Reliability, { chip: string; icon: string }> = {
  high: { chip: "bg-green-100 text-green-800", icon: "✓" },
  medium: { chip: "bg-amber-100 text-amber-900", icon: "⚠" },
  low: { chip: "bg-red-600 text-white", icon: "⛔" },
};

export function ReliabilityChip({ reliability }: { reliability: Reliability }) {
  const s = reliabilityStyles[reliability];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${s.chip}`}
      title="Affidabilità prezzo/disponibilità"
    >
      {s.icon} {reliabilityLabels[reliability]}
    </span>
  );
}

const convStatusStyles: Record<ConversationStatus, string> = {
  open: "bg-blue-100 text-blue-800",
  pending_staff: "bg-red-100 text-red-700",
  closed: "bg-gray-200 text-gray-600",
};

export function ConversationStatusBadge({ status }: { status: ConversationStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${convStatusStyles[status]}`}
    >
      {status === "pending_staff" && "✋ "}
      {conversationStatusLabels[status]}
    </span>
  );
}
