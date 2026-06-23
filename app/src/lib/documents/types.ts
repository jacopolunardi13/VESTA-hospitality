// Motore documenti Vesta — modello dati per preventivo/conferma, generato dai dati già
// presenti nel preventivo (lead + items), senza inserimenti manuali. Brandizzato per-property.

export type DocumentType = 'preventivo' | 'conferma'

/** Identità + dati legali/fiscali della struttura per i documenti (per-property). */
export interface PropertyDocConfig {
  brandName: string        // es. "LunArt B&B"
  locality: string         // es. "Firenze · Italia"
  signerName: string       // es. "Jacopo Lunardi"
  // Footer legale/fiscale
  legalName: string        // es. "Lunardi Jacopo · Impresa individuale"
  vat: string              // es. "P. IVA 07267560485"
  taxCode: string          // es. "C.F. LNRJCP89H02D612Y"
  rea: string              // es. "REA FI-692571"
  legalAddress: string     // sede legale
  propertyAddress: string  // indirizzo struttura
  pec: string
  email: string
  phone: string
  // Condizioni / parametri
  validityDays: number          // validità preventivo (giorni)
  cityTaxPerAdultNightCents: number // tassa di soggiorno (cent, a persona/notte)
  checkInFrom: string           // es. "15:00"
  checkOutBy: string            // es. "11:00"
  logoPath?: string             // logo struttura (file in /public), opzionale
}

export interface DocLine {
  description: string  // es. "Pernottamento – Camera 302 (Deluxe)"
  details: string      // es. "Colazione inclusa · 2 notti"
  amountCents: number
}

/** Tutto ciò che serve a renderizzare un documento (calcolato da buildModel). */
export interface DocumentModel {
  type: DocumentType
  title: string                 // "PREVENTIVO" | "CONFERMA DI PRENOTAZIONE"
  config: PropertyDocConfig
  issuePlaceDate: string        // "Firenze, 23 giugno 2026"
  reference: string             // "Valido fino al …" | "Rif. prenotazione …"
  guestName: string
  guestsLabel: string           // "2 adulti" (+ bambini)
  checkInLabel: string
  checkOutLabel: string
  nights: number
  guestsCount: number
  lines: DocLine[]
  totalCents: number
  cityTaxNote: string
  conditions: string[]
  // Solo conferma
  depositCents?: number
  balanceCents?: number
}
