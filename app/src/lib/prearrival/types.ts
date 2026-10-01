// Pre-arrival — CONTRATTI condivisi della card. La card è ciò che lo staff vede per una
// prenotazione in finestra; gli altri livelli del modulo (derivazione, letture, azioni)
// producono o consumano queste forme e nient'altro.
//
// Principio: uno stato degradato NON è un errore da nascondere né una card da omettere.
// È una card che dichiara il proprio limite (`reason`) e, per il solo fatto di essere in
// quello stato, restringe le azioni ammesse — l'elenco sta nel catalogo del modulo, non sulla
// card (vedi `PrearrivalCardState`). Coerente con il fail-fast visibile e con l'invariante
// ADR-0019: l'AI non impugna mai strumenti effettuali, quindi nessuno stato degradato può
// abilitare la stesura o l'invio di una comunicazione all'ospite.
import type { PrearrivalPurpose, PrearrivalTaskType } from './vocabulary'

/**
 * Stato della card: uno nominale + quattro degradati.
 * - `actionable` — nominale: il fatto è accertato e la card è lavorabile.
 * - `kb_incomplete` — la knowledge base della struttura non copre ciò che andrebbe chiesto.
 * - `no_channel` — la prenotazione non ha un canale utile verso l'ospite.
 * - `stale` — i dati letti sono stati superati (la riga è cambiata sotto la lettura).
 * - `undetermined` — indeterminato: non è stato possibile stabilire lo stato.
 */
export type PrearrivalCardStateKind =
  | 'actionable'
  | 'kb_incomplete'
  | 'no_channel'
  | 'stale'
  | 'undetermined'

/**
 * Azioni che la card può esporre. Solo `prepare_draft` avvia la preparazione di una
 * comunicazione (resta HITL: prepara una bozza, non invia) ed è ammessa esclusivamente
 * nello stato nominale. Le altre sono navigazione, rilettura o registrazione di un esito.
 */
export type PrearrivalActionKind =
  | 'open_booking'
  | 'prepare_draft'
  | 'resolve'
  | 'open_knowledge'
  | 'refresh'

/**
 * Descrizione di UNO stato: il motivo da mostrare allo staff e l'insieme chiuso delle azioni
 * ammesse. È il contratto del catalogo (`PREARRIVAL_STATE_CATALOG` in `card.ts`), cioè l'UNICO
 * posto in cui "quali azioni sono ammesse in quale stato" è scritto — vedi sotto perché quel
 * dato non può stare anche sullo stato che viaggia.
 */
export interface PrearrivalStateSpec {
  /** Motivo di default mostrato allo staff; vuoto per lo stato nominale. */
  reason: string
  allowedActions: readonly PrearrivalActionKind[]
}

/**
 * Lo stato di una card, nella forma in cui viaggia: SOLO `kind` e `reason`.
 *
 * ⚠️ Qui NON c'è l'elenco delle azioni ammesse, e l'assenza è il presidio (correzione del
 * 01/10/2026, difetto High in revisione). Questo oggetto è serializzabile, quindi attraversa
 * il confine di fiducia in entrambi i versi: server → props del componente, client →
 * argomenti di una server action. Portando con sé il proprio elenco di azioni, diventava un
 * permesso che il chiamante poteva riscrivere — bastava spedire
 * `allowedActions: ['prepare_draft']` su uno stato degradato. L'elenco vive perciò soltanto
 * nel catalogo del modulo (`PREARRIVAL_STATE_CATALOG`, con `PrearrivalStateSpec`: motivo +
 * azioni ammesse per ciascuno stato) e si interroga con `allowedActionsFor(kind)` /
 * `isActionAllowed(kind, action)`.
 *
 * `reason` resta testo da mostrare e non ha mai valore autorizzativo.
 */
export interface PrearrivalCardState {
  kind: PrearrivalCardStateKind
  /** Motivo da mostrare allo staff. Stringa vuota solo nello stato nominale. */
  reason: string
}

/**
 * Una card pre-arrivo. `anchorId` è l'id deterministico della task operativa; è `string | null`
 * perché nel ripiego di §5.2 (edge runtime, oggi non attivo — verdetto in `index.ts`) l'ancora
 * non è derivabile e l'identità arriva dalla riga letta.
 */
export interface PrearrivalCard {
  anchorId: string | null
  type: PrearrivalTaskType
  purpose: PrearrivalPurpose
  bookingRequestId: string
  guestName: string | null
  /** Data di calendario `YYYY-MM-DD`. */
  checkIn: string
  /** Giorni mancanti all'arrivo, 0 = oggi (dentro la finestra è sempre >= 0). */
  daysUntilCheckIn: number
  state: PrearrivalCardState
}
