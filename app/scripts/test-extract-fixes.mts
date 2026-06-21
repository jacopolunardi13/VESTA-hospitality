// Test Priority 0 sui casi base, attraverso runPipeline (il motore usato da chat+email).
// Uso: node --env-file=.env.local --import tsx scripts/test-extract-fixes.mts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { runPipeline } from '@/lib/ai/pipeline'
import type { PropertyContext } from '@/lib/ai/types'

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data: prop } = await sb.from('properties').select('id, org_id, name, settings, supervision_mode').eq('id', '00000000-0000-0000-0000-000000000011').single()
const property: PropertyContext = { id: prop!.id, orgId: prop!.org_id, name: prop!.name, settings: (prop!.settings ?? {}) as Record<string, unknown>, supervisionMode: prop!.supervision_mode }

// Feed iCal freschi (disponibilità verificata per i preventivi).
const { data: rooms } = await sb.from('rooms').select('id').eq('property_id', property.id).is('deleted_at', null)
await sb.from('ical_feeds').update({ last_sync_at: new Date().toISOString() }).in('room_id', (rooms ?? []).map((r) => r.id)).eq('active', true)

const TODAY = '2026-06-21'
const cases = ['1 agosto 2 persone', '1 agosto', 'domani', 'dal 1 al 3 agosto', '2 adulti e un bambino']

for (const msg of cases) {
  const r = await runPipeline({ sb, property, history: [], userMessage: msg, aiEnabled: true, todayIso: TODAY })
  const s = r.slots
  console.log('════════════════════════════════════════')
  console.log(`«${msg}»`)
  if (s) console.log(`  slots: check_in=${s.check_in} check_out=${s.check_out} adults=${s.adults} children=${JSON.stringify(s.children)}`)
  console.log(`  stage: ${r.stage}  | camere proposte: ${r.proposalRooms?.length ?? 0}`)
  console.log(`  risposta: ${JSON.stringify((r.text || '').slice(0, 240))}`)
  console.log('')
}
process.exit(0)
