// Pre-arrival — VOCABOLARIO STABILE del modulo (§5.6). Unico punto in cui le stringhe
// di contratto esistono: `type` e `resolution` sono vocabolario APPLICATIVO di
// `operational_tasks` (migrazione 0014: nessun check SQL ⇒ nuovo valore = zero migrazioni),
// `purpose` è lo scopo della comunicazione pre-arrivo verso l'ospite.
//
// REGOLA DEL MODULO: nessun altro file di `lib/prearrival` ripete queste stringhe letterali;
// si importano sempre le costanti. Le ETICHETTE per lo staff NON vivono qui: quando il modulo
// verrà cablato sulla coda operativa andranno in `lib/tasks/catalog.ts` (fuori dagli allowed
// paths di questo task), come già per `booking.payment_window_expired`.

/**
 * I due FATTI di business del pre-arrivo (mai l'azione), naming `area.<fatto>` come 0014.
 * - `infoMissing`: mancano informazioni necessarie prima dell'arrivo.
 * - `etaMissing`: manca l'orario stimato di arrivo.
 */
export const PREARRIVAL_TASK_TYPES = {
  infoMissing: 'guest.prearrival_info_missing',
  etaMissing: 'guest.prearrival_eta_missing',
} as const

/**
 * I cinque esiti registrabili (contratto stabile, condiviso dai due `type`).
 * - `answered`: l'ospite ha risposto, il dato mancante è stato acquisito.
 * - `already_known`: il dato risultava già noto, non serviva chiederlo.
 * - `unreachable`: nessun canale utile verso l'ospite, impossibile chiedere.
 * - `no_reply`: richiesta inviata, nessuna risposta entro l'arrivo.
 * - `stay_cancelled`: soggiorno annullato o spostato, la richiesta non serve più.
 *
 * Perché `stay_cancelled` e non `cancelled`: in `operational_tasks` la colonna `status` ha un
 * CHECK che ammette proprio `'cancelled'` (migrazione 0014, `status in ('open','resolved',
 * 'cancelled')`) e viaggia sulla STESSA riga di `resolution` — `listTasksForProperty` le
 * seleziona insieme e `QueueTask` le espone entrambe. Con l'esito chiamato `cancelled` una
 * riga si leggerebbe `status='resolved', resolution='cancelled'`, e il literal da solo non
 * direbbe più se è la TASK a essere stata annullata o il SOGGIORNO: un filtro o un conteggio
 * che pivota sul valore sbagliato confonde i due casi senza sbagliare sintassi, quindi in
 * silenzio. Il prefisso nomina il soggetto e rende la riga leggibile da sola.
 */
export const PREARRIVAL_RESOLUTIONS = {
  answered: 'answered',
  alreadyKnown: 'already_known',
  unreachable: 'unreachable',
  noReply: 'no_reply',
  stayCancelled: 'stay_cancelled',
} as const

/**
 * I due scopi della comunicazione pre-arrivo. Uno per `type`: lo scopo dichiara *perché*
 * si scrive all'ospite e resta l'unico input che il livello di stesura può interpretare.
 */
export const PREARRIVAL_PURPOSES = {
  infoRequest: 'prearrival_info_request',
  etaRequest: 'prearrival_eta_request',
} as const

export type PrearrivalTaskType = (typeof PREARRIVAL_TASK_TYPES)[keyof typeof PREARRIVAL_TASK_TYPES]
export type PrearrivalResolution = (typeof PREARRIVAL_RESOLUTIONS)[keyof typeof PREARRIVAL_RESOLUTIONS]
export type PrearrivalPurpose = (typeof PREARRIVAL_PURPOSES)[keyof typeof PREARRIVAL_PURPOSES]

/** Elenchi ordinati (per iterazione, guard di esaustività e test). */
export const PREARRIVAL_TASK_TYPE_VALUES: readonly PrearrivalTaskType[] = Object.values(PREARRIVAL_TASK_TYPES)
export const PREARRIVAL_RESOLUTION_VALUES: readonly PrearrivalResolution[] = Object.values(PREARRIVAL_RESOLUTIONS)
export const PREARRIVAL_PURPOSE_VALUES: readonly PrearrivalPurpose[] = Object.values(PREARRIVAL_PURPOSES)

/** Lo scopo della comunicazione corrispondente a un `type`. Totale, puro. */
export function purposeForTaskType(type: PrearrivalTaskType): PrearrivalPurpose {
  return type === PREARRIVAL_TASK_TYPES.etaMissing
    ? PREARRIVAL_PURPOSES.etaRequest
    : PREARRIVAL_PURPOSES.infoRequest
}

/** Guard difensivo su valori che arrivano dal DB (colonna `text`, nessun check SQL). */
export function isPrearrivalTaskType(v: unknown): v is PrearrivalTaskType {
  return typeof v === 'string' && (PREARRIVAL_TASK_TYPE_VALUES as readonly string[]).includes(v)
}

/** Guard difensivo su `operational_tasks.resolution` (colonna `text`, nessun check SQL). */
export function isPrearrivalResolution(v: unknown): v is PrearrivalResolution {
  return typeof v === 'string' && (PREARRIVAL_RESOLUTION_VALUES as readonly string[]).includes(v)
}
