# AI Concierge & Direct Quote — Product Brief

> Versione 0.10 — 13 giugno 2026
> Allineata allo schema database reale (`supabase/schema.sql`, migrazione 0001). Aggiunti cost control & anti abuse, **prezzo dinamico operativo**, **intent detection** a 8 categorie, KPI del funnel, **LunArt Voice**, fase finale MVP (**governo sconti, human handoff con SLA, dashboard KPI**) e **Property Knowledge System**.

## 1. Visione

AI Concierge è un **SaaS multi-tenant** per hotel indipendenti, B&B, affittacamere e case vacanza che unisce due motori complementari:

1. **Concierge AI** — risponde agli ospiti 24/7, in linguaggio naturale e multilingua, sui canali che già usano, attingendo alla knowledge base della struttura.
2. **Direct Quote** — trasforma le richieste di informazioni in **preventivi diretti tracciati**: calcolo prezzo da calendario tariffe, sconto diretto rispetto alle OTA, proposta con scadenza, blocco disponibilità (hold 24h), conferma a pagamento ricevuto. Ogni richiesta è un lead con punteggio e follow-up automatici.

Il concierge porta la conversazione; il Direct Quote la converte in prenotazione disintermediata.

## 2. Problema

- Le strutture ricettive indipendenti ricevono decine di richieste ripetitive al giorno su canali frammentati e non possono presidiarli 24/7.
- Le richieste di disponibilità arrivano via chat/email/OTA e vengono gestite a mano: risposte lente, preventivi non tracciati, lead persi, nessun follow-up.
- Le OTA trattengono commissioni del 15–25%: ogni prenotazione spostata sul canale diretto è margine recuperato.
- Le soluzioni enterprise esistenti sono costose e pensate per catene, non per strutture indipendenti.

## 3. Soluzione

Per ogni **organization** (il tenant: il soggetto che paga e ha gli utenti) con una o più **properties** (strutture):

