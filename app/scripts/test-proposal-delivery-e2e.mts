// E2E REALE · separazione STATO-PRATICA / STATO-CONSEGNA del preventivo.
// Policy verificata:
//  - con autosend OFF la pratica NON va in "Preventivo inviato" (proposal_sent);
//  - la bozza è visibile (messages.delivery_status = 'autosend_off');
//  - nessuna email viene spedita;
//  - "proposal_sent" solo a consegna reale (outcome 'sent'); 'failed' resta received.
// Uso: node --env-file=.env.local --import tsx scripts/test-proposal-delivery-e2e.mts
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { loadEmailProperty, ingestEmail } from '@/lib/email/ingest'
import { recordDelivery } from '@/lib/delivery/recordDelivery'
import { emailAutosendEnabled } from '@/lib/email/flags'
import type { InboundEmail } from '@/lib/email/gmail'

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const db = sb as unknown as SupabaseClient

let pass = 0, fail = 0
function check(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`) }
}

const property = await loadEmailProperty(sb)
console.log(`Property: ${property.name} | autosend = ${emailAutosendEnabled(property.settings)}`)

const convs: string[] = []
const leads: string[] = []

async function seedDraft(guest: string): Promise<{ leadId: string; conversationId: string }> {
  const { data: conv } = await sb.from('conversations').insert({ org_id: property.orgId, property_id: property.id, source: 'email', guest_name: guest, guest_contact: 'e2e-delivery@example.test' }).select('id').single()
  convs.push(conv!.id)
  const { data: lead } = await sb.from('booking_requests').insert({ org_id: property.orgId, property_id: property.id, source: 'email', guest_name: guest, conversation_id: conv!.id, status: 'received' }).select('id').single()
  leads.push(lead!.id)
  await sb.from('messages').insert({ org_id: property.orgId, property_id: property.id, conversation_id: conv!.id, direction: 'out', sender: 'ai', content: '[bozza preventivo E2E]', delivery_status: 'draft' })
  return { leadId: lead!.id, conversationId: conv!.id }
}
async function statusOf(id: string) { const { data } = await sb.from('booking_requests').select('status').eq('id', id).single(); return data?.status }
async function lastDelivery(convId: string) { const { data } = await sb.from('messages').select('delivery_status').eq('conversation_id', convId).eq('direction', 'out').order('created_at', { ascending: false }).limit(1).maybeSingle(); return data?.delivery_status ?? null }
async function outCount(convId: string) { const { count } = await sb.from('messages').select('*', { count: 'exact', head: true }).eq('conversation_id', convId).eq('direction', 'out'); return count ?? 0 }
async function notifTypes(leadId: string): Promise<string[]> { const { data } = await db.from('notifications').select('type').eq('booking_request_id', leadId); return (data ?? []).map((n: { type: string }) => n.type) }

try {
  // [1] autosend OFF → bozza pronta, NON inviata, lead resta received
  console.log('\n[1] autosend OFF (preventivo generato → bozza)')
  const a = await seedDraft('Rossi delivery')
  await recordDelivery(sb, { property, conversationId: a.conversationId, leadId: a.leadId, proposalGenerated: true, outcome: 'autosend_off' })
  check('lead NON va in proposal_sent (resta received)', (await statusOf(a.leadId)) === 'received', await statusOf(a.leadId))
  check('delivery_status = autosend_off (bozza pronta, non inviata)', (await lastDelivery(a.conversationId)) === 'autosend_off')
  check('nessuna email inviata (nessun messaggio outbound aggiunto)', (await outCount(a.conversationId)) === 1)
  check('notifica "Bozza pronta — non inviata"', (await notifTypes(a.leadId)).includes('proposal_draft'))

  // [2] consegna reale → sent → proposal_sent
  console.log('\n[2] consegna reale (outcome sent)')
  const b = await seedDraft('Bianchi delivery')
  await recordDelivery(sb, { property, conversationId: b.conversationId, leadId: b.leadId, proposalGenerated: true, outcome: 'sent' })
  check('"Preventivo inviato" SOLO a consegna reale → proposal_sent', (await statusOf(b.leadId)) === 'proposal_sent', await statusOf(b.leadId))
  check('delivery_status = sent', (await lastDelivery(b.conversationId)) === 'sent')
  check('notifica "Preventivo inviato"', (await notifTypes(b.leadId)).includes('proposal_auto_sent'))

  // [3] invio fallito → failed, lead resta received
  console.log('\n[3] invio fallito (outcome failed)')
  const c = await seedDraft('Verdi delivery')
  await recordDelivery(sb, { property, conversationId: c.conversationId, leadId: c.leadId, proposalGenerated: true, outcome: 'failed' })
  check('lead resta received (invio fallito)', (await statusOf(c.leadId)) === 'received', await statusOf(c.leadId))
  check('delivery_status = failed', (await lastDelivery(c.conversationId)) === 'failed')
  check('notifica "Invio fallito" (escalation)', (await notifTypes(c.leadId)).includes('escalation'))

  // [4] INTEGRAZIONE reale: ingestEmail con autosend OFF (accessToken '' → nessun invio)
  console.log('\n[4] ingestEmail reale · autosend OFF')
  check('autosend del pilot è OFF', emailAutosendEnabled(property.settings) === false)
  const stamp = Date.now()
  const email: InboundEmail = { id: `deliv-${stamp}`, threadId: `deliv-${stamp}`, from: 'ospite.delivery@example.test', fromName: 'Ospite Delivery', subject: 'Disponibilità agosto', rfcMessageId: `<deliv-${stamp}@mail.test>`, references: '', inReplyTo: '', body: 'Buongiorno, avete disponibilità dal 4 al 6 agosto 2026 per 2 persone? Qual è il prezzo?' }
  const r = await ingestEmail(sb, property, email, '')
  convs.push(r.conversationId)
  check('nessuna email inviata (replied = false)', r.replied === false)
  const { data: cc } = await sb.from('conversations').select('booking_request_id').eq('id', r.conversationId).single()
  const leadE = cc?.booking_request_id ?? null
  if (leadE) {
    leads.push(leadE)
    check('lead NON in proposal_sent (autosend OFF)', (await statusOf(leadE)) !== 'proposal_sent', String(await statusOf(leadE)))
    check('ultimo messaggio outbound = autosend_off', (await lastDelivery(r.conversationId)) === 'autosend_off', String(await lastDelivery(r.conversationId)))
  } else {
    console.log('  (nota: nessun lead generato dall\'email — pipeline non ha prodotto un preventivo; invariante "no email / no proposal_sent" comunque rispettata)')
  }
} finally {
  console.log('\n[cleanup]')
  for (const lid of leads) {
    await db.from('operational_tasks').delete().eq('subject_id', lid)
    await sb.from('notifications').delete().eq('booking_request_id', lid)
    await sb.from('booking_request_events').delete().eq('booking_request_id', lid)
    await sb.from('booking_request_items').delete().eq('booking_request_id', lid)
    await sb.from('booking_requests').delete().eq('id', lid)
  }
  for (const id of convs) {
    await sb.from('notifications').delete().eq('conversation_id', id)
    await sb.from('messages').delete().eq('conversation_id', id)
    await sb.from('conversations').delete().eq('id', id)
  }
  console.log(`\n=== RISULTATO: ${pass} pass / ${fail} fail ===`)
  process.exit(fail === 0 ? 0 : 1)
}
