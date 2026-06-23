// Harness Router L0 + parser OTA — funzioni PURE, nessun DB, nessuna rete (AI mockata).
// Uso: node --import tsx scripts/test-email-router.mts
import { classifyEmailDeterministic, classifyEmailCategory, getRoutingRules, type AiCategoryProposer } from '@/lib/email/routing'
import { parseOtaEmail } from '@/lib/email/ota-parsers'
import type { InboundEmail } from '@/lib/email/gmail'

let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }

const mk = (p: Partial<InboundEmail>): InboundEmail => ({
  id: 'x', threadId: 't', from: '', fromName: '', subject: '', rfcMessageId: '', references: '',
  inReplyTo: '', body: '', listUnsubscribe: '', autoSubmitted: '', precedence: '', ...p,
})
const rules = getRoutingRules({ email_routing: { supplierDomains: ['fornitore-biancheria.it'], otaDomains: ['mychannelmgr.io'] } })

console.log('— Router: deterministico —')
const det = (p: Partial<InboundEmail>) => classifyEmailDeterministic(mk(p), rules)
ok(det({ from: 'noreply@booking.com', subject: 'New reservation' })?.source === 'booking', 'Booking → ota_pms/booking')
ok(det({ from: 'no-reply@expedia.com' })?.source === 'expedia', 'Expedia → ota_pms/expedia')
ok(det({ from: 'automated@airbnb.com' })?.source === 'airbnb', 'Airbnb → ota_pms/airbnb')
ok(det({ from: 'noreply@quovai.com' })?.source === 'quovai', 'QuoVai → ota_pms/quovai')
ok(det({ from: 'info@mychannelmgr.io' })?.category === 'ota_pms', 'dominio OTA da settings → ota_pms')
ok(det({ from: 'ordini@fornitore-biancheria.it' })?.category === 'supplier_admin', 'fornitore (settings) → supplier_admin')
ok(det({ from: 'news@brand.com', listUnsubscribe: '<mailto:u@brand.com>' })?.category === 'newsletter_spam', 'List-Unsubscribe → newsletter_spam')
ok(det({ from: 'no-reply@random.com' })?.category === 'newsletter_spam', 'no-reply generico → newsletter_spam')
ok(det({ from: 'mario.rossi@gmail.com', subject: 'Disponibilità agosto' }) === null, 'ospite normale → nessun match deterministico (→ default guest)')
ok(det({ from: 'booking@hotelpartner.xyz', subject: 'Nuova prenotazione confermata' })?.category === 'ota_pms', 'oggetto tipico notifica → ota_pms')

console.log('\n— Router: AI solo sul dubbio, propone solo categoria —')
const aiSupplier: AiCategoryProposer = async () => ({ category: 'supplier_admin', confidence: 0.9 })
const aiGuest: AiCategoryProposer = async () => ({ category: 'guest', confidence: 0.9 })
const aiWeak: AiCategoryProposer = async () => ({ category: 'ota_pms', confidence: 0.5 })
const amb = mk({ from: 'qualcuno@dominio-sconosciuto.it', subject: 'richiesta' })
ok((await classifyEmailCategory(amb, rules, aiSupplier)).category === 'supplier_admin', 'AI confidente non-ospite → usa la proposta')
ok((await classifyEmailCategory(amb, rules, aiGuest)).category === 'guest', 'AI dice guest → guest')
ok((await classifyEmailCategory(amb, rules, aiWeak)).category === 'guest', 'AI debole (<0.7) → dubbio → guest')
ok((await classifyEmailCategory(amb, rules)).method === 'default' && (await classifyEmailCategory(amb, rules)).category === 'guest', 'nessuna AI → dubbio → guest (default)')
ok((await classifyEmailCategory(mk({ from: 'noreply@booking.com' }), rules, aiGuest)).source === 'booking', 'deterministico ha precedenza sull\'AI')

console.log('\n— Parser OTA —')
const booking = parseOtaEmail('booking', mk({
  subject: 'La tua prenotazione è confermata',
  body: 'Booking number: 4839201756\nOspite: Mario Rossi\nCheck-in: 1 agosto 2026\nCheck-out: 3 agosto 2026\nCamera: Doppia Deluxe\nTotale: € 410,00',
}))
ok(booking.external_id === '4839201756', `Booking external_id (${booking.external_id})`)
ok(booking.check_in === '2026-08-01' && booking.check_out === '2026-08-03', `date (${booking.check_in}→${booking.check_out})`)
ok(booking.guest_name?.startsWith('Mario') === true, `ospite (${booking.guest_name})`)
ok(booking.amount_cents === 41000, `importo (${booking.amount_cents})`)
ok(booking.status === 'new', `status new (${booking.status})`)
ok(booking.confidence >= 0.8, `confidence alta (${booking.confidence})`)

const cancel = parseOtaEmail('booking', mk({ subject: 'Prenotazione cancellata', body: 'La prenotazione 4839201756 è stata cancellata.' }))
ok(cancel.status === 'cancelled', `cancellazione → status cancelled (${cancel.status})`)

const expedia = parseOtaEmail('expedia', mk({ subject: 'Itinerary', body: 'Itinerary 7720193845566\ndal 2026-09-10 al 2026-09-12' }))
ok(expedia.external_id === '7720193845566' && expedia.check_in === '2026-09-10', `Expedia id+date (${expedia.external_id}, ${expedia.check_in})`)

const sparse = parseOtaEmail('unknown', mk({ subject: 'notifica', body: 'nessun dato strutturato' }))
ok(sparse.confidence < 0.5, `email povera → confidence bassa (${sparse.confidence})`)

console.log(`\n════ ${pass} passati, ${fail} falliti ════`)
process.exit(fail > 0 ? 1 : 0)
