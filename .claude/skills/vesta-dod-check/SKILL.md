---
name: vesta-dod-check
description: Verifica che una feature di Vesta Hospitality soddisfi la Definition of Done del progetto (PROJECT_RULES §1). Controlla i punti SPECIFICI di Vesta — codice in main, migrazione realmente applicata e verificata con to_regclass, E2E reale, Context Layer aggiornato, doc SSOT allineata, vincoli del pilota. Non duplica le skill di review (code-review/security-review/simplify): non cerca bug né stile, verifica i criteri di chiusura di Vesta. Usala prima di dichiarare una feature "completata" o prima di un merge in main.
---

# vesta-dod-check — verifica la Definition of Done di Vesta

Questa skill controlla che una feature rispetti la **Definition of Done** di Vesta Hospitality
(PROJECT_RULES §1, ADR-0003), che è più ampia del "il codice funziona". **Non è una code review**:
per bug, sicurezza e pulizia usa le skill built-in (`/code-review`, `/security-review`, `/simplify`).
Qui si verificano solo i **criteri di chiusura specifici di Vesta**.

## Principio
Una feature è **completata** solo se TUTTI i punti sotto sono ✅ *verificati* (con prova oggettiva:
output di comando, query, log). Se anche uno solo è ◐/○/❌ → la feature è **"implementata, non
completata"**. Non spacciare "sembra funzionare" per verificato (PROJECT_RULES §2, §4).

## Checklist (esegui in ordine, raccogli la prova per ognuno)

1. **Codice in `main`**
   - `git branch --show-current` e verifica che il lavoro sia (o vada) integrato in `main` — la prod
     si distribuisce solo da `main`. Se sei su feature branch, indica cosa manca al merge.

2. **Migrazione realmente applicata e verificata**
   - Identifica le migrazioni introdotte (`supabase/migrations/`).
   - Verifica che NON siano solo scritte ma **applicate al DB reale** e confermate con
     `to_regclass` (mai assunte). Una migrazione per volta. Procedura: `docs/RUNBOOKS/apply-migration.md`.
   - L'apply DDL è manuale (solo titolare): se non puoi verificarlo dall'ambiente, segnalalo come
     **prerequisito bloccante** da confermare, non come ✅.

3. **Test E2E reale**
   - Esiste ed è stato eseguito con successo uno script E2E sul **percorso reale**
     (`app/scripts/*-e2e.mts`)? Riporta l'esito. Test offline da soli non bastano.

4. **Context Layer aggiornato** (PROJECT_RULES §1.4, §13)
   - `docs/context/CURRENT_STATE.md`, `NEXT_TASK.md` e `PROJECT_SYNC_REPORT.md` riflettono il nuovo
     stato e il git reale? Se sono disallineati, la DoD **non** è soddisfatta → suggerisci
     l'agente `context-keeper`.

5. **Documentation as Code** (PROJECT_RULES §7)
   - Se la feature cambia comportamento di architettura/DB/AI/workflow/sicurezza, la doc SSOT
     competente è aggiornata? L'ADR collegata è coerente (o ne esiste una nuova che la sostituisce)?

6. **Vincoli del pilota** (PROJECT_RULES §5, §11, §12)
   - Nessuna azione Tier-2 / che modifichi lo stato operativo senza approvazione (ADR-0011).
   - autosend OFF di default e kill-switch disponibili dove pertinente.
   - Nessun segreto introdotto in chat o nel repo.

## Output
Una tabella con: punto · esito (✅/◐/○/❌) · prova/comando · cosa manca.
Concludi con un verdetto netto: **DoD soddisfatta** oppure **"implementata, non completata"** con
l'elenco preciso dei punti mancanti. Non dichiarare soddisfatto un punto che non hai potuto
verificare con prova oggettiva.
