// PARTE 1 — Trasformazione dati Demo → LunArt (riuso in place).
// Esegue: pulizia dati demo/test su property A, riconfigurazione property/org,
// creazione camere 301-305, import KB LunArt. NON tocca property B, account, template globali.
// Uso: node --env-file=.env.local scripts/migrate-demo-to-lunart.mjs
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ORG = '00000000-0000-0000-0000-000000000001'
const PROP = '00000000-0000-0000-0000-000000000011' // Struttura Demo A -> LunArt B&B
const log = (...a) => console.log(...a)

async function count(t, col, val) {
  const q = sb.from(t).select('*', { count: 'exact', head: true })
  if (col) q.eq(col, val)
  const r = await q
  return r.error ? `KO ${r.error.message.slice(0,40)}` : r.count
}

log('\n===== BEFORE =====')
for (const t of ['rooms','rate_calendar','knowledge_assets','conversations','messages','booking_requests','ai_calls','guardrail_events','notifications'])
  log(`${t}: ${await count(t,'property_id',PROP)} (property A)`)

// --- 1a. dati test transazionali (property A) ---
log('\n--- 1a. pulizia dati test ---')
for (const t of ['ai_calls','guardrail_events','notifications','ip_blocklist','scoring_events','booking_request_events','booking_request_items','booking_requests','messages','conversations']) {
  // alcune tabelle non hanno property_id (scoring_events, br_events, br_items, messages): si puliscono via cascade dei parent.
  const hasProp = ['ai_calls','guardrail_events','notifications','ip_blocklist','booking_requests','conversations','messages'].includes(t)
  if (!hasProp) continue
  const { error } = await sb.from(t).delete().eq('property_id', PROP)
  log(`  ${t}: ${error ? 'KO '+error.message.slice(0,50) : 'ok'}`)
}

// --- 1b. KB demo/e2e (property A) ---
log('--- 1b. pulizia KB demo ---')
{
  const { error } = await sb.from('knowledge_assets').delete().eq('property_id', PROP)
  log(`  knowledge_assets: ${error ? 'KO '+error.message.slice(0,50) : 'ok'}`)
}

// --- 1c. camere demo (property A) -> cascade rate_calendar/ical_feeds ---
log('--- 1c. rimozione camere demo ---')
{
  const { error } = await sb.from('rooms').delete().eq('property_id', PROP)
  log(`  rooms: ${error ? 'KO '+error.message.slice(0,50) : 'ok (rate_calendar in cascade)'}`)
}

// --- 1d. org name ---
log('--- 1d. org -> LunArt Firenze ---')
log('  ' + JSON.stringify((await sb.from('organizations').update({ name: 'LunArt Firenze' }).eq('id', ORG).select('name')).data))

// --- 1e. property -> LunArt B&B + settings ---
log('--- 1e. property -> LunArt B&B ---')
{
  const { data: cur } = await sb.from('properties').select('settings').eq('id', PROP).single()
  const settings = {
    ...(cur?.settings ?? {}),
    direct_discount_pct: 18,
    city_tax_cents: 600,
    offer_validity_hours: 24,
    hold_hours: 24,
    ai_daily_budget_cents: 500,
    ai_conversation_cost_limit_cents: 50,
    ai_session_message_limit: 30,
    safe_mode: false,
    cancellation: 'non_refundable',
    payment_timing: 'advance',
    payment_methods: ['bonifico', 'paybylink_nexi'],
    city_tax_exempt: 'residenti_comune_firenze',
    disclaimer: 'La disponibilità non è ancora bloccata: questa è una proposta indicativa.',
  }
  const { error } = await sb.from('properties').update({
    name: 'LunArt B&B',
    address: 'Vicolo del Canneto 2',
    city: 'Firenze',
    default_language: 'it',
    timezone: 'Europe/Rome',
    supervision_mode: true,
    settings,
  }).eq('id', PROP)
  log(`  property: ${error ? 'KO '+error.message : 'ok (LunArt B&B, sconto 18%, tassa €6, offerta 24h)'}`)
}

