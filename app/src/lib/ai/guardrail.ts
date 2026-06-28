import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export const MAX_MESSAGE_LENGTH = 1000
const MSG_PER_MIN_PER_CONVERSATION = 20
const MSG_PER_HOUR_PER_IP = 100

/** Hash dell'IP (mai IP in chiaro — GDPR). */
export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex')
}

/** Estrae l'IP del client dagli header (best-effort). */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return headers.get('x-real-ip') ?? 'unknown'
}

export async function logGuardrail(
  sb: SupabaseClient<Database>,
  p: {
    orgId: string | null
    propertyId: string | null
    conversationId?: string | null
    type: string
    ipHash?: string | null
    details?: Record<string, unknown>
  }
): Promise<void> {
  // Best-effort (logging di sicurezza): non lancia, ma rende visibile un eventuale errore.
  const { error } = await sb.from('guardrail_events').insert({
    org_id: p.orgId,
    property_id: p.propertyId,
    conversation_id: p.conversationId ?? null,
    type: p.type,
    ip_hash: p.ipHash ?? null,
    details: (p.details ?? {}) as Database['public']['Tables']['guardrail_events']['Insert']['details'],
  })
  if (error) console.error(`[guardrail_events] insert fallito: ${error.message}`)
}

export async function isIpBlocked(
  sb: SupabaseClient<Database>,
  propertyId: string,
  ipHash: string
): Promise<boolean> {
  const { data } = await sb
    .from('ip_blocklist')
    .select('id')
    .eq('property_id', propertyId)
    .eq('ip_hash', ipHash)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
  return !!data && data.length > 0
}

export interface RateLimitResult {
  allowed: boolean
  reason?: string
}

/** Rate limit deterministico (zero AI): per IP/ora e per conversazione/minuto. */
export async function checkRateLimit(
  sb: SupabaseClient<Database>,
  propertyId: string,
  ipHash: string,
  conversationId: string | null
): Promise<RateLimitResult> {
  const now = Date.now()

  const oneHourAgo = new Date(now - 3_600_000).toISOString()
  const { count: ipCount } = await sb
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('property_id', propertyId)
    .eq('direction', 'in')
    .gte('created_at', oneHourAgo)
    .filter('metadata->>ip_hash', 'eq', ipHash)
  if ((ipCount ?? 0) >= MSG_PER_HOUR_PER_IP) {
    return { allowed: false, reason: 'ip_hourly_limit' }
  }

  if (conversationId) {
    const oneMinAgo = new Date(now - 60_000).toISOString()
    const { count: convCount } = await sb
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('direction', 'in')
      .gte('created_at', oneMinAgo)
    if ((convCount ?? 0) >= MSG_PER_MIN_PER_CONVERSATION) {
      return { allowed: false, reason: 'conversation_rate_limit' }
    }
  }

  return { allowed: true }
}

/** Conteggio messaggi ospite oggi nella conversazione (session cap). */
export async function sessionMessageCount(
  sb: SupabaseClient<Database>,
  conversationId: string
): Promise<number> {
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  const { count } = await sb
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('direction', 'in')
    .gte('created_at', startOfDay.toISOString())
  return count ?? 0
}

// Escalation deterministica (zero AI): reclami, richiesta umano, pagamenti.
const ESCALATION_PATTERNS = [
  /rimbors/i, /recension/i, /reclam/i, /reclam/i, /disservizi/i,
  /\bumano\b/i, /persona reale/i, /operatore/i, /parlare con/i,
  /emergenz/i, /urgent/i,
]

export function needsEscalation(message: string): boolean {
  return ESCALATION_PATTERNS.some((re) => re.test(message))
}
