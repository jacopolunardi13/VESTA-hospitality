// Client WhatsApp Cloud API (Meta) — invio testo, download media, verifica firma, parsing
// webhook. Nessuna dipendenza dal canale: lo usano webhook route e ingest. Deploy sicuro:
// se manca WHATSAPP_ACCESS_TOKEN, sendText/downloadMedia sono no-op (come la send-guard Gmail).
import crypto from 'node:crypto'

const GRAPH = 'https://graph.facebook.com/v21.0'

export type WaMediaKind = 'image' | 'document' | 'audio' | 'video' | 'sticker'

export interface InboundWaMessage {
  messageId: string
  from: string            // numero ospite (wa_id), solo cifre, es. 393924725263
  name: string | null
  type: string            // text | image | document | audio | video | sticker | button | interactive
  text: string | null     // body o caption
  media: { id: string; mime: string | null; kind: WaMediaKind } | null
}

// ── Tipi minimi del payload webhook (evita `any`, narrowing esplicito) ──
interface WaMediaNode { id?: string; mime_type?: string; caption?: string }
interface WaRawMessage {
  id: string; from: string; type: string
  text?: { body?: string }
  image?: WaMediaNode; document?: WaMediaNode; audio?: WaMediaNode; video?: WaMediaNode; sticker?: WaMediaNode
  button?: { text?: string }
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }
}
interface WaChangeValue {
  contacts?: { wa_id?: string; profile?: { name?: string } }[]
  messages?: WaRawMessage[]
}
export interface WaWebhookPayload {
  entry?: { changes?: { field?: string; value?: WaChangeValue }[] }[]
}

const MEDIA_KINDS: WaMediaKind[] = ['image', 'document', 'audio', 'video', 'sticker']

/** Estrae i messaggi in ingresso dal payload webhook (ignora status/delivery receipts). */
export function parseInboundMessages(payload: WaWebhookPayload): InboundWaMessage[] {
  const out: InboundWaMessage[] = []
  for (const e of payload?.entry ?? []) {
    for (const ch of e?.changes ?? []) {
      if (ch?.field !== 'messages' || !ch.value) continue
      const nameByWaId = new Map<string, string>()
      for (const c of ch.value.contacts ?? []) if (c?.wa_id) nameByWaId.set(c.wa_id, c?.profile?.name ?? '')
      for (const m of ch.value.messages ?? []) {
        let text: string | null = null
        let media: InboundWaMessage['media'] = null
        if (m.type === 'text') {
          text = m.text?.body ?? null
        } else if ((MEDIA_KINDS as string[]).includes(m.type)) {
          const node = (m as unknown as Record<string, WaMediaNode>)[m.type]
          if (node?.id) media = { id: node.id, mime: node.mime_type ?? null, kind: m.type as WaMediaKind }
          text = node?.caption ?? null
        } else if (m.type === 'button') {
          text = m.button?.text ?? null
        } else if (m.type === 'interactive') {
          text = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null
        }
        out.push({ messageId: m.id, from: m.from, name: nameByWaId.get(m.from) ?? null, type: m.type, text, media })
      }
    }
  }
  return out
}

/** Verifica la firma X-Hub-Signature-256 (HMAC-SHA256 del raw body con APP_SECRET). */
export function verifySignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!signature || !appSecret) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export interface WhatsAppDeps {
  /** Invia un testo; ritorna true se realmente inviato (false = Meta non configurato). */
  sendText: (to: string, body: string) => Promise<boolean>
  downloadMedia: (mediaId: string) => Promise<{ bytes: Uint8Array; mime: string } | null>
}

/** Deps reali da env. Token assente → no-op (deploy sicuro prima del setup Meta). */
export function buildWhatsAppDeps(): WhatsAppDeps {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  return {
    async sendText(to, body) {
      if (!token || !phoneId) return false // inerte finché Meta non è configurato
      const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body, preview_url: false } }),
      })
      if (!res.ok) throw new Error(`WhatsApp send fallita ${res.status}: ${await res.text()}`)
      return true
    },
    async downloadMedia(mediaId) {
      if (!token) return null
      const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!meta.ok) return null
      const info = (await meta.json()) as { url?: string; mime_type?: string }
      if (!info.url) return null
      const bin = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } })
      if (!bin.ok) return null
      return { bytes: new Uint8Array(await bin.arrayBuffer()), mime: info.mime_type ?? 'application/octet-stream' }
    },
  }
}
