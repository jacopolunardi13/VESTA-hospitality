---
name: vesta-go-live
description: Esegue la Go-Live Automation di Vesta e guida la decisione GO/NO-GO dell'esposizione pubblica — lancia go-live-check.mts (verifica automatica senza segreti: RLS live, P0-2 anon negato, security header, RPC core, salute email), interpreta la matrice mappata sui P0, e conduce i gate umani 🔴 (rotazione segreti, migrazioni applicate, cron sani, P0-3/P0-5, autosend/signup). Usala per valutare se Vesta può andare in pubblico o cosa manca.
---

# vesta-go-live — decisione GO / NO-GO

Orchestra il gate di go-live pubblico (ADR-0019). Combina l'automazione con i gate umani; il verdetto
finale è una **decisione**, non solo l'output di uno script. Runbook: [go-live.md](../../../docs/RUNBOOKS/go-live.md).

## Procedura
1. **Allinea il contesto** (regola zero): leggi `docs/context/` + `git log`. Non fidarti della memoria.
2. **Verifica automatica**: da `app/`,
   `node --env-file=.env.local --import tsx scripts/go-live-check.mts` (opz. `E2E_BASE=…`).
   Leggi la matrice: `❌ FAIL` = bloccante automatico · `⚠️ WARN` = da approfondire · `🔴 GATE` = conferma umana.
3. **Gate umani** (🔴 RED — li chiude il PO): percorri la tabella in [go-live.md](../../../docs/RUNBOOKS/go-live.md) §2
   (segreti, migrazioni `to_reg*`, cron `net._http_response`, env prod, P0-3, P0-5, autosend, signup).
   Per ognuno raccogli la prova o indica al PO l'azione esatta.
4. **Verdetto**: **GO** solo se 0 `FAIL` **e** tutti i gate ✅ **e** rivalutazione ADR-0019 positiva.
   Altrimenti **NO-GO**, con la lista precisa dei bloccanti.

## Regole
- **Niente segreti** in output. I gate che richiedono segreti/console/SQL Editor restano azioni del PO.
- Non dichiarare GO per inerzia: ogni gate va **confermato con prova**, non assunto.
- Aggiorna la tabella P0 in [SECURITY.md](../../../docs/SECURITY.md) e il Context Layer man mano che i gate si chiudono.

## Related
- [go-live.md](../../../docs/RUNBOOKS/go-live.md) · `app/scripts/go-live-check.mts` · [SECURITY.md](../../../docs/SECURITY.md) ·
  skill `vesta-verify` / `vesta-dod-check` · [supabase-readonly-mcp.md](../../../docs/RUNBOOKS/supabase-readonly-mcp.md).
