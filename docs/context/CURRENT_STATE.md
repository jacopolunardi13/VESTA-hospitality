# CURRENT STATE — stato vivo del progetto

> **Layer di CONTESTO** (stato vivo), non di conoscenza. Fonte di verità = repository GitHub.
> **Aggiornato:** 2026-09-27 · canonico remoto = `git ls-remote` · HEAD locale = `git log -1` (i due possono divergere per i soli commit docs non ancora pubblicati). **Il Router Training Sprint #1 è IN PRODUZIONE dal 27/09** (SHIP via RED con pin; deploy Vercel; smoke verde; ADR-0021 in vigore) e **il canale email è validato E2E in produzione** (stesso giorno).
> **SSOT:** priorità → [ROADMAP](../ROADMAP.md) · storia → [CHANGELOG](../CHANGELOG.md) · decisioni → [DECISIONS](../DECISIONS.md) · sicurezza → [SECURITY](../SECURITY.md). Qui solo la **fotografia**, niente duplicati.

## Branch & git — storia recente (il canonico CORRENTE è sempre `git ls-remote`, mai un valore scritto qui)
- **04/09/2026 — merge fast-forward + push ESEGUITI** (autorizzazione RED esplicita di Jacopo, SHA pinnati, fail-closed): `main` `19df477` → **`048dd4a`**, push verificato via `ls-remote`, **deploy Vercel prod LIVE** (~20s), smoke read-only VERDE (`/tasks` 307→login = nuovo build + gate intatti; `/login` 200; nessun 5xx). **La divergenza fu CHIUSA quel giorno**: repo, DB prod (`0015`+`0016`+`0017` applicate) e deploy allineati ad allora-`048dd4a` (superato il 27/09 dallo SHIP dello Sprint #1).
- `security/0017-least-privilege` resta come branch locale storico (= `048dd4a`); nessun PR aperto; worktree pulito.
- **27/09/2026 — Router Training Sprint #1 SHIPPATO** (hardening L0 + corpus con invariante zero over-blocking; Codex ACCEPT sul diff di publish in 2 round): push fast-forward autorizzato (RED Jacopo, pin esatti) → deploy Vercel Production verificato via GitHub deployment status → smoke verde. **Email E2E verificato in produzione lo stesso giorno**: email di test controllata → cron `vesta-email-poll` (2') → router `guest` (fail-safe) → conversation + bozza AI `delivery_status='autosend_off'` + booking_request `received`; **zero invii automatici** (kill-switch OFF confermato lato DB e lato mittente). Evidence: `~/.vesta-db-audit/evidence/e2e-verify-*.json`.
- Baseline verde su `main` (04/09): `next lint` 0 errori · `next build` (typecheck completo) ✅.
- ✅ **(chiuso il 04/09) Verifica esterna 0017 ESEGUITA in produzione** via Phone RED read-only (WorkspaceOS, bundle pinnato, credenziali a ciclo chiuso: revoke 204 · access 401 · ref eliminati): `app/scripts/0017-readonly-verification.sql` → **10/10 assertions PASSED**. La stessa approvazione ha estratto il **corpus reale sanitizzato** da `email_routing_log` (687 righe; mai `from`/`subject` grezzi) su cui è stata fatta la **shadow analysis offline** del router candidato (nessun difetto deterministico — dettagli e residui in [NEXT_TASK](NEXT_TASK.md) e [KNOWN_ISSUES](KNOWN_ISSUES.md)).

## Branch & git — storico riconciliazione 12/07 (superato da `security/0017-least-privilege`)
- **`integration/reconcile-20260712`** (`c8b03cf`, contenuto in `main` dalla riconciliazione del 04/09): `main` + merge di `security/p0-2-rpc-hardening` (`5f0d4a1`, **`0015`**) + merge di `chore/autonomous-engineering` (`229f97c`, 17 commit: governance F1-F3, **`0016`**, sprint Operating Agent v0, fix doc Codex-approved).
- Le migrazioni `0015` e `0016` erano già rappresentate su quella linea (entrambe applicate e verificate in prod).
- (storico 12/07) `main` era @ `d239698` = allora-`origin/main` (`19df477`) +1 commit docs — tutto contenuto in `main` dalla riconciliazione del 04/09.
- Branch storici: `document-center` @ `19df477`, `fase-b` @ `954fa15`.
- ✅ (chiuso il 04/09) il merge/push di quella linea è avvenuto con la riconciliazione — vedi sezione in cima.

## Lavoro recente (portato da `chore/autonomous-engineering`)
- **Sprint "LunArt Operating Agent v0"** (12/07 sera, 7 commit `61bcef4…76af020`): **Coda operativa `/tasks`** (prima le `operational_tasks` non avevano UI) + chip "24h scadute" in Inbox + card task con importo/scadenza; fix coerenza staff (`to_verify` non più vicolo cieco, label `confirmAvailability` unificata); **fail-fast visibile** (errore pipeline → notifica escalation staff); arrotondamento override allineato al priceEngine; polish Document Center (categorie IT, nota invio manuale, nav mobile); **runbook** `docs/RUNBOOKS/lunart-operating-agent-v0.md`; lint 4 errori→0. Verifica: `tsc` ✅ · `next build` ✅ · router 29/29 ✅ · combinazioni 10/10 ✅. **IN PROD dal 04/09** (riconciliazione deployata).
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
- ✅ **Riconciliazione branch** — COMPLETATA il 04/09 (merge ff + push + deploy prod, smoke verde; il canonico di allora era `048dd4a`, poi superato dallo SHIP del 27/09).
- **Sano (verificato):** E2E core router **29/29** ✅, payment-expiry/Operational Queue **18/18** ✅, RLS/P0-2 ✅, email prod ✅, cron `vesta-followups` `succeeded` ✅ (KI-11), autosend OFF ✅.

## Working tree
- **Pulito al 28/08** (0 file non committati, 0 stash): i residui del 12/07 (`docs/ROADMAP.md` M, script prep untracked) sono stati riassorbiti/committati sulla linea di riconciliazione.

## Flag operativi
- autosend **OFF** · `vesta-email-poll` **attivo** (prod ripristinato) · `vesta-followups` **attivo/`succeeded`** (KI-11 risolto, `0016`) · signup Supabase **chiuso** (mitigazione P0-2).
