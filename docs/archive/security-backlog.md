# Security & UX Backlog

Issues non bloccanti. Non riaprire senza contesto.

---

## RESOLVED

### SB-01 — Open redirect via `?next=` in auth callback

**File:** `app/src/app/api/auth/callback/route.ts`
**Introdotto in:** C04 (commit `6dc048e`) — **Risolto in:** C07 (commit `84ca3e7`)
**Audit:** C04 — finding B1 (reclassificato da BLOCCANTE a NON BLOCCANTE)

**Descrizione:**
Il parametro `next` non era validato prima di essere concatenato all'`origin`.
`?next=@evil.com` → `https://yourapp.com@evil.com` (redirect aperto).

**Fix applicato in C07:**
```typescript
const rawNext = searchParams.get('next') ?? '/inbox'
const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/inbox'
```

---

## POST-MVP / UX

### UX-03 — signOut() dopo updateUser() nel reset password

**File:** `app/src/app/reset-password/actions.ts`
**Classificato in:** C07 audit finale (13/06/2026) — decisione: scelta UX, non bug

**Descrizione:**
`updateUser({ password })` non revoca la sessione corrente. Dopo il cambio
password l'utente viene reindirizzato a `/login?reset=1`, ma il proxy
(che vede la sessione ancora valida) lo porta direttamente a `/inbox`.
Il banner "Password aggiornata" su `/login` non viene mai mostrato.

Il PKCE code nell'email è già monouso (invalidato da `exchangeCodeForSession`):
nessuna implicazione di sicurezza.

**Opzione da valutare post-MVP:**
Aggiungere `await supabase.auth.signOut()` prima del redirect in
`reset-password/actions.ts` per forzare il re-login con le nuove credenziali
e mostrare il banner di conferma.

**Quando:** post-MVP, se il feedback utenti segnala confusione sul flusso.
