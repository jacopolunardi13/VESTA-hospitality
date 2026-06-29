# PROJECT SYNC REPORT — TEMPLATE (stabile)

> Questa è la **scaletta stabile** per generare [PROJECT_SYNC_REPORT.md](PROJECT_SYNC_REPORT.md).
> **Non compilare qui.** Obiettivo del report generato: riallineare un assistente (ChatGPT/Claude) in **< 5 minuti**, con **solo** ciò che serve. Tutto il resto vive nei doc ufficiali.
> Regola: il report è una **vista derivata** dei 4 file di stato (`CURRENT_STATE`, `NEXT_TASK`, `OPEN_DECISIONS`, `KNOWN_ISSUES`) — non una nuova fonte di verità.

---

## 1. Identità progetto
`<nome>` — `<cos'è in una riga>`. Repo: `<github>`. Pilota: `<struttura>`. Stato repo come fonte di verità (no stato nelle chat).

## 2. Stack minimo
`<linguaggio · framework · DB/Auth · AI · hosting>` (dettaglio in `docs/` / report repository).

## 3. Stato attuale  *(da CURRENT_STATE.md)*
- Branch / HEAD: `<…>`
- In `main`: `<…>`
- Working tree non committato / milestone corrente: `<…>`
- Flag operativi: `<autosend · cron · …>`

## 4. Prossimo task  *(da NEXT_TASK.md)*
- Task · prerequisiti · comandi/test · criteri DoD.

## 5. Decisioni aperte  *(da OPEN_DECISIONS.md — solo le rilevanti)*

## 6. Problemi noti P0/P1  *(da KNOWN_ISSUES.md)*

## 7. Regole non negoziabili
- **DoD**: codice in `main` + migrazione verificata (`to_regclass`) + E2E reale + **context layer aggiornato**.
- **Human-in-the-Loop fino a PMS** (ADR-0011): nessuna azione operativa autonoma (blocco/conferma camere, IBAN, pagamenti, tariffe).
- **Pilota sicuro**: autosend OFF di default, cron sospendibile, nessun contatto a ospiti reali senza verifica.
- **Migrazioni**: manuali nel SQL Editor, **una alla volta**, sempre verificate.

## 8. Come applicare una migrazione
Solo il titolare (DDL): SQL Editor → incolla → Run → verifica `to_regclass`. Procedura: `docs/RUNBOOKS/apply-migration.md`.

---
*Generato da: i 4 file in `docs/context/`. Aggiornare il report ad ogni milestone (parte del DoD).*
