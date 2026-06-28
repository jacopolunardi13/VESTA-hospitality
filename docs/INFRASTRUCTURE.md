# INFRASTRUCTURE

Fonte ufficiale per **tutta l'infrastruttura esterna al codice**: Supabase, Vercel, Gmail, Anthropic,
cron, storage, ambienti, protezione dei deploy, servizi esterni e dipendenze. Obiettivo: capire l'intera
infrastruttura leggendo **un solo documento**.

Rimandi (Single Source of Truth): schema/migrazioni → [DATABASE.md](DATABASE.md) · variabili
d'ambiente in dettaglio per-ambiente → [ENVIRONMENT.md](ENVIRONMENT.md) · procedure di deploy →
[DEPLOYMENT.md](DEPLOYMENT.md) · modelli/uso AI → [AI.md](AI.md) · segreti e rotazione →
[SECURITY.md](SECURITY.md).

> **Legenda** (PROJECT_RULES §2): ✅ verificata · ◐ dedotta · ○ ipotizzata.

## Panoramica
```
GitHub (jacopolunardi13/VESTA-hospitality)
        │  push
        ▼
Vercel (progetto "vesta-hospitality") ── Next.js app
   │              │                 │
   │ REST/SQL     │ HTTPS           │ HTTPS
   ▼              ▼                 ▼
Supabase      Anthropic API     Gmail API
(Postgres,    (Haiku/Sonnet)    (lunartfirenze / info.lunart.firenze)
 PostgREST,
 Storage,
 pg_cron) ── pg_net ──► chiama gli endpoint /api/* dell'app (cron)
```
- ✅ Componenti esterni: **GitHub** (repo), **Vercel** (hosting+build), **Supabase** (DB/REST/Storage/cron),
  **Anthropic** (LLM), **Google Gmail API** (canale email).
- ◐ Inerti/futuri: **WhatsApp Meta Cloud API** (dietro env, non configurato).

## Supabase
- ✅ **Progetto unico**: `zhqxxjasriaiwdbagwwj` (host `zhqxxjasriaiwdbagwwj.supabase.co`). Usato da
  **locale, Preview e Produzione** (non ci sono progetti separati per ambiente).
- ✅ Servizi usati: **Postgres**, **PostgREST** (API REST, schemi esposti: `public`, `graphql_public`),
  **Storage**, **pg_cron** + **pg_net** (scheduler interno).
- ✅ Due livelli di accesso: **service-role** (server, bypassa RLS) e **anon** (browser/azioni, soggetto a RLS).
- Schema, tabelle, RLS, RPC, migrazioni → [DATABASE.md](DATABASE.md).

## Vercel
- ✅ Progetto **`vesta-hospitality`**, produzione su `https://vesta-hospitality.vercel.app`.
- ✅ Collegato a GitHub `jacopolunardi13/VESTA-hospitality`.
- ◐ **Produzione = deploy automatico dal branch `main`**; ogni altro branch genera un **Preview Deploy**
  (preview verificato il 27/06: branch `document-center` → URL `vesta-hospitality-…-vercel.app`).
- ✅ Piano **Hobby** (da UI Vercel).
- Procedure (branching, merge, applicazione migrazioni in deploy) → [DEPLOYMENT.md](DEPLOYMENT.md).

## Deployment Protection
- ✅ **Vercel Authentication = "Require Log In", Standard Protection** (protegge tutti i deploy tranne i
  Custom Domains di produzione). Conseguenza: i **Preview sono protetti** → una richiesta non
  autenticata riceve `HTTP 302` verso il login Vercel (verificato 27/06).
- ✅ **Protection Bypass for Automation** disponibile: un segreto da passare come header
  `x-vercel-protection-bypass` per consentire richieste automatiche ai deploy protetti senza aprirli al
  pubblico. (Il segreto va in `.env.local`, mai in chat — PROJECT_RULES §11.)
- ✅ "Password Protection" e "All Deployments" richiedono piano Pro (non attivi).
- ◐ Nota di sicurezza: anche con i preview aperti, `/api/email/poll` resta protetto a livello app dal
  `CRON_SECRET` e la dashboard dal login Supabase.

## Cron Jobs
- ✅ Lo scheduler è **pg_cron dentro Supabase** (NON Vercel Cron: nel repo non esiste `vercel.json`).
  I job chiamano gli endpoint dell'app via `pg_net.http_post`, con header `Authorization: Bearer <CRON_SECRET>`.
- Job definiti via migrazione (origine → [DATABASE.md](DATABASE.md)):

| Job | Schedule | Endpoint chiamato | Stato |
|---|---|---|---|
| `vesta-followups` | `*/5 * * * *` | funzione `process_due_followups()` (interna) | ◐ presunto attivo |
| `vesta-ical-sync` | `*/15 * * * *` | `/api/cron/ical-sync` | ◐ presunto attivo |
| `vesta-email-poll` | `*/2 * * * *` | `/api/email/poll` | ⚠️ ✅ **SOSPESO** (`active=false`, 27/06/2026) |

- ✅ Verifica/gestione: `select jobname, schedule, active from cron.job;` · sospendere/riattivare →
  [RUNBOOKS/suspend-resume-cron.md](RUNBOOKS/suspend-resume-cron.md).

## Storage / Bucket
- ✅ Bucket **`documents`** (privato, creato 27/06/2026): PDF del Document Center.
- ✅ Pattern di accesso: autorizzazione via **sessione utente** (RLS sulla riga `document_center`),
  download dei **bytes** via **service-role** (il bucket è privato). Endpoint `/api/documents/file`.

