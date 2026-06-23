-- 0011_email_router.sql
-- Router email L0 + archivio OTA/PMS per il pilot LunArt.
-- Tabelle ADDITIVE: nessuna modifica al pipeline ospiti esistente. Reversibile (drop),
-- auditabile (email_routing_log). NESSUNA reservation canonica, nessuna automazione.

-- Audit + idempotenza di OGNI email vista dal router (guest inclusa).
create table if not exists public.email_routing_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  property_id uuid not null references public.properties(id),
  gmail_message_id text not null,
  category text not null check (category in ('guest','ota_pms','supplier_admin','newsletter_spam')),
  source text,
  confidence numeric,
  method text not null check (method in ('deterministic','ai','default')),
  from_address text,
  subject text,
  -- true = rete di sicurezza finale: email instradata 'guest' ma con marker automatici
  -- (Auto-Submitted/Precedence:bulk/List-Unsubscribe) → soppressa (nessun lead/risposta).
  suppressed boolean not null default false,
  decided_at timestamptz not null default now(),
  unique (property_id, gmail_message_id)
);

-- Archivio RAW completo delle email OTA/PMS (per ri-estrarre quando i parser migliorano).
create table if not exists public.ota_inbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  property_id uuid not null references public.properties(id),
  gmail_message_id text not null,
  gmail_thread_id text,
  source text,
  from_address text,
  from_name text,
  subject text,
  received_at timestamptz,
  raw_body text,
  raw_headers jsonb,
  created_at timestamptz not null default now(),
  unique (property_id, gmail_message_id)
);

-- Accumulo strutturato (NON fonte di verità, nessuna automazione). canonical_ref/linked_group_id
-- sono hook per la dedup futura (popolati quando costruiremo il modello reservations).
create table if not exists public.reservations_staging (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  property_id uuid not null references public.properties(id),
  ota_inbox_id uuid references public.ota_inbox(id) on delete cascade,
  source text,
  external_id text,
  guest_name text,
  check_in date,
  check_out date,
  room text,
  amount_cents integer,
  status text check (status in ('new','modified','cancelled','unknown')),
  confidence numeric,
  verified boolean not null default false,
  canonical_ref text,
  linked_group_id uuid,
  parsed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_ota_inbox_property on public.ota_inbox(property_id, received_at desc);
create index if not exists idx_staging_property on public.reservations_staging(property_id, check_in);
create index if not exists idx_staging_external on public.reservations_staging(source, external_id);

alter table public.email_routing_log enable row level security;
alter table public.ota_inbox enable row level security;
alter table public.reservations_staging enable row level security;

do $$ begin
  create policy tenant_access_email_routing_log on public.email_routing_log
    for all using (public.user_in_org(org_id)) with check (public.user_in_org(org_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy tenant_access_ota_inbox on public.ota_inbox
    for all using (public.user_in_org(org_id)) with check (public.user_in_org(org_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy tenant_access_reservations_staging on public.reservations_staging
    for all using (public.user_in_org(org_id)) with check (public.user_in_org(org_id));
exception when duplicate_object then null; end $$;
