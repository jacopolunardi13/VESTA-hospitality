# ARCHITECTURE

Documento centrale del progetto: **come** è fatto il sistema oggi e **perché** è stato costruito così.
È diviso in tre parti — *Current State* (solo ciò che esiste), *Architectural Principles* (il ragionamento),
*Future Evolution* (evoluzioni coerenti con i principi, non roadmap).

> **Legenda** (PROJECT_RULES §2): ✅ verificata · ◐ dedotta · ○ ipotizzata. Tutte le affermazioni di
> *Current State* sono verificate sul codice salvo diversa etichetta.

---

# Parte 1 — Current State

## Panoramica
✅ Un'app **Next.js** (Vercel) con tre canali d'ingresso (Web chat, Email, WhatsApp) che convergono su
**un'unica orchestrazione condivisa** (`processConversationTurn`). Dietro: **Supabase** (dati, RLS,
storage, pg_cron) e **Anthropic** (LLM). Il dominio è hospitality; i moduli reali sono **Front Office**
(concierge + prenotazioni) e **Back Office** (Document Center MVP).

## Orchestrazione dei canali
✅ Tutti e tre i canali chiamano `processConversationTurn` (`src/lib/booking/orchestrate.ts`):
- **Web chat** — `src/app/api/chat/route.ts`: guardrail L1 (IP blocklist, rate limit, cap sessione ~30
  msg/giorno), poi orchestrazione. Risposta **Tier 1 immediata**.
- **Email** — `src/lib/email/ingest.ts` (`ingestEmail`), innescato dal poll `/api/email/poll`: prima il
  **Router L0** + rete di sicurezza `hasAutomatedMarkers`, poi orchestrazione. Invio soggetto al
  **kill-switch** `email_autosend_enabled` (default OFF). Dedup per `gmail_message_id` + threading.
- **WhatsApp** — `src/app/api/whatsapp/webhook/route.ts` + `src/lib/whatsapp/ingest.ts`: verifica firma
  HMAC, dedup `wa_message_id`, poi orchestrazione. ◐ Canale **inerte** finché mancano le `WHATSAPP_*`
  (vedi [INFRASTRUCTURE.md](INFRASTRUCTURE.md)).

Il canale è un **adapter sottile**: normalizza l'ingresso, persiste il messaggio, delega la logica.

## Orchestrazione condivisa (`processConversationTurn`)
✅ Sequenza (`src/lib/booking/orchestrate.ts`):
1. **Short-circuit prenotazioni**: riconosce scelta camera / combinazione gruppo / comunicazione
   pagamento su un lead esistente, senza passare dall'AI.
2. **Budget / safe-mode** (`src/lib/ai/budget.ts`): se la spesa AI giornaliera supera
   `ai_daily_budget_cents` (default 500 = €5) o se `safe_mode` è attivo → pipeline **senza AI**.
3. **Storico** ultimi messaggi.
4. **Pipeline knowledge-first** (`runPipeline`).
5. **Persistenza risposta** + aggiornamento conversazione (intent/confidence/stage/status).
6. **Lead booking**: crea/collega `booking_requests`, popola slot, esegue transizioni di stato, crea
   notifiche staff e **pending action Tier 2**.

## AI Core
✅ Modelli (`src/lib/ai/models.ts`): **Haiku** (`claude-haiku-4-5`) per `classify`, `extract`,
`select_template`; **Sonnet** (`claude-sonnet-4-6`) per `generate_reply`, `distill_kb`.
✅ **Budget & safe-mode** (`src/lib/ai/budget.ts`): spesa AI loggata in `ai_calls`; oltre soglia →
safe-mode (zero AI, solo KB). Mapping/costi in dettaglio → [AI.md](AI.md).

## Router L0 (email)
✅ `src/lib/email/routing.ts` classifica **ogni** email prima della pipeline in: `guest`, `ota_pms`,
`supplier_admin`, `newsletter_spam`. Solo `guest` entra nell'orchestrazione.
- **Deterministico** prima (domini OTA/fornitori, header `List-Unsubscribe`/`Auto-Submitted`/`Precedence`).
- **AI (Haiku) solo sul dubbio** (`routing-ai.ts`): *propone* la categoria, non decide **mai** se
  rispondere; accettata solo se non-guest e confidenza ≥ 0.7.
- **Rete di sicurezza** `hasAutomatedMarkers`: un'email con marker automatici non genera mai
  lead/risposta, anche se classificata `guest`.
- **Dubbio → `guest`** (e lasciata non letta): mai perdere un ospite, mai rispondere a OTA/fornitori.

