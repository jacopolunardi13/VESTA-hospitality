// Configurazione documenti per-property. Fonte primaria: properties.settings.documents
// (multi-tenant, modificabile senza deploy). Fallback: registro built-in per le property
// pilota. I valori LunArt provengono dai modelli ufficiali forniti dalla struttura.
import type { PropertyContext } from '@/lib/ai/types'
import type { PropertyDocConfig } from './types'

const LUNART_ID = '00000000-0000-0000-0000-000000000011'

export const LUNART_DOC_CONFIG: PropertyDocConfig = {
  brandName: 'LunArt B&B',
  locality: 'Firenze · Italia',
  signerName: 'Jacopo Lunardi',
  legalName: 'Lunardi Jacopo · Impresa individuale',
  vat: 'P. IVA 07267560485',
  taxCode: 'C.F. LNRJCP89H02D612Y',
  rea: 'REA FI-692571',
  legalAddress: "Sede legale: Piazza dell'Olio 1, 50123 Firenze (FI)",
  propertyAddress: 'Struttura: Vicolo del Canneto 2, 50125 Firenze (FI)',
  pec: 'PEC lunardijacopo@pec.it',
  email: 'lunartfirenze@gmail.com',
  phone: '+39 392 472 5263',
  validityDays: 7,
  cityTaxPerAdultNightCents: 600,
  checkInFrom: '15:00',
  checkOutBy: '11:00',
  logoPath: undefined, // logo struttura: da inserire (per-property), per ora solo testo
}

const REGISTRY: Record<string, PropertyDocConfig> = {
  [LUNART_ID]: LUNART_DOC_CONFIG,
}

/** Risolve la configurazione documenti: settings.documents (se completa) → registro → errore. */
export function getDocumentConfig(property: Pick<PropertyContext, 'id' | 'settings'>): PropertyDocConfig {
  const fromSettings = (property.settings?.documents ?? null) as Partial<PropertyDocConfig> | null
  if (fromSettings && typeof fromSettings.vat === 'string' && typeof fromSettings.brandName === 'string') {
    // settings completa → merge sul default della property (riempie eventuali campi mancanti)
    const base = REGISTRY[property.id]
    return base ? { ...base, ...fromSettings } as PropertyDocConfig : (fromSettings as PropertyDocConfig)
  }
  const def = REGISTRY[property.id]
  if (def) return def
  throw new Error(`Config documenti non impostata per la property ${property.id} (imposta settings.documents).`)
}
