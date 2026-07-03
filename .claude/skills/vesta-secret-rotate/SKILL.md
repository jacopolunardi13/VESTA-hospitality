---
name: vesta-secret-rotate
description: Operazionalizza la rotazione dei segreti di Vesta in modo sicuro — separa nettamente ciò che fa il Lead Engineer (verifica read-only, script, doc) da ciò che è 🔴 RED del Product Owner (creare/ruotare segreti nelle console), applica la regola "revoca il vecchio SOLO dopo aver verificato il nuovo" e non stampa MAI un valore segreto. Usala per ruotare service_role, Anthropic, Gmail (client secret + refresh token), Vercel bypass, CRON_SECRET, o qualsiasi credenziale esposta.
---

# vesta-secret-rotate — rotazione segreti sicura

Fonte operativa: [rotate-secrets-checklist.md](../../../docs/RUNBOOKS/rotate-secrets-checklist.md) +
script `app/scripts/verify-rotation.mts`. La rotazione **crea/ruota segreti nelle console** → è **🔴 RED**:
la esegue il Product Owner. Il Lead Engineer prepara, guida e **verifica**.

## Regole ferree
1. **Nessun valore segreto** in chat/log/repo. Mai. (L'hook `guard-secrets` blocca la stampa dei `.env*`.)
2. **Revoca il vecchio SOLO dopo** che lo script conferma il nuovo **verde**. Mai prima.
3. **Un segreto alla volta.**

## Modelli di revoca (determina l'ordine)
- **ADDITIVO** (il vecchio resta valido finché non lo revochi): Anthropic, Gmail refresh token, secret key
  Supabase "nuove". → verifica → **poi** revoca. Zero downtime.
- **ATOMICO** (sostituzione = revoca; il vecchio muore subito): `CRON_SECRET`, service-role via JWT-secret
  legacy. → finestra a basso traffico, cron sospesi, rollback pronto.

## Ordine consigliato
Gruppo A additivi (Anthropic → Gmail → Vercel bypass) → Gruppo B atomici (CRON_SECRET → service-role, per
ultimo, blast radius massimo).

## Divisione dei ruoli
- **PO (RED):** genera nuovo valore in console → aggiorna Vercel (Prod+Preview) + `.env.local` → per
  `CRON_SECRET` ri-schedula **ogni** job pg_cron che porta il `Bearer` → **redeploy** → (solo dopo verde) revoca.
- **Lead Engineer (GREEN):** completa/mantiene la checklist, esegue `verify-rotation.mts` (esiti OK/errore,
  **niente valori**), verifica i cron via `net._http_response`/SQL, aggiorna la doc.

## Verifica (dopo ogni rotazione, prima della revoca)
`node --env-file=.env.local --import tsx scripts/verify-rotation.mts` (+ `E2E_BASE` per il check contro un
deploy reale). Interpretazione per segreto:
- service-role → query riuscita; Anthropic → ping valido; Gmail → scambio refresh→access OK (casella attesa);
  `CRON_SECRET` → `diag` 200 col nuovo, 401 con l'errato.
Un segreto è verde **solo** se il suo check specifico passa. Gli altri rossi non lo bloccano se non pertinenti.

## Cron & Gmail — note apprese
- `CRON_SECRET` è portato da più job `pg_cron` (email-poll, ical): ri-schedularli **tutti**.
- App OAuth Google in "testing" → refresh token a **scadenza 7 giorni**: rigenerare un token duraturo
  richiede prima di portare l'app **In production** (RED). Vedi ROADMAP Post-Pilot.

## DoD
Tutti i segreti in scope ruotati + vecchi **revocati/invalidati** (verificato) + allineati `.env.local`⇄Vercel⇄cron
+ test verdi + nessuna regressione + SECURITY/ENVIRONMENT/Context Layer aggiornati + nessun valore in chat.

## Related
- [rotate-secrets-checklist.md](../../../docs/RUNBOOKS/rotate-secrets-checklist.md) · [rotate-secrets.md](../../../docs/RUNBOOKS/rotate-secrets.md) ·
  [suspend-resume-cron.md](../../../docs/RUNBOOKS/suspend-resume-cron.md) · [SECURITY.md](../../../docs/SECURITY.md) · [ENVIRONMENT.md](../../../docs/ENVIRONMENT.md).
