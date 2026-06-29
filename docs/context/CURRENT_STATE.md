# CURRENT STATE — stato vivo del progetto

> **Layer di CONTESTO** (stato vivo), non di conoscenza. Fonte di verità = repository GitHub.
> **Aggiornato:** 2026-06-29 · branch `document-center` · HEAD `3c27677` · ✅ verificato con git
> **SSOT:** priorità → [ROADMAP](../ROADMAP.md) · storia → [CHANGELOG](../CHANGELOG.md) · decisioni → [DECISIONS](../DECISIONS.md) · sicurezza → [SECURITY](../SECURITY.md). Qui solo la **fotografia**, niente duplicati.

## Branch & git (✅ verificato)
- Branch corrente: **`document-center`** (HEAD `297a9d6`).
- `main` fermo a **`efe5e03`**; `document-center` è **avanti di 3 commit doc-only** non ancora in `main` (`git rev-list --left-right --count main...document-center` → `0 3`): `e304b45` (Context Layer), `49eb3fc` (Foundations/PRODUCT.md), `297a9d6` (aggiornamento report).

## In `main` (= efe5e03)
- **Front Office** — AI Concierge + motore prenotazioni/preventivi (flusso Tier-1/Tier-2). In produzione.
- **Document Center MVP (Booking)** — codice in `main` (commit `1548c89`/`85c72f8`/`94b1381`). ⚠️ "in main" ≠ "completato per DoD" (vedi sotto).
- **Fail-Fast** su tutte le scritture Supabase (`d15b87a`).
- **Documentazione v1.0** + architettura "Operating System" a strati + ADR-0011 rafforzata.

## Documentazione — solo su `document-center` (doc-only, oltre `main`)
- **Context Layer** `docs/context/` (`e304b45`, ADR-0018): CURRENT_STATE, NEXT_TASK, OPEN_DECISIONS, KNOWN_ISSUES, PROJECT_SYNC_REPORT (+ TEMPLATE).
- **Foundations** `docs/foundations/`: **`PRODUCT.md`** (Costituzione) + **`WORKFLOW.md`** (workflow ufficiale Tier-1/Tier-2 + scadenza 24h fino al PMS, ancorato ad ADR-0011). Stato Foundations: **in corso** (`BRAND.md` / `ENGINEERING.md` non ancora creati).
- Il **workflow ufficiale** è stato **verificato allineato al codice** (audit per-clausola, nessuna discrepanza) e codificato in `WORKFLOW.md`.

## Solo nel working tree (NON committato) — milestone corrente
**Operational Queue** (`operational_tasks`) + sotto-flusso **scadenza pagamento 24h**:
- migrazione `supabase/migrations/0014_operational_tasks.sql` — ⛔ **NON applicata al DB**;
- `app/src/lib/tasks/` (Task Catalog + helper) + modifiche a `inbox/actions.ts`, `messages.ts`, `request-actions.tsx`, `inbox/[id]/page.tsx`;
- E2E `app/scripts/test-payment-expiry-e2e.mts`.
- Stato: codice scritto · `tsc` 0 errori · `eslint` 0 warning · **bloccato** sull'apply SQL (DDL = solo titolare).

## Ultima milestone completata (per DoD)
- ◐ L'ultimo commit in `main` è documentale (`efe5e03`). L'ultima feature con codice è il **Document Center MVP**, la cui chiusura DoD (migrazione `0013` applicata + E2E reale con fattura Booking) **non è verificata** in questa fase → trattare come "implementata, non completata" finché non confermato.

## Milestone corrente
- **Operational Queue + scadenza pagamento 24h** — comportamento **definitivo R0.x** fino a integrazione PMS. 6 obiettivi → vedi [NEXT_TASK](NEXT_TASK.md). Vincoli: autosend OFF, `vesta-email-poll` sospeso, nessuna azione PMS ([ADR-0011](../DECISIONS.md)).

## Flag operativi
- `email_autosend_enabled` = **OFF** · cron `vesta-email-poll` = **SOSPESO** · cron `vesta-followups` = attivo (esteso al dispatcher scadenze **dopo** l'apply di 0014).
