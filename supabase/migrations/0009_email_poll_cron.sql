-- ============================================================================
-- MIGRAZIONE 0009: Polling email automatico (pg_cron + pg_net)
-- ============================================================================
-- Prerequisito : 0001..0008; app deployata su URL PUBBLICO; CRON_SECRET allineato
--   tra Vercel (env) e l'header Authorization qui sotto.
-- Cosa fa: schedula la chiamata a /api/email/poll ogni 2 minuti. L'app legge la
--   casella Gmail, ingerisce le nuove email (conversation/lead + risposta in-thread).
--   La logica vive nell'app; pg_cron è solo il trigger temporale.
--
-- ⚠️ NON funziona contro localhost: pg_cron gira nel cloud Supabase e deve
--    raggiungere un URL PUBBLICO. Applicare DOPO il deploy.
-- ⚠️ Sostituire <APP_URL> e <CRON_SECRET> con i valori reali AL MOMENTO
--    dell'esecuzione nel SQL Editor. NON committare il secret reale.
--    (In alternativa più sicura: leggere il secret da Supabase Vault.)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Rimuove un'eventuale schedulazione precedente con lo stesso nome (idempotente).
DO $$ BEGIN
  PERFORM cron.unschedule('vesta-email-poll')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vesta-email-poll');
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Frequenza pilot: ogni 2 minuti.
SELECT cron.schedule(
  'vesta-email-poll',
  '*/2 * * * *',
  $job$
    SELECT net.http_post(
      url     := '<APP_URL>/api/email/poll',
      headers := jsonb_build_object(
        'authorization', 'Bearer <CRON_SECRET>',
        'content-type',  'application/json'
      )
    );
  $job$
);

-- Verifica:  SELECT jobname, schedule, active FROM cron.job WHERE jobname='vesta-email-poll';
-- Storico:   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
-- ============================================================================
-- FINE MIGRAZIONE 0009
-- ============================================================================
