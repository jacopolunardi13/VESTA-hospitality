# KNOWN ISSUES — problemi noti, rischi, workaround

> Solo **titolo + priorità + workaround + link alla SSOT**. Il dettaglio completo vive nei documenti ufficiali (SECURITY / ROADMAP / CHANGELOG), non qui.
> **Aggiornato:** 2026-06-29 · Priorità: **P0** blocca il go-live · **P1** importante · **P2** minore.

| ID | Problema | Pri | Workaround | SSOT |
|---|---|---|---|---|
| KI-1 | **Router L0 — falsi positivi `guest`** (Tonico/Amazon/Poste): da rafforzare prima di abilitare l'autosend per ospiti reali ("Router Training Sprint #1"). | P0 | autosend **OFF** | [ROADMAP](../ROADMAP.md) · [CHANGELOG](../CHANGELOG.md) |
| KI-2 | **Segreti esposti in chat** (service_role, Anthropic key, `CRON_SECRET`): da **ruotare** prima del go-live pubblico. | P0 | pilota interno, accesso limitato | [SECURITY](../SECURITY.md) · [RUNBOOKS/rotate-secrets](../RUNBOOKS/rotate-secrets.md) |
| KI-3 | **Migrazione `0014` non applicata** → `operational_tasks` assente sul DB: blocca la milestone corrente. | P1 | apply manuale nel SQL Editor | [NEXT_TASK](NEXT_TASK.md) |
| KI-4 | **Drift documentale**: `ROADMAP`/`DEPLOYMENT` indicano "`document-center` non in `main`", ma git mostra `main` == `document-center` == `efe5e03`. | P2 | questo context layer + aggiornare i due doc | [CURRENT_STATE](CURRENT_STATE.md) |
| KI-5 | **Hold 24h non propagato a `rate_calendar`**: durante la finestra un 2° ospite sulle stesse date potrebbe ricevere comunque l'auto-preventivo (rischio doppia prenotazione in finestra). | P1 | accettabile a bassa concorrenza nel pilota; risolvere prima della scala | [ARCHITECTURE](../ARCHITECTURE.md) |
| KI-6 | **Inbox** conversazioni di test accumulate. | P2 | pulizia manuale | — |
