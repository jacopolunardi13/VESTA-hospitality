# AI Concierge & Direct Quote — Roadmap

> Versione 0.5 — 14 giugno 2026 (C11 = Calendario completato; riallineamento priorità strategiche: prenotazioni come cuore del prodotto, Revenue Assistant come feature naming in Fase 3, Fuori scope esplicitato, Fase 1b anticipata a macchina a stati booking)
> Allineata allo schema database reale. Le durate sono indicative (sviluppo solo founder) e da ricalibrare: l'MVP include la pipeline Direct Quote, che è il cuore del prodotto.

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
- [x] **C10** — Knowledge Base: CRUD asset testo (`/knowledge`), versioning automatico su `knowledge_asset_versions`, optimistic locking
- [x] **C11** — Calendario tariffe: editor manuale (`/calendar`), upsert range date (max 90 giorni), `available` come int 0|1, hard delete

### Operativo (separato dai commit)
- [ ] Applicare migrazioni 0001 + 0002 + 0003 al progetto Supabase remoto
- [ ] Rigenerare `database.types.ts` via Supabase CLI contro l'istanza remota
- [ ] Scrivere migrazione 0004 (conversations.intent/stage, guardrail_events, blocklist IP)

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

## Fase 1 — MVP: Prenotazioni + Concierge AI + Direct Quote su web chat (≈ 10–12 settimane)

Obiettivo: una struttura pilota riceve richieste in web chat, l'AI risponde, produce proposte calcolate e le porta a conferma. Il flusso di prenotazione è il cuore del prodotto — tutto il resto lo serve.

### 1a — Base gestionale ✅ COMPLETATA (C01–C11)

- Auth + onboarding organization/property; gestione membri e ruoli.
- CRUD knowledge base (asset tipizzati, versioning) — infrastruttura dati per l'AI, non feature utente finale.
- CRUD camere e calendario tariffe (editor manuale).

### 1b — Prenotazioni: macchina a stati + Inbox booking (≈ 2 settimane)

**Questo sprint rende operativo il flusso prenotazione prima ancora di aggiungere l'AI.** Ogni altra feature serve questo flusso.

- Migrazione 0004: `conversations.intent`/`stage`, `guardrail_events`, blocklist IP.
- Applicazione migrazioni 0001+0002+0003+0004 al progetto Supabase remoto; rigenerazione `database.types.ts`.
- **Macchina a stati `booking_requests` completa**: tutte le transizioni `received` → `proposal_sent` → `interested` → `to_verify` → `availability_blocked` → `awaiting_payment` → `confirmed` / `expired` / `rejected` / `cancelled`; audit trail in `booking_request_events`; hold 24h e scadenza offerta via cron (indici parziali già pronti in migrazione 0002).
- **Inbox richieste** (D1): home della dashboard, ordinata per priorità/score, filtri stato/source, banner setup.
- **Dettaglio richiesta** (D2): dati estratti, proposta con snapshot prezzo, azioni per stato corrente, override prezzo/offerta tracciato, timeline audit.
- Inserimento richiesta **manuale** da dashboard (source `manual`) — permette di operare senza la chat AI.
- Lead scoring (`scoring_events`) e priorità.

**Done quando:** lo staff può creare una richiesta a mano, mandare una proposta con prezzo calcolato da calendario, registrare l'interesse dell'ospite, bloccare la disponibilità e portare la richiesta a `confirmed`. Tutto tracciato in D2. Nessuna AI richiesta in questo sprint.

### 1c — AI pre-prenotazione: Concierge + Intent Detection + Direct Quote (≈ 4 settimane)

- Web chat pubblica `/c/[property]` multilingua; persistenza `conversations`/`messages` (G1 + G2).
- Endpoint `/api/chat`: pipeline knowledge-first (guard-rail → deterministici → FTS KB → AI), prompt con KB cached, storico conversazione, streaming.
- **Intent detection a 8 categorie** (`classify` Haiku, dev-plan §7.1-bis): solo `booking` genera una `booking_request`; `partnership`/`vendor`/`saas_lead` instradati in inbox dedicate; `spam` archiviato senza AI; `unclassified` riceve template di chiarimento; `faq`/`guest_support` → KB + `generate_reply`.
- **Motore conversazionale booking** (dev-plan §7-bis): slot filling (max 2 domande/turno, mai ridomandare slot già pieni, ricapitolazione prima del calcolo).
- **Extract → calcolo preventivo**: `extract` (Haiku, structured output: date/ospiti/bambini/lingua) → calcolo prezzo da `rate_calendar`, sconto diretto, snapshot `booking_request_items`, `data_reliability` da freshness. **I prezzi non passano mai dall'AI.**
- **Pipeline anti-abuse** (dev-plan §7.1–7.5): rate limit per IP/sessione, budget AI giornaliero, safe mode automatico a budget 100%, contatori anomalie.
- Escalation (`pending_staff`) e `supervision_mode`; log ogni chiamata in `ai_calls`.
- Inbox per categoria in D3 (tab con conteggi separati per intent).
- **Sync feed iCal** (sola disponibilità) via job schedulato — slittato da 1a.

### 1d — Chiusura MVP: Follow-up, Trattativa, Human Handoff, KPI (≈ 4 settimane)

