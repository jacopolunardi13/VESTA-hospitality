---
name: vesta-context-sync
description: Aggiorna il Context Layer di Vesta (docs/context/) alla chiusura di una milestone, mantenendolo allineato al git reale e coerente fra i file, senza duplicare le SSOT. Delega all'agente context-keeper. Usala a fine milestone (dopo che una feature/fix ha superato la DoD) o quando lo stato del repo è cambiato e i file di contesto sono disallineati.
---

# vesta-context-sync — riallinea il Context Layer

Regola di Vesta: **ogni milestone aggiorna il Context Layer** (ENGINEERING.md §4-5, ADR-0018). Lo stato
vivo è nel repo, non nella chat. Questa skill orchestra l'aggiornamento delegando all'agente
**`context-keeper`** (che è il custode di `docs/context/`).

## Quando usarla
- A **fine milestone** (una feature/fix ha superato `vesta-dod-check`).
- Quando `git`/DB reali divergono da ciò che i file di contesto affermano.
- **Non** ad ogni micro-commit: una milestone copre un tratto coerente di lavoro.

## Procedura
1. **Fotografa il reale**: `git branch --show-current`, `git log --oneline -8`, stato branch/merge.
   *(Attenzione ai branch paralleli: un file di contesto su un feature branch può riflettere `main` e
   divergere da un altro branch. Aggiorna con note additive per ridurre i conflitti di merge.)*
2. **Invoca `context-keeper`** con il contesto della milestone chiusa (cosa è cambiato, commit, prove).
3. Il context-keeper aggiorna, mantenendoli coerenti: `CURRENT_STATE.md`, `NEXT_TASK.md`,
   `OPEN_DECISIONS.md`, `KNOWN_ISSUES.md`, `PROJECT_SYNC_REPORT.md` — **senza duplicare** le SSOT
   (SECURITY/ROADMAP/DECISIONS restano le fonti; il contesto rimanda).
4. **Verifica coerenza**: HEAD/branch citati = git reale; nessuna contraddizione fra i file; le milestone
   chiuse spostate da "corrente" a "completata".

## DoD della sync
Context Layer allineato al git reale, coerente internamente, senza duplicazioni; le SSOT impattate già
aggiornate contestualmente alla modifica (Documentation-as-Code).

## Related
- Agente `context-keeper` · [ENGINEERING.md](../../../docs/foundations/ENGINEERING.md) · [docs/context/](../../../docs/context/) · ADR-0018.
