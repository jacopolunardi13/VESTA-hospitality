// Gestione email NON-ospite: audit/dedup (email_routing_log), archivio RAW (ota_inbox) e
// staging strutturato (reservations_staging). NESSUNA reservation canonica, nessuna automazione.
// Le 3 tabelle non sono ancora nei tipi generati: client locale non tipizzato (cast unico e
// documentato), payload tipizzati dalle interfacce qui sotto.
import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PropertyContext } from '@/lib/ai/types'
import type { InboundEmail } from './gmail'
import { parseOtaEmail } from './ota-parsers'
import type { RouteResult } from './routing'

const db = (sb: SupabaseClient<Database>) => sb as unknown as SupabaseClient

/** Questa email è già stata smistata? (idempotenza del router, indipendente dallo stato letto.) */
export async function alreadyRouted(sb: SupabaseClient<Database>, propertyId: string, gmailMessageId: string): Promise<boolean> {
  const { data } = await db(sb).from('email_routing_log').select('id').eq('property_id', propertyId).eq('gmail_message_id', gmailMessageId).limit(1)
  return Array.isArray(data) && data.length > 0
}

/** Registra la decisione di routing (audit + dedup). Una riga per ogni email.
 *  `suppressed` = rete di sicurezza ha bloccato un'email instradata guest con marker automatici. */
export async function logRouting(sb: SupabaseClient<Database>, property: PropertyContext, email: InboundEmail, route: RouteResult, suppressed = false): Promise<void> {
  await db(sb).from('email_routing_log').insert({
    org_id: property.orgId, property_id: property.id,
    gmail_message_id: email.id, category: route.category, source: route.source,
    confidence: route.confidence, method: route.method, suppressed,
    from_address: email.from, subject: email.subject,
  })
}

/** Archivia un'email OTA/PMS: raw in ota_inbox + parsing best-effort in reservations_staging. */
export async function archiveOtaEmail(sb: SupabaseClient<Database>, property: PropertyContext, email: InboundEmail, route: RouteResult): Promise<void> {
  const source = route.source ?? 'unknown'
  const { data: inbox } = await db(sb).from('ota_inbox').insert({
    org_id: property.orgId, property_id: property.id,
    gmail_message_id: email.id, gmail_thread_id: email.threadId, source,
    from_address: email.from, from_name: email.fromName, subject: email.subject,
    received_at: new Date().toISOString(), raw_body: email.body,
    raw_headers: {
      list_unsubscribe: email.listUnsubscribe, auto_submitted: email.autoSubmitted,
      precedence: email.precedence, references: email.references, in_reply_to: email.inReplyTo,
    },
  }).select('id').single()

  const parsed = parseOtaEmail(source, email)
  await db(sb).from('reservations_staging').insert({
    org_id: property.orgId, property_id: property.id,
    ota_inbox_id: (inbox as { id: string } | null)?.id ?? null,
    source: parsed.source, external_id: parsed.external_id, guest_name: parsed.guest_name,
    check_in: parsed.check_in, check_out: parsed.check_out, room: parsed.room,
    amount_cents: parsed.amount_cents, status: parsed.status,
    confidence: parsed.confidence, verified: false,
    canonical_ref: null, linked_group_id: null, parsed_at: new Date().toISOString(),
  })
}
