-- ============================================================================
-- AI CONCIERGE & DIRECT QUOTE — MIGRAZIONE DEFINITIVA (0001)
-- Da incollare nel SQL Editor di Supabase ed eseguire una sola volta
-- su un progetto pulito (sostituisce integralmente la versione precedente).
--
-- Incorpora le revisioni approvate:
--   R1. Embedding provider-agnostic: tabella separata knowledge_embeddings,
--       vector senza dimensione fissa, chunking, embedding = cache rigenerabile.
--   R2. Source tracking dettagliato: 14 source + source_category generata
--       + source_detail su conversations e booking_requests.
--   R3. KB Auto-Learning: kb_suggestions con ciclo di vita completo,
--       supersedes_asset_id e origin su knowledge_assets,
--       knowledge_learning_mode per struttura (manual | assisted | automatic).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ESTENSIONI
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists vector;     -- pgvector: embedding knowledge base

-- ----------------------------------------------------------------------------
-- 2. FUNZIONI DI UTILITÀ
-- ----------------------------------------------------------------------------

-- Aggiorna automaticamente updated_at ad ogni UPDATE
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Verifica se l'utente loggato appartiene a una organization (usata dalle policy RLS).
-- Versione PL/pgSQL: il corpo NON viene validato alla creazione, quindi può
-- essere definita qui anche se org_members viene creata più avanti.
create or replace function public.user_in_org(p_org uuid)
returns boolean
language plpgsql stable security definer
set search_path = public as $$
begin
  return exists (
    select 1 from public.org_members m
    where m.org_id = p_org
      and m.user_id = auth.uid()
  );
end $$;

-- ----------------------------------------------------------------------------
-- 3. TENANT: ORGANIZATIONS, MEMBRI, PROPERTIES
-- ----------------------------------------------------------------------------

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
comment on table public.organizations is
  'Tenant radice del SaaS. Una organization possiede N strutture; billing e utenti si agganciano qui.';

