// Fail-fast per le scritture/letture Supabase. supabase-js NON lancia sugli errori: li restituisce
// in `{ error }`. Ignorarlo = "successo silenzioso" (tabella mancante, RLS, vincolo) → guasti
// nascosti (vedi incidente 27/06: dedup no-op per email_routing_log assente). Usare questo helper
// rende ogni guasto DB RUMOROSO: chi chiama lo cattura (try/catch) e lo logga, invece di ingoiarlo.
import type { PostgrestError } from '@supabase/supabase-js'

/** Lancia un Error descrittivo se la risposta Supabase contiene un errore. */
export function dbThrow(error: PostgrestError | null, ctx: string): void {
  if (error) throw new Error(`[db:${ctx}] ${error.code ? error.code + ' ' : ''}${error.message}`)
}
