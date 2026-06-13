"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { bookingRequests } from "@/lib/mock/data";
import type { BookingRequest, BookingStatus, Source } from "@/lib/mock/types";
import { bookingStatusLabels, nextActionLabels, sourceLabels } from "@/lib/labels";
import { formatDateRange, formatDateTime, formatEuro, formatGuests } from "@/lib/format";
import { ReliabilityChip, ScoreBadge, SourceChip, StatusBadge } from "@/components/badges";

type SortMode = "todo" | "recent";

// Ordine di lavoro: prima ciò che sblocca soldi, poi il resto.
const workRank: Record<BookingStatus, number> = {
  awaiting_payment: 0,
  availability_blocked: 1,
  to_verify: 2,
  interested: 3,
  received: 4,
  proposal_sent: 5, // in attesa dell'ospite
  confirmed: 6,
  expired: 7,
  rejected: 8,
  cancelled: 9,
};

const waitingStatuses: BookingStatus[] = ["proposal_sent"];
const closedStatuses: BookingStatus[] = ["confirmed", "expired", "rejected", "cancelled"];

function RequestRow({ request: r }: { request: BookingRequest }) {
  const action = nextActionLabels[r.status];
  const guestSavingCents = r.otaPriceCents - r.offerTotalCents;
  const guestSavingPct = Math.round((guestSavingCents / r.otaPriceCents) * 100);
  return (
    <li>
      <Link
        href={`/inbox/${r.id}`}
        className={`flex flex-col gap-2 border-l-4 px-4 py-3 transition-colors hover:bg-slate-50 ${
          action ? "border-red-500" : "border-transparent"
        }`}
      >
        {/* Riga 1: chi e quanto vale */}
        <div className="flex items-center gap-2.5">
          <ScoreBadge score={r.leadScore} priority={r.priority} />
          <span className="min-w-0 truncate font-medium whitespace-nowrap text-slate-900">
            {r.guestName ?? r.guestContact ?? "Ospite"}
          </span>
          <span className="ml-auto flex shrink-0 flex-col items-end leading-tight">
            <span className="text-base font-semibold text-slate-900">
              {formatEuro(r.offerTotalCents)}
            </span>
            <span className="text-xs font-medium text-green-700">
              −{guestSavingPct}% vs Booking ({formatEuro(guestSavingCents)})
            </span>
          </span>
        </div>

        {/* Riga 2: soggiorno + stato */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
          <span className="whitespace-nowrap">{formatDateRange(r.checkIn, r.checkOut)}</span>
          <span className="whitespace-nowrap">{r.nights} notti · {formatGuests(r.adults, r.children)}</span>
          <span className="ml-auto">
            <StatusBadge status={r.status} />
          </span>
        </div>

        {/* Riga 3: azione richiesta in evidenza + meta */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
          {action && (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-xs font-bold tracking-wide text-white uppercase">
              ⚡ {action}
            </span>
          )}
          {r.holdExpiresAt && r.status === "awaiting_payment" && (
            <span className="font-medium whitespace-nowrap text-purple-700">
              ⏱ hold fino al {formatDateTime(r.holdExpiresAt)}
            </span>
          )}
          {r.offerExpiresAt && r.status === "proposal_sent" && (
            <span className="font-medium whitespace-nowrap text-indigo-700">
              ⏱ offerta valida fino al {formatDateTime(r.offerExpiresAt)}
            </span>
          )}
          <SourceChip source={r.source} />
          <ReliabilityChip reliability={r.reliability} />
          <span className="ml-auto whitespace-nowrap">{r.code}</span>
        </div>
      </Link>
    </li>
  );
}

function Section({ title, items, tone }: { title: string; items: BookingRequest[]; tone: "action" | "waiting" | "closed" }) {
  if (items.length === 0) return null;
  const toneStyles = {
    action: "text-red-700",
    waiting: "text-indigo-700",
    closed: "text-slate-400",
  } as const;
  return (
    <section className="flex flex-col gap-2">
      <h2 className={`text-xs font-bold tracking-wide uppercase ${toneStyles[tone]}`}>
        {title} ({items.length})
      </h2>
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {items.map((r) => (
          <RequestRow key={r.id} request={r} />
        ))}
      </ul>
    </section>
  );
}

export default function InboxPage() {
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<Source | "all">("all");
  const [sort, setSort] = useState<SortMode>("todo");

  const filtered = useMemo(
    () =>
      bookingRequests.filter(
        (r) =>
          (statusFilter === "all" || r.status === statusFilter) &&
          (sourceFilter === "all" || r.source === sourceFilter)
      ),
    [statusFilter, sourceFilter]
  );

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) =>
        sort === "todo"
          ? workRank[a.status] - workRank[b.status] || b.leadScore - a.leadScore
          : b.createdAt.localeCompare(a.createdAt)
      ),
    [filtered, sort]
  );

  const todo = sorted.filter((r) => nextActionLabels[r.status] !== null);
  const waiting = sorted.filter((r) => waitingStatuses.includes(r.status));
  const closed = sorted.filter((r) => closedStatuses.includes(r.status));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Inbox richieste</h1>

      {/* Banner setup (mock, ui-mvp-plan D1) */}
      <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
        <span>⚠ Setup incompleto: mancano le tariffe di agosto nel calendario.</span>
        <span
          className="shrink-0 cursor-not-allowed font-medium whitespace-nowrap text-amber-700 underline decoration-dotted"
          title="Sezione Calendario in arrivo in un prossimo incremento"
        >
          Completa →
        </span>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as BookingStatus | "all")}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5"
        >
          <option value="all">Stato: tutti</option>
          {Object.entries(bookingStatusLabels).map(([value, label]) => (
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
        <div className="ml-auto flex items-center gap-1 rounded-md border border-slate-300 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setSort("todo")}
            className={`rounded px-2 py-1 text-xs font-medium ${
              sort === "todo" ? "bg-slate-900 text-white" : "text-slate-600"
            }`}
          >
            Da fare
          </button>
          <button
            type="button"
            onClick={() => setSort("recent")}
            className={`rounded px-2 py-1 text-xs font-medium ${
              sort === "recent" ? "bg-slate-900 text-white" : "text-slate-600"
            }`}
          >
            Più recenti
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
          Nessuna richiesta corrisponde ai filtri.
        </p>
      ) : sort === "todo" ? (
        <>
          <Section title="⚡ Da gestire" items={todo} tone="action" />
          <Section title="In attesa dell'ospite" items={waiting} tone="waiting" />
          <Section title="Chiuse" items={closed} tone="closed" />
        </>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {sorted.map((r) => (
            <RequestRow key={r.id} request={r} />
          ))}
        </ul>
      )}

      <div>
        <button
          type="button"
          className="cursor-not-allowed rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-400"
          title="Demo con dati mock"
        >
          + Nuova richiesta manuale
        </button>
      </div>
    </div>
  );
}
