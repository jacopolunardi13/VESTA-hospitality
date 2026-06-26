// Document Center MVP — unit test (offline, nessuna rete): allegati Gmail + filtri PDF + registry
// recognizer (seam estensibile del Back Office Assistant).
// Uso: node --import tsx scripts/test-doc-attachments.mts
import { extractAttachments } from '@/lib/email/gmail'
import { isPdf, safeName } from '@/lib/documents-center/ingest'
import { recognizeEmail, RECOGNIZERS } from '@/lib/documents-center/registry'
import type { InboundEmail } from '@/lib/email/gmail'
import type { RouteResult } from '@/lib/email/routing'

let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }

// Payload Gmail realistico: multipart/mixed con corpo + 1 PDF + 1 inline senza attachmentId.
const payload = {
  mimeType: 'multipart/mixed',
  parts: [
    { mimeType: 'multipart/alternative', parts: [
      { mimeType: 'text/plain', body: { data: 'Y2lhbw' } },
      { mimeType: 'text/html', body: { data: 'PGI+' } },
    ] },
    { mimeType: 'application/pdf', filename: 'Fattura 12345.pdf', body: { attachmentId: 'ATT_1', size: 1000 } },
    { mimeType: 'image/png', filename: 'logo.png', body: {} }, // inline, no attachmentId → ignorato
  ],
}

console.log('— extractAttachments —')
const atts = extractAttachments(payload)
ok(atts.length === 1, 'estrae solo le parti con attachmentId (1, non il PNG inline)')
ok(atts[0]?.id === 'ATT_1', 'attachmentId corretto')
ok(atts[0]?.filename === 'Fattura 12345.pdf', 'filename corretto')
ok(atts[0]?.mimeType === 'application/pdf', 'mimeType corretto')
ok(extractAttachments(undefined).length === 0, 'payload undefined → []')
ok(extractAttachments({ mimeType: 'text/plain', body: { data: 'x' } }).length === 0, 'email senza allegati → []')

console.log('\n— isPdf (deterministico) —')
ok(isPdf({ filename: 'a.pdf', mimeType: 'application/octet-stream' }) === true, 'estensione .pdf → true')
ok(isPdf({ filename: 'a', mimeType: 'application/pdf' }) === true, 'mime pdf → true')
ok(isPdf({ filename: 'foto.PDF', mimeType: 'image/png' }) === true, 'estensione .PDF maiuscola → true')
ok(isPdf({ filename: 'foto.png', mimeType: 'image/png' }) === false, 'png → false')

console.log('\n— safeName —')
ok(!safeName('Fattura 12345.pdf').includes(' '), 'rimuove spazi')
ok(!safeName('../../etc/passwd').includes('/'), 'rimuove slash (no path traversal)')
ok(safeName('').length > 0, 'fallback non vuoto')
ok(/\.pdf$/.test(safeName('Receipt.pdf')), 'mantiene estensione')

console.log('\n— registry recognizer (Supplier Knowledge) —')
const email = (subject: string): InboundEmail => ({ id: 'm1', threadId: 't1', from: 'noreply@booking.com', fromName: 'Booking', subject, rfcMessageId: '', references: '', inReplyTo: '', body: '' })
const route = (category: RouteResult['category'], source: RouteResult['source']): RouteResult => ({ category, source, confidence: 0.97, method: 'deterministic' })

const recB = recognizeEmail(email('Booking.com Invoice 123'), route('ota_pms', 'booking'))
ok(recB?.id === 'booking', 'email Booking (ota_pms/booking) → recognizer booking')
ok(recB?.library === 'vesta', 'recognizer booking è libreria Vesta')
const meta = recB!.describe(email('Booking.com Invoice 123'), { id: 'a', filename: 'invoice-123.pdf', mimeType: 'application/pdf' })
ok(meta.supplier === 'Booking.com' && meta.category === 'invoice' && meta.status === 'ready_for_accountant', 'metadati Booking: invoice → Pronto per il commercialista')
ok(meta.heading === 'Booking.com Invoice 123', 'heading = oggetto email')
ok(recognizeEmail(email('Prenotazione Expedia'), route('ota_pms', 'expedia')) === null, 'Expedia → nessun recognizer (MVP solo Booking)')
ok(recognizeEmail(email('Fattura n.930 TONICO SRL'), route('supplier_admin', null)) === null, 'fornitore italiano (Tonico) → nessun recognizer nell\'MVP (Fase 2)')
ok(recognizeEmail(email('Disponibilità camera?'), route('guest', null)) === null, 'email ospite → nessun recognizer')
ok(RECOGNIZERS.length === 1, 'MVP: un solo recognizer registrato (Booking)')

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} pass, ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
