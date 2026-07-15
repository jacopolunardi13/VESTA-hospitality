// ============================================================================
// P0-2 · TEST 4 — Guest E2E reale (pipeline service_role) con cleanup automatico.
// ============================================================================
// Esegue la STESSA processConversationTurn della chat pubblica (api/chat/route.ts),
// client service_role, con una domanda CONCIERGE (nessuna prenotazione).
// Prova che la pipeline guest non è regredita dopo 0015 e non dà errori di permesso.
// Cleanup: snapshot pre-turno → dopo, cancella SOLO ciò che il test ha creato.
// Uso (da app/):  node --env-file=.env.local --import tsx scripts/p0-2-guest-e2e.mts
// ============================================================================
import { createAdminClient } from '@/lib/supabase/admin'
import { processConversationTurn } from '@/lib/booking/orchestrate'
import { recordDelivery } from '@/lib/delivery/recordDelivery'
import type { PropertyContext } from '@/lib/ai/types'

const OWNER_ORG = '00000000-0000-0000-0000-000000000001'
const QUESTION = 'A che ora è il check-in?'
const sb = createAdminClient()
const ids = (rows: { id: string }[] | null) => new Set((rows ?? []).map(r => r.id))

// 0. Property reale del pilot
const { data: prop, error: propErr } = await sb.from('properties')
  .select('id, org_id, name, settings, supervision_mode')
  .eq('org_id', OWNER_ORG).is('deleted_at', null).limit(1).single()
if (propErr || !prop) { console.error('property pilot non trovata:', propErr?.message); process.exit(1) }
const property: PropertyContext = {
  id: prop.id, orgId: prop.org_id, name: prop.name,
  settings: (prop.settings ?? {}) as Record<string, unknown>, supervisionMode: prop.supervision_mode,
}
console.log(`Property pilot: ${property.name} (${property.id})`)

// 1. Snapshot pre-turno (per cancellare solo i NUOVI record)
const before = {
  ai:  ids((await sb.from('ai_calls').select('id').eq('property_id', property.id)).data),
  br:  ids((await sb.from('booking_requests').select('id').eq('property_id', property.id)).data),
  nt:  ids((await sb.from('notifications').select('id').eq('property_id', property.id)).data),
}

// 2. Conversazione di test + messaggio inbound (come fa la route)
const { data: conv, error: convErr } = await sb.from('conversations')
  .insert({ org_id: property.orgId, property_id: property.id, source: 'website_chat', status: 'open', stage: 'new' })
  .select('id').single()
if (convErr || !conv) { console.error('creazione conversazione fallita:', convErr?.message); process.exit(1) }
const convId = conv.id
console.log(`Conversazione di test: ${convId}`)
await sb.from('messages').insert({
  org_id: property.orgId, property_id: property.id, conversation_id: convId,
  direction: 'in', sender: 'guest', content: QUESTION, metadata: { p0_2_test: true },
})

// 3. Turno reale + finalizzazione consegna (identico alla route)
let authzError = false
let turn: Awaited<ReturnType<typeof processConversationTurn>> | null = null
try {
  turn = await processConversationTurn({ sb, property, conversationId: convId, userMessage: QUESTION, leadSource: 'website_chat' })
  await recordDelivery(sb, { property, conversationId: convId, leadId: turn.leadId, proposalGenerated: turn.proposalGenerated, outcome: 'sent' })
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e)
  authzError = /permission denied|42501|not a member/i.test(msg)
  console.error('\n❌ ERRORE durante il turno:', msg)
}

// 4. Esito del turno
console.log('\n── RISPOSTA AI ──')
if (turn) {
  console.log(`  reply : ${turn.reply}`)
  console.log(`  intent: ${turn.intent} · stage: ${turn.stage} · status: ${turn.status} · source: ${turn.source}`)
  console.log(`  leadId: ${turn.leadId ?? '—'} · proposalGenerated: ${turn.proposalGenerated ?? false}`)
}
console.log(`  Errori di autorizzazione: ${authzError ? '⚠️ SÌ' : '✅ nessuno'}`)

// 5. Conteggio di ciò che il test ha creato (prima del cleanup)
const created = {
  br: ((await sb.from('booking_requests').select('id').eq('property_id', property.id)).data ?? []).filter(r => !before.br.has(r.id)),
  nt: ((await sb.from('notifications').select('id').eq('property_id', property.id)).data ?? []).filter(r => !before.nt.has(r.id)),
}
const msgsBefore = (await sb.from('messages').select('id').eq('conversation_id', convId)).data?.length ?? 0

// 6. CLEANUP (FK-safe)
await sb.from('booking_requests').delete().in('id', created.br.map(r => r.id).length ? created.br.map(r => r.id) : ['00000000-0000-0000-0000-000000000000'])
await sb.from('notifications').delete().in('id', created.nt.map(r => r.id).length ? created.nt.map(r => r.id) : ['00000000-0000-0000-0000-000000000000'])
await sb.from('conversations').delete().eq('id', convId)                       // → CASCADE messages
const newAi = ((await sb.from('ai_calls').select('id').eq('property_id', property.id)).data ?? []).filter(r => !before.ai.has(r.id))
if (newAi.length) await sb.from('ai_calls').delete().in('id', newAi.map(r => r.id))

// 7. Verifica finale del cleanup
const conversationLeft = (await sb.from('conversations').select('id').eq('id', convId)).data?.length ?? 0
const messagesLeft     = (await sb.from('messages').select('id').eq('conversation_id', convId)).data?.length ?? 0
const aiLeft           = ((await sb.from('ai_calls').select('id').eq('property_id', property.id)).data ?? []).filter(r => !before.ai.has(r.id)).length

console.log('\n── REPORT CLEANUP ──')
console.log(`  conversation rimossa      : ${conversationLeft === 0 ? '✅' : '❌ ('+conversationLeft+' resid.)'}`)
console.log(`  messages rimossi          : ${messagesLeft === 0 ? `✅ (erano ${msgsBefore})` : '❌ ('+messagesLeft+' resid.)'}`)
console.log(`  ai_calls del test rimossi : ${aiLeft === 0 ? `✅ (rimossi ${newAi.length})` : '❌ ('+aiLeft+' resid.)'}`)
console.log(`  booking_requests create   : ${created.br.length} ${created.br.length === 0 ? '✅' : '(rimosse)'}`)
console.log(`  notifications create      : ${created.nt.length} ${created.nt.length === 0 ? '✅' : '(rimosse)'}`)

const clean = conversationLeft === 0 && messagesLeft === 0 && aiLeft === 0
console.log(`\n${clean && !authzError && turn ? '✅ TEST 4 PASS · pipeline guest funzionante, nessun errore authz, pilot pulito.' : '⚠️ TEST 4 da rivedere.'}`)
