// Harness motore documenti — genera PDF preventivo/conferma da un lead reale (zero input
// manuale) e lo scrive su /tmp per la verifica del contenuto. READ ONLY sul DB (store:false).
// Uso: node --env-file=.env.local --import tsx scripts/test-documents.mts
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { generateDocument } from '@/lib/documents'
import type { PropertyContext } from '@/lib/ai/types'

let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data: prop } = await sb.from('properties').select('id, org_id, name, settings, supervision_mode').eq('id', '00000000-0000-0000-0000-000000000011').single()
const property: PropertyContext = { id: prop!.id, orgId: prop!.org_id, name: prop!.name, settings: (prop!.settings ?? {}) as Record<string, unknown>, supervisionMode: prop!.supervision_mode }

// Trova un lead con preventivo calcolato (items + totale).
const { data: lead } = await sb.from('booking_requests')
  .select('id, guest_name, check_in, check_out, adults, gross_total_cents')
  .eq('property_id', property.id).not('gross_total_cents', 'is', null)
  .order('created_at', { ascending: false }).limit(1).maybeSingle()
if (!lead) { console.log('Nessun lead con preventivo trovato.'); process.exit(1) }
console.log(`Lead: ${lead.id.slice(0, 8)} · ${lead.guest_name ?? '(senza nome)'} · ${lead.check_in}→${lead.check_out} · €${(lead.gross_total_cents ?? 0) / 100}`)

const ISSUE = new Date('2026-06-23T00:00:00Z')

console.log('\n— Preventivo —')
const prev = await generateDocument(sb, property, lead.id, 'preventivo', { issueDate: ISSUE })
ok(prev.buffer.subarray(0, 5).toString() === '%PDF-', 'PDF valido (header %PDF)')
ok(prev.buffer.length > 1500, `PDF non vuoto (${prev.buffer.length} byte)`)
ok(prev.model.lines.length >= 1 && prev.model.totalCents > 0, `modello: ${prev.model.lines.length} righe, totale €${prev.model.totalCents / 100}`)
ok(/Valido fino al/.test(prev.model.reference), `riferimento validità: "${prev.model.reference}"`)
writeFileSync('/tmp/vesta-preventivo.pdf', prev.buffer)

console.log('\n— Conferma (con acconto) —')
const conf = await generateDocument(sb, property, lead.id, 'conferma', { issueDate: ISSUE, depositCents: 10000 })
ok(conf.model.title === 'CONFERMA DI PRENOTAZIONE', 'titolo conferma')
ok(conf.model.depositCents === 10000 && conf.model.balanceCents === prev.model.totalCents - 10000, `acconto/saldo: €100 / €${(conf.model.balanceCents ?? 0) / 100}`)
ok(/Rif. prenotazione/.test(conf.model.reference), `riferimento prenotazione: "${conf.model.reference}"`)
writeFileSync('/tmp/vesta-conferma.pdf', conf.buffer)

console.log(`\n  → /tmp/vesta-preventivo.pdf · /tmp/vesta-conferma.pdf`)
console.log(`\n════ ${pass} passati, ${fail} falliti ════`)
process.exit(fail > 0 ? 1 : 0)
