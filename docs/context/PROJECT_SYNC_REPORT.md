# PROJECT SYNC REPORT — Vesta Hospitality

> **Report vivo e compilato.** Copia/incolla questo file in una nuova chat (ChatGPT o Claude) per riallineare l'assistente in pochi minuti. Generato dai file di stato in `docs/context/`.
> **Aggiornato:** 2026-07-12 (sera) · branch `integration/reconcile-20260712` (candidato `main`).

## 1. Identità progetto
**Vesta Hospitality** — SaaS multi-tenant: "dipendente virtuale" per piccole strutture ricettive (front + back office). Repo GitHub `jacopolunardi13/VESTA-hospitality`. Pilota: **LunArt B&B** (Firenze), Giorno Zero 30/06/2026. **Confine strategico VINCOLANTE:** Vesta = **AI Operations Layer hospitality**, non chatbot/wrapper generico (gate 8 punti — PRODUCT.md §18). **La fonte di verità è il repo, non le chat.**

## 2. Stack minimo
TypeScript · **Next.js 16** (App Router) / React 19 · **Supabase** (Postgres + Auth OAuth + Storage + RLS, pg_cron) · **Anthropic Claude** (Haiku + Sonnet) · pdfkit · Gmail API · hosting **Vercel** (prod = `main`).

## 3. Stato attuale — riconciliazione: integrazione locale PRONTA, merge in `main` = 🔴 RED
- **Branch:** `integration/reconcile-20260712` (locale) = `main` (@ `d239698`) + `security/p0-2-rpc-hardening` (**`0015`**) + `chore/autonomous-engineering` (17 commit: governance F1-F3, **`0016`**, **sprint Operating Agent v0** — Coda operativa `/tasks`, fix coerenza inbox, fail-fast visibile, polish Document Center, runbook staff — Codex-approved). Storici: `document-center`, `fase-b`.
- **`0015` e `0016` sono rappresentate su questo candidato-`main`**: al merge, repo e DB prod tornano allineati (entrambe già applicate+verificate in prod, **nessun apply necessario**). Restano 🔴 RED: merge in `main` + push (`origin/main` = deploy prod automatico).
- **In prod / DB:** Front Office (Tier-1/Tier-2), **Operational Queue** (`0014` applicata+verificata), Document Center MVP; **P0-2 live** (`anon` negato ✅, RLS attivo); **canale email prod ripristinato** (Google Cloud progetto ufficiale **542106** / casella `lunartfirenze`).
- **Multi-agente / WorkspaceOS:** PROJECT_REGISTRY creato, **Vesta registrata**; **Codex = review-only**; **Claude Code = unico writer**; **Jacopo** approva solo 🔴 RED.
- **Flag:** autosend **OFF** (R0.1) · `vesta-email-poll` attivo · `vesta-followups` **attivo/`succeeded`** (KI-11 risolto, `0016`) · signup Supabase **chiuso**.

## 3-bis. Foundations (Costituzione del prodotto)
- `docs/foundations/PRODUCT.md` (con **§18 Strategic Product Boundary**) · `WORKFLOW.md` · **`ENGINEERING.md` creato** (Autonomous Engineering, F1). `BRAND.md` = non ancora creato.

## 4. Prossimi passi — check per il pilot interno
1. 🔴 **Merge riconciliazione in `main` + push** (= deploy prod Vercel; approvazione Jacopo). Poi smoke post-deploy (checklist in NEXT_TASK).
2. Reset chiave Anthropic **locale** `.env.local` (PO; prod già ✅ verificata 12/07).
3. Poi residui: rotazione segreti (P0-1 parziale) → P0-4 header → P0-3 anti-abuso chat → P0-5 destinatario email.

*(✅ chiusi il 12/07: **KI-11** (`0016` applicata, run cron `succeeded`) · **Anthropic prod OK** (test sintetico) · **sprint Operating Agent v0** Codex-approved.)*

## 5. Decisioni aperte
- **OD-1:** tempistica autosend ON (dopo hardening Router L0 + P0). · **OD-2:** signup (attualmente **chiuso**, mitigazione P0-2). · **OD-3:** prerequisiti 2° tenant (almeno P0-2). · **OD-4:** riconciliazione — **integrazione locale pronta**; resta la decisione RED di merge/push/deploy.

## 6. Problemi noti P0/P1 (SSOT: [SECURITY](../SECURITY.md) + [KNOWN_ISSUES](KNOWN_ISSUES.md))
- ✅ **P0-2 CHIUSO** — RPC `SECURITY DEFINER` hardenizzate (`0015`: REVOKE anon/authenticated, guard `auth.uid()`); anon negato live.
- 🟡 **Anthropic `.env.local` invalida** → solo concierge **locale** rotto (E2E AI locali bloccati); **prod ✅ verificata OK** (12/07).
- ✅ **KI-11 CHIUSO** — cron `vesta-followups` abortiva per `process_due_followups()` assente (`0006` non applicata); risolto da `0016` (command existence-guarded). Run post-apply `succeeded`; detector scadenza-24h ora eseguito via cron.
- **P0 residui:** segreti da ruotare (P0-1 parziale) · P0-3 chat anti-abuso · P0-4 header · P0-5 destinatario email · Router L0 falsi positivi (KI-1, autosend OFF).
- **P1:** hold 24h non propagato a `rate_calendar` (KI-5).

## 7. Regole non negoziabili
- **DoD:** codice in `main` + migrazione verificata (`to_regclass`) + E2E reale + **context layer aggiornato**.
- **Strategic Product Boundary (VINCOLANTE):** ogni feature supera il **gate 8 punti** o è riformulata come workflow / rifiutata (PROJECT_RULES "Product First" + PRODUCT.md §18; gate = `product-guardian`).
- **Human-in-the-Loop fino a PMS (ADR-0011):** Vesta non blocca/libera camere, non invia IBAN, non conferma pagamenti, non tocca tariffe/PMS in autonomia.
- **Postura di sicurezza (ADR-0019):** RLS `user_in_org`; least-privilege RPC; nessun segreto in codice/chat; nessun dato LLM promosso a parametro di sicurezza.
- **Pilota sicuro:** autosend OFF · nessun contatto reale non verificato · migrazioni manuali una alla volta, sempre verificate.
- **Ruoli:** Claude Code = writer · Codex = review-only · Jacopo = approva RED.

## 8. Come applicare una migrazione
Solo il titolare: Supabase SQL Editor → incolla la migrazione → Run → verifica con `to_regclass`. Procedura: `docs/RUNBOOKS/apply-migration.md`.

---
*Dettaglio completo: `docs/context/` (stato vivo) e `docs/` (conoscenza). Aggiornare questo report ad ogni milestone (DoD §13).*
