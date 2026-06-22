// Harness offline canale WhatsApp — NESSUNA dipendenza da Meta (deps fake, niente invio reale).
// Copre: parsing webhook, verifica firma, ingest booking/concierge/misto, threading per numero
// (un lead per conversazione), media/contabile + notifica staff, dedup. Pulisce a fine run.
// Uso: node --env-file=.env.local --import tsx scripts/test-whatsapp.mts
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { parseInboundMessages, verifySignature, type WhatsAppDeps, type InboundWaMessage } from '@/lib/whatsapp/client'
import { ingestWhatsApp, alreadyIngested } from '@/lib/whatsapp/ingest'
import type { PropertyContext } from '@/lib/ai/types'

let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data: prop } = await sb.from('properties').select('id, org_id, name, settings, supervision_mode').eq('id', '00000000-0000-0000-0000-000000000011').single()
const property: PropertyContext = { id: prop!.id, orgId: prop!.org_id, name: prop!.name, settings: (prop!.settings ?? {}) as Record<string, unknown>, supervisionMode: prop!.supervision_mode }
const { data: rooms } = await sb.from('rooms').select('id').eq('property_id', property.id).is('deleted_at', null)
await sb.from('ical_feeds').update({ last_sync_at: new Date().toISOString() }).in('room_id', (rooms ?? []).map((r) => r.id)).eq('active', true)

const P_BOOK = '390000000010', P_MIX = '390000000011', P_MEDIA = '390000000012'
const PHONES = [P_BOOK, P_MIX, P_MEDIA]

async function cleanup() {
  const { data: convs } = await sb.from('conversations').select('id').in('guest_contact', PHONES).eq('source', 'whatsapp')
  const ids = (convs ?? []).map((c) => c.id)
  if (!ids.length) return
  const { data: brs } = await sb.from('booking_requests').select('id').in('conversation_id', ids)
  const brIds = (brs ?? []).map((b) => b.id)
  await sb.from('conversations').update({ booking_request_id: null }).in('id', ids)
  if (brIds.length) await sb.from('booking_request_events').delete().in('booking_request_id', brIds)
  await sb.from('notifications').delete().in('conversation_id', ids)
  await sb.from('messages').delete().in('conversation_id', ids)
  await sb.from('booking_requests').delete().in('conversation_id', ids)
  await sb.from('conversations').delete().in('id', ids)
}

await cleanup() // parti pulito

// ── Deps fake: registra gli invii, nessun download reale ──
const sent: { to: string; body: string }[] = []
const deps: WhatsAppDeps = {
  sendText: async (to, body) => { sent.push({ to, body }); return true },
  downloadMedia: async () => null,
}
const mk = (from: string, id: string, text: string | null, media: InboundWaMessage['media'] = null): InboundWaMessage =>
  ({ messageId: id, from, name: 'Test Ospite', type: media ? media.kind : 'text', text, media })

// ───────────────────────── UNIT ─────────────────────────
console.log('— Unit: parseInboundMessages —')
const payload = {
  entry: [{ changes: [{ field: 'messages', value: {
    contacts: [{ wa_id: '393924725263', profile: { name: 'Mario' } }],
    messages: [
      { id: 'wamid.1', from: '393924725263', type: 'text', text: { body: 'Ciao, avete posto?' } },
      { id: 'wamid.2', from: '393924725263', type: 'image', image: { id: 'MID', mime_type: 'image/jpeg', caption: 'ecco la contabile' } },
    ],
  } }] }],
}
const parsed = parseInboundMessages(payload)
ok(parsed.length === 2, `estrae 2 messaggi (${parsed.length})`)
ok(parsed[0].type === 'text' && parsed[0].text === 'Ciao, avete posto?' && parsed[0].name === 'Mario', 'testo + nome contatto')
ok(parsed[1].media?.id === 'MID' && parsed[1].media?.kind === 'image' && parsed[1].text === 'ecco la contabile', 'media image + caption')
ok(parseInboundMessages({ entry: [{ changes: [{ field: 'statuses', value: {} }] }] }).length === 0, 'ignora gli status/delivery receipt')

