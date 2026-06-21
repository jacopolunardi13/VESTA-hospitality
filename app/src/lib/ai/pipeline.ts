import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ConversationIntent, ConversationStage } from '@/lib/supabase/database.types'
import { classifyIntent } from './intent'
import { searchKnowledge, kbContextText, KB_DIRECT_ANSWER_RANK } from './knowledge'
import { generateReply } from './reply'
import { needsEscalation } from './guardrail'
import { extractSlots, type ExtractedSlots } from './extract'
import { selectBestQuote, selectAvailableRooms, type SelectedQuote, type RoomQuote } from '@/lib/quote/draftProposal'
import { selectRoomCombinations } from '@/lib/quote/roomCombinations'
import { proposalAllText, proposalCombinationText, singleNightNote, multiRequestAck, childAccommodationNote, conciergeAnswerIntro, normLang, type Lang, type RoomOption, type CombinationOption } from './messages'
import type { ChatTurn, PropertyContext } from './types'

export type ReplySource = 'kb' | 'ai' | 'template'

export interface PipelineResult {
  text: string
  intent: ConversationIntent
  confidence: number
  stage: ConversationStage
  status: 'open' | 'pending_staff' | 'closed'
  source: ReplySource
  escalated: boolean
  /** true → il chiamante crea/collega una booking_request (lead da chat). */
  createLead: boolean
  /** Dati estratti (solo ramo booking). */
  slots?: ExtractedSlots
  /** true → slot sufficienti per calcolare il preventivo (ramo booking). */
  slotsReady?: boolean
  /** Preventivo calcolato (ramo booking, se camera+tariffe disponibili). */
  draft?: SelectedQuote
  /** true → richiesta standard: invio automatico della proposta. */
  autoSend?: boolean
  /** Passo 1 flusso definitivo: tutte le camere disponibili mostrate all'ospite. */
  proposalRooms?: RoomQuote[]
  /** Combinazioni gruppo proposte (Opzione A/B) quando nessuna singola camera basta. */
  proposalCombinations?: CombinationOption[]
}

// Template deterministici (zero AI). MVP in italiano; localizzazione successiva.
const T = {
  escalation:
    'Grazie per il messaggio. Ho inoltrato la tua richiesta allo staff della struttura, che ti risponderà a breve. Se preferisci, lasciami un recapito per essere ricontattato.',
  partnership:
    'Grazie per l’interesse a collaborare con la struttura. Ho inoltrato la tua proposta al team, che valuterà e ti risponderà.',
  vendor:
    'Grazie per il messaggio. Ho inoltrato la tua comunicazione commerciale al team della struttura.',
  saas_lead:
    'Grazie dell’interesse! Questo è l’assistente Vesta per strutture ricettive. Ho segnalato la tua richiesta al team commerciale, che ti ricontatterà.',
  unclassified:
    'Per aiutarti meglio: stai cercando informazioni sul soggiorno oppure vuoi un preventivo per delle date? Dimmi pure.',
  session_limit:
    'Per oggi abbiamo scambiato diversi messaggi. Lasciami un recapito (telefono o email) e lo staff della struttura ti ricontatterà per completare la richiesta.',
  safe_mode_no_kb:
    'Al momento non riesco a rispondere automaticamente. Lasciami un recapito e lo staff della struttura ti ricontatterà al più presto.',
  courtesy_quote:
    'Grazie per averci contattato. Sto verificando disponibilità e migliore tariffa per le date richieste. Un membro del nostro staff ti risponderà a breve con una proposta personalizzata.',
}

/**
 * Pipeline knowledge-first. Decide la risposta e i metadati conversazione.
 * La persistenza (messaggi, conversazione, lead) è a carico del chiamante (route).
 * Orientata a conversione: anche le FAQ sono ancorate alla struttura e, quando
 * naturale, riportano alla disponibilità.
 */
