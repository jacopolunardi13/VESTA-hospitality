# AI Concierge & Direct Quote — Roadmap

> Versione 0.2 — 12 giugno 2026
> Allineata allo schema database reale. Le durate sono indicative (sviluppo solo founder) e da ricalibrare: l'MVP ora include la pipeline Direct Quote, quindi è più ampio della v0.1.

## Stato attuale

- [x] Progetto Supabase configurato
- [x] Schema database completo installato e versionato (`supabase/schema.sql`, migrazione 0001: 20 tabelle, RLS, indici, trigger, seed demo)
- [x] Repository Git inizializzato, `.gitignore`
- [x] Documentazione allineata allo schema (questo set, v0.2)
- [ ] Scaffold Next.js (in attesa di conferma — è un'installazione)
- [ ] Primo commit

---

## Fase 0 — Fondamenta (≈ 1 settimana)

Obiettivo: progetto riproducibile e pronto allo sviluppo.

- [x] Git + struttura repository (`app/`, `supabase/`, `docs/`).
- [x] Schema versionato nel repo.
- [ ] Scaffold Next.js + TypeScript + Tailwind in `app/` (richiede conferma installazione).
- [ ] Variabili d'ambiente e client Supabase (browser/server).
- [ ] Bucket Supabase Storage per i file della KB (`knowledge_assets.file_path`) con policy di accesso.
- [ ] Estrarre il seed demo in `supabase/seed.sql` (migrazione futura 0002 — non si tocca la 0001 già applicata).
- [ ] Automatizzare il collegamento utente→organization al signup (oggi manuale, vedi nota in coda allo schema).

**Done quando:** clone → `npm install` → app vuota collegata a Supabase con login funzionante.

## Fase 1 — MVP: Concierge + Direct Quote su web chat (≈ 8–10 settimane)

Obiettivo: una struttura pilota riceve richieste in web chat, l'AI risponde e produce proposte tracciate fino alla conferma.

### 1a — Base gestionale (≈ 2 settimane)
- Auth + onboarding organization/property; gestione membri e ruoli.
- CRUD knowledge base (asset tipizzati, upload file su Storage, versioning).
- CRUD camere e calendario tariffe (editor manuale + import CSV).
- Sync feed iCal (sola disponibilità) via job schedulato.

### 1b — Concierge AI (≈ 2 settimane)
- Endpoint `/api/chat`: prompt con KB della property (in prompt + caching), storico conversazione, streaming.
- Web chat pubblica `/c/[property]` multilingua; persistenza `conversations`/`messages`.
- Escalation (`in_attesa_staff`) e `supervision_mode`; log di ogni chiamata in `ai_calls`.

### 1c — Pipeline Direct Quote (≈ 3 settimane)
- Classificazione ed estrazione AI della richiesta (date, ospiti, bambini, lingua) → `booking_requests` (+ `ai_classification` per audit).
- Motore preventivo: prezzo da `rate_calendar`, sconto diretto, tassa di soggiorno, snapshot in `booking_request_items`, `data_reliability` da freshness tariffe.
- Macchina a stati completa (`richiesta_ricevuta` → … → `confermata`) con audit in `booking_request_events`; hold 24h e scadenza offerta via cron.
- Lead scoring (`scoring_events`) e priorità.
- Template engine (codice/canale/lingua, `ota_safe`) e follow-up automatici (`followup_rules` → `followup_jobs` + cron).

### 1d — Dashboard e chiusura MVP (≈ 2 settimane)
- Inbox richieste (ordinata per priorità/score) e conversazioni realtime; presa in carico ed esecuzione azioni di stato.
- Vista calendario tariffe, gestione template, impostazioni property (`settings`, `supervision_mode`, `knowledge_learning_mode`).
- Test RLS multi-tenant, test della macchina a stati, smoke e2e; deploy + pilot.

**Done quando:** un ospite reale chiede disponibilità in web chat, riceve una proposta calcolata, clicca "Sono interessato", lo staff conferma il pagamento e la richiesta arriva a `confermata` — tutto visibile in dashboard.

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
