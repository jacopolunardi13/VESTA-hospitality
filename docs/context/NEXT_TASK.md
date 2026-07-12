# NEXT TASK — prossimo passo eseguibile

> Espansione operativa di **ROADMAP[0]** ([ROADMAP](../ROADMAP.md) resta la SSOT dell'elenco ordinato).
> **Aggiornato:** 2026-07-12 (sera) · branch `chore/autonomous-engineering`.

## Contesto (chiuso di recente)
- ✅ **Sprint "LunArt Operating Agent v0"** completato e **Codex-reviewed** (7 commit: Coda operativa `/tasks`, coerenza inbox, fail-fast visibile, polish Document Center, runbook staff).
- ✅ **KI-11 risolto** (migrazione `0016` applicata, cron `vesta-followups` → run `succeeded`).
- ✅ **Anthropic in produzione OK** (verifica sintetica approvata; resta invalida solo la chiave in `.env.local`).

## Task
**Riconciliazione branch → piano di merge in `main`** — il DB prod è avanti al repo (`0015` vive solo su `security/p0-2-rpc-hardening`) e tutto lo sprint Operating Agent v0 vive su `chore/autonomous-engineering`: **nulla di ciò è in produzione** finché non arriva in `main` (deploy solo da `main`).

## Obiettivo
Un piano di merge ordinato e verificabile dei branch `security/p0-2-rpc-hardening` (P0-2/`0015`) e `chore/autonomous-engineering` (governance + `0016` + sprint v0) in `main`, con conflitti risolti, check verdi e deploy finale approvato dal PO.

## Perché conta
Chiude la divergenza a 3 vie (rischio maggiore attuale), riallinea repo↔DB e rende lo sprint utilizzabile dallo staff LunArt (Coda operativa, runbook, fix inbox).

## Preparazione consentita (🟢 GREEN / 🟡 YELLOW)
- Analisi divergenza (`git log`/`diff` fra i 3 branch), individuazione conflitti attesi.
- Merge/rebase **locali su branch di lavoro** (mai su `main`), risoluzione conflitti, `tsc` + `next build` + test offline.
- Aggiornamento doc/context correlati e proposta di sequenza di merge per il PO.

## 🔴 RED — richiede approvazione esplicita di Jacopo
merge in `main` · deploy in produzione · `git push` · migrazioni (apply) · env/segreti · autosend ON · contatto reale con ospiti · PMS/tariffe/camere/pagamenti.

## Dopo (NON in questo task)
Reset `ANTHROPIC_API_KEY` locale (PO) · decisione su `0006` (`process_due_followups`) · P0 residui: P0-1 rotazione segreti → P0-4 header → P0-3 anti-abuso chat → P0-5 destinatario email ([SECURITY](../SECURITY.md), ADR-0019).

## Prompt consigliato per avviare il task
> «Prepara il piano di riconciliazione branch: analizza la divergenza fra `main`, `security/p0-2-rpc-hardening` e `chore/autonomous-engineering`, proponi ordine di merge e verifica su un branch locale di integrazione. Nessun merge in `main`, nessun push: fermati al piano verificato e chiedimi l'approvazione RED.»