console.log('\n— Unit: verifySignature —')
const secret = 'test_app_secret'
const body = JSON.stringify({ hello: 'world' })
const goodSig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
ok(verifySignature(body, goodSig, secret) === true, 'firma valida → true')
ok(verifySignature(body, goodSig, 'wrong') === false, 'secret errato → false')
ok(verifySignature(body, 'sha256=deadbeef', secret) === false, 'firma errata → false')
ok(verifySignature(body, null, secret) === false, 'firma assente → false')

// ───────────────────────── E2E ingest ─────────────────────────
console.log('\n— E2E: booking + threading (un lead per conversazione) —')
const r1 = await ingestWhatsApp(sb, property, mk(P_BOOK, 'wamid.book1', '1 agosto, 2 persone'), deps)
// Il canale consegna fedelmente l'esito del pipeline: preventivo o cortesia (la scelta
// dipende dal pipeline, già coperto altrove). Qui verifichiamo le meccaniche del CANALE.
ok(r1.intent === 'booking' && ['proposal_sent', 'quoting'].includes(r1.stage), `turno booking gestito (${r1.intent}/${r1.stage})`)
ok(r1.isNewConversation && r1.replied, 'nuova conversazione + risposta inviata (deps fake)')
ok(sent.some((s) => s.to === P_BOOK && s.body.length > 0), 'risposta consegnata sul numero dell’ospite')
const { count: leads1 } = await sb.from('booking_requests').select('*', { count: 'exact', head: true }).eq('conversation_id', r1.conversationId)
ok(leads1 === 1, `1 lead creato (${leads1})`)

const r2 = await ingestWhatsApp(sb, property, mk(P_BOOK, 'wamid.book2', "c'è il parcheggio?"), deps)
ok(!r2.isNewConversation && r2.conversationId === r1.conversationId, 'secondo messaggio → stessa conversazione (threading per numero)')
const { count: leads2 } = await sb.from('booking_requests').select('*', { count: 'exact', head: true }).eq('conversation_id', r1.conversationId)
ok(leads2 === 1, `nessun nuovo lead dopo la FAQ (${leads2})`)

console.log('\n— E2E: richiesta MISTA (booking + concierge nello stesso messaggio) —')
const r3 = await ingestWhatsApp(sb, property, mk(P_MIX, 'wamid.mix1', "avete posto il 1 agosto per 2? e c'è il parcheggio?"), deps)
const mixReply = sent.find((s) => s.to === P_MIX)?.body ?? ''
// Garanzia del canale per la richiesta mista: la risposta booking + il blocco concierge
// arrivano nello STESSO messaggio (il blocco è appeso a qualunque sotto-ramo booking).
ok(r3.intent === 'booking' && /Sulla sua domanda/.test(mixReply), 'richiesta mista → blocco concierge nello stesso messaggio')

console.log('\n— E2E: media/contabile + dedup —')
const r4 = await ingestWhatsApp(sb, property, mk(P_MEDIA, 'wamid.media1', null, { id: 'MID9', mime: 'image/jpeg', kind: 'image' }), deps)
ok(r4.hadMedia, 'messaggio con media riconosciuto')
const { data: mrow } = await sb.from('messages').select('content, metadata').eq('conversation_id', r4.conversationId).eq('direction', 'in').order('created_at', { ascending: false }).limit(1).single()
const meta = (mrow?.metadata ?? {}) as { media?: { wa_media_id?: string } }
ok(meta.media?.wa_media_id === 'MID9', 'media archiviato nei metadati del messaggio')
const { count: notif } = await sb.from('notifications').select('*', { count: 'exact', head: true }).eq('conversation_id', r4.conversationId)
ok((notif ?? 0) >= 1, `notifica staff per allegato creata (${notif})`)
const dup = await alreadyIngested(sb, property.id, 'wamid.media1')
ok(dup === true, 'dedup: lo stesso wa_message_id risulta già ingerito')
const fresh = await alreadyIngested(sb, property.id, 'wamid.NONESISTE')
ok(fresh === false, 'dedup: messaggio nuovo → non ingerito')

await cleanup() // pulizia finale
console.log(`\n════ ${pass} passati, ${fail} falliti ════`)
process.exit(fail > 0 ? 1 : 0)
