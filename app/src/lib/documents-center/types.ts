// Document Center — contratti del modulo. Primo "mattone" del futuro BACK OFFICE ASSISTANT di
// Vesta (roadmap: F1 archivio → F2 documenti amministrativi italiani → F3 scadenze → F4 controllo
// amministrativo → F5 riconciliazione economica Booking/Airbnb/QuoVai). L'estensibilità vive QUI:
// un nuovo fornitore/categoria = un nuovo Recognizer registrato, MAI una modifica a poll/ingest.
import type { InboundEmail, EmailAttachmentRef } from '@/lib/email/gmail'
import type { RouteResult } from '@/lib/email/routing'

// Categorie e stati = constraint della tabella document_center (migrazione 0013, già generale).
export type DocCategory =
  | 'invoice' | 'contract' | 'insurance' | 'utility' | 'tax' | 'pec' | 'employee' | 'certificate' | 'other'
export type DocStatus =
  | 'received' | 'analyzed' | 'to_verify' | 'ready_for_accountant' | 'sent_to_accountant' | 'archived'

/** Descrizione del documento da archiviare per un allegato. Nell'MVP è DETERMINISTICA (niente AI):
 *  ogni recognizer ritorna valori fissi. I campi estratti (docNumber/docDate/amount/vat) sono già
 *  previsti qui ma restano null finché non arriva il parser/AI (Fase 2+) — lo schema li accoglie. */
export interface RecognizedDocument {
  source: string            // origine/canale, es. 'booking'
  supplier: string          // fornitore riconosciuto, es. 'Booking.com'
  category: DocCategory
  status: DocStatus         // stato/workflow iniziale, deciso dal recognizer (per-fornitore)
  heading: string
  // Campi estratti — Fase 2+ (parser/AI). MVP: tutti null.
  docDate?: string | null
  docNumber?: string | null
  amountCents?: number | null
  currency?: string | null
  hasVat?: boolean | null
  vatNumber?: string | null
}

/**
 * Recognizer = "scheda fornitore" della Supplier Knowledge (libreria a 2 livelli):
 *  - library 'vesta'  → fornitori comuni noti al sistema (Booking, Amazon, Stripe, …)
 *  - library 'client' → fornitori aggiunti dalla singola struttura (lavanderia, manutenzione, …)
 * Contratto minimo e stabile: matching deterministico + descrizione del documento. Le fasi future
 * (estrazione campi, classificazione, scadenze, riconciliazione) si appoggeranno su questo seam
 * senza romperne la firma. MVP: esiste solo il recognizer Booking.
 */
export interface DocumentRecognizer {
  id: string                          // identificatore stabile, anche cartella storage: <property>/<id>/...
  library: 'vesta' | 'client'
  /** L'email è di competenza di questo recognizer? Deterministico, niente AI. */
  matches(email: InboundEmail, route: RouteResult): boolean
  /** Quali allegati archiviare (default in ingest: tutti i PDF). Override per casi specifici. */
  acceptsAttachment?(att: EmailAttachmentRef): boolean
  /** Metadati del documento da creare per l'allegato dato. */
  describe(email: InboundEmail, att: EmailAttachmentRef): RecognizedDocument
}
