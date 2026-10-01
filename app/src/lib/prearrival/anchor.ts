// Pre-arrival — ID ANCORA della task operativa. L'ancora è la chiave primaria di
// `operational_tasks`: derivarla in modo DETERMINISTICO da `(type, bookingRequestId)` rende
// l'inserimento idempotente senza leggere prima (un retry collide sulla PK invece di creare
// un duplicato) e dà alla card un'identità stabile tra due letture.
//
// Percorribile perché nessuna route/action dell'app gira su edge runtime: il verdetto
// (a) di §11.2, con i comandi e l'esito, è registrato in `index.ts`. Se un domani una
// route passasse a `runtime = 'edge'`, `node:crypto` non sarebbe più disponibile lì e
// scatterebbe il ripiego di §5.2 (insert non deterministico + deduplica a lettura su
// `(subject_type, subject_id, type)`, riga più vecchia): quel ripiego NON è attivo oggi.
import { createHash } from 'node:crypto'
import { PREARRIVAL_TASK_TYPES, type PrearrivalTaskType } from './vocabulary'

/**
 * Namespace UUID del modulo (costante di contratto: cambiarlo cambia TUTTI gli id ancora
 * già scritti, quindi è immutabile una volta che esistono righe in produzione).
 */
export const PREARRIVAL_UUID_NAMESPACE = '6f9b1d2a-5c3e-4a7b-9f10-8e2c4d6b1a30'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function uuidToBytes(uuid: string): Uint8Array {
  if (!UUID_RE.test(uuid)) throw new Error('uuidToBytes: UUID non valido')
  const hex = uuid.replace(/-/g, '')
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * UUID v5 (RFC 4122, §4.3): SHA-1 di `namespace || name`, primi 16 byte, con i bit di
 * versione (5) e variante (RFC 4122) forzati. Puro e deterministico.
 * `node:crypto` espone solo `randomUUID` (v4), quindi il v5 si costruisce da `createHash`.
 */
export function uuidv5(name: string, namespace: string): string {
  const digest = createHash('sha1').update(uuidToBytes(namespace)).update(name, 'utf8').digest()
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) bytes[i] = digest[i]
  bytes[6] = (bytes[6] & 0x0f) | 0x50 // versione 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variante RFC 4122
  return bytesToUuid(bytes)
}

/**
 * Id ancora della task pre-arrivo di una prenotazione. Puro, deterministico, stabile:
 * stessa coppia `(type, bookingRequestId)` ⇒ stesso UUID, sempre e ovunque.
 * `type` entra nel nome perché una stessa prenotazione può avere entrambe le task.
 *
 * Da sapere prima di usarla per inserire: essendo questo valore la PK, l'unicità vale PER
 * SEMPRE, non "finché la task è aperta" — una task risolta non può essere ricreata per la
 * stessa coppia. È la semantica voluta per il pre-arrivo (non si ri-sollecita l'ospite), ma è
 * più stretta di quella in uso altrove nel repo, dove l'idempotenza è solo sulle `open`.
 * Perciò l'insert deve dichiarare `ON CONFLICT DO NOTHING` invece di subire un 409 al retry.
 * Motivazione estesa e riscontri: «PREZZO DELLA SCELTA» nel verdetto (a) di `index.ts`.
 */
export function prearrivalAnchorId(type: PrearrivalTaskType, bookingRequestId: string): string {
  const id = bookingRequestId.trim()
  if (!id) throw new Error('prearrivalAnchorId: bookingRequestId mancante')
  return uuidv5(`${type}:${id}`, PREARRIVAL_UUID_NAMESPACE)
}

/** Gli id ancora di una prenotazione, uno per `type`. Comodo per letture e deduplica. */
export function prearrivalAnchorIds(bookingRequestId: string): Record<PrearrivalTaskType, string> {
  return {
    [PREARRIVAL_TASK_TYPES.infoMissing]: prearrivalAnchorId(PREARRIVAL_TASK_TYPES.infoMissing, bookingRequestId),
    [PREARRIVAL_TASK_TYPES.etaMissing]: prearrivalAnchorId(PREARRIVAL_TASK_TYPES.etaMissing, bookingRequestId),
  }
}
