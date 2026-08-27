-- ============================================================================
-- 0017 VERIFICATION / REGRESSION PACK  (read-only assertions unless noted)
-- ----------------------------------------------------------------------------
-- PUBLIC coverage note (Codex iter2 blocker fix): `public` is NOT a role, so
--   has_function_privilege('public',...) ERRORS. PUBLIC is instead proven via
--   INHERITANCE: every role implicitly holds PUBLIC, so
--     has_*_privilege('anon', obj, priv) = FALSE  ⟹  PUBLIC does NOT grant priv
--   (else anon would inherit it and return TRUE). Thus asserting anon (and
--   authenticated) effective = FALSE proves the absence of any PUBLIC-granted
--   privilege as well. No pseudo-role call is used anywhere below.
-- Every assertion returns ONLY failure rows (empty result = pass).
-- ============================================================================

-- ============================ PREFLIGHT (read-only, BEFORE apply) ============================
-- P1. Ownership: the 7 app fns AND every affected relation/sequence are postgres-owned. Offenders:
SELECT p.oid::regprocedure AS obj, p.proowner::regrole AS owner
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('user_in_org','enroll_user_in_org','transition_booking_request',
       'process_payment_expiry','process_operational_deadlines','search_knowledge','set_updated_at')
   AND p.proowner::regrole <> 'postgres'::regrole;                         -- expect 0 rows
SELECT c.relname, c.relkind, c.relowner::regrole AS owner FROM pg_class c
 WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','f','S')
   AND c.relowner::regrole <> 'postgres'::regrole;                         -- expect 0 rows
   -- (REVOKE ... ON ALL TABLES also affects views/matviews/foreign tables → any non-postgres owner would abort the txn)

-- P2. Definer safety: every SECURITY DEFINER fn in public pins search_path. Offenders:
SELECT p.oid::regprocedure AS definer_fn, p.proconfig
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef
   AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));  -- expect 0 rows

-- P3. Relation-kind census as an ASSERTION: NO views/matviews/foreign tables in public (RLS-bypass surface). Offenders:
SELECT relname, relkind FROM pg_class
 WHERE relnamespace='public'::regnamespace AND relkind IN ('v','m','f');   -- expect 0 rows

-- P4. ROLLBACK snapshot → PERSIST (durable, survives sessions). Scope = EXACTLY the objects 0017 modifies:
--     the 7 postgres-owned app fns; postgres-owned public tables/sequences; schema public; postgres-grantor
--     defaults; ip_blocklist policy. (The 118 supabase_admin-owned fns are NOT touched by 0017 → excluded, so
--     rollback never emits a REVOKE postgres cannot run.) DROP-then-create guarantees a FRESH, non-stale capture.
CREATE SCHEMA IF NOT EXISTS audit;
DROP TABLE IF EXISTS audit.acl_snapshot_0017_fn, audit.acl_snapshot_0017_rel, audit.acl_snapshot_0017_nsp,
                     audit.acl_snapshot_0017_defacl, audit.acl_snapshot_0017_pol;
CREATE TABLE audit.acl_snapshot_0017_fn AS
  SELECT oid, oid::regprocedure AS sig, proacl FROM pg_proc
   WHERE oid IN (to_regprocedure('public.user_in_org(uuid)'),
                 to_regprocedure('public.enroll_user_in_org(uuid,uuid,text)'),
                 to_regprocedure('public.transition_booking_request(uuid,uuid,text,text,text,integer,numeric,integer,integer,text,text)'),
                 to_regprocedure('public.process_payment_expiry()'),
                 to_regprocedure('public.process_operational_deadlines()'),
                 to_regprocedure('public.search_knowledge(uuid,text,integer)'),
                 to_regprocedure('public.set_updated_at()'));
CREATE TABLE audit.acl_snapshot_0017_rel AS
  SELECT c.oid, c.relname, c.relkind, c.relacl FROM pg_class c
   WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','S')
     AND c.relowner::regrole='postgres'::regrole;         -- P3 asserts no v/m/f; postgres-owned only
CREATE TABLE audit.acl_snapshot_0017_nsp AS SELECT nspname, nspacl FROM pg_namespace WHERE nspname='public';
CREATE TABLE audit.acl_snapshot_0017_defacl AS
  SELECT defaclobjtype, pg_get_userbyid(defaclrole) AS grantor, defaclacl
    FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
   WHERE n.nspname='public' AND pg_get_userbyid(defaclrole)='postgres';
