// E2E REALE · sotto-flusso "scadenza pagamento 24h" (migrazione 0014 + codice app).
// Copre i 6 obiettivi: detector a scadenza (no email) → task interna → due rami staff.
// Uso: node --env-file=.env.local --import tsx scripts/test-payment-expiry-e2e.mts
// Sicuro: conversazioni 'website_chat' → deliverToGuest NON invia email/WhatsApp, solo persiste.
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PropertyContext } from '@/lib/ai/types'
import { executeTransition } from '@/lib/quote/stateMachine'
import { deliverToGuest } from '@/lib/delivery/deliverToGuest'
import { getOpenTaskForBooking, resolveTaskForBooking } from '@/lib/tasks/operationalTasks'
import { expiryText, normLang } from '@/lib/ai/messages'

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const db = sb as unknown as SupabaseClient

let pass = 0, fail = 0
function check(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`) }
}

const { data: prop } = await sb.from('properties').select('id, org_id, name, settings, supervision_mode').is('deleted_at', null).limit(1).single()
if (!prop) { console.error('Nessuna property trovata'); process.exit(1) }
const property: PropertyContext = { id: prop.id, orgId: prop.org_id, name: prop.name, settings: (prop.settings ?? {}) as Record<string, unknown>, supervisionMode: prop.supervision_mode }
const orgId = prop.org_id, propertyId = prop.id
console.log(`Property: ${property.name} (${propertyId})`)

const createdBookings: string[] = []
const createdConversations: string[] = []

async function makeAwaitingPaymentBooking(guestName: string, holdPast: boolean): Promise<{ id: string; conversationId: string }> {
  const { data: conv, error: cErr } = await sb.from('conversations')
    .insert({ org_id: orgId, property_id: propertyId, source: 'website_chat', guest_name: guestName, guest_contact: 'e2e@example.test' })
    .select('id').single()
  if (cErr || !conv) throw new Error('conv insert: ' + cErr?.message)
  createdConversations.push(conv.id)
  const hold = new Date(Date.now() + (holdPast ? -60 : 60) * 60 * 1000).toISOString()
  const { data: br, error: bErr } = await sb.from('booking_requests')
    .insert({ org_id: orgId, property_id: propertyId, source: 'website_chat', guest_name: guestName, conversation_id: conv.id, status: 'awaiting_payment', hold_expires_at: hold })
    .select('id').single()
  if (bErr || !br) throw new Error('booking insert: ' + bErr?.message)
  createdBookings.push(br.id)
  return { id: br.id, conversationId: conv.id }
}

try {
  // ---- [1] Detector: scadenza → task interna, NESSUNA email (obj 1,2,3) ----
  console.log('\n[1] Detector (scadenza 24h → task, no email)')
  const A = await makeAwaitingPaymentBooking('Rossi E2E', true)      // scaduta
  const fut = await makeAwaitingPaymentBooking('Futuro E2E', false)  // non scaduta (controllo negativo)

  const { error: eRun } = await db.rpc('process_operational_deadlines')
  check('process_operational_deadlines eseguito', !eRun, eRun?.message)

  const taskA = await getOpenTaskForBooking(sb, A.id)
  check('task creata per la prenotazione scaduta', !!taskA)
  check('type = booking.payment_window_expired (fatto di business)', taskA?.type === 'booking.payment_window_expired', taskA?.type)
  check('soggetto = booking_request / A', taskA?.subjectType === 'booking_request' && taskA?.subjectId === A.id)

  const taskFut = await getOpenTaskForBooking(sb, fut.id)
  check('NESSUNA task per la prenotazione non scaduta', taskFut === null)

  const { data: notif } = await db.from('notifications').select('id').eq('booking_request_id', A.id).eq('type', 'escalation')
  check('notifica staff creata', Array.isArray(notif) && notif.length >= 1)

  const { data: outMsgs } = await sb.from('messages').select('id').eq('conversation_id', A.conversationId).eq('direction', 'out')
  check('nessun messaggio outbound dal detector (no email al cliente)', Array.isArray(outMsgs) && outMsgs.length === 0)

  // ---- [2] Idempotenza ----
  console.log('\n[2] Idempotenza (seconda esecuzione non duplica)')
  await db.rpc('process_operational_deadlines')
  const { data: openForA } = await db.from('operational_tasks').select('id').eq('subject_id', A.id).eq('status', 'open')
  check('una sola task aperta per A dopo due run', Array.isArray(openForA) && openForA.length === 1, `count=${openForA?.length}`)

  // ---- [3] Ramo "Pagamento ricevuto" (obj 5) ----
  console.log('\n[3] Ramo "Pagamento ricevuto" → conferma')
  const t1 = await executeTransition(sb, { requestId: A.id, orgId, toStatus: 'confirmed', actor: 'staff', note: 'E2E: pagamento ricevuto' })
  check('transizione awaiting_payment → confirmed', t1.ok, JSON.stringify(t1))
  await resolveTaskForBooking(sb, { bookingRequestId: A.id, type: 'booking.payment_window_expired', resolution: 'paid' })
  const { data: aAfter } = await sb.from('booking_requests').select('status').eq('id', A.id).single()
  check('prenotazione confermata', aAfter?.status === 'confirmed', aAfter?.status)
  const { data: rA } = await db.from('operational_tasks').select('status, resolution').eq('subject_id', A.id)
  check('task risolta come paid', rA?.[0]?.status === 'resolved' && rA?.[0]?.resolution === 'paid', JSON.stringify(rA?.[0]))
  check('nessuna task aperta residua per A', (await getOpenTaskForBooking(sb, A.id)) === null)

  // ---- [4] Ramo "Pagamento non ricevuto" (obj 6) ----
  console.log('\n[4] Ramo "Pagamento non ricevuto" → annulla + comunica scadenza')
  const B = await makeAwaitingPaymentBooking('Bianchi E2E', true)
  await db.rpc('process_operational_deadlines')
  check('task creata per B', !!(await getOpenTaskForBooking(sb, B.id)))
  const t2 = await executeTransition(sb, { requestId: B.id, orgId, toStatus: 'cancelled', actor: 'staff', note: 'E2E: pagamento non ricevuto' })
  check('transizione awaiting_payment → cancelled', t2.ok, JSON.stringify(t2))
  const res = await deliverToGuest(sb, property, B.conversationId, { text: expiryText(normLang('it')) })
  check('deliverToGuest non invia email (canale web)', res.channel === 'website_chat' && res.sent === false, JSON.stringify(res))
  await resolveTaskForBooking(sb, { bookingRequestId: B.id, type: 'booking.payment_window_expired', resolution: 'not_paid' })
  const { data: bAfter } = await sb.from('booking_requests').select('status').eq('id', B.id).single()
  check('prenotazione cancellata', bAfter?.status === 'cancelled', bAfter?.status)
  const { data: bMsgs } = await sb.from('messages').select('content').eq('conversation_id', B.conversationId).eq('direction', 'out')
  check('comunicazione di scadenza consegnata all\'ospite', Array.isArray(bMsgs) && bMsgs.some((m) => String(m.content).includes('decaduta')), JSON.stringify(bMsgs?.map((m) => m.content)))
  const { data: rB } = await db.from('operational_tasks').select('status, resolution').eq('subject_id', B.id)
  check('task risolta come not_paid', rB?.[0]?.status === 'resolved' && rB?.[0]?.resolution === 'not_paid', JSON.stringify(rB?.[0]))
} finally {
  // ---- Cleanup dati di test ----
  console.log('\n[5] Cleanup dati di test')
  for (const id of createdBookings) {
    await db.from('operational_tasks').delete().eq('subject_id', id)
    await sb.from('notifications').delete().eq('booking_request_id', id)
    await sb.from('booking_request_events').delete().eq('booking_request_id', id)
    await sb.from('booking_requests').delete().eq('id', id)
  }
  for (const id of createdConversations) {
    await sb.from('messages').delete().eq('conversation_id', id)
    await sb.from('conversations').delete().eq('id', id)
  }
  console.log(`\n=== RISULTATO: ${pass} pass / ${fail} fail ===`)
  process.exit(fail === 0 ? 0 : 1)
}
