// Test manuale del flusso booking C12 contro il remote Supabase.
// Replica ciò che fanno le Server Action (insert + RPC transition_booking_request).
// Esegue: create -> proposal_sent -> interested -> availability_blocked -> awaiting_payment -> confirmed
// Pulisce i dati di test alla fine (hard delete del record e dipendenti via cascade).
//
// Uso: node --env-file=.env.local scripts/test-booking-flow.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('✗ Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

const log = (...a) => console.log(...a)
const fail = (msg, extra) => { console.error('✗ FAIL:', msg, extra ?? ''); process.exit(1) }

let createdRequestId = null
let createdRoomId = null
let createdRateIds = []

async function cleanup() {
  if (createdRequestId) {
    // cascade elimina items/events/scoring
    await sb.from('booking_requests').delete().eq('id', createdRequestId)
  }
  if (createdRateIds.length) await sb.from('rate_calendar').delete().in('id', createdRateIds)
  if (createdRoomId) await sb.from('rooms').delete().eq('id', createdRoomId)
}

async function transition(toStatus, extra = {}) {
  const { data, error } = await sb.rpc('transition_booking_request', {
    p_request_id: createdRequestId,
    p_org_id: orgId,
    p_to_status: toStatus,
    p_actor: 'staff',
    p_note: `test → ${toStatus}`,
    p_gross_total_cents: extra.gross ?? null,
    p_discount_pct: extra.discount ?? null,
    p_offer_total_cents: extra.offer ?? null,
    p_city_tax_cents: extra.cityTax ?? null,
    p_price_source: extra.priceSource ?? null,
    p_data_reliability: extra.reliability ?? null,
  })
  if (error) fail(`RPC error su ${toStatus}`, error.message)
  if (!data?.ok) fail(`Transizione rifiutata → ${toStatus}`, JSON.stringify(data))
  log(`  ✓ ${String(data.from).padEnd(20)} → ${data.to}`)
  return data
}

let orgId, propertyId

