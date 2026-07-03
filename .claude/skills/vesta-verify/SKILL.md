---
name: vesta-verify
description: Esegue la verifica locale di Vesta prima di dichiarare una modifica "fatta" — typecheck, build, probe di sicurezza e script E2E presenti — e produce un report verde/rosso con prove oggettive. Usala dopo ogni modifica (parte del ciclo Plan→Build→Test→Doc→DoD di ENGINEERING.md §4) e prima di un commit di chiusura. Non è una code-review (per bug/stile usa /code-review, /security-review, /simplify): qui si verifica che il repo sia sano e i controlli passino davvero.
---

# vesta-verify — verifica locale prima di "fatto"

Regola di Vesta: **ogni modifica è testata**, con **prova oggettiva** (output di comando/query), mai
"sembra funzionare" (ENGINEERING.md §4-5, PROJECT_RULES §2). Questa skill raccoglie i controlli
deterministici in un unico giro e ne riporta l'esito.

## Cosa eseguire (in ordine; raccogli l'output di ognuno)

1. **Typecheck** (sempre) — da `app/`:
   `npx tsc --noEmit` → **0 errori**. È il controllo minimo di ogni modifica TS.

2. **Build** (per modifiche che toccano il runtime Next) — da `app/`:
   `npx next build` (o lo script di progetto) → build **pulita**. Salta se la modifica è solo doc/script.

3. **Probe di sicurezza** (se presenti nel branch) — es. `app/scripts/probe-rpc-authz.mts`
   (`node --env-file=.env.local --import tsx scripts/probe-rpc-authz.mts`) → l'asserzione attesa è
   **verde** (es. `anon` negato sulle RPC pericolose dopo P0-2). Se lo script non è nel branch corrente
   (vive su un branch di sicurezza non ancora merge), **segnalalo**, non darlo per verde.

4. **Script E2E/verifica specifici** — quelli pertinenti alla modifica (es. `verify-rotation.mts`,
   `p0-2-authz-tests.sql`, `test-gmail-auth.mts`). Ognuno deve dare l'esito atteso.

5. **npm audit** (per modifiche a dipendenze) — `npm audit` → **0 High/Critical** (baseline nota).

## Come riportare
Tabella `controllo · comando · esito (✅/❌/➖ n.a.) · prova`. **Un solo ❌ = non "fatto"**: la modifica
è "implementata, non completata" finché non è verde.

## Regole
- **Nessun segreto** negli output (gli script di Vesta stampano solo esiti, non valori). Se un output
  rischia di contenere un segreto, **non incollarlo**.
- Non eseguire script che scrivono su **produzione** o che inviano email reali (autosend resta OFF).
- Gli script che scrivono dati di test devono avere **cleanup** verificato (es. il guest E2E).

## Related
- [ENGINEERING.md](../../../docs/foundations/ENGINEERING.md) §4-5 · skill `vesta-dod-check` (criteri di chiusura) ·
  Go-Live aggregato: skill `vesta-go-live` + `app/scripts/go-live-check.mts`.
