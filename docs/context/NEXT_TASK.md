# NEXT TASK — prossimo passo eseguibile

> Espansione operativa di **ROADMAP[0]** ([ROADMAP](../ROADMAP.md) resta la SSOT dell'elenco ordinato).
> **Aggiornato:** 2026-06-29 · branch `document-center`.

## Task
Completare la milestone **Operational Queue — sotto-flusso scadenza pagamento 24h** (6 obiettivi).

## Prerequisiti
1. ⛔ **Apply migrazione `supabase/migrations/0014_operational_tasks.sql`** nel Supabase SQL Editor.
   DDL = **solo il titolare** (il mio ambiente ha solo PostgREST data-plane, niente DDL → vedi [autonomia](../../PROJECT_RULES.md)).
2. Verifica oggettiva post-apply:
   - `SELECT to_regclass('public.operational_tasks');` → **non NULL**
   - `SELECT to_regprocedure('public.process_operational_deadlines()');` → **non NULL**
   - `SELECT public.process_operational_deadlines();` → **0** (nessuno scaduto adesso)

## Comandi / test
- E2E reale (entrambi i rami), da `app/`:
  `node --env-file=.env.local --import tsx scripts/test-payment-expiry-e2e.mts`
- Pre-merge: `npx tsc --noEmit` · `npm run build` · test offline verdi.

## Criteri di completamento (DoD §1 + §13)
1. codice in **`main`**;
2. migrazione `0014` **applicata e verificata** (`to_regclass`);
3. **E2E reale** superato sui 6 obiettivi:
   1. registra scadenza a +24h riusando `booking_requests.hold_expires_at`;
   2. alla scadenza **nessuna email** al cliente;
   3. crea task `booking.payment_window_expired` per lo staff (idempotente);
   4. staff ha **2 sole azioni**: pagamento ricevuto / non ricevuto;
   5. "ricevuto" → conferma prenotazione + invio conferma finale;
   6. "non ricevuto" → `cancelled` (nota "scaduto") + invio comunicazione di scadenza; camera liberata **manualmente** dallo staff.
4. **context layer aggiornato** (`CURRENT_STATE` + questo file + `PROJECT_SYNC_REPORT`).

## Dopo (NON in questa milestone, richiede approvazione titolare)
Attivare `email_autosend_enabled` + riattivare cron `vesta-email-poll`. Prima va chiuso il blocker **Router L0** (vedi [KNOWN_ISSUES](KNOWN_ISSUES.md) KI-1).
