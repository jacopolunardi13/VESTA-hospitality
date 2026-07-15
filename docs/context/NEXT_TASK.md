# NEXT TASK — prossimo passo eseguibile

> Espansione operativa di **ROADMAP[0]** ([ROADMAP](../ROADMAP.md) resta la SSOT dell'elenco ordinato).
> **Aggiornato:** 2026-07-12 (sera) · branch `integration/reconcile-20260712` (candidato `main`).

## Contesto (chiuso di recente)
- ✅ **Sprint "LunArt Operating Agent v0"** completato e **Codex-approved** (Coda operativa `/tasks`, coerenza inbox, fail-fast visibile, polish Document Center, runbook staff).
- ✅ **KI-11 risolto** (migrazione `0016` applicata, cron `vesta-followups` → run `succeeded`).
- ✅ **Anthropic in produzione OK** (verifica sintetica 12/07; resta invalida solo la chiave locale `.env.local`).
- ✅ **Integrazione locale di riconciliazione PRONTA**: questo branch = `main` + `security/p0-2` (`0015`) + `chore/autonomous-engineering` (`0016` + sprint v0), conflitti risolti, check verdi.

## Task
**Eseguire il merge di riconciliazione in `main` e il deploy** — passi 🔴 RED che solo Jacopo può approvare. `0015` e `0016` sono già rappresentate su questo candidato-`main` e **già applicate e verificate in prod**: al merge non serve alcun nuovo apply, repo e DB tornano allineati.

## Obiettivo
`main` = questo branch di integrazione (fast-forward), push su `origin/main` (= deploy prod automatico Vercel), smoke post-deploy verde.

## Perché conta
Chiude la divergenza (rischio maggiore attuale) e rende lo sprint Operating Agent v0 utilizzabile dallo staff LunArt.

## Sequenza 🔴 RED (dopo approvazione esplicita di Jacopo)
1. Review Codex del branch di integrazione → verdetto APPROVED TO EXECUTE.
2. `git checkout main && git merge --ff-only integration/reconcile-20260712`.
3. `ALLOW_PUSH=1 git push origin main` — ⚠️ include anche `d239698` (docs, mai pushato) e **avvia il deploy prod**.
4. Smoke post-deploy (read-only): login dashboard · `/tasks` · `/inbox` (chip 24h) · `/documents` · autosend ancora OFF · cron `vesta-email-poll` e `vesta-followups` `succeeded` (SQL Editor) · P0-2 ancora attivo (`go-live-check.mts`: anon negato) · nessun comportamento PMS/tariffe/pagamenti toccato.
5. (Opzionale, RED, preferibilmente dopo stabilità post-deploy) push di backup dei branch di lavoro.

## Gate 🔴 RED (immutati)
merge in `main` · push · deploy prod · migrazioni (apply) · env/segreti · autosend ON · contatto reale con ospiti · PMS/tariffe/camere/pagamenti.

## Rollback
Prima del push: `git reset --hard d239698` su `main` (nulla è uscito). Dopo il deploy: Vercel "Promote previous deployment" oppure revert+push. Le migrazioni non sono coinvolte (già applicate da giorni).

## Dopo (NON in questo task)
Reset `ANTHROPIC_API_KEY` locale (PO) · decisione su `0006` (`process_due_followups`) · P0 residui: P0-1 rotazione segreti → P0-4 header → P0-3 anti-abuso chat → P0-5 destinatario email ([SECURITY](../SECURITY.md), ADR-0019).
