import Link from "next/link";
import { notFound } from "next/navigation";
import { getBookingRequest, getConversation } from "@/lib/mock/data";
import { senderLabels } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import { ConversationStatusBadge, SourceChip, StatusBadge } from "@/components/badges";
import StaffReplyBox from "@/components/staff-reply-box";
import type { Sender } from "@/lib/mock/types";

const bubbleStyles: Record<Sender, string> = {
  guest: "self-end bg-slate-900 text-white",
  ai: "self-start bg-slate-100 text-slate-800",
  staff: "self-start border border-emerald-300 bg-emerald-50 text-emerald-900",
};

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation) notFound();

  const request = conversation.bookingRequestId
    ? getBookingRequest(conversation.bookingRequestId)
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/conversations" className="text-sm text-slate-500 hover:text-slate-800">
          ← Conversazioni
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">
          {conversation.guestName ?? conversation.guestContact ?? "Ospite"}
        </h1>
        <SourceChip source={conversation.source} />
        <ConversationStatusBadge status={conversation.status} />
        <span className="text-xs uppercase text-slate-400">lingua: {conversation.language}</span>
      </div>

      {request && (
        <Link
          href={`/inbox/${request.id}`}
          className="flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900 transition-colors hover:bg-indigo-100"
        >
          🔗 Richiesta collegata: {request.code}
          <StatusBadge status={request.status} />
          <span className="ml-auto">→</span>
        </Link>
      )}

      {/* Thread */}
      <section className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-4">
        {conversation.messages.map((m) => (
          <div key={m.id} className={`flex max-w-[85%] flex-col ${m.sender === "guest" ? "self-end items-end" : "self-start items-start"}`}>
            <span className="px-1 text-[10px] uppercase tracking-wide text-slate-400">
              {senderLabels[m.sender]} · {formatDateTime(m.at)}
            </span>
            <div className={`rounded-2xl px-3.5 py-2 text-sm ${bubbleStyles[m.sender]}`}>
              {m.content}
              {m.escalation && (
                <span className="mt-1 block text-xs font-medium text-amber-700">
                  ⚠ escalation: KB senza risposta
                </span>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <StaffReplyBox disabled={conversation.status === "closed"} />
      </section>
    </div>
  );
}
