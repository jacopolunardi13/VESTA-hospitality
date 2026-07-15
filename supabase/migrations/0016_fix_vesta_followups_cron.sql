-- ============================================================================
-- MIGRAZIONE 0016: rende resiliente il cron `vesta-followups` (fix KI-11)
-- ============================================================================
-- Prerequisito : 0014 applicata (job `vesta-followups` + `process_operational_deadlines`).
--   NB numerazione: 0015 = P0-2 (branch `security/p0-2-rpc-hardening`), già applicata al DB;
--   questa 0016 è indipendente da 0015 (tocca solo il cron + le funzioni di 0014).
-- Contesto (KI-11): il job `vesta-followups` era schedulato (0014) con command
--   `SELECT process_due_followups(); SELECT process_operational_deadlines();`.
--   Ma `process_due_followups()` NON esiste nel DB reale (0006 non applicata) → la 1ª
--   istruzione fallisce (42883) e ABORTA la transazione del job → il detector scadenza-24h
--   (`process_operational_deadlines`) NON viene mai eseguito via cron → Operational Queue
--   non auto-popolata (evidenza: l'unica task scaduta è stata creata da un E2E manuale, non dal cron).
-- Cosa fa: ri-schedula `vesta-followups` con un command **existence-guarded** che:
--   • esegue `process_due_followups()` SOLO se la funzione esiste (to_regprocedure);
--   • esegue SEMPRE `process_operational_deadlines()`;
--   • NON fallisce se `process_due_followups()` manca né se lancia (catturato come warning, best-effort).
-- NON cambia : logica dei detector, dati, funzioni. Solo la definizione del job cron.
-- Idempotente: rieseguibile (unschedule-if-exists + cron.schedule sovrascrive per nome).
-- Owner      : applicare nel SQL Editor (cambio cron = azione manuale del titolare).
-- ============================================================================

-- 1) Unschedule sicuro (solo se il job esiste). Idempotente.
DO $cronblk$
BEGIN
  PERFORM cron.unschedule('vesta-followups')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vesta-followups');
EXCEPTION WHEN undefined_table THEN NULL; -- pg_cron non installato: no-op
END
$cronblk$;

-- 2) Reschedule con command existence-guarded (ogni 5 minuti, come 0014).
--    $cron$ delimita il command; $guard$ delimita il blocco DO interno (nessun conflitto).
SELECT cron.schedule(
  'vesta-followups',
  '*/5 * * * *',
  $cron$
    DO $guard$
    BEGIN
      -- follow-up email: opzionale e BEST-EFFORT. Eseguito SOLO se la funzione esiste;
      -- se esiste e LANCIA, l'errore è catturato in un sotto-blocco (sub-transaction:
      -- il fallito viene rollbackato fino al savepoint) e NON blocca il detector.
      IF to_regprocedure('public.process_due_followups()') IS NOT NULL THEN
        BEGIN
          PERFORM public.process_due_followups();
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'vesta-followups: process_due_followups() ha lanciato, ignorato: %', SQLERRM;
        END;
      END IF;
      -- detector scadenza-pagamento 24h: SEMPRE raggiunto ed eseguito (fuori dal sotto-blocco).
      PERFORM public.process_operational_deadlines();
    END
    $guard$;
  $cron$
);

-- ============================================================================
-- VERIFICA OGGETTIVA (dopo l'apply — read-only tranne (d), che è idempotente):
--   -- (a) job esiste, è attivo, e il command cita il guard + process_operational_deadlines:
--   SELECT jobname, schedule, active, command FROM cron.job WHERE jobname = 'vesta-followups';
--   -- (b) funzioni: detector presente, followups (atteso) assente:
--   SELECT to_regprocedure('public.process_operational_deadlines()');   -- non NULL
--   SELECT to_regprocedure('public.process_payment_expiry()');          -- non NULL
--   SELECT to_regprocedure('public.process_due_followups()');           -- NULL atteso (guard lo salta)
--   -- (c) run recenti: dopo l'apply NON devono più esserci 'failed' su process_due_followups:
--   SELECT status, left(return_message,150) AS msg, start_time
--     FROM cron.job_run_details
--     WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'vesta-followups')
--     ORDER BY start_time DESC LIMIT 8;                                  -- attesi 'succeeded'
--   -- (d) opzionale — test manuale SICURO e idempotente del detector (crea task SOLO per
--   --     awaiting_payment realmente scaduti; ri-eseguibile senza duplicare):
--   SELECT public.process_operational_deadlines();                       -- ritorna il n. di task create
-- ============================================================================
-- FINE MIGRAZIONE 0016
-- ============================================================================
