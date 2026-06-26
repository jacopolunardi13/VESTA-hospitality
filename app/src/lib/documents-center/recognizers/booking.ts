// Recognizer Booking.com — libreria Vesta. Caso PRIORITARIO del Back Office Assistant: la fattura
// estera Booking (emessa in NL, P.IVA non italiana) NON transita dal cassetto fiscale italiano →
// va riconosciuta come documento da inviare al commercialista. Match deterministico sul Router L0
// (source='booking'); nessuna estrazione/AI nell'MVP (lo stato è fisso).
import type { DocumentRecognizer } from '../types'

export const bookingRecognizer: DocumentRecognizer = {
  id: 'booking',
  library: 'vesta',
  matches: (_email, route) => route.category === 'ota_pms' && route.source === 'booking',
  describe: (email, att) => ({
    source: 'booking',
    supplier: 'Booking.com',
    category: 'invoice',
    status: 'ready_for_accountant', // estera → priorità commercialista
    heading: email.subject || att.filename,
  }),
}