// --- 1f. camere 301-305 ---
log('--- 1f. camere 301-305 ---')
const ROOMS = [
  { name: 'Camera 301 — Standard', max_guests: 2, description: 'La più raccolta, vista strada e Arno. Ideale per coppie o viaggiatori soli.' },
  { name: 'Camera 302 — Deluxe', max_guests: 2, description: 'Ampia e raffinata, vista strada, Arno e Uffizi parziale.' },
  { name: 'Camera 303 — Superior', max_guests: 3, description: 'La più richiesta: doppia esposizione, vista completa Arno e Uffizi. Allestibile come tripla.' },
  { name: 'Camera 304 — Deluxe', max_guests: 2, description: 'Spaziosa e luminosa, vista Uffizi e Arno.' },
  { name: 'Camera 305 — Superior', max_guests: 3, description: 'Ampia, doppia esposizione Arno e Uffizi. La più appartata/tranquilla. Allestibile come tripla.' },
]
for (const r of ROOMS) {
  const { error } = await sb.from('rooms').insert({ org_id: ORG, property_id: PROP, name: r.name, max_guests: r.max_guests, description: r.description })
  log(`  ${r.name} (cap ${r.max_guests}): ${error ? 'KO '+error.message.slice(0,50) : 'ok'}`)
}

