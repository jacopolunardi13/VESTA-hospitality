---
name: vesta-migrate
description: Guida la scrittura e la verifica di una migrazione DB di Vesta in modo sicuro — idempotente, existence-guarded, una alla volta — sapendo che l'apply DDL è MANUALE (SQL Editor, azione del Product Owner). Produce il file di migrazione + il kit di verifica (to_regclass/to_regprocedure + test comportamentali) e marca esplicitamente il punto di apply umano. Usala ogni volta che una modifica richiede una migrazione Postgres/Supabase.
---

# vesta-migrate — migrazioni sicure a Vesta

Vincolo d'ambiente: **niente DDL automatico** — le migrazioni le applica il Product Owner a mano nel
SQL Editor ([apply-migration.md](../../../docs/RUNBOOKS/apply-migration.md)). L'apply è **🔴 RED**. La skill
prepara tutto l'automatizzabile e isola il passo umano.

## Principi (appresi dalla migrazione 0015)
1. **Una migrazione funzionale per volta**, numerata progressivamente (`supabase/migrations/NNNN_*.sql`).
2. **Idempotente e rieseguibile**: `CREATE OR REPLACE`, `IF NOT EXISTS`, `REVOKE/GRANT` ripetibili.
3. **Existence-guarded**: non presupporre oggetti. Per operare solo su ciò che esiste davvero, usa
   `to_regprocedure(...) IS NOT NULL` / `to_regclass(...) IS NOT NULL` in blocchi `DO`. *(Il DB reale può
   divergere dalla storia migrazioni — verifica, non assumere: vedi il caso `process_due_followups`.)*
4. **Non mutare dati** se non è lo scopo esplicito; separa DDL da data-fix.
5. **Firme esatte**: prima di un `CREATE OR REPLACE`, verifica la firma reale della funzione esistente
   (nomi/tipi dei parametri) per **sostituire** e non creare un overload.
6. In coda alla migrazione, includi il **blocco di verifica** (commenti SQL con le query oggettive).

## Flusso
1. **Verifica lo stato reale** del DB per gli oggetti coinvolti (via probe/introspezione read-only, o —
   quando disponibile — la MCP read-only). Non fidarti solo dei file in `supabase/migrations/`.
2. **Scrivi** il file di migrazione (principi sopra).
3. **Prepara il kit di verifica**: query `to_regclass`/`to_regprocedure`, controlli ACL (`pg_proc.proacl`),
   e test comportamentali (script `.mts` e/o un `.sql` con `SET LOCAL ROLE`/`request.jwt.claims` in
   `BEGIN…ROLLBACK` per non persistere dati).
4. **Consegna al PO** per l'apply (RED). Fornisci: comando/istruzioni, esiti attesi, e come leggerli.
5. **Dopo l'apply** (confermato dal PO): esegui il kit di verifica → `to_reg*` non-NULL + test verdi.
6. **DoD**: la migrazione è "completata" solo con apply confermato + verifica reale + Context Layer +
   SSOT (`DATABASE.md`) aggiornati (`vesta-dod-check`).

## Anti-pattern da evitare
- `REVOKE/GRANT` diretti su funzioni che potrebbero non esistere → usa il guard `to_regprocedure`.
- `CREATE OR REPLACE` con firma diversa dall'esistente → crea un doppione, l'oggetto vulnerabile resta.
- Dichiarare "applicata" senza `to_reg*` reale.

## Related
- [apply-migration.md](../../../docs/RUNBOOKS/apply-migration.md) · [DATABASE.md](../../../docs/DATABASE.md) ·
  [ENGINEERING.md](../../../docs/foundations/ENGINEERING.md) (apply = RED) · skill `vesta-dod-check`.
