import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { anthropic } from './client'
import { MODELS } from './models'
import { logAiCall } from './logging'
import { buildSystemBlocks } from './prompts'
import type { ChatTurn, PropertyContext } from './types'

export interface ReplyResult {
  text: string
  costCents: number
}

export interface ConciergeReply {
  text: string
  /** true se la risposta deriva DAVVERO dalle note KB; false se le note non contengono
   *  l'informazione e l'AI ha rimandato allo staff (→ il chiamante notifica lo staff). */
  answeredFromKb: boolean
  costCents: number
}

/**
 * Risposta alla SOLA domanda concierge di una richiesta mista (output strutturato).
 * Il modello riporta esplicitamente se ha potuto rispondere dalle note: segnale robusto e
 * multilingua per decidere la notifica staff (più affidabile del semplice conteggio hit KB,
 * che matcha asset generici senza contenere l'informazione specifica, es. un locale esterno).
 */
export async function generateConciergeAnswer(
  sb: SupabaseClient<Database>,
  property: PropertyContext,
  kbText: string,
  history: ChatTurn[],
  userMessage: string
): Promise<ConciergeReply> {
  const model = MODELS.generate_reply
  const started = Date.now()

  const system = `Sei l'assistente concierge di ${property.name}. Rispondi SOLO alla domanda informativa/concierge dell'ospite, usando ESCLUSIVAMENTE le note struttura qui sotto. NON parlare di disponibilità, prezzi o preventivi (gestiti separatamente). Rispondi nella STESSA lingua dell'ospite, in modo conciso e cortese.
Se le note NON contengono l'informazione richiesta, NON inventare: rispondi cortesemente che verificherai con lo staff e imposta answered_from_kb=false. Se rispondi grazie alle note, imposta answered_from_kb=true.

NOTE STRUTTURA:
${kbText || '(nessuna nota pertinente disponibile)'}`

  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user' as const, content: userMessage },
  ]

  try {
    const res = await anthropic().messages.create({
      model,
      max_tokens: 512,
      system,
      tool_choice: { type: 'tool', name: 'concierge_answer' },
      tools: [
        {
          name: 'concierge_answer',
          description: 'Registra la risposta alla domanda concierge.',
          input_schema: {
            type: 'object',
            properties: {
              answer: { type: 'string', description: "La risposta all'ospite, nella sua lingua." },
              answered_from_kb: { type: 'boolean', description: 'true se la risposta deriva dalle note; false se le note non contenevano l\'informazione e hai rimandato allo staff.' },
            },
            required: ['answer', 'answered_from_kb'],
          },
        },
      ],
      messages,
    })

    const costCents = await logAiCall(sb, {
      orgId: property.orgId, propertyId: property.id, fn: 'generate_reply', model,
      inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens,
      latencyMs: Date.now() - started, success: true,
    })

    const tu = res.content.find((b) => b.type === 'tool_use')
    if (tu && tu.type === 'tool_use') {
      const i = tu.input as { answer?: string; answered_from_kb?: boolean }
      return {
        text: typeof i.answer === 'string' ? i.answer.trim() : '',
        answeredFromKb: i.answered_from_kb === true,
        costCents,
      }
    }
    return { text: '', answeredFromKb: false, costCents }
  } catch (e) {
    await logAiCall(sb, {
      orgId: property.orgId, propertyId: property.id, fn: 'generate_reply', model,
      inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started,
      success: false, error: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
}

/**
 * generate_reply (Sonnet, KB cached). Non-streaming: restituisce il testo
 * completo + costo. Lo streaming verso il client sarà aggiunto al wiring route/UI.
 * I prezzi non passano MAI da qui (regola non negoziabile).
 */
export async function generateReply(
  sb: SupabaseClient<Database>,
  property: PropertyContext,
  kbText: string,
  history: ChatTurn[],
  userMessage: string
): Promise<ReplyResult> {
  const model = MODELS.generate_reply
  const started = Date.now()

  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user' as const, content: userMessage },
  ]

  try {
    const res = await anthropic().messages.create({
      model,
      max_tokens: 1024,
      system: buildSystemBlocks({ propertyName: property.name, kbText }),
      messages,
    })

    const costCents = await logAiCall(sb, {
      orgId: property.orgId, propertyId: property.id, fn: 'generate_reply', model,
      inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens,
      latencyMs: Date.now() - started, success: true,
    })

    const text = res.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n')
      .trim()

    return { text, costCents }
  } catch (e) {
    await logAiCall(sb, {
      orgId: property.orgId, propertyId: property.id, fn: 'generate_reply', model,
      inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started,
      success: false, error: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
}
