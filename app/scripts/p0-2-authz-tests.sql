-- ============================================================================
-- P0-2 · TEST COMPORTAMENTALI DELL'AUTORIZZAZIONE  (eseguire nel SQL Editor)
-- ============================================================================
-- Da lanciare DOPO aver applicato 0015. Dimostra in modo deterministico che
-- `authenticated` NON è negato in assoluto, ma autorizzato SOLO nel contesto corretto:
--   • enroll_user_in_org: solo self, solo org senza altri membri, ruolo whitelisted;
--   • transition_booking_request: solo se membro dell'org (blocco cross-tenant);
--   • anon: sempre negato (permission denied);
--   • service_role (pipeline): guard saltato → flusso guest/email/whatsapp intatto.
--
-- Nessun test persiste dati: transition usa un request_id inesistente (→ not_found,
-- e il guard scatta PRIMA della lettura); i test enroll che scriverebbero girano
-- dentro BEGIN…ROLLBACK.
--
-- PRIMA DI ESEGUIRE, sostituisci i due segnaposto con valori reali del pilot:
--   <OWNER_UID> = SELECT user_id FROM org_members LIMIT 1;   (o l'auth.users dell'owner)
--   <OWNER_ORG> = SELECT org_id  FROM org_members LIMIT 1;   (org di quell'owner)
-- <OTHER_ORG> e <OTHER_UID> restano UUID casuali NON appartenenti all'owner.
-- ============================================================================
\echo '── Query di supporto: recupera OWNER_UID / OWNER_ORG ──'
SELECT user_id AS owner_uid, org_id AS owner_org, role FROM org_members ORDER BY created_at LIMIT 1;

-- ============================================================================
-- 1) TRANSITION — authenticated NEL contesto corretto (membro) → AUTORIZZATO
--    Atteso: {"ok":false,"error":"not_found"}  (guard passa, request inesistente, 0 write)
-- ============================================================================
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<OWNER_UID>","role":"authenticated"}';
  SELECT public.transition_booking_request(
    '00000000-0000-0000-0000-0000000000aa'::uuid, '<OWNER_ORG>'::uuid,
    'cancelled', 'staff') AS expect_not_found;
ROLLBACK;

-- ============================================================================
-- 2) TRANSITION — authenticated CROSS-TENANT (org non sua) → BLOCCATO
--    Atteso: ERROR 42501 'caller not a member of org …'
-- ============================================================================
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<OWNER_UID>","role":"authenticated"}';
  SELECT public.transition_booking_request(
    '00000000-0000-0000-0000-0000000000aa'::uuid, gen_random_uuid(),  -- org NON dell'owner
    'cancelled', 'staff') AS expect_error_42501;
ROLLBACK;

-- ============================================================================
-- 3) TRANSITION — service_role (pipeline chat/email) → guard SALTATO, AUTORIZZATO
--    Atteso: {"ok":false,"error":"not_found"}  (auth.uid() NULL → nessun blocco)
-- ============================================================================
BEGIN;
  SET LOCAL ROLE service_role;
  SET LOCAL request.jwt.claims = '{"role":"service_role"}';
  SELECT public.transition_booking_request(
    '00000000-0000-0000-0000-0000000000aa'::uuid, gen_random_uuid(),
    'interested', 'guest') AS expect_not_found;
ROLLBACK;

-- ============================================================================
-- 4) TRANSITION — anon → NEGATO a monte (nessun EXECUTE)
--    Atteso: ERROR 42501 'permission denied for function transition_booking_request'
-- ============================================================================
BEGIN;
  SET LOCAL ROLE anon;
  SET LOCAL request.jwt.claims = '{"role":"anon"}';
  SELECT public.transition_booking_request(
    '00000000-0000-0000-0000-0000000000aa'::uuid, gen_random_uuid(),
    'cancelled', 'guest') AS expect_permission_denied;
ROLLBACK;

-- ============================================================================
-- 5) ENROLL — authenticated self su propria org → AUTORIZZATO (idempotente)
--    Atteso: nessun errore (ON CONFLICT DO UPDATE). ROLLBACK annulla updated_at.
-- ============================================================================
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<OWNER_UID>","role":"authenticated"}';
  SELECT public.enroll_user_in_org('<OWNER_ORG>'::uuid, '<OWNER_UID>'::uuid, 'owner') AS expect_ok;
ROLLBACK;

-- ============================================================================
-- 6) ENROLL — TAKEOVER: self in org con altri membri → BLOCCATO
--    Simula un attaccante B che prova a iscriversi come owner nella org dell'owner.
--    Atteso: ERROR 42501 'organization already has members'
-- ============================================================================
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
  SELECT public.enroll_user_in_org(
    '<OWNER_ORG>'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'owner') AS expect_error_members;
ROLLBACK;

-- ============================================================================
-- 7) ENROLL — iscrivere UN ALTRO utente → BLOCCATO
--    Atteso: ERROR 42501 'caller may only enroll itself'
-- ============================================================================
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<OWNER_UID>","role":"authenticated"}';
  SELECT public.enroll_user_in_org(
    '<OWNER_ORG>'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'staff') AS expect_error_self;
ROLLBACK;

-- ============================================================================
-- 8) ENROLL — ruolo arbitrario → BLOCCATO dalla whitelist
--    Atteso: ERROR 22023 'invalid role superadmin'
-- ============================================================================
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<OWNER_UID>","role":"authenticated"}';
  SELECT public.enroll_user_in_org('<OWNER_ORG>'::uuid, '<OWNER_UID>'::uuid, 'superadmin') AS expect_error_role;
ROLLBACK;

-- ============================================================================
-- 9) ENROLL — anon → NEGATO a monte (nessun EXECUTE)
--    Atteso: ERROR 42501 'permission denied for function enroll_user_in_org'
-- ============================================================================
BEGIN;
  SET LOCAL ROLE anon;
  SET LOCAL request.jwt.claims = '{"role":"anon"}';
  SELECT public.enroll_user_in_org(
    '<OWNER_ORG>'::uuid, '33333333-3333-4333-8333-333333333333'::uuid, 'owner') AS expect_permission_denied;
ROLLBACK;

-- ============================================================================
-- 10) process_* — anon/authenticated → NEGATO; solo service_role/cron
--     Atteso righe 1-2: ERROR 42501 permission denied · riga 3: intero (0)
-- ============================================================================
BEGIN; SET LOCAL ROLE anon;          SELECT public.process_operational_deadlines() AS expect_denied; ROLLBACK;
BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{"sub":"<OWNER_UID>","role":"authenticated"}';
       SELECT public.process_operational_deadlines() AS expect_denied; ROLLBACK;
BEGIN; SET LOCAL ROLE service_role;  SELECT public.process_operational_deadlines() AS expect_ok_int; ROLLBACK;
-- ============================================================================
