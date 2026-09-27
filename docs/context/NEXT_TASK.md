# NEXT TASK — prossimo passo eseguibile

> Espansione operativa di **ROADMAP[0]** ([ROADMAP](../ROADMAP.md) resta la SSOT dell'elenco ordinato).
> **Aggiornato:** 2026-09-27 · branch `main` (canonico = remoto, `git ls-remote`). **SHIP Router Sprint #1 + validazione Email E2E COMPLETATI il 27/09** (RED con pin; deploy Vercel Production; smoke e verifica DB verdi; ADR-0021 in vigore).

## Contesto (chiuso di recente)
- ✅ **Migrazione `0017` (least-privilege) APPLICATA IN PRODUZIONE** (28/08, WorkspaceOS Phone RED, transazione atomica, receipt ok; artefatto byte-identico al repo) — vedi [SECURITY](../SECURITY.md) "Evidence of verification — 0017". (La linea è POI confluita in `main` con la riconciliazione del 04/09.)
- ✅ **Baseline verde su `ff42731`** (28/08): `npm ci` · `next lint` · `next build` tutti ✅.
- ✅ **Sprint "LunArt Operating Agent v0"** completato e **Codex-approved** (Coda operativa `/tasks`, coerenza inbox, fail-fast visibile, polish Document Center, runbook staff).
- ✅ **KI-11 risolto** (migrazione `0016` applicata, cron `vesta-followups` → run `succeeded`).
- ✅ **Anthropic in produzione OK** (verifica sintetica 12/07; resta invalida solo la chiave locale `.env.local`).
- ✅ **Riconciliazione ESEGUITA (04/09)**: merge ff + push + deploy prod completati (0015+0016+sprint v0+0017 tutti su `origin/main` = `048dd4a`); smoke verde.

## Task
**Decisione autosend (Jacopo) — il milestone SHIP + Email E2E è CHIUSO il 27/09.**
Fatto il 27/09: push ff autorizzato → deploy Vercel Production (verificato via GitHub deployment status) → smoke verde → **E2E reale in produzione**: email di test controllata → cron 2' → router `guest` (fail-safe, `suppressed=false`) → conversation + **bozza AI `autosend_off`** + booking_request `received`; **zero invii automatici** (DB: `sent_count=0` nel giorno; mittente: nessuna reply). Evidence durevole in `~/.vesta-db-audit/evidence/`.

Storico sprint (chiuso il 04/09): Fatto: hardening L0 (soli domini espliciti), corpus 47 email con invariante zero over-blocking, `npm run test:router` verde, **Codex ACCEPT (5 round)**; ✅ Phone RED read-only eseguita: **0017 verificata in prod (10/10 assertions)** + corpus reale estratto; ✅ **shadow analysis su 687 record reali**: 660 replayable, **solo 4 cambi (tutti spiegati: 2× Tonico = i FP documentati di KI-1, 2× amazon innocui), 0 unblocks, 39/41 guest invariati** — zero difetti emersi. Credenziali read+write a ciclo chiuso. Residui → backlog in [KNOWN_ISSUES](KNOWN_ISSUES.md).
Passo rimanente (l'unico):
1. **Decisione autosend** (tua; KI-1 si chiude lì). Set minimo di label review: conferma dei 2 record Tonico del 28/06 (shadow analysis READY FOR HUMAN LABEL REVIEW). Il router indurito è ora IN PRODUZIONE e il percorso E2E è provato: la decisione è sbloccata.

## Prossimo workflow hospitality
**Adozione operativa del canale email da parte dello staff** (bozze `autosend_off` in dashboard → approvazione/invio manuale nel pilota) e, dopo la decisione autosend, l'eventuale attivazione graduale. La **validazione E2E** (ROADMAP #1) è ✅ CHIUSA il 27/09.

## Perché conta
KI-1 è il P0 che gate l'autosend: il router indurito in prod riduce subito il triage manuale e rende il gate superabile in sicurezza.

## Gate 🔴 RED (immutati)
merge in `main` · push · deploy prod · migrazioni (apply) · env/segreti · autosend ON · contatto reale con ospiti · PMS/tariffe/camere/pagamenti.

## Rollback
Prima del push dello Sprint: riportare `main` locale a `048dd4a` (il canonico remoto/prod resta intatto). Dopo un deploy: Vercel "Promote previous deployment" oppure revert+push. Le migrazioni non sono coinvolte (0015/0016/0017 già applicate).

## Dopo (NON in questo task)
Reset `ANTHROPIC_API_KEY` locale (PO) · decisione su `0006` (`process_due_followups`) · P0 residui: P0-1 rotazione segreti → P0-4 header → P0-3 anti-abuso chat → P0-5 destinatario email ([SECURITY](../SECURITY.md), ADR-0019).
