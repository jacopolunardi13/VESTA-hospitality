// ============================================================================
// Go-Live Automation — matrice GO / NO-GO (Vesta Autonomous Engineering, F3)
// ============================================================================
// Esegue in AUTONOMIA tutto ciò che NON richiede segreti né scritture, e stampa
// una matrice con evidenze mappata sui P0 del Go-Live Security Assessment.
// I controlli che richiedono catalogo/cron o segreti prod (apply migrazioni,
// pg_net, rotazione) sono elencati come GATE UMANI (non li può chiudere da solo).
//
// Uso (da app/):  node --env-file=.env.local --import tsx scripts/go-live-check.mts
//   opzionale:    E2E_BASE=https://<deploy> per i check HTTP (default prod pubblico)
//
// Non stampa segreti. Solo esiti/status/nomi (mai valori).
// ============================================================================
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BASE = process.env.E2E_BASE ?? 'https://vesta-hospitality.vercel.app'

type Row = { id: string; area: string; check: string; status: 'PASS' | 'FAIL' | 'GATE' | 'WARN'; evidence: string }
const rows: Row[] = []
const add = (id: string, area: string, check: string, status: Row['status'], evidence: string) =>
  rows.push({ id, area, check, status, evidence })

const anon = createClient(URL, ANON)

// --- 1. RLS live: con anon, le tabelle core devono restituire 0 righe --------
const CORE = ['properties', 'booking_requests', 'conversations', 'org_members', 'messages', 'notifications']
try {
  const leaked: string[] = []
  for (const t of CORE) {
    const { count, error } = await anon.from(t).select('id', { count: 'exact', head: true })
    if (!error && (count ?? 0) > 0) leaked.push(`${t}=${count}`)
  }
  if (leaked.length === 0) add('RLS', 'Dati', 'anon → 0 righe su tabelle core', 'PASS', `${CORE.length} tabelle, nessuna riga visibile`)
  else add('RLS', 'Dati', 'anon → 0 righe su tabelle core', 'FAIL', `RLS PERMEABILE: ${leaked.join(', ')}`)
} catch (e) {
  add('RLS', 'Dati', 'anon → 0 righe su tabelle core', 'WARN', `errore: ${e instanceof Error ? e.message : String(e)}`)
}

