// Webhook WhatsApp Cloud API (Meta).
//  GET  → verifica di sottoscrizione (echo di hub.challenge se il verify token combacia).
//  POST → messaggi in ingresso: verifica firma HMAC, parsing, dedup, ingest. Risponde 200
//         rapidamente (Meta ritenta sui non-200; il dedup rende sicuri i retry).
// Deploy sicuro: senza WHATSAPP_APP_SECRET il POST rifiuta tutto (canale inerte pre-go-live).
import { createAdminClient } from '@/lib/supabase/admin'
import { parseInboundMessages, verifySignature, buildWhatsAppDeps, type WaWebhookPayload } from '@/lib/whatsapp/client'
import { loadWhatsAppProperty, ingestWhatsApp, alreadyIngested } from '@/lib/whatsapp/ingest'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
  if (mode === 'subscribe' && verifyToken && token === verifyToken) {
    return new Response(challenge ?? '', { status: 200 })
  }
  return new Response('forbidden', { status: 403 })
}

export async function POST(request: Request) {
  const raw = await request.text()
  const appSecret = process.env.WHATSAPP_APP_SECRET
  const signature = request.headers.get('x-hub-signature-256')
  // Firma obbligatoria: senza app secret o con firma non valida → rifiuta (no processamento).
  if (!appSecret || !verifySignature(raw, signature, appSecret)) {
    return Response.json({ error: 'invalid signature' }, { status: 401 })
  }

  let payload: WaWebhookPayload
  try { payload = JSON.parse(raw) as WaWebhookPayload } catch { return Response.json({ ok: true }) }

  const messages = parseInboundMessages(payload)
  if (messages.length === 0) return Response.json({ ok: true }) // status/delivery receipts: ack e basta

  const sb = createAdminClient()
  const property = await loadWhatsAppProperty(sb)
  const deps = buildWhatsAppDeps()

  const results: unknown[] = []
  for (const m of messages) {
    try {
      if (await alreadyIngested(sb, property.id, m.messageId)) { results.push({ id: m.messageId, skipped: true }); continue }
      const r = await ingestWhatsApp(sb, property, m, deps)
      results.push({ id: m.messageId, intent: r.intent, stage: r.stage, replied: r.replied, hadMedia: r.hadMedia })
    } catch (e) {
      results.push({ id: m.messageId, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return Response.json({ ok: true, results })
}
