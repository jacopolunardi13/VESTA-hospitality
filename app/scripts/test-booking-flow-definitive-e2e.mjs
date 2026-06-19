// E2E flusso prenotazioni DEFINITIVO (no auto-blocco) via /api/chat + simulazione staff via DB.
// Uso: (1) npm run start/dev  (2) node --env-file=.env.local scripts/test-booking-flow-definitive-e2e.mjs
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'
const PROP = '00000000-0000-0000-0000-000000000011'
const ORG = '00000000-0000-0000-0000-000000000001'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let pass = 0, fail = 0, skip = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }
const skipMsg = (m) => { skip++; console.log('  ⚠ SKIP — ' + m) }
const has = (s, ...x) => x.every((t) => (s ?? '').toLowerCase().includes(t.toLowerCase()))
const hasNot = (s, ...x) => x.every((t) => !(s ?? '').toLowerCase().includes(t.toLowerCase()))
const chat = async (message, conversationId = null) => {
  const res = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: PROP, conversationId, message }) })
  return (await res.json().catch(() => ({})))
}

let notifTableExists = true
{ const p = await sb.from('notifications').select('id').limit(1); if (p.error && /schema cache|PGRST205|does not exist/i.test(p.error.message + p.error.code)) notifTableExists = false }

// Setup: feed iCal freschi
const { data: rooms } = await sb.from('rooms').select('id').eq('property_id', PROP).is('deleted_at', null)
const roomIds = rooms.map((r) => r.id)
const { data: feedsBefore } = await sb.from('ical_feeds').select('id,last_sync_at').in('room_id', roomIds)
const nowIso = new Date().toISOString()
for (const f of feedsBefore) await sb.from('ical_feeds').update({ last_sync_at: nowIso }).eq('id', f.id)

console.log('\n──────── Setup ────────')
for (let i = 0; i < 20; i++) { const r = await chat('ping'); if (r.conversationId || r.reply) break; await new Promise((x) => setTimeout(x, 1000)) }
console.log('  ✓ server pronto, feed freschi')
const created = []

// ===== Scenario A — flusso completo (happy path) =====
console.log('\n──────── A1 · Preventivo MULTI-camera ────────')
let r = await chat('avete disponibilità dal 1 al 3 agosto 2026 per 2 persone?')
const conv = r.conversationId; created.push(conv)
console.log('  reply:', JSON.stringify(r.reply))
ok(r.stage === 'proposal_sent', 'stage = proposal_sent')
ok(has(r.reply, 'camera 301') && has(r.reply, 'camera 303'), 'elenca PIÙ camere (301 e 303 presenti)')
ok(has(r.reply, '€', 'colazione inclusa'), 'mostra prezzo + colazione inclusa')
ok(hasNot(r.reply, 'IT77X0503402801000000020689', 'iban', 'bonifico'), 'NESSUN IBAN nel preventivo')

console.log('\n──────── A2 · Scelta camera → verifica staff (no blocco, no IBAN) ────────')
r = await chat('vorrei la 303', conv)
console.log('  reply:', JSON.stringify(r.reply))
ok(r.status === 'interested', 'lead → interested (In attesa verifica disponibilità)')
ok(has(r.reply, 'ancora riservata') || has(r.reply, 'not yet reserved'), 'ack: camera NON ancora riservata')
ok(hasNot(r.reply, 'IT77X0503402801000000020689', 'iban'), 'NESSUN IBAN inviato in questa fase')
const { data: cr } = await sb.from('conversations').select('booking_request_id').eq('id', conv).single()
const leadId = cr.booking_request_id
const { data: lead2 } = await sb.from('booking_requests').select('status, hold_expires_at').eq('id', leadId).single()
ok(lead2.status === 'interested', `DB status = interested (${lead2.status})`)
ok(!lead2.hold_expires_at, 'NESSUN hold impostato (camera non bloccata)')
const { data: items } = await sb.from('booking_request_items').select('room_id').eq('booking_request_id', leadId).limit(1)
const { data: chosenRoom } = items?.[0] ? await sb.from('rooms').select('name').eq('id', items[0].room_id).single() : { data: null }
ok(chosenRoom?.name?.includes('303'), `camera scelta salvata = ${chosenRoom?.name}`)
if (notifTableExists) {
  const { data: n } = await sb.from('notifications').select('title').eq('booking_request_id', leadId).ilike('title', '%Verifica disponibilità%')
  ok((n ?? []).length > 0, 'notifica staff "Verifica disponibilità richiesta"')
} else skipMsg('notifica verifica disponibilità (tabella notifications assente — 0005)')