## Pipeline Knowledge-First
✅ `src/lib/ai/pipeline.ts` (`runPipeline`), ordine reale:
1. **Escalation deterministica** (regex, zero AI).
2. **Safe-mode / KB lessicale** (se AI disabilitata): risposta solo da KB.
3. **Intent detection** (Haiku): `spam`, `partnership`, `vendor`, `saas_lead`, `unclassified`, `faq`,
   `booking`, `guest_support`.
4. **Branch per intent**: spam→nessuna risposta; partnership/vendor/saas_lead/guest_support→escalation
   template; unclassified→chiarimento; faq→risposta da KB; booking→motore conversazionale.
5. **Ramo booking**: estrazione slot (Haiku), default 1 notte se manca il check-out, classificazione
   **standard/non-standard** (non-standard → staff), calcolo preventivo o combinazioni gruppo,
   **fallback di cortesia** (nessun prezzo se nessuna combinazione copre).
6. **Richiesta mista** (concierge + booking): se la KB non risponde alla parte concierge →
   `conciergeUnanswered` → notifica staff.

## Motore conversazionale & Pricing Engine
✅ Flusso prenotazioni (`orchestrate.ts` + `src/lib/quote/*`): preventivo → scelta camera/combinazione →
verifica disponibilità staff → comunicazione pagamento → conferma staff. Vesta **non blocca camere e
non dichiara "riservata"** da sola.
- `quote/priceEngine.ts` (`computeQuote`): prezzo **per-notte da `rate_calendar`**, sconto diretto /
  last-minute, tassa di soggiorno, **affidabilità del dato** (freshness). ✅ **Non** è un "modello
  canonico + adapter": è calcolo diretto su `rate_calendar` (sorgente unica). Il modello canonico+adapter
  è una **direzione di design**, non codice (vedi *Future Evolution*).
- `quote/draftProposal.ts`, `quote/roomCombinations.ts` (combinatore gruppi), `quote/stateMachine.ts`
  (`executeTransition` via RPC Supabase, atomica).

## Tier 1 / Tier 2
✅ **Tier 1 (automatico)**: risposte concierge/FAQ/preventivo informativo. Web e WhatsApp immediate;
email solo se `email_autosend_enabled` ON (default OFF).
✅ **Tier 2 (approvazione staff)**: invio proposta e conferma. Coda `pending_actions`
(`src/lib/delivery/pendingActions.ts`); alla pressione del bottone staff, `deliverToGuest`
(`src/lib/delivery/deliverToGuest.ts`) consegna sul canale della conversazione e **bypassa il
kill-switch** (azione umana esplicita). Vesta non invia IBAN né conferma da sola. → policy in
[SECURITY.md](SECURITY.md).

## Document Center (Back Office MVP)
✅ `src/lib/documents-center/*`: pattern **Registry / Recognizer**.
- `types.ts` (contratto `DocumentRecognizer`), `registry.ts` (`RECOGNIZERS`, `recognizeEmail`),
  `recognizers/booking.ts` (libreria Vesta).
