'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { executeTransition } from '@/lib/quote/stateMachine'
import { computeQuote } from '@/lib/quote/priceEngine'
import type { BookingStatus } from '@/lib/quote/types'

async function resolveProperty() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()
  if (!member) redirect('/onboarding')

  const { data: property } = await supabase
    .from('properties')
    .select('id')
    .eq('org_id', member.org_id)
    .is('deleted_at', null)
    .limit(1)
    .single()
  if (!property) redirect('/onboarding')

  return { supabase, propertyId: property.id, orgId: member.org_id }
}

export async function createRequest(formData: FormData) {
  const guestName = ((formData.get('guest_name') as string | null) ?? '').trim() || null
  const guestContact = ((formData.get('guest_contact') as string | null) ?? '').trim() || null
  const checkIn = ((formData.get('check_in') as string | null) ?? '').trim() || null
  const checkOut = ((formData.get('check_out') as string | null) ?? '').trim() || null
  const adultsRaw = parseInt((formData.get('adults') as string | null) ?? '1', 10)
  const adults = isNaN(adultsRaw) || adultsRaw < 1 ? 1 : adultsRaw
  const specialRequests = ((formData.get('special_requests') as string | null) ?? '').trim() || null

  const { supabase, propertyId, orgId } = await resolveProperty()

  const { data: request, error } = await supabase
    .from('booking_requests')
    .insert({
      org_id: orgId,
      property_id: propertyId,
      source: 'manual',
      guest_name: guestName,
      guest_contact: guestContact,
      check_in: checkIn,
      check_out: checkOut,
      adults,
      special_requests: specialRequests,
      status: 'received',
    })
    .select('id')
    .single()

  if (error || !request) redirect('/inbox?error=create_failed')

  await supabase.from('booking_request_events').insert({
    org_id: orgId,
    booking_request_id: request.id,
    from_status: null,
    to_status: 'received',
    actor: 'staff',
    note: 'Richiesta creata manualmente dallo staff',
  })

  redirect(`/inbox/${request.id}?saved=created`)
}

export async function sendProposal(formData: FormData) {
  const requestId = ((formData.get('request_id') as string | null) ?? '').trim()
  const roomId = ((formData.get('room_id') as string | null) ?? '').trim()
  const manualPriceRaw = (formData.get('manual_price_cents') as string | null) ?? ''
  const overrideGrossRaw = (formData.get('override_gross_cents') as string | null) ?? ''
  const overrideDiscountRaw = (formData.get('override_discount_pct') as string | null) ?? ''

  if (!requestId || !roomId) redirect('/inbox?error=missing_fields')

  const { supabase, propertyId, orgId } = await resolveProperty()

  // Verifica che la camera appartenga alla property dell'utente
  const { data: roomCheck } = await supabase
    .from('rooms')
    .select('id')
    .eq('id', roomId)
    .eq('property_id', propertyId)
    .is('deleted_at', null)
    .single()
  if (!roomCheck) redirect(`/inbox/${requestId}?error=invalid_room`)

  const { data: req } = await supabase
    .from('booking_requests')
    .select('id, check_in, check_out, adults, status, property_id, org_id')
    .eq('id', requestId)
    .eq('org_id', orgId)
    .single()

  if (!req || req.status !== 'received') redirect(`/inbox/${requestId}?error=invalid_state`)
  if (!req.check_in || !req.check_out) redirect(`/inbox/${requestId}?error=missing_dates`)

  const manualFallback = manualPriceRaw ? parseInt(manualPriceRaw, 10) : undefined

  let quote = await computeQuote(supabase, {
    propertyId,
    orgId,
    roomId,
    checkIn: req.check_in,
    checkOut: req.check_out,
    adults: req.adults ?? 1,
    fallbackPriceCentsPerNight: !isNaN(manualFallback ?? NaN) ? manualFallback : 0,
  })

  // Staff can override the computed gross total and discount
  if (overrideGrossRaw) {
    const overrideGross = parseInt(overrideGrossRaw, 10)
    if (!isNaN(overrideGross) && overrideGross >= 0) {
      const disc = overrideDiscountRaw ? parseFloat(overrideDiscountRaw) : quote.discountPct
      const validDisc = isNaN(disc) ? quote.discountPct : disc
      quote = {
        ...quote,
        grossTotalCents: overrideGross,
        discountPct: validDisc,
        offerTotalCents: Math.round(overrideGross * (1 - validDisc / 100)),
      }
    }
  }

  // Delete stale items (idempotent re-proposal)
  await supabase
    .from('booking_request_items')
    .delete()
    .eq('booking_request_id', requestId)

  if (quote.items.length > 0) {
    const { error: itemsError } = await supabase.from('booking_request_items').insert(
      quote.items.map(item => ({
        org_id: orgId,
        booking_request_id: requestId,
        room_id: item.roomId,
        date: item.date,
        price_cents: item.priceCents,
      }))
    )
    if (itemsError) redirect(`/inbox/${requestId}?error=items_failed`)
  }

  const result = await executeTransition(supabase, {
    requestId,
    orgId,
    toStatus: 'proposal_sent',
    actor: 'staff',
    grossTotalCents: quote.grossTotalCents,
    discountPct: quote.discountPct,
    offerTotalCents: quote.offerTotalCents,
    cityTaxCents: quote.cityTaxCents,
    priceSource: quote.priceSource,
    dataReliability: quote.dataReliability,
  })

  if (!result.ok) redirect(`/inbox/${requestId}?error=transition_failed`)
  redirect(`/inbox/${requestId}?saved=proposal_sent`)
}

