# BUSINESS

Fonte ufficiale per la **strategia di prodotto**: visione, missione, posizionamento, pilota, modello di
business, Capability Engine come direzione. Le decisioni qui riassunte sono registrate in
[DECISIONS.md](DECISIONS.md); i verticali in [DOMAINS.md](DOMAINS.md).

> **Nota di metodo**: questo documento descrive **prodotto e strategia** (decisioni), non comportamento
> del codice. Le affermazioni sono *decisioni prese* (✅ tracciate in DECISIONS/memoria) o *direzioni*
> (◐). Lo stato tecnico reale è in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Parte 1 — Current State

### Cos'è Vesta (oggi)
- ✅ SaaS per **piccole strutture ricettive** (B&B, affittacamere, case vacanze, piccoli hotel).
- ✅ Posizionamento: **non** un chatbot/FAQ, ma un **"dipendente virtuale"** che aiuta l'ospite,
  aumenta le **prenotazioni dirette** (meno dipendenza da OTA) e **riduce il lavoro manuale** del gestore.
- ✅ Pilota: **LunArt B&B** (Firenze) come prima struttura; **Bella Vigna** come seconda.

### Cosa esiste come prodotto (sintesi tecnica → ARCHITECTURE)
- ✅ **Front Office**: concierge AI + motore prenotazioni (preventivi, scelta, conferma con staff),
  multicanale (web; email in pilota; WhatsApp predisposto/inerte).
- ✅ **Back Office**: Document Center MVP (archivio fatture Booking → commercialista).
- ◐ Aree mature come *direzione* ma non ancora prodotto completo: Operations, Revenue, Financial
  Intelligence, Operational Memory.

### Modello di business
- ◐ SaaS multi-tenant in abbonamento per-struttura (dettaglio commerciale non congelato in questa doc).
- ✅ Multi-tenant by design (isolamento RLS, [DATABASE.md](DATABASE.md)).

---

## Parte 2 — Guiding Principles

- **Product First.** Ogni scelta nasce dal valore per la struttura, non dalla tecnologia (ADR-0001).
- **Prenotazioni dirette + meno lavoro manuale.** I due assi di valore: convertire l'interesse in
  prenotazione diretta e togliere lavoro ripetitivo al gestore.
- **Fiducia prima della conversione.** Mai inventare, mai forzare: il concierge è onesto e misurato
  (vedi voce in [AI.md](AI.md)).
- **Human-in-the-Loop.** Vesta assiste, non sostituisce: le decisioni impegnative restano al gestore
  (ADR-0011).
- **Hospitality come primo dominio** (ADR-0008): validare a fondo un verticale che conosciamo prima di
  generalizzare.
- **Capability Engine come direzione, non come piano** (ADR-0007): mantenere il codice modulare per
  permettere l'evoluzione, senza astrazioni premature.

---

## Future Evolution
*Direzione strategica; non roadmap né impegni. Roadmap operativa → [ROADMAP.md](ROADMAP.md).*
- **Back Office Assistant** (evoluzione del Document Center): archivio → documenti italiani → scadenze →
  controllo amministrativo → riconciliazione economica.
- **Capability Engine**: Front Office · Operations · Back Office · Financial Intelligence · Revenue ·
  Operational Memory, ognuna con i propri registry/parser/workflow.
- **Document Intelligence & Operational Memory**: i documenti generano conoscenza/azioni; la struttura
  accumula memoria operativa (vantaggio competitivo).
- **Crescita commerciale**: multi-property → vendita ad altre strutture → Vesta Experiences → marketplace.
- **Possibile core riutilizzabile** e **altri verticali**: solo se l'esperienza lo conferma → [DOMAINS.md](DOMAINS.md).

---

## Related Documents
- [DECISIONS.md](DECISIONS.md) — ADR-0001, 0007, 0008, 0011
- [DOMAINS.md](DOMAINS.md) — verticali e Core vs dominio
- [ROADMAP.md](ROADMAP.md) — priorità operative
- [ARCHITECTURE.md](ARCHITECTURE.md) — stato tecnico reale
- [AI.md](AI.md) — voce e comportamento del concierge
