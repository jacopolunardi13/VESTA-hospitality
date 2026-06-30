'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { executeTransition } from '@/lib/quote/stateMachine'
import { computeQuote } from '@/lib/quote/priceEngine'
import { selectAllQuotes } from '@/lib/quote/draftProposal'
import { childrenNeedingBed } from '@/lib/ai/pipeline'
import { createNotification } from '@/lib/notifications'
import { paymentInstructions, alternativesText, noAvailabilityText, normLang, confirmationText, expiryText, proposalAllText } from '@/lib/ai/messages'
import { deliverToGuest } from '@/lib/delivery/deliverToGuest'
import { recordDelivery } from '@/lib/delivery/recordDelivery'
import { sendDraftProposal } from '@/lib/delivery/sendDraft'
import { markPendingSent } from '@/lib/delivery/pendingActions'
import { resolveTaskForBooking } from '@/lib/tasks/operationalTasks'
import { generateDocument, getDocumentConfig } from '@/lib/documents'
import { renderEmailHtml } from '@/lib/email/template'
import { dbThrow } from '@/lib/supabase/guard'
import type { PropertyContext } from '@/lib/ai/types'
import type { BookingStatus } from '@/lib/quote/types'

/** Carica il PropertyContext completo (per generazione documenti + consegna). */
async function loadPropertyContext(supabase: Awaited<ReturnType<typeof createClient>>, propertyId: string): Promise<PropertyContext> {
  const { data: p } = await supabase.from('properties').select('id, org_id, name, settings, supervision_mode').eq('id', propertyId).single()
  return { id: p!.id, orgId: p!.org_id, name: p!.name, settings: (p!.settings ?? {}) as Record<string, unknown>, supervisionMode: p!.supervision_mode }
}

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

  return { supabase, propertyId: property.id, orgId: member.org_id, userId: user.id }
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

  dbThrow((await supabase.from('booking_request_events').insert({
    org_id: orgId,
    booking_request_id: request.id,
    from_status: null,
    to_status: 'received',
    actor: 'staff',
    note: 'Richiesta creata manualmente dallo staff',
  })).error, 'inbox.createRequest.event')

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
    .select('id, check_in, check_out, adults, status, property_id, org_id, conversation_id, language')
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

  // REGOLA: proposal_sent solo dopo una consegna reale.
  if (req.conversation_id) {
    // Canale presente → componi e CONSEGNA davvero il preventivo; proposal_sent solo se riuscito.
    const property = await loadPropertyContext(supabase, propertyId)
    const lang = normLang(req.language)
    const { data: room } = await supabase.from('rooms').select('name').eq('id', roomId).single()
    const text = proposalAllText(lang, [{ roomId, name: room?.name ?? 'Camera', amountEur: Math.round(quote.offerTotalCents / 100) }])
    // Persisti i campi prezzo sul lead (la transizione avverrà solo alla consegna).
    dbThrow((await supabase.from('booking_requests').update({
      gross_total_cents: quote.grossTotalCents, discount_pct: quote.discountPct,
      offer_total_cents: quote.offerTotalCents, city_tax_cents: quote.cityTaxCents,
      price_source: quote.priceSource, data_reliability: quote.dataReliability,
    }).eq('id', requestId).eq('org_id', orgId)).error, 'sendProposal.priceFields')
    let html: string | undefined
    try { html = renderEmailHtml(getDocumentConfig(property), text) } catch { /* solo testo */ }
    const res = await deliverToGuest(supabase, property, req.conversation_id, { text, html })
    const delivered = res.sent || res.channel === 'website_chat'
    await recordDelivery(supabase, { property, conversationId: req.conversation_id, leadId: requestId, proposalGenerated: true, outcome: delivered ? 'sent' : 'failed' })
    if (!delivered) redirect(`/inbox/${requestId}?error=delivery_failed`)
    redirect(`/inbox/${requestId}?saved=proposal_sent`)
  }

  // Lead MANUALE senza canale Vesta: la comunicazione la gestisce lo staff FUORI dal sistema.
  // 'proposal_sent' è qui un'asserzione manuale ("l'ho inviata io"); nessun delivery_status perché
  // non esiste un messaggio Vesta (quindi niente sezione bozza/consegna → nessuna contraddizione).
  const result = await executeTransition(supabase, {
    requestId, orgId, toStatus: 'proposal_sent', actor: 'staff',
    note: 'Proposta inviata manualmente dallo staff (lead senza canale Vesta)',
    grossTotalCents: quote.grossTotalCents,
    discountPct: quote.discountPct,
    offerTotalCents: quote.offerTotalCents,
    cityTaxCents: quote.cityTaxCents,
    priceSource: quote.priceSource,
    dataReliability: quote.dataReliability,
  })

  if (!result.ok) redirect(`/inbox/${requestId}?error=transition_failed`)
  redirect(`/inbox/${requestId}?saved=proposal_sent_manual`)
}

