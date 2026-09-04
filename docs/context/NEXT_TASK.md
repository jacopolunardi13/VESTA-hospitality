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
**Router Training Sprint #1 — chiusura del ciclo (KI-1).** Il codice è pronto su `main` locale (hardening L0 con soli domini espliciti + corpus 47 email con invariante hard zero over-blocking, `npm run test:router` tutto verde, Codex-reviewed). Passi rimanenti:
1. 🔴 **RED (Jacopo): push di `main` su `origin/main`** (= deploy prod Vercel del router indurito).
2. 🔴 **RED (Jacopo): Phone RED read-only** per estrarre il corpus reale da `email_routing_log` → validazione del router sui dati del pilota (stessa capability della verifica esterna 0017 — un'unica approvazione copre entrambe).
3. GREEN (post-validazione): tuning dai dati reali; poi **decisione autosend** (resta di Jacopo, KI-1 si chiude solo lì).

## Obiettivo
Routing affidabile provato sul corpus reale del pilota → gate autosend superabile in sicurezza.

## Perché conta
KI-1 è il P0 che blocca l'autosend: ogni miglioramento qui riduce il triage manuale quotidiano e avvicina il moltiplicatore operativo del pilota.

## Gate 🔴 RED (immutati)
merge in `main` · push · deploy prod · migrazioni (apply) · env/segreti · autosend ON · contatto reale con ospiti · PMS/tariffe/camere/pagamenti.

## Rollback
Prima del push dello Sprint: riportare `main` locale a `048dd4a` (il canonico remoto/prod resta intatto). Dopo un deploy: Vercel "Promote previous deployment" oppure revert+push. Le migrazioni non sono coinvolte (0015/0016/0017 già applicate).

## Dopo (NON in questo task)
Reset `ANTHROPIC_API_KEY` locale (PO) · decisione su `0006` (`process_due_followups`) · P0 residui: P0-1 rotazione segreti → P0-4 header → P0-3 anti-abuso chat → P0-5 destinatario email ([SECURITY](../SECURITY.md), ADR-0019).
