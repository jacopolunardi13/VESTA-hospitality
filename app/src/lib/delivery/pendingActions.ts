// Coda azioni Tier 2 "Approva e invia". pending_actions non è ancora nei tipi generati →
// client locale non tipizzato (cast unico, payload tipizzati qui).
import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

const db = (sb: SupabaseClient<Database>) => sb as unknown as SupabaseClient
export type PendingKind = 'send_proposal' | 'send_confirmation'

/** Crea una pending action (idempotente: salta se ne esiste già una pending per lead+kind). */
export async function createPendingAction(sb: SupabaseClient<Database>, p: {
  orgId: string; propertyId: string; conversationId: string | null; bookingRequestId: string
  kind: PendingKind; channel: string | null; documentType: 'preventivo' | 'conferma' | null
}): Promise<void> {
  const { data: existing } = await db(sb).from('pending_actions').select('id')
    .eq('booking_request_id', p.bookingRequestId).eq('kind', p.kind).eq('status', 'pending').limit(1)
  if (Array.isArray(existing) && existing.length > 0) return
  await db(sb).from('pending_actions').insert({
    org_id: p.orgId, property_id: p.propertyId, conversation_id: p.conversationId,
    booking_request_id: p.bookingRequestId, kind: p.kind, status: 'pending',
    channel: p.channel, document_type: p.documentType, prepared_by: 'system',
  })
}

/** Segna come inviata la pending action al momento dell'approvazione staff. */
export async function markPendingSent(sb: SupabaseClient<Database>, p: {
  bookingRequestId: string; kind: PendingKind; messageText: string; documentPath?: string | null; approvedBy?: string | null
}): Promise<void> {
  const now = new Date().toISOString()
  await db(sb).from('pending_actions').update({
    status: 'sent', message_text: p.messageText, document_path: p.documentPath ?? null,
    approved_by: p.approvedBy ?? null, decided_at: now, sent_at: now,
  }).eq('booking_request_id', p.bookingRequestId).eq('kind', p.kind).eq('status', 'pending')
}
