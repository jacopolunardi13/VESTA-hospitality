// Audit READ-ONLY dell'estrazione su casi base. Chiama la vera extractSlots.
// Uso: node --env-file=.env.local --import tsx scripts/audit-extract.mts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { extractSlots, slotsComplete, type ExtractedSlots } from '@/lib/ai/extract'
import type { PropertyContext } from '@/lib/ai/types'

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data: prop } = await sb.from('properties').select('id, org_id, name, settings, supervision_mode').eq('id', '00000000-0000-0000-0000-000000000011').single()
const property: PropertyContext = { id: prop!.id, orgId: prop!.org_id, name: prop!.name, settings: (prop!.settings ?? {}) as Record<string, unknown>, supervisionMode: prop!.supervision_mode }

const TODAY = '2026-06-21'

// Replica della missingAsk attuale (pipeline.ts) per mostrare cosa direbbe oggi.
function missingAsk(s: ExtractedSlots): string {
  const missing: string[] = []
  if (!s.check_in || !s.check_out) missing.push('le **date** di arrivo e partenza')
  if (!s.adults) missing.push('**quante persone**')
  return missing.length ? `→ chiede: ${missing.join(' e ')}` : '→ (slot completi)'
}

const cases = [
  '1 agosto 2 persone',
  '1 agosto',
  'dal 1 al 3 agosto',
  '1-3 agosto',
  'domani',
  'questo weekend',
  '2 adulti e un bambino',
  'siamo in 4',
]

console.log(`Data odierna simulata: ${TODAY}\n`)
for (const msg of cases) {
  const s = await extractSlots(sb, property, msg, [], TODAY)
  const ready = slotsComplete(s)
  console.log(`«${msg}»`)
  console.log(`   check_in=${s.check_in}  check_out=${s.check_out}  adults=${s.adults}  children=${JSON.stringify(s.children)}  lang=${s.language}`)
  console.log(`   slotsComplete=${ready}  ${ready ? '→ PREVENTIVO' : missingAsk(s)}`)
  console.log('')
}
process.exit(0)
