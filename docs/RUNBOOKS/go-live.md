# RUNBOOK — Go-Live (automazione + gate umani)

Procedura per decidere **GO / NO-GO** dell'esposizione pubblica di Vesta. Combina una **verifica
automatica** (ciò che il Lead Engineer può accertare da solo, senza segreti) con i **gate umani**
(azioni 🔴 RED del Product Owner). Gate e invarianti: [SECURITY.md](../SECURITY.md) (Go-Live Security
Assessment) + [DECISIONS.md](../DECISIONS.md) ADR-0019.

## 1. Verifica automatica
Da `app/`:
```bash
node --env-file=.env.local --import tsx scripts/go-live-check.mts
# opzionale, contro un deploy specifico:
E2E_BASE=https://<deploy> node --env-file=.env.local --import tsx scripts/go-live-check.mts
```
Produce una matrice mappata sui P0. **Non stampa segreti.** Esito:
- **`❌ FAIL`** = bloccante automatico → **NO-GO** finché non risolto.
- **`⚠️ WARN`** = segnale da approfondire (proxy non definitivo).
- **`🔴 GATE`** = richiede conferma umana (sotto).

Cosa accerta da solo: **RLS live** (anon → 0 righe), **P0-2** (anon negato su RPC pericolose), **P0-4**
(security header), presenza RPC core (proxy migrazioni), freschezza del poll email.

## 2. Gate umani (🔴 RED — li chiude il Product Owner)
| Gate | Come confermarlo | GO se… |
|---|---|---|
| **P0-1 · Segreti** | `verify-rotation.mts` verde + vecchi revocati (`vesta-secret-rotate`) | tutti ruotati e verificati |
| **Migrazioni applicate** | SQL Editor / MCP read-only: `to_regclass`/`to_regprocedure` non-NULL per gli oggetti attesi | tutte applicate e verificate |
| **Cron sani** | `SELECT status_code,left(content,200),created FROM net._http_response ORDER BY created DESC LIMIT 10;` | poll/ical rispondono `200` |
| **Env prod presenti** | `npx vercel env ls production` → nomi richiesti presenti (mai i valori) | inventario completo |
| **P0-3 · Anti-abuso chat** | verifica runtime: IP da piattaforma (non `X-Forwarded-For`), cap globale conversazioni | implementato e testato |
| **P0-5 · Destinatario email** | review `deliverToGuest`: `to` ancorato all'identità di trasporto | implementato e testato |
| **Autosend** | `properties.settings.email_autosend_enabled` = **OFF** finché deciso diversamente (R0.1) | coerente con la policy |
| **Signup** | Supabase Auth `disable_signup` = **true** finché non serve onboarding self-service (OD-2) | coerente |

## 3. Criterio di decisione
**GO** solo se: **0 `FAIL`** automatici **e** tutti i **gate** ✅ confermati **e** il verdetto ADR-0019
è rivalutato positivamente. Un solo bloccante aperto → **NO-GO**.

## 4. Note
- L'automazione **non sostituisce** il giudizio: i `WARN` e i `GATE` vanno letti, non ignorati.
- Attivando la **MCP Supabase read-only** ([supabase-readonly-mcp.md](supabase-readonly-mcp.md)), i gate
  "Migrazioni applicate" e "Cron sani" diventano verificabili in autonomia (restano read-only).

## Related
- skill `vesta-go-live` · `app/scripts/go-live-check.mts` · [SECURITY.md](../SECURITY.md) · [ENGINEERING.md](../foundations/ENGINEERING.md).
