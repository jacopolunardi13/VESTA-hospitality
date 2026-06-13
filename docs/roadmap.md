# AI Concierge & Direct Quote — Roadmap

> Versione 0.4 — 13 giugno 2026 (commit C01–C06 completati; C07 = Auth Completion, C08 = Property Settings ufficializzati; stato attuale aggiornato)
> Allineata allo schema database reale. Le durate sono indicative (sviluppo solo founder) e da ricalibrare: l'MVP ora include la pipeline Direct Quote, quindi è più ampio della v0.1.

## Stato attuale

### Infrastruttura / Schema
- [x] Progetto Supabase configurato
- [x] Schema database completo installato e versionato (`supabase/schema.sql`, migrazione 0001: 20 tabelle, RLS, indici, trigger, seed demo)
- [x] Migrazione 0002: enum IT → EN, seed `followup_rules`/template, vincoli, RPC `enroll_user_in_org`
- [x] Repository Git inizializzato, `.gitignore`
- [x] Documentazione allineata allo schema (questo set, v0.4)

### Commit applicativi completati (Fase 0 → 1a)
- [x] **C01** — Scaffold Next.js + TypeScript + Tailwind in `app/`
- [x] **C02** — Auth guard: `proxy.ts` (route pubbliche), client Supabase browser/server (`@supabase/ssr`), layout dashboard base
- [x] **C03** — Tipi TypeScript generati da schema locale (`database.types.ts`)
- [x] **C04** — Auth callback `/api/auth/callback`: `exchangeCodeForSession`, check `org_members`, redirect `/onboarding` se senza org
- [x] **C05** — Onboarding wizard 3 step: `createOrg` via service role (`createAdminClient`), `createProperty`, `finalizeOnboarding`
- [x] **C06** — Login flow: `login()` con org check e redirect `/onboarding`, `signup()` con `emailRedirectTo`, pagina login con 3 stati (login / signup / conferma email)
- [x] **C07** — Auth Completion: `forgotPassword`, pagina `/reset-password`, `updateUser()`, fix SB-01 (open redirect nel callback)
- [x] **C08** — Property Settings: pagina `/settings/property`, Server Actions per tutte le sezioni `properties`/`settings`

- [x] **C09** — Camere: CRUD camere (`/rooms`), ownership check applicativo, soft-delete

### In corso
- [ ] **C10 — Knowledge Base**: CRUD asset testo (`/knowledge`), versioning automatico, optimistic locking, soft-delete

### Operativo (separato dai commit)
- [ ] Applicare migrazioni 0001 + 0002 al progetto Supabase remoto
- [ ] Rigenerare `database.types.ts` via Supabase CLI contro l'istanza remota

---

## Fase 0 — Fondamenta (≈ 1 settimana)

Obiettivo: progetto riproducibile e pronto allo sviluppo.

- [x] Git + struttura repository (`app/`, `supabase/`, `docs/`).
- [x] Schema versionato nel repo.
- [ ] Scaffold Next.js + TypeScript + Tailwind in `app/` (richiede conferma installazione).
- [ ] Variabili d'ambiente e client Supabase (browser/server).
- [ ] Bucket Supabase Storage per i file della KB (`knowledge_assets.file_path`) con policy di accesso.
- [x] Estrarre il seed demo in `supabase/seed.sql` (con settings EN completo, followup_rules e template di default — completato in audit 13/06/2026).
- [x] Migrazione 0002: enum IT → EN, vincoli templates/date, normalizzazione settings JSON, RPC `enroll_user_in_org` (completato in audit 13/06/2026).
- [ ] Automatizzare il collegamento utente→organization al signup nell'auth callback Next.js (la RPC `enroll_user_in_org` è pronta — manca il codice applicativo A2).

**Done quando:** clone → `npm install` → app vuota collegata a Supabase con login funzionante.

## Fase 1 — MVP: Concierge + Direct Quote su web chat (≈ 8–10 settimane)

