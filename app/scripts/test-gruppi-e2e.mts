// E2E gruppi & combinazioni: proposta (runPipeline) + selezione (percorso email).
// Uso: node --env-file=.env.local --import tsx scripts/test-gruppi-e2e.mts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { runPipeline } from '@/lib/ai/pipeline'
import { ingestEmail, loadEmailProperty } from '@/lib/email/ingest'
import type { InboundEmail } from '@/lib/email/gmail'
import type { PropertyContext } from '@/lib/ai/types'

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const property: PropertyContext = await loadEmailProperty(sb)
const { data: rooms } = await sb.from('rooms').select('id').eq('property_id', property.id).is('deleted_at', null)
await sb.from('ical_feeds').update({ last_sync_at: new Date().toISOString() }).in('room_id', (rooms ?? []).map((r) => r.id)).eq('active', true)

let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }
const TODAY = '2026-06-21'

console.log('— A. runPipeline (proposta) —')
const g5 = await runPipeline({ sb, property, history: [], userMessage: 'Buongiorno, siamo in 5 dal 1 al 3 agosto', aiEnabled: true, todayIso: TODAY })
console.log(`  5 ospiti → stage=${g5.stage}, combinazioni=${g5.proposalCombinations?.length ?? 0}`)
ok(g5.stage === 'proposal_sent' && (g5.proposalCombinations?.length ?? 0) >= 1, '5 ospiti → combinazioni proposte (proposal_sent)')
ok(/Opzione A/i.test(g5.text) && /non comunicanti/i.test(g5.text), 'testo: Opzione A + nota "camere non comunicanti"')
const g2 = await runPipeline({ sb, property, history: [], userMessage: 'Siamo in 2 dal 1 al 3 agosto', aiEnabled: true, todayIso: TODAY })
ok(g2.stage === 'proposal_sent' && (g2.proposalRooms?.length ?? 0) > 0 && !g2.proposalCombinations, '2 ospiti → camere singole (no combinazioni)')
const g14 = await runPipeline({ sb, property, history: [], userMessage: 'Siamo in 14 dal 1 al 3 agosto', aiEnabled: true, todayIso: TODAY })
console.log(`  14 ospiti → stage=${g14.stage}`)
ok(g14.stage !== 'proposal_sent', '14 ospiti (> capienza 12) → NON proposal_sent (staff)')

console.log('\n— B. Selezione combinazione via email (1 lead, items multi-camera) —')
const stamp = Date.now()
const mk = (n: number, body: string): InboundEmail => ({ id: `grp-${stamp}-${n}`, threadId: `grp-${stamp}`, from: 'gruppo.test@example.com', fromName: 'Gruppo Test', subject: 'Gruppo agosto', rfcMessageId: `<grp-${stamp}-${n}@mail.test>`, references: n === 1 ? '' : `<grp-${stamp}-1@mail.test>`, inReplyTo: n === 1 ? '' : `<grp-${stamp}-${n - 1}@mail.test>`, body })
const r1 = await ingestEmail(sb, property, mk(1, 'Buongiorno, siamo in 5 dal 1 al 3 agosto 2026'), '')
const conv = r1.conversationId
const { data: c1 } = await sb.from('conversations').select('booking_request_id').eq('id', conv).single()
const leadId = c1!.booking_request_id!
const { data: br1 } = await sb.from('booking_requests').select('status').eq('id', leadId).single()
ok(br1!.status === 'proposal_sent', `email gruppo → lead proposal_sent (${br1!.status})`)
const { data: nGrp } = await sb.from('notifications').select('title').eq('booking_request_id', leadId).ilike('title', '%gruppo%')
ok((nGrp ?? []).length > 0, 'notifica staff "Preventivo gruppo"')

const r2 = await ingestEmail(sb, property, mk(2, 'Opzione A'), '')
ok(r2.conversationId === conv, 'stessa conversation (1 lead)')
const { count: leadCount } = await sb.from('booking_requests').select('*', { count: 'exact', head: true }).eq('conversation_id', conv)
ok((leadCount ?? 0) === 1, `un solo lead (count=${leadCount})`)
const { data: br2 } = await sb.from('booking_requests').select('status').eq('id', leadId).single()
ok(br2!.status === 'interested', `scelta Opzione A → interested (${br2!.status})`)
const { data: items } = await sb.from('booking_request_items').select('room_id').eq('booking_request_id', leadId)
const distinctRooms = new Set((items ?? []).map((i) => i.room_id)).size
console.log(`  camere nella combinazione scelta: ${distinctRooms}`)
ok(distinctRooms >= 2, `items multi-camera persistiti (${distinctRooms} camere)`)

console.log('\n— Cleanup —')
for (const t of ['notifications', 'booking_request_events', 'booking_request_items']) await sb.from(t).delete().eq('booking_request_id', leadId)
await sb.from('notifications').delete().eq('conversation_id', conv)
await sb.from('messages').delete().eq('conversation_id', conv)
await sb.from('booking_requests').delete().eq('id', leadId)
await sb.from('conversations').delete().eq('id', conv)
console.log('  ✓ dati di test rimossi')
console.log(`\n════ ${pass} passati, ${fail} falliti ════`)
process.exit(fail > 0 ? 1 : 0)