1. **Intent detection obbligatoria**: ogni conversazione inizia con la classificazione dell'intento in 8 categorie (prenotazione, FAQ, assistenza ospite, partnership/agenzie, commerciale/venditori, **interesse prodotto/gestore struttura**, spam, non classificato). **Solo "prenotazione" entra nel flusso Direct Quote**: niente preventivi a chi chiede il Wi-Fi, vende servizi o fa spam. FAQ usa la knowledge base; partnership e commerciale finiscono in inbox dedicate; i gestori incuriositi dal software diventano **lead SaaS ad alta priorità** (il prodotto si vende da solo dentro le chat dei clienti); spam archiviato senza consumare AI; il non classificato riceve una domanda di chiarimento.
2. **Risposte AI grounded** sulla knowledge base della struttura (FAQ, brochure, PDF, procedure, policy), con priorità alle correzioni dello staff.
3. **Pipeline preventivi**: richiesta (intent = prenotazione) → estrazione dati → calcolo prezzo dallo snapshot tariffe → proposta con sconto diretto e scadenza → "Sono interessato" → blocco 24h → pagamento → conferma. Ogni transizione è tracciata (audit trail).
4. **Prezzo dinamico, non listino**: non esiste un listino stagionale fisso — il prezzo cambia anche ogni giorno in funzione di camere invendute, last minute, promozioni attive e offerte sui portali (Booking/Expedia). Il calendario tariffe è quindi uno **snapshot operativo aggiornabile** (manuale, CSV, iCal, API, stime OTA), mai una verità assoluta. **Regola fondamentale**: la proposta automatica può usare il prezzo presente nel sistema, ma deve sempre esporre fonte del prezzo, ultimo aggiornamento e affidabilità prezzo/disponibilità — e lo staff può modificare prezzo e offerta prima dell'invio o del blocco camera (override tracciato).
5. **Lead scoring trasparente**: punteggio 0–100 per richiesta, con storico degli eventi che lo hanno generato; inbox ordinabile per priorità.
6. **Follow-up automatici** configurabili per stato (reminder offerta, istruzioni check-in post-conferma), via template multicanale e multilingua.
7. **Source tracking dettagliato**: 14 canali di provenienza in 4 categorie (direct / ota / social / manual). I template per canali OTA sono marcati `ota_safe` (mai IBAN o link diretti, nel rispetto delle policy dei portali).
8. **KB auto-learning**: le correzioni dello staff e le domande senza risposta (gap) diventano proposte di knowledge base, con ciclo di approvazione configurabile per struttura (manual / assisted / automatic).
9. **Supervisione**: in modalità rodaggio (`supervision_mode`) le proposte AI richiedono l'ok dello staff prima dell'invio.
10. **Costi AI sotto controllo by design**: pipeline knowledge-first (FAQ, template e regole rispondono prima dell'AI; l'AI è l'ultima risorsa), budget AI giornaliero per struttura con alert automatici, protezioni anti-abuso (rate limit, limiti per sessione) e **safe mode** (solo FAQ e template, zero AI) attivabile manualmente o automaticamente.
11. **Dashboard gestore**: inbox conversazioni e richieste, calendario tariffe, knowledge base, template, statistiche, log AI e monitoraggio costi/protezioni.

## 4. Utenti target

| Persona | Descrizione | Bisogno principale |
|---|---|---|
| **Owner** | Proprietario dell'organization (1–N strutture, 1–30 unità ciascuna) | Più prenotazioni dirette, meno tempo al telefono |
| **Manager / Staff** | Collaboratori con ruoli differenziati (`owner` / `manager` / `staff`) | Inbox unificata, supervisione proposte AI, presa in carico |
| **Ospite** | Cliente prima, durante e dopo il soggiorno | Risposta e preventivo in secondi, nella propria lingua e canale |

## 5. Proposta di valore

- **Per il gestore**: risposta immediata 24/7, preventivi calcolati e tracciati invece che a mano, recupero margine OTA tramite sconto diretto controllato, follow-up che non si dimenticano.
- **Per l'ospite**: risposta in secondi, proposta chiara con prezzo e scadenza, possibilità di bloccare la disponibilità.
- **Differenziatori**: pipeline quote-to-book integrata nel concierge (non solo Q&A); multi-tenant nativo a due livelli (organization → properties); compliance OTA by design (`ota_safe`); AI provider-agnostic con log costi per chiamata; **tono di marca definito** ([LunArt Voice](lunart-voice.md)): professionale e cordiale, zero emoji salvo rare eccezioni, costruito su fiducia e conversione — la voce di un ottimo receptionist, non di "un chatbot".

## 6. Funzionalità

### MVP (Fase 1) — Concierge + Direct Quote su web chat
- Onboarding organization + property; membri con ruoli.
- **Property Knowledge System** ([specifica dedicata](property-knowledge-system.md)): la fonte unica di verità della struttura — asset tipizzati con versioning e priorità di retrieval, categorie standard con le 9 domande d'oro obbligatorie, separazione rigida dati strutturati/testo (i numeri non vivono mai nelle FAQ), coverage score, gap report e correzioni dello staff che battono sempre il testo originale. Multi-struttura, modificabile dal gestore senza interventi tecnici.
- **Web chat ospite** (link/QR, multilingua, nessun login).
- **Intent detection** su ogni conversazione (8 categorie) con instradamento: solo "prenotazione" genera booking request; inbox dedicate per partnership/commerciale e **Lead SaaS** (gestori interessati al software, priorità alta); spam archiviato senza AI; "Inbox per categoria" con conteggi separati in dashboard.
- Motore conversazionale Claude con grounding sulla KB della property.
- **Pipeline Direct Quote completa**: estrazione dati richiesta (date, ospiti, bambini), calcolo prezzo da calendario tariffe, proposta con sconto diretto/tassa di soggiorno/scadenza, stati fino a `confermata`, hold 24h, audit trail.
- Inventario: camere, calendario tariffe (inserimento manuale + import CSV; feed iCal per la disponibilità).
- Lead scoring con eventi trasparenti; indicatore di affidabilità dati (freshness tariffe).
- Template messaggi (codice / canale / lingua, varianti `ota_safe`) e follow-up automatici schedulati.
- Escalation: stato `pending_staff` + `supervision_mode` per struttura.
- Dashboard: inbox richieste e conversazioni, KB, tariffe, template, impostazioni.
- **Cost control & anti abuse**: pipeline knowledge-first, rate limit per IP, limiti per sessione e per conversazione, budget AI giornaliero con alert (80%/100%, traffico anomalo, conversazioni fuori soglia), safe mode, log e report (`ai_calls` + eventi di protezione).
- **Governo commerciale**: sconto diretto standard + sconto extra di trattativa che l'AI può concedere **una sola volta ed entro soglie decise dalla struttura** (con prezzo minimo invalicabile); oltre, si ferma e passa allo staff. Ogni concessione è tracciata.
- **Human handoff con SLA**: mappa escalation a 4 priorità (reclami/pagamenti 15 min · trattative/gruppi/VIP 1 h · gap KB/lead 4 h · partnership 24 h), handoff card con contesto completo e countdown, alert a metà SLA e a sforamento.
- **Dashboard KPI** a 5 blocchi: operativo, commerciale, conversione, OTA vs diretto, AI vs staff.

### Post-MVP (Fasi 2–3)
- Canali **WhatsApp** ed **email** (il DB già traccia tutti i source, inclusi social e Google Business).
- **KB auto-learning** attivo end-to-end (cattura correzioni/gap → distillazione AI → approvazione → pubblicazione).
- Retrieval semantico (embeddings/RAG): lo schema è già predisposto (`knowledge_embeddings`, provider-agnostic); nell'MVP la KB viaggia interamente nel prompt con caching.
- Integrazione messaggistica **OTA** (Booking.com, Expedia, Airbnb), social (Instagram, Messenger).
- Pagamenti online integrati (oggi: verifica manuale del bonifico/pagamento da parte dello staff).
- Billing SaaS e piani di abbonamento (Stripe), analytics avanzate.

### Fuori scope (per ora)
- Channel manager in scrittura verso le OTA (i feed iCal sono di sola lettura, mai prezzi).
- PMS completo (si valuteranno integrazioni).
- App mobile nativa.

## 7. Canali di interazione

Il database traccia 14 source in 4 categorie. Attivazione per fase:

| Categoria | Source | Fase |
|---|---|---|
| direct | `website_chat`, `website_form` | **MVP** |
| direct | `whatsapp`, `email` | Fase 2 |
| direct | `google_business`, `direct_phone`, `walk_in` | Fase 2–3 (inserimento manuale da subito via `manual`) |
| ota | `booking_message`, `expedia_message`, `airbnb_message`, `ota_other` | Fase 3 |
| social | `instagram_dm`, `facebook_messenger` | Fase 3 |
| manual | `manual` | **MVP** (inserimento richieste a mano da dashboard) |

## 8. Modello di business (ipotesi)

- Abbonamento mensile per organization, a fasce su numero di properties/camere/conversazioni.
- Argomento di vendita centrale: il servizio si ripaga con poche prenotazioni dirette recuperate dalle commissioni OTA.
- Trial gratuito; pricing definitivo da validare con i pilot.

## 9. Metriche di successo — KPI del funnel

Il funnel è misurato end-to-end per ogni property (definizioni tecniche nel dev-plan §7-bis.6):

```
Richieste ricevute → Preventivi inviati → Interessati → Camere bloccate → Confermate
```

| KPI | Cosa misura |
|---|---|
| **Richieste ricevute** | Domanda intercettata, per canale/periodo |
| **Preventivi inviati** (+ tempo richiesta→proposta, target < 1 min) | Capacità di risposta automatica |
| **Camere bloccate** | Intenzione concreta (hold attivati) |
| **Prenotazioni confermate** | Risultato finale |
| **Conversione end-to-end** (confermate/ricevute, + per step) | La metrica regina del Direct Quote |
| **Valore medio prenotazione** e valore totale generato | Impatto economico (= commissioni OTA risparmiate) |

A contorno: % richieste risolte dall'AI senza staff (target iniziale 60–70%), costo AI per prenotazione confermata, tempo di onboarding nuova property (< 1 giorno), retention mensile dei tenant.

La dashboard KPI (D13) organizza tutte le metriche in **5 blocchi**: operativo ("stiamo rispondendo in tempo?" — inclusi gli SLA di handoff), commerciale ("quanto sta fruttando?" — incluso il margine ceduto in trattativa), conversione ("dove perdo gli ospiti?"), OTA vs diretto ("quanto sto risparmiando?"), AI vs staff ("quanto fa da sola l'AI?").

## 10. Assunzioni da validare

- [ ] I gestori tengono aggiornato il calendario tariffe (manuale/CSV/iCal) quanto basta per proposte affidabili → mitigata da `data_reliability` e indicatori di freshness.
- [ ] Lo sconto diretto (default 10%) è sufficiente a spostare l'ospite dal portale al canale diretto.
- [ ] Il flusso di pagamento manuale (bonifico + verifica staff) regge nell'MVP senza pagamenti online.
- [ ] Accesso alle API di messaggistica OTA ottenibile per un SaaS in fase iniziale (Fase 3).
- [ ] Costi AI per richiesta sostenibili (misurabili da subito via `ai_calls`).

## Documenti correlati

- [Roadmap](roadmap.md)
- [Dev Plan](dev-plan.md)
- Schema database: `supabase/schema.sql`