create table public.org_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'owner'
              check (role in ('owner','manager','staff')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
comment on table public.org_members is
  'Collega gli utenti Supabase Auth alle organizations, con ruolo.';

create table public.properties (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  name                     text not null,
  address                  text,
  city                     text,
  timezone                 text not null default 'Europe/Rome',
  default_language         text not null default 'it',
  -- settings JSONB: sconto_diretto_pct, tassa_soggiorno, iban, metodo_pagamento,
  -- hold_hours (default 24), soglie_freshness, disclaimer, regole_bambini, ecc.
  settings                 jsonb not null default '{}'::jsonb,
  supervision_mode         boolean not null default true,
  -- R3: governa la pubblicazione delle correzioni in knowledge base
  --   manual    -> nessuna pubblicazione automatica (tutto resta in coda proposte)
  --   assisted  -> le correzioni vengono proposte e richiedono conferma esplicita
  --   automatic -> le correzioni dell'owner vengono pubblicate immediatamente
  knowledge_learning_mode  text not null default 'assisted'
                           check (knowledge_learning_mode in ('manual','assisted','automatic')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz
);
comment on table public.properties is
  'Singola struttura ricettiva (B&B, affittacamere). settings contiene la configurazione commerciale.';
comment on column public.properties.supervision_mode is
  'Se true, le proposte AI richiedono uno sguardo dello staff prima dell''invio (modalità rodaggio).';
comment on column public.properties.knowledge_learning_mode is
  'Modalità di apprendimento KB: manual = mai automatico; assisted = proposta + conferma; automatic = correzioni owner pubblicate subito.';

-- ----------------------------------------------------------------------------
-- 4. INVENTARIO: CAMERE, CALENDARIO TARIFFE, FEED ICAL
-- ----------------------------------------------------------------------------

create table public.rooms (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  property_id  uuid not null references public.properties(id) on delete cascade,
  name         text not null,
  max_guests   int  not null check (max_guests > 0),
  description  text,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
comment on table public.rooms is 'Camere/unità vendibili di una struttura.';

create table public.rate_calendar (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  property_id       uuid not null references public.properties(id) on delete cascade,
  room_id           uuid not null references public.rooms(id) on delete cascade,
  date              date not null,
  price_cents       int  check (price_cents >= 0),          -- prezzo a notte in centesimi
  currency          text not null default 'EUR' check (char_length(currency) = 3),
  available         int  not null default 1 check (available in (0,1)),
  min_stay          int  not null default 1 check (min_stay >= 1),
  closed_arrival    boolean not null default false,
  closed_departure  boolean not null default false,
  source            text not null default 'manual'
                    check (source in ('manual','csv','ical','api')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (room_id, date)
);
comment on table public.rate_calendar is
  'Una riga per camera per giorno: prezzo, disponibilità, restrizioni. updated_at alimenta l''indicatore di affidabilità.';

create table public.ical_feeds (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  property_id    uuid not null references public.properties(id) on delete cascade,
  room_id        uuid not null references public.rooms(id) on delete cascade,
  url            text not null,
  last_sync_at   timestamptz,
  last_status    text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.ical_feeds is
  'Feed iCal per camera (solo disponibilità/occupazione, mai prezzi).';

-- ----------------------------------------------------------------------------
-- 5. KNOWLEDGE BASE (R1 + R3)
-- ----------------------------------------------------------------------------

create table public.knowledge_assets (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  property_id          uuid not null references public.properties(id) on delete cascade,
  type                 text not null
                       check (type in ('faq','brochure','pdf','procedura','policy','correzione')),
  -- R3: provenienza della conoscenza (determina anche la priorità di default)
  origin               text not null default 'manuale'
                       check (origin in ('import','manuale','correzione','gap')),
  title                text not null,
  content              text,                                  -- testo estratto/inserito, leggibile dall'AI
  file_path            text,                                  -- path su Supabase Storage (pdf, brochure)
  languages            text[] not null default array['it'],
  tags                 text[] not null default '{}',
  usable_by_concierge  boolean not null default true,
  attachable           boolean not null default false,        -- es. brochure da allegare post-conferma
  -- Priorità retrieval: import = 0, manuale (owner) = 50, correzione/gap da uso reale = 100
  priority             int not null default 0,
  -- R3: se questo asset sostituisce un asset precedente (mai cancellare, solo superare)
  supersedes_asset_id  uuid references public.knowledge_assets(id) on delete set null,
  current_version      int not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);
comment on table public.knowledge_assets is
  'Base conoscenza della struttura: FAQ, brochure, PDF, procedure, policy e correzioni dallo staff. Retrieval ordinato per priority desc, poi recency.';
comment on column public.knowledge_assets.supersedes_asset_id is
  'Asset precedente sostituito da questo. Il vecchio viene disattivato (usable_by_concierge = false), mai cancellato.';

create table public.knowledge_asset_versions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  asset_id    uuid not null references public.knowledge_assets(id) on delete cascade,
  version     int  not null,
  title       text not null,
  content     text,
  edited_by   uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (asset_id, version)
);
comment on table public.knowledge_asset_versions is
  'Storico immutabile delle versioni di ogni asset (rollback e audit).';

-- R1: embedding in tabella separata, provider-agnostic.
-- Vector SENZA dimensione fissa: modelli diversi convivono (colonne provider/model/dim).
-- Gli embedding sono dati DERIVATI e rigenerabili (cache): cambio provider = rigenerazione
-- batch, zero migrazioni. La KB per struttura è piccola (centinaia di righe filtrate per
-- property_id + model): la ricerca esatta senza indice ANN è già ottimale.
create table public.knowledge_embeddings (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  property_id  uuid not null references public.properties(id) on delete cascade,
  asset_id     uuid not null references public.knowledge_assets(id) on delete cascade,
  chunk_index  int  not null default 0,                       -- un asset lungo -> N chunk
  chunk_text   text not null,                                 -- testo del chunk embeddato
  provider     text not null,                                 -- 'anthropic' | 'openai' | 'gemini' | ...
  model        text not null,                                 -- es. 'text-embedding-3-small'
  dim          int  not null check (dim > 0),
  embedding    vector not null,                               -- dimensione libera (provider-agnostic)
  created_at   timestamptz not null default now(),
  unique (asset_id, model, chunk_index)
);
comment on table public.knowledge_embeddings is
  'Embedding per chunk di asset, per modello. Cache rigenerabile: interrogare sempre filtrando per il model attivo configurato nel layer AI.';

-- ----------------------------------------------------------------------------
-- 6. CONVERSAZIONI E MESSAGGI (R2)
-- ----------------------------------------------------------------------------

-- R2: set definitivo dei source (14 valori)
-- direct : website_chat, website_form, whatsapp, email, direct_phone, walk_in, google_business
-- ota    : booking_message, expedia_message, airbnb_message, ota_other
-- social : instagram_dm, facebook_messenger
-- manual : manual
-- NOTA OPERATIVA: per source_category = 'ota' i template NON devono mai contenere
-- IBAN o link diretti (violazione policy OTA). Il Template Selector usa la categoria.

create table public.conversations (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  property_id         uuid not null references public.properties(id) on delete cascade,
  source              text not null default 'website_chat'
                      check (source in (
                        'website_chat','website_form','whatsapp','email',
                        'booking_message','expedia_message','airbnb_message','ota_other',
                        'google_business','instagram_dm','facebook_messenger',
                        'direct_phone','walk_in','manual')),
  source_category     text generated always as (
                        case
                          when source in ('website_chat','website_form','whatsapp','email',
                                          'direct_phone','walk_in','google_business') then 'direct'
                          when source in ('booking_message','expedia_message',
                                          'airbnb_message','ota_other') then 'ota'
                          when source in ('instagram_dm','facebook_messenger') then 'social'
                          else 'manual'
                        end
                      ) stored,
  source_detail       text,                                   -- es. quale annuncio, quale numero, quale pagina
  guest_name          text,
  guest_contact       text,
  language            text not null default 'it',
  status              text not null default 'aperta'
                      check (status in ('aperta','in_attesa_staff','chiusa')),
  booking_request_id  uuid,  -- FK aggiunta dopo la creazione di booking_requests
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
comment on table public.conversations is
  'Thread di conversazione con un ospite. source dettagliato + source_category derivata (direct/ota/social/manual).';

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  property_id      uuid not null references public.properties(id) on delete cascade,
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  direction        text not null check (direction in ('in','out')),
  sender           text not null check (sender in ('guest','ai','staff')),
  content          text not null,
  ai_call_id       uuid,  -- FK aggiunta dopo la creazione di ai_calls
  created_at       timestamptz not null default now()
);
comment on table public.messages is
  'Singoli messaggi dentro una conversazione (il source si eredita dal thread).';

-- ----------------------------------------------------------------------------
-- 7. BOOKING REQUESTS (CUORE DEL SISTEMA) (R2)
-- ----------------------------------------------------------------------------

create table public.booking_requests (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  property_id          uuid not null references public.properties(id) on delete cascade,
  conversation_id      uuid references public.conversations(id) on delete set null,
  source               text not null default 'website_chat'
                       check (source in (
                         'website_chat','website_form','whatsapp','email',
                         'booking_message','expedia_message','airbnb_message','ota_other',
                         'google_business','instagram_dm','facebook_messenger',
                         'direct_phone','walk_in','manual')),
  source_category      text generated always as (
                         case
                           when source in ('website_chat','website_form','whatsapp','email',
                                           'direct_phone','walk_in','google_business') then 'direct'
                           when source in ('booking_message','expedia_message',
                                           'airbnb_message','ota_other') then 'ota'
                           when source in ('instagram_dm','facebook_messenger') then 'social'
                           else 'manual'
                         end
                       ) stored,
  source_detail        text,
  guest_name           text,
  guest_contact        text,
  language             text not null default 'it',
  check_in             date,
  check_out            date,
  adults               int check (adults >= 0),
  children             jsonb not null default '[]'::jsonb,    -- es. [{"age": 4}, {"age": 9}]
  special_requests     text,
  status               text not null default 'richiesta_ricevuta'
                       check (status in (
                         'richiesta_ricevuta','proposta_inviata','interessato',
                         'da_verificare','disponibilita_bloccata','in_attesa_pagamento',
                         'confermata','scaduta','rifiutata','cancellata')),
  priority             text not null default 'bassa'
                       check (priority in ('alta','media','bassa')),
  lead_score           int not null default 0 check (lead_score between 0 and 100),
  data_reliability     text check (data_reliability in ('alta','media','bassa')),
  gross_total_cents    int check (gross_total_cents >= 0),
  discount_pct         numeric(5,2) check (discount_pct >= 0),
  offer_total_cents    int check (offer_total_cents >= 0),
  city_tax_cents       int check (city_tax_cents >= 0),
  currency             text not null default 'EUR' check (char_length(currency) = 3),
  price_source         text check (price_source in ('csv','manual','ical','api','ota_stimato')),
  ai_classification    jsonb,                                 -- output grezzo del classificatore (audit)
  proposal_sent_at     timestamptz,
  interested_at        timestamptz,
  hold_expires_at      timestamptz,                           -- scadenza blocco 24h
  payment_received_at  timestamptz,
  offer_expires_at     timestamptz,                           -- validità dell'offerta
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);
comment on table public.booking_requests is
  'Richiesta di preventivo/prenotazione: entità centrale con stati, priorità, lead_score, affidabilità dati e source tracking dettagliato.';

-- FK differite (dipendenze circolari risolte)
alter table public.conversations
  add constraint conversations_booking_request_fk
  foreign key (booking_request_id) references public.booking_requests(id) on delete set null;

create table public.booking_request_items (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  booking_request_id  uuid not null references public.booking_requests(id) on delete cascade,
  room_id             uuid not null references public.rooms(id) on delete restrict,
  date                date not null,
  price_cents         int not null check (price_cents >= 0),
  created_at          timestamptz not null default now()
);
comment on table public.booking_request_items is
  'Dettaglio per camera/notte della proposta (snapshot dei prezzi al momento del calcolo).';

create table public.booking_request_events (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  booking_request_id  uuid not null references public.booking_requests(id) on delete cascade,
  from_status         text,
  to_status           text not null,
  actor               text not null check (actor in ('system','staff','guest')),
  note                text,
  created_at          timestamptz not null default now()
);
comment on table public.booking_request_events is
  'Audit trail: ogni transizione di stato, chi l''ha causata e quando.';

create table public.scoring_events (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  booking_request_id  uuid not null references public.booking_requests(id) on delete cascade,
  event               text not null,                          -- es. 'click_interessato', 'risposta_ricevuta'
  delta               int  not null,                          -- variazione punti
  created_at          timestamptz not null default now()
);
comment on table public.scoring_events is
  'Trasparenza sul lead_score: ogni evento e la variazione di punteggio che ha prodotto.';

-- ----------------------------------------------------------------------------
-- 8. TEMPLATE E FOLLOW-UP
-- ----------------------------------------------------------------------------

create table public.templates (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references public.organizations(id) on delete cascade,   -- NULL = template globale di default
  property_id  uuid references public.properties(id) on delete cascade,      -- NULL = valido per tutta l'org
  code         text not null,            -- es. 'proposta_disponibile', 'reminder_offerta', 'istruzioni_checkin'
  channel      text not null check (channel in ('email','whatsapp','web')),
  language     text not null default 'it',
  -- Se true, il template è sicuro per canali OTA (nessun IBAN, nessun link diretto)
  ota_safe     boolean not null default false,
  subject      text,
  body         text not null,            -- con variabili tipo {{guest_name}}, {{totale}}, {{scadenza}}
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
comment on table public.templates is
  'Template messaggi per codice, canale e lingua. Per source_category = ota il Template Selector usa solo template ota_safe.';

create table public.followup_rules (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  property_id     uuid not null references public.properties(id) on delete cascade,
  trigger_status  text not null,          -- stato che attiva la regola (es. 'proposta_inviata', 'confermata')
  delay_minutes   int  not null default 0 check (delay_minutes >= 0),
  template_code   text not null,
  conditions      jsonb not null default '{}'::jsonb,   -- es. {"solo_se_nessuna_risposta": true}
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.followup_rules is
  'Configurazione dei follow-up automatici e delle sequenze post-conferma, per stato trigger.';

create table public.followup_jobs (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  property_id         uuid not null references public.properties(id) on delete cascade,
  booking_request_id  uuid not null references public.booking_requests(id) on delete cascade,
  rule_id             uuid references public.followup_rules(id) on delete set null,
  due_at              timestamptz not null,
  status              text not null default 'pending'
                      check (status in ('pending','done','cancelled','failed')),
  executed_at         timestamptz,
  result              text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.followup_jobs is
  'Coda job schedulati: il cron legge solo i job scaduti (indice parziale su due_at). Scala a N strutture a costo costante.';

-- ----------------------------------------------------------------------------
-- 9. LAYER AI: LOG CHIAMATE E AUTO-LEARNING KB (R3)
-- ----------------------------------------------------------------------------

create table public.ai_calls (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references public.organizations(id) on delete set null,
  property_id    uuid references public.properties(id) on delete set null,
  function       text not null,           -- 'classify' | 'extract' | 'generate_reply' | 'select_template' | 'distill_kb'
  provider       text not null,           -- 'anthropic' | 'openai' | 'gemini'
  model          text not null,
  input_tokens   int,
  output_tokens  int,
  latency_ms     int,
  success        boolean not null default true,
  error          text,
  created_at     timestamptz not null default now()
);
comment on table public.ai_calls is
  'Log di ogni chiamata AI: costi, latenza, validità. Permette confronto tra provider e migrazione con un flag.';

alter table public.messages
  add constraint messages_ai_call_fk
  foreign key (ai_call_id) references public.ai_calls(id) on delete set null;

-- R3: coda proposte di apprendimento KB con ciclo di vita completo.
-- Flusso: cattura correzione/gap -> distillazione AI (Q&A canonica) ->
-- conflict check -> approvazione (secondo knowledge_learning_mode) -> pubblicazione.
create table public.kb_suggestions (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  property_id         uuid not null references public.properties(id) on delete cascade,
  message_id          uuid references public.messages(id) on delete set null,
  kind                text not null check (kind in ('correzione','gap')),
  original_text       text,               -- risposta AI errata, oppure domanda senza risposta
  corrected_text      text,               -- risposta corretta scritta dallo staff
  suggested_question  text,               -- output distillazione: domanda canonica
  suggested_answer    text,               -- output distillazione: risposta pulita
  language            text not null default 'it',
  conflict_asset_id   uuid references public.knowledge_assets(id) on delete set null,
  similarity          numeric(4,3),       -- 0.000-1.000: sovrapposizione con l'asset in conflitto
  status              text not null default 'proposta'
                      check (status in ('proposta','in_revisione','pubblicata','rifiutata')),
  created_by          uuid references auth.users(id),
  approved_by         uuid references auth.users(id),
  auto_approved       boolean not null default false,
  published_asset_id  uuid references public.knowledge_assets(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.kb_suggestions is
  'Coda di apprendimento KB: correzioni dello staff e gap (domande senza risposta) che diventano knowledge_assets, secondo knowledge_learning_mode della struttura.';

-- ----------------------------------------------------------------------------
-- 10. INDICI
-- ----------------------------------------------------------------------------

-- Tenant / RLS
create index idx_org_members_user        on public.org_members (user_id);
create index idx_properties_org          on public.properties (org_id);
create index idx_rooms_property          on public.rooms (property_id);
create index idx_rate_calendar_org       on public.rate_calendar (org_id);
create index idx_ical_feeds_room         on public.ical_feeds (room_id);
create index idx_ka_property             on public.knowledge_assets (property_id);
create index idx_ka_retrieval            on public.knowledge_assets (property_id, priority desc, updated_at desc)
  where deleted_at is null and usable_by_concierge = true;
create index idx_kav_asset               on public.knowledge_asset_versions (asset_id);
create index idx_ke_asset                on public.knowledge_embeddings (asset_id);
create index idx_ke_lookup               on public.knowledge_embeddings (property_id, model);
create index idx_conversations_property  on public.conversations (property_id, updated_at desc);
create index idx_conversations_source    on public.conversations (property_id, source_category);
create index idx_messages_conversation   on public.messages (conversation_id, created_at);
create index idx_bri_request             on public.booking_request_items (booking_request_id);
create index idx_bre_request             on public.booking_request_events (booking_request_id, created_at);
create index idx_scoring_request         on public.scoring_events (booking_request_id);
create index idx_templates_lookup        on public.templates (code, language, channel) where deleted_at is null;
create index idx_followup_rules_property on public.followup_rules (property_id) where active = true;
create index idx_ai_calls_created        on public.ai_calls (created_at);
create index idx_kb_suggestions_queue    on public.kb_suggestions (property_id, status, created_at desc);

-- Query critiche
-- (l'unique (room_id, date) su rate_calendar è già l'indice principale per i range)
create index idx_booking_requests_inbox   on public.booking_requests (property_id, status) where deleted_at is null;
create index idx_booking_requests_score   on public.booking_requests (property_id, lead_score desc) where deleted_at is null;
create index idx_booking_requests_created on public.booking_requests (property_id, created_at desc);
create index idx_booking_requests_source  on public.booking_requests (property_id, source_category);

-- Indici parziali per i cron (costo costante a qualunque scala)
create index idx_br_hold_expiry on public.booking_requests (hold_expires_at)
  where status = 'in_attesa_pagamento';
create index idx_br_offer_expiry on public.booking_requests (offer_expires_at)
  where status = 'proposta_inviata';
create index idx_followup_jobs_due on public.followup_jobs (due_at)
  where status = 'pending';

-- Ricerca full-text sulla knowledge base
create index idx_ka_fts on public.knowledge_assets
  using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,'')));

-- ----------------------------------------------------------------------------
-- 11. TRIGGER updated_at SU TUTTE LE TABELLE CHE LO HANNO
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','org_members','properties','rooms','rate_calendar',
    'ical_feeds','knowledge_assets','conversations','booking_requests',
    'templates','followup_rules','followup_jobs','kb_suggestions'
  ] loop
    execute format(
      'create trigger trg_%s_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 12. ROW LEVEL SECURITY (multi-tenant)
-- Il backend Next.js userà la service_role key (bypassa RLS) per la pipeline AI;
-- le query dal client passano da queste policy.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','org_members','properties','rooms','rate_calendar',
    'ical_feeds','knowledge_assets','knowledge_asset_versions','knowledge_embeddings',
    'conversations','messages','booking_requests','booking_request_items',
    'booking_request_events','scoring_events','templates','followup_rules',
    'followup_jobs','ai_calls','kb_suggestions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- organizations: visibile solo ai membri
create policy org_member_access on public.organizations
  for all using (public.user_in_org(id)) with check (public.user_in_org(id));

-- org_members: ogni utente vede le proprie membership e quelle della propria org
create policy org_members_access on public.org_members
  for all using (user_id = auth.uid() or public.user_in_org(org_id))
  with check (public.user_in_org(org_id));

-- Tutte le altre tabelle: accesso se membro dell'org (org_id denormalizzato ovunque)
do $$
declare t text;
begin
  foreach t in array array[
    'properties','rooms','rate_calendar','ical_feeds','knowledge_assets',
    'knowledge_asset_versions','knowledge_embeddings','conversations','messages',
    'booking_requests','booking_request_items','booking_request_events',
    'scoring_events','templates','followup_rules','followup_jobs','kb_suggestions'
  ] loop
    execute format(
      'create policy tenant_access_%s on public.%I
       for all using (public.user_in_org(org_id))
       with check (public.user_in_org(org_id))', t, t);
  end loop;
end $$;

-- ai_calls: org_id può essere null (chiamate di sistema) -> policy dedicata
create policy ai_calls_access on public.ai_calls
  for select using (org_id is not null and public.user_in_org(org_id));

-- templates globali (org_id null) leggibili da tutti gli utenti autenticati
create policy templates_global_read on public.templates
  for select using (org_id is null and auth.uid() is not null);

-- ----------------------------------------------------------------------------
-- 13. DATI PLACEHOLDER (nessun dato reale)
-- ----------------------------------------------------------------------------
insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Demo Organization');

insert into public.properties (id, org_id, name, city, knowledge_learning_mode, settings) values
  ('00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000001',
   'Struttura Demo A', 'Firenze', 'assisted',
   '{"sconto_diretto_pct": 10, "hold_hours": 24, "tassa_soggiorno_cents": 0,
     "freshness_alta_ore": 6, "freshness_media_ore": 48,
     "disclaimer": "La disponibilità non è ancora bloccata: questa è una proposta indicativa."}'::jsonb),
  ('00000000-0000-0000-0000-000000000012',
   '00000000-0000-0000-0000-000000000001',
   'Struttura Demo B', 'Firenze', 'assisted',
   '{"sconto_diretto_pct": 10, "hold_hours": 24, "tassa_soggiorno_cents": 0,
     "freshness_alta_ore": 6, "freshness_media_ore": 48,
     "disclaimer": "La disponibilità non è ancora bloccata: questa è una proposta indicativa."}'::jsonb);

insert into public.rooms (org_id, property_id, name, max_guests, sort_order) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','Camera Demo 1', 2, 1),
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','Camera Demo 2', 3, 2),
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012','Camera Demo 1', 2, 1);

insert into public.templates (org_id, property_id, code, channel, language, ota_safe, subject, body) values
  (null, null, 'proposta_disponibile', 'email', 'it', false,
   'Disponibilità per il tuo soggiorno — offerta diretta',
   'Gentile {{guest_name}}, abbiamo disponibilità dal {{check_in}} al {{check_out}} per {{ospiti}} ospiti. Totale offerta diretta: {{totale_offerta}} (sconto {{sconto_pct}}% rispetto ai portali). {{disclaimer}} L''offerta è valida fino al {{scadenza}}. Se interessato, rispondi "Sono interessato".'),
  (null, null, 'proposta_disponibile', 'email', 'en', false,
   'Availability for your stay — direct offer',
   'Dear {{guest_name}}, we have availability from {{check_in}} to {{check_out}} for {{ospiti}} guests. Direct offer total: {{totale_offerta}} ({{sconto_pct}}% off compared to online portals). {{disclaimer}} The offer is valid until {{scadenza}}. If interested, reply "I am interested".'),
  (null, null, 'proposta_disponibile_ota', 'web', 'it', true,
   null,
   'Gentile {{guest_name}}, abbiamo disponibilità dal {{check_in}} al {{check_out}} per {{ospiti}} ospiti. Totale: {{totale_offerta}}. {{disclaimer}} L''offerta è valida fino al {{scadenza}}. Se interessato, risponda a questo messaggio.');

-- NOTA POST-SIGNUP:
-- Dopo aver creato il tuo utente in Supabase Auth, collegalo all'organization demo:
-- insert into public.org_members (org_id, user_id, role)
-- values ('00000000-0000-0000-0000-000000000001', 'TUO-USER-UUID', 'owner');

-- ============================================================================
-- FINE MIGRAZIONE 0001 (DEFINITIVA)
-- ============================================================================
