# ARCHITECTURE

Documento centrale del progetto: **come è progettato** Vesta come piattaforma operativa ("sistema
operativo" del back office hospitality), **com'è fatto oggi** e **perché**. Tre parti — *Current State*
(ciò che esiste), *Architectural Principles* (il ragionamento), *Future Evolution* (evoluzioni coerenti,
non roadmap) — precedute dal **Modello di sistema** ufficiale.

> **Legenda** (PROJECT_RULES §2): ✅ verificata · ◐ dedotta/parziale · ○ concettuale/futuro. Le
> affermazioni di *Current State* sono verificate sul codice salvo diversa etichetta.

---

# Parte 0 — Modello di sistema (architettura ufficiale)

## Principio guida
> **L'acquisizione non dipende mai dagli interpreti.** Ogni informazione che entra viene *catturata e
> registrata* prima e indipendentemente da qualsiasi interpretazione. Gli interpreti aggiungono
> **significato**, non decidono **cosa entra**. (Vale per documenti, messaggi, prenotazioni, pagamenti,
> eventi API — tutto.) Decisione: [DECISIONS.md](DECISIONS.md) ADR-0016, ADR-0017.

Conseguenza: Vesta **non** è una collezione di moduli con ingressi separati, ma **una spina dorsale
unica** a strati, su cui i domini si innestano (il *Capability Engine* è il framework che li rende
innestabili, non un nodo del dataflow).

## Strati
```
        ┌──────────── FOUNDATION (trasversale) ────────────┐
        │ Identity & Tenant · Security & Policy · Audit     │
        └──────────────────────────────────────────────────┘
 INGRESS      INTAKE         EVENT MODEL      INTERPRETATION       DOMINI
 adapters  → Operational  → (system of    →  Classification +  →  Conversation · Booking
 (email/WA/   Intake         record +        Recognition/         Document Intelligence
 web/OTA/     (cattura        dispatch,       Extraction           Financial Intelligence
 API/webhook/ garantita)      logico)         regole→parser→AI     (Operations/Revenue futuri)
 upload/…)                                    MAI gate                    │
                                                                          ▼
            KNOWLEDGE & MEMORY                                    ACTION & OUTPUT
       Knowledge Engine · Operational Memory   →   Automation → Human-in-the-Loop
                                                    → Delivery (esterno) / Notification (staff)
                                                                          │
                                              outcome → nuovo evento (audit / re-interpretazione)
```

## Blocchi e maturità
| Strato | Blocco | Responsabilità (sintesi) | Maturità |
|---|---|---|---|
| Foundation | Identity & Tenant | isolamento org/property (RLS); identità attori/soggetti | ✅ |
| Foundation | Security & Policy | tier azioni, kill-switch, budget, guardrail | ✅ parziale |
| Foundation | Audit & Observability | traccia immutabile (routing log, ai_calls) | ✅ parziale |
| Ingress | Channel Adapters | protocollo canale → envelope canonico; dedup sorgente | ✅ email/WA/web · ◐ OTA · ○ API/webhook generici |
| Acquisizione | **Operational Intake** | cattura garantita, normalizza, salva raw+allegati | ◐ solo Booking/email |
| Backbone | **Event Model** | system of record + dispatch (logico, no bus) | ○ implicito (tabelle+chiamate) |
| Interpretazione | Classification & Routing | "che tipo è?" (Router L0) | ✅ |
| Interpretazione | Recognition & Extraction | fornitore/categoria/campi/entità; regole→parser→AI | ◐ Booking + parser OTA |
| Dominio | Conversation Engine | dialogo ospite multicanale | ✅ |
| Dominio | Booking Engine | ciclo prenotazione | ✅ |
| Dominio | Document Intelligence | documenti → conoscenza/azioni | ◐ MVP Booking |
| Dominio | Financial Intelligence | riconciliazione economica | ○ futuro |
| Conoscenza | Knowledge Engine | KB **curata** per rispondere | ✅ (lessicale) |
| Memoria | Operational Memory | conoscenza **derivata/accumulata** (entità/scadenze) | ○ futuro |
| Azione | Automation Engine | regole/schedulazioni/scadenze/follow-up | ◐ cron base |
| Azione | Human-in-the-Loop | gate approvazione (Tier 2) | ✅ |
| Azione | Delivery (esterno) | consegna a ospite/fornitore | ✅ |
| Azione | Notification (interno) | avvisi staff | ✅ minimale |
| Meta | Capability Engine | **framework** che rende i blocchi innestabili (non runtime) | ◐ embrione (Registry/Recognizer) |

Distinzioni nette: **Knowledge (curata, per rispondere) ≠ Operational Memory (derivata, per
ricordare/agire)**; **Delivery (esterno) ≠ Notification (staff)**; **Event Model logico ≠ message bus**
(no infrastruttura distribuita finché la scala non la impone — Product First).

## Envelope canonico
Ogni input, da qualunque canale, diventa un **OperationalItem**:
`{ id, tenant(org/property), channel, received_at, sender_identity(raw), correlation/thread_ref,
raw_payload_ref, attachments[], dedup_keys(source_id, content_hash), type=unknown, interpretations=[] }`.
L'Intake ne garantisce l'esistenza; l'Interpretazione **aggiunge** a `type`/`interpretations`, non li
richiede per entrare. (◐ Oggi l'envelope è implicito nei singoli percorsi; è il punto di
generalizzazione futura.)

## Flusso end-to-end (canonico)
`Ingress → Intake (raw+allegati salvati, item creato, dedup) → Event "received" → Classification (tipo)
→ Recognition/Extraction (arricchimento, re-eseguibile) → Dominio/i competenti (stato + Memory +
Knowledge) → Automation (regole) → Policy/Human-in-the-Loop → Delivery/Notification → Event "actioned"`.

**Casi (stessa spina, canali diversi):**
- *Email guest + PDF*: conversazione (Conversation Engine) **e**, in parallelo, intake del PDF (Document
  Intelligence). ◐ *Oggi* il PDF di un'email guest non viene archiviato; nel modello target sì.
- *Email fornitore + fattura*: nessuna conversazione; intake documento → interprete → categoria/scadenza
  → Memory → Automation (promemoria) → Notification staff.
- *Immagine WhatsApp (contabile)*: intake media → (OCR futuro) → collega a pagamento/prenotazione.
- *Prenotazione OTA*: intake → reservation staging (+ eventuale fattura) → Financial (futuro).
- *API/Webhook*: adapter HTTP → stesso envelope → dominio per tipo. Nessun percorso speciale.
- *Upload manuale*: già intake universale (sorgente `upload`) → stessi interpreti.
- *Canali futuri (PEC, cloud sync)*: nuovo adapter → stesso envelope → zero modifiche a valle.

---

# Parte 1 — Current State (componenti reali, mappati agli strati)

## Panoramica
✅ App **Next.js** (Vercel) con tre canali (Web chat, Email, WhatsApp) che convergono su **un'unica
orchestrazione** (`processConversationTurn`). Dietro: **Supabase** (dati, RLS, storage, pg_cron) e
**Anthropic** (LLM). Dominio: hospitality; moduli reali: **Front Office** (concierge + prenotazioni) e
**Back Office** (Document Center MVP).

## Channel Adapters + Orchestrazione (Ingress → Conversation)
✅ Tutti e tre i canali chiamano `processConversationTurn` (`src/lib/booking/orchestrate.ts`):
- **Web chat** — `src/app/api/chat/route.ts`: guardrail L1 (IP blocklist, rate limit, cap sessione ~30
  msg/giorno), poi orchestrazione. Risposta **Tier 1 immediata**.
- **Email** — `src/lib/email/ingest.ts` (`ingestEmail`), via poll `/api/email/poll`: prima **Router L0**
  + rete `hasAutomatedMarkers`, poi orchestrazione. Invio soggetto al **kill-switch**
  `email_autosend_enabled` (default OFF). Dedup `gmail_message_id` + threading.
- **WhatsApp** — `src/app/api/whatsapp/webhook/route.ts` + `src/lib/whatsapp/ingest.ts`: firma HMAC,
  dedup `wa_message_id`. ◐ **inerte** finché mancano le `WHATSAPP_*`.

Il canale è un **adapter sottile**: normalizza l'ingresso, persiste il messaggio, delega la logica.
(◐ Nota architetturale: oggi l'adapter chiama direttamente l'orchestrazione conversazione; nel modello
target l'adapter alimenta prima Intake/Event Model, e i domini consumano gli eventi.)

## Orchestrazione condivisa (`processConversationTurn`)
✅ Sequenza: 1) short-circuit prenotazioni (scelta camera/combinazione/pagamento, no AI); 2) budget /
safe-mode (`ai_daily_budget_cents` default 500=€5 → pipeline senza AI); 3) storico; 4) pipeline
knowledge-first (`runPipeline`); 5) persistenza risposta + update conversazione; 6) lead booking
(crea/collega `booking_requests`, slot, transizioni, notifiche, **pending action Tier 2**).

