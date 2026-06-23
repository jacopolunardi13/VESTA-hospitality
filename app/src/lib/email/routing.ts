// Router email L0 — classifica ogni email PRIMA del pipeline. Deterministico quando possibile
// (header + dominio mittente + pattern oggetto); AI (Haiku) solo sul dubbio e PROPONE solo la
// categoria, non decide MAI se rispondere. Se resta dubbio → 'guest' (e l'email resta non letta).
import type { InboundEmail } from './gmail'

export type EmailCategory = 'guest' | 'ota_pms' | 'supplier_admin' | 'newsletter_spam'
export type OtaSource = 'booking' | 'expedia' | 'airbnb' | 'quovai' | 'qvi' | 'unknown'

export interface RouteResult {
  category: EmailCategory
  source: OtaSource | null
  confidence: number
  method: 'deterministic' | 'ai' | 'default'
}

export interface RoutingRules {
  otaDomains: string[]      // domini OTA/PMS aggiuntivi (oltre alla baseline)
  supplierDomains: string[] // domini fornitori/amministrativi
}

// Baseline OTA/PMS (estendibile per-property via settings.email_routing).
const BASE_OTA: { source: OtaSource; domains: string[] }[] = [
  { source: 'booking', domains: ['booking.com', 'mailbooking.com'] },
  { source: 'expedia', domains: ['expedia.com', 'expediapartnercentral.com', 'expediamail.com'] },
  { source: 'airbnb', domains: ['airbnb.com'] },
  { source: 'quovai', domains: ['quovai.com', 'quovai.it'] },
  { source: 'qvi', domains: ['qvi.it', 'qvi.com'] },
]
const OTA_SUBJECT = /\b(prenotazione|reservation|booking)\b.*\b(nuov|new|confermat|confirmed|cancellat|cancel|modific|chang)/i
const NEWSLETTER = /\bnewsletter\b|unsubscribe|disiscriv|cancella iscrizione/i
const NOREPLY = /(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?@|automated@)/i

export function getRoutingRules(settings: Record<string, unknown> | null | undefined): RoutingRules {
  const r = ((settings ?? {})['email_routing'] ?? {}) as Partial<RoutingRules>
  return {
    otaDomains: Array.isArray(r.otaDomains) ? r.otaDomains.map(String) : [],
    supplierDomains: Array.isArray(r.supplierDomains) ? r.supplierDomains.map(String) : [],
  }
}

/**
 * RETE DI SICUREZZA FINALE: l'email porta marcatori di posta automatica?
 * (Auto-Submitted ≠ "no", Precedence: bulk/list/junk, List-Unsubscribe presente).
 * Se true, NON deve mai generare lead/risposta/azioni concierge, anche se per errore
 * fosse classificata 'guest'. Indipendente dal classificatore (difesa in profondità).
 */
export function hasAutomatedMarkers(email: InboundEmail): boolean {
  if ((email.listUnsubscribe ?? '').trim()) return true
  const as = (email.autoSubmitted ?? '').trim().toLowerCase()
  if (as && as !== 'no') return true
  if (/bulk|list|junk/i.test(email.precedence ?? '')) return true
  return false
}

function domainOf(addr: string): string {
  const m = (addr ?? '').toLowerCase().match(/@([^>\s]+)/)
  return m ? m[1] : (addr ?? '').toLowerCase()
}
const endsWithDomain = (dom: string, base: string) => dom === base || dom.endsWith('.' + base)

/** Classificazione deterministica. Ritorna null se non c'è un segnale chiaro (→ AI/ospite). */
export function classifyEmailDeterministic(email: InboundEmail, rules: RoutingRules): RouteResult | null {
  const dom = domainOf(email.from)
  const subj = email.subject ?? ''

  for (const o of BASE_OTA) if (o.domains.some((d) => endsWithDomain(dom, d)))
    return { category: 'ota_pms', source: o.source, confidence: 0.97, method: 'deterministic' }
  for (const d of rules.otaDomains) if (endsWithDomain(dom, d.toLowerCase()))
    return { category: 'ota_pms', source: 'unknown', confidence: 0.9, method: 'deterministic' }
  for (const d of rules.supplierDomains) if (endsWithDomain(dom, d.toLowerCase()))
    return { category: 'supplier_admin', source: null, confidence: 0.9, method: 'deterministic' }

  // Newsletter: header List-Unsubscribe, Precedence: bulk, o marcatori nell'oggetto.
  if (email.listUnsubscribe || /bulk|list/i.test(email.precedence ?? '') || NEWSLETTER.test(subj))
    return { category: 'newsletter_spam', source: null, confidence: 0.85, method: 'deterministic' }

  // Oggetto tipico di notifica prenotazione da fonte non nella lista domini → ota_pms.
  if (OTA_SUBJECT.test(subj))
    return { category: 'ota_pms', source: 'unknown', confidence: 0.7, method: 'deterministic' }

  // Mittente automatico/no-reply non OTA/fornitore → nessuna risposta (ignora).
  if (/auto/i.test(email.autoSubmitted ?? '') || NOREPLY.test(email.from))
    return { category: 'newsletter_spam', source: null, confidence: 0.7, method: 'deterministic' }

  return null
}

/** L'AI propone SOLO una categoria (mai decide se rispondere). */
export type AiCategoryProposer = (email: InboundEmail) => Promise<{ category: EmailCategory; confidence: number } | null>

/**
 * Decisione finale di routing. L'azione (rispondere o no) è SEMPRE rule-based sulla categoria:
 * solo 'guest' entra nel pipeline. Sul dubbio → 'guest' (email lasciata non letta a monte).
 */
export async function classifyEmailCategory(
  email: InboundEmail, rules: RoutingRules, ai?: AiCategoryProposer
): Promise<RouteResult> {
  const det = classifyEmailDeterministic(email, rules)
  if (det) return det
  if (ai) {
    try {
      const p = await ai(email)
      // Usa la proposta SOLO se NON-ospite e confidente; altrimenti resta ospite.
      if (p && p.category !== 'guest' && p.confidence >= 0.7)
        return { category: p.category, source: p.category === 'ota_pms' ? 'unknown' : null, confidence: p.confidence, method: 'ai' }
    } catch { /* AI non disponibile → fallback ospite */ }
  }
  return { category: 'guest', source: null, confidence: 0.5, method: 'default' }
}
