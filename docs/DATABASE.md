# DATABASE

Fonte ufficiale per: schema dati, migrazioni, Row Level Security (RLS), funzioni/RPC, procedura di
applicazione delle migrazioni. Dettagli operativi dell'infrastruttura (progetto Supabase, pg_cron come
scheduler, Storage) → [INFRASTRUCTURE.md](INFRASTRUCTURE.md). Regole di processo → [../PROJECT_RULES.md](../PROJECT_RULES.md).

> **Legenda affermazioni** (vedi PROJECT_RULES §2): ✅ verificata (prova oggettiva) · ◐ dedotta · ○ ipotizzata.

## Motore e principi
- ✅ Postgres gestito da **Supabase**, **progetto unico** (id in [INFRASTRUCTURE.md](INFRASTRUCTURE.md)).
- ✅ Isolamento **multi-tenant via RLS**: ogni tabella applicativa ha `org_id` ed è protetta da una
  policy `using (public.user_in_org(org_id))`.
- ✅ Accesso applicativo:
  - **service-role** (client admin, server-side) → **bypassa RLS** (usato da poll, cron, job).
  - **anon/utente** (browser, server actions) → soggetto a RLS.

## Come si applicano le migrazioni (procedura ufficiale)
- ✅ **Manualmente, nel Supabase SQL Editor.** Nel repository **non** esiste tooling di migrazione
  (nessuna Supabase CLI, nessun `config.toml`/link progetto, nessun `db push`): verificato il 27/06/2026.
- ✅ **Regola vincolante**: una migrazione **non è "applicata" finché `to_regclass('public.<tabella>')`
  non la conferma** sul DB reale (PROJECT_RULES §1, §6). Mai assumerla dallo stato del repo o dal fatto
  che l'app "sembri funzionare" (gli errori possono essere ingoiati → vedi Fail-Fast).
- Procedura passo-passo → [RUNBOOKS/apply-migration.md](RUNBOOKS/apply-migration.md).
- ◐ Le migrazioni sono **idempotenti** (`create table/index if not exists`, policy in blocchi
  `do $$ … exception when duplicate_object then null`): rieseguirle non dà errore (dedotto dalla lettura
  dei file; non rieseguito su tutte).

## Stato delle migrazioni

