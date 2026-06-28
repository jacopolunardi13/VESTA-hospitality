# ENVIRONMENT

Fonte ufficiale per le **variabili d'ambiente** e la loro gestione per-ambiente (locale, Preview,
Produzione). Nessun valore segreto è riportato qui (PROJECT_RULES §11): solo **nomi, scopo e dove
vivono**.

> **Legenda** (PROJECT_RULES §2): ✅ verificata · ◐ dedotta · ○ ipotizzata.

---

## Parte 1 — Stato attuale (Current State)

### Dove vivono le variabili
- ✅ **Locale**: `app/.env.local` — **non tracciato** da git (`.gitignore`: `.env*` con eccezione
  `!.env.example`). Verificato 28/06/2026.
- ✅ **Preview / Produzione**: variabili impostate su **Vercel** (Project Settings → Environment Variables).
- ✅ **Template**: `app/.env.example` — **tracciato**, contiene solo i nomi (no valori). È il riferimento
  di quali variabili servono.

### Inventario variabili (✅ da `grep process.env` nel codice)
| Variabile | Scopo | Tipo |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL progetto Supabase | pubblica (client) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chiave anon (soggetta a RLS) | pubblica (client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Accesso server (bypassa RLS) | **segreto** |
| `ANTHROPIC_API_KEY` | API LLM | **segreto** |
| `CRON_SECRET` | Protegge `/api/cron/*` e `/api/email/poll` (Bearer) | **segreto** |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` | OAuth Gmail | **segreto** |
| `GMAIL_REFRESH_TOKEN` | Token rinnovo Gmail (no password) | **segreto** |
| `GMAIL_ADDRESS` | Casella Gmail collegata | config |
| `GMAIL_PROPERTY_ID` | Property a cui mappare le email | config |
| `EMAIL_AUTOSEND` | Override d'emergenza: `off` forza kill-switch | config (opzionale) |
| `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_APP_SECRET` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_VERIFY_TOKEN` / `WHATSAPP_PROPERTY_ID` | Canale WhatsApp | **inerte** (non configurate) |

### Differenze per-ambiente (solo ciò che cambia)
| Variabile | Locale | Produzione (Vercel) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / chiavi Supabase | ✅ stesso progetto `zhqxxjasriaiwdbagwwj` | ✅ stesso progetto |
| `GMAIL_ADDRESS` + credenziali Gmail | ✅ **dev** `info.lunart.firenze@gmail.com` | ✅ **prod** `lunartfirenze@gmail.com` |
| `CRON_SECRET` | ✅ valore **dev** (≠ prod) | ✅ valore **prod** |
| `ANTHROPIC_API_KEY` | ◐ presumibilmente condivisa | ◐ |
| `GMAIL_PROPERTY_ID` | ✅ stessa property pilota | ✅ |

- ✅ Che `CRON_SECRET` locale ≠ produzione è **verificato**: il secret locale ha restituito `401`
  sull'endpoint di produzione; il secret di produzione ha funzionato (27/06/2026).
- ✅ `app/.env.example` elenca: Supabase (3), Anthropic (1), `CRON_SECRET`, Gmail (5). **Non** elenca
  `EMAIL_AUTOSEND` (override opzionale) né le `WHATSAPP_*` (canale inerte).

### Preview
- ◐ Perché il poll/diag funzionino su un **Preview Deploy**, le variabili devono essere attive anche per
  l'ambiente **Preview** su Vercel (non solo Production). I preview sono protetti (vedi
  [INFRASTRUCTURE.md](INFRASTRUCTURE.md) → Deployment Protection); per l'automazione si usa
  `x-vercel-protection-bypass` (segreto in `.env.local`, mai in chat).

---

## Parte 2 — Filosofia e linee guida (Guiding Principles)

- **Segreti fuori dal repo e dalla chat.** Vivono solo in `.env.local` (gitignored) e nelle env di
  Vercel. `.env.example` contiene solo i nomi. (PROJECT_RULES §11.)
- **Pubblico vs server.** Solo `NEXT_PUBLIC_*` finisce nel bundle client; chiavi/segreti sono
  esclusivamente server-side. La service-role non deve mai raggiungere il browser.
- **Isolamento per-ambiente delle integrazioni con effetti collaterali.** Il dev usa una **casella Gmail
  diversa** (`info.lunart.firenze`) proprio per non toccare ospiti reali durante lo sviluppo. Stesso
  principio per qualsiasi integrazione che invii/scriva verso l'esterno.
- **`CRON_SECRET` distinto per ambiente**, così un secret di dev non può innescare azioni in produzione.
- **Minimo privilegio.** Nessuna variabile/credenziale nuova se non strettamente necessaria
  (PROJECT_RULES §11).
- **`.env.example` sempre allineato** (Documentation as Code, PROJECT_RULES §7): una nuova variabile nel
  codice si aggiunge contestualmente al template.
- **Canali env-gated.** L'assenza delle `WHATSAPP_*` mantiene il canale **inerte by design**: il codice
  esiste ma non si attiva finché le variabili non sono presenti. Niente feature attive "per sbaglio".
- **Compromesso accettato:** un **unico progetto Supabase** per tutti gli ambienti (semplicità del
  pilota) → in dev si scrive sullo stesso DB di produzione. Mitigazione: casella Gmail dev separata e
  cron sospeso durante i lavori. Da rivalutare se nascono più strutture/ambienti.

---

## Future Evolution
*Coerenti coi principi; non roadmap.*
- Rotazione dei segreti esposti prima del go-live ([RUNBOOKS/rotate-secrets.md](RUNBOOKS/rotate-secrets.md)).
- Secret management via Supabase Vault per i job pg_cron.
- Eventuale separazione del progetto Supabase per ambiente (oggi unico).

## Related Documents
- [../PROJECT_RULES.md](../PROJECT_RULES.md) — §11 Sicurezza/minimo privilegio, §7 Documentation as Code
- [INFRASTRUCTURE.md](INFRASTRUCTURE.md) — servizi a cui le variabili si collegano, Deployment Protection
- [DATABASE.md](DATABASE.md) — uso di Supabase (service-role vs anon)
- [SECURITY.md](SECURITY.md) — segreti da ruotare prima del go-live
- [DEPLOYMENT.md](DEPLOYMENT.md) — env per Preview/Produzione
