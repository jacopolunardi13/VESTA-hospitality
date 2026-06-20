// Test automatico: conversazione EMAIL completa sullo STESSO thread Gmail.
// Verifica: stessa conversation riusata, stesso booking_request, nessun lead
// duplicato, avanzamento stati. Nessuna credenziale Gmail (invio saltato dalla guardia).
// Uso: node --env-file=.env.local --import tsx scripts/test-email-thread.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { ingestEmail, loadEmailProperty } from '@/lib/email/ingest'
import { executeTransition } from '@/lib/quote/stateMachine'
import type { InboundEmail } from '@/lib/email/gmail'

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }

const property = await loadEmailProperty(sb)

// Feed iCal freschi (disponibilità verificata per il preventivo).
const { data: rooms } = await sb.from('rooms').select('id').eq('property_id', property.id).is('deleted_at', null)
const roomIds = (rooms ?? []).map((r) => r.id)
const { data: feedsBefore } = await sb.from('ical_feeds').select('id, last_sync_at').in('room_id', roomIds)
for (const f of feedsBefore ?? []) await sb.from('ical_feeds').update({ last_sync_at: new Date().toISOString() }).eq('id', f.id)

const stamp = Date.now()
const threadId = `test-thread-${stamp}`
const guest = 'mario.rossi.test@example.com'
const mk = (n: number, body: string, subject: string): InboundEmail => ({
  id: `test-msg-${stamp}-${n}`, threadId, from: guest, fromName: 'Mario Rossi',
  subject, rfcMessageId: `<test-${stamp}-${n}@mail.test>`,
  references: n === 1 ? '' : `<test-${stamp}-1@mail.test>`,
  inReplyTo: n === 1 ? '' : `<test-${stamp}-${n - 1}@mail.test>`, body,
})

async function leadOf(convId: string) {
  const { data } = await sb.from('conversations').select('booking_request_id').eq('id', convId).single()
  return data?.booking_request_id ?? null
}
async function statusOf(leadId: string) {
  const { data } = await sb.from('booking_requests').select('status').eq('id', leadId).single()
  return data?.status
}
async function leadCount(convId: string) {
  const { count } = await sb.from('booking_requests').select('*', { count: 'exact', head: true }).eq('conversation_id', convId)
  return count ?? 0
}

console.log('\n──────── EMAIL 1 · richiesta disponibilità ────────')
const r1 = await ingestEmail(sb, property, mk(1, 'Buongiorno, avete disponibilità dal 1 al 3 agosto 2026 per 2 persone?', 'Disponibilità agosto'), '')
const conv = r1.conversationId
const lead1 = await leadOf(conv)
console.log('  conversationId:', conv, '| nuova:', r1.isNewConversation, '| lead:', lead1)
ok(r1.isNewConversation === true, 'conversation creata (prima email del thread)')
ok(!!lead1, 'booking_request creato')
ok((await statusOf(lead1!)) === 'proposal_sent', 'stato = proposal_sent dopo preventivo')
ok((await leadCount(conv)) === 1, 'esattamente 1 booking_request')

console.log('\n──────── EMAIL 2 · scelta Camera 303 (stesso thread) ────────')
const r2 = await ingestEmail(sb, property, mk(2, 'Vorrei procedere con la Camera 303', 'Re: Disponibilità agosto'), '')
const lead2 = await leadOf(conv)
console.log('  conversationId:', r2.conversationId, '| nuova:', r2.isNewConversation, '| lead:', lead2)
ok(r2.conversationId === conv, 'STESSA conversation riusata (mapping per threadId)')
ok(r2.isNewConversation === false, 'nessuna nuova conversation creata')
ok(lead2 === lead1, 'STESSO booking_request riusato')
ok((await leadCount(conv)) === 1, 'nessun lead duplicato (ancora 1)')
ok((await statusOf(lead1!)) === 'interested', 'stato avanzato a interested (verifica disponibilità)')

console.log('\n──────── STAFF · disponibile → riserva (simulazione) ────────')
const t1 = await executeTransition(sb, { requestId: lead1!, orgId: property.orgId, toStatus: 'availability_blocked', actor: 'staff', note: 'test: disponibile, chiusa in PMS' })
const t2 = t1.ok ? await executeTransition(sb, { requestId: lead1!, orgId: property.orgId, toStatus: 'awaiting_payment', actor: 'staff', note: 'test: richiesta pagamento' }) : t1
ok(t2.ok === true, 'transizioni staff interested→availability_blocked→awaiting_payment')

console.log('\n──────── EMAIL 3 · invio contabile (stesso thread) ────────')
const r3 = await ingestEmail(sb, property, mk(3, 'Ho pagato il soggiorno, allego la contabile del bonifico.', 'Re: Disponibilità agosto'), '')
const lead3 = await leadOf(conv)
console.log('  conversationId:', r3.conversationId, '| nuova:', r3.isNewConversation, '| lead:', lead3)
ok(r3.conversationId === conv, 'STESSA conversation riusata anche al 3° messaggio')
ok(lead3 === lead1, 'STESSO booking_request al 3° messaggio')
ok((await leadCount(conv)) === 1, 'sempre 1 solo booking_request (nessun duplicato)')
ok((await statusOf(lead1!)) === 'awaiting_payment', 'stato resta awaiting_payment (nessuna conferma automatica)')
const { data: notif } = await sb.from('notifications').select('title').eq('booking_request_id', lead1!).ilike('title', '%Contabile ricevuta%')
ok((notif ?? []).length > 0, 'notifica staff "Contabile ricevuta" generata')

console.log('\n──────── Verifica finale unicità ────────')
const { count: convCount } = await sb.from('conversations').select('*', { count: 'exact', head: true }).eq('property_id', property.id).contains('booking_request_id' as never, lead1 as never).eq('id', conv)
ok((await leadCount(conv)) === 1, 'TOTALE: 1 conversation → 1 booking_request per tutto il thread')
void convCount

console.log('\n──────── Cleanup ────────')
await sb.from('notifications').delete().eq('booking_request_id', lead1!)
await sb.from('notifications').delete().eq('conversation_id', conv)
await sb.from('booking_request_events').delete().eq('booking_request_id', lead1!)
await sb.from('booking_request_items').delete().eq('booking_request_id', lead1!)
await sb.from('messages').delete().eq('conversation_id', conv)
await sb.from('booking_requests').delete().eq('id', lead1!)
await sb.from('conversations').delete().eq('id', conv)
for (const f of feedsBefore ?? []) await sb.from('ical_feeds').update({ last_sync_at: f.last_sync_at }).eq('id', f.id)
console.log('  ✓ dati di test rimossi, feed ripristinati')

console.log(`\n════════ Risultato: ${pass} passati, ${fail} falliti ════════`)
process.exit(fail > 0 ? 1 : 0)