- Flusso: email `ota_pms/booking` con PDF → recognizer la rivendica → PDF su Storage `documents` +
  record `document_center` (stato `ready_for_accountant`; campi estratti null nell'MVP, niente AI/OCR).
- ✅ Ingest **best-effort** (non rompe il poll) ma **mai silenzioso** (errori loggati).

## Affidabilità dei dati (Fail-Fast)
✅ Helper `src/lib/supabase/guard.ts` (`dbThrow`): ogni scrittura/lettura DB controlla `.error` e
**lancia** (dati core) o **logga** (telemetria). Nessun "successo silenzioso" (PROJECT_RULES §4).

## Notification Center
✅ **Minimale**: `src/lib/notifications.ts` (`createNotification`) inserisce in tabella `notifications`;
la dashboard le legge (polling). Tipi: `proposal_auto_sent`, `proposal_draft`, `escalation`. Nessuna
coda/pubsub/priorità/dedup. È un componente semplice, non un "sistema di notifiche".

## Non presenti nel codice (per chiarezza)
✅ **Capability Engine** e **Financial Intelligence**: **non implementati** (nessun riferimento nel
codice). Sono direzione futura — vedi *Future Evolution*.

## Flussi principali (sintesi)
- **Concierge**: messaggio → canale → orchestrazione → pipeline KB-first → risposta Tier 1.
- **Booking**: richiesta → lead + preventivo → scelta → verifica staff → pagamento → conferma staff (Tier 2).
- **Email non-ospite**: Router L0 → `ota_pms` (+ Document Center se Booking con PDF) / `supplier_admin` /
  `newsletter_spam` (solo log/archivio, nessuna risposta).

---

# Parte 2 — Architectural Principles

- **Perché Knowledge-First.** Rispondere prima dalla conoscenza curata (KB) e dalle regole
  deterministiche, e usare l'AI solo quando serve, dà risposte più **affidabili e controllabili** e
  riduce i **costi**. L'AI è un componente, non il cuore decisionale.
- **Perché Human-in-the-Loop (Tier 2).** Le azioni che impegnano denaro, camere o promesse verso
  l'ospite sono difficili da annullare: le approva lo staff. Vesta **assiste**, non decide al posto del
  gestore. È una scelta di **fiducia e sicurezza**, non un limite tecnico.
- **Perché orchestrazione condivisa.** Un solo `processConversationTurn` per tutti i canali evita che
  Web, Email e WhatsApp **divergano**: la logica vive in un posto solo, il canale è un adapter sottile.
- **Perché moduli separati + Registry/Recognizer.** Ogni capability è isolata e si estende
  **aggiungendo** una scheda al registro, senza toccare l'idraulica (poll/ingest). Dimostrato col
  Document Center: un nuovo fornitore = un nuovo recognizer.
- **Perché evitare astrazioni premature.** Il pricing è diretto su `rate_calendar`; il "modello
  canonico + adapter" e il Capability Engine **non** sono ancora codice. Si costruisce l'astrazione
  quando un **secondo caso reale** la giustifica, non prima.
- **Perché Product First.** L'architettura segue il prodotto: ogni livello di complessità deve dare un
  beneficio reale (PROJECT_RULES, Principio guida).
- **Compromessi accettati.** Progetto Supabase unico per tutti gli ambienti; migrazioni manuali;
  pricing a sorgente unica; Notification Center minimale. Sono scelte di semplicità del pilota,
  documentate e reversibili (vedi [INFRASTRUCTURE.md](INFRASTRUCTURE.md), [DATABASE.md](DATABASE.md)).
- **Errore da non ripetere.** Gli errori DB venivano ingoiati → un guasto restava nascosto (incidente
  duplicazione, [CHANGELOG.md](CHANGELOG.md)). Da qui la **Fail-Fast Policy**.

## Principi da non violare
1. Vesta **non** blocca camere, **non** invia IBAN, **non** conferma prenotazioni in autonomia (Tier 2).
2. **Knowledge-first**: deterministico/KB prima dell'AI.
3. **Orchestrazione unica** per tutti i canali.
4. **Fail-fast**: nessun errore DB ingoiato.
5. **Idempotenza/dedup** sugli ingressi (email, WhatsApp, documenti).
6. **Isolamento multi-tenant** (RLS `org_id`).
7. **Dubbio → tratta come ospite** e non agire automaticamente.

---

# Future Evolution
*Evoluzioni coerenti con i principi sopra. NON è una roadmap né un impegno; sono direzioni che, se
realizzate, rispetterebbero l'architettura attuale.* Direzione di prodotto → [BUSINESS.md](BUSINESS.md),
[ROADMAP.md](ROADMAP.md).

- **Capability Engine**: generalizzare il pattern Registry/Recognizer alle altre aree (Front Office /
  Operations / Back Office / Financial Intelligence / Revenue / Operational Memory), **solo** quando un
  secondo dominio lo giustifica (no astrazioni premature).
- **Document Intelligence**: far evolvere il Document Center da archivio a generatore di conoscenza/azioni
  (scadenze, rinnovi), mantenendo l'ingest **sorgente-agnostico** (email / cloud / upload).
- **Financial Intelligence**: riconciliazione economica (prenotazioni · pagamenti · payout · commissioni
  · fatture), appoggiandosi ai dati già linkati (`ota_inbox`, `document_center`).
- **Pricing adapter**: introdurre adapter per fonti esterne (Airbnb/Booking API) **dietro** l'attuale
  interfaccia di preventivo, senza riscrivere il motore.
- **Notification Center reale**: priorità/canali/dedup, se il volume lo richiederà.

---

## Related Documents
- [../PROJECT_RULES.md](../PROJECT_RULES.md) — Product First, Human-in-the-Loop, Fail-Fast
- [DATABASE.md](DATABASE.md) — schema, stato, RLS
- [INFRASTRUCTURE.md](INFRASTRUCTURE.md) — servizi, cron, ambienti
- [AI.md](AI.md) — modelli, pipeline, prompt, costi, brand voice
- [KNOWLEDGE.md](KNOWLEDGE.md) — sistema KB e retrieval
- [BUSINESS.md](BUSINESS.md) · [DOMAINS.md](DOMAINS.md) — visione, Capability Engine, verticali
- [SECURITY.md](SECURITY.md) — Tier 2, kill-switch, policy azioni
- [CHANGELOG.md](CHANGELOG.md) · [DECISIONS.md](DECISIONS.md) — incidente e decisioni
