// Router Training Sprint #1 — verifica falsi positivi risolti (offline, deterministico).
// Uso: node --import tsx scripts/test-router-falsepositives.mts
import { classifyEmailDeterministic, getRoutingRules } from '@/lib/email/routing'
import type { InboundEmail } from '@/lib/email/gmail'

const rules = getRoutingRules({}) // nessun dominio per-property → esercita solo le liste BASE
const email = (from: string, subject = ''): InboundEmail => ({
  id: 'x', threadId: 't', from, fromName: '', subject, rfcMessageId: '', references: '', inReplyTo: '', body: '',
})
let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }
const cat = (e: InboundEmail) => classifyEmailDeterministic(e, rules)?.category ?? 'guest(default)'

console.log('— Falsi positivi del pilot → ora NON guest —')
ok(cat(email('info@tonicosrl.it', 'Fatture Insolute - Tonico srl')) === 'supplier_admin', 'Tonico → supplier_admin')
ok(cat(email('info@tonicosrl.it', 'Tonico Laundry App -PASSWORD')) === 'supplier_admin', 'Tonico (password) → supplier_admin')
ok(cat(email('order-update@amazon.it', 'Consegnati: 2 articoli')) === 'supplier_admin', 'Amazon order-update → supplier_admin')
ok(cat(email('shipment-tracking@amazon.it', 'In consegna')) === 'supplier_admin', 'Amazon shipment → supplier_admin')
ok(cat(email('re-mail@posteitaliane.it', 'Richiesta Ritiro Amazon.it')) === 'supplier_admin', 'Poste → supplier_admin')

console.log('\n— NESSUN over-blocking: ambigui/ospiti restano guest —')
ok(cat(email('camilla.murgia2467@libero.it', 'Business traveler confirming accommodation')) === 'guest(default)', 'libero.it ambiguo → resta guest (non bloccato)')
ok(cat(email('mario.rossi@gmail.com', 'Avete disponibilità dal 10 al 12 settembre?')) === 'guest(default)', 'ospite gmail → resta guest')

console.log('\n— Regressioni: classificazioni esistenti invariate —')
ok(cat(email('no-reply@properties.booking.com', 'Aggiornamento tariffe')) === 'ota_pms', 'Booking → ota_pms (BASE_OTA)')
ok(cat(email('promotion-it@amazon.it', 'Prime Day')) === 'supplier_admin', 'Amazon promo → supplier_admin (prima newsletter; ora supplier, comunque NON guest)')

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} pass, ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
