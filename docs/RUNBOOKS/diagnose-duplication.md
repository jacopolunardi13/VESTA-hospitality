# RUNBOOK — Diagnosticare duplicazione / re-ingest

Procedura usata nell'incidente del 27/06/2026 ([../CHANGELOG.md](../CHANGELOG.md)). Riutilizzabile per
qualsiasi sospetto di "successo silenzioso" o re-ingest.

## Sintomi
Conversazioni con molti messaggi ma **un solo `rfc_message_id`** distinto; tabelle DB che "sembrano"
funzionare ma il dedup non scatta; consumo AI/token anomalo.

## Passi di diagnosi (sola lettura)
1. **Conteggi conversazioni/messaggi** per il contatto sospetto (`inspect-test-conversation.mts`): se
   N messaggi ma 1 rfc distinto → stessa email re-ingerita N volte.
2. **Cadenza**: calcolare i gap tra inbound consecutivi. Gap regolari (es. ~120s) → **scheduler
   automatico** (pg_cron). Verificare: `select jobname, schedule, active from cron.job;`.
3. **Esistenza tabelle dedup** (catalogo): `select to_regclass('public.email_routing_log');` → se `NULL`,
   la tabella non esiste → il dedup è inerte.
4. **Esposizione PostgREST**: l'OpenAPI dell'API (`GET /rest/v1/`) deve elencare la tabella; se manca, le
   query dell'app falliscono.
5. **Errori ingoiati**: cercare `insert/select` senza check `.error` (Fail-Fast, [../SECURITY.md](../SECURITY.md)).

## Contromisure immediate
- **Sospendere** il cron responsabile ([suspend-resume-cron.md](suspend-resume-cron.md)).
- Applicare/verificare le migrazioni mancanti ([apply-migration.md](apply-migration.md)).
- Rendere fail-fast il codice (helper `dbThrow`).

## Lezione (causa-radice tipica)
Migrazioni **non applicate** + codice che **ingoia gli errori** + uno **scheduler** che ripete →
re-ingest massivo invisibile. Vedi [../DECISIONS.md](../DECISIONS.md) ADR-0004 e ADR-0009.

## Related Documents
- [../DATABASE.md](../DATABASE.md) · [../SECURITY.md](../SECURITY.md) · [../CHANGELOG.md](../CHANGELOG.md) · [apply-migration.md](apply-migration.md)
