# RUNBOOK — Applicare una migrazione

Procedura ufficiale per applicare una migrazione al DB. Regole → [../DATABASE.md](../DATABASE.md),
[../../PROJECT_RULES.md](../../PROJECT_RULES.md) §6. **Una migrazione funzionale per volta.**

## Precondizioni
- Il file `supabase/migrations/NNNN_*.sql` esiste ed è additivo/idempotente.
- I prerequisiti (tabelle/funzioni referenziate) sono già applicati.

## Passi
1. Supabase → progetto **`zhqxxjasriaiwdbagwwj`** → **SQL Editor** → New query.
2. Incolla il **contenuto del file di migrazione** ed esegui (**Run**). Atteso: "Success".
3. **Verifica esistenza** (catalogo Postgres) — sostituisci le tabelle create:
   ```sql
   select to_regclass('public.<tabella_1>'), to_regclass('public.<tabella_2>');
   ```
   Atteso: i nomi (non `NULL`). Per colonne/indici/policy: `information_schema.columns` /
   `pg_indexes` / `pg_policies`.
4. **Verifica esposizione REST** (l'app usa PostgREST): la tabella deve essere raggiungibile via API
   (di norma Supabase ricarica lo schema cache dopo la DDL; in caso contrario `notify pgrst, 'reload schema';`).

## Definizione di "applicata"
Una migrazione è applicata **solo** se il punto 3 lo conferma. Mai dedurla dal comportamento dell'app
(gli errori possono essere ingoiati — vedi [diagnose-duplication.md](diagnose-duplication.md)).

## Related Documents
- [../DATABASE.md](../DATABASE.md) · [../DECISIONS.md](../DECISIONS.md) (ADR-0009) · [../DEPLOYMENT.md](../DEPLOYMENT.md)
