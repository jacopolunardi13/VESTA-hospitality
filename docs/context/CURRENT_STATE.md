# CURRENT STATE — stato vivo del progetto

> **Layer di CONTESTO** (stato vivo), non di conoscenza. Fonte di verità = repository GitHub.
> **Aggiornato:** 2026-07-12 · branch `chore/autonomous-engineering` · HEAD `8066431` · ✅ verificato con git
> **SSOT:** priorità → [ROADMAP](../ROADMAP.md) · storia → [CHANGELOG](../CHANGELOG.md) · decisioni → [DECISIONS](../DECISIONS.md) · sicurezza → [SECURITY](../SECURITY.md). Qui solo la **fotografia**, niente duplicati.

## Branch & git (✅ verificato) — ⚠️ divergenza a 3 vie, nessun merge in `main`
- **Attivo:** `chore/autonomous-engineering` (HEAD `8066431`), **+5 commit** su `main`.
- `main` @ `d239698` (baseline; prod = deploy da `main`).
- `security/p0-2-rpc-hardening` @ `5f0d4a1` — **P0-2** (migrazione `0015`) **applicata al DB prod** ma **NON mergiata**.
- Branch storici: `document-center` @ `19df477`, `fase-b` @ `954fa15`.
- **⚠️ DB prod avanti al repo:** `0015` è applicata in produzione ma vive solo sul branch security → **riconciliazione branch = check aperto**.

## Lavoro recente sul branch attivo
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
- 🔴 **Anthropic in produzione** — `.env.local` ha una chiave **invalida** (401, solo locale); **prod da verificare** (possibile blocker concierge se anche prod fosse invalida).
- 🟡 **KI-11 / `vesta-followups`** — cron detector scadenza-24h forse **non schedulato** (logica OK all'E2E; scheduling da confermare in SQL Editor).
- 🟠 **Riconciliazione branch** — portare P0-2 + Autonomous Engineering + Product Boundary in `main`.
- **Sano (verificato):** E2E core router **29/29** ✅, payment-expiry/Operational Queue **18/18** ✅, RLS/P0-2 ✅, email prod ✅, autosend OFF ✅.

## Working tree — non committato, lasciato fuori di proposito
- `docs/ROADMAP.md` (M) · script incidente/prep in `app/scripts/*` (untracked) · `docs/RUNBOOKS/rotate-secrets-checklist.md` (untracked) → isolati, fuori dai commit di setup/governance.

## Flag operativi
- autosend **OFF** · `vesta-email-poll` **attivo** (prod ripristinato) · `vesta-followups` **da verificare** (KI-11) · signup Supabase **chiuso** (mitigazione P0-2).
