// Approva-e-invia una BOZZA di risposta già generata da Vesta.
// Regola ufficiale: proposal_sent può esistere SOLO dopo una consegna reale all'ospite.
// Finché è bozza, la pratica resta 'received' e lo staff può approvare e inviare.
// Flusso: consegna il testo della bozza all'ospite (Tier-2, bypassa l'autosend) →
//   solo se la consegna riesce → recordDelivery('sent') → received → proposal_sent.
//   Se la consegna fallisce → recordDelivery('failed') → la pratica RESTA 'received'.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PropertyContext } from '@/lib/ai/types'
import { deliverToGuest } from '@/lib/delivery/deliverToGuest'
import { recordDelivery } from '@/lib/delivery/recordDelivery'
import { renderEmailHtml } from '@/lib/email/template'
import { getDocumentConfig } from '@/lib/documents'

export type SendDraftResult =
  | { ok: true; delivered: boolean }
  | { ok: false; reason: 'invalid_state' | 'no_channel' | 'no_draft' }

export async function sendDraftProposal(
  sb: SupabaseClient<Database>,
  property: PropertyContext,
  leadId: string,
): Promise<SendDraftResult> {
  const { data: lead } = await sb.from('booking_requests').select('id, status, conversation_id').eq('id', leadId).single()
  if (!lead) return { ok: false, reason: 'invalid_state' }
  if (lead.status !== 'received') return { ok: false, reason: 'invalid_state' }
  if (!lead.conversation_id) return { ok: false, reason: 'no_channel' }
  const conversationId = lead.conversation_id

  // L'ultima risposta outbound NON ancora consegnata = la bozza da inviare.
  const { data: draft } = await sb.from('messages')
    .select('content, delivery_status')
    .eq('conversation_id', conversationId).eq('direction', 'out')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!draft?.content || draft.delivery_status === 'sent') return { ok: false, reason: 'no_draft' }

  let html: string | undefined
  try { html = renderEmailHtml(getDocumentConfig(property), draft.content) } catch { /* solo testo */ }

  // Consegna SENZA duplicare il messaggio (persist:false): invia la bozza esistente.
  const res = await deliverToGuest(sb, property, conversationId, { text: draft.content, html }, { persist: false })
  // Consegnato davvero = email/whatsapp inviata, oppure web chat (il widget la mostra subito).
  const delivered = res.sent || res.channel === 'website_chat'

  // Marca la bozza come sent/failed e — SOLO se 'sent' — fa avanzare a proposal_sent.
  await recordDelivery(sb, { property, conversationId, leadId, proposalGenerated: true, outcome: delivered ? 'sent' : 'failed' })
  return { ok: true, delivered }
}