## Gmail (canale email)
- ✅ **Due caselle distinte**:
  - **Produzione** = `lunartfirenze@gmail.com` (credenziali solo su **Vercel**).
  - **Dev/locale** = `info.lunart.firenze@gmail.com` (in `.env.local`).
  - ⚠️ Conseguenza operativa: l'inbox di produzione è raggiungibile **solo dal deploy** (non in locale).
- ✅ Auth: **OAuth refresh token** (no password), scope **`gmail.modify`** (lettura+invio+label).
- ✅ Uso: `/api/email/poll` legge la inbox (Router L0 + dedup); l'invio risposte usa la stessa API.
- ✅ **Kill-switch**: `properties.settings.email_autosend_enabled` (default OFF) + override env
  `EMAIL_AUTOSEND` → [SECURITY.md](SECURITY.md).

## Anthropic (LLM)
- ✅ Dipendenza: **Anthropic API** (`ANTHROPIC_API_KEY`).
- ✅ Modelli referenziati nel codice: `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-8`.
- Mapping modello → funzione (classify/extract/reply), prompt, costi → [AI.md](AI.md).

## Environment (variabili)
Inventario ✅ verificato (`process.env.*` nel codice). Dettaglio per-ambiente e `.env.example` →
[ENVIRONMENT.md](ENVIRONMENT.md).
- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Anthropic**: `ANTHROPIC_API_KEY`.
- **Cron/sicurezza**: `CRON_SECRET`.
- **Gmail**: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_ADDRESS`,
  `GMAIL_PROPERTY_ID`; override `EMAIL_AUTOSEND`.
- **WhatsApp** (inerte): `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PROPERTY_ID`.

## Servizi esterni, integrazioni e dipendenze
- ✅ **GitHub** — `jacopolunardi13/VESTA-hospitality` (sorgente + trigger build Vercel).
- ✅ **Google Gmail API** — canale email (vedi sopra).
- ✅ **Anthropic API** — LLM.
- ✅ **Supabase**, **Vercel** — vedi sezioni dedicate.
- ✅ **iCal feeds OTA** — calendari esterni sincronizzati via `/api/cron/ical-sync` (tabella `ical_feeds`).
- ◐ **OTA/PMS via email** (Booking, Expedia, QuoVai) — non integrazioni API: arrivano come **email** ed
  entrano nel Router L0 (`ota_inbox`/`reservations_staging`). Nessuna API OTA collegata.
- ◐ **WhatsApp Business (Meta Cloud API)** — codice presente ma **INERTE**: nessuna variabile
  `WHATSAPP_*` configurata, nessun numero collegato. Go-live futuro.

## Sicurezza infrastrutturale (rimando)
Segreti esposti da ruotare prima del go-live, policy azioni, kill-switch → [SECURITY.md](SECURITY.md).

> Tutto quanto sopra è la parte **Current State**. Segue la parte **Guiding Principles**.

---

## Guiding Principles
- **Un solo progetto Supabase per tutti gli ambienti** (compromesso di semplicità del pilota): meno
  infrastruttura da gestire, ma in dev si scrive sullo stesso DB di produzione → mitigato da casella
  Gmail dev separata e cron sospeso durante i lavori. Da rivalutare con più strutture/ambienti.
- **Scheduler nel DB (pg_cron), non nell'hosting.** Mantiene la logica temporale vicino ai dati e
  indipendente dalla piattaforma di hosting; gli endpoint chiamati restano protetti da `CRON_SECRET`.
  Compromesso: lo scheduler vive in Supabase, va verificato lì (`cron.job`), non nel repo.
- **Integrazioni con effetti collaterali isolate per ambiente** (Gmail dev vs prod): in dev non si
  rischia di contattare ospiti reali. Principio da estendere a ogni canale (WhatsApp incluso).
- **Canali env-gated**: un canale resta inerte finché le sue variabili non sono presenti (nessuna
  attivazione accidentale).
- **Protezione di default**: i Preview restano protetti; l'automazione passa per un bypass dedicato,
  non aprendo i deploy al pubblico (minimo privilegio).
- **Cosa deve restare stabile**: l'id del progetto Supabase, i nomi degli endpoint chiamati dai cron, lo
  split dev/prod delle caselle. Cambiarli richiede aggiornare cron, env e questa documentazione insieme.

## Future Evolution
*Coerenti coi principi; non roadmap.*
- Separazione degli ambienti DB (oggi progetto Supabase unico) se nascono più strutture/ambienti.
- CI (GitHub Actions) come gate pre-merge (tsc + build + test).
- Secret management via Supabase Vault per i job pg_cron.
- Attivazione canale WhatsApp (oggi inerte) con le `WHATSAPP_*`.

## Related Documents
- [../PROJECT_RULES.md](../PROJECT_RULES.md) — Deploy, Sicurezza/minimo privilegio, Pilota sicuro
- [ENVIRONMENT.md](ENVIRONMENT.md) — variabili per-ambiente (dettaglio)
- [DATABASE.md](DATABASE.md) — schema, RLS, origine dei job pg_cron
- [DEPLOYMENT.md](DEPLOYMENT.md) — procedure di deploy, Preview, branching
- [SECURITY.md](SECURITY.md) — segreti, rotazione, kill-switch
- [AI.md](AI.md) — modelli Anthropic e loro uso
- [RUNBOOKS/suspend-resume-cron.md](RUNBOOKS/suspend-resume-cron.md) — gestione cron
