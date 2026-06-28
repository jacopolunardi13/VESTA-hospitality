# KNOWLEDGE

Fonte ufficiale per il **Property Knowledge System (PKS)**: come la conoscenza della struttura alimenta
le risposte. Retrieval e modelli AI → [AI.md](AI.md); tabelle → [DATABASE.md](DATABASE.md).

> **Legenda** (PROJECT_RULES §2): ✅ verificata · ◐ dedotta · ○ ipotizzata.

---

## Parte 1 — Current State

### Dove vive la conoscenza
- ✅ Tabelle: `knowledge_assets` (testo/FAQ/policy), `knowledge_asset_versions` (versioning),
  `knowledge_embeddings` (presente ma **non usata** dal retrieval attuale), `kb_suggestions`
  (auto-learning, predisposta). Vedi [DATABASE.md](DATABASE.md).
- ✅ Separazione dati: numeri che cambiano/alimentano calcoli (prezzi, tassa, orari) vivono in
  `rate_calendar`/`properties.settings`/`rooms`, **non** nel testo KB.

### Retrieval reale (`src/lib/ai/knowledge.ts`)
- ✅ **Lessicale, app-side**: normalizzazione + **stemmer italiano leggero** + rimozione **stopword**.
  Motivo dichiarato nel codice: la FTS Postgres `simple` non fa stemming né toglie stopword.
- ✅ Filtro base: `property_id` + `usable_by_concierge = true` + `deleted_at IS NULL`.
- ✅ Punteggio: match nello **titolo** peso 2, nel **contenuto** peso 1; spareggio per `priority`.
  Soglia risposta diretta `KB_DIRECT_ANSWER_RANK = 1`.
- ◐ **Non** è retrieval semantico/vettoriale: `knowledge_embeddings` esiste ma non è interrogata
  (divergenza dalla spec storica PKS v1.0 che ipotizzava FTS+embeddings → vedi [archive/](archive/)).
- ✅ Contesto generativo: gli asset rilevanti entrano nel system prompt con **prompt caching** (vedi [AI.md](AI.md)).

### Uso nelle risposte
- ✅ "Niente asset, niente risposta": l'AI usa **solo** la KB; se manca → non inventa, propone contatto
  con la struttura (coerente con `CONCIERGE_IDENTITY`, [AI.md](AI.md)).
- ✅ Multilingua: la KB si scrive nella lingua principale della property; l'AI risponde nella lingua
  dell'ospite.

---

## Parte 2 — Guiding Principles

- **Fonte unica di verità sulla struttura.** Tutto ciò che l'AI afferma su policy/servizi è
  riconducibile a un asset; i numeri vivono nei dati strutturati (evita testo e numeri che divergono).
- **Gestibile dal titolare senza tecnici.** CRUD in dashboard, in linguaggio naturale; una modifica
  salvata è subito attiva.
- **Mai cancellare, sempre sostituire.** Versioning + soft-delete: storia ricostruibile, rollback possibile.
- **Multi-struttura rigida.** Ogni query filtra per `property_id`; la KB di una struttura non è mai
  visibile a un'altra.
- **Semplicità prima della potenza** (Product First). Il retrieval lessicale basta per una KB da decine
  di asset: niente vettori finché non servono davvero.
- **Priorità alle correzioni dello staff.** `priority` fa sì che una correzione batta il testo originale.

---

## Future Evolution
*Coerenti coi principi; non roadmap.*
- Retrieval **semantico** (embeddings) quando la KB supera la soglia gestibile lessicalmente.
- **Auto-learning**: risposte staff → proposte asset (`kb_suggestions`) con conflict-check.
- Variabili nei testi (`{{check_in_time}}`) per non duplicare i dati strutturati.
- Asset **org-wide** condivisi (catene) — richiede `property_id` nullable (migrazione dedicata).
- Coverage score / gap report / review reminder per l'igiene della conoscenza.

---

## Related Documents
- [AI.md](AI.md) — pipeline, prompt caching, modelli
- [DATABASE.md](DATABASE.md) — tabelle `knowledge_*`
- [ARCHITECTURE.md](ARCHITECTURE.md) — pipeline knowledge-first
- [archive/](archive/) — spec storica PKS v1.0 (FTS/embeddings ipotizzati)
