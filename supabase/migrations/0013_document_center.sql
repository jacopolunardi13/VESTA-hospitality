-- 0013_document_center.sql
-- Modello dati GENERALE del Document Center (additivo, non applicato finché non si costruisce
-- l'MVP). Il pilot iniziale userà solo category='invoice' da Booking, ma il modello è pensato
-- per qualsiasi documento della struttura (categorie estendibili). NON applicare ora.

create table if not exists public.document_center (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  property_id uuid not null references public.properties(id),
  -- collegamento all'email originale (raw già archiviato in ota_inbox per le email OTA/PMS)
  ota_inbox_id uuid references public.ota_inbox(id),
  gmail_message_id text,
  source text,                 -- es. 'booking', 'amazon', dominio fornitore
  supplier text,               -- fornitore riconosciuto
  category text not null default 'other'
    check (category in ('invoice','contract','insurance','utility','tax','pec','employee','certificate','other')),
  -- campi estratti (best-effort; nell'MVP per lo più null — niente AI/OCR)
  doc_date date,
  doc_number text,
  amount_cents integer,
  currency text,
  has_vat boolean,
  vat_number text,
  heading text,
  -- valutazione (futuro: AI; 3 livelli + motivazione)
  classification text check (classification in ('probable_invoice','to_verify','probably_not_invoice')),
  confidence numeric,
  motivazione text,
  -- archivio
  storage_path text,           -- PDF principale
  attachments jsonb,           -- eventuali altri allegati
  -- workflow stati
  status text not null default 'ready_for_accountant'
    check (status in ('received','analyzed','to_verify','ready_for_accountant','sent_to_accountant','archived')),
  created_at timestamptz not null default now()
);
create index if not exists idx_document_center_property on public.document_center(property_id, status, created_at desc);
create index if not exists idx_document_center_category on public.document_center(property_id, category);

-- Storico invii al commercialista (per pacchetti senza duplicati: "nuovi dal last invio").
create table if not exists public.accountant_exports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  property_id uuid not null references public.properties(id),
  sent_at timestamptz not null default now(),
  sent_by uuid,
  document_ids uuid[] not null default '{}',
  note text
);
create index if not exists idx_accountant_exports_property on public.accountant_exports(property_id, sent_at desc);

alter table public.document_center enable row level security;
alter table public.accountant_exports enable row level security;
do $$ begin
  create policy tenant_access_document_center on public.document_center
    for all using (public.user_in_org(org_id)) with check (public.user_in_org(org_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy tenant_access_accountant_exports on public.accountant_exports
    for all using (public.user_in_org(org_id)) with check (public.user_in_org(org_id));
exception when duplicate_object then null; end $$;
