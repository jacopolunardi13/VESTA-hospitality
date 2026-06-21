'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { BookingStatus } from '@/lib/quote/types'
import type { Tables } from '@/lib/supabase/database.types'
import { bookingStatusLabels, nextActionLabels } from '@/lib/labels'
import { formatDate, formatDateRange, formatDateTime, formatEuro, formatGuests } from '@/lib/format'
import { ReliabilityChip, ScoreBadge, SourceChip, StatusBadge } from '@/components/badges'
import type { Reliability, Source } from '@/lib/mock/types'

type BookingRow = Tables<'booking_requests'>
type SortMode = 'todo' | 'recent'

const workRank: Record<BookingStatus, number> = {
  awaiting_payment:     0,
  availability_blocked: 1,
  to_verify:            2,
  interested:           3,
  received:             4,
  proposal_sent:        5,
  confirmed:            6,
  expired:              7,
  rejected:             8,
  cancelled:            9,
}

const waitingStatuses: BookingStatus[] = ['proposal_sent']
const closedStatuses: BookingStatus[] = ['confirmed', 'expired', 'rejected', 'cancelled']

function nightsBetween(checkIn: string | null, checkOut: string | null): number {
  if (!checkIn || !checkOut) return 0
  return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000)
}

function RequestRow({ r }: { r: BookingRow }) {
  const action = nextActionLabels[r.status as BookingStatus]
  const nights = nightsBetween(r.check_in, r.check_out)
  const children = (Array.isArray(r.children) ? r.children : []) as { age: number }[]

  return (
    <li>
      <Link
        href={`/inbox/${r.id}`}
        className={`flex flex-col gap-1.5 border-l-4 px-3 py-2.5 transition-colors hover:bg-slate-50 sm:px-4 sm:py-3 ${
          action ? 'border-red-500' : 'border-transparent'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <ScoreBadge score={r.lead_score} priority={r.priority as 'high' | 'medium' | 'low'} />
          <span className="min-w-0 truncate font-medium whitespace-nowrap text-slate-900">
            {r.guest_name ?? r.guest_contact ?? 'Ospite'}
          </span>
          <span className="ml-auto shrink-0 text-base font-semibold text-slate-900">
            {r.offer_total_cents != null ? formatEuro(r.offer_total_cents) : '—'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
          {r.check_in && r.check_out ? (
            <span className="whitespace-nowrap">{formatDateRange(r.check_in, r.check_out)}</span>
          ) : r.check_in ? (
            <span className="whitespace-nowrap">Arrivo {formatDate(r.check_in)} · durata da confermare</span>
          ) : (
            <span className="text-slate-400">Date non specificate</span>
          )}
          {nights > 0 && (
            <span className="whitespace-nowrap">
              {nights} notti · {formatGuests(r.adults ?? 1, children)}
            </span>
          )}
          <span className="ml-auto">
            <StatusBadge status={r.status as BookingStatus} />
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
          {action && (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white uppercase">
              ⚡ {action}
            </span>
          )}
          {r.status === 'received' && r.offer_total_cents != null && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
              📝 Bozza pronta
            </span>
          )}
          {r.hold_expires_at && r.status === 'awaiting_payment' && (
            <span className="font-medium whitespace-nowrap text-purple-700">
              ⏱ hold fino al {formatDateTime(r.hold_expires_at)}
            </span>
          )}
          {r.offer_expires_at && r.status === 'proposal_sent' && (
            <span className="font-medium whitespace-nowrap text-indigo-700">
              ⏱ offerta valida fino al {formatDateTime(r.offer_expires_at)}
            </span>
          )}
          <SourceChip source={r.source as Source} />
          {r.data_reliability && (
            <ReliabilityChip reliability={r.data_reliability as Reliability} />
          )}
          <span className="ml-auto font-mono text-[10px] text-slate-300">
            {r.id.slice(0, 8)}
          </span>
        </div>
      </Link>
    </li>
  )
}

function Section({
  title,
  items,
  tone,
}: {
  title: string
  items: BookingRow[]
  tone: 'action' | 'waiting' | 'closed'
}) {
  if (items.length === 0) return null
  const toneStyles = {
    action:  'text-red-700',
    waiting: 'text-indigo-700',
    closed:  'text-slate-400',
  } as const
  return (
    <section className="flex flex-col gap-2">
      <h2 className={`text-xs font-bold tracking-wide uppercase ${toneStyles[tone]}`}>
        {title} ({items.length})
      </h2>
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {items.map(r => <RequestRow key={r.id} r={r} />)}
      </ul>
    </section>
  )
}

export default function InboxFilters({ requests }: { requests: BookingRow[] }) {
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all')
  const [sort, setSort] = useState<SortMode>('todo')

  const filtered = useMemo(
    () => requests.filter(r => statusFilter === 'all' || r.status === statusFilter),
    [requests, statusFilter]
  )

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) =>
        sort === 'todo'
          ? workRank[a.status as BookingStatus] - workRank[b.status as BookingStatus] ||
            b.lead_score - a.lead_score
          : b.created_at.localeCompare(a.created_at)
      ),
    [filtered, sort]
  )

  const todo    = sorted.filter(r => nextActionLabels[r.status as BookingStatus] !== null)
  const waiting = sorted.filter(r => waitingStatuses.includes(r.status as BookingStatus))
  const closed  = sorted.filter(r => closedStatuses.includes(r.status as BookingStatus))

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as BookingStatus | 'all')}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5"
        >
          <option value="all">Stato: tutti</option>
          {Object.entries(bookingStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-1 rounded-md border border-slate-300 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setSort('todo')}
            className={`rounded px-2 py-1 text-xs font-medium ${
              sort === 'todo' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Da fare
          </button>
          <button
            type="button"
            onClick={() => setSort('recent')}
            className={`rounded px-2 py-1 text-xs font-medium ${
              sort === 'recent' ? 'bg-slate-900 text-white' : 'text-slate-600'
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
      ) : sort === 'todo' ? (
        <>
          <Section title="⚡ Da gestire"          items={todo}    tone="action" />
          <Section title="In attesa dell'ospite"  items={waiting} tone="waiting" />
          <Section title="Chiuse"                 items={closed}  tone="closed" />
        </>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {sorted.map(r => <RequestRow key={r.id} r={r} />)}
        </ul>
      )}
    </>
  )
}
