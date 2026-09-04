# NEXT TASK — prossimo passo eseguibile

> Espansione operativa di **ROADMAP[0]** ([ROADMAP](../ROADMAP.md) resta la SSOT dell'elenco ordinato).
> **Aggiornato:** 2026-09-04 · branch `main` (canonico = `048dd4a`). **Il merge di riconciliazione + push + deploy sono COMPLETATI** (04/09, RED autorizzata; smoke verde).

## Contesto (chiuso di recente)
- ✅ **Migrazione `0017` (least-privilege) APPLICATA IN PRODUZIONE** (28/08, WorkspaceOS Phone RED, transazione atomica, receipt ok; artefatto byte-identico al repo) — vedi [SECURITY](../SECURITY.md) "Evidence of verification — 0017". (La linea è POI confluita in `main` con la riconciliazione del 04/09.)
- ✅ **Baseline verde su `ff42731`** (28/08): `npm ci` · `next lint` · `next build` tutti ✅.
- ✅ **Sprint "LunArt Operating Agent v0"** completato e **Codex-approved** (Coda operativa `/tasks`, coerenza inbox, fail-fast visibile, polish Document Center, runbook staff).
- ✅ **KI-11 risolto** (migrazione `0016` applicata, cron `vesta-followups` → run `succeeded`).
- ✅ **Anthropic in produzione OK** (verifica sintetica 12/07; resta invalida solo la chiave locale `.env.local`).
- ✅ **Riconciliazione ESEGUITA (04/09)**: merge ff + push + deploy prod completati (0015+0016+sprint v0+0017 tutti su `origin/main` = `048dd4a`); smoke verde.

## Task
**SHIP del Router Training Sprint #1 (KI-1) — sviluppo CHIUSO il 04/09.** Fatto: hardening L0 (soli domini espliciti), corpus 47 email con invariante zero over-blocking, `npm run test:router` verde, **Codex ACCEPT (5 round)**; ✅ Phone RED read-only eseguita: **0017 verificata in prod (10/10 assertions)** + corpus reale estratto; ✅ **shadow analysis su 687 record reali**: 660 replayable, **solo 4 cambi (tutti spiegati: 2× Tonico = i FP documentati di KI-1, 2× amazon innocui), 0 unblocks, 39/41 guest invariati** — zero difetti emersi. Credenziali read+write a ciclo chiuso. Residui → backlog in [KNOWN_ISSUES](KNOWN_ISSUES.md).
Passo rimanente:
1. 🔴 **RED (Jacopo): push di `main` locale su `origin/main`** (= deploy prod Vercel del router indurito). Smoke post-deploy: `npm run test:router` già verde in build; verifica route come da runbook.
2. Poi **decisione autosend** (tua; KI-1 si chiude lì — la shadow analysis è READY FOR HUMAN LABEL REVIEW, set minimo: conferma dei 2 record Tonico 28/06).

## Prossimo workflow hospitality (dopo lo ship)
**Validazione E2E canale email** (ROADMAP #1) — sbloccata dal deploy del 04/09 (fail-fast visibile ora in prod); runbook `docs/RUNBOOKS/email-e2e-test.md`.

## Perché conta
KI-1 è il P0 che gate l'autosend: il router indurito in prod riduce subito il triage manuale e rende il gate superabile in sicurezza.

## Gate 🔴 RED (immutati)
merge in `main` · push · deploy prod · migrazioni (apply) · env/segreti · autosend ON · contatto reale con ospiti · PMS/tariffe/camere/pagamenti.

## Rollback
Prima del push dello Sprint: riportare `main` locale a `048dd4a` (il canonico remoto/prod resta intatto). Dopo un deploy: Vercel "Promote previous deployment" oppure revert+push. Le migrazioni non sono coinvolte (0015/0016/0017 già applicate).

## Dopo (NON in questo task)
Reset `ANTHROPIC_API_KEY` locale (PO) · decisione su `0006` (`process_due_followups`) · P0 residui: P0-1 rotazione segreti → P0-4 header → P0-3 anti-abuso chat → P0-5 destinatario email ([SECURITY](../SECURITY.md), ADR-0019).
