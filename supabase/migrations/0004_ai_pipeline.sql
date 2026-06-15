-- ============================================================================
-- MIGRAZIONE 0004: AI pipeline (Concierge) + GRANT versionati
-- ============================================================================
-- Prerequisito : 0001 + 0002 + 0003 applicate.
-- Cosa fa      :
--   0. Versiona i GRANT standard Supabase ai ruoli applicativi (riproducibilità).
--   1. conversations: intent, intent_confidence, stage, assigned_to.
--   2. guardrail_events (log protezioni anti-abuse) + ip_blocklist.
--   3. messages: metadata, external_id, delivery_status (predisposizione canali).
--   4. RPC search_knowledge (match KB full-text, usa idx_ka_fts).
--   5. Default AI in properties.settings (budget, limiti) — merge idempotente.
-- Nota numerazione: la booking RPC ha occupato 0003; questa è la migrazione AI
--   (nel dev-plan §10 era indicata come "0003"). La RLS-per-ruolo scala a 0005.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. GRANT standard Supabase (versionati — lo schema 0001 li dava per impliciti)
--    RLS resta attiva su tutte le tabelle: filtra le righe per org.
--    service_role bypassa la RLS per design (ruolo backend).
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES  TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 1. conversations: intent detection + macchina a stati dialogo
-- ----------------------------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS intent            text,
  ADD COLUMN IF NOT EXISTS intent_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS stage             text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS assigned_to       uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.conversations
    ADD CONSTRAINT conversations_intent_check
    CHECK (intent IS NULL OR intent IN (
      'booking','faq','guest_support','partnership',
      'vendor','saas_lead','spam','unclassified'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.conversations
    ADD CONSTRAINT conversations_stage_check
    CHECK (stage IN (
      'new','intent_pending','collecting_data','quoting','proposal_sent',
      'negotiating','follow_up','booking_confirmed','closed','handoff_staff','expired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_intent
  ON public.conversations (property_id, intent) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_stage
  ON public.conversations (property_id, stage) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. guardrail_events + ip_blocklist (anti-abuse, §7.5 dev-plan)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guardrail_events (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid references public.organizations(id) on delete cascade,
  property_id      uuid references public.properties(id) on delete cascade,
  conversation_id  uuid references public.conversations(id) on delete set null,
  type             text not null,   -- rate_limit, msg_limit, budget_80, budget_100,
                                    -- conv_threshold, anomaly, safe_mode_on/off,
                                    -- spam_detected, ip_blocked, intent_unclassified_loop, sla_breach
  ip_hash          text,            -- hash dell'IP (mai IP in chiaro, GDPR)
  details          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_guardrail_events_prop
  ON public.guardrail_events (property_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_guardrail_events_type
  ON public.guardrail_events (type, created_at desc);

COMMENT ON TABLE public.guardrail_events IS
  'Log eventi di protezione anti-abuse (rate limit, budget, safe mode, spam, IP block). ip_hash, mai IP in chiaro.';

CREATE TABLE IF NOT EXISTS public.ip_blocklist (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,
  ip_hash     text not null,
  reason      text,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ip_blocklist_unique
  ON public.ip_blocklist (property_id, ip_hash);
CREATE INDEX IF NOT EXISTS idx_ip_blocklist_lookup
  ON public.ip_blocklist (ip_hash, expires_at);

COMMENT ON TABLE public.ip_blocklist IS
  'Blocklist temporanea per IP (hash) sospetti. expires_at = fine blocco.';

-- guardrail_events / ip_blocklist sono operate dal backend (service_role).
-- RLS attiva: lettura dalla dashboard solo per la propria org.
ALTER TABLE public.guardrail_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_blocklist     ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_access_guardrail_events ON public.guardrail_events
    FOR ALL USING (org_id IS NOT NULL AND public.user_in_org(org_id))
    WITH CHECK (org_id IS NOT NULL AND public.user_in_org(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY tenant_access_ip_blocklist ON public.ip_blocklist
    FOR ALL USING (property_id IS NULL OR public.user_in_org(
      (SELECT org_id FROM public.properties WHERE id = property_id)))
    WITH CHECK (property_id IS NULL OR public.user_in_org(
      (SELECT org_id FROM public.properties WHERE id = property_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 3. messages: predisposizione canali (WhatsApp/email — Fase 2)
-- ----------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS metadata        jsonb not null default '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS external_id     text,
  ADD COLUMN IF NOT EXISTS delivery_status text;

-- ----------------------------------------------------------------------------
-- 4. RPC search_knowledge — match KB full-text (usa idx_ka_fts)
--    Knowledge-first: livello 4 della pipeline (zero AI).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_knowledge(
  p_property_id uuid,
  p_query       text,
  p_limit       int DEFAULT 5
)
RETURNS TABLE (
  id       uuid,
  title    text,
  content  text,
  type     text,
  priority int,
  rank     real
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  -- Query OR sui termini (recall): plainto_tsquery mette in AND, ma per il
  -- concierge serve recuperare gli asset rilevanti a domande multi-tema
  -- (es. "parcheggio e check-in"). La AI riceve i top-N e sceglie.
  WITH q AS (
    SELECT NULLIF(
      replace(plainto_tsquery('simple', p_query)::text, ' & ', ' | '), ''
    )::tsquery AS tsq
  )
  SELECT ka.id, ka.title, ka.content, ka.type, ka.priority,
         ts_rank(
           to_tsvector('simple', coalesce(ka.title,'') || ' ' || coalesce(ka.content,'')),
           (SELECT tsq FROM q)
         ) AS rank
  FROM public.knowledge_assets ka
  WHERE ka.property_id = p_property_id
    AND ka.deleted_at IS NULL
    AND ka.usable_by_concierge = true
    AND (SELECT tsq FROM q) IS NOT NULL
    AND to_tsvector('simple', coalesce(ka.title,'') || ' ' || coalesce(ka.content,''))
        @@ (SELECT tsq FROM q)
  ORDER BY ka.priority DESC, rank DESC
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.search_knowledge TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Default AI in properties.settings (merge idempotente — non sovrascrive)
--    Chiavi §7.2 dev-plan. Solo aggiunte se assenti.
-- ----------------------------------------------------------------------------
UPDATE public.properties
SET settings = settings || jsonb_build_object(
    'ai_daily_budget_cents',           COALESCE((settings->>'ai_daily_budget_cents')::int, 500),
    'ai_conversation_cost_limit_cents',COALESCE((settings->>'ai_conversation_cost_limit_cents')::int, 50),
    'ai_session_message_limit',        COALESCE((settings->>'ai_session_message_limit')::int, 30),
    'safe_mode',                       COALESCE((settings->>'safe_mode')::boolean, false)
  );

-- ============================================================================
-- FINE MIGRAZIONE 0004
-- ============================================================================
