// E2E flusso commerciale definitivo (Fasi 1→4) via /api/chat (server vivo) + ispezione DB.
// Uso: (1) npm run dev  (2) node --env-file=.env.local scripts/test-commercial-flow-e2e.mjs
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'
const PROP = '00000000-0000-0000-0000-000000000011'
const ORG = '00000000-0000-0000-0000-000000000001'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let pass = 0, fail = 0, skip = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }
const skipMsg = (m) => { skip++; console.log('  ⚠ SKIP — ' + m) }

// La tabella notifications è creata dalla migration 0005 (potrebbe non essere ancora
// applicata sul DB remoto in fase pre-deploy): se assente, le verifiche notifica si saltano.
let notifTableExists = true
{
  const probe = await sb.from('notifications').select('id').limit(1)
  if (probe.error && /schema cache|does not exist|PGRST205/i.test(probe.error.message + probe.error.code)) notifTableExists = false
}
const has = (s, ...subs) => subs.every((x) => (s ?? '').toLowerCase().includes(x.toLowerCase()))
const hasNot = (s, ...subs) => subs.every((x) => !(s ?? '').toLowerCase().includes(x.toLowerCase()))

async function chat(message, conversationId = null) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ propertyId: PROP, conversationId, message }),
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}
async function waitServer() {
  for (let i = 0; i < 30; i++) {
    try { const r = await chat('ping'); if (r.status < 500) return true } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

// ── Setup: feed iCal freschi (disponibilità verificata) ──
const { data: rooms } = await sb.from('rooms').select('id').eq('property_id', PROP).is('deleted_at', null)
const roomIds = rooms.map((r) => r.id)
const { data: feedsBefore } = await sb.from('ical_feeds').select('id,last_sync_at').in('room_id', roomIds)
const nowIso = new Date().toISOString()
for (const f of feedsBefore) await sb.from('ical_feeds').update({ last_sync_at: nowIso }).eq('id', f.id)

console.log('\n──────── Setup ────────')
if (!(await waitServer())) { console.error('✗ Server non raggiungibile. Avvia `npm run dev`.'); process.exit(1) }
console.log('  ✓ Server pronto, feed iCal aggiornati')

const created = [] // conversation ids da ripulire

// ============ SCENARIO IT — flusso completo ============
console.log('\n──────── IT · Fase 1 (preventivo) ────────')
let r = await chat('Buongiorno, avete disponibilità dal 1 al 3 agosto 2026 per 2 adulti?')
const conv = r.data.conversationId
created.push(conv)
console.log('  reply:', JSON.stringify(r.data.reply))
ok(r.data.stage === 'proposal_sent', 'stage = proposal_sent')
ok(has(r.data.reply, 'camera', '€', 'colazione inclusa'), 'proposta: Camera + €importo + colazione inclusa')
ok(hasNot(r.data.reply, 'sconto', 'tassa', '24 ore', 'validità', '%'), 'proposta NASCONDE sconto/tassa/validità/% ')

console.log('\n──────── IT · Fase 2 (interesse → bonifico) ────────')
r = await chat('Sì, vorrei procedere con la prenotazione', conv)
console.log('  reply:', JSON.stringify(r.data.reply))
ok(has(r.data.reply, 'IT77X0503402801000000020689'), 'istruzioni: IBAN corretto')
ok(has(r.data.reply, 'LUNARDI JACOPO'), 'istruzioni: intestatario')
ok(has(r.data.reply, 'FIRENZE - PIAZZA DEI DAVANZATI'), 'istruzioni: filiale')
ok(has(r.data.reply, '24 ore', 'bonifico'), 'istruzioni: riserva 24h + bonifico')
ok(has(r.data.reply, 'jacopo', 'lunart'), 'istruzioni: firma Jacopo/LunArt')

const { data: convRow } = await sb.from('conversations').select('booking_request_id').eq('id', conv).single()
const leadId = convRow.booking_request_id
const { data: lead2 } = await sb.from('booking_requests').select('status,hold_expires_at').eq('id', leadId).single()
ok(lead2.status === 'awaiting_payment', `lead status = awaiting_payment (${lead2.status})`)
ok(!!lead2.hold_expires_at, 'hold_expires_at valorizzato (~24h)')
if (lead2.hold_expires_at) {
  const dh = (new Date(lead2.hold_expires_at).getTime() - Date.now()) / 3600000
  ok(dh > 20 && dh < 28, `hold ~24h (${dh.toFixed(1)}h)`)
}
if (notifTableExists) {
  const { data: notif2 } = await sb.from('notifications').select('title').eq('booking_request_id', leadId).ilike('title', '%Pagamento atteso%')
  ok((notif2 ?? []).length > 0, 'notifica staff "Pagamento atteso"')
} else skipMsg('notifica "Pagamento atteso" (tabella notifications assente — migration 0005 non applicata)')

console.log('\n──────── IT · Fase 3 (contabile ricevuta) ────────')
r = await chat('Ho effettuato il bonifico, allego la contabile in screenshot.', conv)
console.log('  reply:', JSON.stringify(r.data.reply))
ok(has(r.data.reply, 'ricevut') && has(r.data.reply, 'verific'), 'ack: ricezione + verifica staff (no conferma auto)')
const { data: lead3 } = await sb.from('booking_requests').select('status').eq('id', leadId).single()
ok(lead3.status === 'awaiting_payment', 'NESSUNA conferma automatica (status invariato)')
if (notifTableExists) {
  const { data: notif3 } = await sb.from('notifications').select('title').eq('booking_request_id', leadId).ilike('title', '%Contabile ricevuta%')
  ok((notif3 ?? []).length > 0, 'notifica staff "Contabile ricevuta – verifica richiesta"')
} else skipMsg('notifica "Contabile ricevuta" (tabella notifications assente — migration 0005 non applicata)')

console.log('\n──────── IT · Fase 4 (conferma staff) ────────')
const { data: conf } = await sb.rpc('transition_booking_request', {
  p_request_id: leadId, p_org_id: ORG, p_to_status: 'confirmed', p_actor: 'staff',
  p_note: 'Contabile verificata (test)', p_gross_total_cents: null, p_discount_pct: null,
  p_offer_total_cents: null, p_city_tax_cents: null, p_price_source: null, p_data_reliability: null,
})
ok(conf?.ok === true, 'transizione staff awaiting_payment → confirmed')
const { data: lead4 } = await sb.from('booking_requests').select('status').eq('id', leadId).single()
ok(lead4.status === 'confirmed', 'lead status = confirmed')

// ============ SCENARIO EN — localizzazione Fase 1+2 ============
console.log('\n──────── EN · Fase 1+2 (localizzazione) ────────')
r = await chat('Hello, do you have availability from August 1 to August 3, 2026 for 2 adults?')
const convEn = r.data.conversationId
created.push(convEn)
console.log('  reply:', JSON.stringify(r.data.reply))
ok(r.data.stage === 'proposal_sent', 'EN stage = proposal_sent')
ok(has(r.data.reply, 'room', 'breakfast included'), 'EN proposta in inglese (Room / breakfast included)')
r = await chat('Yes, I would like to proceed with the booking.', convEn)
console.log('  reply:', JSON.stringify(r.data.reply))
ok(has(r.data.reply, 'IT77X0503402801000000020689', 'account holder', 'bank transfer'), 'EN istruzioni in inglese + IBAN')

// ── Cleanup ──
console.log('\n──────── Cleanup ────────')
for (const c of created) {
  const { data: cr } = await sb.from('conversations').select('booking_request_id').eq('id', c).single()
  if (cr?.booking_request_id) {
    if (notifTableExists) await sb.from('notifications').delete().eq('booking_request_id', cr.booking_request_id)
    await sb.from('booking_request_events').delete().eq('booking_request_id', cr.booking_request_id)
    await sb.from('booking_request_items').delete().eq('booking_request_id', cr.booking_request_id)
  }
  if (notifTableExists) await sb.from('notifications').delete().eq('conversation_id', c)
  await sb.from('messages').delete().eq('conversation_id', c)
  if (cr?.booking_request_id) await sb.from('booking_requests').delete().eq('id', cr.booking_request_id)
  await sb.from('conversations').delete().eq('id', c)
}
// ripristina last_sync_at originale dei feed
for (const f of feedsBefore) await sb.from('ical_feeds').update({ last_sync_at: f.last_sync_at }).eq('id', f.id)
console.log('  ✓ Dati di test rimossi, feed ripristinati')

console.log(`\n════════ Risultato: ${pass} passati, ${fail} falliti, ${skip} saltati ════════`)
if (skip > 0) console.log('  Nota: applicare migration 0005_notifications.sql sul DB per attivare le notifiche staff.')
process.exit(fail > 0 ? 1 : 0)
