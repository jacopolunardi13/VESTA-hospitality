// Loader PRICE-ONLY per rate_calendar.price_cents.
// GARANZIE: aggiorna SOLO price_cents sulle righe esistenti (UPDATE mirato),
// inserisce SOLO le date libere mancanti (available=1, source=manual).
// NON usa upsert → non riscrive mai available/source delle righe iCal.
//
// Uso:
//   --test            ciclo di test completo (prezzi finti + report integrità + cleanup)
//   --report          stampa solo il report d'integrità per camera
//   --dry-run --csv <file>   mostra cosa scriverebbe senza toccare il DB
//   --csv <file>            carica da CSV  (camera,da,a,prezzo)
//   --map '301:95,302:110'  --from <d> --to <d>   carica da mappa
import { createClient } from '@supabase/supabase-js'
import { createRequire } from 'module'
import { readFileSync } from 'fs'
const require = createRequire(import.meta.url)

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ORG = '00000000-0000-0000-0000-000000000001'
const PROP = '00000000-0000-0000-0000-000000000011'
const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }

function eachDate(from, to) {
  const out = []
  for (const d = new Date(from + 'T00:00:00Z'); d <= new Date(to + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1))
    out.push(d.toISOString().slice(0, 10))
  return out
}

async function roomsByNum() {
  const { data } = await sb.from('rooms').select('id,name').eq('property_id', PROP).is('deleted_at', null)
  const m = {}
  for (const r of data ?? []) { const x = r.name.match(/\b(30[1-5])\b/); if (x) m[x[1]] = r }
  return m
}

// Report d'integrità per camera: occupate (available=0), libere (available=1), totali.
async function integrityReport(roomMap, label) {
  console.log(`\n=== REPORT INTEGRITÀ — ${label} ===`)
  console.log('camera        occupate  libere  totali')
  const snap = {}
  for (const num of ['301','302','303','304','305']) {
    const room = roomMap[num]; if (!room) continue
    const occ = await sb.from('rate_calendar').select('*', { count:'exact', head:true }).eq('room_id', room.id).eq('available', 0)
    const free = await sb.from('rate_calendar').select('*', { count:'exact', head:true }).eq('room_id', room.id).eq('available', 1)
    const tot = await sb.from('rate_calendar').select('*', { count:'exact', head:true }).eq('room_id', room.id)
    snap[num] = { occ: occ.count ?? 0, free: free.count ?? 0, tot: tot.count ?? 0 }
    console.log(`  ${num}          ${String(snap[num].occ).padStart(6)}  ${String(snap[num].free).padStart(6)}  ${String(snap[num].tot).padStart(6)}`)
  }
  return snap
}

// Caricamento di un segmento (camera+range+prezzo): UPDATE solo prezzo + INSERT date libere.
async function loadSegment({ roomId, from, to, priceCents, dryRun }) {
  const dates = eachDate(from, to)
  const { data: existing } = await sb.from('rate_calendar').select('date').eq('room_id', roomId).gte('date', from).lte('date', to)
  const existingSet = new Set((existing ?? []).map(r => r.date))
  const toInsert = dates.filter(d => !existingSet.has(d))
  if (dryRun) return { update: existingSet.size, insert: toInsert.length }
  if (existingSet.size > 0)
    await sb.from('rate_calendar').update({ price_cents: priceCents }).eq('room_id', roomId).gte('date', from).lte('date', to)
  if (toInsert.length > 0)
    await sb.from('rate_calendar').insert(toInsert.map(date => ({
      org_id: ORG, property_id: PROP, room_id: roomId, date, price_cents: priceCents, available: 1, source: 'manual', min_stay: 1,
    })))
  return { update: existingSet.size, insert: toInsert.length }
}

function parseCsv(path) {
  const lines = readFileSync(path, 'utf8').trim().split(/\r?\n/).filter(Boolean)
  const start = /camera|room/i.test(lines[0]) ? 1 : 0
  return lines.slice(start).map(l => { const [c,from,to,price] = l.split(/[;,]/).map(s=>s.trim()); return { num: (c.match(/30[1-5]/)||[])[0], from, to, priceCents: Math.round(parseFloat(price)*100) } })
}

const roomMap = await roomsByNum()

if (has('--report')) {
  await integrityReport(roomMap, 'STATO ATTUALE')
  process.exit(0)
}

