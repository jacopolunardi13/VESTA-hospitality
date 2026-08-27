-- ============================================================================
-- MIGRAZIONE 0017: security least-privilege baseline (completa 0015 oltre lo scope RPC)
-- ============================================================================
-- SECURITY ONLY. Nessuna feature restoration (0006/process_due_followups: separata).
-- Eseguire come `postgres` nel SQL Editor. Idempotente. UN unico change-set transazionale
--   (tutte le istruzioni sono postgres-eseguibili → nessun rischio di rollback parziale da
--   authority mancante; vedi NOTE — la parte supabase_admin è FUORI SCOPE e NON tentata qui).
-- Evidence base:
--   * 7 funzioni public sono postgres-owned (app); 118 sono supabase_admin-owned (pgvector/ext).
--   * anon (ruolo PostgREST non autenticato) NON ha alcun accesso richiesto: tutte le superfici
--     pubbliche/non-auth (/c/[property], api/chat, whatsapp, email/poll, cron/ical) usano service_role;
--     l'unico uso del browser-client (anon key) è notification-bell in dashboard → sessione authenticated.
--   * search_knowledge NON ha caller applicativi via anon; grant esplicito 0004 = authenticated+service_role.
--   * user_in_org è usata dalle policy RLS → authenticated deve poterla eseguire (anon non interroga tabelle).

BEGIN;   -- singola transazione esplicita: nessuno stato ACL/policy parziale se una istruzione fallisce (Codex iter2)

-- ---------------------------------------------------------------------------
-- (0) SCHEMA TRUST: nessun CREATE su schema public per PUBLIC/API roles → i SET search_path=public
--     delle SECURITY DEFINER non sono shadowable da oggetti creati da ruoli non fidati (Codex iter2).
-- ---------------------------------------------------------------------------
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- (1) ROUTINES app (postgres-owned): rimuovi EXECUTE ereditato da PUBLIC + API roles, poi allowlist.
--     REVOKE per firma ESATTA (overload-aware).
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.user_in_org(uuid),
  public.enroll_user_in_org(uuid, uuid, text),
  public.transition_booking_request(uuid, uuid, text, text, text, integer, numeric, integer, integer, text, text),
  public.process_payment_expiry(),
  public.process_operational_deadlines(),
  public.search_knowledge(uuid, text, integer),
  public.set_updated_at()
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.user_in_org(uuid) TO authenticated;            -- valutazione policy RLS (dashboard)
GRANT EXECUTE ON FUNCTION public.enroll_user_in_org(uuid, uuid, text) TO authenticated;  -- self-enroll (server client)
GRANT EXECUTE ON FUNCTION public.transition_booking_request(uuid, uuid, text, text, text, integer, numeric, integer, integer, text, text)
  TO authenticated, service_role;                                              -- dashboard staff + pipeline concierge
GRANT EXECUTE ON FUNCTION public.process_payment_expiry()        TO service_role;   -- non-cron backend path
GRANT EXECUTE ON FUNCTION public.process_operational_deadlines() TO service_role;   -- non-cron backend path
-- NB pg_cron: i job vesta-* girano come username=postgres (owner delle process_*) → l'owner le esegue
--   a prescindere dai GRANT: la revoca a service_role-only NON rompe il cron. Il GRANT service_role
--   copre solo eventuali percorsi backend non-cron. Tutte e 5 le SECURITY DEFINER hanno SET search_path=public.
GRANT EXECUTE ON FUNCTION public.search_knowledge(uuid, text, integer) TO authenticated, service_role;
-- set_updated_at(): trigger function — invocata dal trigger, mai chiamata direttamente;
--   Postgres esegue le trigger function a prescindere dall'EXECUTE del chiamante → nessun GRANT.
-- pgvector (118 fn supabase_admin-owned): NON toccate (non-revocabili come postgres); PUBLIC EXECUTE
--   accettato come default estensione (operatori matematici, basso rischio). Vedi NOTE.

-- ---------------------------------------------------------------------------
-- (2) TABLES: togli i privilegi NON governati da RLS agli API role; azzera anon.
-- ---------------------------------------------------------------------------
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;   -- anon + PUBLIC: nessun accesso richiesto ad alcuna tabella
-- authenticated conserva SELECT/INSERT/UPDATE/DELETE (RLS-gated) sulle tabelle esistenti (invariato).

-- ---------------------------------------------------------------------------
-- (3) SEQUENCES: anon nessuno; authenticated solo USAGE (nextval per identity/serial).
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ---------------------------------------------------------------------------
-- (4) DEFAULT PRIVILEGES futuri (grantor postgres): default-deny incl. PUBLIC.
--     Copre il gap di 0015(A) che revocava solo anon/authenticated (NON PUBLIC) sulle ROUTINES.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON ROUTINES  FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL      ON TABLES    FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL      ON SEQUENCES FROM PUBLIC, anon, authenticated;
-- service_role conserva i propri default (backend). Le nuove funzioni app dovranno GRANT EXECUTE esplicito.

-- ---------------------------------------------------------------------------
-- (5) ip_blocklist: elimina il NULL-escape. Le righe globali (property_id IS NULL) NON devono
--     essere accessibili via API; le gestisce il backend (service_role bypassa RLS).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_access_ip_blocklist ON public.ip_blocklist;
CREATE POLICY tenant_access_ip_blocklist ON public.ip_blocklist
  FOR ALL
  USING      (property_id IS NOT NULL AND public.user_in_org((SELECT org_id FROM public.properties WHERE id = property_id)))
  WITH CHECK (property_id IS NOT NULL AND public.user_in_org((SELECT org_id FROM public.properties WHERE id = property_id)));

-- ---------------------------------------------------------------------------
-- (6) reload della cache schema PostgREST.
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- NOTE — FUORI SCOPE (non eseguibile come postgres; NON tentato qui):
--   * ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ... → richiede membership in supabase_admin
--     o superuser (assenti per il `postgres` del SQL Editor Supabase). I default supabase_admin
--     restano invariati; impattano SOLO oggetti FUTURI creati da supabase_admin (estensioni/piattaforma),
--     NON le funzioni/tabelle app (postgres-owned). Controllo compensativo: le migration app creano
--     oggetti come postgres (default (4) applicato) + audit periodico. Se un domani serve toccare il
--     default supabase_admin → azione lato Supabase (provider), non nostra.
--   * ACL delle 118 funzioni pgvector (supabase_admin-owned): non revocabili come postgres; PUBLIC
--     EXECUTE accettato (estensione, basso rischio).
-- ============================================================================
