// E2E M2 — Preventivatore automatico (supervision ON):
// chat → extract → lib/quote → BOZZA in inbox → approvazione staff.
// Uso: (1) npm run dev  (2) node --env-file=.env.local scripts/test-quote-e2e.mjs
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'
const PID = '00000000-0000-0000-0000-000000000011'
const ORG = '00000000-0000-0000-0000-000000000001'
const ROOM_NAME = 'Camera Demo M2 (e2e)'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function seed() {
  // camera (cleanup per nome → ricrea)
  const { data: old } = await sb.from('rooms').select('id').eq('property_id', PID).eq('name', ROOM_NAME)
  for (const r of old ?? []) {
    await sb.from('rate_calendar').delete().eq('room_id', r.id)
    await sb.from('rooms').delete().eq('id', r.id)
  }
  const { data: room, error } = await sb.from('rooms')
    .insert({ org_id: ORG, property_id: PID, name: ROOM_NAME, max_guests: 4 }).select('id').single()
  if (error) throw new Error('seed room: ' + error.message)
  // tariffe per 20-21 settembre 2026 (check-out 22 → 2 notti)
  const rates = [
    { date: '2026-09-20', price_cents: 12000 },
    { date: '2026-09-21', price_cents: 13000 },
  ].map((r) => ({ org_id: ORG, property_id: PID, room_id: room.id, available: 1, min_stay: 1, source: 'manual', ...r }))
  const { error: rErr } = await sb.from('rate_calendar').insert(rates)
  if (rErr) throw new Error('seed rates: ' + rErr.message)
  console.log(`  ✓ Camera "${ROOM_NAME}" (cap 4) + tariffe 20/21 set 2026 (120€ + 130€)`)
  return room.id
}

async function chat(message, conversationId = null) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ propertyId: PID, conversationId, message }),
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}
async function waitServer() {
  for (let i = 0; i < 40; i++) { try { const r = await chat('ping'); if (r.status < 500) return true } catch {} await new Promise((s) => setTimeout(s, 1000)) }
  return false
}
const euro = (c) => (c == null ? '—' : (c / 100).toFixed(2) + '€')

console.log('\n──────── Setup M2 ────────')
await seed()
if (!(await waitServer())) { console.error('✗ server non pronto'); process.exit(1) }
console.log('  ✓ server pronto')

console.log('\n──────── 1) Richiesta preventivo (chat reale) ────────')
const msg = 'Buongiorno, vorrei prenotare dal 20 al 22 settembre 2026 per 2 adulti. Mi chiamo Luca Bianchi, email luca.bianchi@test.it'
console.log('👤', msg)
const r1 = await chat(msg)
console.log(`   intent: ${r1.data.intent} | stage: ${r1.data.stage} | source: ${r1.data.source}`)
console.log('🤖', r1.data.reply)
const convId = r1.data.conversationId

console.log('\n──────── 2) Dati estratti + BOZZA (DB) ────────')
const { data: conv } = await sb.from('conversations').select('booking_request_id,intent,stage,guest_name').eq('id', convId).single()
const leadId = conv?.booking_request_id
const { data: lead } = await sb.from('booking_requests')
  .select('id,status,guest_name,guest_contact,check_in,check_out,adults,gross_total_cents,discount_pct,offer_total_cents,data_reliability,price_source')
  .eq('id', leadId).single()
console.log('Dati estratti →', JSON.stringify({ guest: lead.guest_name, contact: lead.guest_contact, check_in: lead.check_in, check_out: lead.check_out, adults: lead.adults }))
console.log('BOZZA →', JSON.stringify({ status: lead.status, lordo: euro(lead.gross_total_cents), sconto: lead.discount_pct + '%', offerta: euro(lead.offer_total_cents), affidabilita: lead.data_reliability, fonte: lead.price_source }))
const { data: items } = await sb.from('booking_request_items').select('date,price_cents').eq('booking_request_id', leadId).order('date')
console.log('Snapshot per notte →', (items ?? []).map((i) => `${i.date}: ${euro(i.price_cents)}`).join(' | '))
console.log('Stato richiesta:', lead.status === 'received' ? '✓ received = BOZZA (non inviata, attende staff)' : '✗ ' + lead.status)

console.log('\n──────── 3) Approvazione staff (received → proposal_sent) ────────')
// equivalente alla Server Action approveProposalDraft (che aggiunge solo auth)
const { data: tr } = await sb.rpc('transition_booking_request', {
  p_request_id: leadId, p_org_id: ORG, p_to_status: 'proposal_sent', p_actor: 'staff',
  p_note: 'Bozza approvata e inviata dallo staff (e2e)',
})
console.log('Transizione:', JSON.stringify(tr))
const { data: after } = await sb.from('booking_requests').select('status,offer_total_cents,offer_expires_at').eq('id', leadId).single()
console.log('Dopo approvazione →', JSON.stringify({ status: after.status, offerta: euro(after.offer_total_cents), offer_expires_at: after.offer_expires_at }))
const { data: ev } = await sb.from('booking_request_events').select('from_status,to_status,actor,note').eq('booking_request_id', leadId).order('created_at')
console.log('\nTimeline lead:')
for (const e of ev ?? []) console.log(`  [${e.actor}] ${e.from_status ?? '∅'} → ${e.to_status}  ${e.note ? '· ' + e.note : ''}`)

console.log('\n✓ E2E M2 completato. Dati mantenuti per ispezione dashboard.')
