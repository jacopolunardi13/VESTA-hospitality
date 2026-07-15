# RUNBOOK — Supabase read-only MCP (piano di attivazione sicura)

> **Stato: PIANO. Non ancora configurata.** Serve a dare al Lead Engineer accesso **in sola lettura**
> al DB (catalogo/cron/pg_net inclusi), eliminando il collo di bottiglia del SQL Editor manuale per le
> **verifiche** (ACL RPC, `to_regprocedure`, `cron.job`, `net._http_response`). L'attivazione è un'azione
> **🔴 RED** (crea un ruolo DB + un segreto) → la esegue il Product Owner.

## Perché
Oggi il Lead Engineer legge il DB solo via PostgREST (service_role, data-plane): **non** vede
`pg_proc`/`proacl`, `cron.job`, `net._http_response`. Molte verifiche (P0-2, salute cron, incidente Gmail)
richiedono quindi passaggi manuali nel SQL Editor. Un accesso **read-only** rimuove questa frizione
**senza** dare alcun potere di scrittura.

## Quali permessi servono (principio: minimo privilegio, PROJECT_RULES §11)
Un **ruolo di login dedicato** in sola lettura, distinto da `service_role`/`postgres`:
```sql
-- Da eseguire dal PO nel SQL Editor (una volta).
CREATE ROLE vesta_ro LOGIN PASSWORD '<password-forte>';   -- il PO sceglie la password (segreto)
GRANT pg_read_all_data TO vesta_ro;                       -- Postgres 14+: SELECT su tutto, nessun write
ALTER ROLE vesta_ro SET default_transaction_read_only = on;  -- cintura: ogni transazione è read-only
GRANT USAGE ON SCHEMA cron, net TO vesta_ro;              -- per leggere cron.job / net._http_response
```
- `pg_read_all_data` (ruolo predefinito) concede **solo SELECT**, su tutti gli schemi, **niente** INSERT/UPDATE/DELETE/DDL.
- `default_transaction_read_only = on` è una seconda barriera: anche un errore non può scrivere.

## Quale connection string
- La stringa del **pooler** Supabase (Transaction/Session) con **utente `vesta_ro`** (non `postgres`, non `service_role`).
- Forma: `postgresql://vesta_ro:<password>@<host>:<porta>/postgres?sslmode=require`.
- **È un segreto** → vive solo nella config MCP locale (gitignored) o in un secret manager. **Mai** in repo/chat.

## Come si limita a read-only (riepilogo barriere)
1. Il ruolo ha **solo** `pg_read_all_data` (nessun privilegio di scrittura concesso).
2. `default_transaction_read_only = on` sul ruolo.
3. (Opzionale) MCP server configurato in modalità **`--read-only`** se supportata dal server scelto.
Tre livelli indipendenti: nessuno scrittura possibile anche se uno fallisse.

## Cosa POTRÒ leggere
- Tutte le tabelle applicative (già possibile via service_role) **+** catalogo: `pg_proc.proacl`,
  `information_schema`, `cron.job` / `cron.job_run_details`, `net._http_response`.
- → verifiche P0 (ACL RPC), salute cron/poll, diagnosi incidenti **in autonomia**, senza SQL Editor.

## Cosa NON potrò fare (garantito)
- Nessun **INSERT/UPDATE/DELETE**, nessun **DDL** (migrazioni restano manuali), nessuna modifica a ruoli/policy.
- Nessuna lettura di **segreti** applicativi (vivono in `.env`/Vercel, non nel DB) — e comunque niente stampa in chat.

## Rischi e mitigazioni
- **Il ruolo può leggere TUTTI i dati** (inclusi dati ospiti/PII del pilot). Se la stringa trapela → **esposizione in lettura** dell'intero DB. → Trattare la stringa come segreto (Vault/env locale), password forte, ruotabile.
- **Nessun rischio di scrittura/danno** (read-only a tre barriere).
- La MCP gira in locale sulla macchina del Lead Engineer → stesso livello di fiducia del `.env.local`.

## Come revocarla (in qualsiasi momento)
```sql
-- Revoca immediata:
ALTER ROLE vesta_ro NOLOGIN;              -- blocca subito nuovi accessi
-- oppure rotazione password:
ALTER ROLE vesta_ro PASSWORD '<nuova>';
-- oppure rimozione totale:
REVOKE pg_read_all_data FROM vesta_ro;  DROP ROLE vesta_ro;
```
E rimuovere il server dalla config MCP locale.

## Procedura di attivazione (quando il PO dà l'ok — è RED)
1. PO: crea `vesta_ro` (SQL sopra) e sceglie la password (segreto).
2. PO: recupera la connection string del pooler con utente `vesta_ro`.
3. PO: la inserisce nella config MCP locale (gitignored) — **il Lead Engineer non la vede in chiaro**.
4. Lead Engineer: verifica read-only con un `SELECT` + prova che un `INSERT` fallisce (read-only) → DoD.
5. Documenta l'attivazione qui e nel Context Layer.

## Related Documents
- [../foundations/ENGINEERING.md](../foundations/ENGINEERING.md) · [../SECURITY.md](../SECURITY.md) · [../ENVIRONMENT.md](../ENVIRONMENT.md) · [../DATABASE.md](../DATABASE.md)
