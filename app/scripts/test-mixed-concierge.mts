// Parte 1 — richiesta MISTA (prenotazione + domanda concierge nello STESSO messaggio).
// Verifica: i casi misti contengono SIA il preventivo SIA il blocco concierge; i casi
// puri (solo booking / solo faq) NON ottengono un doppio blocco. READ ONLY.
// Uso: node --env-file=.env.local --import tsx scripts/test-mixed-concierge.mts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { runPipeline } from '@/lib/ai/pipeline'
import type { PropertyContext } from '@/lib/ai/types'

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data: prop } = await sb.from('properties').select('id, org_id, name, settings, supervision_mode').eq('id', '00000000-0000-0000-0000-000000000011').single()
const property: PropertyContext = { id: prop!.id, orgId: prop!.org_id, name: prop!.name, settings: (prop!.settings ?? {}) as Record<string, unknown>, supervisionMode: prop!.supervision_mode }
const { data: rooms } = await sb.from('rooms').select('id').eq('property_id', property.id).is('deleted_at', null)
await sb.from('ical_feeds').update({ last_sync_at: new Date().toISOString() }).in('room_id', (rooms ?? []).map((r) => r.id)).eq('active', true)
const TODAY = '2026-06-22'
const run = (msg: string) => runPipeline({ sb, property, history: [], userMessage: msg, aiEnabled: true, todayIso: TODAY })

const INTROS = ['— Sulla sua domanda —', '— About your question —', '— Sobre su pregunta —', '— Concernant votre question —', '— Zu Ihrer Frage —']
const hasConcierge = (t: string) => INTROS.some((i) => t.includes(i))
const hasProposal = (r: Awaited<ReturnType<typeof run>>) => !!r.proposalRooms || !!r.proposalCombinations

let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }

console.log('— MISTE: devono contenere preventivo + blocco concierge —')
const g1 = await run("avete posto il 1 agosto per 2? e dov'è il ristorante Boccaponci?")
ok(hasProposal(g1) && hasConcierge(g1.text), `G1 booking+Boccaponci → preventivo + blocco concierge (prop=${hasProposal(g1)}, conc=${hasConcierge(g1.text)})`)
const g2 = await run("preventivo dal 1 al 3 agosto per 2 e c'è il parcheggio?")
ok(hasProposal(g2) && hasConcierge(g2.text), `G2 booking+parcheggio → preventivo + blocco concierge (prop=${hasProposal(g2)}, conc=${hasConcierge(g2.text)})`)
const g3 = await run('2 persone 1 agosto, posso entrare in auto in ZTL?')
ok(hasProposal(g3) && hasConcierge(g3.text), `G3 booking+ZTL → preventivo + blocco concierge (prop=${hasProposal(g3)}, conc=${hasConcierge(g3.text)})`)
const h1 = await run('availability Aug 1 for 2 guests, and where can I park?')
ok(hasProposal(h1) && h1.text.includes('— About your question —'), `H1 EN booking+park → preventivo + blocco concierge IN INGLESE (conc=${h1.text.includes('— About your question —')})`)

console.log('\n— Notifica staff: KB risponde → no flag; KB non sa → flag —')
ok(g1.conciergeUnanswered === true, `G1 Boccaponci (non in KB) → conciergeUnanswered=true (${g1.conciergeUnanswered})`)
ok(g2.conciergeUnanswered !== true, `G2 parcheggio (in KB) → nessun flag (${g2.conciergeUnanswered})`)
ok(g3.conciergeUnanswered !== true, `G3 ZTL (in KB) → nessun flag (${g3.conciergeUnanswered})`)

console.log('\n— PURI: NON devono avere blocco concierge —')
const b = await run('1 agosto, 2 persone')
ok(hasProposal(b) && !hasConcierge(b.text) && b.conciergeUnanswered !== true, `solo booking → preventivo SENZA blocco concierge né flag (conc=${hasConcierge(b.text)})`)
const f = await run("c'è il parcheggio?")
ok(f.intent === 'faq' && !hasConcierge(f.text), `solo FAQ → ramo faq, nessun doppio blocco (intent=${f.intent})`)

console.log('\n──── Esempio reale (G1) ────')
console.log(g1.text)

console.log(`\n════ ${pass} passati, ${fail} falliti ════`)
process.exit(fail > 0 ? 1 : 0)