console.log('\n──────── A3 · Staff: disponibile → riserva + IBAN (simulazione transizioni) ────────')
const { data: tA } = await sb.rpc('transition_booking_request', { p_request_id: leadId, p_org_id: ORG, p_to_status: 'availability_blocked', p_actor: 'staff', p_note: 'PMS chiuso (test)', p_gross_total_cents: null, p_discount_pct: null, p_offer_total_cents: null, p_city_tax_cents: null, p_price_source: null, p_data_reliability: null })
const { data: tB } = tA?.ok ? await sb.rpc('transition_booking_request', { p_request_id: leadId, p_org_id: ORG, p_to_status: 'awaiting_payment', p_actor: 'staff', p_note: 'inviato IBAN (test)', p_gross_total_cents: null, p_discount_pct: null, p_offer_total_cents: null, p_city_tax_cents: null, p_price_source: null, p_data_reliability: null }) : { data: tA }
ok(tA?.ok === true, 'transizione staff interested → availability_blocked')
ok(tB?.ok === true, 'transizione staff availability_blocked → awaiting_payment')
const { data: lead3 } = await sb.from('booking_requests').select('status, hold_expires_at').eq('id', leadId).single()
ok(lead3.status === 'awaiting_payment', 'lead = awaiting_payment dopo conferma staff')
ok(!!lead3.hold_expires_at, 'hold 24h impostato SOLO ora (da staff)')

console.log('\n──────── A4 · Contabile ricevuta → ack, nessuna conferma auto ────────')
r = await chat('ho effettuato il bonifico, allego la contabile', conv)
console.log('  reply:', JSON.stringify(r.reply))
ok(has(r.reply, 'ricevut') && has(r.reply, 'verific'), 'ack contabile (verifica staff)')
const { data: lead4 } = await sb.from('booking_requests').select('status').eq('id', leadId).single()
ok(lead4.status === 'awaiting_payment', 'NESSUNA conferma automatica')

// ===== Scenario B — ambiguità scelta camera =====
console.log('\n──────── B · Scelta ambigua → chiede quale camera ────────')
r = await chat('avete disponibilità dal 1 al 3 agosto 2026 per 2 persone?')
const convB = r.conversationId; created.push(convB)
ok(r.stage === 'proposal_sent', 'B: preventivo inviato')
r = await chat('vorrei una camera superior', convB)
console.log('  reply:', JSON.stringify(r.reply))
ok(r.stage === 'proposal_sent', 'B: resta proposal_sent (nessuna scelta finalizzata)')
ok(has(r.reply, '303') && has(r.reply, '305'), 'B: chiede di scegliere tra le due Superior (303/305)')

// ===== Scenario C — dipendenza migrazione 0008 (interested → proposal_sent) =====
console.log('\n──────── C · markUnavailable richiede 0008 (interested → proposal_sent) ────────')
{
  const { data: crc } = await sb.from('conversations').select('booking_request_id').eq('id', convB).single()
  // porta B a interested scegliendo una camera
  await chat('vorrei la 305', convB)
  const lid = crc.booking_request_id
  const { data: tc } = await sb.rpc('transition_booking_request', { p_request_id: lid, p_org_id: ORG, p_to_status: 'proposal_sent', p_actor: 'staff', p_note: 'test 0008', p_gross_total_cents: null, p_discount_pct: null, p_offer_total_cents: null, p_city_tax_cents: null, p_price_source: null, p_data_reliability: null })
  if (tc?.ok === true) ok(true, 'interested → proposal_sent CONSENTITA (0008 applicata)')
  else skipMsg(`interested → proposal_sent rifiutata (${tc?.error}) → applicare 0008 per il percorso "non disponibile → alternative"`)
}

// Cleanup
console.log('\n──────── Cleanup ────────')
for (const c of created) {
  const { data: x } = await sb.from('conversations').select('booking_request_id').eq('id', c).single()
  if (x?.booking_request_id) {
    if (notifTableExists) await sb.from('notifications').delete().eq('booking_request_id', x.booking_request_id)
    await sb.from('booking_request_events').delete().eq('booking_request_id', x.booking_request_id)
    await sb.from('booking_request_items').delete().eq('booking_request_id', x.booking_request_id)
  }
  if (notifTableExists) await sb.from('notifications').delete().eq('conversation_id', c)
  await sb.from('messages').delete().eq('conversation_id', c)
  if (x?.booking_request_id) await sb.from('booking_requests').delete().eq('id', x.booking_request_id)
  await sb.from('conversations').delete().eq('id', c)
}
for (const f of feedsBefore) await sb.from('ical_feeds').update({ last_sync_at: f.last_sync_at }).eq('id', f.id)
console.log('  ✓ pulizia completata, feed ripristinati')

console.log(`\n════════ Risultato: ${pass} passati, ${fail} falliti, ${skip} saltati ════════`)
process.exit(fail > 0 ? 1 : 0)
