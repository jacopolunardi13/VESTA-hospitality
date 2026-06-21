import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { anthropic } from './client'
import { MODELS } from './models'
import { logAiCall } from './logging'
import type { ChatTurn, PropertyContext } from './types'

/** Una richiesta di soggiorno = "RoomRequirement". Multi-richiesta = più segmenti distinti
 *  (date/tipi diversi). Più camere dello STESSO tipo nello STESSO soggiorno = room_count > 1. */
export interface StayRequest {
  room_type: string | null     // es. 'matrimoniale', 'tripla', 'doppia', 'superior' — null se non indicato
  room_count: number | null    // numero ESATTO di camere richieste di quel tipo/soggiorno (null = non indicato)
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
- adults: intero ≥ 1 SOLO se indicato esplicitamente o deducibile con certezza (es. "coppia" = 2). NON inventare un numero da termini vaghi ("famiglia", "gruppo", "comitiva" senza numero) → lascia null.
- children: array di {age}; registra OGNI bambino citato anche senza età (age: null se non indicata); NON ometterlo. [] se nessun bambino.
- language: lingua del messaggio (es. 'it', 'en').
- guest_name / guest_contact: solo se forniti esplicitamente, altrimenti null.
- special_requests: richieste particolari (culla, animali, accessibilità, orari), altrimenti null.
- segments: elenca le richieste di soggiorno. DISTINGUI:
  • QUANTITÀ di camere dello STESSO tipo per lo STESSO soggiorno (stesse date) = UN solo segmento con room_count = N. Es. "2 triple il 2 settembre" → 1 segmento {room_type:'tripla', room_count:2}. "3 doppie dal 1 al 3 agosto" → 1 segmento {room_type:'doppia', room_count:3}. "2 camere per 5 persone" → 1 segmento {room_count:2, adults:5}. "3 coppie" → 1 segmento {room_type:'doppia', room_count:3, adults:6}. NON creare un segmento per camera.
  • RICHIESTE DISTINTE (date diverse O tipi diversi) = segmenti separati. Es. "una matrimoniale il 1 agosto E una tripla l'1-2 settembre" = 2 segmenti. NON fonderle.
  Per ogni segmento: room_type (se indicato, altrimenti null), room_count (numero esatto di camere; 1 se non indicato), check_in, check_out, adults (totali del segmento), children. I campi piatti corrispondono al PRIMO segmento. Richiesta singola = un solo elemento.`

function addOneNight(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10)
}

const NUM_WORDS: Record<string, number> = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8 }
function parseNum(w: string): number | null { const n = parseInt(w, 10); return !isNaN(n) ? n : (NUM_WORDS[w.toLowerCase()] ?? null) }

/**
 * Normalizza i segment (deterministico, indipendente dalla varianza LLM):
 * - default 1 notte per-segment (arrivo noto, partenza mancante);
 * - MERGE per chiave (check_in, check_out, room_type): somma room_count e adults, concatena children;
 * - fallback adults dal flat se l'unico gruppo è senza adulti (es. "2 camere per 5").
 * Così "3 doppie" splittate dall'LLM in 3 segment → 1 segment room_count=3.
 */
export function mergeSegments(raw: StayRequest[], flatAdults: number | null): StayRequest[] {
  const byKey = new Map<string, StayRequest>()
  for (const seg of raw) {
    const co = seg.check_in && !seg.check_out ? addOneNight(seg.check_in) : seg.check_out
    const key = `${seg.check_in ?? ''}|${co ?? ''}|${(seg.room_type ?? '').toLowerCase()}`
    const count = seg.room_count ?? 1
    const ex = byKey.get(key)
    if (ex) {
      ex.room_count = (ex.room_count ?? 0) + count
      ex.adults = (ex.adults ?? 0) + (seg.adults ?? 0)
      ex.children = [...ex.children, ...seg.children]
    } else {
      byKey.set(key, { ...seg, check_out: co, room_count: count })
    }
  }
  const out = [...byKey.values()]
  if (out.length === 1 && (!out[0].adults || out[0].adults === 0) && flatAdults) out[0].adults = flatAdults
  return out
}

/** Inferenza deterministica su un soggiorno singolo: "N coppie" → N doppie, 2N adulti;
 *  "N camere"/"N camere per M" → room_count = N. Rete di sicurezza oltre il prompt. */
export function inferRoomRequirement(message: string, seg: StayRequest): void {
  const m = message.toLowerCase()
  const NUM = '(\\d+|un[oa]?|due|tre|quattro|cinque|sei|sette|otto)'
  // "N triple/doppie/matrimoniali/coppie" → room_count + tipo + occupancy implicita (cap. max),
  //  così il combinatore sceglie le camere giuste (3 per tripla, 2 per doppia). Staff conferma.
  const typed: [RegExp, string, number][] = [
    [new RegExp(`\\b${NUM}\\s+tripl[ae]\\b`), 'tripla', 3],
    [new RegExp(`\\b${NUM}\\s+doppi[ae]\\b`), 'doppia', 2],
    [new RegExp(`\\b${NUM}\\s+matrimonial[ie]\\b`), 'matrimoniale', 2],
    [new RegExp(`\\b${NUM}\\s+coppi[ae]\\b`), 'doppia', 2],
  ]
  for (const [re, type, perRoom] of typed) {
    const mt = m.match(re)
    if (mt) {
      const n = parseNum(mt[1])
      if (n) { seg.room_count = n; if (!seg.room_type) seg.room_type = type; if (!seg.adults) seg.adults = n * perRoom; break }
    }
  }
  // "N camere" generiche (senza tipo): fissa solo il numero di camere.
  const camere = m.match(new RegExp(`\\b${NUM}\\s+camere\\b`))
  if (camere) { const n = parseNum(camere[1]); if (n && n >= 1) seg.room_count = Math.max(seg.room_count ?? 1, n) }
}

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
                    room_count: { type: ['integer', 'null'], description: 'Numero esatto di camere richieste di quel tipo per quel soggiorno (1 se non indicato).' },
                    check_in: { type: ['string', 'null'] },
                    check_out: { type: ['string', 'null'] },
                    adults: { type: ['integer', 'null'] },
                    children: {
                      type: 'array',
                      items: { type: 'object', properties: { age: { type: ['integer', 'null'] } }, required: ['age'] },
                    },
                  },
                  required: ['room_type', 'room_count', 'check_in', 'check_out', 'adults', 'children'],
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
      let segments: StayRequest[] = rawSegs.map((s) => {
        const seg = s as StayRequest
        return {
          room_type: seg?.room_type ?? null,
          room_count: typeof seg?.room_count === 'number' ? seg.room_count : null,
          check_in: seg?.check_in ?? null,
          check_out: seg?.check_out ?? null,
          adults: typeof seg?.adults === 'number' ? seg.adults : null,
          children: Array.isArray(seg?.children) ? seg.children.map((c) => ({ age: typeof c?.age === 'number' ? c.age : null })) : [],
        }
      })
      if (segments.length === 0 && (check_in || adults || children.length)) {
        segments = [{ room_type: null, room_count: 1, check_in, check_out, adults, children }]
      }
      // Normalizzazione deterministica: merge quantità + default 1 notte + inferenza coppie/camere.
      segments = mergeSegments(segments, adults)
      if (segments.length === 1) inferRoomRequirement(userMessage, segments[0])
      const primary = segments[0]
      return {
        check_in: primary?.check_in ?? check_in,
        check_out: primary?.check_out ?? check_out,
        adults: primary?.adults ?? adults,
        children: primary && primary.children.length ? primary.children : children,
        segments,
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