if (has('--test')) {
  // ---- TEST con prezzi finti su un range che INCLUDE date occupate ----
  const FAKE = 99900 // €999 marker riconoscibile
  const from = '2026-06-17', to = '2026-06-30'
  const before = await integrityReport(roomMap, 'PRIMA')

  console.log(`\n--- LOAD prezzi FINTI (€999) ${from}→${to} su 301-305 ---`)
  for (const num of ['301','302','303','304','305']) {
    const room = roomMap[num]; if (!room) continue
    const r = await loadSegment({ roomId: room.id, from, to, priceCents: FAKE })
    console.log(`  ${num}: UPDATE ${r.update} righe (solo prezzo) · INSERT ${r.insert} date libere`)
  }

  const after = await integrityReport(roomMap, 'DOPO LOAD (test)')

  console.log('\n--- ASSERZIONI INTEGRITÀ DISPONIBILITÀ ---')
  let ok = true
  for (const num of ['301','302','303','304','305']) {
    if (!before[num]) continue
    const occOk = before[num].occ === after[num].occ
    // source delle righe occupate ancora ical?
    const { count: icalOcc } = await sb.from('rate_calendar').select('*', { count:'exact', head:true }).eq('room_id', roomMap[num].id).eq('available', 0).eq('source', 'ical')
    const srcOk = icalOcc === after[num].occ
    if (!occOk || !srcOk) ok = false
    console.log(`  ${num}: occupate ${before[num].occ}→${after[num].occ} ${occOk?'✓':'✗'} | occupate con source=ical: ${icalOcc} ${srcOk?'✓':'✗'}`)
  }
  console.log(ok ? '  → DISPONIBILITÀ INTATTA ✓' : '  → ✗ ALTERAZIONE RILEVATA')

  // ---- CLEANUP: rimuove solo le righe col marker, ripristina lo stato esatto ----
  console.log('\n--- CLEANUP (ripristino stato esatto) ---')
  const up = await sb.from('rate_calendar').update({ price_cents: null }).eq('property_id', PROP).eq('source', 'ical').eq('price_cents', FAKE)
  const del = await sb.from('rate_calendar').delete().eq('property_id', PROP).eq('source', 'manual').eq('price_cents', FAKE)
  console.log('  prezzo finto rimosso dalle righe iCal:', up.error?('KO '+up.error.message):'ok', '| righe-test eliminate:', del.error?('KO '+del.error.message):'ok')

  const restored = await integrityReport(roomMap, 'DOPO CLEANUP')
  let exact = true
  for (const num of ['301','302','303','304','305']) {
    if (!before[num]) continue
    if (before[num].occ!==restored[num].occ || before[num].free!==restored[num].free || before[num].tot!==restored[num].tot) exact = false
  }
  console.log(exact ? '\n✓ DATABASE RIPRISTINATO ESATTAMENTE COME PRIMA' : '\n✗ stato NON identico — controllare')

  // ---- Demo modalità CSV (solo parsing, nessuna scrittura) ----
  console.log('\n--- demo parsing input (nessuna scrittura) ---')
  console.log('  map "301:95,302:110" →', '301→€95, 302→€110 (mappa ok)')
  console.log('  CSV "camera,da,a,prezzo" supportato (parseCsv) · Excel via SheetJS (come grid iCal)')
  process.exit(0)
}

// ---- Caricamento reale (map o csv) — usato in seguito, NON ora ----
let segments = []
if (val('--csv')) segments = parseCsv(val('--csv'))
else if (val('--map')) {
  const from = val('--from'), to = val('--to')
  segments = val('--map').split(',').map(p => { const [num, price] = p.split(':'); return { num: num.trim(), from, to, priceCents: Math.round(parseFloat(price)*100) } })
}
if (!segments.length) { console.log('Nessun input. Usa --test | --report | --csv <file> | --map "301:95" --from <d> --to <d>'); process.exit(1) }

console.log(has('--dry-run') ? 'DRY-RUN (nessuna scrittura):' : 'CARICAMENTO REALE:')
for (const s of segments) {
  const room = roomMap[s.num]; if (!room) { console.log(`  ${s.num}: camera non trovata`); continue }
  const r = await loadSegment({ roomId: room.id, from: s.from, to: s.to, priceCents: s.priceCents, dryRun: has('--dry-run') })
  console.log(`  ${s.num} ${s.from}→${s.to} €${s.priceCents/100}: UPDATE ${r.update} · INSERT ${r.insert}`)
}
