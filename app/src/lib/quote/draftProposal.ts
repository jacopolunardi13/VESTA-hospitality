import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { computeQuote } from './priceEngine'
import { checkAvailability } from '@/lib/ical/availability'
import type { PriceQuote } from './types'

export interface SelectedQuote {
  roomId: string
  roomName: string
  quote: PriceQuote
  availabilityVerified: boolean
}

export interface RoomQuote {
  roomId: string
  roomName: string
  description: string | null
  quote: PriceQuote
}

/**
 * Restituisce TUTTE le camere compatibili (capienza), prezzate e con disponibilità
 * verificata e libera, ordinate per prezzo crescente. Funzione PURA (nessuna scrittura).
 * Usata dal flusso definitivo: il preventivo mostra tutte le opzioni, il cliente sceglie.
 */
export async function selectAllQuotes(
  sb: SupabaseClient<Database>,
  opts: {
    propertyId: string
    orgId: string
    checkIn: string
    checkOut: string
    adults: number
    childrenBeds: number  // bambini che richiedono un letto reale (età > 2); 0-2 non contano (culla)
    todayIso?: string
  }
): Promise<RoomQuote[]> {
  const guests = opts.adults + opts.childrenBeds

  const { data: rooms } = await sb
    .from('rooms')
    .select('id, name, description, max_guests')
    .eq('property_id', opts.propertyId)
    .is('deleted_at', null)
    .gte('max_guests', guests)
    .order('max_guests', { ascending: true })

  if (!rooms || rooms.length === 0) return []

  const out: RoomQuote[] = []
  for (const room of rooms) {
    const quote = await computeQuote(sb, {
      propertyId: opts.propertyId, orgId: opts.orgId, roomId: room.id,
      checkIn: opts.checkIn, checkOut: opts.checkOut, adults: opts.adults, todayIso: opts.todayIso,
    })
    if (quote.grossTotalCents <= 0) continue
    const avail = await checkAvailability(sb, room.id, opts.checkIn, opts.checkOut)
    if (!avail.verified || !avail.available) continue
    out.push({ roomId: room.id, roomName: room.name, description: room.description, quote })
  }
  out.sort((a, b) => a.quote.offerTotalCents - b.quote.offerTotalCents)
  return out
}

/**
 * Seleziona la camera migliore e calcola il preventivo — funzione PURA (nessuna
 * scrittura). Considera SOLO camere con capienza sufficiente, tariffa presente
 * E disponibilità verificata e libera (anti-overbooking). Tra queste preferisce
 * affidabilità alta/media e poi il totale più basso. Prezzi SOLO da rate_calendar.
 */
export async function selectBestQuote(
  sb: SupabaseClient<Database>,
  opts: {
    propertyId: string
    orgId: string
    checkIn: string
    checkOut: string
    adults: number
    childrenBeds: number  // bambini che richiedono un letto reale (età > 2); 0-2 non contano (culla)
    todayIso?: string
  }
): Promise<SelectedQuote | null> {
  const guests = opts.adults + opts.childrenBeds

  const { data: rooms } = await sb
    .from('rooms')
    .select('id, name, max_guests')
    .eq('property_id', opts.propertyId)
    .is('deleted_at', null)
    .gte('max_guests', guests)
    .order('max_guests', { ascending: true })

  if (!rooms || rooms.length === 0) return null

  let best: SelectedQuote | null = null
  const rank = { high: 0, medium: 1, low: 2 } as const

  for (const room of rooms) {
    const quote = await computeQuote(sb, {
      propertyId: opts.propertyId,
      orgId: opts.orgId,
      roomId: room.id,
      checkIn: opts.checkIn,
      checkOut: opts.checkOut,
      adults: opts.adults,
      todayIso: opts.todayIso,
    })
    if (quote.grossTotalCents <= 0) continue
    // Disponibilità verificata e libera per le date (altrimenti la camera è scartata).
    const avail = await checkAvailability(sb, room.id, opts.checkIn, opts.checkOut)
    if (!avail.verified || !avail.available) continue
    if (
      !best ||
      rank[quote.dataReliability] < rank[best.quote.dataReliability] ||
      (quote.dataReliability === best.quote.dataReliability &&
        quote.offerTotalCents < best.quote.offerTotalCents)
    ) {
      best = { roomId: room.id, roomName: room.name, quote, availabilityVerified: true }
    }
  }

  return best
}

/**
 * Persiste il preventivo su una booking_request (snapshot items + campi offerta).
 * NON cambia lo stato: per l'invio automatico (standard) la transizione
 * received→proposal_sent è fatta dal chiamante via RPC; per la bozza (non standard)
 * lo stato resta 'received' in attesa di approvazione staff.
 */
export async function persistProposal(
  sb: SupabaseClient<Database>,
  opts: {
    orgId: string
    bookingRequestId: string
    roomName: string
    quote: PriceQuote
    autoSend: boolean
  }
): Promise<void> {
  const { quote } = opts

  await sb.from('booking_request_items').delete().eq('booking_request_id', opts.bookingRequestId)
  if (quote.items.length > 0) {
    await sb.from('booking_request_items').insert(
      quote.items.map((it) => ({
        org_id: opts.orgId,
        booking_request_id: opts.bookingRequestId,
        room_id: it.roomId,
        date: it.date,
        price_cents: it.priceCents,
      }))
    )
  }

  await sb
    .from('booking_requests')
    .update({
      gross_total_cents: quote.grossTotalCents,
      discount_pct: quote.discountPct,
      offer_total_cents: quote.offerTotalCents,
      city_tax_cents: quote.cityTaxCents,
      data_reliability: quote.dataReliability,
      price_source: quote.priceSource,
    })
    .eq('id', opts.bookingRequestId)
    .eq('org_id', opts.orgId)

  // Per la bozza (non standard) registra l'evento di attesa approvazione.
  // Per l'auto-invio l'evento è la transizione received→proposal_sent (lato chiamante).
  if (!opts.autoSend) {
    await sb.from('booking_request_events').insert({
      org_id: opts.orgId,
      booking_request_id: opts.bookingRequestId,
      from_status: 'received',
      to_status: 'received',
      actor: 'system',
      note: `Bozza preventivo AI: ${opts.roomName}, offerta ${(quote.offerTotalCents / 100).toFixed(2)}€ (affidabilità ${quote.dataReliability}) — richiede supervisione staff`,
    })
  }
}
