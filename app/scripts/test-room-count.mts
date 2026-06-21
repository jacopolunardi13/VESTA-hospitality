// Test room_count + merge deterministico + inferenza + combinatore esatto + e2e.
// Uso: node --env-file=.env.local --import tsx scripts/test-room-count.mts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { mergeSegments, inferRoomRequirement, type StayRequest } from '@/lib/ai/extract'
import { selectRoomCombinations, type CombinableRoom } from '@/lib/quote/roomCombinations'
import { runPipeline } from '@/lib/ai/pipeline'
import type { PropertyContext } from '@/lib/ai/types'

let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }
const seg = (room_type: string | null, ci: string | null, co: string | null, adults: number | null, room_count: number | null = 1): StayRequest =>
  ({ room_type, room_count, check_in: ci, check_out: co, adults, children: [] })

console.log('— Unit: mergeSegments —')
let m = mergeSegments([seg('doppia', '2026-08-01', '2026-08-03', 2), seg('doppia', '2026-08-01', '2026-08-03', 2), seg('doppia', '2026-08-01', '2026-08-03', 2)], 6)
ok(m.length === 1 && m[0].room_count === 3 && m[0].adults === 6, `"3 doppie" splittate → 1 segment room_count=3 adults=6 (${m[0].room_count}/${m[0].adults})`)
m = mergeSegments([seg(null, '2026-08-01', '2026-08-03', null), seg(null, '2026-08-01', '2026-08-03', null)], 5)
ok(m.length === 1 && m[0].room_count === 2 && m[0].adults === 5, `"2 camere per 5" vuote → 1 segment room_count=2 adults=5 (fallback flat)`)
m = mergeSegments([seg('tripla', '2026-09-02', null, 6, 2)], 6)
ok(m.length === 1 && m[0].check_out === '2026-09-03', `default 1 notte per-segment (check_out=${m[0].check_out})`)
m = mergeSegments([seg('matrimoniale', '2026-08-01', '2026-08-02', 2), seg('tripla', '2026-09-01', '2026-09-03', 3)], null)
ok(m.length === 2, 'soggiorni distinti (date/tipi diversi) → 2 segment (non fusi)')

console.log('\n— Unit: inferRoomRequirement —')
const s1 = seg(null, '2026-09-02', '2026-09-03', null); inferRoomRequirement('siamo 3 coppie il 2 settembre', s1)
ok(s1.room_count === 3 && s1.room_type === 'doppia' && s1.adults === 6, `"3 coppie" → room_count=3 doppia adults=6 (${s1.room_count}/${s1.room_type}/${s1.adults})`)
const s2 = seg(null, '2026-08-01', '2026-08-03', 5); inferRoomRequirement('2 camere per 5 persone', s2)
ok(s2.room_count === 2, `"2 camere per 5" → room_count=2 (${s2.room_count})`)

console.log('\n— Unit: combinatore esatto (maxRooms) —')
const R: CombinableRoom[] = [
  { roomId: '301', roomName: '301', maxGuests: 2, offerTotalCents: 19000 },
  { roomId: '302', roomName: '302', maxGuests: 2, offerTotalCents: 21500 },
  { roomId: '303', roomName: '303', maxGuests: 3, offerTotalCents: 28900 },
  { roomId: '304', roomName: '304', maxGuests: 2, offerTotalCents: 21500 },
  { roomId: '305', roomName: '305', maxGuests: 3, offerTotalCents: 28000 },
]
const ex2 = selectRoomCombinations(R, 5, { minRooms: 2, maxRooms: 2 })
ok(ex2.length > 0 && ex2.every((c) => c.rooms.length === 2), 'esattamente 2 camere che coprono 5')
const ex3 = selectRoomCombinations(R, 6, { minRooms: 3, maxRooms: 3 })
ok(ex3.length > 0 && ex3[0].rooms.length === 3, '3 coppie → esattamente 3 camere che coprono 6 (3 doppie)')

console.log('\n— E2E runPipeline —')
const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data: prop } = await sb.from('properties').select('id, org_id, name, settings, supervision_mode').eq('id', '00000000-0000-0000-0000-000000000011').single()
const property: PropertyContext = { id: prop!.id, orgId: prop!.org_id, name: prop!.name, settings: (prop!.settings ?? {}) as Record<string, unknown>, supervisionMode: prop!.supervision_mode }
const { data: rooms } = await sb.from('rooms').select('id').eq('property_id', property.id).is('deleted_at', null)
await sb.from('ical_feeds').update({ last_sync_at: new Date().toISOString() }).in('room_id', (rooms ?? []).map((r) => r.id)).eq('active', true)
const TODAY = '2026-06-21'
const run = (msg: string) => runPipeline({ sb, property, history: [], userMessage: msg, aiEnabled: true, todayIso: TODAY })

const c1 = await run('siamo 3 coppie il 2 settembre')
console.log(`  3 coppie → stage=${c1.stage}, opzioni=${c1.proposalCombinations?.length ?? 0}, camere A=${c1.proposalCombinations?.[0]?.roomNames.length ?? 0}`)
ok(c1.stage === 'proposal_sent' && (c1.proposalCombinations?.[0]?.roomNames.length ?? 0) === 3, '3 coppie → combinazione di 3 camere (non 2 triple)')
const c2 = await run('2 camere per 5 persone dal 1 al 3 agosto')
console.log(`  2 camere per 5 → stage=${c2.stage}, camere A=${c2.proposalCombinations?.[0]?.roomNames.length ?? 0}`)
ok(c2.stage === 'proposal_sent' && (c2.proposalCombinations?.[0]?.roomNames.length ?? 0) === 2, '2 camere per 5 → esattamente 2 camere')
const c3 = await run('3 doppie dal 1 al 3 agosto')
ok(c3.stage === 'proposal_sent' && !!c3.proposalCombinations, '3 doppie → gruppo (NON multi-richiesta)')
const c4 = await run('siamo in 7 dal 1 al 3 agosto')
ok(c4.stage === 'proposal_sent' && !!c4.proposalCombinations, 'siamo in 7 → combinazioni (minimize, no room_count)')

console.log('\n— Caso esplicito: "siamo 6 persone il 2 settembre" (no tipo, no n. camere, 1 data) —')
const c5 = await run('siamo 6 persone il 2 settembre')
console.log(`  stage=${c5.stage}, segments=${c5.slots?.segments.length}, check_out=${c5.slots?.check_out}, opzioni=${c5.proposalCombinations?.length ?? 0}`)
ok(c5.stage === 'proposal_sent', 'proposta diretta (no chiarimenti)')
ok((c5.slots?.segments.length ?? 0) === 1, 'singola richiesta (NON multi-richiesta)')
ok(c5.slots?.check_out === '2026-09-03', 'default 1 notte applicato (2→3 settembre)')
ok(!!c5.proposalCombinations && c5.proposalCombinations.length >= 1, 'propone combinazioni A/B direttamente')

console.log(`\n════ ${pass} passati, ${fail} falliti ════`)
process.exit(fail > 0 ? 1 : 0)
