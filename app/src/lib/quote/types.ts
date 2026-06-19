import type { BookingStatus } from '@/lib/supabase/database.types'
export type { BookingStatus }

export type BookingActor = 'staff' | 'system' | 'guest'

// Transizioni valide MVP — to_verify escluso dalle transizioni attive.
// Predisposto per future tramite settings.require_verification_step.
export const VALID_TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  received:              ['proposal_sent', 'rejected', 'cancelled'],
  proposal_sent:         ['interested', 'expired', 'rejected', 'cancelled'],
  interested:            ['proposal_sent', 'availability_blocked', 'rejected', 'cancelled'],
  availability_blocked:  ['awaiting_payment', 'expired', 'cancelled'],
  awaiting_payment:      ['confirmed', 'cancelled'],
  confirmed:             ['cancelled'],
  to_verify:             [],
  expired:               [],
  rejected:              [],
  cancelled:             [],
} as const

export function isValidTransition(from: BookingStatus, to: BookingStatus): boolean {
  return (VALID_TRANSITIONS[from] as readonly string[]).includes(to)
}

export interface PriceQuote {
  grossTotalCents: number
  discountPct: number
  offerTotalCents: number
  cityTaxCents: number
  dataReliability: 'high' | 'medium' | 'low'
  priceSource: 'manual' | 'csv' | 'ical' | 'api' | 'ota_stimato'
  items: Array<{ roomId: string; date: string; priceCents: number }>
  missingNights: string[]
  /** true se applicata la tariffa last minute (check-in entro la soglia giorni). */
  isLastMinute: boolean
}

export interface TransitionParams {
  requestId: string
  orgId: string
  toStatus: BookingStatus
  actor: BookingActor
  note?: string
  grossTotalCents?: number
  discountPct?: number
  offerTotalCents?: number
  cityTaxCents?: number
  priceSource?: string
  dataReliability?: string
}

export type TransitionResult =
  | { ok: true; from: BookingStatus; to: BookingStatus }
  | { ok: false; error: string; from?: string; to?: string }
