// Router Training Sprint #1 — corpus di regressione L0 (offline, deterministico, nessuna credenziale).
// Uso: node --import tsx scripts/test-router-corpus.mts
//
// DUE INVARIANTI:
//  1. ZERO OVER-BLOCKING (hard): nessun caso etichettato 'guest' può essere classificato non-guest.
//     Un fallimento qui è un blocker assoluto: significherebbe che un ospite reale non riceve risposta.
//  2. Copertura non-guest (target): i mittenti transazionali/amministrativi noti NON cadono in 'guest'.
import { classifyEmailDeterministic, getRoutingRules, hasAutomatedMarkers } from '@/lib/email/routing'
import type { InboundEmail } from '@/lib/email/gmail'

const rules = getRoutingRules({})
type Label = 'guest' | 'ota_pms' | 'supplier_admin' | 'newsletter_spam'
interface Case { from: string; subject: string; expect: Label; note?: string; headers?: Partial<InboundEmail> }

const mk = (c: Case): InboundEmail => ({
  id: 'x', threadId: 't', from: c.from.toLowerCase(), fromName: '', subject: c.subject,
  rfcMessageId: '', references: '', inReplyTo: '', body: '', ...c.headers,
})
const classify = (e: InboundEmail): Label => classifyEmailDeterministic(e, rules)?.category ?? 'guest'

const CORPUS: Case[] = [
  // ===== GUEST (invariante hard: devono TUTTI restare guest) =====
  { from: 'mario.rossi@gmail.com', subject: 'Disponibilità 10-12 settembre?', expect: 'guest' },
  { from: 'camilla.murgia@libero.it', subject: 'Richiesta preventivo camera doppia', expect: 'guest' },
  { from: 'j.smith@yahoo.com', subject: 'Booking inquiry for October', expect: 'guest' },
  { from: 'famille.dupont@orange.fr', subject: 'Réservation chambre familiale', expect: 'guest' },
  { from: 'hans.mueller@gmx.de', subject: 'Zimmeranfrage Ende September', expect: 'guest' },
  { from: 'anna.bianchi@icloud.com', subject: 'Info parcheggio e colazione', expect: 'guest' },
  { from: 'p.verdi@hotmail.it', subject: 'Re: Conferma prenotazione e pagamento', expect: 'guest', note: 'parole "prenotazione/pagamento" nel subject NON devono bloccare un ospite in thread' },
  { from: 'sara.neri@protonmail.com', subject: 'Domanda sulla fattura del soggiorno', expect: 'guest', note: 'ospite che CHIEDE la fattura resta guest (nessuna euristica subject)' },
  { from: 'g.russo@acmecorp.it', subject: 'Trasferta di lavoro: 3 notti', expect: 'guest', note: 'business traveler da dominio aziendale sconosciuto → guest' },
  { from: 'ordinello.mario@gmail.com', subject: 'Camera per due', expect: 'guest', note: 'localpart che CONTIENE "ordin" ma non è ordini@ → guest' },
  { from: 'billing.expert.travel@gmail.com', subject: 'Weekend lungo', expect: 'guest', note: 'localpart contiene "billing" ma non è billing@ esatto → guest' },
  { from: 'lucia@amazonia-viaggi.it', subject: 'Gruppo 6 persone', expect: 'guest', note: 'dominio contiene "amazon" ma NON è brand amazon.<tld> → guest' },
  { from: 'marco@paypalace.it', subject: 'Prenotazione anniversario', expect: 'guest', note: 'paypalace ≠ paypal.<tld> → guest' },
  { from: 'reception@amazon.finto.it', subject: 'Richiesta soggiorno', expect: 'guest', note: 'brand non in posizione registrabile → guest' },
  { from: 'amministrazione@azienda.it', subject: 'Prenotazione 2 camere per trasferta dipendenti', expect: 'guest', note: 'REGRESSIONE CODEX: segreteria aziendale che prenota → DEVE restare guest (niente euristiche localpart)' },
  { from: 'orders@personal-domain.com', subject: 'Room availability next weekend?', expect: 'guest', note: 'REGRESSIONE CODEX: localpart orders@ su dominio personale → guest' },
  { from: 'mario.rossi@pec.it', subject: 'Richiesta disponibilità e preventivo', expect: 'guest', note: 'REGRESSIONE CODEX: PEC personale → guest (provider PEC generici NON in blocklist)' },
  { from: 'anna.bruni@legalmail.it', subject: 'Prenotazione weekend', expect: 'guest', note: 'PEC personale legalmail → guest' },
  { from: 'Mario Rossi <mario.rossi.display@gmail.com>', subject: 'Info camere', expect: 'guest', note: 'display-form "Nome <addr>" difensivo → guest' },

  // ===== SUPPLIER_ADMIN — pilot FP osservati =====
  { from: 'info@tonicosrl.it', subject: 'Fatture Insolute - Tonico srl', expect: 'supplier_admin' },
  { from: 'order-update@amazon.it', subject: 'Consegnati: 2 articoli', expect: 'supplier_admin' },
  { from: 're-mail@posteitaliane.it', subject: 'Richiesta Ritiro Amazon.it', expect: 'supplier_admin' },
  // ===== SUPPLIER_ADMIN — brand multi-TLD =====
  { from: 'shipment-tracking@amazon.com', subject: 'Delivered', expect: 'supplier_admin' },
  { from: 'bestellung@amazon.de', subject: 'Ihre Bestellung', expect: 'supplier_admin' },
  { from: 'service@paypal.it', subject: 'Hai ricevuto un pagamento', expect: 'supplier_admin' },
  { from: 'service@paypal.com', subject: 'Payment received', expect: 'supplier_admin' },
  // ===== SUPPLIER_ADMIN — corrieri/logistica =====
  { from: 'tracking@brt.it', subject: 'Spedizione in consegna', expect: 'supplier_admin' },
  { from: 'noreply.notification@dhl.com', subject: 'Shipment update', expect: 'supplier_admin' },
  { from: 'info@gls-italy.com', subject: 'Avviso di giacenza', expect: 'supplier_admin' },
  { from: 'notifiche@poste.it', subject: 'Raccomandata in arrivo', expect: 'supplier_admin' },
  // ===== SUPPLIER_ADMIN — banche/pagamenti =====
  { from: 'comunicazioni@intesasanpaolo.com', subject: 'Estratto conto disponibile', expect: 'supplier_admin' },
  { from: 'noreply@nexi.it', subject: 'Movimento carta', expect: 'supplier_admin' },
  { from: 'notifications@stripe.com', subject: 'Payout completed', expect: 'supplier_admin' },
  // ===== SUPPLIER_ADMIN — utility/telecom =====
  { from: 'bolletta@enel.it', subject: 'Bolletta luce settembre', expect: 'supplier_admin' },
  { from: 'fatturazione@fastweb.it', subject: 'Fattura disponibile', expect: 'supplier_admin' },
  { from: 'clienti@vodafone.it', subject: 'La tua offerta', expect: 'supplier_admin' },
  // ===== SUPPLIER_ADMIN — istituzionale/PEC =====
  { from: 'noreply@agenziaentrate.gov.it', subject: 'Comunicazione', expect: 'supplier_admin' },

  // ===== Localpart transazionali su dominio SCONOSCIUTO: L0 NON decide (rischio over-block:
  // una segreteria può prenotare da amministrazione@) → restano guest al livello deterministico;
  // il fornitore ricorrente specifico si aggiunge per-property via settings.supplierDomains =====
  { from: 'fatture@studiorossi.it', subject: 'Fattura n. 133/2026', expect: 'guest', note: 'dominio ignoto: L0 non decide → guest (da gestire per-property o L1)' },
  { from: 'amministrazione@lavanderiablu.it', subject: 'Sollecito pagamento', expect: 'guest', note: 'dominio ignoto: L0 non decide → guest' },

  // ===== OTA_PMS =====
  { from: 'no-reply@properties.booking.com', subject: 'Aggiornamento tariffe', expect: 'ota_pms' },
  { from: 'noreply@expediapartnercentral.com', subject: 'New booking', expect: 'ota_pms' },
  { from: 'automated@airbnb.com', subject: 'Nuova prenotazione confermata', expect: 'ota_pms' },
  { from: 'alerts@channelmanagerx.com', subject: 'New reservation confirmed for Sept 12', expect: 'ota_pms', note: 'pattern subject OTA da dominio ignoto' },

  // ===== NEWSLETTER_SPAM =====
  { from: 'news@turismoitalia.it', subject: 'Newsletter settembre: eventi', expect: 'newsletter_spam' },
  { from: 'promo@hotelsupplies.com', subject: 'Offerte — unsubscribe anytime', expect: 'newsletter_spam' },
  { from: 'noreply@eventbrite.com', subject: 'Eventi vicino a te', expect: 'newsletter_spam', note: 'noreply@ non OTA/fornitore → newsletter (ignora)' },
  { from: 'updates@somesaas.com', subject: 'Product changelog', expect: 'newsletter_spam', headers: { listUnsubscribe: '<mailto:unsub@somesaas.com>' } },
]

