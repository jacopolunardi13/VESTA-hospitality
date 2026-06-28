# DOMAINS

Fonte ufficiale per i **verticali applicativi** e per la distinzione tra ciò che (concettualmente)
appartiene al **Core** e ciò che è **specifico di dominio**. Strategia → [BUSINESS.md](BUSINESS.md);
architettura reale → [ARCHITECTURE.md](ARCHITECTURE.md).

> **Nota di metodo**: oggi esiste **un solo dominio implementato** (Hospitality). Il "Core" come pacchetto
> separato **non è estratto** (ADR-0007: Capability Engine = direzione, non implementazione). Questo
> documento distingue concettualmente Core vs dominio per guidare l'evoluzione, senza dichiarare
> un'astrazione che non esiste ancora.

> **Legenda** (PROJECT_RULES §2): ✅ verificata · ◐ dedotta · ○ ipotizzata.

---

## Parte 1 — Current State

- ✅ **Unico dominio implementato: Hospitality** (LunArt, poi Bella Vigna).
- ✅ Il codice è **hospitality-specifico**; non esiste un package "core" separato (verificato: nessun
  modulo `core/`, nessun riferimento `capability`/`financial`).
- ✅ Componenti potenzialmente "core" già presenti ma **dentro** il dominio hospitality: orchestrazione
  condivisa (`processConversationTurn`), pipeline knowledge-first, Router L0, seam Registry/Recognizer,
  notifiche, gestione documenti, identità/voce AI. Sono i candidati naturali a un futuro Core (ADR-0007).

### Mappa concettuale Core vs Dominio (oggi, hospitality)
| Concettualmente Core (riutilizzabile) | Specifico Hospitality |
|---|---|
| Orchestrazione conversazione multicanale | Motore prenotazioni (camere, tariffe, disponibilità) |
| Pipeline knowledge-first + KB | Concierge di struttura, 9 "domande d'oro" |
| Registry/Recognizer documenti | Recognizer Booking/OTA, fatture estere |
| Router messaggi (guest vs non-guest) | Categorie OTA/PMS, parser email Booking/Expedia/QuoVai |
| Tier 1/Tier 2 + notifiche | Workflow preventivo→conferma, tassa di soggiorno |
| Memoria operativa (futuro) | Riconciliazione Booking/Airbnb (futuro) |

---

## Parte 2 — Guiding Principles

- **Un dominio alla volta, fatto bene.** Hospitality è il primo verticale; si generalizza solo dopo
  averlo validato (ADR-0008, Product First).
- **Il Core si estrae per scoperta, non per anticipazione.** Si promuove a Core ciò che **due domini**
  reali dimostrano essere comune — mai prima (no astrazioni premature, ADR-0007).
- **Confini netti già oggi.** Mantenere moduli con dipendenze pulite (es. seam Registry/Recognizer)
  rende possibile l'estrazione futura senza riscritture.
- **Ogni dominio porta i propri registry/parser/workflow**, appoggiandosi al Core comune.

---

## Future Evolution
*Ipotesi di verticali; nessun impegno. Si realizzano solo se l'esperienza conferma il valore.*
- ○ **Restaurant** (prenotazioni tavoli, menu, ordini), **Retail** (assistenza, ordini), **Professional
  Services** (appuntamenti, pratiche), **Personal AI** (assistente personale).
- ○ Per ciascun verticale: stesso **Core** (orchestrazione, KB, document intelligence, notifiche,
  workflow, memoria operativa) + un **layer di dominio** (entità, registry, parser, regole specifiche).
- ◐ Estrazione del **Core riutilizzabile** quando un secondo dominio reale lo giustifica
  ([BUSINESS.md](BUSINESS.md), [capability-engine] direzione).

---

## Related Documents
- [BUSINESS.md](BUSINESS.md) — visione, Capability Engine, modello di business
- [ARCHITECTURE.md](ARCHITECTURE.md) — componenti reali (candidati Core)
- [DECISIONS.md](DECISIONS.md) — ADR-0007 (Capability Engine direzione), ADR-0008 (Hospitality primo dominio)