## AI Core (Interpretazione)
✅ Modelli (`src/lib/ai/models.ts`): **Haiku** per `classify`/`extract`/`select_template`; **Sonnet**
per `generate_reply`/`distill_kb`. ✅ Budget & safe-mode (`src/lib/ai/budget.ts`, `ai_calls`). Dettaglio
→ [AI.md](AI.md).

## Classification & Routing (Router L0)
✅ `src/lib/email/routing.ts`: categorie `guest`/`ota_pms`/`supplier_admin`/`newsletter_spam`.
Deterministico (domini OTA + `BASE_SUPPLIER` + header) → **AI solo sul dubbio** (`routing-ai.ts`,
propone, non decide se rispondere, ≥0.7) → **dubbio = `guest`**. Rete `hasAutomatedMarkers` indipendente.
(✅ Coerente col principio: classifica il *tipo*, non decide se l'item "entra".)

## Pipeline Knowledge-First
✅ `src/lib/ai/pipeline.ts` (`runPipeline`): 1) escalation deterministica; 2) safe-mode/KB lessicale;
3) intent (Haiku); 4) branch per intent; 5) ramo booking (slot, default 1 notte, standard/non-standard,
preventivo/combinazioni, fallback cortesia); 6) richiesta mista concierge+booking.

## Booking Engine & Pricing
✅ `orchestrate.ts` + `src/lib/quote/*`: preventivo → scelta → verifica staff → pagamento → conferma.
Vesta **non blocca camere né dichiara "riservata"** da sola. `quote/priceEngine.ts` = prezzo per-notte da
`rate_calendar` (sconti, tassa, affidabilità). ✅ **Non** è "canonico + adapter" (calcolo diretto;
adapter = Future Evolution). `quote/stateMachine.ts` = transizioni via RPC.