CREATE TABLE audit.acl_snapshot_0017_pol AS
  SELECT polname, polpermissive, polroles, polcmd,
         pg_get_expr(polqual,polrelid) AS using_expr, pg_get_expr(polwithcheck,polrelid) AS check_expr
    FROM pg_policy WHERE polrelid='public.ip_blocklist'::regclass
     AND polname='tenant_access_ip_blocklist';   -- ONLY the policy 0017 replaces (other policies untouched)

-- P5. supabase_admin AUTHORITY (drives out-of-scope decision — READ, do not assume):
SELECT pg_has_role(current_user,'supabase_admin','MEMBER') AS is_member,
       (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS is_super;
--   both false → supabase_admin defaults/ACLs NOT alterable here → KEEP OUT OF SCOPE. Else: separate authorized step.

-- ============================ POST-APPLY ASSERTIONS (read-only) ============================
-- A0. schema CREATE hardening: anon/authenticated (hence PUBLIC) cannot CREATE in public. Failures:
SELECT r AS role_with_create FROM (VALUES ('anon'),('authenticated')) x(r)
 WHERE has_schema_privilege(r,'public','CREATE');                          -- expect 0 rows

-- A1. ROUTINE ALLOWLIST as exact matrix (regprocedure × grantee; anon=FALSE also proves PUBLIC=FALSE). Mismatches:
WITH expected(fn, grantee, allow) AS (VALUES
  ('public.user_in_org(uuid)','anon',false),('public.user_in_org(uuid)','authenticated',true),('public.user_in_org(uuid)','service_role',false),
  ('public.enroll_user_in_org(uuid,uuid,text)','anon',false),('public.enroll_user_in_org(uuid,uuid,text)','authenticated',true),('public.enroll_user_in_org(uuid,uuid,text)','service_role',false),
  ('public.transition_booking_request(uuid,uuid,text,text,text,integer,numeric,integer,integer,text,text)','anon',false),
  ('public.transition_booking_request(uuid,uuid,text,text,text,integer,numeric,integer,integer,text,text)','authenticated',true),
  ('public.transition_booking_request(uuid,uuid,text,text,text,integer,numeric,integer,integer,text,text)','service_role',true),
  ('public.process_payment_expiry()','anon',false),('public.process_payment_expiry()','authenticated',false),('public.process_payment_expiry()','service_role',true),
  ('public.process_operational_deadlines()','anon',false),('public.process_operational_deadlines()','authenticated',false),('public.process_operational_deadlines()','service_role',true),
  ('public.search_knowledge(uuid,text,integer)','anon',false),('public.search_knowledge(uuid,text,integer)','authenticated',true),('public.search_knowledge(uuid,text,integer)','service_role',true),
  ('public.set_updated_at()','anon',false),('public.set_updated_at()','authenticated',false),('public.set_updated_at()','service_role',false)
)
SELECT * FROM expected WHERE has_function_privilege(grantee, fn, 'EXECUTE') <> allow;   -- expect 0 rows

-- A1b. OVERLOAD sweep: ANY function with one of the 7 names whose OID is NOT one of the 7 exact signatures
--      (OID comparison — immune to arg-name/mode formatting; NULL-safe via NOT EXISTS). Offenders:
WITH allow(oid) AS (
  SELECT x FROM unnest(ARRAY[
    to_regprocedure('public.user_in_org(uuid)'),
    to_regprocedure('public.enroll_user_in_org(uuid,uuid,text)'),
    to_regprocedure('public.transition_booking_request(uuid,uuid,text,text,text,integer,numeric,integer,integer,text,text)'),
    to_regprocedure('public.process_payment_expiry()'),
    to_regprocedure('public.process_operational_deadlines()'),
    to_regprocedure('public.search_knowledge(uuid,text,integer)'),
    to_regprocedure('public.set_updated_at()')
  ]::oid[]) x
)
SELECT p.oid::regprocedure AS unexpected_overload
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('user_in_org','enroll_user_in_org','transition_booking_request',
       'process_payment_expiry','process_operational_deadlines','search_knowledge','set_updated_at')
   AND NOT EXISTS (SELECT 1 FROM allow a WHERE a.oid = p.oid);             -- expect 0 rows

-- A2. TABLES/VIEWS/PARTITIONS/MATVIEWS/FOREIGN: anon has NO privilege (⟹ PUBLIC none); authenticated lacks non-RLS privs. Failures:
SELECT c.relname, c.relkind, v.priv AS anon_has
  FROM pg_class c
  CROSS JOIN LATERAL (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('TRIGGER'),('REFERENCES')) v(priv)
 WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','f')
   AND has_table_privilege('anon', c.oid, v.priv);                        -- expect 0 rows
SELECT c.relname, v.priv AS authenticated_nonrls_has
  FROM pg_class c
  CROSS JOIN LATERAL (VALUES ('TRUNCATE'),('TRIGGER'),('REFERENCES')) v(priv)
 WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','f')
   AND has_table_privilege('authenticated', c.oid, v.priv);              -- expect 0 rows
-- A2b. authenticated STILL has RLS-gated DML on base tables (regression guard). Failures:
SELECT c.relname, v.priv AS authenticated_missing
  FROM pg_class c
  CROSS JOIN LATERAL (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) v(priv)
 WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
   AND NOT has_table_privilege('authenticated', c.oid, v.priv);          -- expect 0 rows
-- A2c. column-grant residue to anon (0004 was table-level; verify none linger):
SELECT table_name, column_name, privilege_type FROM information_schema.role_column_grants
 WHERE table_schema='public' AND grantee='anon';                          -- expect 0 rows

-- A3. SEQUENCES: authenticated exactly USAGE (no SELECT/UPDATE); anon none (⟹ PUBLIC none). Failures:
SELECT c.relname
  FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='S'
   AND ( NOT has_sequence_privilege('authenticated',c.oid,'USAGE')
      OR has_sequence_privilege('authenticated',c.oid,'SELECT')
      OR has_sequence_privilege('authenticated',c.oid,'UPDATE')
      OR has_sequence_privilege('anon',c.oid,'USAGE')
      OR has_sequence_privilege('anon',c.oid,'SELECT')
      OR has_sequence_privilege('anon',c.oid,'UPDATE') );                 -- expect 0 rows
--   (If a known caller needs currval/setval, grant SELECT/UPDATE on THAT sequence and adjust expectation.)

-- A4. FUTURE DEFAULTS (postgres grantor): acl must contain NO anon/authenticated/PUBLIC. Inspect:
SELECT defaclobjtype, defaclacl FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
 WHERE n.nspname='public' AND pg_get_userbyid(d.defaclrole)='postgres';   -- no anon/authenticated/PUBLIC in acl

-- A5. ip_blocklist: NULL-escape removed.
SELECT polname, pg_get_expr(polqual,polrelid) AS using_expr FROM pg_policy
 WHERE polrelid='public.ip_blocklist'::regclass AND pg_get_expr(polqual,polrelid) ILIKE '%is null%';  -- expect 0 rows

-- A6. RLS still enabled on every base table.
SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND NOT relrowsecurity;  -- expect 0

-- ============================ BEHAVIORAL TESTS (staging; real JWT roles) ============================
-- B1. authenticated (staff of org X): dashboard SELECT/INSERT/UPDATE/DELETE on own-org rows OK; cross-org invisible;
--     enroll self OK; transition own-org OK; transition other-org denied (42501).
-- B2. anon (no JWT): every public.* table access denied; public concierge /c/[property] STILL works (service_role).
-- B3. service_role: api/chat, whatsapp webhook, email/poll, cron/ical-sync succeed (BYPASSRLS unchanged).
-- B4. pg_cron (jobs run as postgres = owner of process_*): after apply, cron.job_run_details shows 'succeeded',
--     no 42501/permission errors on process_operational_deadlines / process_payment_expiry.
-- B5. sequence insert path: authenticated INSERT into serial/identity table succeeds with USAGE only.
-- B6. ip_blocklist: authenticated cannot access global (NULL) rows; manages own-property rows; service_role manages global.

-- ============================ ROLLBACK / RECOVERY (exact, executable inverse) ============================
-- 0017 runs as one explicit transaction (BEGIN/COMMIT) → a failure auto-rolls-back with NO partial commit.
-- If a regression is found AFTER commit, restore the EXACT prior state from audit.acl_snapshot_0017_* (P4).
-- EXACTNESS-BY-SCOPE: 0017 modifies ONLY (a) the 7 postgres-owned fns' ACLs, (b) PUBLIC/anon/authenticated on
-- postgres-owned public tables/sequences, (c) CREATE on schema public for PUBLIC/anon/authenticated, (d) the
-- postgres-grantor defaults, (e) the ip_blocklist policy. Therefore the inverse only needs to revoke/re-grant those
-- exact grantees on those exact objects; every other role/object was never touched → leaving it IS exact.
-- The GENERATORS below emit executable SQL (review output, then run inside BEGIN/COMMIT). is_grantable → WITH GRANT OPTION.
--
--   -- (R1) FUNCTION ACLs (7 app fns): clear 0017's grantees, restore snapshot; NULL proacl = prior DEFAULT (PUBLIC EXECUTE):
--   SELECT 'REVOKE ALL ON FUNCTION '||sig||' FROM PUBLIC, anon, authenticated, service_role;' FROM audit.acl_snapshot_0017_fn;
--   SELECT 'GRANT EXECUTE ON FUNCTION '||sig||' TO PUBLIC;' FROM audit.acl_snapshot_0017_fn WHERE proacl IS NULL;
--   SELECT format('GRANT %s ON FUNCTION %s TO %s%s;', a.privilege_type, s.sig,
--                 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
--                 CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
--     FROM audit.acl_snapshot_0017_fn s, LATERAL aclexplode(s.proacl) a;   -- NULL proacl → no rows (handled above)
--
--   -- (R2) TABLE/SEQUENCE ACLs: revoke only 0017-touched grantees, restore snapshot for exactly those grantees:
--   SELECT 'REVOKE ALL ON '||CASE WHEN relkind='S' THEN 'SEQUENCE ' ELSE 'TABLE ' END||format('public.%I',relname)||
--          ' FROM PUBLIC, anon, authenticated;' FROM audit.acl_snapshot_0017_rel;
--   SELECT format('GRANT %s ON %s public.%I TO %s%s;', a.privilege_type,
--                 CASE WHEN s.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END, s.relname,
--                 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
--                 CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
--     FROM audit.acl_snapshot_0017_rel s, LATERAL aclexplode(s.relacl) a
--    WHERE a.grantee IN (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid);   -- only 0017-touched grantees
--
--   -- (R3) SCHEMA CREATE: revoke current, restore snapshot grantees:
--   REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
--   SELECT format('GRANT CREATE ON SCHEMA public TO %s%s;',
--                 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
--                 CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
--     FROM audit.acl_snapshot_0017_nsp s, LATERAL aclexplode(s.nspacl) a
--    WHERE a.privilege_type='CREATE' AND a.grantee IN (0,'anon'::regrole::oid,'authenticated'::regrole::oid);
--
--   -- (R4) postgres-grantor DEFAULT privileges: clear 0017's state, then restore snapshot (executable generator):
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM PUBLIC, anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM PUBLIC, anon, authenticated;
--   SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT %s ON %s TO %s%s;',
--            a.privilege_type,
--            CASE d.defaclobjtype WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' WHEN 'f' THEN 'ROUTINES'
--                                 WHEN 'n' THEN 'SCHEMAS' WHEN 'T' THEN 'TYPES' END,
--            CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
--            CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
--     FROM audit.acl_snapshot_0017_defacl d, LATERAL aclexplode(d.defaclacl) a
--    WHERE d.grantor='postgres' AND a.grantee IN (0,'anon'::regrole::oid,'authenticated'::regrole::oid);
--   -- R4 IMPLICIT-DEFAULT fallback: if the pre-0017 postgres routine default was IMPLICIT (no 'f' snapshot row),
--   -- the prior effective default was PUBLIC EXECUTE → restore it. (Tables/sequences implicit default = no grants,
--   -- which our REVOKE already leaves, so no table/sequence fallback is needed.)
--   SELECT 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON ROUTINES TO PUBLIC;'
--     WHERE NOT EXISTS (SELECT 1 FROM audit.acl_snapshot_0017_defacl WHERE grantor='postgres' AND defaclobjtype='f');
--   -- (NB in this production the 'f' row EXISTS — 0004+0015 created it — so this fallback is a safety net, not expected to fire.)
--
--   -- (R5) ip_blocklist policy — restore EXACTLY (permissive + roles + cmd + exprs):
--   DROP POLICY IF EXISTS tenant_access_ip_blocklist ON public.ip_blocklist;
--   SELECT format('CREATE POLICY %I ON public.ip_blocklist AS %s FOR %s TO %s USING (%s)%s;',
--            polname,
--            CASE WHEN polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
--            CASE polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
--                        WHEN 'd' THEN 'DELETE' ELSE 'ALL' END,
--            (SELECT string_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE r::regrole::text END, ',') FROM unnest(polroles) r),
--            using_expr,
--            CASE WHEN check_expr IS NOT NULL THEN ' WITH CHECK ('||check_expr||')' ELSE '' END)
--     FROM audit.acl_snapshot_0017_pol;
--
--   -- Then: NOTIFY pgrst, 'reload schema';  (all wrapped in BEGIN/COMMIT)
--
-- 0017 touches ONLY ACLs + one policy — NO data — so rollback is fully reversible and data-preserving.
-- Idempotence: transactional and repeatable against the VERIFIED inventory; exact-signature REVOKE fails closed if a
--   signature drifted or an object is unalterable (re-run only after reconciling P1/P2/P3). Not "universally idempotent".
-- Cleanup: once rollback is no longer needed, DROP the audit.acl_snapshot_0017_* tables.