// --- 1g. KB LunArt ---
log('--- 1g. import KB LunArt ---')
const G = ['lunart', 'golden'], L = ['lunart']
const KB = [
  ['faq', 'Check-in e Check-out', 'Check-in dalle 15:00 con accoglienza personale di Diego (15:00–21:00). Dopo le 21:00 self check-in con codici digitali inviati via messaggio, assistenza remota sempre disponibile. Check-out entro le 11:00. Deposito bagagli gratuito all’Opera Caffè se necessario.', G, 100],
  ['faq', 'Colazione', 'Colazione inclusa ogni mattina. Principale a L’Opera Caffè (Piazza del Duomo 62R, 8:30–11:00, ristorante di famiglia, sconto 30% sugli extra mostrando la conferma). Alternativa light al Caffè Maioli ai piedi dell’edificio. Colazione dell’alba su richiesta entro la sera prima. Diete (vegano/vegetariano/senza glutine) da comunicare il giorno prima.', G, 100],
  ['faq', 'Parcheggio e ZTL', 'Garage Lungarno (Borgo San Iacopo 10, ~€35/giorno fisso, prenotabile su garagelungarno.it) o Garage Ponte Vecchio (stesso edificio, valet, €35–70 per dimensione). LunArt è in ZTL: dal passaggio sotto la telecamera si hanno max 2h30 per arrivare al garage e registrare la targa. All’uscita non ripassare dalle telecamere ZTL.', G, 100],
  ['faq', 'WiFi', 'WiFi gratuito in tutta la struttura. Rete: LunArt-Guest — Password: LOPERACAFFE62R.', G, 100],
  ['faq', 'Animali', 'Animali valutati caso per caso: contattare la struttura prima della prenotazione.', G, 100],
  ['faq', 'Bambini e culle', 'Culle/lettini disponibili su richiesta, da segnalare almeno il giorno prima. Età minima per il soggiorno 18 anni, salvo autorizzazione scritta del genitore.', G, 100],
  ['faq', 'Accessibilità', 'La struttura è al 3° piano con ascensore disponibile.', G, 100],
  ['faq', 'Come arrivare e posizione', 'Vicolo del Canneto 2, 50125 Firenze, centro storico: 200m da Ponte Vecchio, 500m dagli Uffizi. Dalla stazione SMN ~15 min a piedi o taxi ~€8–12. Dall’aeroporto Peretola taxi ~20 min (~€22–28) o tramvia T2. NCC privato prenotabile tramite la struttura.', G, 100],
  ['policy', 'Cancellazione', 'La prenotazione non è cancellabile: il pagamento è anticipato e non rimborsabile.', G, 100],
  ['faq', 'Le camere', 'Cinque camere al 3° piano, tutte con bagno privato e vista sull’Arno: 301 Standard, 302 Deluxe, 303 Superior (la più richiesta, vista completa), 304 Deluxe, 305 Superior (la più appartata e tranquilla). 303 e 305 allestibili come triple. Essendo in pieno centro storico, tutte le camere possono percepire il normale rumore urbano.', L, 60],
  ['policy', 'Pagamento e conferma', 'Pagamento anticipato tramite bonifico bancario o PayByLink Nexi. La prenotazione è confermata alla ricezione della contabile/pagamento. La fattura va richiesta prima dell’emissione dello scontrino.', L, 60],
  ['policy', 'Tassa di soggiorno', 'Tassa di soggiorno €6 a persona per notte, da saldare in struttura. Esenti i residenti nel Comune di Firenze; altre esenzioni secondo normativa, con documentazione giustificativa.', L, 60],
  ['faq', 'Deposito bagagli', 'Deposito bagagli gratuito all’Opera Caffè (Piazza del Duomo 62R), orari 8:30–20:00 (fino a mezzanotte in alta stagione), ritiro a qualsiasi ora. Valido sia prima del check-in sia dopo il check-out.', L, 50],
  ['faq', 'Sconto Opera Caffè', 'Gli ospiti LunArt hanno il 30% di sconto su tutto il menù al tavolo dell’Opera Caffè (Piazza del Duomo 62R). Mostrare la conferma di prenotazione prima di ordinare.', L, 50],
  ['faq', 'Dotazioni in camera', 'Ogni camera: letto matrimoniale, bagno privato con doccia, accappatoio e pantofole, AC + riscaldamento, TV, minibar e frigo, macchina Nespresso, bollitore con tè/tisane, cassaforte, scaldasalviette. Prosecco di benvenuto e acqua all’arrivo.', L, 40],
  ['faq', 'Ristoranti consigliati', 'Bistecca/toscana: Trattoria dall’Oste, Antico Ristorante Paoli 1827, Perseus. Trattoria classica: Cammillo. Romantico: La Giostra. Tartufo/terrazza: Osteria delle Tre Panche.', L, 30],
  ['faq', 'Gelaterie e aperitivo', 'Gelato: Sbrino (Oltrarno), Vivoli (storica), Edoardo (biologico, Duomo), La Carraia. Aperitivo: L’Opera Caffè (30% sconto ospiti) e Il Santino (wine bar).', L, 30],
  ['faq', 'Musei e itinerari', 'Uffizi (mar–dom 8:15–18:30, chiuso lun) e Galleria dell’Accademia/David (mar–dom 8:15–18:50). Prenotazione consigliata. Gite: Pisa, Siena, Chianti, San Gimignano. Itinerari su misura su richiesta.', L, 30],
  ['faq', 'Contatti', 'Prenotazioni e commerciale: Jacopo +39 392 472 5263. Check-in e assistenza: Diego +39 334 211 5505. Email: lunartfirenze@gmail.com.', L, 40],
]
for (const [type, title, content, tags, priority] of KB) {
  const { error } = await sb.from('knowledge_assets').insert({
    org_id: ORG, property_id: PROP, type, origin: 'manual', title, content,
    languages: ['it'], tags, usable_by_concierge: true, priority,
  })
  log(`  [${tags.includes('golden')?'★':' '}] ${title}: ${error ? 'KO '+error.message.slice(0,60) : 'ok'}`)
}

log('\n===== AFTER =====')
log(`org: ${JSON.stringify((await sb.from('organizations').select('name').eq('id',ORG).single()).data)}`)
log(`property: ${JSON.stringify((await sb.from('properties').select('name,address,city').eq('id',PROP).single()).data)}`)
for (const t of ['rooms','rate_calendar','knowledge_assets','conversations','booking_requests','ai_calls'])
  log(`${t}: ${await count(t,'property_id',PROP)} (property A)`)
log(`property B (intatta): ${JSON.stringify((await sb.from('properties').select('name').eq('id','00000000-0000-0000-0000-000000000012').single()).data)}`)
log('\n✓ PARTE 1 completata')
