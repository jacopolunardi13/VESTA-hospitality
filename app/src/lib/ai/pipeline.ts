import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ConversationIntent, ConversationStage } from '@/lib/supabase/database.types'
import { classifyIntent } from './intent'
import { searchKnowledge, kbContextText, KB_DIRECT_ANSWER_RANK } from './knowledge'
import { generateReply } from './reply'
import { needsEscalation } from './guardrail'
import { extractSlots, slotsComplete, type ExtractedSlots } from './extract'
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
  if (s.children.length) guests.push(`${s.children.length} ${s.children.length === 1 ? 'bambino' : 'bambini'}${s.children.some((c) => c.age != null) ? ` (${s.children.map((c) => c.age).join(', ')} anni)` : ''}`)
  if (guests.length) parts.push(guests.join(' e '))
  return parts.join(', ')
}

function missingAsk(s: ExtractedSlots): string {
  const missing: string[] = []
  if (!s.check_in || !s.check_out) missing.push('le **date** di arrivo e partenza')
  if (!s.adults) missing.push('**quante persone** (adulti ed eventuali bambini con età)')
  return `Con piacere ti preparo un preventivo su misura. Per procedere mi servono ${missing.join(' e ')}.`
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

  // 2. Match KB full-text (zero AI) — sempre, fornisce contesto e shortcut.
  const hits = await searchKnowledge(sb, property.id, userMessage, 5)
  const kbText = kbContextText(hits)
  const topRank = hits[0]?.rank ?? 0

  // 3. Safe mode / AI disattivata: nessuna chiamata AI.
  if (!aiEnabled) {
    if (hits.length > 0 && topRank >= KB_DIRECT_ANSWER_RANK) {
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

  // 4. Intent detection (Haiku).
  const { intent, confidence } = await classifyIntent(sb, property, userMessage, history)

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
      // Lead da chat + slot filling. Il preventivo (lib/quote) è calcolato dal
      // chiamante (route) come BOZZA: supervision ON, nessun invio automatico.
      const slots = await extractSlots(sb, property, userMessage, history, todayIso)
      const ready = slotsComplete(slots)

      if (ready) {
        // Supervision ON: NON comunichiamo il prezzo all'ospite. Conferma raccolta
        // + (se manca) richiesta recapito per l'invio della proposta da parte dello staff.
        const recap = recapText(slots)
        const needContact = !slots.guest_contact
        const text =
          `Perfetto${recap ? `, ho raccolto la tua richiesta: ${recap}` : ''}. ` +
          `Sto preparando una proposta su misura con la nostra migliore tariffa diretta: ` +
          `lo staff della struttura te la invierà a brevissimo.` +
          (needContact ? ` Per ricevere la proposta, puoi lasciarmi un recapito (email o telefono)?` : '')
        return {
          text, intent, confidence, stage: 'quoting', status: 'open',
          source: 'template', escalated: false, createLead: true, slots, slotsReady: true,
        }
      }

      // Slot incompleti: richiesta deterministica dei dati mancanti (zero AI extra).
      return {
        text: missingAsk(slots), intent, confidence, stage: 'collecting_data',
        status: 'open', source: 'template', escalated: false, createLead: true,
        slots, slotsReady: false,
      }
    }

    case 'faq':
    case 'guest_support':
    default: {
      const reply = await generateReply(sb, property, kbText, history, userMessage)
      return {
        text: reply.text, intent, confidence,
        stage: intent === 'guest_support' ? 'handoff_staff' : 'new',
        status: 'open', source: 'ai', escalated: false, createLead: false,
      }
    }
  }
}

export const SESSION_LIMIT_TEMPLATE = T.session_limit
