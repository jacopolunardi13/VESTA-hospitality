// Regressione classificatore: frasi temporali brevi → booking; negative invariate.
// Uso: node --env-file=.env.local --import tsx scripts/test-classify-temporal.mts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { classifyIntent } from '@/lib/ai/intent'
import type { PropertyContext } from '@/lib/ai/types'

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data: prop } = await sb.from('properties').select('id, org_id, name, settings, supervision_mode').eq('id', '00000000-0000-0000-0000-000000000011').single()
const property: PropertyContext = { id: prop!.id, orgId: prop!.org_id, name: prop!.name, settings: (prop!.settings ?? {}) as Record<string, unknown>, supervisionMode: prop!.supervision_mode }

let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }

const positives = ['domani', 'stasera', 'questo weekend', 'il prossimo weekend', 'oggi']
const negatives: [string, string][] = [
  ['a che ora è il check-in?', 'faq'],
  ['grazie mille', 'non-booking'],
]

console.log('— Frasi temporali brevi → attese BOOKING —')
for (const p of positives) {
  const r = await classifyIntent(sb, property, p, [])
  ok(r.intent === 'booking', `«${p}» → ${r.intent} (conf ${r.confidence})`)
}
console.log('\n— Negative (NON devono diventare booking) —')
for (const [msg, exp] of negatives) {
  const r = await classifyIntent(sb, property, msg, [])
  ok(r.intent !== 'booking', `«${msg}» → ${r.intent} (atteso ${exp}, non booking)`)
}
console.log(`\n════ ${pass} passati, ${fail} falliti ════`)
process.exit(fail > 0 ? 1 : 0)
