import { createAdminClient } from '@/lib/supabase/admin'
import { getAccessToken, listRecent, getMessage, markRead } from '@/lib/email/gmail'
import { ingestEmail, loadEmailProperty, alreadyIngested } from '@/lib/email/ingest'

// Polling Gmail per il pilot email. Da richiamare da uno scheduler cloud
// (pg_cron→endpoint) o manualmente. Protetto da CRON_SECRET.
// Legge le email non lette in INBOX, le ingerisce (conversation/lead + risposta
// in-thread) e le marca come lette. Idempotente: ogni email viene processata una volta.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const sb = createAdminClient()
    const property = await loadEmailProperty(sb)
    const token = await getAccessToken()
    const list = await listRecent(token, 25, 3)

    const self = (process.env.GMAIL_ADDRESS ?? '').toLowerCase()
    // Mittenti automatici a cui Vesta NON deve mai rispondere (no-reply, daemon, ecc.).
    const AUTOMATED = /(no-?reply|do-?not-?reply|mailer-daemon|postmaster)/i
    let processed = 0
    let skipped = 0
    let errors = 0
    const results: unknown[] = []

    for (const m of list) {
      try {
        // Dedup ledger: già processata? (indipendente dallo stato letto/non letto).
        if (await alreadyIngested(sb, property.id, m.id)) { skipped++; continue }
        const email = await getMessage(token, m.id)
        // Salta le email inviate da noi stessi o da mittenti automatici (anti-loop / no auto-reply a noreply).
        if (email.from === self || AUTOMATED.test(email.from)) { await markRead(token, m.id); skipped++; continue }
        const r = await ingestEmail(sb, property, email, token)
        await markRead(token, m.id) // cosmetico: tiene l'inbox in ordine (non è il dedup)
        processed++
        results.push({ from: email.from, subject: email.subject, intent: r.intent, stage: r.stage, replied: r.replied, newConversation: r.isNewConversation, conversationId: r.conversationId })
      } catch (e) {
        errors++
        results.push({ id: m.id, error: e instanceof Error ? e.message : String(e) })
      }
    }

    return Response.json({ ok: true, found: list.length, processed, skipped, errors, results })
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
