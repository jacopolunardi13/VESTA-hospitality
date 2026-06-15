-- ============================================================================
-- MIGRAZIONE 0006: Follow-up automatici (cloud-native, pg_cron)
-- ============================================================================
-- Prerequisito : 0001..0005 applicate.
-- Architettura : la LOGICA vive in process_due_followups() (funzione richiamabile,
--   scheduler-agnostica); pg_cron è solo il trigger temporale → sostituibile.
-- Flusso       : transizione → proposal_sent materializza i followup_jobs (trigger);
--   il cron (ogni 5') esegue process_due_followups() che applica le regole di stop,
--   le quiet hours, il cap, e "invia" il follow-up (messaggio in conversazione +
--   notifica staff). Reach all'ospite via canale (email/WhatsApp) = estensione futura.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ----------------------------------------------------------------------------
-- 1. Template + regole follow-up di default (pilot). In produzione: provisioning
--    per-org all'onboarding (followup_rules.org_id è NOT NULL).
-- ----------------------------------------------------------------------------
INSERT INTO public.templates (org_id, property_id, code, channel, language, ota_safe, body)
SELECT NULL, NULL, 'reminder_offerta', 'web', lang, false, body
FROM (VALUES
  ('it', 'Gentile {{guest_name}}, le ricordiamo la nostra proposta diretta per il suo soggiorno: è ancora disponibile e saremo lieti di riservargliela. Desidera procedere? Restiamo a disposizione.'),
  ('en', 'Dear {{guest_name}}, a quick reminder about our direct offer for your stay: it is still available and we would be glad to hold it for you. Would you like to proceed?')
) AS v(lang, body)
WHERE NOT EXISTS (
  SELECT 1 FROM public.templates t
  WHERE t.code = 'reminder_offerta' AND t.channel = 'web' AND t.language = v.lang AND t.org_id IS NULL
);

-- Regole per la property demo (3 cadenze: 1h, 24h, 72h dopo proposal_sent).
INSERT INTO public.followup_rules (org_id, property_id, trigger_status, delay_minutes, template_code, conditions, active)
SELECT '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011',
       'proposal_sent', d, 'reminder_offerta', '{"only_if_no_reply": true}'::jsonb, true
FROM (VALUES (60), (1440), (4320)) AS v(d)
WHERE EXISTS (SELECT 1 FROM public.properties WHERE id = '00000000-0000-0000-0000-000000000011')
  AND NOT EXISTS (
    SELECT 1 FROM public.followup_rules fr
    WHERE fr.property_id = '00000000-0000-0000-0000-000000000011'
      AND fr.trigger_status = 'proposal_sent' AND fr.delay_minutes = v.d
  );

-- ----------------------------------------------------------------------------
-- 2. Materializzazione job alla transizione → proposal_sent (trigger atomico)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.materialize_followup_jobs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'proposal_sent' AND (OLD.status IS DISTINCT FROM 'proposal_sent') THEN
    INSERT INTO public.followup_jobs (org_id, property_id, booking_request_id, rule_id, due_at, status)
    SELECT fr.org_id, fr.property_id, NEW.id, fr.id,
           now() + (fr.delay_minutes || ' minutes')::interval, 'pending'
    FROM public.followup_rules fr
    WHERE fr.org_id = NEW.org_id
      AND fr.property_id = NEW.property_id
      AND fr.trigger_status = 'proposal_sent'
      AND fr.active = true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_materialize_followups ON public.booking_requests;
CREATE TRIGGER trg_materialize_followups
  AFTER UPDATE ON public.booking_requests
  FOR EACH ROW EXECUTE FUNCTION public.materialize_followup_jobs();

-- ----------------------------------------------------------------------------
-- 3. Processore follow-up (logica scheduler-agnostica)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_due_followups()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j           record;
  v_count     int := 0;
  v_status    text;
  v_prop_at   timestamptz;
  v_conv      uuid;
  v_guest     text;
  v_lang      text;
  v_replied   boolean;
  v_done_cnt  int;
  v_tz        text;
  v_local     timestamp;
  v_hour      int;
  v_body      text;
BEGIN
  FOR j IN
    SELECT * FROM public.followup_jobs
    WHERE status = 'pending' AND due_at <= now()
    ORDER BY due_at LIMIT 200
  LOOP
    SELECT br.status, br.proposal_sent_at, br.conversation_id, br.guest_name, coalesce(br.language,'it')
      INTO v_status, v_prop_at, v_conv, v_guest, v_lang
      FROM public.booking_requests br WHERE br.id = j.booking_request_id;

    -- STOP: la richiesta non è più in proposal_sent (avanzata/chiusa/rifiutata)
    IF v_status IS DISTINCT FROM 'proposal_sent' THEN
      UPDATE public.followup_jobs SET status='cancelled', result='stato non più proposal_sent', executed_at=now(), updated_at=now() WHERE id=j.id;
      CONTINUE;
    END IF;

    -- STOP: l'ospite ha risposto dopo l'invio della proposta
    SELECT EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.conversation_id = v_conv AND m.direction='in'
        AND m.created_at > coalesce(v_prop_at, j.created_at)
    ) INTO v_replied;
    IF v_replied THEN
      UPDATE public.followup_jobs SET status='cancelled', result='ospite ha risposto', executed_at=now(), updated_at=now() WHERE id=j.id;
      CONTINUE;
    END IF;

    -- STOP: conversazione in gestione staff
    IF EXISTS (SELECT 1 FROM public.conversations c WHERE c.id=v_conv AND c.status='pending_staff') THEN
      UPDATE public.followup_jobs SET status='cancelled', result='in gestione staff', executed_at=now(), updated_at=now() WHERE id=j.id;
      CONTINUE;
    END IF;

    -- CAP: max 3 follow-up inviati per richiesta
    SELECT count(*) INTO v_done_cnt FROM public.followup_jobs WHERE booking_request_id=j.booking_request_id AND status='done';
    IF v_done_cnt >= 3 THEN
      UPDATE public.followup_jobs SET status='cancelled', result='cap follow-up raggiunto', executed_at=now(), updated_at=now() WHERE id=j.id;
      CONTINUE;
    END IF;

    -- CAP: max 1 follow-up al giorno → rinvia di 24h
    IF EXISTS (SELECT 1 FROM public.followup_jobs WHERE booking_request_id=j.booking_request_id AND status='done' AND executed_at > now()-interval '24 hours') THEN
      UPDATE public.followup_jobs SET due_at = now()+interval '24 hours', updated_at=now() WHERE id=j.id;
      CONTINUE;
    END IF;

    -- QUIET HOURS 22–08 (timezone property) → rinvia alle 08:00 locali
    SELECT coalesce(timezone,'Europe/Rome') INTO v_tz FROM public.properties WHERE id=j.property_id;
    v_local := now() AT TIME ZONE v_tz;
    v_hour := extract(hour FROM v_local)::int;
    IF v_hour >= 22 THEN
      UPDATE public.followup_jobs SET due_at = ((date_trunc('day', v_local) + interval '1 day' + interval '8 hours') AT TIME ZONE v_tz), updated_at=now() WHERE id=j.id;
      CONTINUE;
    ELSIF v_hour < 8 THEN
      UPDATE public.followup_jobs SET due_at = ((date_trunc('day', v_local) + interval '8 hours') AT TIME ZONE v_tz), updated_at=now() WHERE id=j.id;
      CONTINUE;
    END IF;

    -- Corpo del messaggio dal template (web, lingua richiesta) con fallback.
    SELECT t.body INTO v_body
      FROM public.templates t
      JOIN public.followup_rules fr ON fr.id = j.rule_id
      WHERE t.code = fr.template_code AND t.channel='web' AND t.active
        AND t.language = v_lang AND (t.org_id = j.org_id OR t.org_id IS NULL)
      ORDER BY t.org_id NULLS LAST LIMIT 1;
    v_body := coalesce(v_body, 'Le ricordiamo la nostra proposta diretta: è ancora disponibile. Desidera procedere?');
    v_body := replace(v_body, '{{guest_name}}', coalesce(v_guest, ''));

    -- "Invio" MVP: messaggio in conversazione (canale web) + notifica staff.
    INSERT INTO public.messages (org_id, property_id, conversation_id, direction, sender, content, metadata)
      VALUES (j.org_id, j.property_id, v_conv, 'out', 'ai', v_body, jsonb_build_object('followup', true, 'job_id', j.id));

    INSERT INTO public.notifications (org_id, property_id, type, title, body, booking_request_id, conversation_id)
      VALUES (j.org_id, j.property_id, 'followup_sent', 'Follow-up inviato',
              'Promemoria proposta inviato automaticamente all''ospite.', j.booking_request_id, v_conv);

    UPDATE public.followup_jobs SET status='done', result='follow-up inviato', executed_at=now(), updated_at=now() WHERE id=j.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.process_due_followups TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Schedulazione pg_cron (ogni 5 minuti). Idempotente per nome job.
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  PERFORM cron.unschedule('vesta-followups')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vesta-followups');
EXCEPTION WHEN undefined_table THEN NULL; END $$;

SELECT cron.schedule('vesta-followups', '*/5 * * * *', $$ SELECT public.process_due_followups(); $$);

-- ============================================================================
-- FINE MIGRAZIONE 0006
-- ============================================================================