// --- 2. P0-2: anon NON può invocare le RPC pericolose ------------------------
async function anonRpcDenied(fn: string, body: object): Promise<boolean> {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: ANON, authorization: `Bearer ${ANON}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const txt = await r.text()
  return r.status === 401 || r.status === 403 || txt.includes('42501') || txt.toLowerCase().includes('permission denied') || r.status === 404
}
try {
  const enroll = await anonRpcDenied('enroll_user_in_org', { p_org_id: '00000000-0000-4000-8000-000000000000', p_user_id: '00000000-0000-4000-8000-000000000001', p_role: 'owner' })
  const trans = await anonRpcDenied('transition_booking_request', { p_request_id: '00000000-0000-4000-8000-000000000000', p_org_id: '00000000-0000-4000-8000-000000000001', p_to_status: 'cancelled', p_actor: 'guest' })
  add('P0-2', 'RPC', 'anon negato su enroll/transition', enroll && trans ? 'PASS' : 'FAIL',
    `enroll=${enroll ? 'negato' : 'ESEGUE⚠️'} · transition=${trans ? 'negato' : 'ESEGUE⚠️'}`)
} catch (e) {
  add('P0-2', 'RPC', 'anon negato su enroll/transition', 'WARN', `errore: ${e instanceof Error ? e.message : String(e)}`)
}

// --- 3. P0-4: security header sul widget pubblico ---------------------------
try {
  const r = await fetch(BASE, { redirect: 'manual' })
  const h = r.headers
  const csp = h.get('content-security-policy') ?? ''
  const checks = {
    'X-Frame-Options|CSP frame-ancestors': Boolean(h.get('x-frame-options')) || /frame-ancestors/i.test(csp),
    'X-Content-Type-Options: nosniff': (h.get('x-content-type-options') ?? '').toLowerCase() === 'nosniff',
    'Strict-Transport-Security': Boolean(h.get('strict-transport-security')),
  }
  const missing = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k)
  add('P0-4', 'Header', 'security header presenti', missing.length ? 'FAIL' : 'PASS',
    missing.length ? `mancanti: ${missing.join(' · ')}` : 'clickjacking/nosniff/HSTS coperti')
} catch (e) {
  add('P0-4', 'Header', 'security header presenti', 'WARN', `${BASE} non raggiungibile: ${e instanceof Error ? e.message : String(e)}`)
}

// --- 4. Migrazioni: le RPC attese sono esposte (proxy di "applicata") --------
try {
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY ? createClient(URL, SERVICE) : anon
  const r = await fetch(`${URL}/rest/v1/`, { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } })
  const spec = await r.json() as { paths?: Record<string, unknown> }
  const rpcs = Object.keys(spec.paths ?? {}).filter(p => p.startsWith('/rpc/')).map(p => p.replace('/rpc/', ''))
  const want = ['user_in_org', 'transition_booking_request', 'enroll_user_in_org']
  const missing = want.filter(w => !rpcs.includes(w))
  add('MIG', 'DB', 'RPC core esposte (proxy migrazioni)', missing.length ? 'WARN' : 'PASS',
    missing.length ? `assenti: ${missing.join(', ')}` : `${rpcs.length} RPC esposte`)
  void svc
} catch (e) {
  add('MIG', 'DB', 'RPC core esposte', 'WARN', `errore: ${e instanceof Error ? e.message : String(e)}`)
}

// --- 5. Canale email: freschezza del routing (proxy, non definitivo) ---------
try {
  const svc = createClient(URL, SERVICE)
  const { data } = await svc.from('email_routing_log').select('decided_at').order('decided_at', { ascending: false }).limit(1)
  const last = data?.[0]?.decided_at
  const ageH = last ? (Date.now() - new Date(last).getTime()) / 3.6e6 : Infinity
  add('EMAIL', 'Canale', 'poll email attivo (freschezza routing)', ageH < 6 ? 'PASS' : 'WARN',
    last ? `ultima instradata ${ageH.toFixed(1)}h fa (definitivo: pg_net/diag)` : 'nessun routing (definitivo: pg_net/diag)')
} catch (e) {
  add('EMAIL', 'Canale', 'poll email attivo', 'WARN', `errore: ${e instanceof Error ? e.message : String(e)}`)
}

// --- GATE UMANI (non verificabili in autonomia senza MCP read-only/segreti) --
add('P0-1', 'Segreti', 'rotazione segreti esposti', 'GATE', 'PO: verifica rotazione (SECURITY §segreti) + verify-rotation.mts')
add('MIG*', 'DB', 'migrazioni applicate (to_regclass/to_regprocedure)', 'GATE', 'SQL Editor o MCP read-only')
add('CRON', 'Cron', 'job pg_cron sani (status HTTP reale)', 'GATE', 'net._http_response in SQL Editor / MCP read-only')
add('P0-3', 'Chat', 'anti-abuso (XFF/IP/cap globale)', 'GATE', 'verifica runtime dedicata (P0-3 aperto)')
add('P0-5', 'Email', 'destinatario ancorato all\'identità di trasporto', 'GATE', 'review codice deliverToGuest (P0-5 aperto)')
add('AUTOSEND', 'Pilota', 'email_autosend_enabled = OFF', 'GATE', 'properties.settings (policy R0.1)')

// --- Stampa matrice + verdetto ---------------------------------------------
const icon = { PASS: '✅', FAIL: '❌', GATE: '🔴', WARN: '⚠️' }
console.log('\n════════════ GO-LIVE CHECK · Vesta ════════════')
console.log(`base HTTP: ${BASE}\n`)
for (const r of rows) console.log(`${icon[r.status]} [${r.id.padEnd(8)}] ${r.check.padEnd(42)} — ${r.evidence}`)

const fails = rows.filter(r => r.status === 'FAIL')
const gates = rows.filter(r => r.status === 'GATE')
console.log('\n' + '─'.repeat(60))
if (fails.length) {
  console.log(`❌ NO-GO · ${fails.length} controllo/i FALLITO/I (bloccanti):`)
  for (const f of fails) console.log(`   - [${f.id}] ${f.check}: ${f.evidence}`)
} else {
  console.log('✅ Nessun controllo automatico FALLITO.')
}
console.log(`🔴 ${gates.length} GATE umani da confermare prima del GO (vedi docs/RUNBOOKS/go-live.md).`)
console.log('\nVerdetto: ' + (fails.length ? 'NO-GO (fix bloccanti)' : `subordinato ai ${gates.length} gate umani`))
process.exit(fails.length ? 1 : 0)
