// Test fix matrimoniale↔matrimonio: unit (isStandardBooking) + e2e (runPipeline).
// Uso: node --env-file=.env.local --import tsx scripts/test-matrimoniale.mts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { isStandardBooking, runPipeline } from '@/lib/ai/pipeline'
import type { ExtractedSlots } from '@/lib/ai/extract'
import type { PropertyContext } from '@/lib/ai/types'

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data: prop } = await sb.from('properties').select('id, org_id, name, settings, supervision_mode').eq('id', '00000000-0000-0000-0000-000000000011').single()
const property: PropertyContext = { id: prop!.id, orgId: prop!.org_id, name: prop!.name, settings: (prop!.settings ?? {}) as Record<string, unknown>, supervisionMode: prop!.supervision_mode }

let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }
const slots = (): ExtractedSlots => ({ check_in: null, check_out: null, adults: 2, children: [], language: 'it', guest_name: null, guest_contact: null, special_requests: null, segments: [] })
const std = (msg: string) => isStandardBooking(slots(), msg, property.settings)

console.log('— STANDARD = true (camera matrimoniale → booking normale) —')
for (const m of [
  'Vorrei una camera matrimoniale',
  'Una matrimoniale per 2 persone il 1 agosto',
  'Avete una matrimoniale?',
  'camere matrimoniali?',
  'Vorrei una camera matrimoniale per il 1 agosto',
  'Avete camere matrimoniali disponibili?',
  'Siamo una coppia, cerchiamo una matrimoniale',
]) ok(std(m) === true, `«${m}» → standard`)

console.log('\n— STANDARD = false (evento → staff, invariato) —')
for (const m of ['Vorremmo organizzare il nostro matrimonio', 'ricevimento di matrimonio', 'evento matrimonio', 'festa di nozze', 'una cerimonia']) ok(std(m) === false, `«${m}» → non-standard`)

console.log('\n— Altri non-standard ancora attivi (no regressione) —')
for (const m of ['potete farmi uno sconto?', 'siamo un gruppo di 12', 'vorrei cancellare la prenotazione']) ok(std(m) === false, `«${m}» → non-standard`)

console.log('\n— E2E runPipeline (motore chat+email) —')
const { data: rooms } = await sb.from('rooms').select('id').eq('property_id', property.id).is('deleted_at', null)
await sb.from('ical_feeds').update({ last_sync_at: new Date().toISOString() }).in('room_id', (rooms ?? []).map((r) => r.id)).eq('active', true)
const TODAY = '2026-06-21'
const r1 = await runPipeline({ sb, property, history: [], userMessage: 'Vorrei una matrimoniale il 1 agosto per 2 persone', aiEnabled: true, todayIso: TODAY })
console.log(`  matrimoniale → stage=${r1.stage}, camere=${r1.proposalRooms?.length ?? 0}`)
ok(r1.stage === 'proposal_sent', '«matrimoniale 1 ago, 2 persone» → preventivo (proposal_sent)')
const r2 = await runPipeline({ sb, property, history: [], userMessage: 'Organizziamo un matrimonio il 1 agosto per 2 persone, avete disponibilità?', aiEnabled: true, todayIso: TODAY })
console.log(`  matrimonio → stage=${r2.stage}`)
ok(r2.stage !== 'proposal_sent', '«matrimonio…» → NON auto-preventivo (staff/cortesia)')

console.log(`\n════ ${pass} passati, ${fail} falliti ════`)
process.exit(fail > 0 ? 1 : 0)