## Tier 1 / Tier 2 + Delivery (Action & Output)
✅ **Tier 1** automatico (concierge/FAQ/preventivo informativo; email solo se autosend ON). ✅ **Tier 2**
con approvazione staff: coda `pending_actions` → `deliverToGuest` consegna sul canale e **bypassa il
kill-switch**. Vesta non invia IBAN né conferma da sola. → [SECURITY.md](SECURITY.md).

## Document Intelligence (Back Office MVP)
✅ `src/lib/documents-center/*`: pattern **Registry / Recognizer** + **upload manuale**
(`/api/documents/upload`, sorgente `upload`, qualsiasi PDF).
- ◐ Via email: l'archiviazione scatta **solo** nel ramo `ota_pms` con recognizer Booking (gatekeeping).
  **Decisione M4 (ADR-0017)**: invertire verso *Universal Document Intake* (intake garantito, recognizer
  = interpreti) → vedi *Future Evolution*.
- Flusso attuale: email `ota_pms/booking` con PDF → recognizer → PDF su Storage `documents` + record
  `document_center` (`ready_for_accountant`; campi estratti null nell'MVP). Ingest **best-effort** ma
  **mai silenzioso**.

## Knowledge Engine
✅ `src/lib/ai/knowledge.ts`: retrieval **lessicale** (stemmer IT + stopword); `knowledge_assets`,
filtro `usable_by_concierge`/`deleted_at`; prompt caching. Dettaglio → [KNOWLEDGE.md](KNOWLEDGE.md).
(○ **Operational Memory** — conoscenza derivata — è blocco distinto e futuro.)

## Affidabilità dei dati (Fail-Fast)
✅ `src/lib/supabase/guard.ts` (`dbThrow`): ogni accesso DB controlla `.error` → lancia (dati core) o
logga (telemetria). Nessun "successo silenzioso" (PROJECT_RULES §4).

## Notification (Action & Output)
✅ **Minimale**: `src/lib/notifications.ts` → tabella `notifications`, letta in dashboard (polling). Non
è un "sistema di notifiche".

## Non presenti nel codice (per chiarezza)
✅ **Operational Memory**, **Financial Intelligence**, **Event Model formalizzato**, **Capability
Engine** come framework runtime: **non implementati**. Sono strati/blocchi target — *Future Evolution*.

---

# Parte 2 — Architectural Principles

- **Acquisizione indipendente dagli interpreti** (principio guida, ADR-0016/0017): l'item entra e viene
  registrato sempre; gli interpreti arricchiscono, non gateano.
- **Knowledge-First.** Regole/KB deterministiche prima dell'AI → affidabilità, controllo, costo. L'AI è
  un componente, non il cuore.
- **Human-in-the-Loop (Tier 2).** Le azioni irreversibili verso l'ospite le approva lo staff. Vesta
  assiste, non sostituisce.
- **Orchestrazione/spina unica.** Un solo percorso condiviso evita divergenze tra canali; il canale è un
  adapter sottile.
- **Domini innestabili (Capability Engine = framework, non blocco).** Registry/Recognizer come pattern;
  si estende aggiungendo, non modificando l'idraulica.
- **Evitare astrazioni premature (Product First).** Event Model **logico**, non un bus; pricing diretto;
  Capability Engine come pattern. L'astrazione arriva quando un **secondo caso reale** la giustifica.
- **Compromessi accettati.** Supabase unico per ambienti; migrazioni manuali; pricing sorgente unica;
  Notification minimale; Event Model implicito. Documentati e reversibili.
- **Errore da non ripetere.** Errori DB ingoiati → guasti nascosti (incidente duplicazione) → Fail-Fast.

## Principi da non violare
1. **Acquisizione prima e indipendente dagli interpreti**; interpretazione additiva, re-eseguibile, **mai
   gate**, mai irreversibile.
2. Vesta **non** blocca camere, **non** invia IBAN, **non** conferma in autonomia (Tier 2).
3. **Knowledge-first**: deterministico/KB prima dell'AI.
4. **Spina unica**: i domini parlano ai canali solo via **Delivery**; lo staff via **Notification**.
5. **Azioni impegnative sempre sotto Policy/Human-in-the-Loop.**
6. **Fail-fast**: nessun errore DB ingoiato. **Event Model = registro**, non stato di dominio.
7. **Idempotenza/dedup** sugli ingressi. **Isolamento multi-tenant** (RLS). **Dubbio → tratta come
   ospite** e non agire.

---

# Future Evolution
*Evoluzioni coerenti con gli strati sopra. NON è una roadmap né un impegno.* Prodotto → [BUSINESS.md](BUSINESS.md);
priorità → [ROADMAP.md](ROADMAP.md).

- **Universal Document Intake** (ADR-0017): l'intake documenti diventa garantito e indipendente dai
  recognizer (che diventano interpreti); ingest sorgente-agnostico (email/cloud/upload). Migrazione
  graduale dietro flag, Booking invariato.
- **Operational Intake generalizzato + Event Model formalizzato**: envelope canonico + tabella eventi/
  outbox, introdotti **quando** serve disaccoppiare (non prima).
- **Operational Memory**: grafo entità/relazioni/scadenze derivato dagli eventi/documenti.
- **Financial Intelligence**: riconciliazione (prenotazioni·pagamenti·payout·commissioni·fatture).
- **Recognition library**: interpreti incrementali (Amazon, Enel, Aruba, TIM, Agenzia Entrate, …),
  globale + per-struttura (Business Identity Library).
- **Pricing adapter**, **Notification Center reale**, **OCR immagini**: quando il valore lo giustifica.

## Decisioni aperte (per le fasi successive)
- Privacy: intake degli allegati delle **email ospite** (sì/no, mascheramento).
- `content_hash` per dedup di **contenuto** (stesso documento da più canali).
- Quanto/quando formalizzare l'**Event Model** (tabella eventi vs chiamate dirette).

---

## Related Documents
- [../PROJECT_RULES.md](../PROJECT_RULES.md) — Product First, Human-in-the-Loop, Fail-Fast
- [DECISIONS.md](DECISIONS.md) — ADR-0016 (OS a strati), ADR-0017 (Universal Intake), ADR-0014 (superata)
- [DATABASE.md](DATABASE.md) · [INFRASTRUCTURE.md](INFRASTRUCTURE.md) · [ENVIRONMENT.md](ENVIRONMENT.md)
- [AI.md](AI.md) · [KNOWLEDGE.md](KNOWLEDGE.md) — interpretazione e conoscenza
- [BUSINESS.md](BUSINESS.md) · [DOMAINS.md](DOMAINS.md) — visione, Capability Engine, verticali
- [SECURITY.md](SECURITY.md) — Tier 2, kill-switch, policy azioni
- [CHANGELOG.md](CHANGELOG.md) — eventi e incidenti
