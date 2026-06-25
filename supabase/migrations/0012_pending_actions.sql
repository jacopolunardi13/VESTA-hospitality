-- 0012_pending_actions.sql
-- Fase B: coda azioni Tier 2 "Approva e invia". Additiva, reversibile, auditabile.
-- NON cambia la state machine: la affianca. Nessuna automazione: solo lo staff approva l'invio.
create table if not exists public.pending_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  property_id uuid not null references public.properties(id),
  conversation_id uuid references public.conversations(id),
  booking_request_id uuid references public.booking_requests(id),
  kind text not null check (kind in ('send_proposal','send_confirmation')),
  status text not null default 'pending' check (status in ('pending','approved','sent','rejected','expired')),
  channel text,
  message_text text,
  document_type text check (document_type in ('preventivo','conferma')),
  document_path text,
  prepared_by text not null default 'system',
  approved_by uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  sent_at timestamptz
);
create index if not exists idx_pending_actions_property_status on public.pending_actions(property_id, status);
create index if not exists idx_pending_actions_lead on public.pending_actions(booking_request_id, kind, status);
alter table public.pending_actions enable row level security;
do $$ begin
  create policy tenant_access_pending_actions on public.pending_actions
    for all using (public.user_in_org(org_id)) with check (public.user_in_org(org_id));
exception when duplicate_object then null; end $$;