function formatItDate(iso: string): string {
  try { return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' }).format(new Date(iso)) }
  catch { return iso }
}

function recapText(s: ExtractedSlots): string {
  const parts: string[] = []
  if (s.check_in && s.check_out) parts.push(`dal ${formatItDate(s.check_in)} al ${formatItDate(s.check_out)}`)
  const guests: string[] = []
  if (s.adults) guests.push(`${s.adults} ${s.adults === 1 ? 'adulto' : 'adulti'}`)
  if (s.children.length) {
    const ages = s.children.map((c) => c.age).filter((a): a is number => a != null)
    guests.push(`${s.children.length} ${s.children.length === 1 ? 'bambino' : 'bambini'}${ages.length ? ` (${ages.join(', ')} anni)` : ''}`)
  }
  if (guests.length) parts.push(guests.join(' e '))
  return parts.join(', ')
}

/** Fix A — default 1 notte: arrivo+ospiti noti, partenza mancante (o non valida) → assume 1 notte.
 *  Muta `s` e ritorna true se l'assunzione è stata applicata. */
function applySingleNightDefault(s: ExtractedSlots): boolean {
  // Partenza non valida (≤ arrivo): ignorala.
  if (s.check_in && s.check_out && new Date(s.check_out + 'T00:00:00Z') <= new Date(s.check_in + 'T00:00:00Z')) {
    s.check_out = null
  }
  if (s.check_in && s.adults && !s.check_out) {
    const d = new Date(s.check_in + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 1)
    s.check_out = d.toISOString().slice(0, 10)
    return true
  }
  return false
}

/** Fix B/C — elenco granulare dei dati realmente mancanti (mai richiede l'arrivo se già noto). */
function bookingMissing(s: ExtractedSlots): string[] {
  const missing: string[] = []
  if (!s.check_in) missing.push('le **date** (almeno la data di arrivo)')
  // Se l'ospite ha specificato ≥2 camere, l'occupancy esatta è opzionale (capienza = max).
  const roomCount = s.segments[0]?.room_count ?? 1
  if (!s.adults && roomCount < 2) missing.push('**quante persone** (adulti ed eventuali bambini)')
  if (s.children.some((c) => c.age == null)) missing.push("l'**età dei bambini**")
  return missing
}

function missingAsk(missing: string[]): string {
  return `Con piacere ti preparo un preventivo su misura. Per procedere mi ${missing.length === 1 ? 'serve' : 'servono'} ${missing.join(' e ')}.`
}

const euro = (c: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(c / 100)

// Una richiesta è NON standard (→ supervisione) se contiene sconti/trattativa,
// eventi/cerimonie, cancellazioni/spostamenti/modifiche. I GRUPPI per headcount NON sono
// più auto-escalati: la fattibilità la decide il combinatore camere (staff solo se nessuna
// combinazione copre la capienza). Nota: `\bmatrimoni(o)?\b` marca SOLO l'evento.
// NB: i token "evento" usano word-boundary (\bevent[oi]\b / \bevents?\b) per NON matchare
// dentro parole comuni e benigne come "prEVENTivo" o "EVENTuale" (falso positivo che
// mandava in escalation qualunque richiesta di preventivo). Stessa logica di matrimoniale↔matrimonio.
const NON_STANDARD = /scont|prezzo miglior|miglior prezzo|offerta miglior|trattativ|\bmatrimoni(o)?\b|nozze|\bfest[ae]\b|cerimoni|\bevent[oi]\b|\bevents?\b|meeting|congress|cancell|disdir|spostar|cambi\w* data|modific|rimbors/i

// Menzione di culla/sistemazione particolare (per la regola "bambino >2 + culla → staff").
const COT_MENTION = /\bcull[ae]\b|lettino|\bcot\b|sistemazione particolar/i

/** Bambini che richiedono un letto REALE (età nota e > 2). I 0-2 anni non contano
 *  (dormono nel letto dei genitori; culla opzionale). Età null → gestita a monte (chiarimento). */
export function childrenNeedingBed(children: { age: number | null }[]): number {
  return children.filter((c) => c.age != null && c.age > 2).length
}

export function isStandardBooking(s: ExtractedSlots, message: string, settings: Record<string, unknown>): boolean {
  if (NON_STANDARD.test(message)) return false
  // Bambino > 2 anni con culla/sistemazione particolare richiesta → nota/staff (no auto-quote),
  // senza impedire la richiesta. Default (senza culla): il >2 conta come terzo ospite (capienza).
  if (COT_MENTION.test(message) && s.children.some((c) => c.age != null && c.age > 2)) return false
  // Nessuna soglia headcount: i gruppi sono gestiti dal combinatore camere (Passo 1).
  void settings
  return true
}

/**
 * Richiesta MISTA — risponde alla domanda concierge nello STESSO messaggio del preventivo.
 * Cerca nella KB (query IT) e genera una risposta breve nella lingua dell'ospite, in un blocco
 * separato sotto il preventivo. Robusto: se l'AI fallisce o non produce testo, restituisce il
 * testo booking invariato (la domanda concierge non deve MAI bloccare il preventivo).
 */
async function composeConciergeAnswer(
  sb: SupabaseClient<Database>,
  property: PropertyContext,
  history: ChatTurn[],
  conciergeQuery: string,
  userMessage: string,
  lang: Lang,
  bookingText: string
): Promise<string> {
  try {
    const hits = await searchKnowledge(sb, property.id, conciergeQuery, 5)
    const ask = `L'ospite, oltre alla richiesta di soggiorno (già gestita a parte nello stesso messaggio), chiede anche: «${userMessage}». Rispondi SOLO alla parte informativa/concierge — NON a disponibilità, prezzi o preventivo — in modo conciso e nella stessa lingua dell'ospite. Se l'informazione non è disponibile nelle note, dillo cortesemente e rimanda allo staff.`
    const reply = await generateReply(sb, property, kbContextText(hits), history, ask)
    const ans = reply.text.trim()
    if (!ans) return bookingText
    return `${bookingText}\n\n${conciergeAnswerIntro(lang)}\n${ans}`
  } catch {
    return bookingText
  }
}

export async function runPipeline(opts: {
  sb: SupabaseClient<Database>
  property: PropertyContext
  history: ChatTurn[]
  userMessage: string
  aiEnabled: boolean
  todayIso: string
}): Promise<PipelineResult> {
  const { sb, property, history, userMessage, aiEnabled, todayIso } = opts

  // 1. Escalation deterministica (zero AI) — ha precedenza su tutto.
  if (needsEscalation(userMessage)) {
    return {
      text: T.escalation, intent: 'guest_support', confidence: 1,
      stage: 'handoff_staff', status: 'pending_staff', source: 'template',
      escalated: true, createLead: false,
    }
  }

  // 2. Safe mode / AI disattivata: nessuna chiamata AI → match KB lessicale sulla query grezza.
  if (!aiEnabled) {
    const hits = await searchKnowledge(sb, property.id, userMessage, 5)
    if (hits.length > 0 && (hits[0].rank ?? 0) >= KB_DIRECT_ANSWER_RANK) {
      const a = hits[0]
      return {
        text: `${a.content ?? a.title}`.trim(), intent: 'faq', confidence: 0.5,
        stage: 'new', status: 'open', source: 'kb', escalated: false, createLead: false,
      }
    }
    return {
      text: T.safe_mode_no_kb, intent: 'unclassified', confidence: 0,
      stage: 'new', status: 'open', source: 'template', escalated: false, createLead: false,
    }
  }

  // 3. Intent detection (Haiku) — restituisce anche la query di ricerca tradotta in italiano
  //    (cross-lingua: il retrieval KB italiano funziona anche per domande EN/ES/FR/DE).
  const { intent, confidence, searchQueryIt, conciergeQuery } = await classifyIntent(sb, property, userMessage, history)

  // 5. Branch per intent.
  switch (intent) {
    case 'spam':
      return { text: '', intent, confidence, stage: 'closed', status: 'closed',
        source: 'template', escalated: false, createLead: false }

    case 'partnership':
      return { text: T.partnership, intent, confidence, stage: 'handoff_staff',
        status: 'pending_staff', source: 'template', escalated: false, createLead: false }

    case 'vendor':
      return { text: T.vendor, intent, confidence, stage: 'closed', status: 'open',
        source: 'template', escalated: false, createLead: false }

    case 'saas_lead':
      return { text: T.saas_lead, intent, confidence, stage: 'handoff_staff',
        status: 'pending_staff', source: 'template', escalated: false, createLead: false }

    case 'unclassified':
      return { text: T.unclassified, intent, confidence, stage: 'intent_pending',
        status: 'open', source: 'template', escalated: false, createLead: false }

    case 'booking': {
      // Wrapper: calcola la risposta booking, poi (richiesta MISTA) appende la risposta
      // concierge nello stesso messaggio. Il corpo interno è invariato.
      const bookingResult = await (async (): Promise<PipelineResult> => {
      // Lead da chat + slot filling.
      const slots = await extractSlots(sb, property, userMessage, history, todayIso)
      // Multi-richiesta (≥2 segmenti: più camere/periodi): conserva TUTTO, NESSUN
      // preventivo automatico, lead unico + inoltro allo staff (vedi orchestrate).
      if (slots.segments.length >= 2) {
        return {
          text: multiRequestAck(normLang(slots.language), slots.segments),
          intent, confidence, stage: 'quoting', status: 'open',
          source: 'template', escalated: false, createLead: true,
          slots, slotsReady: false,
        }
      }

      // Fix A: se arrivo+ospiti noti ma manca la partenza → assume 1 notte.
      const assumedSingleNight = applySingleNightDefault(slots)

      // Fix B/C: chiedi SOLO i dati realmente mancanti (mai l'arrivo se già noto;
      // richiedi l'età dei bambini se mancante invece di scartarli).
      const missing = bookingMissing(slots)
      if (missing.length > 0) {
        return {
          text: missingAsk(missing), intent, confidence, stage: 'collecting_data',
          status: 'open', source: 'template', escalated: false, createLead: true,
          slots, slotsReady: false,
        }
      }

      const standard = isStandardBooking(slots, userMessage, property.settings)

      // FLUSSO DEFINITIVO · Passo 1 — richiesta standard: mostra TUTTE le camere
      // disponibili+prezzate (affidabilità non bassa) con prezzo e descrizione.
      // Il cliente sceglie; Vesta NON blocca nulla e NON propone una sola camera.
      if (standard) {
        const lang = normLang(slots.language)
        const requiredBeds = (slots.adults ?? 0) + childrenNeedingBed(slots.children)
        const noteSN = assumedSingleNight ? singleNightNote(lang, slots.check_in!, slots.check_out!) + '\n\n' : ''
        const noteChildren = slots.children.length > 0 ? '\n\n' + childAccommodationNote(lang, slots.children) : ''
        // Tutte le camere disponibili+prezzate (senza filtro capienza): alimenta sia il
        // caso a camera singola sia il combinatore gruppi.
        const available = await selectAvailableRooms(sb, {
          propertyId: property.id, orgId: property.orgId,
          checkIn: slots.check_in!, checkOut: slots.check_out!, adults: slots.adults!, todayIso,
        })
        const singleFit = available.filter((r) => r.maxGuests >= requiredBeds)
        const combinable = available.map((r) => ({ roomId: r.roomId, roomName: r.roomName, maxGuests: r.maxGuests, offerTotalCents: r.quote.offerTotalCents }))
        const toComboOptions = (combos: ReturnType<typeof selectRoomCombinations>): CombinationOption[] =>
          combos.map((c) => ({ roomNames: c.rooms.map((x) => x.roomName), capacity: c.totalCapacity, amountEur: Math.round(c.totalCents / 100) }))
        const groupReturn = (comboOptions: CombinationOption[]) => ({
          text: noteSN + proposalCombinationText(lang, comboOptions) + noteChildren,
          intent, confidence, stage: 'proposal_sent' as const, status: 'open' as const,
          source: 'template' as const, escalated: false, createLead: true,
          slots, slotsReady: true, proposalCombinations: comboOptions,
        })
        // Numero ESATTO di camere richieste (room_count): 1 = singola; ≥2 = gruppo a numero fisso.
        const roomCountWanted = slots.segments[0]?.room_count ?? 1

        if (roomCountWanted >= 2) {
          // Gruppo con numero camere esplicito → combinatore a numero ESATTO (anche se una basterebbe).
          if (available.length > 0) {
            const combos = selectRoomCombinations(combinable, requiredBeds, { maxOptions: 2, minRooms: roomCountWanted, maxRooms: roomCountWanted })
            if (combos.length > 0) return groupReturn(toComboOptions(combos))
          }
          // Numero richiesto non copribile → cortesia/staff (sotto), senza ripiegare su un numero diverso.
        } else {
          // Caso A — almeno una camera singola soddisfa la capienza → mostra le singole.
          if (singleFit.length > 0) {
            const options: RoomOption[] = singleFit.map((r) => ({
              roomId: r.roomId, name: r.roomName, description: r.description,
              amountEur: Math.round(r.quote.offerTotalCents / 100),
            }))
            return {
              text: noteSN + proposalAllText(lang, options) + noteChildren,
              intent, confidence, stage: 'proposal_sent', status: 'open',
              source: 'template', escalated: false, createLead: true,
              slots, slotsReady: true, proposalRooms: singleFit,
            }
          }
          // Caso B — nessuna singola basta → combinatore minimize (Opzione A/B).
          if (available.length > 0) {
            const combos = selectRoomCombinations(combinable, requiredBeds, { maxOptions: 2 })
            if (combos.length > 0) return groupReturn(toComboOptions(combos))
          }
        }
        // Nessuna combinazione copre la capienza → cortesia/staff (sotto).
      }

      // FALLBACK DI CORTESIA — prezzo o disponibilità non verificati, oppure richiesta
      // non standard. Vesta NON resta silenziosa: registra il lead, classifica (già fatto),
      // notifica lo staff/Jacopo (lato route) e risponde con messaggio di cortesia.
      // NESSUN prezzo comunicato all'ospite. Se una bozza è calcolabile, viene salvata
      // per lo staff (passata al chiamante via `draft`).
      const draft = await selectBestQuote(sb, {
        propertyId: property.id, orgId: property.orgId,
        checkIn: slots.check_in!, checkOut: slots.check_out!,
        adults: slots.adults!, childrenBeds: childrenNeedingBed(slots.children),
        todayIso,
      })
      return {
        text: T.courtesy_quote,
        intent, confidence, stage: 'quoting', status: 'open',
        source: 'template', escalated: false, createLead: true,
        slots, slotsReady: true,
        draft: draft ?? undefined,
        autoSend: false,
      }
      })()
      // Richiesta MISTA: domanda concierge presente OLTRE alla prenotazione → rispondi a
      // ENTRAMBE nello stesso messaggio (preventivo/ack + risposta informativa separata).
      // Vale per tutti i sotto-rami (proposta, combinazioni, dati mancanti, multi-richiesta, cortesia).
      if (conciergeQuery && conciergeQuery.trim()) {
        const lang = normLang(bookingResult.slots?.language)
        bookingResult.text = await composeConciergeAnswer(sb, property, history, conciergeQuery, userMessage, lang, bookingResult.text)
      }
      return bookingResult
    }

    case 'faq':
    case 'guest_support':
    default: {
      // Retrieval cross-lingua: cerca nella KB italiana con la query tradotta.
      const q = searchQueryIt && searchQueryIt.trim() ? searchQueryIt : userMessage
      const kbHits = await searchKnowledge(sb, property.id, q, 5)
      // generate_reply risponde SEMPRE nella lingua dell'ospite (system prompt).
      const reply = await generateReply(sb, property, kbContextText(kbHits), history, userMessage)
      return {
        text: reply.text, intent, confidence,
        stage: intent === 'guest_support' ? 'handoff_staff' : 'new',
        status: 'open', source: 'ai', escalated: false, createLead: false,
      }
    }
  }
}

export const SESSION_LIMIT_TEMPLATE = T.session_limit
