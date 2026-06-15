-- ============================================================================
-- MIGRAZIONE 0005: notifiche staff (real-time dashboard)
-- ============================================================================
-- Prerequisito : 0001..0004 applicate.
-- Cosa fa: tabella notifications (per org/property), RLS, indici, Realtime.
-- Le notifiche sono scritte dal backend (service_role) e lette dalla dashboard
-- (authenticated, RLS per org) con subscription Realtime per il push in-app.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  property_id         uuid references public.properties(id) on delete cascade,
  type                text not null,   -- proposal_auto_sent | proposal_draft | escalation | new_lead
  title               text not null,
  body                text,
  booking_request_id  uuid references public.booking_requests(id) on delete set null,
  conversation_id     uuid references public.conversations(id) on delete set null,
  read_at             timestamptz,
  created_at          timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_prop
  ON public.notifications (property_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON public.notifications (org_id, created_at desc) WHERE read_at IS NULL;

COMMENT ON TABLE public.notifications IS
  'Notifiche staff (nuova proposta auto-inviata, bozza da approvare, escalation). Real-time via publication supabase_realtime.';

GRANT ALL ON public.notifications TO anon, authenticated, service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_access_notifications ON public.notifications
    FOR ALL USING (public.user_in_org(org_id))
    WITH CHECK (public.user_in_org(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Abilita il Realtime sulla tabella (la RLS filtra le righe per la subscription).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ============================================================================
-- FINE MIGRAZIONE 0005
-- ============================================================================
