import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { parseIcsBusyNights } from './parse'

export interface SyncResult {
  feeds: number
  updated: number
  errors: number
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Sincronizza la disponibilità dai feed iCal attivi nel modello canonico
 * (rate_calendar.available). Con 0 feed configurati = no-op.
 * Scrive SOLO il campo available (source='ical'), preservando i prezzi.
 */
export async function syncIcalFeeds(
  sb: SupabaseClient<Database>,
  opts: { propertyId?: string; windowDays?: number } = {}
): Promise<SyncResult> {
  const windowDays = opts.windowDays ?? 540
  let q = sb.from('ical_feeds').select('id, org_id, property_id, room_id, url').eq('active', true)
  if (opts.propertyId) q = q.eq('property_id', opts.propertyId)
  const { data: feeds, error } = await q
  if (error || !feeds || feeds.length === 0) return { feeds: 0, updated: 0, errors: 0 }

  const today = new Date().toISOString().slice(0, 10)
  const windowEnd = addDays(today, windowDays)
  let updated = 0
  let errors = 0

  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const ics = await res.text()
      const busy = new Set(parseIcsBusyNights(ics).filter((d) => d >= today && d < windowEnd))

      // Notti occupate → available=0 (upsert, preserva price_cents).
      const rows = [...busy].map((date) => ({
        org_id: feed.org_id, property_id: feed.property_id, room_id: feed.room_id,
        date, available: 0 as const, source: 'ical' as const,
      }))
      if (rows.length > 0) {
        const { error: upErr } = await sb.from('rate_calendar').upsert(rows, { onConflict: 'room_id,date' })
        if (upErr) throw upErr
        updated += rows.length
      }

      // Rilascio: righe iCal nella finestra non più occupate → available=1.
      await sb.from('rate_calendar')
        .update({ available: 1 })
        .eq('room_id', feed.room_id).eq('source', 'ical')
        .gte('date', today).lt('date', windowEnd)
        .not('date', 'in', `(${[...busy].map((d) => `"${d}"`).join(',') || '""'})`)

      await sb.from('ical_feeds').update({ last_sync_at: new Date().toISOString(), last_status: 'ok' }).eq('id', feed.id)
    } catch (e) {
      errors++
      await sb.from('ical_feeds').update({
        last_sync_at: new Date().toISOString(),
        last_status: 'error: ' + (e instanceof Error ? e.message : String(e)).slice(0, 80),
      }).eq('id', feed.id)
    }
  }

  return { feeds: feeds.length, updated, errors }
}
