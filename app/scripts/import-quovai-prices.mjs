// Importer QuoVai "Dettaglio listino" → CSV per il loader price-only validato.
// Estrae SOLO la tariffa NR BB (match esatto "{camera} NR BB"), mappa per HEADER
// (non per nome file), raggruppa giorni consecutivi con stesso prezzo in intervalli.
// Produce: scripts/quovai-nrbb-prices.csv (camera,da,a,prezzo) + report.
// NON scrive sul DB. Il caricamento reale si fa col loader esistente:
//   node scripts/load-prices.mjs --dry-run --csv scripts/quovai-nrbb-prices.csv
//   node scripts/load-prices.mjs            --csv scripts/quovai-nrbb-prices.csv
import { createRequire } from 'module'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const DEFAULT_FILES = [6, 7, 8, 9, 10].map((n) => `/Users/lunardijacopo/Downloads/plain-report-${n}.xls`)
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const inputs = files.length ? files : DEFAULT_FILES
const OUT = fileURLToPath(new URL('./quovai-nrbb-prices.csv', import.meta.url))

const toISO = (d) => { const m = String(d).match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null }
const addDay = (iso) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) }

const anomalies = []
const perRoom = {} // num -> [{date, price}]

for (const path of inputs) {
  const wb = XLSX.readFile(path)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
  const hdr = rows[0]
  const num = (String(hdr[2]).match(/30[1-5]/) || [])[0]
  if (!num) { anomalies.push(`${path}: numero camera non trovato nell'header`); continue }
  // match ESATTO della colonna NR BB (non "Booking.com NR BB")
  const idx = hdr.findIndex((h) => String(h).trim() === `${num} NR BB`)
  if (idx < 0) { anomalies.push(`camera ${num}: colonna "${num} NR BB" non trovata`); continue }

  const list = []
  const seenDates = new Set()
  for (const r of rows.slice(1)) {
    if (!r[0]) continue
    const iso = toISO(r[0])
    if (!iso) { anomalies.push(`camera ${num}: data non valida "${r[0]}"`); continue }
    if (seenDates.has(iso)) { anomalies.push(`camera ${num}: data duplicata ${iso}`); continue }
    seenDates.add(iso)
    const price = Number(r[idx])
    if (!(price > 0)) { anomalies.push(`camera ${num}: prezzo NR BB mancante/0 il ${iso}`); continue }
    list.push({ date: iso, price })
  }
  list.sort((a, b) => a.date.localeCompare(b.date))
  perRoom[num] = list
}

// Raggruppa giorni consecutivi con stesso prezzo in intervalli (camera,da,a,prezzo)
const segments = []
for (const num of Object.keys(perRoom).sort()) {
  const list = perRoom[num]
  let seg = null
  for (const { date, price } of list) {
    if (seg && price === seg.price && date === addDay(seg.to)) { seg.to = date; continue }
    if (seg) segments.push(seg)
    seg = { num, from: date, to: date, price }
  }
  if (seg) segments.push(seg)
}

// Scrive il CSV per il loader
const csv = ['camera,da,a,prezzo', ...segments.map((s) => `${s.num},${s.from},${s.to},${s.price}`)].join('\n') + '\n'
writeFileSync(OUT, csv)

// ---- Report transform ----
const allDates = Object.values(perRoom).flat().map((x) => x.date).sort()
const totalDayPrices = Object.values(perRoom).reduce((a, l) => a + l.length, 0)
console.log('=== IMPORT QuoVai NR BB — REPORT (transform, no DB) ===')
console.log('Camere rilevate:', Object.keys(perRoom).sort().join(', '))
console.log('Intervallo date:', allDates[0], '→', allDates[allDates.length - 1])
console.log('Prezzi giornalieri totali:', totalDayPrices, '| segmenti (intervalli) generati:', segments.length)
for (const num of Object.keys(perRoom).sort()) {
  const l = perRoom[num], prices = l.map((x) => x.price)
  console.log(`  camera ${num}: ${l.length} giorni · prezzo ${Math.min(...prices)}–${Math.max(...prices)}€ · ${segments.filter(s=>s.num===num).length} segmenti`)
}
console.log('\nEsempio mapping camera/data/prezzo (primi 5 della 303):')
;(perRoom['303'] ?? []).slice(0, 5).forEach((x) => console.log(`  303 | ${x.date} | NR BB ${x.price}€ → price_cents ${x.price * 100}`))
console.log('\nAnomalie:', anomalies.length ? anomalies.length : 'nessuna')
anomalies.slice(0, 10).forEach((a) => console.log('  -', a))
console.log('\nCSV scritto in:', OUT)
console.log('Dry-run scritture:  node scripts/load-prices.mjs --dry-run --csv', OUT)
console.log('Caricamento reale:  node scripts/load-prices.mjs --csv', OUT)
