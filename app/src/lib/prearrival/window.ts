// Pre-arrival — FINESTRA e TEMPO. Tutto il tempo del modulo entra da qui e SEMPRE come
// parametro `now: Date`: in `lib/prearrival` non esiste alcuna lettura implicita
// dell'orologio (né via `Date.now`, né costruendo una `Date` priva di argomenti).
// Motivo: la finestra è una regola di prodotto verificabile, quindi dev'essere testabile
// a orologio fermo — niente fragilità sui confini di giorno e sui cambi di ora legale.

/**
 * Fuso di riferimento del pilota. `properties.timezone` esiste già a schema (default
 * 'Europe/Rome'): la generalizzazione per-struttura è un'estensione futura di questo
 * singolo punto, non una riscrittura del modulo.
 */
export const PREARRIVAL_TIMEZONE = 'Europe/Rome'

/**
 * Ampiezza della finestra di pre-arrivo, in GIORNI DI CALENDARIO locali, oggi incluso.
 * Con 3: sono in finestra gli arrivi di oggi, domani e dopodomani.
 */
export const PREARRIVAL_WINDOW_DAYS = 3

const DAY_MS = 86_400_000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const romeDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: PREARRIVAL_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Data di calendario `Europe/Rome` dell'istante dato, come `YYYY-MM-DD`.
 * Fail-fast su `Date` non valida: una data sbagliata falserebbe la finestra in silenzio.
 */
export function romeCalendarDate(now: Date): string {
  if (Number.isNaN(now.getTime())) throw new Error('romeCalendarDate: Date non valida')
  const parts = romeDateFormat.formatToParts(now)
  const part = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value ?? ''
  const [y, m, d] = [part('year'), part('month'), part('day')]
  if (!y || !m || !d) throw new Error('romeCalendarDate: formattazione fuso fallita')
  return `${y}-${m}-${d}`
}

/** Mezzanotte UTC della data di calendario, usata solo come indice ordinale dei giorni. */
function calendarDateToOrdinalMs(date: string): number | null {
  const m = ISO_DATE.exec(date)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const ms = Date.UTC(y, mo - 1, d)
  const back = new Date(ms)
  // Rifiuta le date "sbordate" (es. 2026-02-30 → 2026-03-02).
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null
  return ms
}

function ordinalMsToCalendarDate(ms: number): string {
  const d = new Date(ms)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/** `true` se la stringa è una data di calendario `YYYY-MM-DD` esistente. */
export function isCalendarDate(date: string): boolean {
  return calendarDateToOrdinalMs(date) !== null
}

/** Somma giorni a una data di calendario. `null` se l'input non è una data valida. */
export function addCalendarDays(date: string, days: number): string | null {
  const ms = calendarDateToOrdinalMs(date)
  if (ms === null || !Number.isInteger(days)) return null
  return ordinalMsToCalendarDate(ms + days * DAY_MS)
}

/** Giorni di calendario da `from` a `to` (negativo se `to` precede `from`). `null` se input non valido. */
export function daysBetweenCalendarDates(from: string, to: string): number | null {
  const a = calendarDateToOrdinalMs(from)
  const b = calendarDateToOrdinalMs(to)
  if (a === null || b === null) return null
  return Math.round((b - a) / DAY_MS)
}

/**
 * Estremi INCLUSIVI della finestra, pronti per una query su `check_in`
 * (`gte from` / `lte to`): il limite inferiore è oggi, quindi gli arrivi passati
 * sono esclusi per costruzione, non da un filtro aggiuntivo.
 */
export function prearrivalWindowBounds(now: Date): { from: string; to: string } {
  const from = romeCalendarDate(now)
  const to = addCalendarDays(from, PREARRIVAL_WINDOW_DAYS - 1)
  if (to === null) throw new Error('prearrivalWindowBounds: calcolo del limite superiore fallito')
  return { from, to }
}

/**
 * Giorni mancanti all'arrivo (0 = oggi). Negativo per gli arrivi passati.
 * `null` se `checkIn` è assente o non è una data di calendario valida.
 */
export function daysUntilCheckIn(checkIn: string | null | undefined, now: Date): number | null {
  if (!checkIn) return null
  return daysBetweenCalendarDates(romeCalendarDate(now), checkIn)
}

/**
 * La prenotazione è nella finestra di pre-arrivo?
 * Vero solo per `0 <= giorni < PREARRIVAL_WINDOW_DAYS`: `check_in < oggi` è fuori finestra
 * per costruzione (il pre-arrivo non si occupa di soggiorni già iniziati), e una data
 * mancante o malformata non entra mai in finestra.
 */
export function isWithinPrearrivalWindow(checkIn: string | null | undefined, now: Date): boolean {
  const days = daysUntilCheckIn(checkIn, now)
  return days !== null && days >= 0 && days < PREARRIVAL_WINDOW_DAYS
}