try {
  // 0. Risolvi org + property reali dal remote
  log('\n── Setup ──────────────────────────────────')
  const { data: prop, error: pErr } = await sb
    .from('properties')
    .select('id, org_id, name')
    .is('deleted_at', null)
    .limit(1)
    .single()
  if (pErr || !prop) fail('Nessuna property trovata sul remote (serve onboarding)', pErr?.message)
  orgId = prop.org_id
  propertyId = prop.id
  log(`  property: ${prop.name} (${propertyId})`)
  log(`  org:      ${orgId}`)

  // 1. Crea richiesta manuale (come createRequest)
  log('\n── 1. Crea richiesta manuale ──────────────')
  const checkIn = '2026-08-10'
  const checkOut = '2026-08-12' // 2 notti
  const { data: req, error: rErr } = await sb
    .from('booking_requests')
    .insert({
      org_id: orgId,
      property_id: propertyId,
      source: 'manual',
      guest_name: 'TEST C12 — Mario Rossi',
      guest_contact: 'test@example.com',
      check_in: checkIn,
      check_out: checkOut,
      adults: 2,
      status: 'received',
    })
    .select('id, status')
    .single()
  if (rErr || !req) fail('Insert booking_request fallito', rErr?.message)
  createdRequestId = req.id
  log(`  ✓ creata richiesta ${createdRequestId} (status=${req.status})`)

  await sb.from('booking_request_events').insert({
    org_id: orgId, booking_request_id: createdRequestId,
    from_status: null, to_status: 'received', actor: 'staff', note: 'Richiesta creata (test)',
  })

  // 2. Prepara camera + tariffe e invia proposta (come sendProposal)
  log('\n── 2. Invia proposta (calcolo da rate_calendar) ──')
  const { data: room, error: roomErr } = await sb
    .from('rooms')
    .insert({ org_id: orgId, property_id: propertyId, name: 'TEST C12 — Camera', max_guests: 2 })
    .select('id')
    .single()
  if (roomErr || !room) fail('Insert room fallito', roomErr?.message)
  createdRoomId = room.id

  const rateRows = [
    { org_id: orgId, property_id: propertyId, room_id: createdRoomId, date: '2026-08-10', price_cents: 15000, available: 1, source: 'manual' },
    { org_id: orgId, property_id: propertyId, room_id: createdRoomId, date: '2026-08-11', price_cents: 17000, available: 1, source: 'manual' },
  ]
  const { data: rates, error: rateErr } = await sb.from('rate_calendar').insert(rateRows).select('id, price_cents')
  if (rateErr || !rates) fail('Insert rate_calendar fallito', rateErr?.message)
  createdRateIds = rates.map(r => r.id)

  const gross = rates.reduce((s, r) => s + r.price_cents, 0) // 32000
  const discount = 10
  const offer = Math.round(gross * (1 - discount / 100)) // 28800
  const cityTax = 0

  // snapshot items
  const { error: itErr } = await sb.from('booking_request_items').insert(
    rateRows.map(r => ({ org_id: orgId, booking_request_id: createdRequestId, room_id: createdRoomId, date: r.date, price_cents: r.price_cents }))
  )
  if (itErr) fail('Insert booking_request_items fallito', itErr.message)
  log(`  ✓ snapshot prezzi: lordo ${gross}¢, sconto ${discount}%, offerta ${offer}¢`)

  await transition('proposal_sent', { gross, discount, offer, cityTax, priceSource: 'manual', reliability: 'high' })

  // 3-6. Resto del flusso
  log('\n── 3-6. Avanzamento stati ─────────────────')
  await transition('interested')
  await transition('availability_blocked')
  await transition('awaiting_payment')
  await transition('confirmed')

  // Verifica stato finale + audit
  log('\n── Stato finale ───────────────────────────')
  const { data: finalReq } = await sb
    .from('booking_requests')
    .select('status, gross_total_cents, discount_pct, offer_total_cents, proposal_sent_at, interested_at, hold_expires_at, offer_expires_at, payment_received_at, data_reliability, price_source')
    .eq('id', createdRequestId)
    .single()
  log('  ' + JSON.stringify(finalReq, null, 2).replace(/\n/g, '\n  '))

  const { data: events } = await sb
    .from('booking_request_events')
    .select('from_status, to_status, actor, created_at')
    .eq('booking_request_id', createdRequestId)
    .order('created_at')
  log('\n── Audit trail (booking_request_events) ───')
  for (const e of events ?? []) {
    log(`  [${e.actor}] ${String(e.from_status ?? '∅').padEnd(20)} → ${e.to_status}`)
  }

  const { count: itemCount } = await sb
    .from('booking_request_items')
    .select('*', { count: 'exact', head: true })
    .eq('booking_request_id', createdRequestId)
  log(`\n  booking_request_items snapshot: ${itemCount} righe`)

  // Test negativo: transizione illegale deve essere rifiutata
  log('\n── Test transizione illegale (confirmed → proposal_sent) ──')
  const { data: bad } = await sb.rpc('transition_booking_request', {
    p_request_id: createdRequestId, p_org_id: orgId, p_to_status: 'proposal_sent', p_actor: 'staff',
  })
  if (bad?.ok) fail('La transizione illegale NON è stata rifiutata!', JSON.stringify(bad))
  log(`  ✓ rifiutata correttamente: ${JSON.stringify(bad)}`)

  // Test negativo: org_id sbagliato deve dare not_found
  log('\n── Test ownership (org_id errato) ──')
  const { data: wrongOrg } = await sb.rpc('transition_booking_request', {
    p_request_id: createdRequestId, p_org_id: '00000000-0000-0000-0000-000000000000', p_to_status: 'cancelled', p_actor: 'staff',
  })
  if (wrongOrg?.ok) fail('Org errato NON bloccato!', JSON.stringify(wrongOrg))
  log(`  ✓ bloccato correttamente: ${JSON.stringify(wrongOrg)}`)

  const ok = finalReq?.status === 'confirmed'
  log('\n════════════════════════════════════════════')
  log(ok ? '✓✓✓ TUTTE LE TRANSIZIONI OK — stato finale: confirmed' : '✗ stato finale inatteso: ' + finalReq?.status)
  log('════════════════════════════════════════════')
} catch (e) {
  fail('Eccezione', e?.message ?? String(e))
} finally {
  log('\n── Cleanup dati di test ───────────────────')
  await cleanup()
  log('  ✓ dati di test rimossi')
}