| File | Contenuto (sintesi) | Stato applicazione |
|---|---|---|
| `schema.sql` | Schema base: 20 tabelle (org, properties, rooms, conversations, messages, booking_requests, knowledge_*, templates, followup_*, ai_calls, …) + funzioni `user_in_org`, `set_updated_at` | ✅ applicata (tabelle/funzioni esposte via PostgREST) |
| `0002_enum_en_seed_constraints` | Enum/constraint, seed, RPC `enroll_user_in_org` | ✅ applicata (RPC esposta) |
| `0003_booking_rpc` | RPC `transition_booking_request` (macchina a stati) | ✅ applicata (RPC esposta) |
| `0004_ai_pipeline` | `guardrail_events`, `ip_blocklist`, RPC `search_knowledge` | ✅ applicata (tabelle + RPC esposte) |
| `0005_notifications` | `notifications` | ✅ applicata (tabella esposta) |
| `0006_followups` | Funzioni `materialize_followup_jobs`/`process_due_followups` + **cron `vesta-followups`** (`*/5`) | ❌ **NON applicata al DB reale**: `process_due_followups()` **assente** (verificato via Reality Gate + `to_regprocedure`); il cron `vesta-followups` esiste ed è `succeeded` grazie alla **`0016`** (guard existence-check). Decisione se applicarla = **KI-12** (P2) |
| `0007_ical_cron` | **cron `vesta-ical-sync`** (`*/15`) → `/api/cron/ical-sync` | ◐ dedotta (estensione/migrazione presenti; job non verificato direttamente) |
| `0008_transition_interested_to_proposal` | Ridefinizione RPC `transition_booking_request` | ✅ applicata (RPC esposta) |
| `0009_email_poll_cron` | **cron `vesta-email-poll`** (`*/2`) → `/api/email/poll` | ✅ applicata · **RIATTIVATO** (canale email prod ripristinato — progetto Google ufficiale; run verificati; la sospensione del 27/06 è storica) |
| `0010_parsed_requests` | `booking_requests.parsed_requests` (multi-richiesta) | ◐ dedotta (colonna usata dal codice) |
| `0011_email_router` | `email_routing_log`, `ota_inbox`, `reservations_staging` | ✅ applicata e verificata 27/06/2026 (`to_regclass` + PostgREST) |
| `0012_pending_actions` | `pending_actions` (coda Tier 2) | ✅ applicata e verificata 27/06/2026 |
| `0013_document_center` | `document_center`, `accountant_exports` | ✅ applicata e verificata 27/06/2026 |
| `0014_operational_tasks` | `operational_tasks` + RPC `process_payment_expiry`/`process_operational_deadlines` (coda operativa) | ✅ applicata e verificata 30/06/2026 (KI-3 chiuso) |
| `0015_p0_2_rpc_hardening` | Hardening RPC `SECURITY DEFINER` (REVOKE `anon`/`authenticated`, guard `auth.uid()`, default privileges) | ✅ applicata e verificata 02/07/2026 (**P0-2 chiuso** — evidence in [SECURITY](SECURITY.md)) |
| `0016_fix_vesta_followups_cron` | Cron `vesta-followups` resiliente (guard `to_regprocedure` + sotto-blocco `EXCEPTION`; `process_operational_deadlines()` sempre eseguito) | ✅ applicata e verificata 12/07/2026 (**KI-11 chiuso** — run `succeeded`) |
| `0017_security_least_privilege` | Baseline least-privilege: REVOKE `CREATE` su `public`, EXECUTE allowlist (7 fn app, incl. `user_in_org`), REVOKE `TRUNCATE`/`TRIGGER`/`REFERENCES`, sequences minimizzate, default ACL default-deny (grantor `postgres`), fix policy `ip_blocklist`, `NOTIFY pgrst` | ✅ **applicata in produzione 28/08/2026** (WorkspaceOS Phone RED, transazione atomica, receipt ok, artefatto byte-identico — evidence in [SECURITY](SECURITY.md); verifica esterna read-only pendente: `app/scripts/0017-readonly-verification.sql`) |

> ✅ **29 tabelle** esposte via PostgREST al 27/06/2026 (verificato via OpenAPI). Storia dell'incidente
> "migrazioni 0011–0013 mai applicate" e relativo fix → [CHANGELOG.md](CHANGELOG.md), [DECISIONS.md](DECISIONS.md).

## Tabelle per dominio (29) — fonte di origine

**Core tenant** (`schema.sql`): `organizations`, `org_members`, `properties`.
**Operations / camere** (`schema.sql`): `rooms`, `rate_calendar`, `ical_feeds`.
**Knowledge base** (`schema.sql` + `0004`): `knowledge_assets`, `knowledge_asset_versions`,
`knowledge_embeddings`, `kb_suggestions`.
**Front Office / conversazioni** (`schema.sql`): `conversations`, `messages`.
**Booking** (`schema.sql`): `booking_requests`, `booking_request_items`, `booking_request_events`,
`scoring_events`; (`0010`) colonna `parsed_requests`.
**Comunicazione / template / follow-up** (`schema.sql`): `templates`, `followup_rules`, `followup_jobs`.
**AI / sicurezza** (`schema.sql` + `0004`): `ai_calls`, `guardrail_events`, `ip_blocklist`.
**Notifiche** (`0005`): `notifications`.
**Canale email / Router L0** (`0011`): `email_routing_log`, `ota_inbox`, `reservations_staging`.
**Fase B / Tier 2** (`0012`): `pending_actions`.
**Back Office / Document Center** (`0013`): `document_center`, `accountant_exports`.

## RLS (Row Level Security)
- ✅ Funzione `public.user_in_org(p_org uuid)` definita in `schema.sql`: vero se l'utente corrente
  appartiene all'org.
- ✅ Pattern policy su ogni tabella applicativa: `for all using (public.user_in_org(org_id)) with check
  (public.user_in_org(org_id))`.
- ✅ Il **service-role bypassa RLS**: i percorsi server (poll, cron, ingest) scrivono comunque; le
  policy proteggono gli accessi via anon/utente.

## Funzioni / RPC
- ✅ Esposte via PostgREST (verificato OpenAPI): `user_in_org`, `enroll_user_in_org`,
  `transition_booking_request`, `search_knowledge`.