Obiettivo: una struttura pilota riceve richieste in web chat, l'AI risponde e produce proposte tracciate fino alla conferma.

### 1a — Base gestionale (≈ 2 settimane)
- Auth + onboarding organization/property; gestione membri e ruoli.
- CRUD knowledge base (asset tipizzati, upload file su Storage, versioning).
- CRUD camere e calendario tariffe (editor manuale + import CSV).
- Sync feed iCal (sola disponibilità) via job schedulato.

### 1b — Concierge AI + Intent Detection + Anti-abuse (≈ 3 settimane)
- Endpoint `/api/chat`: pipeline knowledge-first (guard-rail → spam → deterministici → FTS KB → AI), prompt con KB cached, storico conversazione, streaming.
- **Intent detection a 8 categorie** (`classify` Haiku, dev-plan §7.1-bis): solo `booking` genera una `booking_request`; `partnership`/`vendor`/`saas_lead` instradati in inbox dedicate; `spam` archiviato senza AI; `unclassified` riceve template di chiarimento; `faq`/`guest_support` → KB + `generate_reply`.
- **Pipeline anti-abuse** (dev-plan §7.1–7.5): rate limit per IP/sessione su Postgres, budget AI giornaliero da `properties.settings`, safe mode (toggle manuale + automatico a budget 100%), contatori anomalie; alert email + banner D1; preparazione schema `guardrail_events` (la tabella arriva in migrazione 0003, i log usano `ai_calls` in MVP).
- Web chat pubblica `/c/[property]` multilingua; persistenza `conversations`/`messages`.
- Escalation (`pending_staff`) e `supervision_mode`; log di ogni chiamata in `ai_calls`.
- Inbox per categoria in D3 (tab con conteggi separati per intent).

### 1c — Pipeline Direct Quote + Motore conversazionale + Governo sconti (≈ 4 settimane)
- **Motore conversazionale booking** (dev-plan §7-bis): slot filling (max 2 domande/turno, mai ridomandare slot già pieni, ricapitolazione prima del calcolo); 9 domande d'oro servite da FTS+template senza AI generativa; trigger di escalation configurabili (`settings`: gruppi, eventi, VIP, reclami).
- **Intent detection → extract → motore preventivo**: `classify` (Haiku) → solo se `booking` → `extract` (Haiku, structured output: date/ospiti/bambini/lingua) → calcolo prezzo da `rate_calendar`, sconto diretto, tassa, snapshot `booking_request_items`, `data_reliability` da freshness. I prezzi non passano mai dall'AI.
- Macchina a stati completa (`received` → … → `confirmed`) con audit in `booking_request_events`; hold 24h e scadenza offerta via cron; indici parziali su `awaiting_payment` e `proposal_sent` (migrazione 0002).
- **Governo sconti e trattativa** (dev-plan §7-ter.1): sconto diretto standard + sconto extra AI (una sola concessione, entro `max_extra_discount_pct`, sopra `min_price_floor_cents`); oltre soglia → handoff; ogni concessione tracciata in `booking_request_events`.
- Lead scoring (`scoring_events`) e priorità.
- Template engine (codice/canale/lingua, `ota_safe`) e follow-up automatici a 3 cadenze (1h/24h/72h, dev-plan §7-bis.4); regole di stop (quiet hours, opt-out, max 3 per richiesta).

### 1d — Dashboard, Human Handoff, KPI e chiusura MVP (≈ 3 settimane)
- Inbox richieste (ordinata per priorità/score) e conversazioni realtime; presa in carico ed esecuzione azioni di stato; override prezzo/offerta in D2 (tracciato).
- **Human handoff con SLA** (dev-plan §7-ter.2): handoff card in D4 (motivo, priorità P1–P4, countdown SLA, slot raccolti, azioni rapide); notifica immediata + promemoria a metà SLA + alert a sforamento; badge sidebar per priorità in D3.
- **Dashboard KPI a 5 blocchi** (D13, dev-plan §7-ter.3): operativo, commerciale, conversione, OTA vs diretto, AI vs staff — tutto calcolabile dalle tabelle esistenti.
- Vista calendario tariffe, gestione template, impostazioni property (D10 con sezione "Trattativa"), impostazioni org/membri.
- D12 "AI, costi e protezioni": budget bar, % knowledge-first, avvisi recenti, export `guardrail_events`.
- Test RLS multi-tenant, test macchina a stati booking_requests (transizioni illegali), smoke e2e chat→proposta→conferma; deploy Vercel + cron config + pilot.

