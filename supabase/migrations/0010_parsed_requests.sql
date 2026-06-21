-- ============================================================================
-- MIGRAZIONE 0010: parsed_requests (conservazione richieste multi-camera/multi-periodo)
-- ============================================================================
-- Prerequisito : 0001..0009.
-- Cosa fa: aggiunge booking_requests.parsed_requests (jsonb) per salvare TUTTE le
--   richieste rilevate in un messaggio (più periodi/camere) senza perdere informazioni.
--   I campi piatti (check_in/out/adults/children) restano = prima richiesta.
--   Struttura per elemento: { i, room_type, check_in, check_out, adults, children[] }.
--   Additiva e idempotente: nessun impatto sul flusso esistente (un solo lead per conversazione).
-- ============================================================================

ALTER TABLE public.booking_requests
  ADD COLUMN IF NOT EXISTS parsed_requests jsonb;

COMMENT ON COLUMN public.booking_requests.parsed_requests IS
  'Tutte le richieste rilevate nel messaggio (multi-camera/multi-periodo). Array di {i, room_type, check_in, check_out, adults, children[]}. NULL/assente = richiesta singola (vedi campi piatti).';

-- ============================================================================
-- FINE MIGRAZIONE 0010
-- ============================================================================
