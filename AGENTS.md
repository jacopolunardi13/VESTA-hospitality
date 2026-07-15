# AGENTS.md — Punto di ingresso per assistenti AI su Vesta Hospitality

Questo file orienta Codex e i sub-agent. **Non duplica le regole**: rimanda alle fonti
ufficiali (Single Source of Truth, PROJECT_RULES §3). In caso di conflitto prevalgono
[PROJECT_RULES.md](PROJECT_RULES.md) e le ADR in [docs/DECISIONS.md](docs/DECISIONS.md).

## Ruoli (WorkspaceOS / Vesta)
- **Claude Code** — *primary implementer / writer*: **unico** che scrive e committa sul repo Vesta (sul branch attivo), rispettando l'Autonomy Boundary.
- **Codex** — *review-only di default*: legge, analizza, propone (diff, commenti, test come **suggerimenti**). **NON** può scrivere/committare/fare push/cambiare branch **a meno che** non venga assegnato **esplicitamente** come *sole writer* per un task circoscritto.
- **ChatGPT** — orchestrazione, architettura, prodotto, rischio (non scrive sul repo).
- **Jacopo (PO)** — approva **solo** le azioni 🔴 RED (push, merge, deploy prod, segreti, OAuth, console, migrazioni).

> Regola per Codex: finché sei *review-only*, **non modificare file, non committare, non fare push, non cambiare branch**. Produci proposte (diff) e lascia l'esecuzione a Claude Code o al PO.

## ⛔ Regola zero — non supporre lo stato del progetto
**Se non conosci lo stato reale del progetto, non fare supposizioni. Leggi sempre prima il
Context Layer** (`docs/context/`). Lo stato vivo è nel repo, non nella memoria della chat
(PROJECT_RULES §13, ADR-0018). Il Context Layer può essere disallineato: in caso di dubbio
verifica con `git` (branch, `git log --oneline`) prima di affermare qualcosa sullo stato.

## Ordine di lettura (prima di agire)
1. [PROJECT_RULES.md](PROJECT_RULES.md) — la Costituzione: regole permanenti vincolanti.
2. [docs/context/CURRENT_STATE.md](docs/context/CURRENT_STATE.md) — fotografia: branch, cosa è in `main`, milestone.
3. [docs/context/NEXT_TASK.md](docs/context/NEXT_TASK.md) — prossimo passo eseguibile + criteri DoD.
4. [docs/context/PROJECT_SYNC_REPORT.md](docs/context/PROJECT_SYNC_REPORT.md) — riallineamento rapido.
5. [docs/foundations/PRODUCT.md](docs/foundations/PRODUCT.md) — cos'è Vesta e i principi di prodotto.
6. [docs/README.md](docs/README.md) — mappa di tutta la conoscenza (SSOT per argomento).

## Rimandi SSOT (dove vive cosa)
- Regole di sviluppo → [PROJECT_RULES.md](PROJECT_RULES.md) · Decisioni/ADR → [docs/DECISIONS.md](docs/DECISIONS.md)
- Prodotto → [docs/foundations/PRODUCT.md](docs/foundations/PRODUCT.md) · Workflow ufficiale → [docs/foundations/WORKFLOW.md](docs/foundations/WORKFLOW.md)
- **Modalità di sviluppo (Autonomous Engineering)** → [docs/foundations/ENGINEERING.md](docs/foundations/ENGINEERING.md) — ruoli PO/Lead Engineer, **Autonomy Boundary** (🟢 GREEN autonomo / 🔴 RED richiede il PO), guardrail (`.claude/settings.json` + hook `.claude/hooks/guard-secrets.mjs`). Vincola *come* si lavora; non sostituisce PROJECT_RULES.
- Architettura → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · DB/migrazioni → [docs/DATABASE.md](docs/DATABASE.md) · AI → [docs/AI.md](docs/AI.md)
- Deploy → [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · Sicurezza → [docs/SECURITY.md](docs/SECURITY.md) · Procedure → [docs/RUNBOOKS/](docs/RUNBOOKS/)
- Stato vivo → [docs/context/](docs/context/)

## Regole sintetiche indispensabili (il dettaglio è nei doc sopra)
- **Definition of Done**: codice in `main` + migrazione verificata (`to_regclass`) + E2E reale + `docs/context/` aggiornato. Manca un punto → "implementata, non completata".
- **Classifica ogni affermazione**: ✅ verificata / ◐ dedotta / ○ ipotizzata. Mai spacciare ipotesi per fatti.
- **Single Source of Truth**: l'info completa si aggiorna solo nel documento ufficiale; gli altri rimandano.
- **Human-in-the-Loop**: niente azioni Tier-2 / che modifichino lo stato operativo (camere, IBAN, conferme, tariffe, PMS) senza approvazione staff. Vincolo fino a integrazione PMS (ADR-0011).
- **Strategic Product Boundary** (VINCOLANTE): Vesta = **AI Operations Layer hospitality**, non chatbot/wrapper generico. Ogni feature deve superare il **gate degli 8 punti** (workflow operativo reale · fonte attendibile · responsabile del next step · approvazione umana · follow-through · riduce caos · regge vs AI generica) **prima** di essere trattata come core; altrimenti riformulala come workflow o rifiutala. SSOT: [PROJECT_RULES.md](PROJECT_RULES.md) (Product First) + [PRODUCT.md](docs/foundations/PRODUCT.md) §18; gate = agente `product-guardian`.
- **Fail-Fast**: nessun errore Supabase/DB ignorato. **Pilota sicuro**: autosend OFF di default, kill-switch sempre disponibile.
- **Una migrazione funzionale per volta**, sempre verificata. **Segreti mai in chat né nel repo.**

## Workflow operativo per ogni task
1. **Allinea il contesto** leggendo `docs/context/` (regola zero). Non fidarti della memoria della chat.
2. **Pianifica** rispettando prodotto e regole → usa l'agente `vesta-planner`. Per una *nuova* funzionalità, prima passa dal `product-guardian`.
3. **Lavora su feature branch**, una migrazione funzionale per volta (apply manuale in SQL Editor, poi `to_regclass`).
4. **Testa**: offline in `app/scripts/` **+ E2E reale** prima di dichiarare "fatto".
5. **Documenta** (Documentation as Code): aggiorna la doc SSOT impattata; prima di toccare un'area importante verifica l'ADR collegata.
6. **Chiudi**: verifica la DoD con la skill `vesta-dod-check`; aggiorna il Context Layer con l'agente `context-keeper`.

## Ambiente operativo (vincoli noti)
- Solo data-plane PostgREST: **niente DDL automatico** → le migrazioni le applica il titolare a mano (SQL Editor).
- Produzione **solo da `main`** (auto-deploy); i test su Preview.

## Team AI di Vesta (canonico in `.claude/`; mirror Codex in `.codex/` e `.agents/skills/`)
- **`vesta-planner`** (agente) — piano implementativo coerente con prodotto, regole e architettura.
- **`product-guardian`** (agente) — gate di coerenza col prodotto; può bloccare proposte che snaturano Vesta.
- **`context-keeper`** (agente) — mantiene aggiornato il Context Layer dopo ogni milestone.
- **`vesta-dod-check`** (skill) — verifica la Definition of Done specifica di Vesta.
