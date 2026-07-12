// ============================================================================
// P0-2 · PROVA LIVE dell'autorizzazione RPC SECURITY DEFINER  —  SAFE, READ-mostly.
// ============================================================================
// Obiettivo: verificare in modo deterministico, come farebbe un attaccante con la
//   sola chiave ANON pubblica, se:
//     (a) il signup è aperto o chiuso;
//     (b) le RPC SECURITY DEFINER sono realmente EXECUTE-abili da anon.
//   NON esegue alcuna scrittura reale: usa UUID FALSI → le FK (org_id→organizations,
//   user_id→auth.users) bloccano ogni insert; transition_booking_request su id
//   inesistenti ritorna {ok:false,error:not_found} senza toccare nulla.
//   NON invoca le process_* (avrebbero effetti globali) — solo lettura del grant.
//
// Uso (da app/):  node --env-file=.env.local --import tsx scripts/probe-rpc-authz.mts
// ============================================================================
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!   // chiave PUBBLICA (ship nel browser)
const FAKE_A = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const FAKE_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const h = { apikey: ANON, authorization: `Bearer ${ANON}`, 'content-type': 'application/json' }

// Stato DESIDERATO dopo 0015: anon NON deve poter invocare le RPC pericolose.
// deniedToAnon(true) = PASS (post-migrazione) · false = ⚠️ ancora sfruttabile (baseline pre-0015).
let anonDenials = 0, anonChecks = 0
function classifyRpc(status: number, body: string): { denied: boolean; label: string } {
  anonChecks++
  if (status === 404 || body.includes('PGRST202')) { anonDenials++; return { denied: true, label: 'NON esposta ad anon (404/PGRST202) ✅' } }
  if (status === 401 || status === 403 || body.includes('42501') || body.toLowerCase().includes('permission denied')) {
    anonDenials++; return { denied: true, label: 'EXECUTE NEGATO ad anon (permission denied) ✅ PASS' }
  }
  return { denied: false, label: 'EXECUTE CONCESSO ad anon ⚠️ FAIL (eseguita: vulnerabile / pre-0015)' }
}

// --- 1. Stato signup (GoTrue settings, read-only, zero side effects) --------
try {
  const r = await fetch(`${URL}/auth/v1/settings`, { headers: { apikey: ANON } })
  const j = await r.json() as Record<string, unknown>
  console.log('── 1. SIGNUP ─────────────────────────────────────────────')
  console.log(`   disable_signup : ${JSON.stringify(j.disable_signup)}  → ${j.disable_signup === true ? 'CHIUSO' : 'APERTO ⚠️'}`)
  console.log(`   mailer_autoconfirm: ${JSON.stringify(j.mailer_autoconfirm)}`)
  const ext = (j.external ?? {}) as Record<string, unknown>
  console.log(`   external.email : ${JSON.stringify(ext.email)}  (provider email/password)`)
} catch (e) {
  console.log('   signup probe error:', e instanceof Error ? e.message : String(e))
}

// --- 2. enroll_user_in_org — la primitiva di TAKEOVER -----------------------
try {
  const r = await fetch(`${URL}/rest/v1/rpc/enroll_user_in_org`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ p_org_id: FAKE_A, p_user_id: FAKE_B, p_role: 'owner' }),
  })
  const body = await r.text()
  const fk = body.includes('23503') || body.toLowerCase().includes('foreign key')
  const c = classifyRpc(r.status, body)
  console.log('\n── 2. enroll_user_in_org (takeover) ──────────────────────')
  console.log(`   HTTP ${r.status} · ${c.label}`)
  console.log(`   FK violation su id falsi: ${fk ? 'SÌ (eseguita, insert bloccato dalla FK → SAFE)' : 'no'}`)
  console.log(`   raw: ${body.slice(0, 180)}`)
} catch (e) {
  console.log('   enroll probe error:', e instanceof Error ? e.message : String(e))
}

// --- 3. transition_booking_request — cross-tenant write primitive -----------
try {
  const r = await fetch(`${URL}/rest/v1/rpc/transition_booking_request`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ p_request_id: FAKE_A, p_org_id: FAKE_B, p_to_status: 'cancelled', p_actor: 'guest' }),
  })
  const body = await r.text()
  const notFound = body.includes('not_found')
  const c = classifyRpc(r.status, body)
  console.log('\n── 3. transition_booking_request (cross-tenant write) ────')
  console.log(`   HTTP ${r.status} · ${c.label}`)
  console.log(`   ritorno not_found su org_id arbitrario: ${notFound ? 'SÌ (eseguita, accetta p_org_id qualsiasi → nessun controllo identità)' : 'no'}`)
  console.log(`   raw: ${body.slice(0, 180)}`)
} catch (e) {
  console.log('   transition probe error:', e instanceof Error ? e.message : String(e))
}

// --- 4. read-only grant hint per le process_* (NON invocate) ----------------
console.log('\n── 4. process_* (deadlines) ──────────────────────────────')
console.log('   NON invocate (effetti globali). Grant scritto in 0014 = authenticated+service_role;')
console.log('   grant anon EREDITATO da 0004 (ALTER DEFAULT PRIVILEGES). Conferma live via SQL Editor:')
console.log("   SELECT proname, proacl FROM pg_proc WHERE proname IN")
console.log("     ('enroll_user_in_org','transition_booking_request','process_payment_expiry','process_operational_deadlines');")
console.log('\nLegenda proacl: "=X/owner" = PUBLIC execute · "anon=X/…" = anon execute · "authenticated=X/…" = authenticated execute')

// --- Verdetto anon-side (le due RPC pericolose invocabili senza JWT) ---------
console.log('\n' + '─'.repeat(64))
if (anonDenials === anonChecks) {
  console.log(`✅ PASS · anon negato su ${anonChecks}/${anonChecks} RPC pericolose (atteso DOPO 0015).`)
} else {
  console.log(`⚠️  FAIL · anon può ancora invocare ${anonChecks - anonDenials}/${anonChecks} RPC (baseline PRE-0015 o migrazione non applicata).`)
  process.exit(1)
}
console.log('   (Contesto authenticated + service_role: vedi scripts/p0-2-authz-tests.sql nel SQL Editor.)')
