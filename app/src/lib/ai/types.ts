import type { ConversationIntent } from '@/lib/supabase/database.types'

/** Contesto property passato alla pipeline AI. */
export interface PropertyContext {
  id: string
  orgId: string
  name: string
  settings: Record<string, unknown>
  supervisionMode: boolean
}

/** Turno di conversazione per lo storico passato al modello. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Asset KB recuperato dal match full-text. */
export interface KbHit {
  id: string
  title: string
  content: string | null
  type: string
  priority: number
  rank: number
}

export interface IntentResult {
  intent: ConversationIntent
  confidence: number
}

/** Esito di una chiamata AI con usage per il logging costi. */
export interface AiUsage {
  inputTokens: number
  outputTokens: number
}
