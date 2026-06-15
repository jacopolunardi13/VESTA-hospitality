import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { computeQuote } from './priceEngine'
import type { PriceQuote } from './types'

export interface DraftResult {
  ok: boolean
  reason?: string
  roomId?: string
  roomName?: string
  quote?: PriceQuote
}

/**
 * Prepara una BOZZA di preventivo per una booking_request esistente (status received).
 * Supervision ON: NON invia, non cambia stato. Calcola, seleziona la camera migliore,
 * scrive snapshot prezzi + campi offerta, lascia status='received' per l'approvazione staff.
 *
 * Selezione camera: tra quelle con capienza sufficiente, preferisce tariffe complete
 * (data_reliability alta/media) e poi il totale più basso. I prezzi vengono SOLO da
 * rate_calendar via lib/quote — mai dall'AI.
 */
export async function prepareDraftProposal(
  sb: SupabaseClient<Database>,
  opts: {
    propertyId: string
    orgId: string
    bookingRequestId: string
    checkIn: string
    checkOut: string
    adults: number
    childrenCount: number
  }
): Promise<DraftResult> {
  const guests = opts.adults + opts.childrenCount

  const { data: rooms } = await sb
    .from('rooms')
    .select('id, name, max_guests')
    .eq('property_id', opts.propertyId)
    .is('deleted_at', null)
    .gte('max_guests', guests)
    .order('max_guests', { ascending: true })

  if (!rooms || rooms.length === 0) return { ok: false, reason: 'no_room_fits' }

  // Calcola un preventivo per ogni camera candidata, scegli la migliore.
  let best: { roomId: string; roomName: string; quote: PriceQuote } | null = null
  const reliabilityRank = { high: 0, medium: 1, low: 2 } as const

  for (const room of rooms) {
    const quote = await computeQuote(sb, {
      propertyId: opts.propertyId,
      orgId: opts.orgId,
      roomId: room.id,
      checkIn: opts.checkIn,
      checkOut: opts.checkOut,
      adults: opts.adults,
    })
    if (quote.grossTotalCents <= 0) continue // nessuna tariffa utile
    if (
      !best ||
      reliabilityRank[quote.dataReliability] < reliabilityRank[best.quote.dataReliability] ||
      (quote.dataReliability === best.quote.dataReliability &&
        quote.offerTotalCents < best.quote.offerTotalCents)
    ) {
      best = { roomId: room.id, roomName: room.name, quote }
    }
  }

  if (!best) return { ok: false, reason: 'no_rates' }

  // Snapshot prezzi (idempotente: rimuove eventuali righe precedenti).
  await sb.from('booking_request_items').delete().eq('booking_request_id', opts.bookingRequestId)
  if (best.quote.items.length > 0) {
    await sb.from('booking_request_items').insert(
      best.quote.items.map((it) => ({
        org_id: opts.orgId,
        booking_request_id: opts.bookingRequestId,
        room_id: it.roomId,
        date: it.date,
        price_cents: it.priceCents,
      }))
    )
  }

  // Scrive i campi offerta sulla richiesta — status RESTA 'received' (bozza).
  await sb
    .from('booking_requests')
    .update({
      gross_total_cents: best.quote.grossTotalCents,
      discount_pct: best.quote.discountPct,
      offer_total_cents: best.quote.offerTotalCents,
      city_tax_cents: best.quote.cityTaxCents,
      data_reliability: best.quote.dataReliability,
      price_source: best.quote.priceSource,
    })
    .eq('id', opts.bookingRequestId)
    .eq('org_id', opts.orgId)

  // Audit: bozza generata dall'AI, in attesa di approvazione staff.
  await sb.from('booking_request_events').insert({
    org_id: opts.orgId,
    booking_request_id: opts.bookingRequestId,
    from_status: 'received',
    to_status: 'received',
    actor: 'system',
    note: `Bozza preventivo AI: ${best.roomName}, offerta ${(best.quote.offerTotalCents / 100).toFixed(2)}€ (affidabilità ${best.quote.dataReliability}) — in attesa approvazione staff`,
  })

  return { ok: true, roomId: best.roomId, roomName: best.roomName, quote: best.quote }
}
