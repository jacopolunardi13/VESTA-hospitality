# CURRENT STATE — stato vivo del progetto

> **Layer di CONTESTO** (stato vivo), non di conoscenza. Fonte di verità = repository GitHub.
> **Aggiornato:** 2026-07-12 (sera, integrazione riconciliazione) · branch `integration/reconcile-20260712` (candidato `main`) · ✅ verificato con git
> **SSOT:** priorità → [ROADMAP](../ROADMAP.md) · storia → [CHANGELOG](../CHANGELOG.md) · decisioni → [DECISIONS](../DECISIONS.md) · sicurezza → [SECURITY](../SECURITY.md). Qui solo la **fotografia**, niente duplicati.

## Branch & git (✅ verificato) — riconciliazione: integrazione locale PRONTA, merge in `main` = 🔴 RED
- **`integration/reconcile-20260712`** (questo branch, solo locale): `main` + merge di `security/p0-2-rpc-hardening` (`5f0d4a1`, **`0015`**) + merge di `chore/autonomous-engineering` (`229f97c`, 17 commit: governance F1-F3, **`0016`**, sprint Operating Agent v0, fix doc Codex-approved).
- **Le migrazioni `0015` e `0016` sono rappresentate su questo candidato-`main`**: al merge, repo e DB prod tornano allineati (entrambe già applicate e verificate in prod — **nessun nuovo apply necessario**).
- `main` @ `d239698` = `origin/main` (`19df477`) **+1 commit docs mai pushato** (lineare, sicuro da includere; freshness remoto verificata con `ls-remote` il 12/07).
- Branch storici: `document-center` @ `19df477`, `fase-b` @ `954fa15`.
- 🔴 **Restano RED (Jacopo):** merge di questo branch in `main` → push (`origin/main` = deploy prod automatico Vercel). Backup push dei branch di lavoro = RED **opzionale**, preferibilmente dopo stabilità post-deploy.

## Lavoro recente (portato da `chore/autonomous-engineering`)
- **Sprint "LunArt Operating Agent v0"** (12/07 sera, 7 commit `61bcef4…76af020`): **Coda operativa `/tasks`** (prima le `operational_tasks` non avevano UI) + chip "24h scadute" in Inbox + card task con importo/scadenza; fix coerenza staff (`to_verify` non più vicolo cieco, label `confirmAvailability` unificata); **fail-fast visibile** (errore pipeline → notifica escalation staff); arrotondamento override allineato al priceEngine; polish Document Center (categorie IT, nota invio manuale, nav mobile); **runbook** `docs/RUNBOOKS/lunart-operating-agent-v0.md`; lint 4 errori→0. Verifica: `tsc` ✅ · `next build` ✅ · router 29/29 ✅ · combinazioni 10/10 ✅. **NON in prod finché non si merge in `main`.**
- `eb6f3e0` / `48d6830` **fix(db)** — migrazione **`0016`** (fix **KI-11**): cron `vesta-followups` reso resiliente (guard `to_regprocedure` + chiamata `process_due_followups()` opzionale in sotto-blocco `EXCEPTION`; `process_operational_deadlines()` sempre eseguito). **Applicata manualmente** in SQL Editor e **verificata** (run `succeeded`, vedi Check residui).
- `8066431` **chore(agents)** — hardening setup **Codex reviewer** (AGENTS.md ruoli; guard rafforzato: Preview deploy non più GREEN silenzioso; `.gitignore` fix eccezione `.env.example`).
- `8781cbd` **docs(product)** — **Strategic Product Boundary** (gate 8 punti, VINCOLANTE): PROJECT_RULES "Product First" + PRODUCT.md §18 + rubric `product-guardian`.
- `89f4aab` / `4de5633` / `f60742f` — **Autonomous Engineering F1–F3**: [ENGINEERING.md](../foundations/ENGINEERING.md) + Autonomy Boundary 🟢/🔴 + hook `guard-secrets` + skill core + Go-Live Automation (`app/scripts/go-live-check.mts`).

## WorkspaceOS / coordinamento multi-agente
- **WorkspaceOS PROJECT_REGISTRY** creato; **Vesta registrata** (source of truth = **repo GitHub**, non WorkspaceOS — WorkspaceOS non contiene logica di dominio Vesta).
- **Codex** connesso a Vesta in **review-only** (legge/analizza/propone, non scrive/committa/push).
- **Claude Code = unico writer** sul repo (branch attivo). **Jacopo (PO)** approva **solo** le azioni 🔴 RED.

## In produzione / DB (stato reale)
- **Front Office** (concierge + booking/preventivi Tier-1/Tier-2), **Operational Queue** (`0014` applicata+verificata), **Document Center MVP**.
- **P0-2 live in prod** (✅ verificato: `anon` **negato** sulle RPC `SECURITY DEFINER`; RLS `user_in_org` attivo).
- **Canale email prod RIPRISTINATO** sull'infrastruttura ufficiale (Google Cloud progetto **542106** / casella **`lunartfirenze@gmail.com`**); `vesta-email-poll` operativo. *(Incidente Gmail 01→12/07 chiuso: token prod scaduto → migrato al progetto/client OAuth ufficiale, con re-ingest del backlog.)*

## Pilot LunArt — vincoli attivi
- **Giorno Zero 30/06** già dichiarato: ogni richiesta in Inbox = **dato reale**.
- `email_autosend_enabled` = **OFF** (R0.1) · **nessun contatto reale automatico** agli ospiti · Human-in-the-Loop (ADR-0011).

## Check residui per il pilot interno
- ✅ **Anthropic in produzione** — **verificato OK** (12/07, test sintetico approvato: classify+generate `success`, artefatti ripuliti). Resta solo la chiave **locale** `.env.local` invalida (401): non è un blocker prod; reset = PO.
- ✅ **KI-11 / `vesta-followups`** — **RISOLTO** (migrazione `0016` applicata 2026-07-12). Il cron non aborta più su `process_due_followups()` mancante; run post-apply delle **19:35Z = `succeeded`** (prima: `failed` ogni 5 min con `42883`). Detector scadenza-24h ora eseguito regolarmente via cron.
- 🟠 **Riconciliazione branch** — **integrazione locale pronta su questo branch** (P0-2 + Autonomous Engineering + Product Boundary + sprint v0); mancano SOLO i passi 🔴 RED: merge in `main` + push (= deploy).
- **Sano (verificato):** E2E core router **29/29** ✅, payment-expiry/Operational Queue **18/18** ✅, RLS/P0-2 ✅, email prod ✅, cron `vesta-followups` `succeeded` ✅ (KI-11), autosend OFF ✅.

## Working tree — non committato, lasciato fuori di proposito
- `docs/ROADMAP.md` (M) · script incidente/prep in `app/scripts/*` (untracked) · `docs/RUNBOOKS/rotate-secrets-checklist.md` (untracked) → isolati, fuori dai commit di setup/governance.

## Flag operativi
- autosend **OFF** · `vesta-email-poll` **attivo** (prod ripristinato) · `vesta-followups` **attivo/`succeeded`** (KI-11 risolto, `0016`) · signup Supabase **chiuso** (mitigazione P0-2).
