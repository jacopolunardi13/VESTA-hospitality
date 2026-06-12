# AI Concierge & Direct Quote — Product Brief

> Versione 0.2 — 12 giugno 2026
> Allineata allo schema database reale (`supabase/schema.sql`, migrazione 0001).

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

1. **Risposte AI grounded** sulla knowledge base della struttura (FAQ, brochure, PDF, procedure, policy), con priorità alle correzioni dello staff.
2. **Pipeline preventivi**: richiesta → classificazione AI → calcolo prezzo da `rate_calendar` → proposta con sconto diretto e scadenza → "Sono interessato" → blocco 24h → pagamento → conferma. Ogni transizione è tracciata (audit trail).
3. **Lead scoring trasparente**: punteggio 0–100 per richiesta, con storico degli eventi che lo hanno generato; inbox ordinabile per priorità.
4. **Follow-up automatici** configurabili per stato (reminder offerta, istruzioni check-in post-conferma), via template multicanale e multilingua.
5. **Source tracking dettagliato**: 14 canali di provenienza in 4 categorie (direct / ota / social / manual). I template per canali OTA sono marcati `ota_safe` (mai IBAN o link diretti, nel rispetto delle policy dei portali).
6. **KB auto-learning**: le correzioni dello staff e le domande senza risposta (gap) diventano proposte di knowledge base, con ciclo di approvazione configurabile per struttura (manual / assisted / automatic).
7. **Supervisione**: in modalità rodaggio (`supervision_mode`) le proposte AI richiedono l'ok dello staff prima dell'invio.
8. **Dashboard gestore**: inbox conversazioni e richieste, calendario tariffe, knowledge base, template, statistiche e log AI.

## 4. Utenti target

| Persona | Descrizione | Bisogno principale |
|---|---|---|
| **Owner** | Proprietario dell'organization (1–N strutture, 1–30 unità ciascuna) | Più prenotazioni dirette, meno tempo al telefono |
| **Manager / Staff** | Collaboratori con ruoli differenziati (`owner` / `manager` / `staff`) | Inbox unificata, supervisione proposte AI, presa in carico |
| **Ospite** | Cliente prima, durante e dopo il soggiorno | Risposta e preventivo in secondi, nella propria lingua e canale |

## 5. Proposta di valore

- **Per il gestore**: risposta immediata 24/7, preventivi calcolati e tracciati invece che a mano, recupero margine OTA tramite sconto diretto controllato, follow-up che non si dimenticano.
- **Per l'ospite**: risposta in secondi, proposta chiara con prezzo e scadenza, possibilità di bloccare la disponibilità.
- **Differenziatori**: pipeline quote-to-book integrata nel concierge (non solo Q&A); multi-tenant nativo a due livelli (organization → properties); compliance OTA by design (`ota_safe`); AI provider-agnostic con log costi per chiamata.

## 6. Funzionalità

### MVP (Fase 1) — Concierge + Direct Quote su web chat
- Onboarding organization + property; membri con ruoli.
- Knowledge base: asset tipizzati (faq, brochure, pdf, procedura, policy, correzione) con versioning, priorità di retrieval, file su Supabase Storage.
- **Web chat ospite** (link/QR, multilingua, nessun login).
- Motore conversazionale Claude con grounding sulla KB della property.
- **Pipeline Direct Quote completa**: estrazione dati richiesta (date, ospiti, bambini), calcolo prezzo da calendario tariffe, proposta con sconto diretto/tassa di soggiorno/scadenza, stati fino a `confermata`, hold 24h, audit trail.
- Inventario: camere, calendario tariffe (inserimento manuale + import CSV; feed iCal per la disponibilità).
- Lead scoring con eventi trasparenti; indicatore di affidabilità dati (freshness tariffe).
- Template messaggi (codice / canale / lingua, varianti `ota_safe`) e follow-up automatici schedulati.
- Escalation: stato `in_attesa_staff` + `supervision_mode` per struttura.
- Dashboard: inbox richieste e conversazioni, KB, tariffe, template, impostazioni.
- Log AI (`ai_calls`): provider, modello, token, latenza, errori — base per il controllo costi.

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

## 9. Metriche di successo

- % richieste convertite in proposta inviata (< 1 minuto dalla richiesta).
- **Tasso di conversione proposta → confermata** (metrica regina del Direct Quote).
- % richieste risolte dall'AI senza intervento umano (target iniziale 60–70%).
- Valore prenotazioni dirette generate / mese per property (= commissioni OTA risparmiate).
- Tempo di onboarding nuova property (< 1 giorno); retention mensile dei tenant.

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
