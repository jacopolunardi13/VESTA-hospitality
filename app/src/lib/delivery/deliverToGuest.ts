// Layer di consegna outbound condiviso (email · WhatsApp · web chat). Usato dalle azioni staff
// Tier 2 ("Approva e invia"): chiude il gap tra approvazione e consegna reale all'ospite.
// Persiste SEMPRE il messaggio + consegna sul canale della conversazione. Tier 2 = staff
// esplicito → BYPASSA il kill-switch Tier 1 (decisione approvata). PDF WhatsApp rinviato.
import { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase/database.types'
import type { PropertyContext } from '@/lib/ai/types'
import { getAccessToken, sendReply, type EmailAttachment } from '@/lib/email/gmail'
import { buildWhatsAppDeps } from '@/lib/whatsapp/client'

export interface OutboundContent {
  text: string
  html?: string
  attachments?: EmailAttachment[]
}
export interface DeliveryResult { channel: string; sent: boolean; note?: string }

interface EmailThread { threadId?: string; inReplyTo?: string; references?: string; subject: string }

/** Estrae i parametri di threading dall'ultima email inbound (pura, testabile). */
export function resolveEmailThread(metadata: unknown): EmailThread {
  const m = (metadata ?? {}) as Record<string, unknown>
  const str = (k: string) => (typeof m[k] === 'string' ? (m[k] as string) : undefined)
  return { threadId: str('gmail_thread_id'), inReplyTo: str('rfc_message_id'), references: str('references'), subject: str('subject') ?? '' }
}

/** Consegna un messaggio (con eventuale allegato) all'ospite, sul canale della conversazione. */
export async function deliverToGuest(
  sb: SupabaseClient<Database>,
  property: PropertyContext,
  conversationId: string,
  content: OutboundContent
): Promise<DeliveryResult> {
  const { data: conv } = await sb.from('conversations').select('source, guest_contact').eq('id', conversationId).single()
  const source = conv?.source ?? 'website_chat'
  const to = conv?.guest_contact ?? ''

  // Persisti sempre il messaggio outbound (visibile in dashboard).
  await sb.from('messages').insert({
    org_id: property.orgId, property_id: property.id, conversation_id: conversationId,
    direction: 'out', sender: 'staff', content: content.text,
    metadata: { channel: source, tier2: true } as Json,
  })

  if (source === 'email') {
    if (!process.env.GMAIL_REFRESH_TOKEN || !to) return { channel: 'email', sent: false, note: 'gmail non configurato o destinatario mancante' }
    const { data: inb } = await sb.from('messages').select('metadata')
      .eq('conversation_id', conversationId).eq('direction', 'in')
      .order('created_at', { ascending: false }).limit(10)
    const emailMsg = (inb ?? []).find((mm) => ((mm.metadata as Record<string, unknown> | null)?.channel) === 'email')
    const th = resolveEmailThread(emailMsg?.metadata)
    const token = await getAccessToken()
    await sendReply(token, {
      to, from: process.env.GMAIL_ADDRESS ?? '', subject: th.subject || 'La tua richiesta',
      body: content.text, html: content.html, attachments: content.attachments,
      inReplyTo: th.inReplyTo, references: th.references, threadId: th.threadId,
    })
    return { channel: 'email', sent: true }
  }

  if (source === 'whatsapp') {
    if (!to) return { channel: 'whatsapp', sent: false }
    const deps = buildWhatsAppDeps()
    const sent = await deps.sendText(to, content.text) // documento PDF rinviato (decisione #5)
    return { channel: 'whatsapp', sent, note: content.attachments?.length ? 'PDF non inviato su WhatsApp (rinviato)' : undefined }
  }

  // website_chat: solo persistito (il widget fa polling).
  return { channel: source, sent: false, note: 'persistito (chat)' }
}