- Template engine (codice/canale/lingua, `ota_safe`) e follow-up automatici a 3 cadenze (1h/24h/72h, dev-plan §7-bis.4); regole di stop (quiet hours, opt-out, max 3 per richiesta).
- **Governo sconti e trattativa** (dev-plan §7-ter.1): sconto diretto standard + sconto extra AI (una sola concessione, entro `max_extra_discount_pct`, sopra `min_price_floor_cents`); oltre soglia → handoff; ogni concessione tracciata in `booking_request_events`.
- **Human handoff con SLA** (dev-plan §7-ter.2): handoff card in D4 (motivo, priorità P1–P4, countdown SLA, slot raccolti, azioni rapide); notifica immediata + promemoria a metà SLA + alert a sforamento; badge sidebar per priorità in D3.
- **Dashboard KPI a 5 blocchi** (D13, dev-plan §7-ter.3): operativo, commerciale, conversione, OTA vs diretto, AI vs staff — tutto calcolabile dalle tabelle esistenti.
- Gestione template (D8), follow-up (D9), impostazioni property (D10 con sezione "Trattativa"), org/membri (D11).
- D12 "AI, costi e protezioni": budget bar, % knowledge-first, avvisi recenti, export `guardrail_events`.
- Test RLS multi-tenant, test macchina a stati (transizioni illegali), smoke e2e chat→proposta→conferma; deploy Vercel + cron config + pilot.

**Done quando:** un ospite reale chiede disponibilità in web chat, riceve una proposta calcolata, clicca "Sono interessato", lo staff conferma il pagamento e la richiesta arriva a `confirmed` — tutto visibile in dashboard con KPI aggiornati in D13.

## Fase 2 — Knowledge Base strutturata + Canali (≈ 5–7 settimane)

Obiettivo: KB che migliora da sola come infrastruttura per l'AI; inbox multicanale.

La KB CRUD base (C10) è già operativa. Qui si aggiungono le funzionalità strutturate che la trasformano da archivio statico a sistema vivente — infrastruttura critica per il concierge, il Direct Quote e il futuro dipendente virtuale. Le 9 domande d'oro e il coverage score sono la base: senza questi, la pipeline AI risponde con meno precisione e scala meno.

- **KB strutturata**: coverage score e gap report visibile in dashboard, 9 domande d'oro obbligatorie (checklist completamento onboarding), review reminder su asset obsoleti, avviso anti-numeri nell'editor.
- **KB auto-learning end-to-end**: cattura correzioni/gap → distillazione AI → conflict check (`kb_suggestions`) → approvazione secondo `knowledge_learning_mode` → pubblicazione con `supersedes_asset_id`.
- Retrieval semantico (`knowledge_embeddings`, provider-agnostic) se le KB crescono oltre la finestra di caching.
- **WhatsApp Business Cloud API**: webhook in/out, mappatura numero→conversazione (richiede migrazione: metadata messaggi/ID esterni — vedi dev-plan §9).
- **Email**: indirizzo dedicato per property, parsing inbound, risposte AI con approvazione opzionale.
- Inbox unificata multicanale, `assigned_to` per presa in carico (migrazione), notifiche al gestore.

> Avviare la Meta Business verification durante la Fase 1 per non ritardare questa fase.

**Done quando:** la stessa richiesta è gestibile da web chat, WhatsApp ed email; le correzioni dello staff finiscono in KB senza lavoro manuale; il coverage score guida attivamente l'aggiornamento dei contenuti.

## Fase 3 — Revenue Assistant + OTA + Monetizzazione (≈ 6–8 settimane)

Obiettivo: strumenti di supporto alle decisioni commerciali, presidio canali OTA/social, billing SaaS.

- **Revenue Assistant** (nuova feature area):
  - Analisi competitor: prezzi OTA per le stesse date e property tipo.
  - Suggerimenti tariffari basati su occupazione, stagionalità e domanda rilevata.
  - Alert prezzi: notifica quando le OTA scendono sotto la tariffa diretta della struttura.
  - Supporto alle decisioni commerciali: quando alzare/abbassare, effetto stimato su conversione.
- Messaggistica OTA (Booking.com; Expedia/Airbnb se le API lo consentono) con template `ota_safe` obbligatori e prezzo `ota_stimato`.
- Canali social: Instagram DM, Facebook Messenger; Google Business Messages.
- Pagamenti online (Stripe Payment Links o simile) al posto della verifica manuale.
- Billing SaaS (Stripe), piani, trial, limiti per piano.
- Analytics avanzate post-billing: conversione proposta→confermata per canale, valore prenotazioni dirette, costi AI per richiesta (da `ai_calls`).
- RLS differenziata per ruolo (owner/manager/staff) e onboarding self-service completo.

**Done quando:** un gestore si registra, configura strutture e canali, riceve suggerimenti tariffari e paga senza intervento manuale.

---

## Fuori scope (esplicito)

Elementi che potrebbero sembrare naturali ma **non fanno parte della roadmap attuale**:

| Elemento | Motivo |
|---|---|
| Gestione task operativi (pulizie, manutenzioni, workflow staff) | Diverso modello di prodotto; non supporta la vendita |
| Tassa di soggiorno come modulo separato | È un campo nella proposta, non una feature; gestione fiscale fuori scope |
| Dashboard analytics avanzate non collegate alle prenotazioni | Analytics business (D13) coprono il necessario; BI avanzata è Fase 3+ |
| Chatbot FAQ non integrati nel flusso di prenotazione | Contrario alla visione: tutto il concierge serve la conversione |
| Channel manager in scrittura verso le OTA | I feed iCal sono sola lettura; scrittura OTA richiede accordi commerciali separati |
| PMS completo | Valutare integrazioni in futuro, non costruire |
| App mobile nativa | Il responsive web è sufficiente per l'MVP e la Fase 2 |

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
