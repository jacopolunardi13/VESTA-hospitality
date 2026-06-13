# Security Backlog

Issues non bloccanti da correggere prima del go-live. Non riaprire senza contesto.

---

## LOW PRIORITY

### SB-01 — Open redirect via `?next=` in auth callback

**File:** `app/src/app/api/auth/callback/route.ts` riga 9, 54
**Introdotto in:** C04 (commit `6dc048e`)
**Audit:** C04 — finding B1 (reclassificato da BLOCCANTE a NON BLOCCANTE)

**Descrizione:**
Il parametro `next` non è validato prima di essere concatenato all'`origin`:

```typescript
const next = searchParams.get('next') ?? '/inbox'
// ...
return NextResponse.redirect(`${origin}${next}`)
```

`?next=@evil.com` produce `https://yourapp.com@evil.com` — URL valido dove
il browser interpreta `evil.com` come host di destinazione.

**Precondizione exploit:** l'attaccante necessita di un codice Supabase
one-time valido per la vittima (magic link / email confirmation / reset),
generabile solo da Supabase stesso e con scadenza in minuti. Nessun vettore
autonomo identificato.

**Fix suggerito:**
```typescript
const rawNext = searchParams.get('next') ?? '/inbox'
const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/inbox'
```

**Quando correggere:** prima del go-live / deploy in produzione con utenti reali.
