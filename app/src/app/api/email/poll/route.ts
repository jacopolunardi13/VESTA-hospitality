import { createAdminClient } from '@/lib/supabase/admin'
import { getAccessToken, listRecent, getMessage, markRead } from '@/lib/email/gmail'
import { ingestEmail, loadEmailProperty } from '@/lib/email/ingest'
import { classifyEmailCategory, getRoutingRules, hasAutomatedMarkers } from '@/lib/email/routing'
import { proposeEmailCategory } from '@/lib/email/routing-ai'
import { alreadyRouted, logRouting, archiveOtaEmail } from '@/lib/email/archive'
import { archiveEmailDocuments } from '@/lib/documents-center/ingest'
import { emailMarkRead } from '@/lib/email/flags'

// Polling Gmail per il pilot. Protetto da CRON_SECRET. Router L0: classifica OGNI email PRIMA
// del pipeline. Solo 'guest' entra in ingestEmail (e risponde, se il kill-switch è ON); OTA/PMS
// → archivio (ota_inbox + reservations_staging, nessuna automazione); fornitori/newsletter →
// solo loggate. Idempotente via email_routing_log. Mark-read solo se abilitato (default OFF).
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
    const rules = getRoutingRules(property.settings)
    const markReadOn = emailMarkRead(property.settings)
    let processed = 0, skipped = 0, errors = 0
    const results: unknown[] = []

    for (const m of list) {
      try {
        if (await alreadyRouted(sb, property.id, m.id)) { skipped++; continue }
        const email = await getMessage(token, m.id)
        if (email.from === self) { skipped++; continue } // nostra mail in inbox → ignora

        // Router L0: deterministico → AI solo sul dubbio → ospite di default.
        const route = await classifyEmailCategory(email, rules, proposeEmailCategory)
        // Rete di sicurezza finale: email con marker automatici NON entra mai nel pipeline,
        // anche se instradata 'guest' (newsletter/notifiche/PMS sconosciuti mis-classificati).
        const suppressed = route.category === 'guest' && hasAutomatedMarkers(email)
        await logRouting(sb, property, email, route, suppressed) // audit + dedup

        if (route.category === 'guest' && !suppressed) {
          const r = await ingestEmail(sb, property, email, token)
          processed++
          results.push({ category: 'guest', from: email.from, subject: email.subject, intent: r.intent, stage: r.stage, replied: r.replied })
        } else if (route.category === 'ota_pms') {
          const otaInboxId = await archiveOtaEmail(sb, property, email, route)
          // Document Center / Back Office Assistant: il registry dei recognizer decide se archiviare
          // documenti (MVP: solo Booking). best-effort → non rompe mai il poll. Fase 2: i fornitori
          // italiani (supplier_admin) chiameranno lo stesso archiveEmailDocuments nel loro ramo.
          const doc = await archiveEmailDocuments(sb, property, email, route, otaInboxId, token)
          processed++
          results.push({ category: 'ota_pms', source: route.source, from: email.from, subject: email.subject, documents: doc })
        } else {
          skipped++
          results.push({ category: route.category, suppressed, from: email.from, subject: email.subject, action: 'none' })
        }

        if (markReadOn) await markRead(token, m.id)
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