- `set_updated_at` (trigger), `materialize_followup_jobs`, `process_due_followups` (interne, usate da cron).

## Scheduler (pg_cron) — riepilogo
Tre job creati via migrazione (dettagli operativi e stato → [INFRASTRUCTURE.md](INFRASTRUCTURE.md)):
`vesta-followups` (`*/5`, 0006), `vesta-ical-sync` (`*/15`, 0007), `vesta-email-poll` (`*/2`, 0009,
**sospeso**). Chiamano endpoint dell'app via `pg_net`.

## Storage
- ✅ Bucket privato **`documents`** (creato 27/06/2026) per i PDF del Document Center.
  Dettagli → [INFRASTRUCTURE.md](INFRASTRUCTURE.md).

## Accesso dal codice
- ✅ Tipi generati in `app/src/lib/supabase/database.types.ts`.
- ✅ Escape hatch documentato per le tabelle non ancora nei tipi generati: cast
  `const db = (sb) => sb as unknown as SupabaseClient` (usato per `email_routing_log`, `ota_inbox`,
  `reservations_staging`, `pending_actions`, `document_center`, `accountant_exports`).
- ✅ **Fail-Fast**: ogni scrittura/lettura controlla `.error` (PROJECT_RULES §4) — vedi
  [ARCHITECTURE.md](ARCHITECTURE.md) per l'helper `dbThrow`.

---

# Manuale del database (convenzioni & evoluzione)

Questa parte è il **riferimento ufficiale per far evolvere lo schema**, non solo per descriverlo.
Le convenzioni qui sotto sono **osservate dallo schema reale** (✅) e diventano lo **standard** del
progetto. Vale Product First (PROJECT_RULES): lo schema segue il prodotto, non viceversa.

## Filosofia dello schema
- **Additivo e reversibile**: si aggiunge, non si distrugge (vedi policy modifiche distruttive).
- **Multi-tenant by design**: ogni tabella applicativa ha `org_id` e una policy RLS `user_in_org`.
- **Nessuna automazione che scavalchi i tier**: lo schema accumula/stage-a i dati (es.
  `reservations_staging`), ma le azioni irreversibili restano Human-in-the-Loop.
- **Auditabilità**: tabelle-evento/log dove serve tracciare (`booking_request_events`,
  `email_routing_log`, `ai_calls`, `guardrail_events`).

## Convenzioni di naming (✅ osservate dallo schema)
- Tabelle: **snake_case, plurale** (`booking_requests`, `email_routing_log`).
- PK: **`id uuid primary key default gen_random_uuid()`**.
- FK tenant: **`org_id`** (sempre), **`property_id`** (quasi sempre) → `references organizations/properties`.
- Timestamp: **`created_at timestamptz not null default now()`**; aggiornamento via trigger
  `set_updated_at` dove presente `updated_at`.
- Soft-delete: colonna **`deleted_at timestamptz`** (le query filtrano `is('deleted_at', null)`); **mai**
  `DELETE` fisico di dati di dominio.
- "Enum" come **`text` + `CHECK (col in (...))`** (no tipi enum nativi) — facile da estendere.
- Dedup/idempotenza: **`unique (property_id, <chiave>)`** (es. `gmail_message_id`).
- Dati semi-strutturati: **`jsonb`** (`settings`, `raw_headers`, `parsed_requests`, `attachments`).

## Come progettare una nuova migrazione
1. File `supabase/migrations/NNNN_nome_snake.sql`, numerazione **progressiva** dopo l'ultima.
2. **Additiva e idempotente**: `create table if not exists`, `create index if not exists`, policy in
   `do $$ begin … exception when duplicate_object then null; end $$`.
3. Includere sempre: colonne tenant (`org_id`/`property_id`), `created_at`, **RLS** (`enable row level
   security` + policy `tenant_access_*` con `user_in_org`), **indici** per le query note, FK con
   `on delete` appropriato.
4. Aggiornare i tipi: `app/src/lib/supabase/database.types.ts` (o documentare l'escape hatch se non
   ancora tipizzata).
5. **Una sola migrazione funzionale per volta** (PROJECT_RULES §6/§9).

