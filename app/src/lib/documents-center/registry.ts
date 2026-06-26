// Registro dei Recognizer = Supplier Knowledge. UNICO punto da estendere per aggiungere fornitori.
// MVP: solo Booking (libreria Vesta). Fase 2 (fornitori italiani: bollette/luce/gas/telefono/
// assicurazioni/contratti/PEC) = aggiungere qui i relativi recognizer (es. un generico
// italian-supplier + schede specifiche). Il poll/ingest non cambiano: consultano solo il registro.
import type { InboundEmail } from '@/lib/email/gmail'
import type { RouteResult } from '@/lib/email/routing'
import type { DocumentRecognizer } from './types'
import { bookingRecognizer } from './recognizers/booking'

export const RECOGNIZERS: DocumentRecognizer[] = [bookingRecognizer]

/** Primo recognizer che rivendica l'email, o null. Deterministico (l'ordine conta). */
export function recognizeEmail(email: InboundEmail, route: RouteResult): DocumentRecognizer | null {
  return RECOGNIZERS.find((r) => r.matches(email, route)) ?? null
}