export async function approveProposalDraft(formData: FormData) {
  const requestId = ((formData.get('request_id') as string | null) ?? '').trim()
  if (!requestId) redirect('/inbox?error=missing_fields')

  const { supabase, propertyId } = await resolveProperty()
  const property = await loadPropertyContext(supabase, propertyId)

  // REGOLA: consegna davvero la bozza all'ospite; SOLO dopo consegna riuscita → proposal_sent.
  // Se la consegna fallisce, la pratica RESTA 'received' e il pulsante "Approva e invia" resta visibile.
  const res = await sendDraftProposal(supabase, property, requestId)
  if (!res.ok) redirect(`/inbox/${requestId}?error=${res.reason}`)
  if (!res.delivered) redirect(`/inbox/${requestId}?error=delivery_failed`)
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

/**
 * FLUSSO DEFINITIVO · Passo 5 — lo staff ha verificato la disponibilità nel PMS e
 * ha CHIUSO la camera. Solo ora Vesta riserva (hold 24h) e invia all'ospite le
 * istruzioni di pagamento con IBAN. interested → availability_blocked → awaiting_payment.
 */
export async function confirmAvailability(formData: FormData) {
  const requestId = ((formData.get('request_id') as string | null) ?? '').trim()
  if (!requestId) redirect('/inbox?error=missing_fields')

  const { supabase, propertyId, orgId, userId } = await resolveProperty()

  const { data: req } = await supabase
    .from('booking_requests')
    .select('id, status, conversation_id, language, offer_total_cents')
    .eq('id', requestId)
    .eq('org_id', orgId)
    .single()
  if (!req) redirect('/inbox?error=not_found')
  if (req.status !== 'interested') redirect(`/inbox/${requestId}?error=invalid_state`)

  // Camera scelta (da booking_request_items) per il messaggio allo staff/ospite.
  const { data: items } = await supabase
    .from('booking_request_items')
    .select('room_id')
    .eq('booking_request_id', requestId)
    .limit(1)
  let roomName = ''
  if (items && items[0]?.room_id) {
    const { data: room } = await supabase.from('rooms').select('name').eq('id', items[0].room_id).single()
    roomName = room?.name ?? ''
  }

  // Transizioni (staff): riserva 24h + attesa pagamento.
  const t1 = await executeTransition(supabase, { requestId, orgId, toStatus: 'availability_blocked', actor: 'staff', note: `Disponibilità verificata e camera chiusa nel PMS dallo staff${roomName ? ` (${roomName})` : ''}` })
  if (!t1.ok) redirect(`/inbox/${requestId}?error=transition_failed`)
  const t2 = await executeTransition(supabase, { requestId, orgId, toStatus: 'awaiting_payment', actor: 'staff', note: 'Riservata 24h: inviate istruzioni di pagamento all\'ospite' })
  if (!t2.ok) redirect(`/inbox/${requestId}?error=transition_failed`)

  // Proposta commerciale + IBAN (solo ora) nella lingua dell'ospite.
  const property = await loadPropertyContext(supabase, propertyId)
  const s = property.settings
  const lang = normLang(req.language)
  const reply = paymentInstructions(lang, {
    holder: String(s['payment_holder'] ?? ''), iban: String(s['iban'] ?? ''),
    branch: String(s['payment_branch'] ?? ''), causal: String(s['payment_causal'] ?? property.name),
  })

  // Tier 2 (bypassa il kill-switch): genera il PDF preventivo e CONSEGNA proposta + IBAN all'ospite.
  if (req.conversation_id) {
    let html: string | undefined
    try { html = renderEmailHtml(getDocumentConfig(property), reply) } catch { /* solo testo */ }
    let attachments: { filename: string; mimeType: string; content: Buffer }[] | undefined
    let documentPath: string | undefined
    try {
      const gen = await generateDocument(supabase, property, requestId, 'preventivo', { store: true })
      const slug = property.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      attachments = [{ filename: `preventivo-${slug}.pdf`, mimeType: 'application/pdf', content: gen.buffer }]
      documentPath = gen.storagePath
    } catch { /* generazione PDF fallita → consegna solo testo */ }
    await deliverToGuest(supabase, property, req.conversation_id, { text: reply, html, attachments })
    await markPendingSent(supabase, { bookingRequestId: requestId, kind: 'send_proposal', messageText: reply, documentPath, approvedBy: userId })
  }

  await createNotification(supabase, {
    orgId, propertyId, type: 'escalation', title: 'Proposta inviata · pagamento atteso',
    body: `Camera riservata 24h: proposta + IBAN inviati all'ospite${roomName ? ` (${roomName})` : ''}.`,
    bookingRequestId: requestId, conversationId: req.conversation_id,
  })

  redirect(`/inbox/${requestId}?saved=availability_confirmed`)
}

/** Punto 8 — conferma prenotazione (staff): verifica pagamento → confermata + conferma PDF inviata. */
export async function confirmBooking(formData: FormData) {
  const requestId = ((formData.get('request_id') as string | null) ?? '').trim()
  if (!requestId) redirect('/inbox?error=missing_fields')

  const { supabase, propertyId, orgId, userId } = await resolveProperty()

  const { data: req } = await supabase
    .from('booking_requests')
    .select('id, status, conversation_id, language')
    .eq('id', requestId).eq('org_id', orgId).single()
  if (!req) redirect('/inbox?error=not_found')
  if (req.status !== 'awaiting_payment') redirect(`/inbox/${requestId}?error=invalid_state`)

  const t = await executeTransition(supabase, { requestId, orgId, toStatus: 'confirmed', actor: 'staff', note: 'Pagamento verificato dallo staff: prenotazione confermata' })
  if (!t.ok) redirect(`/inbox/${requestId}?error=transition_failed`)

  const property = await loadPropertyContext(supabase, propertyId)
  const lang = normLang(req.language)
  const reply = confirmationText(lang)

  // Tier 2 (bypassa il kill-switch): genera la conferma PDF e CONSEGNA all'ospite.
  if (req.conversation_id) {
    let html: string | undefined
    try { html = renderEmailHtml(getDocumentConfig(property), reply) } catch { /* solo testo */ }
    let attachments: { filename: string; mimeType: string; content: Buffer }[] | undefined
    let documentPath: string | undefined
    try {
      const gen = await generateDocument(supabase, property, requestId, 'conferma', { store: true })
      const slug = property.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      attachments = [{ filename: `conferma-${slug}.pdf`, mimeType: 'application/pdf', content: gen.buffer }]
      documentPath = gen.storagePath
    } catch { /* generazione PDF fallita → consegna solo testo */ }
    await deliverToGuest(supabase, property, req.conversation_id, { text: reply, html, attachments })
    await markPendingSent(supabase, { bookingRequestId: requestId, kind: 'send_confirmation', messageText: reply, documentPath, approvedBy: userId })
  }

  // Sotto-flusso scadenza · ramo "pagamento ricevuto": risolve l'eventuale task
  // 'booking.payment_window_expired' aperta (idempotente: no-op se non esiste).
  await resolveTaskForBooking(supabase, { bookingRequestId: requestId, type: 'booking.payment_window_expired', resolution: 'paid' })

  await createNotification(supabase, {
    orgId, propertyId, type: 'escalation', title: 'Prenotazione confermata',
    body: 'Conferma + PDF di conferma inviati all\'ospite.',
    bookingRequestId: requestId, conversationId: req.conversation_id,
  })

  redirect(`/inbox/${requestId}?saved=booking_confirmed`)
}

/**
 * Sotto-flusso scadenza · ramo "Pagamento non ricevuto" (azione staff dedicata).
 * A differenza del generico "Cancella", invia all'ospite la comunicazione di
 * scadenza. La camera va liberata MANUALMENTE nel PMS (Vesta non tocca l'inventario).
 * awaiting_payment → cancelled + expiryText all'ospite + task risolta 'not_paid'.
 */
export async function markPaymentNotReceived(formData: FormData) {
  const requestId = ((formData.get('request_id') as string | null) ?? '').trim()
  if (!requestId) redirect('/inbox?error=missing_fields')

  const { supabase, propertyId, orgId } = await resolveProperty()

  const { data: req } = await supabase
    .from('booking_requests')
    .select('id, status, conversation_id, language')
    .eq('id', requestId).eq('org_id', orgId).single()
  if (!req) redirect('/inbox?error=not_found')
  if (req.status !== 'awaiting_payment') redirect(`/inbox/${requestId}?error=invalid_state`)

  const t = await executeTransition(supabase, {
    requestId, orgId, toStatus: 'cancelled', actor: 'staff',
    note: 'Pagamento non ricevuto entro la scadenza (24h): prenotazione decaduta. Liberare la camera manualmente nel PMS.',
  })
  if (!t.ok) redirect(`/inbox/${requestId}?error=transition_failed`)

  // Comunicazione di scadenza all'ospite (Tier 2, bypassa il kill-switch). Nessun allegato, nessun IBAN.
  const property = await loadPropertyContext(supabase, propertyId)
  const lang = normLang(req.language)
  const reply = expiryText(lang)
  if (req.conversation_id) {
    let html: string | undefined
    try { html = renderEmailHtml(getDocumentConfig(property), reply) } catch { /* solo testo */ }
    await deliverToGuest(supabase, property, req.conversation_id, { text: reply, html })
  }

  await resolveTaskForBooking(supabase, { bookingRequestId: requestId, type: 'booking.payment_window_expired', resolution: 'not_paid' })

  await createNotification(supabase, {
    orgId, propertyId, type: 'escalation', title: 'Pagamento non ricevuto · prenotazione decaduta',
    body: 'Inviata comunicazione di scadenza all\'ospite. Libera la camera manualmente nel PMS.',
    bookingRequestId: requestId, conversationId: req.conversation_id,
  })

  redirect(`/inbox/${requestId}?saved=payment_not_received`)
}

/**
 * FLUSSO DEFINITIVO · Passo 5 (alternativa) — la camera scelta NON è più disponibile.
 * Riporta la richiesta a proposal_sent e propone automaticamente le altre camere libere.
 */
export async function markUnavailable(formData: FormData) {
  const requestId = ((formData.get('request_id') as string | null) ?? '').trim()
  if (!requestId) redirect('/inbox?error=missing_fields')

  const { supabase, propertyId, orgId } = await resolveProperty()

  const { data: req } = await supabase
    .from('booking_requests')
    .select('id, status, conversation_id, language, check_in, check_out, adults, children')
    .eq('id', requestId)
    .eq('org_id', orgId)
    .single()
  if (!req) redirect('/inbox?error=not_found')
  if (req.status !== 'interested') redirect(`/inbox/${requestId}?error=invalid_state`)

  // Camera scelta da escludere dalle alternative.
  const { data: items } = await supabase
    .from('booking_request_items')
    .select('room_id')
    .eq('booking_request_id', requestId)
    .limit(1)
  const excludedRoomId = items?.[0]?.room_id ?? null

  // Torna a proposal_sent (lo staff rimette in gioco la richiesta con alternative).
  const t = await executeTransition(supabase, { requestId, orgId, toStatus: 'proposal_sent', actor: 'staff', note: 'Camera scelta non disponibile nel PMS: proposte alternative' })
  if (!t.ok) redirect(`/inbox/${requestId}?error=transition_failed`)

  // Pulisce la camera scelta (non più valida).
  await supabase.from('booking_request_items').delete().eq('booking_request_id', requestId)

  const lang = normLang(req.language)
  let reply = noAvailabilityText(lang)
  if (req.check_in && req.check_out && req.adults != null) {
    const all = await selectAllQuotes(supabase, {
      propertyId, orgId, checkIn: req.check_in, checkOut: req.check_out,
      adults: req.adults, childrenBeds: childrenNeedingBed(Array.isArray(req.children) ? (req.children as { age: number | null }[]) : []),
    })
    const alternatives = all.filter((r) => r.roomId !== excludedRoomId)
    if (alternatives.length > 0) {
      reply = alternativesText(lang, alternatives.map((r) => ({
        roomId: r.roomId, name: r.roomName, description: r.description,
        amountEur: Math.round(r.quote.offerTotalCents / 100),
      })))
    }
  }
  if (req.conversation_id) {
    dbThrow((await supabase.from('messages').insert({
      org_id: orgId, property_id: propertyId, conversation_id: req.conversation_id,
      direction: 'out', sender: 'staff', content: reply,
    })).error, 'inbox.markUnavailable.message')
  }
  await createNotification(supabase, {
    orgId, propertyId, type: 'escalation', title: 'Camera non disponibile — alternative inviate',
    body: 'La camera scelta non era disponibile: Vesta ha proposto le alternative all\'ospite.',
    bookingRequestId: requestId, conversationId: req.conversation_id,
  })

  redirect(`/inbox/${requestId}?saved=marked_unavailable`)
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

  dbThrow((await supabase
    .from('booking_requests')
    .update({
      gross_total_cents: grossCents,
      discount_pct: validDisc,
      offer_total_cents: offerCents,
    })
    .eq('id', requestId)
    .eq('org_id', orgId)).error, 'inbox.overridePrice.update')

  dbThrow((await supabase.from('booking_request_events').insert({
    org_id: orgId,
    booking_request_id: requestId,
    from_status: req.status,
    to_status: req.status,
    actor: 'staff',
    note: `Prezzo aggiornato: lordo ${grossCents}¢, sconto ${validDisc}%, offerta ${offerCents}¢`,
  })).error, 'inbox.overridePrice.event')

  redirect(`/inbox/${requestId}?saved=price_updated`)
}
