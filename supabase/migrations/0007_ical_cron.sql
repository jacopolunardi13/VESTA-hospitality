-- ============================================================================
-- MIGRAZIONE 0007: Scheduler automatico sync iCal (cloud, pg_cron + pg_net)
-- ============================================================================
-- Prerequisito : 0001..0006 applicate; app deployata su URL PUBBLICO.
-- Cosa fa: schedula la chiamata a /api/cron/ical-sync ogni 15 minuti.
--   La logica di fetch+parse vive nell'app (l'iCal va scaricato e interpretato),
--   quindi pg_cron richiama l'endpoint via pg_net.http_post.
--
-- ⚠️ NON funziona contro localhost: pg_cron gira nel cloud Supabase e deve poter
--    raggiungere un URL PUBBLICO. Da applicare DOPO il deploy.
-- ⚠️ Sostituire <APP_URL> e <CRON_SECRET> con i valori reali AL MOMENTO
--    dell'esecuzione nel SQL Editor. NON committare il secret reale.
--    (In alternativa più sicura: leggere il secret da Supabase Vault.)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Rimuove un'eventuale schedulazione precedente con lo stesso nome (idempotente).
DO $$ BEGIN
  PERFORM cron.unschedule('vesta-ical-sync')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vesta-ical-sync');
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Frequenza consigliata pilot LunArt: ogni 15 minuti.
-- (La finestra di freschezza è 24h: anche ogni ora sarebbe sicuro; 15' dà
--  buona freschezza con carico trascurabile.)
SELECT cron.schedule(
  'vesta-ical-sync',
  '*/15 * * * *',
  $job$
    SELECT net.http_post(
      url     := '<APP_URL>/api/cron/ical-sync',
      headers := jsonb_build_object(
        'authorization', 'Bearer <CRON_SECRET>',
        'content-type',  'application/json'
      )
    );
  $job$
);

-- Verifica: SELECT jobname, schedule, active FROM cron.job WHERE jobname='vesta-ical-sync';
-- Storico esecuzioni: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
-- ============================================================================
-- FINE MIGRAZIONE 0007
-- ============================================================================
