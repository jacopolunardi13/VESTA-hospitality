import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { anthropic } from './client'
import { MODELS } from './models'
import { logAiCall } from './logging'
import type { ChatTurn, PropertyContext } from './types'

export interface ExtractedSlots {
  check_in: string | null      // ISO date YYYY-MM-DD
  check_out: string | null     // ISO date YYYY-MM-DD
  adults: number | null
  children: { age: number | null }[]  // age null = bambino citato senza età (mai scartato)
  language: string | null
  guest_name: string | null
  guest_contact: string | null
  special_requests: string | null
}

const EXTRACT_GUIDE = `Estrai i dati per un preventivo di soggiorno dal messaggio dell'ospite e dal contesto.
Regole:
- check_in / check_out come date ISO (YYYY-MM-DD). Se l'ospite dà un numero di notti, calcola check_out.
- Se l'anno non è indicato, assumi il prossimo futuro coerente.
- Se una data è ambigua o mancante, lascia null (NON inventare).
- adults: intero ≥ 1 se indicato, altrimenti null.
- children: array di {age}; registra OGNI bambino citato anche senza età (age: null se non indicata); NON ometterlo. [] se nessun bambino.
- language: lingua del messaggio (es. 'it', 'en').
- guest_name / guest_contact: solo se forniti esplicitamente, altrimenti null.
- special_requests: richieste particolari (culla, animali, accessibilità, orari), altrimenti null.`

/** extract (Haiku, structured output). Alimenta booking_requests. Logga in ai_calls. */
export async function extractSlots(
  sb: SupabaseClient<Database>,
  property: PropertyContext,
  userMessage: string,
  history: ChatTurn[],
  todayIso: string
): Promise<ExtractedSlots> {
  const model = MODELS.extract
  const started = Date.now()
  const ctx = history.slice(-6).map((t) => `${t.role}: ${t.content}`).join('\n')

  const empty: ExtractedSlots = {
    check_in: null, check_out: null, adults: null, children: [],
    language: null, guest_name: null, guest_contact: null, special_requests: null,
  }

  try {
    const res = await anthropic().messages.create({
      model,
      max_tokens: 512,
      system: `${EXTRACT_GUIDE}\nData odierna: ${todayIso}.`,
      tool_choice: { type: 'tool', name: 'record_slots' },
      tools: [
        {
          name: 'record_slots',
          description: 'Registra i dati estratti per il preventivo.',
          input_schema: {
            type: 'object',
            properties: {
              check_in: { type: ['string', 'null'] },
              check_out: { type: ['string', 'null'] },
              adults: { type: ['integer', 'null'] },
              children: {
                type: 'array',
                items: { type: 'object', properties: { age: { type: ['integer', 'null'] } }, required: ['age'] },
              },
              language: { type: ['string', 'null'] },
              guest_name: { type: ['string', 'null'] },
              guest_contact: { type: ['string', 'null'] },
              special_requests: { type: ['string', 'null'] },
            },
            required: ['check_in', 'check_out', 'adults', 'children'],
          },
        },
      ],
      messages: [
        { role: 'user', content: `${ctx ? `Contesto:\n${ctx}\n\n` : ''}Messaggio:\n${userMessage}` },
      ],
    })

    await logAiCall(sb, {
      orgId: property.orgId, propertyId: property.id, fn: 'extract', model,
      inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens,
      latencyMs: Date.now() - started, success: true,
    })

    const tu = res.content.find((b) => b.type === 'tool_use')
    if (tu && tu.type === 'tool_use') {
      const i = tu.input as Partial<ExtractedSlots>
      return {
        check_in: i.check_in ?? null,
        check_out: i.check_out ?? null,
        adults: typeof i.adults === 'number' ? i.adults : null,
        children: Array.isArray(i.children) ? i.children.map((c) => ({ age: typeof c?.age === 'number' ? c.age : null })) : [],
        language: i.language ?? null,
        guest_name: i.guest_name ?? null,
        guest_contact: i.guest_contact ?? null,
        special_requests: i.special_requests ?? null,
      }
    }
    return empty
  } catch (e) {
    await logAiCall(sb, {
      orgId: property.orgId, propertyId: property.id, fn: 'extract', model,
      inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started,
      success: false, error: e instanceof Error ? e.message : String(e),
    })
    return empty
  }
}

/** Slot minimi per calcolare un preventivo. */
export function slotsComplete(s: ExtractedSlots): boolean {
  if (!s.check_in || !s.check_out || !s.adults) return false
  return new Date(s.check_out) > new Date(s.check_in)
}