// Per-property supplierDomains: il canale giusto per i fornitori specifici (es. commercialista in PEC).
const propertyRules = getRoutingRules({ email_routing: { otaDomains: [], supplierDomains: ['studiorossi.it'] } })
const propertyCase = mk({ from: 'fatture@studiorossi.it', subject: 'Fattura n. 133/2026', expect: 'supplier_admin' })
const propertyOk = classifyEmailDeterministic(propertyCase, propertyRules)?.category === 'supplier_admin'

let pass = 0
const failures: string[] = []
let guestViolations = 0
for (const c of CORPUS) {
  const got = classify(mk(c))
  const ok = got === c.expect
  if (ok) pass++
  else {
    failures.push(`  ✗ ${c.from} [${c.subject}] → atteso ${c.expect}, ottenuto ${got}${c.note ? ` (${c.note})` : ''}`)
    if (c.expect === 'guest') guestViolations++
  }
}

// Difesa in profondità: i marcatori automatici restano indipendenti dal classificatore.
const auto = mk({ from: 'x@y.it', subject: 's', expect: 'guest', headers: { autoSubmitted: 'auto-generated' } })
if (hasAutomatedMarkers(auto)) pass++
else { failures.push('  ✗ hasAutomatedMarkers(auto-generated) deve essere true'); }
if (propertyOk) pass++
else { failures.push('  ✗ supplierDomains per-property (studiorossi.it) deve dare supplier_admin'); }

const total = CORPUS.length + 2  // corpus email + 1 assert marcatori automatici + 1 assert per-property
console.log(`Corpus router L0: ${pass}/${total} pass (${CORPUS.length} email etichettate + 2 assert)`)
if (failures.length) console.log(failures.join('\n'))
if (guestViolations > 0) {
  console.log(`\n❌ INVARIANTE VIOLATA: ${guestViolations} caso/i GUEST classificati non-guest (over-blocking) — BLOCKER`)
  process.exit(2)
}
console.log(failures.length === 0 ? '✅ corpus verde (zero over-blocking)' : '❌ fallimenti di copertura non-guest')
process.exit(failures.length === 0 ? 0 : 1)
