# AI Concierge & Direct Quote — Dev Plan

> Versione 0.2 — 12 giugno 2026
> Piano tecnico per le Fasi 0–1 della [roadmap](roadmap.md), allineato allo schema reale (`supabase/schema.sql`). Nessuna installazione viene eseguita senza conferma.

## 1. Stack tecnologico

| Livello | Scelta | Motivazione |
|---|---|---|
| Frontend + API | **Next.js (App Router) + React + TypeScript + Tailwind CSS** | Un progetto per dashboard, web chat pubblica e API route |
| Backend / DB | **Supabase** (Postgres + pgvector, Auth, RLS, Storage, Realtime) | Già configurato; schema 0001 applicato |
| AI | **Anthropic Claude** via `@anthropic-ai/sdk` | Conversazione, classificazione, estrazione; lo schema è provider-agnostic (`ai_calls.provider`) quindi il provider è sostituibile |
| Scheduler | **Vercel Cron** (proposta) o `pg_cron` su Supabase | Richiesto dallo schema: `followup_jobs.due_at`, scadenze hold/offerta (indici parziali già pronti) |
| Hosting | Vercel (proposta, da confermare) | Integrazione nativa Next.js |

### Modelli Claude (prezzi correnti, giugno 2026)

| Funzione (→ `ai_calls.function`) | Modello (ID esatto) | Prezzo in/out per 1M token |
|---|---|---|
| `generate_reply` — risposta conversazionale all'ospite | `claude-sonnet-4-6` | $3 / $15 |
| `classify` / `extract` — intento, date, ospiti, lingua | `claude-haiku-4-5` | $1 / $5 |
| `select_template` — scelta template per stato/canale | `claude-haiku-4-5` | $1 / $5 |
| `distill_kb` — distillazione correzioni/gap in Q&A (Fase 2) | `claude-sonnet-4-6` | $3 / $15 |
| Casi complessi (opzionale, configurabile) | `claude-opus-4-8` | $5 / $25 |

Linee guida d'integrazione:
- `thinking: {type: "adaptive"}` sulle chiamate conversazionali; streaming verso la chat.
- **Prompt caching** su system prompt + KB della property (`cache_control: {type: "ephemeral"}`): la KB è stabile per property → ~90% di risparmio sull'input dalle richieste successive.
- `extract` con **structured outputs** (`output_config.format` + JSON schema) per date/ospiti/bambini → output validato che alimenta `booking_requests` e `ai_classification`.
- **Ogni chiamata viene loggata in `ai_calls`** (function, provider, model, token, latenza, errore): è il contatore dei costi dal giorno 1.
- **Regola non negoziabile: i prezzi non passano mai dall'AI.** Il calcolo proposta legge `rate_calendar` via codice; l'AI riceve il totale già calcolato e lo presenta.

## 2. Architettura (MVP)

```
Ospite ── Web chat pubblica /c/[property]
                 │
                 ▼
        API Route Next.js ───── classify/extract (Haiku) ──► Anthropic API
                 │                generate_reply (Sonnet)
                 │
                 ├──► Motore preventivo (TypeScript puro):
                 │      rate_calendar → prezzo, sconto, tassa, affidabilità
                 │      → booking_requests + items + events + scoring
                 ▼
             Supabase (Postgres + RLS, Auth, Storage, Realtime)
                 ▲                                   ▲
                 │                                   │
Gestore ── Dashboard autenticata          Cron ── followup_jobs,
           (inbox, tariffe, KB,                   hold/offer expiry,
            template, impostazioni)               sync iCal
```

Punti chiave:
- Chiavi Anthropic e `service_role` **solo lato server**. La pipeline AI e le scritture della chat pubblica usano la service role key (bypassa RLS, come previsto dal commento §12 dello schema) **sempre con filtro esplicito su `org_id`/`property_id`**.
- Le query della dashboard passano dal client Supabase autenticato → RLS (`user_in_org`).
- Realtime per inbox e conversazioni live.

## 3. Struttura del repository (target)

