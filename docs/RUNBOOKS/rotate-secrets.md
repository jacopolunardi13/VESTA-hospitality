# RUNBOOK — Rotazione dei segreti

Da eseguire **prima del go-live pubblico** e ogni volta che un segreto è stato esposto. Principi →
[../SECURITY.md](../SECURITY.md), PROJECT_RULES §11. **Mai incollare i valori in chat.**

## Segreti da ruotare (stato 27/06/2026)
- `SUPABASE_SERVICE_ROLE_KEY` — esposto in chat in sessioni precedenti.
- `ANTHROPIC_API_KEY` — esposto in chat in sessioni precedenti.
- `CRON_SECRET` — usato in comandi di debug (comparso nei log di sessione).

## Procedura
1. **Supabase service-role**: Supabase → Project Settings → API → rigenera la service-role key →
   aggiorna `SUPABASE_SERVICE_ROLE_KEY` su **Vercel** (Preview+Production) e in `.env.local`.
2. **Anthropic**: console Anthropic → revoca/crea API key → aggiorna `ANTHROPIC_API_KEY` su Vercel + `.env.local`.
3. **CRON_SECRET**: scegli un valore nuovo → aggiornalo in **due posti** che devono combaciare:
   - Vercel env (`CRON_SECRET`);
   - il job **pg_cron 0009** (`vesta-email-poll`) che invia `Authorization: Bearer <CRON_SECRET>` →
     va **ri-schedulato** col nuovo valore (e così per ogni job `/api/cron/*` che lo usa).
4. **Redeploy** (così le nuove env entrano in vigore) e verifica con un poll/diag.

## Note
- Considerare **Supabase Vault** per non avere il secret in chiaro nella migrazione del cron (Future
  Evolution in [../SECURITY.md](../SECURITY.md)).
- Pubblicare l'app OAuth Google per evitare la scadenza del refresh token a 7 giorni (stato "testing").

## Related Documents
- [../SECURITY.md](../SECURITY.md) · [../ENVIRONMENT.md](../ENVIRONMENT.md) · [../INFRASTRUCTURE.md](../INFRASTRUCTURE.md) · [suspend-resume-cron.md](suspend-resume-cron.md)
