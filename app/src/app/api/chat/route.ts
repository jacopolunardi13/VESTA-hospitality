import { createAdminClient } from '@/lib/supabase/admin'
import {
  MAX_MESSAGE_LENGTH, clientIp, hashIp, isIpBlocked, checkRateLimit,
  logGuardrail, sessionMessageCount,
} from '@/lib/ai/guardrail'
import { SESSION_LIMIT_TEMPLATE } from '@/lib/ai/pipeline'
import { processConversationTurn } from '@/lib/booking/orchestrate'
import { recordDelivery } from '@/lib/delivery/recordDelivery'
import { dbThrow } from '@/lib/supabase/guard'
import type { PropertyContext } from '@/lib/ai/types'

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
  dbThrow((await sb.from('messages').insert({
    org_id: property.orgId, property_id: propertyId, conversation_id: conversationId,
    direction: 'in', sender: 'guest', content: message,
    metadata: { ip_hash: ipHash },
  })).error, 'chat.inboundMessage')

  // Session cap giornaliero (anti-abuse web).
  const sessionLimit = Number(property.settings['ai_session_message_limit'] ?? 30)
  const sessionCount = await sessionMessageCount(sb, conversationId)
  if (sessionCount > sessionLimit) {
    await logGuardrail(sb, {
      orgId: property.orgId, propertyId, conversationId, type: 'msg_limit', ipHash,
      details: { sessionCount, sessionLimit },
    })
    dbThrow((await sb.from('messages').insert({
      org_id: property.orgId, property_id: propertyId, conversation_id: conversationId,
      direction: 'out', sender: 'ai', content: SESSION_LIMIT_TEMPLATE,
    })).error, 'chat.sessionLimitMessage')
    dbThrow((await sb.from('conversations').update({ status: 'pending_staff', stage: 'handoff_staff' })
      .eq('id', conversationId)).error, 'chat.conv.handoff')
    return Response.json({
      conversationId, reply: SESSION_LIMIT_TEMPLATE, intent: 'unclassified',
      stage: 'handoff_staff', status: 'pending_staff', source: 'template',
    })
  }

  // Orchestrazione del turno (condivisa con il canale email).
  const turn = await processConversationTurn({
    sb, property, conversationId, userMessage: message, leadSource: 'website_chat',
  })

  // Canale web: la risposta è mostrata subito dal widget = consegnata. Finalizza la
  // consegna (sent) e — se è stato generato un preventivo — fa avanzare a proposal_sent.
  await recordDelivery(sb, {
    property, conversationId,
    leadId: turn.leadId, proposalGenerated: turn.proposalGenerated, outcome: 'sent',
  })

  return Response.json({
    conversationId, reply: turn.reply, intent: turn.intent,
    stage: turn.stage, status: turn.status, source: turn.source, escalated: turn.escalated,
  })
}
