# AI

Fonte ufficiale per: modelli usati, pipeline knowledge-first, prompt e caching, controllo dei costi,
brand voice del concierge. Il *flusso* architetturale completo è in [ARCHITECTURE.md](ARCHITECTURE.md);
la knowledge base in [KNOWLEDGE.md](KNOWLEDGE.md).

> **Legenda** (PROJECT_RULES §2): ✅ verificata · ◐ dedotta · ○ ipotizzata.

---

## Parte 1 — Current State

### Modelli (`src/lib/ai/models.ts`)
✅ Mapping funzione → modello:
| Funzione | Modello | Uso |
|---|---|---|
| `classify` | `claude-haiku-4-5` | intent detection, routing email, distillazione query |
| `extract` | `claude-haiku-4-5` | slot filling prenotazioni |
| `select_template` | `claude-haiku-4-5` | proposta categoria email (Router L0) |
| `generate_reply` | `claude-sonnet-4-6` | risposta conversazionale / concierge |
| `distill_kb` | `claude-sonnet-4-6` | query di ricerca IT per KB cross-lingua |
✅ Costi (centesimi €/1M token, ~USD≈EUR): Haiku €0.01 in / €0.05 out; Sonnet €0.03 in / €0.15 out.
◐ `claude-opus-4-8` è referenziato nel codice ma non è il modello operativo delle 5 funzioni sopra.

### Pipeline knowledge-first (`src/lib/ai/pipeline.ts`)
✅ Ordine reale: 1) escalation deterministica (regex, zero AI) → 2) safe-mode/KB lessicale (se AI
disabilitata) → 3) intent detection (Haiku) → 4) branch per intent → 5) ramo booking (estrazione slot,
default 1 notte, standard/non-standard, preventivo/combinazioni, fallback di cortesia) → 6) richiesta
mista concierge+booking. Dettaglio → [ARCHITECTURE.md](ARCHITECTURE.md).
✅ L'AI **non comunica mai prezzi/disponibilità** di sua iniziativa: arrivano dal motore preventivi.

### Prompt & caching (`src/lib/ai/prompts.ts`)
✅ System prompt a blocchi per `generate_reply`: blocco **identità/voce** (stabile) + blocco **KB della
property**, entrambi con `cache_control: ephemeral` → prompt caching Anthropic (~90% risparmio input
sulle richieste successive). L'identità è property-independent (cache massima).

### Controllo costi (`src/lib/ai/budget.ts` + `ai_calls`)
✅ Ogni chiamata loggata in `ai_calls` (token, costo, esito). `getBudgetState` confronta la spesa
giornaliera con `ai_daily_budget_cents` (default 500 = €5/giorno); oltre soglia o con `safe_mode` →
**pipeline senza AI** (solo KB lessicale). Vedi [ARCHITECTURE.md](ARCHITECTURE.md).

### Brand voice (`src/lib/ai/prompts.ts` → `CONCIERGE_IDENTITY`)
✅ Identità reale nel codice: concierge di struttura ricettiva con obiettivo **duplice** (aiutare
l'ospite + favorire la **prenotazione diretta**, non OTA). Regole: rispondere **nella lingua
dell'ospite**; tono professionale e caloroso, **senza emoji**; usare **solo** la KB (mai inventare);
**mai** prezzi/disponibilità di iniziativa; invito alla verifica disponibilità **una sola volta**, mai
insistente. Specifica estesa storica → [archive/](archive/) (lunart-voice).

---

## Parte 2 — Guiding Principles

- **L'AI è un componente, non il cuore.** Knowledge-first: deterministico/KB prima dell'AI → risposte
  affidabili, controllabili, economiche (DECISIONS ADR-0012).
- **Modello giusto al compito giusto.** Haiku (economico) per classificare/estrarre; Sonnet (capace) per
  generare/distillare. Ottimizza costo/qualità.
- **Costo sotto controllo by design.** Budget giornaliero + safe-mode + prompt caching: la spesa non può
  esplodere in silenzio.
- **L'AI non decide le cose irreversibili.** Mai prezzi/disponibilità/IBAN/conferme di iniziativa
  (Human-in-the-Loop).
- **Voce orientata a fiducia + conversione**, non chatbot FAQ: il concierge punta alla prenotazione
  diretta restando onesto (mai inventare).
- **Multilingua dall'ospite.** Si risponde nella lingua del messaggio; la KB si scrive nella lingua
  principale della struttura e si traduce al volo (varianti esplicite quando serve controllo).

---

## Future Evolution
*Coerenti coi principi; non roadmap.*
- Retrieval semantico (embeddings `knowledge_embeddings`) quando la KB cresce oltre la soglia gestibile
  in modo lessicale (oggi non necessario — vedi [KNOWLEDGE.md](KNOWLEDGE.md)).
- Auto-learning della KB (le risposte staff diventano asset, `kb_suggestions`).
- AI nel Document Center **solo dopo** regole/parser/librerie (DECISIONS ADR-0014), per estrazione campi.
- Varianti multilingua controllate per policy delicate.

---

## Related Documents
- [ARCHITECTURE.md](ARCHITECTURE.md) — pipeline e orchestrazione complete
- [KNOWLEDGE.md](KNOWLEDGE.md) — KB e retrieval
- [DATABASE.md](DATABASE.md) — `ai_calls`, `knowledge_*`
- [SECURITY.md](SECURITY.md) — budget, guardrail, Tier 2
- [DECISIONS.md](DECISIONS.md) — ADR-0012 (Knowledge-First)
