# AI Concierge & Direct Quote — Dev Plan

> Versione 0.13 — 13 giugno 2026 (C07 = Auth Completion, C08 = Property Settings ufficializzati; aggiunta tabella commit §5.1)
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
- **LunArt Voice nel system prompt**: il tono ufficiale ([docs/lunart-voice.md](lunart-voice.md)) è incorporato come sezione stabile del system prompt conversazionale (→ prompt caching) e vincola anche tutti i template seed (proposta, follow-up, conferma, escalation, ack). Zero emoji salvo l'eccezione di mirroring definita nella policy; checklist QA in §8 del documento voice.

### Pricing dinamico — `rate_calendar` è uno snapshot operativo, non una verità

Non esiste un listino stagionale fisso: il prezzo cambia anche ogni giorno (camere invendute, last minute, promozioni sui portali, offerte Booking/Expedia, ritocchi manuali dello staff). Implicazioni tecniche:

- **Semantica snapshot**: `rate_calendar` rappresenta "l'ultimo prezzo noto", con provenienza in `source` (`manual`/`csv`/`ical`/`api`) e recency in `updated_at`. Il motore preventivo lo usa così com'è, ma non lo presume corretto.
- **Trasparenza obbligatoria su ogni proposta**: la UI (gestore E ospite) espone sempre ① fonte prezzo (`booking_requests.price_source`, incluso `ota_stimato`), ② ultimo aggiornamento tariffe del range richiesto, ③ affidabilità prezzo/disponibilità (`data_reliability`, derivata dalle soglie freshness in `properties.settings`).
- **Override staff sempre possibile prima del blocco**: lo staff può modificare prezzo totale/sconto/offerta dal dettaglio richiesta finché la camera non è bloccata (e in supervisione anche prima dell'invio). L'override aggiorna `offer_total_cents`/`discount_pct`, viene tracciato in `booking_request_events` (actor `staff`, nota) e ricalcola lo snapshot `booking_request_items`.
- **Affidabilità bassa ⇒ frizione intenzionale**: con tariffe stantie o prezzi mancanti la proposta automatica non parte (va in bozza/escalation, vedi ui-mvp-plan §7 Fase C); il disclaimer in card è rafforzato.
- I feed iCal restano sola disponibilità (mai prezzi); le offerte attive sui portali entrano o a mano o via `api`/`ota_stimato` in fasi successive.

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
| Knowledge base | `knowledge_assets`, `knowledge_asset_versions`, `knowledge_embeddings`, `kb_suggestions` | **Specifica completa: [Property Knowledge System](property-knowledge-system.md)** (fonte unica di verità, categorie via tags, separazione dati strutturati/testo, ciclo di vita, retrieval, igiene). Asset tipizzati con origin/priority/supersedes; versioning immutabile; embeddings = cache rigenerabile (non usata nell'MVP); kb_suggestions = coda auto-learning (Fase 2) |
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
4. ~~Generazione tipi TypeScript dallo schema (`supabase gen types` o equivalente).~~ ✅

   > **Nota tecnica C03 (13/06/2026):** C03 generated from local SQL schema because Supabase CLI was not configured against the remote project. After applying migrations 0001 and 0002 to the remote Supabase instance, `database.types.ts` should be regenerated using the official Supabase CLI and compared against the handcrafted version.
5. Bucket Storage `knowledge-files` + policy (path per org/property).
6. Migrazione 0002 (vedi §9): seed separato, automazione signup→org_members, vincoli mancanti.

### Fase 0 — Sequenza commit (piano ufficiale al 13/06/2026)

| Commit | Scope | Stato |
|---|---|---|
| C01 | Scaffold Next.js + TypeScript + Tailwind in `app/` | ✅ done |
| C02 | Auth guard: `proxy.ts`, client Supabase browser/server, layout dashboard base | ✅ done |
| C03 | Tipi TypeScript da schema locale (`database.types.ts`) | ✅ done |
| C04 | Auth callback `/api/auth/callback`: PKCE exchange, check `org_members`, redirect | ✅ done |
| C05 | Onboarding wizard (3 step): `createOrg` via service role, `createProperty`, `finalizeOnboarding` | ✅ done |
| C06 | Login flow: `login()` con org check, `signup()` con `emailRedirectTo`, pagina login 3 stati | ✅ done |
| **C07** | **Auth Completion**: `forgotPassword`, `/reset-password`, `updateUser()`, fix SB-01, proxy update | ⏳ in design |
| **C08** | **Property Settings**: `/settings/property`, Server Actions per `properties` + `settings` jsonb | 🔜 dopo C07 |

### Fase 1 — MVP (sequenza 1a → 1d, dettaglio nella roadmap)
7. Client Supabase (browser/server) + middleware auth + layout dashboard.
8. Onboarding org/property; gestione membri.
9. CRUD KB (asset + upload Storage + versioning automatico in `knowledge_asset_versions`).
10. CRUD camere; editor calendario tariffe; import CSV; cron sync iCal.
11. `lib/ai`: client Anthropic, prompt builder (system + KB cached + storico), wrapper con logging `ai_calls`.
12. `/api/chat`: **pipeline knowledge-first (§7.1)** — guard-rail input → euristiche spam → intenti deterministici → match FTS sulla KB → solo poi classify (Haiku) con **intent detection a 8 categorie (§7.1-bis)** e instradamento per ramo: `booking` → extract (structured output) → motore preventivo → proposta via template; `faq`/`guest_support` → generate_reply (Sonnet) grounded sulla KB; `partnership`/`vendor` → ack template + inbox dedicata; `saas_lead` → ack template + inbox Lead SaaS (priorità alta) + notifica piattaforma; `spam` → archivio; `unclassified` → chiarimento template. Streaming + persistenza. Include: check budget/safe mode, logging `guardrail_events`, alert (§7.4).
13. `lib/quote`: macchina a stati `booking_requests` (transizioni valide + `booking_request_events`), calcolo prezzo/sconto/tassa da `rate_calendar`, `data_reliability` da freshness, snapshot `booking_request_items`, **override prezzo/offerta da parte dello staff prima del blocco** (tracciato in `booking_request_events`, vedi §1 Pricing dinamico).
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

## 7. Cost Control & Anti Abuse

Principio architetturale: **knowledge-first** — l'AI è l'ultimo livello della pipeline, non il primo. Vista UX in [ui-mvp-plan §8](ui-mvp-plan.md).

### 7.1 Pipeline di risposta (ordine obbligatorio)

1. **Guard-rail input** (middleware, zero AI): lunghezza max messaggio (1.000 char), rate limit per IP (20 msg/min; 5 nuove conversazioni/h), limite messaggi per sessione (30/conversazione/giorno), check safe mode e budget residuo. Implementazione MVP: contatori su Postgres (nessuna infrastruttura aggiuntiva); valutare store dedicato solo se i volumi lo richiedono.
2. **Euristiche spam deterministiche** (zero AI): blacklist link/pattern, testo ripetuto, IP già segnalato → archiviazione diretta senza alcuna chiamata AI (vedi §7.1-bis, categoria Spam).
3. **Intenti deterministici** (zero AI): bottoni e azioni strutturate (es. "Sono interessato") gestiti da codice + template.
4. **Match KB full-text** (zero AI): query su `idx_ka_fts` (già nello schema); sopra la soglia di confidenza si risponde direttamente dall'asset KB (eventualmente via template). Le FAQ ad alta priorità (origin correzione/gap) vincono.
5. **AI** solo se i livelli precedenti non bastano: `classify` (Haiku) determina **prima l'intent** (§7.1-bis) e solo nel ramo "prenotazione" si prosegue con `extract` (Haiku, structured output); `generate_reply` (Sonnet, KB cached) solo per i rami che prevedono risposta generativa.

Metrica di controllo: % risposte servite senza AI (esposta in dashboard D12; atteso 30–50% a regime).

### 7.1-bis Intent detection — passaggio obbligatorio a inizio conversazione

Ogni nuova conversazione (e ogni messaggio che può cambiare contesto) viene classificata **prima** di qualsiasi altra elaborazione. Obiettivo: **non trattare ogni messaggio come una richiesta di prenotazione** — solo l'intent `booking` entra nel flusso Direct Quote. L'intent è persistito sulla conversazione (migrazione 0003: `conversations.intent` + `intent_confidence`) e riclassificabile se la conversazione cambia natura.

Categorie MVP (valori interni in inglese, etichette IT in UI):

| # | Intent | Come viene riconosciuta | Flusso | Booking request | Staff | Risposta automatica |
|---|---|---|---|---|---|---|
| 1 | `booking` (Prenotazione) | Date/n. ospiti nel testo (pattern deterministici) + `classify` Haiku su lessico di disponibilità ("avete posto", "quanto costa dal…") | **Unico ingresso al Direct Quote**: extract → motore preventivo → proposta | **Sì** (unica categoria) | Solo per supervisione o affidabilità bassa | Sì (proposta, o richiesta dei dati mancanti) |
| 2 | `faq` (Informazioni soggiorno / FAQ) | Domanda informativa senza intento di prenotare; spesso risolta già dal match FTS (livello 4, zero AI) | Knowledge-first: risposta dalla KB; `generate_reply` solo se il FTS non basta | No | Solo escalation se la KB non ha risposta | Sì |
| 3 | `guest_support` (Assistenza ospite già prenotato) | Riferimenti a prenotazione esistente ("ho prenotato", codice, date imminenti/in corso) + match `guest_contact` con una booking request confermata | Risposta KB per info standard (check-in, parcheggio); per richieste operative → escalation con contesto e **link alla booking request esistente** | No (collega all'esistente) | Spesso sì (notifica prioritaria) | Sì per le info standard |
| 4 | `partnership` (Partnership / Agenzie / TO) | Lessico B2B ("agenzia", "tour operator", "collaborazione", "tariffe gruppi"), email aziendali | Ack di cortesia via template → **inbox dedicata Partnership** | No | Sì (valutazione umana) | Solo ack template (zero AI generativa) |
| 5 | `vendor` (Commerciale / Venditori) | Pitch di vendita, link promozionali, "offriamo servizi/visibilità" | Ack breve template o nessuna risposta (configurabile) → **inbox Commerciale** | No | Opzionale (review batch) | Solo template (zero AI) |
| 6 | `saas_lead` (Interesse prodotto / Gestore struttura) | Messaggi rivolti **al software, non al soggiorno**: "che assistente è questo?", "sono un gestore / ho un B&B e vorrei un sistema così", lessico da operatore ricettivo (proprietario, hotel manager, affittacamere, casa vacanze) senza date/ospiti | Ack di cortesia via template con contatto/link commerciale AI Concierge → **inbox dedicata "Lead SaaS"** con **priorità alta** + notifica al team piattaforma | No | **Sì, prioritario** (è un potenziale cliente del SaaS) | Solo ack template (zero AI generativa) |
| 7 | `spam` (Spam) | **Prima dell'AI**: euristiche deterministiche (livello 2 pipeline — blacklist, link sospetti, testo ripetuto, rate anomalo da IP); `classify` solo nei casi ambigui | Archiviazione automatica, nessuna risposta; alimenta i contatori anti-abuse; IP bloccabile | No | No (tab Spam consultabile) | Nessuna (zero token AI dove possibile) |
| 8 | `unclassified` (Non classificato) | Confidenza `classify` sotto soglia | **Domanda di chiarimento** via template con quick reply ("Vuoi un preventivo o informazioni sul soggiorno?") → riclassificazione alla risposta; dopo 2 tentativi falliti → escalation staff | No (finché non chiarito) | Solo dopo tentativi falliti | Sì (chiarimento da template, zero AI) |

Regole trasversali:
- **Solo `booking` genera una `booking_request`.** Tutti gli altri intent vivono come conversazioni.
- `faq` e `guest_support` usano la knowledge base (knowledge-first).
- `partnership`, `vendor` e `saas_lead` non toccano mai `generate_reply`: costo AI ≈ zero (al più una classify Haiku).
- `spam` idealmente non arriva nemmeno alla classify (euristiche al livello 2).
- L'intent è un filtro di primo livello in dashboard ("Inbox per categoria", ui-mvp-plan §9).

**Disambiguazione B2B (istruzione esplicita nel prompt di classify)** — tre categorie facilmente confondibili, distinte dalla direzione dell'interesse:
- `saas_lead` → vuole **comprare il nostro software** (è un gestore di strutture, parla del sistema/assistente);
- `partnership` → vuole **collaborare con la struttura** (agenzia/TO che porta ospiti, tariffe gruppi);
- `vendor` → vuole **vendere qualcosa alla struttura** (servizi, visibilità, forniture).
In caso di dubbio tra `saas_lead` e le altre due, preferire `saas_lead` (falso positivo a basso costo, lead perso a costo alto). Nota architetturale: i `saas_lead` nascono nelle chat dei tenant ma interessano il team piattaforma — nell'MVP restano visibili al gestore nella tab dedicata e generano una notifica al team AI Concierge (meccanismo da definire nella migrazione 0003, es. flag/replica piattaforma).

### 7.1-ter Integrazione intent ↔ anti-abuse

- **Rate limit** (§7.1 livello 1) applicato prima della classificazione: lo spam massivo muore lì.
- **Blocco IP sospetti**: N messaggi classificati `spam` (o respinti dalle euristiche) dallo stesso IP in 1h → blocco temporaneo dell'IP (24h, configurabile) registrato in `guardrail_events` (`type='ip_blocked'`, `ip_hash`).
- **Contatore richieste anomale**: contatori per property/IP/intent; soglie su spam/h, `unclassified`/h (un picco di non classificati può indicare un attacco o un problema di classificazione) e nuove conversazioni/h.
- **Alert allo staff** (email + banner D1): picco spam, IP bloccato, tasso `unclassified` anomalo — stessi canali degli alert budget (§7.4).
- **Log eventi**: `guardrail_events` esteso con `spam_detected`, `ip_blocked`, `intent_unclassified_loop`; ogni classify è già in `ai_calls` (function `classify`) per misurare il costo dell'intent detection stessa.

### 7.2 Budget e soglie (config in `properties.settings`, nessuna modifica schema)

| Chiave settings (proposta) | Default | Effetto |
|---|---|---|
| `ai_daily_budget_cents` | 500 (€5) | Costo calcolato in tempo reale da `ai_calls` (token × prezzo modello). 80% → alert; 100% → **safe mode automatico** fino a mezzanotte (timezone property) |
| `ai_conversation_cost_limit_cents` | 50 | Oltre soglia: stop AI sul singolo thread → fallback FAQ/template + escalation + alert |
| `ai_session_message_limit` | 30 | Oltre: template "lascia un contatto" + escalation |
| `safe_mode` | false | Toggle manuale (D10) oltre all'attivazione automatica |

### 7.3 Safe mode (fallback completo senza AI)

Nessuna chiamata AI. La chat serve: match FAQ (FTS) + template; per richieste di disponibilità, raccolta dati guidata deterministica → `booking_requests` creata con `status='received'` per gestione manuale dello staff. Banner trasparente all'ospite. Uscita: manuale o automatica a mezzanotte (se attivato da budget).

### 7.4 Alert automatici al gestore (email + banner in dashboard)

- **Budget 80%** e ingresso in safe mode al 100%.
- **Traffico anomalo**: conversazioni/ora > 3× media mobile 7 giorni, oppure N conversazioni dallo stesso IP in 1h (check nel cron + a ogni nuova conversazione).
- **Conversazione fuori soglia**: costo > limite o > 40 messaggi.

### 7.5 Log e report

- `ai_calls` (già in schema): fonte unica dei costi — per giorno, funzione, modello, property.
- **`guardrail_events`** (nuova tabella, migrazione 0003): `type` (rate_limit, msg_limit, budget_80, budget_100, conv_threshold, anomaly, safe_mode_on/off), `property_id`, `conversation_id` nullable, `ip_hash`, `details` jsonb, `created_at`. Alimenta la vista "Eventi di protezione" in D12 + export CSV.
- Nota privacy: si logga l'hash dell'IP, non l'IP in chiaro (GDPR).

## 7-bis. Motore conversazionale booking (chat/WhatsApp → prenotazione)

Specifiche tecniche del flusso progettato in [ui-mvp-plan §10](ui-mvp-plan.md). Vale solo per intent `booking`.

### 7-bis.1 Slot filling — dati per il preventivo

Schema dello structured output di `extract` (Haiku, `strict: true`):

| Slot | Obbligatorio | Tipo / validazione |
|---|---|---|
| `check_in` | ✅ | date; se ambigua (giorno senza mese) → l'AI chiede conferma, mai inferenza silenziosa |
| `check_out` | ✅ | date > check_in; accettato anche come n. notti |
| `adults` | ✅ | int ≥ 1 |
| `children` | ✅ (anche `[]`) | array `{age}` — età obbligatoria per ogni bambino dichiarato |
| `language` | ✅ (auto) | rilevata dal testo, mai chiesta |
| `guest_name` + `guest_contact` | ✅ prima della proposta (web chat) | su WhatsApp `guest_contact` = numero, auto |
| `room_preferences` | opzionale | testo libero → `special_requests` |
| `special_requests` | opzionale | culla, animali, accessibilità, orario arrivo |

Regole motore: max 2 domande per turno; mai ridomandare slot già pieni (lo stato slot vive sulla conversazione, non nel prompt soltanto); ricapitolazione obbligatoria prima del calcolo; slot completi → `quoting` (motore preventivo, zero AI sui prezzi).

### 7-bis.2 Le 9 domande d'oro (KB, zero AI generativa)

Parcheggio, orari check-in/out, deposito bagagli, colazione, animali, culla/bambini, ascensore/accessibilità, posizione/come arrivare, cancellazione. Implementazione: 9 asset KB **obbligatori al setup** (checklist onboarding; tag dedicato es. `golden`), risposta solo via match FTS + template. Se il match fallisce su uno di questi temi → gap loggato + escalation (mai risposta generativa inventata su policy della struttura).

### 7-bis.3 Trigger di escalation (config in `properties.settings`)

| Chiave settings (proposta) | Default | Trigger |
|---|---|---|
| `escalation_group_guests` | 6 | ospiti > soglia → escalation gruppo |
| `escalation_group_rooms` | 2 | camere richieste > soglia |
| `escalation_event_keywords` | matrimonio, festa, cerimonia, meeting | richiesta evento |
| `vip_nights_threshold` / `vip_value_threshold_cents` | 7 / 100000 | escalation "soft" (proposta parte + notifica staff) |
| — (sempre attivi) | — | reclami (tono/keyword: rimborso, disservizio, recensione), richiesta esplicita di umano, pagamenti/rimborsi, 2 chiarimenti `unclassified` falliti, richieste fuori KB e fuori policy |

Su escalation: template cortesia → `conversations.status='pending_staff'` → follow-up sospesi (cancellazione `followup_jobs` pending) → notifica con riepilogo slot + motivo.

### 7-bis.4 Follow-up di default (seed `followup_rules`)

| Trigger | Delay | Template | Conditions |
|---|---|---|---|
| `proposal_sent` | 60 min | `followup_soft` | `{"only_if_no_reply": true}` |
| `proposal_sent` | 1.440 min (24h) | `followup_urgency` (con variabile ultima camera/scadenza) | `{"only_if_no_reply": true}` |
| `proposal_sent` | 4.320 min (72h) | `followup_last_call` | `{"only_if_no_reply": true}` |
| `confirmed` | — (vedi sotto) | `istruzioni_checkin` | `{"days_before_checkin": 2}` |

Stop globali (verificati dal cron prima di ogni invio): risposta ospite, avanzamento stato richiesta, `conversations.status='pending_staff'`, opt-out ("non mi interessa" → `rejected`, stop definitivo), quiet hours 22–08 timezone property (rinvio, non salto), max 3 follow-up/richiesta e max 1/giorno, canali OTA solo `ota_safe`. **WhatsApp (Fase 2)**: oltre la finestra 24h di Meta i follow-up richiedono template WhatsApp pre-approvati — i template `followup_urgency` e `followup_last_call` vanno registrati anche su Meta.

**Materializzazione `followup_rules` → `followup_jobs`**

I job non vengono creati al momento dell'inserimento della regola, ma **alla transizione di stato** della `booking_request` che corrisponde a `trigger_status`. La funzione che gestisce le transizioni (`lib/quote/stateMachine.ts`) inserisce i job nella stessa transazione che aggiorna lo stato. Il cron legge esclusivamente `followup_jobs` già materializzati (`due_at <= NOW() AND status = 'pending'`, indice `idx_followup_jobs_due`).

Calcolo di `due_at` per tipo di regola:

| Tipo conditions | Calcolo `due_at` | Caso d'uso |
|---|---|---|
| Nessun `days_before_checkin` | `transizione_at + delay_minutes * interval '1 minute'` | Follow-up post-proposta |
| `{"days_before_checkin": N}` | `booking_requests.check_in::timestamptz - N * interval '1 day'` | Istruzioni check-in |

Regola aggiuntiva per `days_before_checkin`: il job viene creato **solo se** `due_at > NOW()` al momento della transizione. Se la conferma arriva con meno di N giorni al check-in, il job non viene creato e il cron di controllo scadenze notifica lo staff (nessun messaggio automatico all'ospite oltre la finestra). `delay_minutes` è ignorato quando `days_before_checkin` è presente.

### 7-bis.5 Macchina a stati conversazione

Stage: `new → intent_pending → collecting_data → quoting → proposal_sent ⇄ negotiating → follow_up → booking_confirmed → closed`, con `handoff_staff` raggiungibile da ogni stato e `expired` da `follow_up`/`proposal_sent` (diagramma e tabella transizioni in ui-mvp-plan §10.6–10.7). Persistenza: **`conversations.stage`** (migrazione 0003) accanto allo status DB esistente (`aperta`/`in_attesa_staff`/`chiusa`); `quoting` e `intent_pending` sono transitori (non richiedono riga storica, ma loggati in `ai_calls`). La macchina a stati delle `booking_requests` (§4) resta separata: la conversazione guida il dialogo, la richiesta guida il funnel commerciale.

### 7-bis.6 KPI del funnel — definizioni e fonti

| KPI | Definizione | Fonte dati |
|---|---|---|
| Richieste ricevute | count `booking_requests` per periodo (e per `source_category`) | `booking_requests.created_at` |
| Preventivi inviati | transizioni `→ proposal_sent` (+ tempo mediano richiesta→proposta) | `booking_request_events` |
| Tasso di interesse | `interested` / `proposal_sent` | `booking_request_events` |
| Camere bloccate | transizioni `→ availability_blocked` | `booking_request_events` |
| Prenotazioni confermate | transizioni `→ confirmed` | `booking_request_events` |
| **Conversione end-to-end** | confermate / ricevute (+ conversione per step del funnel) | `booking_request_events` |
| Valore medio prenotazione | avg `offer_total_cents` su confermate | `booking_requests` |
| Valore generato + commissioni OTA evitate | sum `offer_total_cents`; sum stima commissione (prezzo OTA × pct) | `booking_requests` |
| Costo AI per prenotazione | costo `ai_calls` periodo / confermate | `ai_calls` |
| % risposte senza AI | risposte servite da livelli 1–4 / totale | `messages` + `ai_calls` |
| Tasso escalation | conversazioni passate da `in_attesa_staff` / totale booking | `conversations` |

Tutti calcolabili con sole query sulle tabelle esistenti (+ `conversations.stage`/`intent` della 0003): nessuna tabella nuova richiesta per i KPI.

## 7-ter. Fase finale MVP: governo commerciale, human handoff, dashboard KPI

### 7-ter.1 Governo commerciale — sconti, margini, trattativa AI

Distinto dal cost control sui token (§7): qui si governa **quanto margine l'AI può cedere**. Tutte le soglie vivono in `properties.settings` (nessuna modifica schema) e sono modificabili dalla struttura in D10.

**Regole di sconto (tre livelli):**

| Livello | Chiave settings | Default | Chi lo applica |
|---|---|---|---|
| Sconto diretto standard | `direct_discount_pct` | 10% | Sempre in proposta, automatico |
| Sconto extra di trattativa | `max_extra_discount_pct` | 5% | **AI, una sola volta**, solo alle condizioni sotto |
| Oltre soglia | — | — | **Solo staff** (override in D2, tracciato) |

**Margine minimo (pavimento):**
- `min_price_floor_cents` (opzionale, per property; raffinabile per camera in Fase 2): prezzo a notte sotto il quale **nessuno sconto automatico può scendere**, qualunque sia la percentuale. Se il floor blocca la concessione → handoff.
- In assenza di floor esplicito: il pavimento implicito è `listino × (1 − direct_discount − max_extra_discount)`.

**Altre soglie configurabili:** `ai_negotiation_enabled` (default true; off = ogni richiesta di sconto va allo staff), `negotiation_rounds_max` (default 1 — una sola concessione AI per conversazione).

**Quando l'AI può trattare** (tutte vere):
1. trattativa abilitata e proposta già inviata (mai sconti prima della prima proposta);
2. affidabilità prezzo/disponibilità = Alta;
3. richiesta non gruppo/evento/VIP (quelle vanno comunque a staff);
4. è la **prima** richiesta di sconto nella conversazione;
5. la concessione resta entro `max_extra_discount_pct` **e** sopra il floor.

La concessione segue la LunArt Voice (motivata e onesta, con nuova scadenza ravvicinata: *"Posso riservarle un ulteriore 5% se conferma entro stasera"*) e viene tracciata: aggiornamento `discount_pct`/`offer_total_cents`, evento in `booking_request_events` (actor `system`, nota "sconto trattativa AI"), `scoring_events`.

**Quando l'AI deve fermarsi** (handoff P2 "trattativa", payload §7-ter.2): richiesta oltre soglia o sotto floor; seconda richiesta di sconto dopo una concessione; affidabilità non Alta; gruppo/evento/VIP; ospite che propone cifre proprie ("facciamo 250?") oltre i limiti; qualsiasi richiesta su pagamenti già effettuati. L'AI non rilancia mai al ribasso di propria iniziativa e non inventa promozioni inesistenti.

### 7-ter.2 Human Handoff — mappa completa

Consolida i trigger di §7.1-bis (intent) e §7-bis.3 (escalation) in un'unica mappa con priorità e SLA. Il timer SLA parte alla transizione `in_attesa_staff` (o alla creazione della conversazione per gli intent non-ospite); promemoria a metà SLA; sforamento → alert ripetuto al gestore (`guardrail_events: sla_breach`) e, in Fase 2, escalation all'owner.

| Pri | Categoria | Trigger | SLA risposta |
|---|---|---|---|
| **P1** | Reclami | Tono negativo, keyword (rimborso, disservizio, recensione) | **15 min** (orario di presidio) |
| **P1** | Pagamenti | Qualsiasi richiesta su denaro versato/da versare oltre il flusso standard | **15 min** |
| **P1** | Ospite in casa | `guest_support` operativo durante il soggiorno | **15 min** |
| **P2** | Trattativa oltre soglia | §7-ter.1 | **1 h** |
| **P2** | Gruppi / Eventi | Soglie `escalation_group_*`, keyword evento | **1 h** |
| **P2** | VIP | Soglie `vip_*` (escalation soft: proposta parte, staff notificato) | **1 h** |
| **P2** | Affidabilità critica su lead caldo | Richiesta `interested`+ con affidabilità Critica | **1 h** |
| **P3** | Gap KB | Domanda d'oro o policy senza asset | **4 h** |
| **P3** | Non classificato | 2 chiarimenti falliti | **4 h** |
| **P3** | Lead SaaS | `saas_lead` (alta priorità tra i non-ospiti) | **4 h** |
| **P4** | Partnership / Commerciale | `partnership`, `vendor` | **24 h** |

**Payload standard del handoff** (la "handoff card" che lo staff vede in D4, e nel corpo della notifica): property e canale · intent + stage · lingua e registro (Lei/tu) · nome e contatto ospite · slot raccolti (date, ospiti, età, richieste) · richiesta collegata con stato, **valore**, scadenze attive (offerta/hold) e score · **motivo dell'escalation** (trigger) · ultimi 5 messaggi · priorità e countdown SLA · azioni rapide (rispondi, autorizza sconto, blocca camera, restituisci all'AI).

Regole già definite che restano valide: AI silenziata durante il handoff, follow-up sospesi, ritorno all'AI solo per azione esplicita dello staff.

### 7-ter.3 Dashboard KPI — framework completo

Estende il funnel di §7-bis.6 in **5 gruppi** (vista in D13/Analytics, ui-mvp-plan §11.3). Fonti: `booking_requests`, `booking_request_events`, `conversations`, `messages`, `ai_calls`, `guardrail_events` — nessuna tabella nuova.

| Gruppo | Metriche |
|---|---|
| **Operative** | Tempo prima risposta AI · tempo richiesta→proposta · tempo risposta staff su escalation vs SLA (% SLA rispettati, per priorità) · conversazioni/giorno · follow-up inviati e annullati |
| **Commerciali** | Valore generato (confermate) · valore medio prenotazione · pipeline aperta (valore richieste attive per stato) · sconto medio concesso (diretto + extra) · margine ceduto in trattativa (AI vs staff) |
| **Conversione** | Funnel per step (§7-bis.6) · conversione end-to-end · per canale/lingua/periodo · tasso risposta ai follow-up (per cadenza 1h/24h/72h) · tempo medio alla conferma |
| **OTA vs diretto** | Commissioni OTA evitate (€) · risparmio medio ospite vs Booking · quota richieste per source_category · valore diretto vs valore OTA stimato equivalente |
| **AI vs staff** | % conversazioni risolte solo AI · % risposte knowledge-first (senza AI generativa) · tasso e distribuzione escalation per categoria · conversione AI-only vs con intervento staff · costo AI per conversazione e per prenotazione confermata · sconti concessi da AI vs da staff |

## 8. Stima costi AI (ordine di grandezza)

Per richiesta con preventivo: 1× classify + 1× extract (Haiku, ~2–5K token) + 2–6 risposte conversazionali (Sonnet, KB cached) → **~$0,05–0,15 per richiesta**. Conversazione solo-FAQ: ~$0,02–0,08. Con la pipeline knowledge-first (§7.1) il 30–50% dei messaggi non genera alcuna chiamata. Da verificare con dati reali: `ai_calls` fornisce la misura esatta dal primo giorno; il budget giornaliero (§7.2) mette comunque un tetto rigido per property.

## 9. Decisioni aperte

- [ ] Scheduler: Vercel Cron vs `pg_cron` (dipende dall'hosting).
- [ ] Hosting: Vercel vs alternativa.
- [ ] Notifiche gestore MVP: solo email o anche push?
- [ ] Estrazione testo PDF per la KB nell'MVP (gli asset `pdf`/`brochure` hanno `file_path` + `content`): parsing automatico o copia-incolla manuale del testo?
- [x] **Valori enum: deciso (12/06/2026), migrazione scritta (13/06/2026).** Enum e valori interni in inglese, traduzioni solo in UI. La conversione completa è in `supabase/migrations/0002_enum_en_seed_constraints.sql`. Tabella di mapping completa in §11.

  | Tabella | Colonna | Valori IT (0001) | Valori EN (0002) | Default EN |
  |---|---|---|---|---|
  | `conversations` | `status` | `aperta` · `in_attesa_staff` · `chiusa` | `open` · `pending_staff` · `closed` | `open` |
  | `booking_requests` | `status` | `richiesta_ricevuta` · `proposta_inviata` · `interessato` · `da_verificare` · `disponibilita_bloccata` · `in_attesa_pagamento` · `confermata` · `scaduta` · `rifiutata` · `cancellata` | `received` · `proposal_sent` · `interested` · `to_verify` · `availability_blocked` · `awaiting_payment` · `confirmed` · `expired` · `rejected` · `cancelled` | `received` |
  | `booking_requests` | `priority` | `alta` · `media` · `bassa` | `high` · `medium` · `low` | `low` |
  | `booking_requests` | `data_reliability` | `alta` · `media` · `bassa` | `high` · `medium` · `low` | (nullable) |
  | `knowledge_assets` | `origin` | `import` · `manuale` · `correzione` · `gap` | `import` · `manual` · `correction` · `gap` | `manual` |
  | `kb_suggestions` | `kind` | `correzione` · `gap` | `correction` · `gap` | — |
  | `kb_suggestions` | `status` | `proposta` · `in_revisione` · `pubblicata` · `rifiutata` | `proposed` · `in_review` · `published` · `rejected` | `proposed` |

  Già in EN e invariati: `org_members.role`, `properties.knowledge_learning_mode`, `messages.direction`, `messages.sender`, `rate_calendar.source`, `booking_requests.price_source`, `templates.channel`, `followup_jobs.status`, `booking_request_events.actor`, `conversations.source`.
- [ ] Provider embedding per la Fase 2 (Anthropic non offre embeddings: OpenAI `text-embedding-3-*` o Voyage) — non blocca l'MVP.
- [ ] Soglia di confidenza del match FTS knowledge-first (§7.1): da tarare empiricamente in Fase 1.

## 10. Backlog migrazioni (0002+) — senza toccare la 0001

Dal report di analisi schema↔docs e dal §7; nessuna è bloccante per iniziare:

| Migrazione | Contenuto | Quando |
|---|---|---|
| 0002 | ✅ **Completata (13/06/2026, aggiornata 13/06/2026)** — `supabase/migrations/0002_enum_en_seed_constraints.sql`: conversione enum IT→EN (7 colonne, tabella di mapping in §9); ricostruzione indici parziali `idx_br_hold_expiry`/`idx_br_offer_expiry` con valori EN; UNIQUE su templates (due indici parziali per gestire `org_id NULL`); CHECK `check_out > check_in`; **CHECK `followup_rules.trigger_status IN (valori EN booking_requests.status)`** (§4c — impedisce typo silenziosi sui trigger cron); normalizzazione chiavi `settings` JSON (IT→EN, vedi §11); RPC `enroll_user_in_org`. Seed demo in `supabase/seed.sql` (settings completo, followup_rules **4 cadenze** incluse istruzioni check-in, template globali). | Fase 0 ✅ |
| 0003 | **`guardrail_events`** (log protezioni, §7.5: `spam_detected`/`ip_blocked`/`intent_unclassified_loop`/`sla_breach`, colonne: `type · property_id · conversation_id? · ip_hash · details jsonb · created_at`) + **blocklist IP** (`ip_hash`, `expires_at`); **`conversations.intent`** text + **`conversations.intent_confidence`** numeric(4,3) + **`conversations.stage`** text (§7.1-bis/§7-bis.5) con indici per i conteggi dell'Inbox per categoria; `conversations.assigned_to` uuid FK `auth.users`; `messages.metadata` jsonb + `external_id` text + `delivery_status` text (per WhatsApp/email Fase 2). I seed dei 9 asset KB "golden" NON vanno in migrazione: vengono inseriti dall'onboarding UI property per property. | `guardrail_events` + `intent` + `stage`: **Fase 1** (servono all'MVP) · `assigned_to` + `messages.metadata`: inizio Fase 2 |
| 0004 | Policy RLS differenziate per ruolo (owner/manager/staff); eventuale `knowledge_assets.property_id` nullable per asset org-wide condivisi (PKS §7 — solo se richiesto da un cliente reale) | Fase 3, prima del multi-utente self-service |

## 11. Mapping UI ↔ Schema

### 11.1 `properties.settings` — chiavi canoniche (post-0002)

Tutte le chiavi del jsonb `settings` sono in inglese dal 13/06/2026. Nessun vincolo DB: le chiavi mancanti assumono i valori di default indicati. La UI (D10) legge e scrive questo jsonb; il codice applicativo non deve usare le vecchie chiavi IT.

| Chiave `settings` | Tipo | Default | Sezione doc | Schermata UI |
|---|---|---|---|---|
| `direct_discount_pct` | int | 10 | §7-ter.1 | D10 Commerciale |
| `hold_hours` | int | 24 | §4 | D10 Commerciale |
| `offer_validity_hours` | int | 48 | §4 | D10 Commerciale |
| `city_tax_cents` | int | 0 | §4 | D10 Commerciale |
| `iban` | text | `""` | §6 Sicurezza | D10 Commerciale |
| `payment_instructions` | text | `""` | §6 | D10 Commerciale |
| `disclaimer` | text | (vedi seed) | §1 Pricing | D10 Commerciale |
| `freshness_high_hours` | int | 6 | §1 Pricing | D10 Affidabilità |
| `freshness_medium_hours` | int | 48 | §1 Pricing | D10 Affidabilità |
| `ai_daily_budget_cents` | int | 500 | §7.2 | D10 Protezioni / D12 |
| `ai_conversation_cost_limit_cents` | int | 50 | §7.2 | D10 Protezioni |
| `ai_session_message_limit` | int | 30 | §7.2 | D10 Protezioni |
| `safe_mode` | boolean | false | §7.3 | D10 Protezioni |
| `max_extra_discount_pct` | numeric | 5 | §7-ter.1 | D10 Trattativa |
| `min_price_floor_cents` | int | (assente) | §7-ter.1 | D10 Trattativa |
| `ai_negotiation_enabled` | boolean | true | §7-ter.1 | D10 Trattativa |
| `negotiation_rounds_max` | int | 1 | §7-ter.1 | D10 Trattativa |
| `escalation_group_guests` | int | 6 | §7-bis.3 | D10 (non esposta) |
| `escalation_group_rooms` | int | 2 | §7-bis.3 | D10 (non esposta) |
| `escalation_event_keywords` | text (CSV) | `matrimonio,festa,cerimonia,meeting` | §7-bis.3 | D10 (non esposta) |
| `vip_nights_threshold` | int | 7 | §7-bis.3 | D10 (non esposta) |
| `vip_value_threshold_cents` | int | 100000 | §7-bis.3 | D10 (non esposta) |

Note: `supervision_mode` e `knowledge_learning_mode` sono **colonne di `properties`**, non chiavi di `settings`.

### 11.2 Enum DB ↔ etichette UI

La UI mostra sempre etichette in italiano; il DB memorizza i valori EN (post-0002). Mappatura di riferimento per il frontend:

| Enum DB (EN) | Etichetta UI (IT) | Tabella.colonna |
|---|---|---|
| `open` | Aperta | `conversations.status` |
| `pending_staff` | In attesa dello staff | `conversations.status` |
| `closed` | Chiusa | `conversations.status` |
| `received` | Richiesta ricevuta | `booking_requests.status` |
| `proposal_sent` | Proposta inviata | `booking_requests.status` |
| `interested` | Interessato | `booking_requests.status` |
| `to_verify` | Da verificare | `booking_requests.status` |
| `availability_blocked` | Disponibilità bloccata | `booking_requests.status` |
| `awaiting_payment` | In attesa di pagamento | `booking_requests.status` |
| `confirmed` | Confermata | `booking_requests.status` |
| `expired` | Scaduta | `booking_requests.status` |
| `rejected` | Rifiutata | `booking_requests.status` |
| `cancelled` | Cancellata | `booking_requests.status` |
| `high` | Alta | `booking_requests.priority` / `data_reliability` |
| `medium` | Media | `booking_requests.priority` / `data_reliability` |
| `low` | Bassa | `booking_requests.priority` / `data_reliability` |
| `import` | Import | `knowledge_assets.origin` |
| `manual` | Inserimento manuale | `knowledge_assets.origin` |
| `correction` | Correzione staff | `knowledge_assets.origin` |
| `gap` | Gap rilevato | `knowledge_assets.origin` |
| `correction` | Correzione | `kb_suggestions.kind` |
| `gap` | Gap | `kb_suggestions.kind` |
| `proposed` | Proposta | `kb_suggestions.status` |
| `in_review` | In revisione | `kb_suggestions.status` |
| `published` | Pubblicata | `kb_suggestions.status` |
| `rejected` | Rifiutata | `kb_suggestions.status` |

### 11.3 Campi chiave per schermata — D1, D2, D5, D10

**D1 — Inbox richieste**

| Campo UI | Tabella.colonna | Note |
|---|---|---|
| Score badge (colore) | `booking_requests.lead_score` (0–100) | Verde < 40, giallo 40–69, rosso ≥ 70 (soglie da tarare) |
| Chip stato | `booking_requests.status` (EN → etichetta IT) | |
| Source | `booking_requests.source` / `source_category` | |
| Affidabilità | `booking_requests.data_reliability` | Derivato da freshness `rate_calendar.updated_at` vs soglie settings |
| Countdown offerta | `booking_requests.offer_expires_at` | Solo se status `proposal_sent` |
| Countdown hold | `booking_requests.hold_expires_at` | Solo se status `availability_blocked` |
| Alert setup | Checklist locale — nessuna tabella | Le 9 domande d'oro: count `knowledge_assets` con tag `golden` e `usable_by_concierge = true` |

**D2 — Dettaglio richiesta**

| Campo UI | Tabella.colonna | Note |
|---|---|---|
| Date / ospiti | `booking_requests.check_in`, `check_out`, `adults`, `children` (jsonb) | |
| Lingua | `conversations.language` (via `conversation_id`) | |
| Richieste speciali | `booking_requests.special_requests` | |
| Proposta — camera | `booking_request_items.room_id` → `rooms.name` | |
| Proposta — prezzi | `booking_requests.gross_total_cents`, `discount_pct`, `offer_total_cents`, `city_tax_cents` | Tutti in centesimi; UI divide per 100 |
| Fonte prezzo | `booking_requests.price_source` | Valori: `csv` · `manual` · `ical` · `api` · `ota_stimato` |
| Ultimo agg. tariffe | `rate_calendar.updated_at` (max per room nel range) | Mostra giorni fa; colore da soglie freshness settings |
| Azioni disponibili | derivato da `booking_requests.status` | La macchina a stati determina quali pulsanti mostrare |
| Timeline | `booking_request_events` (from_status, to_status, actor, note, created_at) | |
| Score detail | `scoring_events` (event, delta, created_at) | |
| Concessione trattativa | `booking_request_events` con note "sconto trattativa AI" | Evidenziata nella timeline |

**D5 — Calendario tariffe**

| Campo UI | Tabella.colonna | Note |
|---|---|---|
| Cella prezzo | `rate_calendar.price_cents` / 100 | `NULL` = prezzo mancante (cella "—") |
| Disponibilità | `rate_calendar.available` (0/1) | 0 = occupato (✕) |
| Source cella | `rate_calendar.source` | Mostrato solo su hover/dettaglio |
| Freshness footer | `rate_calendar.updated_at` (min del range selezionato) | Colore da `settings.freshness_*_hours` |
| Feed iCal | `ical_feeds` (url, last_sync_at, last_status, active) | |

**D10 — Impostazioni property**

| Sezione UI | Campo | Mappatura | Note |
|---|---|---|---|
| Anagrafica | Nome, indirizzo, città | `properties.name/address/city` | |
| Anagrafica | Timezone, lingua | `properties.timezone/default_language` | |
| Commerciale | Sconto diretto % | `settings.direct_discount_pct` | |
| Commerciale | Tassa soggiorno | `settings.city_tax_cents` (cents → €) | |
| Commerciale | Hold disponibilità h | `settings.hold_hours` | |
| Commerciale | Validità offerta h | `settings.offer_validity_hours` | |
| Commerciale | IBAN / istruzioni | `settings.iban` / `settings.payment_instructions` | |
| Commerciale | Disclaimer | `settings.disclaimer` | |
| Affidabilità | Freshness Alta < h | `settings.freshness_high_hours` | |
| Affidabilità | Freshness Media < h | `settings.freshness_medium_hours` | |
| AI | Supervisione | `properties.supervision_mode` (boolean, colonna diretta) | |
| AI | Apprendimento KB | `properties.knowledge_learning_mode` (colonna diretta) | |
| Protezioni | Budget AI giornaliero | `settings.ai_daily_budget_cents` (cents → €) | |
| Protezioni | Soglia per conv | `settings.ai_conversation_cost_limit_cents` | |
| Protezioni | Safe mode toggle | `settings.safe_mode` (boolean) | |
| Trattativa | Sconto extra AI % | `settings.max_extra_discount_pct` | |
| Trattativa | Prezzo floor/notte | `settings.min_price_floor_cents` (opzionale) | |
| Trattativa | AI può trattare | `settings.ai_negotiation_enabled` | |
| Trattativa | Max concessioni | `settings.negotiation_rounds_max` | |
| Web chat | Link / QR | Generato da `properties.id` (slug o UUID) | |

---

## 12. Framework notifiche ed escalation — specifica unificata

Consolida §7-bis.3, §7-ter.2 e §10.4 di ui-mvp-plan in un'unica tabella autoritativa. In caso di conflitto tra sezioni, questa prevale.

### 12.1 Mappa escalation completa

| Pri | Categoria | Trigger | SLA risposta | DB effect | Notifica |
|---|---|---|---|---|---|
| **P1** | Reclami | Tono negativo, keyword (rimborso, disservizio, recensione) | **15 min** | `conversations.status = 'pending_staff'` · `booking_request_events` (note) | Email immediata + banner D1 rosso |
| **P1** | Pagamenti | Qualsiasi richiesta su denaro già versato/da versare fuori dal flusso standard | **15 min** | `conversations.status = 'pending_staff'` | Email immediata + banner D1 rosso |
| **P1** | Ospite in casa | `guest_support` durante il soggiorno (date check_in ≤ oggi ≤ check_out) | **15 min** | `conversations.status = 'pending_staff'` | Email immediata + banner D1 rosso |
| **P2** | Trattativa oltre soglia | Richiesta sconto oltre `max_extra_discount_pct` o sotto `min_price_floor_cents`; 2ª richiesta sconto; affidabilità non High | **1 h** | `conversations.status = 'pending_staff'` · `booking_request_events` actor system | Email immediata + badge D3 ambra |
| **P2** | Gruppi / Eventi | Ospiti > `escalation_group_guests`, camere > `escalation_group_rooms`, keyword evento (`escalation_event_keywords`) | **1 h** | `conversations.status = 'pending_staff'` | Email immediata + badge D3 ambra |
| **P2** | VIP soft | Notti > `vip_nights_threshold` o valore > `vip_value_threshold_cents` | **1 h** | La proposta parte; staff notificato; `booking_request_events` nota | Email + badge D3 ambra (la proposta è già inviata) |
| **P2** | Affidabilità critica su lead caldo | `data_reliability = 'low'` + status `interested` o oltre | **1 h** | `conversations.status = 'pending_staff'` | Email + badge D3 ambra |
| **P3** | Gap KB | Domanda d'oro senza asset KB corrispondente | **4 h** | `conversations.status = 'pending_staff'` · `kb_suggestions` (kind = `gap`) | Email + badge D3 giallo |
| **P3** | Non classificato | 2 chiarimenti `unclassified` falliti | **4 h** | `conversations.status = 'pending_staff'` | Email + badge D3 giallo |
| **P3** | Lead SaaS | intent `saas_lead` (gestore interessato al software) | **4 h** | Visibile in tab "Lead SaaS" di D3 · notifica al team piattaforma (meccanismo: 0003) | Email + badge D3 giallo |
| **P4** | Partnership | intent `partnership` | **24 h** | Inbox "Partnership" di D3 | Nessuna email urgente; conteggio badge |
| **P4** | Commerciale | intent `vendor` | **24 h** | Inbox "Commerciale" di D3 | Nessuna email urgente |

### 12.2 SLA timer — regole operative

- Il timer parte alla transizione `conversations.status → 'pending_staff'` (o alla creazione della conversazione per `saas_lead`/`partnership`/`vendor`).
- **Promemoria a metà SLA**: notifica email al gestore se la conversazione è ancora `pending_staff`.
- **Sforamento SLA**: alert ripetuto ogni 15 min (P1), ogni 30 min (P2), una volta (P3–P4); loggato come `guardrail_events.type = 'sla_breach'` (migrazione 0003).
- Orario di presidio: gli SLA P1/P2 si misurano solo nelle ore configurabili come "orario di presidio" — da definire in `properties.settings` (`support_hours_start`, `support_hours_end`, `support_timezone`) nell'implementazione.

### 12.3 Comportamento AI durante l'handoff

- **AI silenziata**: nessun `generate_reply` mentre `conversations.status = 'pending_staff'`.
- **Follow-up sospesi**: il cron non invia `followup_jobs` pending se la conversazione è `pending_staff`.
- **Ritorno all'AI**: solo per azione esplicita dello staff (pulsante "Restituisci all'AI" in D4) → `conversations.status = 'open'`.

### 12.4 Canali di notifica MVP

| Evento | Email | Banner D1 | Push (futuro) |
|---|---|---|---|
| Nuova escalation P1 | ✅ immediata | ✅ rosso | Fase 2 |
| Nuova escalation P2 | ✅ immediata | ✅ ambra | Fase 2 |
| Nuova escalation P3/P4 | ✅ batch | ✅ giallo/neutro | Fase 2 |
| Budget AI 80% | ✅ | ✅ | — |
| Safe mode attivato | ✅ | ✅ | — |
| Traffico anomalo / IP bloccato | ✅ | ✅ | — |
| SLA breach | ✅ | ✅ | Fase 2 |
| Promemoria metà SLA | ✅ | — | Fase 2 |

> **Decisione aperta**: notifiche push nell'MVP o solo email? (vedi §9). L'architettura email è sufficiente per il pilot.

### 12.5 Payload handoff card (D4)

La handoff card mostrata in cima a D4 quando `conversations.status = 'pending_staff'`:

| Campo | Fonte DB |
|---|---|
| Property + canale | `conversations.property_id` + `conversations.source` |
| Intent + stage | `conversations.intent` + `conversations.stage` (0003) |
| Lingua + registro | `conversations.language` (Lei/tu da assets KB o default) |
| Nome + contatto ospite | `conversations.guest_name` + `conversations.guest_contact` |
| Slot raccolti | `booking_requests.check_in/check_out/adults/children/special_requests` |
| Richiesta collegata | `booking_requests.status` · `offer_total_cents` · `offer_expires_at` · `hold_expires_at` · `lead_score` |
| Motivo escalation | `booking_request_events.note` (last event di tipo escalation) |
| Ultimi 5 messaggi | `messages` ORDER BY `created_at` DESC LIMIT 5 |
| Priorità + countdown SLA | Calcolato da tipo escalation + `conversations.updated_at` |
| Azioni rapide | Rispondi · Autorizza sconto (→ override D2) · Blocca camera · Restituisci all'AI |

---

## Documenti correlati

- [Product Brief](product-brief.md)
- [Roadmap](roadmap.md)
- Schema database: `supabase/schema.sql`
