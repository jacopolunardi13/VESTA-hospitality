-- ============================================================================
-- MIGRAZIONE 0014: operational_tasks — Operational Queue + scadenza pagamento 24h
-- ============================================================================
-- Prerequisiti: 0008 (RPC transizioni: awaiting_payment→cancelled valido;
--   hold_expires_at = now()+hold_hours sul passaggio availability_blocked),
--   0012 (pending_actions, che NON tocchiamo). Idempotente.
--
-- DECISIONE ARCHITETTURALE (28/06/2026): `booking.payment_window_expired` NON è un nuovo `kind`
-- di `pending_actions`. `pending_actions` resta dedicata agli INVII Tier-2 in
-- attesa di approvazione (send_proposal/send_confirmation). Introduciamo invece
-- il concetto portante dell'OS hospitality: la TASK OPERATIVA — qualcosa che lo
-- staff deve fare/decidere. `booking.payment_window_expired` è il PRIMO type.
-- `type` descrive sempre il FATTO DI BUSINESS generativo (mai l'azione, mai lo
-- status della booking). Regola di naming `area.<fatto>`; seguiranno p.es.
-- booking.documents_missing, finance.invoice_received, revenue.price_suggested.
--
-- Minimum Durable Architecture (envelope provato campo-per-campo):
--   id, org_id, property_id, type, status, subject_type, subject_id,
--   resolution, details(jsonb), created_at.
--   - soggetto POLIMORFICO senza FK (la tabella del soggetto cambia per type).
--   - `type` e `resolution` = vocabolario APPLICATIVO (no check SQL) ⇒ nuovo
--     type = zero migrazioni. Solo `status` ha un check (ciclo di vita stabile).
--   - dati type-specific ⇒ `details` jsonb; nuovi campi solo quando un 2° caso
--     reale li giustifica.
--   - NESSUNA duplicazione di stato: la scadenza pagamento resta in
--     booking_requests.hold_expires_at (niente due_at sulla task).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tabella operational_tasks — Operational Queue (coda unica del lavoro operativo)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.operational_tasks (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id),
  property_id   uuid not null references public.properties(id),
  type          text not null,                                  -- vocab applicativo: 'booking.payment_window_expired', ...
  status        text not null default 'open'
                  check (status in ('open','resolved','cancelled')),
  subject_type  text,                                           -- 'booking_request' | 'document' | ... (polimorfico, no FK)
  subject_id    uuid,
  resolution    text,                                           -- vocab applicativo: 'paid' | 'not_paid' | NULL se open (etichette nel Task Catalog)
  details       jsonb not null default '{}'::jsonb,             -- escape hatch dati type-specific
  created_at    timestamptz not null default now()
);

-- Inbox per-struttura (task aperte da lavorare)
CREATE INDEX IF NOT EXISTS idx_operational_tasks_inbox
  ON public.operational_tasks (property_id, status);

-- Lookup/idempotenza per soggetto (detector: "esiste già una task open per questo soggetto?")
CREATE INDEX IF NOT EXISTS idx_operational_tasks_subject
  ON public.operational_tasks (subject_type, subject_id, type)
  WHERE status = 'open';

