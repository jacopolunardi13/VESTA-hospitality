// Mappatura funzione → modello e pricing (dev-plan §1, giugno 2026).
// I costi sono calcolati dai token loggati in ai_calls.

export type AiFunction =
  | 'classify'
  | 'extract'
  | 'select_template'
  | 'generate_reply'
  | 'distill_kb'

export const MODELS: Record<AiFunction, string> = {
  classify:        'claude-haiku-4-5',
  extract:         'claude-haiku-4-5',
  select_template: 'claude-haiku-4-5',
  generate_reply:  'claude-sonnet-4-6',
  distill_kb:      'claude-sonnet-4-6',
}

// USD per 1M token.
const PRICING: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5':  { in: 1, out: 5 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-opus-4-8':   { in: 5, out: 25 },
}

/** Costo in centesimi di € (approssimazione USD≈EUR per il budget cap MVP). */
export function costCents(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? { in: 0, out: 0 }
  return (inputTokens / 1_000_000) * p.in * 100 + (outputTokens / 1_000_000) * p.out * 100
}
