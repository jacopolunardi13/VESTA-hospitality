'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime } from '@/lib/format'
import { markNotificationRead, markAllNotificationsRead } from '@/app/(dashboard)/notifications/actions'

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string | null
  booking_request_id: string | null
  conversation_id: string | null
  read_at: string | null
  created_at: string
}

function targetHref(n: NotificationItem): string {
  if (n.booking_request_id) return `/inbox/${n.booking_request_id}`
  if (n.conversation_id) return `/conversations/${n.conversation_id}`
  return '/inbox'
}

const typeIcon: Record<string, string> = {
  proposal_auto_sent: '📤',
  proposal_draft: '📝',
  escalation: '⚠️',
  new_lead: '✨',
  followup_sent: '↻',
}

export default function NotificationBell({
  propertyId,
  initial,
}: {
  propertyId: string
  initial: NotificationItem[]
}) {
  const [items, setItems] = useState<NotificationItem[]>(initial)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const unread = items.filter((n) => !n.read_at).length

  // Real-time: nuove notifiche in push senza refresh (RLS filtra per org).
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`notifications:${propertyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `property_id=eq.${propertyId}` },
        (payload) => {
          const n = payload.new as NotificationItem
          setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev].slice(0, 30)))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [propertyId])

  // Chiude il dropdown al click esterno.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function onItemClick(n: NotificationItem) {
    if (!n.read_at) {
      setItems((prev) => prev.map((p) => (p.id === n.id ? { ...p, read_at: new Date().toISOString() } : p)))
      markNotificationRead(n.id)
    }
    setOpen(false)
  }

  function onMarkAll() {
    const now = new Date().toISOString()
    setItems((prev) => prev.map((p) => ({ ...p, read_at: p.read_at ?? now })))
    markAllNotificationsRead()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
        aria-label="Notifiche"
      >
        <span className="text-lg" aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop solo mobile */}
          <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} />
          <div className="fixed inset-0 z-40 flex flex-col bg-white md:absolute md:inset-auto md:right-0 md:top-10 md:z-30 md:max-h-[80vh] md:w-80 md:overflow-hidden md:rounded-lg md:border md:border-slate-200 md:shadow-lg">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-3 md:py-2">
              <span className="text-base font-semibold text-slate-900 md:text-sm">Notifiche</span>
              <div className="flex items-center gap-3">
                {unread > 0 && (
                  <button type="button" onClick={onMarkAll} className="text-xs text-slate-500 hover:text-slate-800">
                    Segna tutte come lette
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} aria-label="Chiudi" className="text-lg leading-none text-slate-400 hover:text-slate-700 md:hidden">✕</button>
              </div>
            </div>
          <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto md:max-h-96 md:flex-none">
            {items.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-slate-400">Nessuna notifica.</li>
            )}
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  href={targetHref(n)}
                  onClick={() => onItemClick(n)}
                  className={`block px-3 py-2.5 transition-colors hover:bg-slate-50 ${n.read_at ? '' : 'bg-indigo-50/40'}`}
                >
                  <div className="flex items-center gap-2">
                    <span aria-hidden>{typeIcon[n.type] ?? '•'}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{n.title}</span>
                    {!n.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-500" />}
                  </div>
                  {n.body && <p className="mt-0.5 line-clamp-2 pl-6 text-xs text-slate-500">{n.body}</p>}
                  <p className="mt-0.5 pl-6 text-[10px] text-slate-400">{formatDateTime(n.created_at)}</p>
                </Link>
              </li>
            ))}
          </ul>
          </div>
        </>
      )}
    </div>
  )
}
