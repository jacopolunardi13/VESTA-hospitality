# PROJECT SYNC REPORT — Vesta Hospitality

> **Report vivo e compilato.** Copia/incolla questo file in una nuova chat (ChatGPT o Claude) per riallineare l'assistente in pochi minuti. Generato dai 4 file di stato in `docs/context/`.
> **Aggiornato:** 2026-06-29 · branch `document-center` · HEAD `49eb3fc`.

## 1. Identità progetto
**Vesta Hospitality** — SaaS multi-tenant: "dipendente virtuale" per piccole strutture ricettive (front office + back office). Repo GitHub `jacopolunardi13/VESTA-hospitality`. Pilota: **LunArt B&B** (Firenze). **La fonte di verità è il repo, non le chat.**

## 2. Stack minimo
TypeScript · **Next.js 16** (App Router) / React 19 · **Supabase** (Postgres + Auth OAuth + Storage + RLS, pg_cron) · **Anthropic Claude** (Haiku + Sonnet) · pdfkit · Gmail API · hosting **Vercel** (prod = `main`).

## 3. Stato attuale
- **Branch/HEAD:** `document-center` a `49eb3fc`. `main` fermo a `efe5e03`; `document-center` è **avanti di commit doc-only** non ancora in `main` (Context Layer `e304b45` · PRODUCT.md `49eb3fc`).
- **In `main` (`efe5e03`):** Front Office (concierge + booking/preventivi Tier-1/Tier-2), Document Center MVP (codice), Fail-Fast DB, doc v1.0 + architettura a strati.
- **Solo su `document-center` (doc-only, oltre `main`):** Context Layer `docs/context/` (`e304b45`); Foundations `docs/foundations/PRODUCT.md` (`49eb3fc`).
- **Working tree NON committato (milestone corrente):** Operational Queue (`operational_tasks`) + scadenza pagamento 24h — migrazione `0014` **non applicata**, codice scritto, `tsc`/`eslint` puliti, E2E pronto.
- **Flag:** autosend **OFF** · `vesta-email-poll` **sospeso** · `vesta-followups` attivo.

## 3-bis. Foundations (Costituzione del prodotto)
- **`docs/foundations/PRODUCT.md`** — ✅ **creato** ed è ora parte delle **Foundations** (commit **`49eb3fc`**). Sintesi delle 3 fonti approvate, con tre registri separati (Fondamenta confermate / Direzioni creative / Open Questions) + preambolo "fonte di verità", confini SSOT verso BRAND/WORKFLOW/ENGINEERING ed *Evolution Rules*.
- **`docs/foundations/WORKFLOW.md`** — ✅ **creato**: workflow ufficiale (commerciale + pagamento) fino al PMS, ancorato ad **ADR-0011**. Il workflow è stato **verificato allineato al codice** (audit per-clausola, **zero discrepanze**; migrazione 0014 + E2E già superati).
- **Stato documentazione Foundations:** **in corso.** PRODUCT.md + WORKFLOW.md = **completati**; **`BRAND.md` · `ENGINEERING.md` = non ancora creati**.
- **Prossimo passo consigliato (Foundations):** **`BRAND.md`** (identità di marca), da avviare **solo su decisione esplicita**. La **priorità operativa** resta il primo utilizzo reale su LunArt (merge milestone → produzione → attivazione sorvegliata).

## 4. Prossimo task
**Completare Operational Queue / scadenza pagamento 24h.** Prerequisito bloccante: **apply `0014` nel SQL Editor** (DDL = solo titolare), poi verifica `to_regclass` + E2E `scripts/test-payment-expiry-e2e.mts` sui 6 obiettivi. Solo dopo (con approvazione): attivare autosend + cron email.

## 5. Decisioni aperte
- **OD-1:** attivare autosend email solo **dopo** l'hardening Router L0 (raccomandato), non subito.
- ADR candidate: `details.title`/`created_by` su `operational_tasks` alla creazione manuale di task; vista cross-type quando arriva un 2° tipo non-booking.

## 6. Problemi noti P0/P1
- **P0** Router L0 falsi positivi `guest` → autosend OFF finché non rafforzato.
- **P0** Segreti esposti in chat → ruotare prima del go-live pubblico.
- **P1** Migrazione `0014` non applicata → blocca la milestone.
- **P1** Hold 24h non propagato a `rate_calendar` → rischio doppia prenotazione in finestra (ok per pilota a bassa concorrenza).

## 7. Regole non negoziabili
- **DoD:** codice in `main` + migrazione verificata (`to_regclass`) + E2E reale + **context layer aggiornato**.
- **Human-in-the-Loop fino a PMS (ADR-0011):** Vesta non blocca/libera camere, non invia IBAN, non conferma pagamenti, non tocca tariffe/PMS in autonomia.
- **Pilota sicuro:** autosend OFF, cron sospendibile, nessun contatto a ospiti reali senza verifica.
- **Migrazioni:** manuali nel SQL Editor, una alla volta, sempre verificate.

## 8. Come applicare una migrazione
Solo il titolare: Supabase SQL Editor → incolla la migrazione → Run → verifica con `to_regclass`. Procedura: `docs/RUNBOOKS/apply-migration.md`.

---
*Dettaglio completo: `docs/context/` (stato vivo) e `docs/` (conoscenza). Aggiornare questo report ad ogni milestone (DoD §13).*
