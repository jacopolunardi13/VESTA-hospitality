import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { costCents, type AiFunction } from './models'

export interface LogAiCallParams {
  orgId: string | null
  propertyId: string | null
  fn: AiFunction
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  success: boolean
  error?: string | null
}

/** Logga la chiamata in ai_calls e restituisce il costo in centesimi. */
export async function logAiCall(
  sb: SupabaseClient<Database>,
  p: LogAiCallParams
): Promise<number> {
  await sb.from('ai_calls').insert({
    org_id: p.orgId,
    property_id: p.propertyId,
    function: p.fn,
    provider: 'anthropic',
    model: p.model,
    input_tokens: p.inputTokens,
    output_tokens: p.outputTokens,
    latency_ms: p.latencyMs,
    success: p.success,
    error: p.error ?? null,
  })
  return costCents(p.model, p.inputTokens, p.outputTokens)
}
