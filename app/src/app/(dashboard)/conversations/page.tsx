"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { conversations } from "@/lib/mock/data";
import type { ConversationStatus, Source } from "@/lib/mock/types";
import { conversationStatusLabels, sourceLabels } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import { ConversationStatusBadge, SourceChip } from "@/components/badges";

export default function ConversationsPage() {
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<Source | "all">("all");

  const list = useMemo(
    () =>
      conversations
        .filter(
          (c) =>
            (statusFilter === "all" || c.status === statusFilter) &&
            (sourceFilter === "all" || c.source === sourceFilter)
        )
        .sort((a, b) => {
          // pending_staff prima, poi per recency
          if ((a.status === "pending_staff") !== (b.status === "pending_staff")) {
            return a.status === "pending_staff" ? -1 : 1;
          }
          return b.lastMessageAt.localeCompare(a.lastMessageAt);
        }),
    [statusFilter, sourceFilter]
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Conversazioni</h1>

      <div className="flex flex-wrap gap-2 text-sm">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ConversationStatus | "all")}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5"
        >
          <option value="all">Stato: tutti</option>
          {Object.entries(conversationStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as Source | "all")}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5"
        >
          <option value="all">Source: tutti</option>
          {Object.entries(sourceLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {list.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-slate-400">
            Nessuna conversazione corrisponde ai filtri.
          </li>
        )}
        {list.map((c) => (
          <li key={c.id}>
            <Link
              href={`/conversations/${c.id}`}
              className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-slate-50"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 truncate font-medium whitespace-nowrap text-slate-900">
                  {c.guestName ?? c.guestContact ?? "Ospite"}
                </span>
                <SourceChip source={c.source} />
                <ConversationStatusBadge status={c.status} />
                <span className="ml-auto text-xs whitespace-nowrap text-slate-400">
                  {formatDateTime(c.lastMessageAt)}
                </span>
              </div>
              <p className="truncate pl-1 text-sm text-slate-500">
                “{c.lastMessagePreview}”
                {c.bookingRequestId && (
                  <span className="ml-2 text-xs font-medium text-indigo-600">
                    [{c.bookingRequestId.replace("br-", "BR-")}]
                  </span>
                )}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
