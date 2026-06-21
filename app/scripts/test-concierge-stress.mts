// Stress test concierge — READ ONLY (nessuna scrittura): esegue la checklist completa
// attraverso runPipeline e riporta intent/stage/esito osservato vs atteso.
// Uso: node --env-file=.env.local --import tsx scripts/test-concierge-stress.mts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { runPipeline, type PipelineResult } from '@/lib/ai/pipeline'
import type { PropertyContext } from '@/lib/ai/types'

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data: prop } = await sb.from('properties').select('id, org_id, name, settings, supervision_mode').eq('id', '00000000-0000-0000-0000-000000000011').single()
const property: PropertyContext = { id: prop!.id, orgId: prop!.org_id, name: prop!.name, settings: (prop!.settings ?? {}) as Record<string, unknown>, supervisionMode: prop!.supervision_mode }
const { data: rooms } = await sb.from('rooms').select('id').eq('property_id', property.id).is('deleted_at', null)
await sb.from('ical_feeds').update({ last_sync_at: new Date().toISOString() }).in('room_id', (rooms ?? []).map((r) => r.id)).eq('active', true)
const TODAY = '2026-06-22'

function observed(r: PipelineResult): string {
  const i = r.intent
  if (i === 'spam') return 'SPAM'
  if (i === 'partnership') return 'PARTNERSHIP'
  if (i === 'vendor') return 'VENDOR'
  if (i === 'saas_lead') return 'SAAS'
  if (i === 'unclassified') return 'UNCLASS'
  if (i === 'faq' || i === 'guest_support') return 'KB'
  if (i === 'booking') {
    if (r.proposalCombinations) return 'COMB'
    if (r.proposalRooms) return 'PREV'
    if ((r.slots?.segments?.length ?? 0) >= 2) return 'MULTI'
    if (r.stage === 'collecting_data') return 'ASK'
    if (r.stage === 'quoting') return 'STAFF'
    return 'BOOK?'
  }
  return '?'
}