export async function transitionRequest(formData: FormData) {
  const requestId = ((formData.get('request_id') as string | null) ?? '').trim()
  const toStatus = ((formData.get('to_status') as string | null) ?? '').trim()
  const note = ((formData.get('note') as string | null) ?? '').trim() || undefined

  if (!requestId || !toStatus) redirect('/inbox?error=missing_fields')

  const { supabase, orgId } = await resolveProperty()

  const result = await executeTransition(supabase, {
    requestId,
    orgId,
    toStatus: toStatus as BookingStatus,
    actor: 'staff',
    note,
  })

  if (!result.ok) redirect(`/inbox/${requestId}?error=transition_failed`)
  redirect(`/inbox/${requestId}?saved=ok`)
}

export async function overridePrice(formData: FormData) {
  const requestId = ((formData.get('request_id') as string | null) ?? '').trim()
  const grossRaw = (formData.get('gross_total_cents') as string | null) ?? ''
  const discountRaw = (formData.get('discount_pct') as string | null) ?? ''

  if (!requestId) redirect('/inbox?error=missing_fields')

  const grossCents = parseInt(grossRaw, 10)
  if (isNaN(grossCents) || grossCents < 0) redirect(`/inbox/${requestId}?error=invalid_price`)

  const discountPct = parseFloat(discountRaw)
  const validDisc = isNaN(discountPct) ? 0 : discountPct
  const offerCents = Math.round(grossCents * (1 - validDisc / 100))

  const { supabase, orgId } = await resolveProperty()

  const { data: req } = await supabase
    .from('booking_requests')
    .select('id, status, org_id')
    .eq('id', requestId)
    .eq('org_id', orgId)
    .single()

  if (!req) redirect('/inbox?error=not_found')
  if (!['received', 'proposal_sent', 'interested'].includes(req.status)) {
    redirect(`/inbox/${requestId}?error=not_editable`)
  }

  await supabase
    .from('booking_requests')
    .update({
      gross_total_cents: grossCents,
      discount_pct: validDisc,
      offer_total_cents: offerCents,
    })
    .eq('id', requestId)
    .eq('org_id', orgId)

  await supabase.from('booking_request_events').insert({
    org_id: orgId,
    booking_request_id: requestId,
    from_status: req.status,
    to_status: req.status,
    actor: 'staff',
    note: `Prezzo aggiornato: lordo ${grossCents}¢, sconto ${validDisc}%, offerta ${offerCents}¢`,
  })

  redirect(`/inbox/${requestId}?saved=price_updated`)
}