**Done quando:** un ospite reale chiede disponibilità in web chat, riceve una proposta calcolata, clicca "Sono interessato", lo staff conferma il pagamento e la richiesta arriva a `confirmed` — tutto visibile in dashboard con KPI aggiornati in D13.

## Fase 2 — Canali e auto-learning (≈ 5–7 settimane)

Obiettivo: inbox multicanale e KB che migliora da sola.

- **WhatsApp Business Cloud API**: webhook in/out, mappatura numero→conversazione (richiede migrazione: metadata messaggi/ID esterni — vedi dev-plan §9).
- **Email**: indirizzo dedicato per property, parsing inbound, risposte AI con approvazione opzionale.
- **KB auto-learning end-to-end**: cattura correzioni/gap → distillazione AI → conflict check (`kb_suggestions`) → approvazione secondo `knowledge_learning_mode` → pubblicazione con `supersedes_asset_id`.
- Inbox unificata multicanale, `assigned_to` per presa in carico (migrazione), notifiche al gestore.
- Eventuale attivazione retrieval semantico (`knowledge_embeddings`) se le KB crescono — richiede scelta provider embedding.

**Done quando:** la stessa richiesta è gestibile da web chat, WhatsApp ed email; le correzioni dello staff finiscono in KB senza lavoro manuale.

## Fase 3 — OTA, social e monetizzazione (≈ 6–8 settimane)

Obiettivo: prodotto vendibile in self-service e presidio di tutti i canali.

- Messaggistica OTA (Booking.com; Expedia/Airbnb se le API lo consentono) con template `ota_safe` obbligatori e prezzo `ota_stimato`.
- Canali social: Instagram DM, Facebook Messenger; Google Business Messages.
- Pagamenti online (Stripe Payment Links o simile) al posto della verifica manuale.
- Billing SaaS (Stripe), piani, trial, limiti per piano.
- Analytics: conversione proposta→confermata, valore prenotazioni dirette, costi AI per richiesta (da `ai_calls`).
- RLS differenziata per ruolo (owner/manager/staff) e onboarding self-service completo.

**Done quando:** un gestore si registra, configura strutture e canali, e paga senza intervento manuale.

---

## Rischi principali

| Rischio | Impatto | Mitigazione |
|---|---|---|
| MVP ampio (concierge + quote engine) | Tempi Fase 1 | Tagli interni possibili: CSV import e follow-up possono slittare a fine fase; la macchina a stati no (è il cuore) |
| Calendario tariffe non aggiornato dai gestori | Proposte sbagliate | `data_reliability` + freshness in proposta + disclaimer; iCal per la disponibilità |
| Approvazione WhatsApp Business API lenta | Fase 2 ritardata | Avviare la Meta Business verification durante la Fase 1 |
| Accesso API OTA difficile per nuovi vendor | Fase 3 ritardata | Validare i requisiti partner in anticipo; OTA fuori dal percorso critico MVP |
| Costi AI per richiesta | Marginalità | Haiku per classify/extract, Sonnet per le risposte, prompt caching; monitoraggio da `ai_calls` dal giorno 1 |
| Allucinazioni su prezzi/disponibilità | Reputazione | I prezzi vengono SOLO da `rate_calendar` via codice (mai generati dall'AI); `supervision_mode` in rodaggio |

## Documenti correlati

- [Product Brief](product-brief.md)
- [Dev Plan](dev-plan.md)
- Schema database: `supabase/schema.sql`
