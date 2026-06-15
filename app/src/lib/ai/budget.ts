import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { costCents } from './models'

/** Inizio giornata corrente in UTC (MVP; affineremo con timezone property). */
function startOfTodayUtc(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
}

/** Spesa AI odierna in centesimi, calcolata dai token loggati in ai_calls. */
export async function dailySpendCents(
  sb: SupabaseClient<Database>,
  propertyId: string
): Promise<number> {
  const { data } = await sb
    .from('ai_calls')
    .select('model, input_tokens, output_tokens')
    .eq('property_id', propertyId)
    .gte('created_at', startOfTodayUtc())

  let total = 0
  for (const row of data ?? []) {
    total += costCents(row.model, row.input_tokens ?? 0, row.output_tokens ?? 0)
  }
  return total
}

export interface BudgetState {
  spentCents: number
  budgetCents: number
  over80: boolean
  /** true → nessuna chiamata AI (budget esaurito o toggle manuale). */
  safeMode: boolean
}

export async function getBudgetState(
  sb: SupabaseClient<Database>,
  propertyId: string,
  settings: Record<string, unknown>
): Promise<BudgetState> {
  const budgetCents = Number(settings['ai_daily_budget_cents'] ?? 500)
  const manualSafeMode = settings['safe_mode'] === true
  const spentCents = await dailySpendCents(sb, propertyId)
  return {
    spentCents,
    budgetCents,
    over80: spentCents >= budgetCents * 0.8,
    safeMode: manualSafeMode || spentCents >= budgetCents,
  }
}
