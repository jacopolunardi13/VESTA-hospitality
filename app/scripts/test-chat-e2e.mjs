// E2E reale del Concierge: seed KB → scenari via /api/chat (server vivo) → ispezione DB.
// Uso: (1) npm run dev  (2) node --env-file=.env.local scripts/test-chat-e2e.mjs
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'
const PROPERTY_ID = '00000000-0000-0000-0000-000000000011' // Struttura Demo A
const ORG_ID = '00000000-0000-0000-0000-000000000001'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const KB = [
  ['Parcheggio', 'Parcheggio privato gratuito in struttura, non serve prenotare.'],
  ['Check-in e Check-out', 'Check-in dalle 15:00, check-out entro le 10:30.'],
  ['Colazione', 'Colazione a buffet inclusa, servita dalle 7:30 alle 10:00.'],
  ['Animali', 'Animali di piccola taglia ammessi senza supplemento.'],
  ['Cancellazione', 'Cancellazione gratuita fino a 7 giorni prima dell’arrivo.'],
]

async function seedKb() {
  await sb.from('knowledge_assets').delete().eq('property_id', PROPERTY_ID).contains('tags', ['e2e_seed'])
  const { error } = await sb.from('knowledge_assets').insert(
    KB.map(([title, content]) => ({
      org_id: ORG_ID, property_id: PROPERTY_ID, type: 'faq', origin: 'manual',
      title, content, tags: ['golden', 'e2e_seed'], priority: 50, usable_by_concierge: true,
    }))
  )
  if (error) throw new Error('seed KB: ' + error.message)
  console.log(`  ✓ KB seedata (${KB.length} asset)`)
}

async function chat(message, conversationId = null) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ propertyId: PROPERTY_ID, conversationId, message }),
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}

async function waitServer() {
  for (let i = 0; i < 30; i++) {
    try { const r = await chat('ping-readiness'); if (r.status < 500) return true } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

const SCENARIOS = [
  { tag: 'BOOKING',      msg: 'Buongiorno, avete disponibilità dal 10 al 12 agosto per 2 adulti?' },
  { tag: 'FAQ',          msg: 'C’è il parcheggio in struttura e a che ora è il check-in?' },
  { tag: 'PARTNERSHIP',  msg: 'Salve, siamo un tour operator e vorremmo concordare tariffe per gruppi.' },
  { tag: 'RECLAMO',      msg: 'Voglio un rimborso, servizio pessimo, voglio parlare con una persona.' },
]

console.log('\n──────── Setup ────────')
await seedKb()
console.log('  Attendo il dev server su ' + BASE + ' …')
if (!(await waitServer())) { console.error('✗ Server non raggiungibile. Avvia `npm run dev`.'); process.exit(1) }
console.log('  ✓ Server pronto')

const results = []
console.log('\n──────── Scenari (chat reale → /api/chat) ────────')
for (const s of SCENARIOS) {
  const { status, data } = await chat(s.msg)
  console.log(`\n[${s.tag}]`)
  console.log(`👤 ${s.msg}`)
  console.log(`   status HTTP: ${status} | intent: ${data.intent} | stage: ${data.stage} | source: ${data.source} | escalated: ${data.escalated ?? false}`)
  console.log(`🤖 ${data.reply || '(nessuna risposta)'}`)
  results.push({ ...s, ...data })
}

console.log('\n──────── Ispezione DB ────────')
const booking = results.find((r) => r.tag === 'BOOKING')
if (booking?.conversationId) {
  const { data: conv } = await sb.from('conversations')
    .select('id,intent,intent_confidence,stage,status,booking_request_id').eq('id', booking.conversationId).single()
  console.log('Conversazione booking:', JSON.stringify(conv))
  if (conv?.booking_request_id) {
    const { data: br } = await sb.from('booking_requests')
      .select('id,status,source,created_at').eq('id', conv.booking_request_id).single()
    console.log('Lead (booking_request):', JSON.stringify(br))
    const { data: ev } = await sb.from('booking_request_events')
      .select('from_status,to_status,actor,note').eq('booking_request_id', conv.booking_request_id)
    console.log('Eventi lead:', JSON.stringify(ev))
  }
  const { count: msgCount } = await sb.from('messages')
    .select('*', { count: 'exact', head: true }).eq('conversation_id', booking.conversationId)
  console.log('Messaggi persistiti (conversazione booking):', msgCount)
}

const today = new Date(); today.setUTCHours(0, 0, 0, 0)
const { data: calls } = await sb.from('ai_calls')
  .select('function,model,input_tokens,output_tokens').eq('property_id', PROPERTY_ID).gte('created_at', today.toISOString())
console.log(`\nai_calls oggi: ${calls?.length ?? 0}`)
const byFn = {}
for (const c of calls ?? []) byFn[c.function] = (byFn[c.function] ?? 0) + 1
console.log('  per funzione:', JSON.stringify(byFn))

console.log('\n✓ E2E completato. Dati di test mantenuti sul remote per ispezione in dashboard.')
