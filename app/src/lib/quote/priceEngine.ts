import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PriceQuote } from './types'

function eachNight(checkIn: string, checkOut: string): string[] {
  const nights: string[] = []
  const cur = new Date(checkIn)
  const end = new Date(checkOut)
  while (cur < end) {
    nights.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return nights
}

export async function computeQuote(
  supabase: SupabaseClient<Database>,
  opts: {
    propertyId: string
    orgId: string
    roomId: string
    checkIn: string
    checkOut: string
    adults: number
    fallbackPriceCentsPerNight?: number
  }
): Promise<PriceQuote> {
  const nights = eachNight(opts.checkIn, opts.checkOut)

  const { data: prop } = await supabase
    .from('properties')
    .select('settings')
    .eq('id', opts.propertyId)
    .single()

  const settings = (prop?.settings ?? {}) as Record<string, unknown>
  const discountPct = Number(settings['direct_discount_pct'] ?? 10)
  const cityTaxPerAdultNight = Number(settings['city_tax_cents'] ?? 0)
  const freshnessHighH = Number(settings['freshness_high_hours'] ?? 6)
  const freshnessMedH = Number(settings['freshness_medium_hours'] ?? 48)

  const { data: rates } = await supabase
    .from('rate_calendar')
    .select('date, price_cents, updated_at, source')
    .eq('room_id', opts.roomId)
    .gte('date', opts.checkIn)
    .lt('date', opts.checkOut)

  const rateMap = new Map<string, { priceCents: number; updatedAt: string; source: string }>()
  for (const r of rates ?? []) {
    if (r.price_cents != null) {
      rateMap.set(r.date as string, {
        priceCents: r.price_cents,
        updatedAt: r.updated_at as string,
        source: r.source as string,
      })
    }
  }

  const items: Array<{ roomId: string; date: string; priceCents: number }> = []
  const missingNights: string[] = []
  const updatedAts: number[] = []
  let firstSource: 'manual' | 'csv' | 'ical' | 'api' | 'ota_stimato' = 'manual'
  let foundCalendar = false

  for (const date of nights) {
    const entry = rateMap.get(date)
    if (entry) {
      items.push({ roomId: opts.roomId, date, priceCents: entry.priceCents })
      updatedAts.push(new Date(entry.updatedAt).getTime())
      if (!foundCalendar) {
        firstSource = entry.source as typeof firstSource
        foundCalendar = true
      }
    } else {
      const fallback = opts.fallbackPriceCentsPerNight ?? 0
      items.push({ roomId: opts.roomId, date, priceCents: fallback })
      missingNights.push(date)
    }
  }

  const grossTotalCents = items.reduce((s, i) => s + i.priceCents, 0)
  const offerTotalCents = Math.round(grossTotalCents * (1 - discountPct / 100))
  const cityTaxCents = cityTaxPerAdultNight * opts.adults * nights.length

  let dataReliability: 'high' | 'medium' | 'low'
  if (missingNights.length > 0 || !foundCalendar) {
    dataReliability = 'low'
  } else {
    const oldestMs = Math.min(...updatedAts)
    const nowMs = new Date().getTime()
    const ageH = (nowMs - oldestMs) / 3_600_000
    dataReliability = ageH <= freshnessHighH ? 'high' : ageH <= freshnessMedH ? 'medium' : 'low'
  }

  const priceSource = missingNights.length > 0 && !foundCalendar ? 'manual' : firstSource

  return {
    grossTotalCents,
    discountPct,
    offerTotalCents,
    cityTaxCents,
    dataReliability,
    priceSource,
    items,
    missingNights,
  }
}
