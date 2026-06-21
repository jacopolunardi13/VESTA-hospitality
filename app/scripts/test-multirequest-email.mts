// Test reale: email multi-richiesta → 1 lead, parsed_requests con entrambe, notifica staff,
// messaggio originale consultabile. Invio Gmail disattivato (accessToken '').
// Uso: node --env-file=.env.local --import tsx scripts/test-multirequest-email.mts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { ingestEmail, loadEmailProperty } from '@/lib/email/ingest'
import type { InboundEmail } from '@/lib/email/gmail'

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }

const property = await loadEmailProperty(sb)
const stamp = Date.now()
const email: InboundEmail = {
  id: `mr-${stamp}`, threadId: `mr-thread-${stamp}`,
  from: 'valentina.test@example.com', fromName: 'Valentina Test',
  subject: 'Disponibilità agosto e settembre', rfcMessageId: `<mr-${stamp}@mail.test>`, references: '', inReplyTo: '',
  body: "Vorrei sapere la disponibilità per una matrimoniale il primo di agosto e una tripla per le notti dell'1 e 2 settembre.",
}

const r = await ingestEmail(sb, property, email, '') // accessToken '' → nessun invio Gmail
const conv = r.conversationId

const { data: c } = await sb.from('conversations').select('booking_request_id, source').eq('id', conv).single()
const leadId = c!.booking_request_id!
const { count: leadCount } = await sb.from('booking_requests').select('*', { count: 'exact', head: true }).eq('conversation_id', conv)
const { data: lead } = await sb.from('booking_requests').select('parsed_requests, status').eq('id', leadId).single()
const pr = Array.isArray(lead!.parsed_requests) ? lead!.parsed_requests as Array<{ room_type?: string; check_in?: string; check_out?: string }> : []
const { data: notif } = await sb.from('notifications').select('title').eq('booking_request_id', leadId).ilike('title', '%Richiesta multipla%')
const { data: firstMsg } = await sb.from('messages').select('content').eq('conversation_id', conv).eq('direction', 'in').order('created_at').limit(1).maybeSingle()

console.log('\n=== Risultati ===')
console.log('conversation:', conv, '| source:', c!.source)
ok(c!.source === 'email', "conversation source = 'email'")
ok((leadCount ?? 0) === 1, `un solo lead per conversazione (count=${leadCount})`)
console.log('parsed_requests:', JSON.stringify(pr))
ok(pr.length === 2, `parsed_requests contiene ENTRAMBE le richieste (${pr.length})`)
ok(/matrimoniale/i.test(pr[0]?.room_type ?? '') && /tripla/i.test(pr[1]?.room_type ?? ''), 'segmenti: 1) matrimoniale, 2) tripla')
ok((notif ?? []).length > 0, 'notifica staff "Richiesta multipla"')
ok((firstMsg?.content ?? '').includes('matrimoniale') && (firstMsg?.content ?? '').includes('tripla'), 'messaggio originale integro e consultabile')

console.log('\n=== Cleanup ===')
await sb.from('notifications').delete().eq('booking_request_id', leadId)
await sb.from('notifications').delete().eq('conversation_id', conv)
await sb.from('booking_request_events').delete().eq('booking_request_id', leadId)
await sb.from('booking_request_items').delete().eq('booking_request_id', leadId)
await sb.from('messages').delete().eq('conversation_id', conv)
await sb.from('booking_requests').delete().eq('id', leadId)
await sb.from('conversations').delete().eq('id', conv)
console.log('  ✓ dati di test rimossi')

console.log(`\n════ ${pass} passati, ${fail} falliti ════`)
process.exit(fail > 0 ? 1 : 0)
