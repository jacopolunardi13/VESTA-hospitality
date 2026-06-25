// Document Center MVP — unit test (offline, nessuna rete): estrazione allegati Gmail + filtri PDF.
// Uso: node --import tsx scripts/test-doc-attachments.mts
import { extractAttachments } from '@/lib/email/gmail'
import { isPdf, safeName } from '@/lib/documents-center/ingest'

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

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} pass, ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