ALTER TABLE public.operational_tasks ENABLE ROW LEVEL SECURITY;
DO $rls$ BEGIN
  CREATE POLICY tenant_access_operational_tasks ON public.operational_tasks
    FOR ALL USING (public.user_in_org(org_id)) WITH CHECK (public.user_in_org(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $rls$;

COMMENT ON TABLE public.operational_tasks IS
  'Operational Queue: coda UNICA di tutto il lavoro operativo di Vesta (auto-generato dai detector e, in futuro, creato manualmente dallo staff). Inbox/dashboard/agenda sono VISTE che la leggono. type = FATTO di business (es. booking.payment_window_expired); il Task Catalog (app) lo traduce in titolo/descrizione/azioni. Distinta da pending_actions (invii Tier-2). type/resolution = vocab applicativo.';

-- ----------------------------------------------------------------------------
-- 2) Rilevatore specializzato: scadenza pagamento 24h → task 'booking.payment_window_expired'.
--    Riusa booking_requests.hold_expires_at come scadenza (unica fonte di verità).
--    Idempotente: salta i booking con una task 'booking.payment_window_expired' già 'open'.
--    NON invia email: crea SOLO la task interna (+ notifica staff per visibilità).
--    Ritorna il numero di task create in questa esecuzione.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_payment_expiry()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_req   booking_requests%ROWTYPE;
  v_count integer := 0;
BEGIN
  FOR v_req IN
    SELECT br.*
    FROM booking_requests br
    WHERE br.status = 'awaiting_payment'
      AND br.deleted_at IS NULL
      AND br.hold_expires_at IS NOT NULL
      AND br.hold_expires_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM operational_tasks ot
        WHERE ot.subject_type = 'booking_request'
          AND ot.subject_id   = br.id
          AND ot.type         = 'booking.payment_window_expired'
          AND ot.status       = 'open'
      )
  LOOP
    INSERT INTO operational_tasks (
      org_id, property_id, type, status, subject_type, subject_id
    ) VALUES (
      v_req.org_id, v_req.property_id, 'booking.payment_window_expired', 'open',
      'booking_request', v_req.id
    );

    INSERT INTO notifications (
      org_id, property_id, type, title, body, booking_request_id, conversation_id
    ) VALUES (
      v_req.org_id, v_req.property_id, 'escalation',
      'Verifica pagamento (24h scadute)',
      'Sono trascorse 24h dalla riserva. Verifica se il pagamento è arrivato, '
        || 'poi conferma la prenotazione oppure libera la camera.',
      v_req.id, v_req.conversation_id
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.process_payment_expiry FROM public;
GRANT EXECUTE ON FUNCTION public.process_payment_expiry TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_payment_expiry TO service_role;

-- ----------------------------------------------------------------------------
-- 3) Dispatcher "motore delle scadenze operative" (seam, NON astrazione).
--    Punto d'ingresso unico del cron; oggi instrada al solo rilevatore pagamento.
--    Ogni scadenza futura (documenti, check-in, ...) = una funzioncina
--    specializzata agganciata qui con UNA riga. Ritorna il totale di task create.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_operational_deadlines()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $disp$
DECLARE
  v_total integer := 0;
BEGIN
  v_total := v_total + public.process_payment_expiry();
  -- futuro: v_total := v_total + public.process_document_expiry();
  -- futuro: v_total := v_total + public.process_checkin_due();
  RETURN v_total;
END;
$disp$;

REVOKE ALL ON FUNCTION public.process_operational_deadlines FROM public;
GRANT EXECUTE ON FUNCTION public.process_operational_deadlines TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_operational_deadlines TO service_role;

-- ----------------------------------------------------------------------------
-- 4) Cron: aggancio il dispatcher al job esistente `vesta-followups` (ogni 5').
--    Sicuro pre-go-live: agisce solo su awaiting_payment scaduti e crea SOLO
--    task interne (nessuna email al cliente). NON tocca `vesta-email-poll`.
-- ----------------------------------------------------------------------------
DO $cronblk$
BEGIN
  PERFORM cron.unschedule('vesta-followups')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vesta-followups');
END
$cronblk$;

SELECT cron.schedule(
  'vesta-followups',
  '*/5 * * * *',
  $cron$ SELECT public.process_due_followups(); SELECT public.process_operational_deadlines(); $cron$
);

-- ============================================================================
-- VERIFICA OGGETTIVA (dopo l'apply):
--   -- (a) tabella creata:
--   SELECT to_regclass('public.operational_tasks');                       -- non NULL
--   -- (b) funzioni esistenti:
--   SELECT to_regprocedure('public.process_payment_expiry()');            -- non NULL
--   SELECT to_regprocedure('public.process_operational_deadlines()');     -- non NULL
--   -- (c) dry-run (nessun awaiting_payment scaduto ⇒ 0):
--   SELECT public.process_operational_deadlines();
--   -- (d) cron aggiornato (command cita process_operational_deadlines):
--   SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'vesta-followups';
-- ============================================================================
