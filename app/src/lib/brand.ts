// Branding a DUE livelli (multi-property SaaS).
//
//  • PLATFORM (Vesta Hospitality) — è il software. Identità UNICA, usata dove vede il
//    GESTORE: dashboard, login, favicon/app icon, metadata. Vedi `platformBrand`.
//  • PROPERTY (LunArt, Bella Vigna, …) — sono i CLIENTI della piattaforma. Ogni struttura
//    ha la propria identità, usata nelle COMUNICAZIONI verso gli OSPITI (email, futuro).
//    Vedi `getPropertyBrand`. Le email potranno avere un footer discreto "Powered by Vesta".
//
// Gli asset Vesta sono file statici in /public/brand/vesta: per sostituirli con gli SVG
// definitivi basta rimpiazzare i file (stesso nome/percorso) — nessuna modifica al codice.
// Le icone app si rigenerano da mark.svg con `node scripts/gen-brand-icons.mjs`.

export const platformBrand = {
  name: 'Vesta Hospitality',
  shortName: 'Vesta',
  tagline: 'Direct Booking Assistant',
  logo: '/brand/vesta/logo.svg', // wordmark orizzontale (chrome chiaro)
  mark: '/brand/vesta/mark.svg', // simbolo quadrato (icone)
} as const

export interface PropertyBrand {
  /** Nome mostrato all'ospite (default: nome struttura). */
  name: string
  /** URL pubblico del logo struttura per le comunicazioni (null = solo testo). */
  logo: string | null
  /** Colore primario della struttura (hex), opzionale. */
  primaryColor: string | null
}

/**
 * Risolve il branding della STRUTTURA per le comunicazioni verso gli ospiti.
 * Fonte: `properties.settings.brand = { name?, logo?, primaryColor? }` (in produzione il
 * logo è un URL pubblico — es. Supabase Storage — così ogni tenant carica il proprio senza
 * deploy). Fallback dev/pilota: file committato in /public/brand/properties/<slug>/.
 * Non ancora cablato in UI/email: predisposizione per lo step email (branding per-property).
 */
export function getPropertyBrand(property: {
  name: string
  settings?: Record<string, unknown> | null
}): PropertyBrand {
  const b = (property.settings?.brand ?? {}) as { name?: string; logo?: string; primaryColor?: string }
  return {
    name: typeof b.name === 'string' && b.name ? b.name : property.name,
    logo: typeof b.logo === 'string' && b.logo ? b.logo : null,
    primaryColor: typeof b.primaryColor === 'string' && b.primaryColor ? b.primaryColor : null,
  }
}
