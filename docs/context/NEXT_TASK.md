# NEXT TASK — prossimo passo eseguibile

> Espansione operativa di **ROADMAP[0]** ([ROADMAP](../ROADMAP.md) resta la SSOT dell'elenco ordinato).
> **Aggiornato:** 2026-06-30 · branch `main`.

## Task
**Security Sprint P0** — chiudere le 5 vulnerabilità bloccanti prima di qualsiasi esposizione pubblica di Vesta su Internet. **Da eseguire in una chat dedicata.** Sviluppo skill/agenti **sospeso** fino a chiusura.

Gate e dettaglio: [SECURITY](../SECURITY.md) (Go-Live Security Assessment) + [DECISIONS](../DECISIONS.md) **ADR-0019**. Elenco completo con severità e file: [KNOWN_ISSUES](KNOWN_ISSUES.md) (KI-2, KI-7…KI-10).

## Ordine consigliato (rischio prima)
1. **P0-1 · Rotazione segreti** — ruotare `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `GMAIL_CLIENT_SECRET`+`GMAIL_REFRESH_TOKEN`, `VERCEL_AUTOMATION_BYPASS_SECRET`; impostare un `CRON_SECRET` reale (Vercel + `pg_cron` 0009). *(Config, nessun codice.)* → [RUNBOOKS/rotate-secrets](../RUNBOOKS/rotate-secrets.md).
2. **P0-2 · Hardening RPC `SECURITY DEFINER`** — verificare i GRANT live + il setting signup; `REVOKE` da public/authenticated; derivare l'org da `auth.uid()` (non da parametro). Richiede **migrazione** → DoD (apply + `to_regprocedure` + test).
3. **P0-4 · Security header** — `headers()` in `next.config.ts` (CSP `frame-ancestors`, `X-Frame-Options`, HSTS, `nosniff`).
4. **P0-3 · Anti-abuso chat pubblica** — IP dalla piattaforma (non da `X-Forwarded-For`); cap globale per-property/IP su richieste e creazione conversazioni.
5. **P0-5 · Dirottamento destinatario email** — ancorare `to` all'identità di trasporto in `deliverToGuest`; non sovrascrivere `guest_contact` di canale con valore LLM.

## Criteri di completamento (DoD §1 + §13)
1. ogni correzione P0 in **`main`** (le migrazioni RPC **applicate e verificate** con `to_regprocedure`/`to_regclass`);
2. **ri-test degli attacchi**: spoof `X-Forwarded-For`, chiamata RPC cross-tenant, iframe del widget, email injection del destinatario;
3. **context layer aggiornato** + tabella controlli in [SECURITY](../SECURITY.md) con P0 → "chiuso";
4. **rivalutazione GO/NO-GO** dell'esposizione pubblica.

## Dopo (NON in questo sprint)
P1 subito dopo il go-live; P2 in normale iterazione. Ripresa sviluppo skill/agenti. Attivazione `email_autosend_enabled` resta subordinata all'hardening Router L0 ([KNOWN_ISSUES](KNOWN_ISSUES.md) KI-1) e a decisione titolare.
