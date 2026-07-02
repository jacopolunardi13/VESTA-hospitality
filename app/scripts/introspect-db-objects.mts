// Introspezione READ-ONLY dello stato reale del DB via OpenAPI di PostgREST.
// NON esegue funzioni, non scrive. Elenca RPC e tabelle realmente esposte,
// così da confrontarle con ciò che le migrazioni del repo presuppongono.
// Uso (da app/):  node --env-file=.env.local --import tsx scripts/introspect-db-objects.mts
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!   // service_role: vede tutto lo schema esposto

const r = await fetch(`${URL}/rest/v1/`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } })
const spec = await r.json() as any

const paths = Object.keys(spec.paths ?? {})
const rpcs = paths.filter(p => p.startsWith('/rpc/')).map(p => p.replace('/rpc/', '')).sort()
const tables = paths.filter(p => !p.startsWith('/rpc/') && p !== '/').map(p => p.replace('/', '')).sort()

console.log(`OpenAPI title: ${spec.info?.title ?? '?'}  ·  version: ${spec.info?.version ?? '?'}`)
console.log(`\n── RPC esposte (${rpcs.length}) ──`)
for (const f of rpcs) {
  // prova a estrarre i parametri dalla definition del body (se presente)
  const def = spec.definitions?.[`(rpc) ${f}`] ?? spec.definitions?.[f]
  const params = def?.properties ? Object.keys(def.properties).join(', ') : ''
  console.log(`  ${f}${params ? `  (${params})` : ''}`)
}

const WATCH = ['enroll_user_in_org','transition_booking_request','process_payment_expiry',
               'process_operational_deadlines','process_due_followups','user_in_org','search_knowledge']
console.log('\n── Funzioni attese dalla migrazione 0015 / core ──')
for (const w of WATCH) console.log(`  ${rpcs.includes(w) ? '✅ presente' : '❌ ASSENTE'}  ${w}`)

console.log(`\n── Tabelle esposte (${tables.length}) ──`)
console.log('  ' + tables.join(', '))

// --- Firme reali delle RPC bersaglio (dai parametri OpenAPI) -----------------
console.log('\n── FIRME reali (parametri dal body OpenAPI) ──')
for (const f of ['enroll_user_in_org','transition_booking_request','process_payment_expiry','process_operational_deadlines']) {
  const post = spec.paths?.[`/rpc/${f}`]?.post
  // PostgREST: i parametri sono in post.parameters con schema, oppure referenziano definitions.
  let names: string[] = []
  for (const p of (post?.parameters ?? [])) {
    if (p.name && p.name !== 'args' && p.in !== 'header') names.push(p.name)
    if (p.schema?.$ref) {
      const key = p.schema.$ref.split('/').pop()
      const def = spec.definitions?.[key]
      if (def?.properties) names.push(...Object.keys(def.properties))
    }
    if (p.schema?.properties) names.push(...Object.keys(p.schema.properties))
  }
  console.log(`  ${f}(${[...new Set(names)].join(', ') || '— nessun parametro trovato in OpenAPI —'})`)
}
console.log('\n(Nota: OpenAPI non distingue i tipi con precisione; per la firma esatta serve pg_proc via SQL Editor.)')
