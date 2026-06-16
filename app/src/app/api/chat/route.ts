import { createAdminClient } from '@/lib/supabase/admin'
import {
  MAX_MESSAGE_LENGTH, clientIp, hashIp, isIpBlocked, checkRateLimit,
  logGuardrail, sessionMessageCount,
} from '@/lib/ai/guardrail'
import { getBudgetState } from '@/lib/ai/budget'
import { runPipeline, SESSION_LIMIT_TEMPLATE } from '@/lib/ai/pipeline'
import { persistProposal } from '@/lib/quote/draftProposal'
import { executeTransition } from '@/lib/quote/stateMachine'
import { createNotification } from '@/lib/notifications'
import type { ChatTurn, PropertyContext } from '@/lib/ai/types'
import type { TablesUpdate, Json } from '@/lib/supabase/database.types'

export async function POST(request: Request) {
  let body: { propertyId?: string; conversationId?: string; message?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }

  const propertyId = (body.propertyId ?? '').trim()
  const message = (body.message ?? '').trim()
  let conversationId = (body.conversationId ?? '').trim() || null

  if (!propertyId || !message) {
    return Response.json({ error: 'missing_fields' }, { status: 400 })
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return Response.json({ error: 'message_too_long' }, { status: 400 })
  }

  const sb = createAdminClient()

  // Property (pubblica: service_role, filtro esplicito).
  const { data: prop } = await sb
    .from('properties')
    .select('id, org_id, name, settings, supervision_mode')
    .eq('id', propertyId)
    .is('deleted_at', null)
    .single()
  if (!prop) return Response.json({ error: 'property_not_found' }, { status: 404 })

  const property: PropertyContext = {
    id: prop.id, orgId: prop.org_id, name: prop.name,
    settings: (prop.settings ?? {}) as Record<string, unknown>,
    supervisionMode: prop.supervision_mode,
  }

  const ipHash = hashIp(clientIp(request.headers))

  // Guard-rail L1: IP bloccato.
  if (await isIpBlocked(sb, propertyId, ipHash)) {
    await logGuardrail(sb, { orgId: property.orgId, propertyId, type: 'ip_blocked', ipHash })
    return Response.json({ error: 'blocked' }, { status: 403 })
  }

  // Conversazione: verifica appartenenza o creazione.
  if (conversationId) {
    const { data: conv } = await sb
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('property_id', propertyId)
      .is('deleted_at', null)
      .single()
    if (!conv) conversationId = null
  }

  // Guard-rail L1: rate limit.
  const rl = await checkRateLimit(sb, propertyId, ipHash, conversationId)
  if (!rl.allowed) {
    await logGuardrail(sb, {
      orgId: property.orgId, propertyId, conversationId, type: 'rate_limit',
      ipHash, details: { reason: rl.reason },
    })
    return Response.json({ error: 'rate_limited' }, { status: 429 })
  }

  if (!conversationId) {
    const { data: created, error: convErr } = await sb
      .from('conversations')
      .insert({
        org_id: property.orgId, property_id: propertyId,
        source: 'website_chat', status: 'open', stage: 'new',
      })
      .select('id')
      .single()
    if (convErr || !created) {
      return Response.json({ error: 'conversation_failed' }, { status: 500 })
    }
    conversationId = created.id
  }

  // Persisti il messaggio in ingresso (con ip_hash per i contatori anti-abuse).
  await sb.from('messages').insert({
    org_id: property.orgId, property_id: propertyId, conversation_id: conversationId,
    direction: 'in', sender: 'guest', content: message,
    metadata: { ip_hash: ipHash },
  })

  // Session cap giornaliero.
  const sessionLimit = Number(property.settings['ai_session_message_limit'] ?? 30)
  const sessionCount = await sessionMessageCount(sb, conversationId)
  if (sessionCount > sessionLimit) {
    await logGuardrail(sb, {
      orgId: property.orgId, propertyId, conversationId, type: 'msg_limit', ipHash,
      details: { sessionCount, sessionLimit },
    })
    await sb.from('messages').insert({
      org_id: property.orgId, property_id: propertyId, conversation_id: conversationId,
      direction: 'out', sender: 'ai', content: SESSION_LIMIT_TEMPLATE,
    })
    await sb.from('conversations').update({ status: 'pending_staff', stage: 'handoff_staff' })
      .eq('id', conversationId)
    return Response.json({
      conversationId, reply: SESSION_LIMIT_TEMPLATE, intent: 'unclassified',
      stage: 'handoff_staff', status: 'pending_staff', source: 'template',
    })
  }

  // Budget / safe mode.
  const budget = await getBudgetState(sb, propertyId, property.settings)
  if (budget.over80 && !budget.safeMode) {
    await logGuardrail(sb, { orgId: property.orgId, propertyId, type: 'budget_80', details: { ...budget } })
  }
  if (budget.safeMode) {
    await logGuardrail(sb, { orgId: property.orgId, propertyId, type: 'budget_100', details: { ...budget } })
  }

  // Storico (ultimi 10 messaggi, esclusa la riga appena inserita gestita come userMessage).
  const { data: msgs } = await sb
    .from('messages')
    .select('direction, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(11)
  const history: ChatTurn[] = (msgs ?? [])
    .reverse()
    .slice(0, -1) // rimuove il messaggio corrente (ultimo)
    .map((m) => ({ role: m.direction === 'in' ? 'user' : 'assistant', content: m.content }))

  // Pipeline knowledge-first.
  let result
  try {
    result = await runPipeline({
      sb, property, history, userMessage: message, aiEnabled: !budget.safeMode,
      todayIso: new Date().toISOString().slice(0, 10),
    })
  } catch {
    const fallback = 'Mi spiace, ho avuto un problema tecnico. Riprova tra poco o lascia un recapito allo staff.'
    await sb.from('messages').insert({
      org_id: property.orgId, property_id: propertyId, conversation_id: conversationId,
      direction: 'out', sender: 'ai', content: fallback,
    })
    return Response.json({
      conversationId, reply: fallback, intent: 'unclassified',
      stage: 'new', status: 'open', source: 'template',
    }, { status: 200 })
  }

  // Persisti la risposta (se presente — lo spam non risponde).
  if (result.text) {
    await sb.from('messages').insert({
      org_id: property.orgId, property_id: propertyId, conversation_id: conversationId,
      direction: 'out', sender: 'ai', content: result.text,
    })
  }

  // Aggiorna metadati conversazione.
  await sb.from('conversations').update({
    intent: result.intent,
    intent_confidence: result.confidence,
    stage: result.stage,
    status: result.status,
  }).eq('id', conversationId)

  // Lead da chat (booking): crea/collega booking_request + persiste slot + bozza.
  if (result.createLead) {
    const { data: conv } = await sb
      .from('conversations')
      .select('booking_request_id, guest_name, guest_contact')
      .eq('id', conversationId)
      .single()

    let leadId = conv?.booking_request_id ?? null
    const slots = result.slots

    if (conv && !leadId) {
      const { data: br } = await sb
        .from('booking_requests')
        .insert({
          org_id: property.orgId, property_id: propertyId, conversation_id: conversationId,
          source: 'website_chat', status: 'received',
          guest_name: slots?.guest_name ?? conv.guest_name,
          guest_contact: slots?.guest_contact ?? conv.guest_contact,
        })
        .select('id')
        .single()
      if (br) {
        leadId = br.id
        await sb.from('conversations').update({ booking_request_id: br.id }).eq('id', conversationId)
        await sb.from('booking_request_events').insert({
          org_id: property.orgId, booking_request_id: br.id,
          from_status: null, to_status: 'received', actor: 'system',
          note: 'Lead generato dalla chat (intent booking)',
        })
      }
    }

    // Persiste gli slot estratti sulla richiesta (solo valori presenti).
    if (leadId && slots) {
      const upd: TablesUpdate<'booking_requests'> = {}
      if (slots.check_in) upd.check_in = slots.check_in
      if (slots.check_out) upd.check_out = slots.check_out
      if (slots.adults) upd.adults = slots.adults
      if (slots.children.length) upd.children = slots.children as Json
      if (slots.language) upd.language = slots.language
      if (slots.special_requests) upd.special_requests = slots.special_requests
      if (slots.guest_name) upd.guest_name = slots.guest_name
      if (slots.guest_contact) upd.guest_contact = slots.guest_contact
      if (Object.keys(upd).length > 0) {
        await sb.from('booking_requests').update(upd).eq('id', leadId).eq('org_id', property.orgId)
      }
      // Riflette nome/contatto/lingua anche sulla conversazione.
      const convUpd: TablesUpdate<'conversations'> = {}
      if (slots.guest_name) convUpd.guest_name = slots.guest_name
      if (slots.guest_contact) convUpd.guest_contact = slots.guest_contact
      if (slots.language) convUpd.language = slots.language
      if (Object.keys(convUpd).length > 0) {
        await sb.from('conversations').update(convUpd).eq('id', conversationId)
      }
    }

    // Preventivo calcolato dalla pipeline (lib/quote) + notifica staff.
    // STANDARD + prezzo affidabile + disponibilità verificata → invio automatico.
    // Altrimenti → fallback cortesia: bozza per lo staff (se calcolabile) + notifica Jacopo.
    if (leadId && result.draft) {
      await persistProposal(sb, {
        orgId: property.orgId, bookingRequestId: leadId,
        roomName: result.draft.roomName, quote: result.draft.quote,
        autoSend: !!result.autoSend,
      })
      const offerStr = (result.draft.quote.offerTotalCents / 100).toFixed(2) + '€'

      if (result.autoSend) {
        await executeTransition(sb, {
          requestId: leadId, orgId: property.orgId, toStatus: 'proposal_sent', actor: 'system',
          note: `Proposta standard generata e inviata automaticamente: ${result.draft.roomName}, ${offerStr}`,
        })
        await createNotification(sb, {
          orgId: property.orgId, propertyId, type: 'proposal_auto_sent',
          title: `Proposta inviata · ${offerStr}`,
          body: `Inviata automaticamente all'ospite (${result.draft.roomName}).`,
          bookingRequestId: leadId, conversationId,
        })
      } else {
        await createNotification(sb, {
          orgId: property.orgId, propertyId, type: 'proposal_draft',
          title: `Richiesta preventivo da gestire · ${offerStr}`,
          body: `Per Jacopo: verifica disponibilità/tariffa e invia (${result.draft.roomName}, affidabilità ${result.draft.quote.dataReliability}).`,
          bookingRequestId: leadId, conversationId,
        })
      }
    } else if (leadId && result.slotsReady && !result.autoSend) {
      // Fallback cortesia SENZA bozza calcolabile (tariffe/disponibilità mancanti):
      // lead creato + notifica Jacopo per la proposta personalizzata.
      await createNotification(sb, {
        orgId: property.orgId, propertyId, type: 'escalation',
        title: 'Richiesta preventivo da gestire',
        body: 'Per Jacopo: verifica disponibilità e migliore tariffa, poi invia una proposta personalizzata.',
        bookingRequestId: leadId, conversationId,
      })
    }
  }

  // Notifica staff per le escalation / richieste da gestire (pending_staff).
  if (result.status === 'pending_staff' && result.intent !== 'booking') {
    await createNotification(sb, {
      orgId: property.orgId, propertyId, type: 'escalation',
      title: result.escalated ? 'Richiesta da gestire (escalation)' : 'Nuova richiesta da gestire',
      body: `Categoria: ${result.intent}. La conversazione richiede attenzione dello staff.`,
      conversationId,
    })
  }

  return Response.json({
    conversationId, reply: result.text, intent: result.intent,
    stage: result.stage, status: result.status, source: result.source,
    escalated: result.escalated,
  })
}
