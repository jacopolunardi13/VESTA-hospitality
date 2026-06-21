// Test bambini e culle: unit (childrenNeedingBed, isStandardBooking) + e2e (runPipeline).
// Uso: node --env-file=.env.local --import tsx scripts/test-bambini-culle.mts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { isStandardBooking, childrenNeedingBed, runPipeline } from '@/lib/ai/pipeline'
import type { ExtractedSlots } from '@/lib/ai/extract'
import type { PropertyContext } from '@/lib/ai/types'

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data: prop } = await sb.from('properties').select('id, org_id, name, settings, supervision_mode').eq('id', '00000000-0000-0000-0000-000000000011').single()
const property: PropertyContext = { id: prop!.id, orgId: prop!.org_id, name: prop!.name, settings: (prop!.settings ?? {}) as Record<string, unknown>, supervisionMode: prop!.supervision_mode }

let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }
const slots = (children: { age: number | null }[]): ExtractedSlots => ({ check_in: null, check_out: null, adults: 2, children, language: 'it', guest_name: null, guest_contact: null, special_requests: null, segments: [] })

console.log('— Unit: childrenNeedingBed (0-2 non conta, >2 = letto) —')
ok(childrenNeedingBed([{ age: 1 }]) === 0, 'bimbo 1 anno → 0 letti (culla)')
ok(childrenNeedingBed([{ age: 6 }]) === 1, 'bimbo 6 anni → 1 letto')
ok(childrenNeedingBed([{ age: 1 }, { age: 6 }]) === 1, 'bimbi 1 e 6 → 1 letto')
ok(childrenNeedingBed([{ age: null }]) === 0, 'età null → 0 (gestito a monte)')

console.log('\n— Unit: isStandardBooking (culla per >2 → staff; default >2 = terzo ospite) —')
ok(isStandardBooking(slots([{ age: 6 }]), '2 adulti e un bambino di 6 anni', property.settings) === true, 'bimbo 6 senza culla → standard (terzo ospite)')
ok(isStandardBooking(slots([{ age: 6 }]), 'un bambino di 6 anni, vorremmo una culla', property.settings) === false, 'bimbo 6 + culla → non-standard/staff')
ok(isStandardBooking(slots([{ age: 1 }]), 'un bambino di 1 anno con culla', property.settings) === true, 'bimbo 1 + culla → standard (culla, non letto)')

console.log('\n— E2E runPipeline —')
const { data: rooms } = await sb.from('rooms').select('id').eq('property_id', property.id).is('deleted_at', null)
await sb.from('ical_feeds').update({ last_sync_at: new Date().toISOString() }).in('room_id', (rooms ?? []).map((r) => r.id)).eq('active', true)
const T = '2026-06-21'
const run = (m: string) => runPipeline({ sb, property, history: [], userMessage: m, aiEnabled: true, todayIso: T })

const a = await run('2 adulti e un bambino di 1 anno dal 1 al 3 agosto')
console.log(`  bimbo 1 anno → stage=${a.stage}, camere=${a.proposalRooms?.length ?? 0}, culla nel testo=${/culla/i.test(a.text)}`)
ok(a.stage === 'proposal_sent' && (a.proposalRooms?.length ?? 0) === 5, 'neonato → TUTTE le 5 camere (non solo Superior)')
ok(/culla/i.test(a.text), 'nota culla presente')

const b = await run('2 adulti e un bambino di 6 anni dal 1 al 3 agosto')
console.log(`  bimbo 6 anni → stage=${b.stage}, camere=${b.proposalRooms?.length ?? 0}`)
ok(b.stage === 'proposal_sent' && (b.proposalRooms?.length ?? 0) === 2, 'bimbo 6 → solo Superior (2 camere)')
ok(/Superior|terzo letto/i.test(b.text), 'nota terzo letto/Superior presente')

const c = await run('2 adulti e un bambino dal 1 al 3 agosto')
console.log(`  bimbo senza età → stage=${c.stage}`)
ok(c.stage === 'collecting_data' && /et[àa]/i.test(c.text), 'età mancante → chiede l\'età, nessun preventivo')

const d = await run('2 adulti e un bambino di 6 anni dal 1 al 3 agosto, vorremmo usare una culla')
console.log(`  bimbo 6 + culla → stage=${d.stage}`)
ok(d.stage !== 'proposal_sent', 'bimbo 6 + culla → nota/staff (no auto-preventivo)')

console.log(`\n════ ${pass} passati, ${fail} falliti ════`)
process.exit(fail > 0 ? 1 : 0)
