// Collega i 5 feed iCal QuoVai di LunArt, esegue il sync reale (endpoint),
// e produce report disponibilità + test checkAvailability (replicato sui dati reali).
// NON tocca prezzi/preventivi: scrive solo rate_calendar.available (via sync iCal).
// Uso: (server attivo) node --env-file=.env.local scripts/connect-lunart-ical.mjs
import { createClient } from '@supabase/supabase-js'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ORG = '00000000-0000-0000-0000-000000000001'
const PROP = '00000000-0000-0000-0000-000000000011'
const BASE = 'http://localhost:3000'

// 1) Mappatura dal foglio
const wb = XLSX.readFile('/Users/lunardijacopo/Downloads/grid_export.xls')
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
const urlByNum = {}
for (const r of rows) {
  const label = String(r[0] ?? '')
  const url = String(r[3] ?? '').trim()
  const m = label.match(/\b(30[1-5])\b/)
  if (m && url.startsWith('http')) urlByNum[m[1]] = url
}
console.log('Mappatura xls:', JSON.stringify(urlByNum, null, 0))

// 2) Camere LunArt → numero → id
const { data: rooms } = await sb.from('rooms').select('id,name').eq('property_id', PROP).is('deleted_at', null)
const roomByNum = {}
for (const r of rooms ?? []) { const m = r.name.match(/\b(30[1-5])\b/); if (m) roomByNum[m[1]] = r }

// 3) Inserisci feed (idempotente: rimuove i feed esistenti delle camere, poi inserisce)
console.log('\n--- inserimento ical_feeds ---')
for (const num of ['301','302','303','304','305']) {
  const room = roomByNum[num], url = urlByNum[num]
  if (!room || !url) { console.log(`  ${num}: MANCA ${!room?'camera':'url'}`); continue }
  await sb.from('ical_feeds').delete().eq('room_id', room.id)
  const { error } = await sb.from('ical_feeds').insert({ org_id: ORG, property_id: PROP, room_id: room.id, url, active: true })
  console.log(`  ${num} → ${room.name} : ${error ? 'KO '+error.message.slice(0,50) : 'feed inserito'}`)
}

// 4) Sync manuale reale via endpoint (chiama syncIcalFeeds del codice)
console.log('\n--- sync manuale (/api/cron/ical-sync) ---')
const secret = process.env.CRON_SECRET
const res = await fetch(`${BASE}/api/cron/ical-sync`, { method: 'POST', headers: { authorization: `Bearer ${secret}` } })
console.log('  risposta sync:', JSON.stringify(await res.json()))

// 5) Report per camera + stato feed
console.log('\n--- REPORT disponibilità (rate_calendar, source=ical) ---')
for (const num of ['301','302','303','304','305']) {
  const room = roomByNum[num]; if (!room) continue
  const { data: occ } = await sb.from('rate_calendar').select('date').eq('room_id', room.id).eq('source','ical').eq('available', 0).order('date')
  const { data: feed } = await sb.from('ical_feeds').select('last_status,last_sync_at').eq('room_id', room.id).single()
  const dates = (occ ?? []).map(o => o.date)
  console.log(`\n${num} (${room.name})`)
  console.log(`  feed: ${feed?.last_status} @ ${feed?.last_sync_at}`)
  console.log(`  giorni occupati sincronizzati: ${dates.length}`)
  if (dates.length) console.log(`  range: ${dates[0]} → ${dates[dates.length-1]} | primi: ${dates.slice(0,8).join(', ')}${dates.length>8?' …':''}`)
}

// 6) Test reale checkAvailability (replica esatta della query della funzione)
console.log('\n--- TEST checkAvailability (logica reale sui dati) ---')
async function checkAvail(roomId, date) {
  const { data: feeds } = await sb.from('ical_feeds').select('last_sync_at').eq('room_id', roomId).eq('active', true)
  if (!feeds || !feeds.length) return { verified:false, available:false, reason:'no_feed' }
  const fresh = feeds.some(f => f.last_sync_at && Date.now()-new Date(f.last_sync_at).getTime() <= 24*3600*1000)
  if (!fresh) return { verified:false, available:false, reason:'stale_feed' }
  const { data: occ } = await sb.from('rate_calendar').select('date').eq('room_id', roomId).eq('date', date).eq('available', 0).limit(1)
  return occ && occ.length ? { verified:true, available:false, reason:'occupied' } : { verified:true, available:true, reason:'free' }
}
// scegli una camera con date occupate per il test
let testRoom = null, busyDate = null
for (const num of ['303','305','301','302','304']) {
  const room = roomByNum[num]; if (!room) continue
  const { data: occ } = await sb.from('rate_calendar').select('date').eq('room_id', room.id).eq('source','ical').eq('available',0).order('date').limit(1)
  if (occ && occ.length) { testRoom = room; busyDate = occ[0].date; break }
}
if (testRoom) {
  const freeDate = '2027-12-25' // data lontana, sicuramente non occupata
  console.log(`Camera test: ${testRoom.name}`)
  console.log(`  data OCCUPATA ${busyDate} →`, JSON.stringify(await checkAvail(testRoom.id, busyDate)), '(atteso available:false)')
  console.log(`  data LIBERA  ${freeDate} →`, JSON.stringify(await checkAvail(testRoom.id, freeDate)), '(atteso available:true)')
} else {
  console.log('Nessuna data occupata rilevata in nessun feed (camere tutte libere nel periodo).')
}
console.log('\n✓ Fatto')