## Ordine corretto delle migrazioni
- Si applicano **in ordine di numero** rispettando i prerequisiti (es. una FK richiede prima la tabella
  referenziata; una policy richiede `user_in_org`, definita in `schema.sql`).
- Non saltare numeri; non applicare una migrazione prima dei suoi prerequisiti.

## Come applicare e come verificare
- **Applicazione**: Supabase SQL Editor (procedura → [RUNBOOKS/apply-migration.md](RUNBOOKS/apply-migration.md)).
- **Verifica (obbligatoria, PROJECT_RULES §1/§6)**:
  - Tabelle: `select to_regclass('public.<tabella>');` → non `NULL`.
  - Colonne: `select column_name from information_schema.columns where table_name='<t>';`
  - Indici: `select indexname from pg_indexes where tablename='<t>';`
  - Policy/RLS: `select polname from pg_policies where tablename='<t>';`
  - **Esposizione REST**: confermare che la tabella sia raggiungibile via PostgREST (l'app usa l'API
    REST, non SQL diretto) — di norma Supabase ricarica lo schema cache dopo la DDL; verificare comunque.

## Errori da evitare
- ❌ **Assumere applicata** una migrazione senza `to_regclass` (causa dell'incidente del 27/06 → [CHANGELOG.md](CHANGELOG.md)).
- ❌ **Dimenticare RLS** su una nuova tabella tenant.
- ❌ **Ignorare `.error`** nel codice che la usa (Fail-Fast, PROJECT_RULES §4).
- ❌ **Più migrazioni funzionali insieme** (perdita di tracciabilità della verifica).
- ❌ **Modifiche distruttive** non necessarie (vedi sotto).

## Backward compatibility
- Default **additivo**: nuove colonne **nullable** o con `default`; nuove tabelle non rompono nulla.
- **Non** rinominare/eliminare colonne o tabelle in uso dal codice in produzione: prima deprecare
  (smettere di usarle nel codice), poi eventualmente rimuovere in una migrazione successiva dedicata.
- Mantenere stabili i nomi referenziati da PostgREST e da `database.types.ts`.

## Policy sulle modifiche distruttive
- `DROP`, rinomina, cambio di tipo, rimozione di constraint = **eccezionali**.
- Richiedono: decisione esplicita registrata in [DECISIONS.md](DECISIONS.md), valutazione di impatto,
  piano di rollback, e — sul DB del pilota — **approvazione umana** (Human-in-the-Loop, PROJECT_RULES §5).
- Preferire sempre **soft-delete** e migrazioni additive.

## Relazione database ↔ codice ↔ documentazione
- Una modifica allo schema **non è completata** finché non sono allineati tutti e tre:
  **DB reale** (migrazione applicata+verificata) · **codice** (`database.types.ts`/accesso) ·
  **documentazione** (questo file + eventuali doc collegate). È la Definition of Done applicata al DB
  (PROJECT_RULES §1, §7).

> Struttura del documento: la parte **Current State** è "Stato delle migrazioni / Tabelle / RLS / RPC /
> Storage"; questo **Manuale del database** è la parte **Guiding Principles**.

---

## Future Evolution
*Coerenti coi principi; non roadmap.*
- Tooling di migrazione versionato (oggi manuale via SQL Editor) se cresce il numero di ambienti.
- Retrieval semantico → uso reale di `knowledge_embeddings` (oggi presente ma non interrogata, vedi [KNOWLEDGE.md](KNOWLEDGE.md)).
- Nuove tabelle per Back Office Assistant (scadenze, riconciliazione) sullo stesso modello additivo+RLS.

## Related Documents
- [../PROJECT_RULES.md](../PROJECT_RULES.md) — Definition of Done, Migrazioni verificate, Fail-Fast
- [INFRASTRUCTURE.md](INFRASTRUCTURE.md) — progetto Supabase, pg_cron, Storage
- [ENVIRONMENT.md](ENVIRONMENT.md) — variabili e accesso Supabase (service-role vs anon)
- [ARCHITECTURE.md](ARCHITECTURE.md) — helper `dbThrow`, modello canonico + adapter
- [RUNBOOKS/apply-migration.md](RUNBOOKS/apply-migration.md) — procedura di applicazione/verifica
- [CHANGELOG.md](CHANGELOG.md) · [DECISIONS.md](DECISIONS.md) — incidente migrazioni e decisioni
