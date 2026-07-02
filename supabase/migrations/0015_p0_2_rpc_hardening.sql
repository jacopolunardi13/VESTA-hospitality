-- ============================================================================
-- MIGRAZIONE 0015: P0-2 — Hardening RPC SECURITY DEFINER (least-privilege + guard)
-- ============================================================================
-- Prerequisito : schema.sql + 0002, 0003, 0004, 0008, 0014 applicate.
-- Contesto     : Go-Live Security Assessment / ADR-0019. Le RPC SECURITY DEFINER
--                risultavano EXECUTE-abili da `anon` (grant ereditato da 0004:
--                GRANT ALL ON ALL ROUTINES + ALTER DEFAULT PRIVILEGES) e si fidavano
--                di parametri del chiamante → takeover tenant / write cross-tenant.
-- Cosa fa      : (A) toglie il default-grant su routine future ad anon/authenticated;
--                (B) enroll_user_in_org: self-enroll only, org vuota, ruolo whitelisted;
--                (C) transition_booking_request: guard di appartenenza org per authenticated;
--                (D) process_*: solo service_role — SOLO per le funzioni realmente presenti
--                    (existence-guarded via to_regprocedure → idempotente e adattiva).
-- ROBUSTEZZA   : verificato che lo stato reale del DB diverge dalla storia migrazioni
--                (la funzione public.process_due_followups() NON esiste: 0006 non applicata
--                su questo DB). Perciò (D) NON presuppone alcuna process_*: hardenizza solo
--                ciò che esiste. Vedi issue separata (fuori scope P0-2) in coda al file.
-- NON cambia   : logica dei flussi (staff=authenticated membro, pipeline=service_role,
--                onboarding=self su org vuota, cron=owner). Nessuna modifica al codice app.
--                Nessun dato modificato.
-- Ruoli        : auth.uid() dentro una SECURITY DEFINER legge il claim JWT, NON il ruolo
--                di esecuzione → il guard vale anche se la funzione gira come owner.
--                service_role = JWT senza `sub` → auth.uid() NULL → guard saltato (backend fidato).
-- Owner        : eseguire nel SQL Editor come `postgres` (stesso ruolo che eseguì 0004,
--                così l'ALTER DEFAULT PRIVILEGES in (A) annulla quello di 0004).
-- Idempotente  : rieseguibile senza errori (CREATE OR REPLACE + REVOKE/GRANT + guardie).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) CAUSA RADICE: le routine CREATE-ate d'ora in poi non si auto-concedono più
--     a anon/authenticated. Default-deny; ogni nuova funzione dovrà GRANTare esplicito.
--     (Non tocca i grant già presenti su user_in_org / search_knowledge, che restano.)
-- ----------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- (B) enroll_user_in_org — self-enroll only, solo org "vuota" (bootstrap onboarding),
--     ruolo ristretto alla whitelist. Corpo insert invariato (idempotente).
--     Presente nel DB reale (firma p_org_id,p_user_id,p_role) → CREATE OR REPLACE sostituisce.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enroll_user_in_org(
  p_org_id  uuid,
  p_user_id uuid,
  p_role    text DEFAULT 'owner'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  -- Guard 1 — ruolo whitelisted (nessun ruolo arbitrario).
  IF p_role NOT IN ('owner','manager','staff') THEN
    RAISE EXCEPTION 'enroll_user_in_org: invalid role %', p_role USING ERRCODE = '22023';
  END IF;

  -- Guard 2 — solo self-enroll: il chiamante può iscrivere SOLO se stesso.
  --   anon (auth.uid() NULL) è comunque revocato in coda; qui blocca anche il caso
  --   authenticated che tenti di iscrivere un altro user_id.
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'enroll_user_in_org: caller may only enroll itself' USING ERRCODE = '42501';
  END IF;

  -- Guard 3 — solo org SENZA altri membri (bootstrap della propria org appena creata).
  --   Impedisce di auto-aggiungersi a un tenant esistente (takeover).
  IF EXISTS (SELECT 1 FROM org_members WHERE org_id = p_org_id AND user_id <> p_user_id) THEN
    RAISE EXCEPTION 'enroll_user_in_org: organization already has members' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (p_org_id, p_user_id, p_role)
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET role = EXCLUDED.role, updated_at = now();
END $$;

REVOKE ALL   ON FUNCTION public.enroll_user_in_org(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.enroll_user_in_org(uuid, uuid, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (C) transition_booking_request — corpo 0008 invariato + guard di appartenenza.
--     authenticated: DEVE essere membro dell'org (blocca cross-tenant).
--     service_role (auth.uid() NULL): guard saltato (pipeline chat/email/whatsapp).
--     Presente nel DB reale con la firma di 0008 → CREATE OR REPLACE sostituisce (no overload).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_booking_request(
  p_request_id          uuid,
  p_org_id              uuid,
  p_to_status           text,
  p_actor               text,
  p_note                text       DEFAULT NULL,
  p_gross_total_cents   integer    DEFAULT NULL,
  p_discount_pct        numeric    DEFAULT NULL,
  p_offer_total_cents   integer    DEFAULT NULL,
  p_city_tax_cents      integer    DEFAULT NULL,
  p_price_source        text       DEFAULT NULL,
  p_data_reliability    text       DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req     booking_requests%ROWTYPE;
  v_from    text;
  v_now     timestamptz := now();
  v_hold_h  integer;
  v_offer_h integer;
BEGIN
  -- GUARD (P0-2): un utente autenticato può agire SOLO sulla propria org.
  IF auth.uid() IS NOT NULL AND NOT public.user_in_org(p_org_id) THEN
    RAISE EXCEPTION 'transition_booking_request: caller not a member of org %', p_org_id
      USING ERRCODE = '42501';
  END IF;

  -- 1. Lock esclusivo: previene transizioni concorrenti sullo stesso record.
  SELECT * INTO v_req
  FROM booking_requests
  WHERE id = p_request_id
    AND org_id = p_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_from := v_req.status;

  -- 2. Transizioni valide (whitelist 0008: include interested → proposal_sent).
  IF NOT (
    (v_from = 'received'             AND p_to_status IN ('proposal_sent','rejected','cancelled')) OR
    (v_from = 'proposal_sent'        AND p_to_status IN ('interested','expired','rejected','cancelled')) OR
    (v_from = 'interested'           AND p_to_status IN ('proposal_sent','availability_blocked','rejected','cancelled')) OR
    (v_from = 'availability_blocked' AND p_to_status IN ('awaiting_payment','expired','cancelled')) OR
    (v_from = 'awaiting_payment'     AND p_to_status IN ('confirmed','cancelled')) OR
    (v_from = 'confirmed'            AND p_to_status = 'cancelled')
  ) THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'invalid_transition',
      'from', v_from, 'to', p_to_status
    );
  END IF;

  -- 3. Legge settings della property per i calcoli di scadenza.
  SELECT
    COALESCE((settings->>'hold_hours')::integer, 24),
    COALESCE((settings->>'offer_validity_hours')::integer, 48)
  INTO v_hold_h, v_offer_h
  FROM properties
  WHERE id = v_req.property_id;

  -- 4. Applica la transizione con tutti i side-effects di stato.
  UPDATE booking_requests SET
    status              = p_to_status,
    updated_at          = v_now,
    proposal_sent_at    = CASE WHEN p_to_status = 'proposal_sent'
                               THEN v_now ELSE proposal_sent_at END,
    interested_at       = CASE WHEN p_to_status = 'interested'
                               THEN v_now ELSE interested_at END,
    payment_received_at = CASE WHEN p_to_status = 'confirmed'
                               THEN v_now ELSE payment_received_at END,
    offer_expires_at    = CASE WHEN p_to_status = 'proposal_sent'
                               THEN v_now + (v_offer_h || ' hours')::interval
                               ELSE offer_expires_at END,
    hold_expires_at     = CASE WHEN p_to_status = 'availability_blocked'
                               THEN v_now + (v_hold_h || ' hours')::interval
                               ELSE hold_expires_at END,
    gross_total_cents   = COALESCE(p_gross_total_cents,  gross_total_cents),
    discount_pct        = COALESCE(p_discount_pct,       discount_pct),
    offer_total_cents   = COALESCE(p_offer_total_cents,  offer_total_cents),
    city_tax_cents      = COALESCE(p_city_tax_cents,     city_tax_cents),
    price_source        = COALESCE(p_price_source,       price_source),
    data_reliability    = COALESCE(p_data_reliability,   data_reliability)
  WHERE id = p_request_id;

  -- 5. Audit trail obbligatorio su ogni transizione.
  INSERT INTO booking_request_events (
    org_id, booking_request_id, from_status, to_status, actor, note
  ) VALUES (
    p_org_id, p_request_id, v_from, p_to_status, p_actor, p_note
  );

  RETURN jsonb_build_object('ok', true, 'from', v_from, 'to', p_to_status);
END;
$$;

REVOKE ALL   ON FUNCTION public.transition_booking_request FROM public, anon;
GRANT EXECUTE ON FUNCTION public.transition_booking_request TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (D) process_* — solo backend/cron. pg_cron le esegue come owner del job:
--     revocare anon/authenticated NON rompe il cron.
--     EXISTENCE-GUARDED: opera SOLO sulle funzioni realmente presenti nel DB
--     (adattivo allo stato reale; process_due_followups è assente su questo DB → skip).
-- ----------------------------------------------------------------------------
DO $harden$
DECLARE
  fn   text;
  sigs text[] := ARRAY[
    'public.process_payment_expiry()',
    'public.process_operational_deadlines()',
    'public.process_due_followups()'
  ];
BEGIN
  FOREACH fn IN ARRAY sigs LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL    ON FUNCTION %s FROM public, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
      RAISE NOTICE 'P0-2 hardened: %', fn;
    ELSE
      RAISE NOTICE 'P0-2 SKIP (funzione assente nel DB reale): %', fn;
    END IF;
  END LOOP;
END
$harden$;

-- Forza il reload dello schema PostgREST (riflette subito i nuovi privilegi).
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICA OGGETTIVA (dopo l'apply):
--   -- (a) le funzioni bersaglio PRESENTI esistono ancora:
--   SELECT to_regprocedure('public.enroll_user_in_org(uuid,uuid,text)');                                                        -- non NULL
--   SELECT to_regprocedure('public.transition_booking_request(uuid,uuid,text,text,text,integer,numeric,integer,integer,text,text)'); -- non NULL
--   SELECT to_regprocedure('public.process_payment_expiry()');        -- non NULL
--   SELECT to_regprocedure('public.process_operational_deadlines()'); -- non NULL
--   SELECT to_regprocedure('public.process_due_followups()');         -- NULL atteso su questo DB (skip in (D))
--   -- (b) ACL: anon assente ovunque; process_* solo service_role; enroll/transition = authenticated+service_role.
--   SELECT proname, proacl FROM pg_proc
--    WHERE proname IN ('enroll_user_in_org','transition_booking_request',
--                      'process_payment_expiry','process_operational_deadlines')
--    ORDER BY proname;
--   -- (c) test comportamentali: eseguire app/scripts/p0-2-authz-tests.sql + scripts/probe-rpc-authz.mts.
-- ============================================================================
-- ISSUE SEPARATA (FUORI SCOPE P0-2, da tracciare in KNOWN_ISSUES):
--   La funzione public.process_due_followups() (definita in 0006) NON esiste nel DB reale
--   → divergenza storia-migrazioni ↔ DB (0006 non applicata su questo DB). Il cron
--   'vesta-followups' (0014) esegue "SELECT process_due_followups(); SELECT
--   process_operational_deadlines();": se la command reale è questa, la 1ª istruzione
--   fallisce (42883) e ABORTA la transazione del job → NON gira nemmeno il detector
--   scadenza-pagamento (process_operational_deadlines). Verificare:
--     SELECT jobname, command, active FROM cron.job WHERE jobname = 'vesta-followups';
--     SELECT status, return_message, start_time FROM cron.job_run_details
--      WHERE command LIKE '%process_due_followups%' ORDER BY start_time DESC LIMIT 5;
--   Da correggere in un intervento dedicato (NON in P0-2).
-- ============================================================================
-- FINE MIGRAZIONE 0015
-- ============================================================================
