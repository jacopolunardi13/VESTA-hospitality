// Flag del canale email (per-property, in properties.settings JSON). Reversibili istantaneamente.
type Settings = Record<string, unknown> | null | undefined

/**
 * Kill-switch auto-invio email. Default OFF: Vesta NON invia finché non è abilitato
 * esplicitamente in Impostazioni. Override globale d'emergenza: env EMAIL_AUTOSEND=off.
 * Quando OFF, Vesta ingerisce e calcola la risposta (visibile in dashboard) ma non la invia.
 */
export function emailAutosendEnabled(settings: Settings): boolean {
  if ((process.env.EMAIL_AUTOSEND ?? '').toLowerCase() === 'off') return false
  return (settings as Record<string, unknown> | null)?.['email_autosend_enabled'] === true
}

/** Marca lette le email processate. Default false nel pilot (Diego vede tutto). */
export function emailMarkRead(settings: Settings): boolean {
  return (settings as Record<string, unknown> | null)?.['email_mark_read'] === true
}
