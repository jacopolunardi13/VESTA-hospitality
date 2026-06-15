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
