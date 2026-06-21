import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ConversationIntent } from '@/lib/supabase/database.types'
import { anthropic } from './client'
import { MODELS } from './models'
import { logAiCall } from './logging'
import type { ChatTurn, IntentResult, PropertyContext } from './types'

const INTENTS: ConversationIntent[] = [
  'booking', 'faq', 'guest_support', 'partnership',
  'vendor', 'saas_lead', 'spam', 'unclassified',
]

const CLASSIFY_GUIDE = `Classifica il messaggio dell'ospite in UNA categoria. Non trattare ogni messaggio come una prenotazione.
- booking: vuole prenotare/sapere disponibilità o prezzo per date (date o numero ospiti, "avete posto", "quanto costa dal…"). Anche messaggi BREVISSIMI con solo un riferimento temporale (es. "domani", "stasera", "oggi", "questo weekend", "il prossimo weekend") in un contesto di richiesta disponibilità vanno classificati come booking.
- faq: domanda informativa sul soggiorno senza intento immediato di prenotare.
- guest_support: ha già una prenotazione (riferimenti a prenotazione esistente, codice, date imminenti).
- partnership: agenzia/tour operator che vuole collaborare con la struttura (tariffe gruppi).
- vendor: vuole vendere qualcosa ALLA struttura (servizi, visibilità, forniture).
- saas_lead: è un gestore di strutture interessato a QUESTO software/assistente.
- spam: spam, link sospetti, testo ripetuto.
- unclassified: non chiaro.
Disambiguazione B2B: saas_lead = vuole comprare il software; partnership = porta ospiti; vendor = vende alla struttura. In dubbio tra saas_lead e gli altri, preferisci saas_lead.`

// Riferimenti temporali "richiesta disponibilità" (IT) per i messaggi brevissimi.
const TEMPORAL = /\b(domani|dopodomani|stasera|stanotte|stamattina|oggi|((quest[oa]|il\s+prossimo|prossim[oa])\s+)?(week[\s-]?end|fine\s+settimana))\b/i

/** Override deterministico: messaggio breve con SOLO riferimento temporale, in un
 *  contesto di richiesta disponibilità → booking (anche se l'AI è incerta). */
function isShortTemporalAvailability(message: string): boolean {
  const m = message.trim()
  if (m.length === 0 || m.length > 60) return false
  if (m.split(/\s+/).length > 8) return false
  return TEMPORAL.test(m)
}
function maybeBookingOverride(intent: ConversationIntent, message: string): boolean {
  return (intent === 'unclassified' || intent === 'faq') && isShortTemporalAvailability(message)
}

/** Intent detection (Haiku, structured output via tool). Logga in ai_calls. */
export async function classifyIntent(
  sb: SupabaseClient<Database>,
  property: PropertyContext,
  userMessage: string,
  history: ChatTurn[]
): Promise<IntentResult> {
  const model = MODELS.classify
  const started = Date.now()
  const recent = history.slice(-4).map((t) => `${t.role}: ${t.content}`).join('\n')

  try {
    const res = await anthropic().messages.create({
      model,
      max_tokens: 256,
      system: CLASSIFY_GUIDE,
      tool_choice: { type: 'tool', name: 'record_intent' },
      tools: [
        {
          name: 'record_intent',
          description: 'Registra la categoria di intento del messaggio.',
          input_schema: {
            type: 'object',
            properties: {
              intent: { type: 'string', enum: INTENTS },
              confidence: { type: 'number', description: 'Confidenza 0–1' },
              search_query_it: {
                type: 'string',
                description:
                  "La domanda dell'ospite riformulata in PAROLE CHIAVE IN ITALIANO per cercare in una knowledge base italiana. Traduci in italiano se il messaggio è in altra lingua (EN/ES/FR/DE). Es. 'Where can I park?' o '¿Dónde puedo aparcar?' → 'parcheggio auto dove'. Stringa vuota se non è una domanda informativa.",
              },
            },
            required: ['intent', 'confidence', 'search_query_it'],
          },
        },
      ],
      messages: [
        { role: 'user', content: `${recent ? `Contesto:\n${recent}\n\n` : ''}Messaggio da classificare:\n${userMessage}` },
      ],
    })

    await logAiCall(sb, {
      orgId: property.orgId, propertyId: property.id, fn: 'classify', model,
      inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens,
      latencyMs: Date.now() - started, success: true,
    })

    const toolUse = res.content.find((b) => b.type === 'tool_use')
    if (toolUse && toolUse.type === 'tool_use') {
      const input = toolUse.input as { intent?: string; confidence?: number; search_query_it?: string }
      let intent = (INTENTS as string[]).includes(input.intent ?? '')
        ? (input.intent as ConversationIntent)
        : 'unclassified'
      let confidence = typeof input.confidence === 'number'
        ? Math.max(0, Math.min(1, input.confidence))
        : 0.5
      const searchQueryIt = typeof input.search_query_it === 'string' ? input.search_query_it : ''
      if (maybeBookingOverride(intent, userMessage)) { intent = 'booking'; confidence = Math.max(confidence, 0.6) }
      return { intent, confidence, searchQueryIt }
    }
    return isShortTemporalAvailability(userMessage)
      ? { intent: 'booking', confidence: 0.6, searchQueryIt: '' }
      : { intent: 'unclassified', confidence: 0, searchQueryIt: '' }
  } catch (e) {
    await logAiCall(sb, {
      orgId: property.orgId, propertyId: property.id, fn: 'classify', model,
      inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started,
      success: false, error: e instanceof Error ? e.message : String(e),
    })
    return isShortTemporalAvailability(userMessage)
      ? { intent: 'booking', confidence: 0.6, searchQueryIt: '' }
      : { intent: 'unclassified', confidence: 0, searchQueryIt: '' }
  }
}
