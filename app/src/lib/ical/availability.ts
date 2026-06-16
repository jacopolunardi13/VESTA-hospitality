import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export interface AvailabilityCheck {
  /** true se esiste una fonte disponibilità (feed iCal attivo e sincronizzato di recente). */
  verified: boolean
  /** true se, sapendo la disponibilità, la camera è libera per tutte le notti. */
  available: boolean
  reason: 'no_feed' | 'stale_feed' | 'free' | 'occupied'
}

function nights(checkIn: string, checkOut: string): string[] {
  const out: string[] = []
  for (const d = new Date(checkIn + 'T00:00:00Z'); d < new Date(checkOut + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

const FEED_FRESH_HOURS = 24

/**
 * Verifica la disponibilità di una camera per le date, basandosi sui feed iCal
 * sincronizzati nel canonico. Se non c'è un feed (o è stantio) → NON verificata
 * → il chiamante applica il fallback di cortesia (niente auto-invio).
 */
export async function checkAvailability(
  sb: SupabaseClient<Database>,
  roomId: string,
  checkIn: string,
  checkOut: string
): Promise<AvailabilityCheck> {
  const { data: feeds } = await sb
    .from('ical_feeds')
    .select('last_sync_at')
    .eq('room_id', roomId)
    .eq('active', true)

  if (!feeds || feeds.length === 0) return { verified: false, available: false, reason: 'no_feed' }

  const fresh = feeds.some(
    (f) => f.last_sync_at && Date.now() - new Date(f.last_sync_at).getTime() <= FEED_FRESH_HOURS * 3_600_000
  )
  if (!fresh) return { verified: false, available: false, reason: 'stale_feed' }

  const ns = nights(checkIn, checkOut)
  const { data: occupied } = await sb
    .from('rate_calendar')
    .select('date')
    .eq('room_id', roomId)
    .in('date', ns)
    .eq('available', 0)
    .limit(1)

  if (occupied && occupied.length > 0) return { verified: true, available: false, reason: 'occupied' }
  return { verified: true, available: true, reason: 'free' }
}
