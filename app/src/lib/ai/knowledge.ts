import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { KbHit } from './types'

/**
 * Match KB full-text (livello 4 della pipeline, zero AI).
 * Usa la RPC search_knowledge (indice idx_ka_fts).
 */
export async function searchKnowledge(
  sb: SupabaseClient<Database>,
  propertyId: string,
  query: string,
  limit = 5
): Promise<KbHit[]> {
  if (!query.trim()) return []
  const { data, error } = await sb.rpc('search_knowledge', {
    p_property_id: propertyId,
    p_query: query,
    p_limit: limit,
  })
  if (error || !data) return []
  return data as KbHit[]
}

/**
 * Soglia di confidenza per rispondere direttamente dalla KB senza AI.
 * Conservativa per scelta (dev-plan §9): in caso di dubbio si passa all'AI,
 * mai una risposta KB potenzialmente sbagliata. Da tarare sui dati reali.
 */
export const KB_DIRECT_ANSWER_RANK = 0.1

/** Concatena i contenuti KB come contesto per generate_reply. */
export function kbContextText(hits: KbHit[]): string {
  if (hits.length === 0) return ''
  return hits
    .map((h) => `## ${h.title}\n${h.content ?? ''}`.trim())
    .join('\n\n')
}