```
AI - Concierge/
├── app/                          # Next.js (da creare — richiede conferma)
│   └── src/
│       ├── app/
│       │   ├── (dashboard)/      # inbox, richieste, tariffe, KB, template, settings
│       │   ├── c/[property]/     # web chat pubblica
│       │   └── api/              # chat, quote, webhooks, cron handlers
│       ├── components/
│       └── lib/
│           ├── supabase/         # client browser/server, tipi generati
│           ├── ai/               # client anthropic, prompt, schemi extract, logging ai_calls
│           └── quote/            # motore preventivo, macchina a stati, scoring
├── supabase/
│   ├── schema.sql                # migrazione 0001 (applicata — non si modifica)
│   └── migrations/               # 0002+ (vedi §9)
└── docs/
```

## 4. Modello dati (reale — riepilogo)

Schema 0001: **20 tabelle**, RLS su tutte, trigger `updated_at`, soft-delete (`deleted_at`), estensioni `pgcrypto` + `vector`.

| Area | Tabelle | Note |
|---|---|---|
| Tenant | `organizations`, `org_members`, `properties` | Due livelli: org (billing, utenti) → properties (strutture). Ruoli: owner/manager/staff. `properties.settings` (jsonb) porta la config commerciale; `supervision_mode`, `knowledge_learning_mode` |
| Inventario | `rooms`, `rate_calendar`, `ical_feeds` | Una riga per camera/giorno: prezzo (cents), disponibilità, min_stay, restrizioni, source. iCal = sola disponibilità |
| Knowledge base | `knowledge_assets`, `knowledge_asset_versions`, `knowledge_embeddings`, `kb_suggestions` | Asset tipizzati con origin/priority/supersedes; versioning immutabile; embeddings = cache rigenerabile provider-agnostic (non usata nell'MVP); kb_suggestions = coda auto-learning (Fase 2) |
| Conversazioni | `conversations`, `messages` | 14 source + `source_category` generata (direct/ota/social/manual); stati aperta/in_attesa_staff/chiusa; `messages.ai_call_id` collega risposta AI al log |
| Direct Quote | `booking_requests`, `booking_request_items`, `booking_request_events`, `scoring_events` | Entità centrale: 10 stati, priorità, lead_score 0–100, data_reliability, prezzi in cents, hold/offer expiry; items = snapshot prezzi; events = audit; scoring = trasparenza punteggio |
| Messaggistica | `templates`, `followup_rules`, `followup_jobs` | Template per codice/canale/lingua con flag `ota_safe`; regole per stato trigger; coda job per il cron |
| AI ops | `ai_calls` | Log costi/latenza per chiamata, provider-agnostic |

### RLS
- Funzione `user_in_org(org_id)` (security definer) + policy `FOR ALL` su tutte le tabelle, `org_id` denormalizzato ovunque.
- Casi speciali: `ai_calls` sola lettura per i membri; `templates` globali (`org_id NULL`) leggibili da tutti gli autenticati.
- Limite noto: le policy non distinguono i ruoli (uno `staff` può tutto come un `owner`) → migrazione futura, vedi §9.

## 5. Piano di lavoro dettagliato

### Fase 0 — Fondamenta
1. ~~`git init` + `.gitignore`~~ ✅ — ~~rinomina `supabase/`~~ ✅ — ~~schema versionato~~ ✅
2. Scaffold Next.js in `app/` (TypeScript, Tailwind, ESLint) — **richiede conferma: installazione**.
3. `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`.
4. Generazione tipi TypeScript dallo schema (`supabase gen types` o equivalente).
5. Bucket Storage `knowledge-files` + policy (path per org/property).
6. Migrazione 0002 (vedi §9): seed separato, automazione signup→org_members, vincoli mancanti.

### Fase 1 — MVP (sequenza 1a → 1d, dettaglio nella roadmap)
7. Client Supabase (browser/server) + middleware auth + layout dashboard.
8. Onboarding org/property; gestione membri.
9. CRUD KB (asset + upload Storage + versioning automatico in `knowledge_asset_versions`).
10. CRUD camere; editor calendario tariffe; import CSV; cron sync iCal.
11. `lib/ai`: client Anthropic, prompt builder (system + KB cached + storico), wrapper con logging `ai_calls`.
12. `/api/chat`: pipeline classify (Haiku) → se richiesta disponibilità: extract (structured output) → motore preventivo → proposta via template; altrimenti generate_reply (Sonnet) grounded sulla KB. Streaming + persistenza.
13. `lib/quote`: macchina a stati `booking_requests` (transizioni valide + `booking_request_events`), calcolo prezzo/sconto/tassa da `rate_calendar`, `data_reliability` da freshness, snapshot `booking_request_items`.
14. Lead scoring: eventi → `scoring_events` → aggiornamento `lead_score`.
15. Follow-up: materializzazione `followup_rules` → `followup_jobs`; endpoint cron (hold expiry, offer expiry, job pending).
16. Web chat pubblica `/c/[property]` con flusso "Sono interessato".
17. Dashboard: inbox richieste (priorità/score) + conversazioni realtime + azioni di stato; viste tariffe/KB/template/settings.
18. Test: unit su motore preventivo e macchina a stati (transizioni illegali), test RLS cross-tenant, smoke e2e chat→proposta→confermata.
19. Deploy Vercel + cron config + pilot.

## 6. Sicurezza

- RLS attiva su tutte le 20 tabelle e testata cross-tenant; il client non riceve mai la service role key.
- Endpoint pubblici (chat) con rate limiting per IP/conversazione; endpoint cron protetti da `CRON_SECRET`.
- Prompt injection: istruzioni di sistema separate dal contenuto utente; la KB è l'unica fonte di verità testuale; **prezzi e disponibilità calcolati solo via codice**.
- Compliance OTA: per `source_category = 'ota'` il template selector usa esclusivamente template `ota_safe` (vincolo applicativo, già previsto dallo schema).
- GDPR: dati ospite minimi (`guest_name`, `guest_contact`), soft-delete ovunque, retention da definire prima del lancio.

## 7. Stima costi AI (ordine di grandezza)

Per richiesta con preventivo: 1× classify + 1× extract (Haiku, ~2–5K token) + 2–6 risposte conversazionali (Sonnet, KB cached) → **~$0,05–0,15 per richiesta**. Conversazione solo-FAQ: ~$0,02–0,08. Da verificare con dati reali: `ai_calls` fornisce la misura esatta dal primo giorno (token × prezzo per modello).

## 8. Decisioni aperte

- [ ] Scheduler: Vercel Cron vs `pg_cron` (dipende dall'hosting).
- [ ] Hosting: Vercel vs alternativa.
- [ ] Notifiche gestore MVP: solo email o anche push?
- [ ] Estrazione testo PDF per la KB nell'MVP (gli asset `pdf`/`brochure` hanno `file_path` + `content`): parsing automatico o copia-incolla manuale del testo?
- [x] **Valori enum: deciso (12/06/2026) — enum e valori interni in inglese, traduzioni solo in UI.** Lo schema 0001 ha valori italiani (`'aperta'`, `'richiesta_ricevuta'`, `'alta'`…): la conversione va fatta nella migrazione 0002, prima che esistano dati di produzione (vedi §9).
- [ ] Provider embedding per la Fase 2 (Anthropic non offre embeddings: OpenAI `text-embedding-3-*` o Voyage) — non blocca l'MVP.

## 9. Backlog migrazioni (0002+) — senza toccare la 0001

Dal report di analisi schema↔docs; nessuna è bloccante per iniziare:

| Migrazione | Contenuto | Quando |
|---|---|---|
| 0002 | **Conversione valori enum da italiano a inglese** (status, priority, origin, actor, ecc. — decisione del 12/06/2026, da fare prima dei dati di produzione); estrazione seed demo in `seed.sql`; trigger/flusso signup→`org_members`; unique su `templates (org_id, property_id, code, channel, language)`; check `check_out > check_in` su `booking_requests` | Fase 0 |
| 0003 | `conversations.assigned_to`; `messages.metadata` jsonb + ID messaggio esterno + stato consegna (per WhatsApp/email) | Inizio Fase 2 |
| 0004 | Policy RLS differenziate per ruolo (owner/manager/staff) | Fase 3, prima del multi-utente self-service |

## Documenti correlati

- [Product Brief](product-brief.md)
- [Roadmap](roadmap.md)
- Schema database: `supabase/schema.sql`
