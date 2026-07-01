# KNOWN ISSUES — problemi noti, rischi, workaround

> Solo **titolo + priorità + workaround + link alla SSOT**. Il dettaglio completo vive nei documenti ufficiali (SECURITY / ROADMAP / CHANGELOG), non qui.
> **Aggiornato:** 2026-06-30 · Priorità: **P0** bloccante (esposizione pubblica **o** attivazione autosend) · **P1** importante · **P2** minore.
> Il **Security Sprint P0** copre i 5 P0 di *esposizione pubblica* (KI-2, KI-7…KI-10 → SECURITY P0-1…P0-5). **KI-1** è un P0 distinto che gate l'**autosend** (non parte dello sprint pubblico). Fonte completa: [SECURITY](../SECURITY.md) (Go-Live Security Assessment) · gate: [DECISIONS](../DECISIONS.md) ADR-0019.

| ID | Problema | Pri | Workaround | SSOT |
|---|---|---|---|---|
| KI-1 | **Router L0 — falsi positivi `guest`** (Tonico/Amazon/Poste): da rafforzare prima di abilitare l'autosend per ospiti reali ("Router Training Sprint #1"). | P0 | autosend **OFF** | [ROADMAP](../ROADMAP.md) · [CHANGELOG](../CHANGELOG.md) |
| KI-2 | **Segreti esposti** (service_role, Anthropic, Gmail client secret + refresh token, Vercel bypass; `CRON_SECRET` placeholder): da **ruotare** prima del go-live pubblico. | P0 | pilota interno, accesso limitato | [SECURITY](../SECURITY.md) P0-1 · [RUNBOOKS/rotate-secrets](../RUNBOOKS/rotate-secrets.md) |
| KI-7 | **RPC `SECURITY DEFINER` privilegiate** (`enroll_user_in_org`, `transition_booking_request`, `process_*_deadlines`): si fidano di parametri del chiamante / concesse a `authenticated` → cross-tenant + possibile takeover di tenant (aggravato da signup aperto). Bypassano l'RLS. | P0 | single-tenant nel pilot; verificare GRANT live | [SECURITY](../SECURITY.md) P0-2 |
| KI-8 | **Chat pubblica abusabile**: `X-Forwarded-For` spoofabile → bypass rate-limit/IP-block; nessun cap globale conversazioni → DoS/cost-abuse. | P0 | budget AI €5/g limita la spesa; chat non esposta a volume | [SECURITY](../SECURITY.md) P0-3 |
| KI-9 | **Nessun security header** (CSP/X-Frame-Options/HSTS) né middleware → clickjacking sul widget pubblico. | P0 | widget non ancora pubblicizzato | [SECURITY](../SECURITY.md) P0-4 |
| KI-10 | **Dirottamento destinatario email**: `guest_contact` estratto dall'LLM sovrascrive il destinatario → IBAN/PDF a indirizzo iniettato (via Tier-2, bypassa il kill-switch). | P0 | autosend OFF; sorvegliare i Tier-2 nel pilot | [SECURITY](../SECURITY.md) P0-5 |
| KI-5 | **Hold 24h non propagato a `rate_calendar`**: durante la finestra un 2° ospite sulle stesse date potrebbe ricevere comunque l'auto-preventivo (rischio doppia prenotazione in finestra). | P1 | accettabile a bassa concorrenza nel pilota; risolvere prima della scala | [ARCHITECTURE](../ARCHITECTURE.md) |

> **Risolti (30/06):** ~~KI-3 migrazione 0014 non applicata~~ (applicata + mergiata), ~~KI-4 drift `main`/`document-center`~~ (mergiato + doc riallineati), ~~KI-6 conversazioni di test in Inbox~~ (pulizia Giorno Zero). Altri P1/P2 di sicurezza: vedi [SECURITY](../SECURITY.md).
