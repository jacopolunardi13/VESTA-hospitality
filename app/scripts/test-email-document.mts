// Harness Fase A — email HTML brandizzata + PDF preventivo realmente allegato.
// Verifica renderEmailHtml + buildMimeMessage (multipart) + che l'allegato decodificato sia
// un PDF valido. Genera da un lead reale. READ ONLY (store:false). Niente invio Gmail.
// Uso: node --env-file=.env.local --import tsx scripts/test-email-document.mts
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { generateDocument, LUNART_DOC_CONFIG } from '@/lib/documents'
import { renderEmailHtml } from '@/lib/email/template'
import { buildMimeMessage } from '@/lib/email/gmail'
import type { PropertyContext } from '@/lib/ai/types'

let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data: prop } = await sb.from('properties').select('id, org_id, name, settings, supervision_mode').eq('id', '00000000-0000-0000-0000-000000000011').single()
const property: PropertyContext = { id: prop!.id, orgId: prop!.org_id, name: prop!.name, settings: (prop!.settings ?? {}) as Record<string, unknown>, supervisionMode: prop!.supervision_mode }
const { data: lead } = await sb.from('booking_requests').select('id').eq('property_id', property.id).not('gross_total_cents', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
if (!lead) { console.log('Nessun lead con preventivo.'); process.exit(1) }

const sampleReply = `Grazie per la sua richiesta. Per il soggiorno richiesto la camera proposta è:

• Camera 301 — Standard — €190 per l'intero soggiorno, colazione inclusa

Mi indichi se desidera procedere.

— Sulla sua domanda —
Il parcheggio più comodo è il Garage Lungarno, a pochi passi dalla struttura.`

console.log('— Email HTML brandizzata (struttura) —')
const html = renderEmailHtml(LUNART_DOC_CONFIG, sampleReply)
ok(html.includes('LunArt B&amp;B'), 'header con brand struttura (HTML-escaped)')
ok(html.includes('Powered by Vesta Hospitality'), 'footer "Powered by Vesta"')
ok(html.includes('Camera 301') && html.includes('Sulla sua domanda'), 'corpo (preventivo + blocco concierge) incluso')
ok(html.includes('lunartfirenze@gmail.com'), 'contatti struttura nel footer')
writeFileSync('/tmp/vesta-email.html', html)

console.log('\n— PDF preventivo + MIME multipart —')
const gen = await generateDocument(sb, property, lead.id, 'preventivo', {})
const raw = buildMimeMessage({
  to: 'ospite@example.com', from: 'lunartfirenze@gmail.com', subject: 'Disponibilità',
  body: sampleReply, html,
  attachments: [{ filename: 'preventivo-lunart.pdf', mimeType: 'application/pdf', content: gen.buffer }],
})
ok(raw.includes('multipart/mixed'), 'MIME multipart/mixed')
ok(raw.includes('multipart/alternative'), 'parte alternative (testo + html)')
ok(raw.includes('Content-Type: text/plain') && raw.includes('Content-Type: text/html'), 'testo semplice + html presenti')
ok(/Content-Disposition: attachment; filename="preventivo-lunart\.pdf"/.test(raw), 'allegato PDF dichiarato')

// Decodifica l'allegato e verifica che sia un PDF valido.
const m = raw.match(/filename="preventivo-lunart\.pdf"\r\n\r\n([\s\S]*?)\r\n--mixed_/)
const decoded = m ? Buffer.from(m[1].replace(/\r\n/g, ''), 'base64') : Buffer.alloc(0)
ok(decoded.subarray(0, 5).toString() === '%PDF-', `allegato decodificato è un PDF valido (${decoded.length} byte)`)
writeFileSync('/tmp/vesta-email.eml', raw)

console.log('\n— Retro-compatibilità: solo testo —')
const plain = buildMimeMessage({ to: 'a@b.it', from: 'c@d.it', subject: 'x', body: 'ciao' })
ok(plain.includes('Content-Type: text/plain') && !plain.includes('multipart'), 'senza html/allegati → text/plain singolo')

console.log(`\n  → /tmp/vesta-email.html · /tmp/vesta-email.eml`)
console.log(`\n════ ${pass} passati, ${fail} falliti ════`)
process.exit(fail > 0 ? 1 : 0)
