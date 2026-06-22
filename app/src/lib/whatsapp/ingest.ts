// Ingestione WhatsApp → conversation/lead Vesta. Specchio di lib/email/ingest.ts: riusa
// l'orchestrazione condivisa (processConversationTurn) — booking, concierge, richieste miste,
// payment-claim e multi-richiesta funzionano automaticamente. Delivery via WhatsApp Cloud API
// (entro la finestra di servizio 24h). Mapping per numero di telefono. Pilot single-property.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase/database.types'
import { processConversationTurn } from '@/lib/booking/orchestrate'
import { createNotification } from '@/lib/notifications'
import type { PropertyContext } from '@/lib/ai/types'
import type { InboundWaMessage, WhatsAppDeps } from './client'

const DEFAULT_PROPERTY_ID = '00000000-0000-0000-0000-000000000011' // LunArt B&B (pilot)
const MEDIA_BUCKET = 'whatsapp-media'

/** Carica la property associata al numero WhatsApp del pilot (da WHATSAPP_PROPERTY_ID). */
export async function loadWhatsAppProperty(sb: SupabaseClient<Database>): Promise<PropertyContext> {
  const propertyId = process.env.WHATSAPP_PROPERTY_ID?.trim() || DEFAULT_PROPERTY_ID
  const { data: prop, error } = await sb
    .from('properties')
    .select('id, org_id, name, settings, supervision_mode')
    .eq('id', propertyId)
    .is('deleted_at', null)
    .single()
  if (error || !prop) throw new Error(`WhatsApp property non trovata (${propertyId}): ${error?.message ?? 'null'}`)
  return {
    id: prop.id, orgId: prop.org_id, name: prop.name,
    settings: (prop.settings ?? {}) as Record<string, unknown>,
    supervisionMode: prop.supervision_mode,
  }
}

/** Dedup: questo messaggio WhatsApp è già stato ingerito? (Meta ritenta i webhook.) */
export async function alreadyIngested(
  sb: SupabaseClient<Database>, propertyId: string, waMessageId: string
): Promise<boolean> {
  const { data } = await sb
    .from('messages')
    .select('id')
    .eq('property_id', propertyId)
    .contains('metadata', { wa_message_id: waMessageId })
    .limit(1)
  return !!(data && data.length > 0)
}

/** Mappa il numero ospite alla sua conversation (continuità WhatsApp); altrimenti la crea. */
async function findOrCreateConversation(
  sb: SupabaseClient<Database>, property: PropertyContext, msg: InboundWaMessage
): Promise<{ id: string; isNew: boolean }> {
  const { data: existing } = await sb
    .from('conversations')
    .select('id')
    .eq('property_id', property.id)
    .eq('source', 'whatsapp')
    .eq('guest_contact', msg.from)
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(1)
  if (existing && existing.length > 0) return { id: existing[0].id, isNew: false }

  const { data: created, error } = await sb
    .from('conversations')
    .insert({
      org_id: property.orgId, property_id: property.id,
      source: 'whatsapp', status: 'open', stage: 'new',
      guest_name: msg.name || null, guest_contact: msg.from, language: 'it',
    })
    .select('id')
    .single()
  if (error || !created) throw new Error(`creazione conversation WhatsApp fallita: ${error?.message}`)
  return { id: created.id, isNew: true }
}

/** Scarica e archivia il media (best-effort) su Supabase Storage; ritorna i metadati. */
async function storeMedia(
  sb: SupabaseClient<Database>, property: PropertyContext, conversationId: string,
  msg: InboundWaMessage, deps: WhatsAppDeps
): Promise<Record<string, unknown>> {
  const media = msg.media!
  const base: Record<string, unknown> = { wa_media_id: media.id, mime: media.mime, kind: media.kind }
  try {
    const dl = await deps.downloadMedia(media.id)
    if (!dl) return base
    const ext = (dl.mime.split('/')[1] ?? 'bin').split(';')[0]
    const path = `${property.id}/${conversationId}/${msg.messageId}.${ext}`
    const up = await sb.storage.from(MEDIA_BUCKET).upload(path, dl.bytes, { contentType: dl.mime, upsert: true })
    if (up.error) return base // bucket assente o errore → conserva almeno il media_id
    return { ...base, storage_path: path }
  } catch {
    return base
  }
}

export interface WaIngestResult {
  conversationId: string
  intent: string
  stage: string
  replied: boolean
  isNewConversation: boolean
  hadMedia: boolean
}

export async function ingestWhatsApp(
  sb: SupabaseClient<Database>,
  property: PropertyContext,
  msg: InboundWaMessage,
  deps: WhatsAppDeps
): Promise<WaIngestResult> {
  // 1. Mappa il numero alla conversation (o creala).
  const { id: conversationId, isNew } = await findOrCreateConversation(sb, property, msg)

  // 2. Media (immagini/documenti, es. contabili di pagamento): archivia + decide il testo.
  let mediaMeta: Record<string, unknown> | null = null
  let effectiveText = (msg.text ?? '').trim()
  if (msg.media) {
    mediaMeta = await storeMedia(sb, property, conversationId, msg, deps)
    if (!effectiveText) {
      // Senza caption: se il lead è in attesa di pagamento, trattalo come contabile
      // (→ ramo payment-claim dell'orchestrazione: notifica staff, nessuna conferma auto).
      const { data: conv } = await sb.from('conversations').select('booking_request_id').eq('id', conversationId).single()
      let awaitingPayment = false
      if (conv?.booking_request_id) {
        const { data: lead } = await sb.from('booking_requests').select('status').eq('id', conv.booking_request_id).single()
        awaitingPayment = lead?.status === 'awaiting_payment'
      }
      effectiveText = awaitingPayment
        ? 'Allego la contabile del pagamento.'
        : `Ho inviato un allegato (${msg.media.kind}).`
    }
  }

  // 3. Persisti il messaggio in ingresso con i metadati WhatsApp (dedup + media).
  await sb.from('messages').insert({
    org_id: property.orgId, property_id: property.id, conversation_id: conversationId,
    direction: 'in', sender: 'guest', content: effectiveText,
    metadata: {
      channel: 'whatsapp', wa_message_id: msg.messageId, wa_from: msg.from,
      ...(mediaMeta ? { media: mediaMeta } : {}),
    } as Json,
  })

  // 4. Orchestrazione condivisa (short-circuit/pipeline/lead + salvataggio risposta).
  const turn = await processConversationTurn({
    sb, property, conversationId, userMessage: effectiveText, leadSource: 'whatsapp',
  })

  // 5. Allegato non-pagamento → assicura comunque la visibilità allo staff.
  if (msg.media && !effectiveText.toLowerCase().includes('contabile')) {
    await createNotification(sb, {
      orgId: property.orgId, propertyId: property.id, type: 'escalation',
      title: 'Allegato ricevuto via WhatsApp',
      body: `L'ospite ha inviato un allegato (${msg.media.kind}). Verificalo nella conversazione.`,
      conversationId,
    })
  }

  // 6. Consegna la risposta entro la finestra di servizio 24h (no-op se Meta non configurato).
  let replied = false
  if (turn.reply) {
    replied = await deps.sendText(msg.from, turn.reply)
  }

  return { conversationId, intent: turn.intent, stage: turn.stage, replied, isNewConversation: isNew, hadMedia: !!msg.media }
}