type Case = { id: string; msg: string; exp: string }
const sections: { name: string; cases: Case[] }[] = [
  { name: 'A · Prenotazioni base', cases: [
    { id: 'A1', msg: '1 agosto, 2 persone', exp: 'PREV' },
    { id: 'A2', msg: 'dal 1 al 3 agosto per 2', exp: 'PREV' },
    { id: 'A3', msg: 'il 2 settembre per 2', exp: 'PREV' },
    { id: 'A4', msg: 'domani per 2 persone', exp: 'PREV' },
    { id: 'A5', msg: 'questo weekend, 2 adulti', exp: 'PREV' },
    { id: 'A6', msg: '1 agosto', exp: 'ASK' },
    { id: 'A7', msg: 'siamo in 2', exp: 'ASK' },
  ] },
  { name: 'B · Gruppi / combinazioni / quantità', cases: [
    { id: 'B1', msg: 'siamo in 5 dal 1 al 3 agosto', exp: 'COMB' },
    { id: 'B3', msg: '2 triple il 2 settembre', exp: 'COMB' },
    { id: 'B4', msg: '3 doppie dal 1 al 3 agosto', exp: 'COMB' },
    { id: 'B5', msg: 'siamo 3 coppie il 2 settembre', exp: 'COMB' },
    { id: 'B6', msg: '2 camere per 5 persone dal 1 al 3 agosto', exp: 'COMB' },
    { id: 'B7', msg: 'siamo in 14 dal 1 al 3 agosto', exp: 'STAFF' },
  ] },
  { name: 'C · Bambini / culle', cases: [
    { id: 'C1', msg: '2 adulti e 1 bambino di 6 anni, 1 agosto', exp: 'PREV' },
    { id: 'C2', msg: '2 adulti e 1 neonato, 1 agosto', exp: 'PREV' },
    { id: 'C3', msg: '2 adulti e un bambino, 1 agosto', exp: 'ASK' },
    { id: 'C4', msg: '2 adulti, 1 bimbo 5 anni in culla, 1 agosto', exp: 'STAFF' },
  ] },
  { name: 'D · Non-standard / multi-richiesta', cases: [
    { id: 'D1', msg: 'una matrimoniale il 1 agosto e una tripla l\'1-2 settembre', exp: 'MULTI' },
    { id: 'D2', msg: 'mi fate uno sconto?', exp: 'STAFF' },
    { id: 'D3', msg: 'organizziamo un matrimonio, avete sale?', exp: 'STAFF' },
    { id: 'D4', msg: 'vorrei una camera matrimoniale il 1 agosto', exp: 'PREV' },
    { id: 'D5', msg: 'vorrei modificare la mia prenotazione', exp: 'STAFF' },
  ] },
  { name: 'E · Struttura (KB)', cases: [
    { id: 'E1', msg: 'a che ora è il check-in?', exp: 'KB' },
    { id: 'E2', msg: 'c\'è il parcheggio?', exp: 'KB' },
    { id: 'E3', msg: 'la colazione è inclusa e a che ora?', exp: 'KB' },
    { id: 'E5', msg: 'quanto è la tassa di soggiorno?', exp: 'KB' },
    { id: 'E6', msg: 'come si paga?', exp: 'KB' },
  ] },
  { name: 'F · Firenze / concierge', cases: [
    { id: 'F1', msg: 'posso arrivare in auto? c\'è la ZTL?', exp: 'KB' },
    { id: 'F3', msg: 'dove lascio i bagagli prima del check-in?', exp: 'KB' },
    { id: 'F5', msg: 'dov\'è il ristorante Boccaponci?', exp: 'KB/STAFF' },
  ] },
  { name: 'G · MISTE (atteso MIX dopo Parte 1 — oggi solo booking)', cases: [
    { id: 'G1', msg: 'avete posto il 1 agosto per 2? e dov\'è il ristorante Boccaponci?', exp: 'MIX' },
    { id: 'G2', msg: 'preventivo dal 1 al 3 agosto per 2 e c\'è il parcheggio?', exp: 'MIX' },
    { id: 'G3', msg: '2 persone 1 agosto, posso entrare in auto in ZTL?', exp: 'MIX' },
  ] },
  { name: 'H · Multilingua', cases: [
    { id: 'H1', msg: 'availability Aug 1 for 2 guests, and where can I park?', exp: 'MIX' },
    { id: 'H2', msg: 'disponibilidad 1 de agosto para 2 personas', exp: 'PREV' },
  ] },
  { name: 'I · Robustezza / anti-abuso', cases: [
    { id: 'I1', msg: 'siamo due famiglie il 2 settembre', exp: 'ASK' },
    { id: 'I2', msg: 'CLICCA QUI per vincere un iPhone http://spam.xyz', exp: 'SPAM' },
    { id: 'I3', msg: 'siamo un tour operator, vorremmo tariffe per gruppi', exp: 'PARTNERSHIP' },
    { id: 'I4', msg: 'salve vendo un gestionale per hotel, vi interessa?', exp: 'VENDOR/SAAS' },
    { id: 'I5', msg: 'info', exp: 'UNCLASS' },
  ] },
  { name: 'K · WhatsApp reale (abbreviazioni / errori / frasi incomplete)', cases: [
    { id: 'K1', msg: 'disp 1 ago x 2?', exp: 'PREV' },
    { id: 'K2', msg: 'avt posto dmn x 2?', exp: 'PREV' },
    { id: 'K3', msg: '2 pers 1-3 agosto qnt costa', exp: 'PREV' },
    { id: 'K4', msg: 'ciao c posto x stanotte', exp: 'ASK/PREV' },
    { id: 'K5', msg: 'siamo 6 il 2 set', exp: 'COMB' },
    { id: 'K6', msg: 'una matr x 2 il 1/8', exp: 'PREV' },
    { id: 'K7', msg: 'bimbo 3 anni + 2 adulti 1 agosto', exp: 'PREV' },
    { id: 'K8', msg: 'ke prezzo x doppia 2 notti agosto?', exp: 'PREV/ASK' },
    { id: 'K9', msg: 'disponibilita agsoto x 2 perosne', exp: 'PREV/ASK' },
    { id: 'K10', msg: 'avete 2 trple il 2 set?', exp: 'COMB' },
  ] },
]

let total = 0, match = 0
for (const sec of sections) {
  console.log(`\n──────── ${sec.name} ────────`)
  for (const c of sec.cases) {
    total++
    let obs = 'ERR'
    let reply = ''
    try {
      const r = await runPipeline({ sb, property, history: [], userMessage: c.msg, aiEnabled: true, todayIso: TODAY })
      obs = observed(r)
      reply = (r.text || '').replace(/\n/g, ' ').slice(0, 70)
    } catch (e) { reply = String(e).slice(0, 60) }
    const ok = c.exp.split('/').includes(obs)
    if (ok) match++
    console.log(`  ${ok ? '✓' : '·'} ${c.id} [att:${c.exp} oss:${obs}] «${c.msg.slice(0, 42)}»`)
    if (!ok) console.log(`        → ${reply}`)
  }
}
console.log(`\n════ ${match}/${total} coincidono con l'atteso (i '·' sono da rivedere, non necessariamente errori) ════`)
process.exit(0)
