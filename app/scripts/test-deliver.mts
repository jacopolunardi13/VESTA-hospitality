// Test della parte PURA del layer di consegna: resolveEmailThread (estrazione threading email
// dai metadata del messaggio inbound). Il resto (dispatch canale + invio) è integrazione e va
// testato in produzione dopo l'applicazione della migrazione 0012.
// Uso: node --import tsx scripts/test-deliver.mts
import { resolveEmailThread } from '@/lib/delivery/deliverToGuest'

let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }

const full = resolveEmailThread({
  channel: 'email', gmail_thread_id: 'THREAD123', rfc_message_id: '<abc@mail>',
  references: '<x@mail> <y@mail>', subject: 'Disponibilità agosto',
})
ok(full.threadId === 'THREAD123', `threadId (${full.threadId})`)
ok(full.inReplyTo === '<abc@mail>', `inReplyTo (${full.inReplyTo})`)
ok(full.references === '<x@mail> <y@mail>', 'references')
ok(full.subject === 'Disponibilità agosto', 'subject')

const empty = resolveEmailThread(null)
ok(empty.threadId === undefined && empty.subject === '', 'metadata null → campi vuoti, nessun crash')

const partial = resolveEmailThread({ channel: 'email', subject: 'Re: x' })
ok(partial.threadId === undefined && partial.subject === 'Re: x', 'metadata parziale → solo i campi presenti')

const wrongTypes = resolveEmailThread({ gmail_thread_id: 123, subject: { a: 1 } })
ok(wrongTypes.threadId === undefined && wrongTypes.subject === '', 'tipi errati ignorati (no crash)')

console.log(`\n════ ${pass} passati, ${fail} falliti ════`)
process.exit(fail > 0 ? 1 : 0)
