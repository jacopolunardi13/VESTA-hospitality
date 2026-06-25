// Ingestione email → conversation/lead Vesta. Riusa l'orchestrazione condivisa
// con la web chat (processConversationTurn) e consegna la risposta via Gmail
// (delivery: email = salva + invia; chat = salva soltanto). Pilot single-property.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase/database.types'
import { processConversationTurn } from '@/lib/booking/orchestrate'
import { sendReply, type InboundEmail } from './gmail'
import { renderEmailHtml } from './template'
import { emailAutosendEnabled } from './flags'
import { hasAutomatedMarkers } from './routing'
import { getDocumentConfig } from '@/lib/documents'
import type { PropertyContext } from '@/lib/ai/types'

const NO_REPLY = /no-?reply|do-?not-?reply|mailer-daemon|postmaster/i

const DEFAULT_PROPERTY_ID = '00000000-0000-0000-0000-000000000011' // LunArt B&B (pilot)

/** Carica la property associata alla casella email del pilot (da GMAIL_PROPERTY_ID). */
export async function loadEmailProperty(sb: SupabaseClient<Database>): Promise<PropertyContext> {
  const propertyId = process.env.GMAIL_PROPERTY_ID?.trim() || DEFAULT_PROPERTY_ID
  const { data: prop, error } = await sb
    .from('properties')
    .select('id, org_id, name, settings, supervision_mode')
    .eq('id', propertyId)
    .is('deleted_at', null)
    .single()
  if (error || !prop) throw new Error(`email property non trovata (${propertyId}): ${error?.message ?? 'null'}`)
  return {
    id: prop.id, orgId: prop.org_id, name: prop.name,
    settings: (prop.settings ?? {}) as Record<string, unknown>,
    supervisionMode: prop.supervision_mode,
  }
}

/** Deduplica: questa email Gmail è già stata ingerita? (ledger su messages.metadata). */
export async function alreadyIngested(
  sb: SupabaseClient<Database>, propertyId: string, gmailMessageId: string
): Promise<boolean> {
  const { data } = await sb
    .from('messages')
    .select('id')
    .eq('property_id', propertyId)
    .contains('metadata', { gmail_message_id: gmailMessageId })
    .limit(1)
  return !!(data && data.length > 0)
}

/**
 * Trova la conversation del thread email, così le risposte successive dello stesso
 * cliente NON creano nuovi lead. Match primario: threadId Gmail (stabile per tutta
 * la conversazione). Fallback: un Message-ID nostro citato nei References/In-Reply-To
 * dell'email in arrivo.
 */
async function findThreadConversation(
  sb: SupabaseClient<Database>, propertyId: string, email: InboundEmail
): Promise<string | null> {
  const { data: byThread } = await sb
    .from('messages')
    .select('conversation_id')
    .eq('property_id', propertyId)
    .contains('metadata', { gmail_thread_id: email.threadId })
    .order('created_at', { ascending: true })
    .limit(1)
  if (byThread && byThread.length > 0) return byThread[0].conversation_id

  const refIds = `${email.references} ${email.inReplyTo}`.match(/<[^>]+>/g) ?? []
  for (const rid of refIds) {
    const { data } = await sb
      .from('messages')
      .select('conversation_id')
      .eq('property_id', propertyId)
      .contains('metadata', { rfc_message_id: rid })
      .limit(1)
    if (data && data.length > 0) return data[0].conversation_id
  }
  return null
}

export interface IngestResult {
  conversationId: string
  intent: string
  stage: string
  replied: boolean
  isNewConversation: boolean
  suppressed?: boolean
}

export async function ingestEmail(
  sb: SupabaseClient<Database>,
  property: PropertyContext,
  email: InboundEmail,
  accessToken: string
): Promise<IngestResult> {
  // RETE DI SICUREZZA FINALE (difesa in profondità): un'email con marker automatici non deve
  // MAI generare conversazione/lead/risposta, anche se per errore arrivasse qui come 'guest'.
  if (hasAutomatedMarkers(email)) {
    return { conversationId: '', intent: 'suppressed', stage: 'suppressed', replied: false, isNewConversation: false, suppressed: true }
  }

  // 1. Mappa l'email alla conversation del thread o creane una nuova.
  let conversationId = await findThreadConversation(sb, property.id, email)
  const isNewConversation = !conversationId
  if (!conversationId) {
    const { data: created, error } = await sb
      .from('conversations')
      .insert({
        org_id: property.orgId, property_id: property.id,
        source: 'email', status: 'open', stage: 'new',
        guest_name: email.fromName || null, guest_contact: email.from, language: 'it',
      })
      .select('id')
      .single()
    if (error || !created) throw new Error(`creazione conversation email fallita: ${error?.message}`)
    conversationId = created.id
  }

  // 2. Persisti il messaggio in ingresso con i metadati di threading Gmail
  //    (servono per dedup + mapping dei messaggi successivi dello stesso thread).
  await sb.from('messages').insert({
    org_id: property.orgId, property_id: property.id, conversation_id: conversationId,
    direction: 'in', sender: 'guest', content: email.body,
    metadata: {
      channel: 'email', gmail_thread_id: email.threadId, gmail_message_id: email.id,
      rfc_message_id: email.rfcMessageId, from: email.from, subject: email.subject,
    } as Json,
  })

  // 3. Orchestrazione condivisa con la chat (short-circuit/pipeline/lead + salva risposta).
  const turn = await processConversationTurn({
    sb, property, conversationId, userMessage: email.body, leadSource: 'email',
  })

  // 4. Consegna: email = invia la risposta in-thread (la persistenza l'ha già fatta il core).
  //    Se le credenziali Gmail non sono configurate, salta l'invio senza errori
  //    (produzione sicura + abilita i test del percorso ingestione senza Gmail reale).
  // Kill-switch: invia SOLO se l'auto-invio è abilitato (default OFF) e il mittente non è no-reply.
  // Quando OFF, la risposta è già stata persistita (visibile in dashboard) ma non viene inviata.
  let replied = false
  const autosend = emailAutosendEnabled(property.settings)
  if (turn.reply && autosend && !NO_REPLY.test(email.from) && process.env.GMAIL_REFRESH_TOKEN && accessToken) {
    // Tier 1: corpo HTML brandizzato (struttura), SENZA allegati. Il PDF preventivo è Tier 2,
    // inviato solo all'approvazione staff (Fase B).
    let html: string | undefined
    try { html = renderEmailHtml(getDocumentConfig(property), turn.reply) }
    catch { /* branding non disponibile → solo testo */ }
    await sendReply(accessToken, {
      to: email.from, from: process.env.GMAIL_ADDRESS ?? '', subject: email.subject, body: turn.reply,
      html,
      inReplyTo: email.rfcMessageId, references: email.references, threadId: email.threadId,
    })
    replied = true
  }

  return { conversationId, intent: turn.intent, stage: turn.stage, replied, isNewConversation }
}
