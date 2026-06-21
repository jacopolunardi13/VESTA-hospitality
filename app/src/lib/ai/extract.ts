import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { anthropic } from './client'
import { MODELS } from './models'
import { logAiCall } from './logging'
import type { ChatTurn, PropertyContext } from './types'

/** Una singola richiesta di soggiorno (camera/periodo). Multi-richiesta = più segmenti. */
export interface StayRequest {
  room_type: string | null     // es. 'matrimoniale', 'tripla', 'doppia', 'superior' — null se non indicato
  check_in: string | null      // ISO date YYYY-MM-DD
  check_out: string | null
  adults: number | null
  children: { age: number | null }[]
}

export interface ExtractedSlots {
  check_in: string | null      // ISO date YYYY-MM-DD  (= prima richiesta, retro-compat)
  check_out: string | null     // ISO date YYYY-MM-DD
  adults: number | null
  children: { age: number | null }[]  // age null = bambino citato senza età (mai scartato)
  segments: StayRequest[]      // TUTTE le richieste rilevate (≥2 = multi-camera/multi-periodo)
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
- special_requests: richieste particolari (culla, animali, accessibilità, orari), altrimenti null.
- segments: elenca TUTTE le richieste di soggiorno presenti nel messaggio, UNA per ciascun periodo o camera diversa (es. "una matrimoniale il 1 agosto E una tripla l'1-2 settembre" = 2 segmenti). NON fondere richieste diverse, NON scartarne nessuna. Per ogni segmento: room_type (es. 'matrimoniale','tripla','doppia','superior' se indicato, altrimenti null), check_in, check_out, adults, children. I campi piatti (check_in/check_out/adults/children) devono corrispondere al PRIMO segmento. Per una richiesta singola, segments ha un solo elemento.`

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
    check_in: null, check_out: null, adults: null, children: [], segments: [],
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
              segments: {
                type: 'array',
                description: 'Tutte le richieste rilevate (≥2 = multi-camera/multi-periodo). Il primo = campi piatti.',
                items: {
                  type: 'object',
                  properties: {
                    room_type: { type: ['string', 'null'] },
                    check_in: { type: ['string', 'null'] },
                    check_out: { type: ['string', 'null'] },
                    adults: { type: ['integer', 'null'] },
                    children: {
                      type: 'array',
                      items: { type: 'object', properties: { age: { type: ['integer', 'null'] } }, required: ['age'] },
                    },
                  },
                  required: ['room_type', 'check_in', 'check_out', 'adults', 'children'],
                },
              },
              language: { type: ['string', 'null'] },
              guest_name: { type: ['string', 'null'] },
              guest_contact: { type: ['string', 'null'] },
              special_requests: { type: ['string', 'null'] },
            },
            required: ['check_in', 'check_out', 'adults', 'children', 'segments'],
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
      const children = Array.isArray(i.children) ? i.children.map((c) => ({ age: typeof c?.age === 'number' ? c.age : null })) : []
      const check_in = i.check_in ?? null
      const check_out = i.check_out ?? null
      const adults = typeof i.adults === 'number' ? i.adults : null
      // segments: tutte le richieste rilevate; se assenti, sintetizza dalla richiesta piatta.
      const rawSegs = Array.isArray(i.segments) ? i.segments : []
      let segments: StayRequest[] = rawSegs.map((s) => ({
        room_type: (s as StayRequest)?.room_type ?? null,
        check_in: (s as StayRequest)?.check_in ?? null,
        check_out: (s as StayRequest)?.check_out ?? null,
        adults: typeof (s as StayRequest)?.adults === 'number' ? (s as StayRequest).adults : null,
        children: Array.isArray((s as StayRequest)?.children) ? (s as StayRequest).children.map((c) => ({ age: typeof c?.age === 'number' ? c.age : null })) : [],
      }))
      if (segments.length === 0 && (check_in || adults || children.length)) {
        segments = [{ room_type: null, check_in, check_out, adults, children }]
      }
      return {
        check_in, check_out, adults, children, segments,
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
