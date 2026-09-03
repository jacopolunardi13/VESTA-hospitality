# SECURITY

Fonte ufficiale per: isolamento multi-tenant, controllo delle azioni (Tier 1/Tier 2), kill-switch,
guardrail anti-abuso, protezione dei deploy, gestione dei segreti, **segreti da ruotare prima del
go-live** e il **Go-Live Security Assessment** (gate P0, [DECISIONS.md](DECISIONS.md) ADR-0019).

> **Legenda** (PROJECT_RULES §2): ✅ verificata · ◐ dedotta · ○ ipotizzata.

---

## Parte 1 — Current State

### Isolamento multi-tenant (RLS)
- ✅ Ogni tabella applicativa ha `org_id` + policy `using (public.user_in_org(org_id))` (vedi
  [DATABASE.md](DATABASE.md)). L'AI/le query di una struttura non vedono i dati di un'altra.
- ✅ Il **service-role** (server) bypassa RLS; l'**anon** (browser/azioni) è soggetto a RLS.
- ✅ **Verificato live (30/06/2026):** con la sola chiave anon (non autenticato) la lettura di tutte le tabelle core in produzione restituisce **0 righe** → RLS realmente attivo. **⚠️ Eccezione (mitigata da P0-2):** le RPC `SECURITY DEFINER` **bypassano** l'RLS, ma dopo la migrazione `0015` non sono più invocabili da `anon`/`authenticated` senza controllo (`enroll`/`transition` hanno guard `auth.uid()`; `process_*` solo `service_role`) — vedi Go-Live Security Assessment (P0-2 chiuso) + Evidence of verification.

### Controllo delle azioni — Human-in-the-Loop
- ✅ **Tier 1** (automatico): concierge/FAQ/preventivo informativo.
- ✅ **Tier 2** (approvazione staff): invio proposta, conferma, IBAN, blocco camera. Coda
  `pending_actions` + `deliverToGuest` solo su azione staff. **Vesta non blocca camere, non invia IBAN,
  non conferma da sola.** Dettaglio → [ARCHITECTURE.md](ARCHITECTURE.md); decisione → [DECISIONS.md](DECISIONS.md) ADR-0011.
- 🔒 **Vincolo permanente — nessuna azione operativa senza PMS** (fino a integrazione ufficiale PMS/
  Channel Manager): Vesta **non** esegue autonomamente azioni che modifichino lo stato operativo —
  bloccare/liberare camere, modificare disponibilità o tariffe, confermare prenotazioni o pagamenti,
  aggiornare QuoVai/altri PMS, o qualsiasi azione irreversibile/economicamente vincolante. Blocco
  camera, conferma e liberazione restano **manuali dello staff**. Elenco completo + flusso a 10 passi:
  [DECISIONS.md](DECISIONS.md) ADR-0011.

### Kill-switch canale email
- ✅ `properties.settings.email_autosend_enabled` (default **OFF**) — Vesta ingerisce/classifica ma non
  invia finché non è ON. Override d'emergenza env `EMAIL_AUTOSEND=off` (`src/lib/email/flags.ts`).
- ✅ Tier 2 **bypassa** il kill-switch (azione umana esplicita).

### Guardrail anti-abuso (web)
- ✅ `src/app/api/chat/route.ts` + `src/lib/ai/guardrail.ts`: **IP blocklist** (`ip_blocklist`),
  **rate limit**, **cap sessione** (`ai_session_message_limit`, default 30/giorno). Eventi loggati in
  `guardrail_events`.
- ✅ **Budget AI** giornaliero (`ai_daily_budget_cents`, default 500 = €5) → safe-mode (zero AI) a soglia.

### Rete di sicurezza email (Router L0)
- ✅ `hasAutomatedMarkers` (`src/lib/email/routing.ts`): un'email con marker automatici
  (`List-Unsubscribe`/`Auto-Submitted`/`Precedence`) non genera mai lead/risposta, anche se classificata
  `guest`. Dubbio → trattata come `guest` e lasciata non letta.

### Protezione dei deploy
- ✅ Vercel Authentication "Require Log In" (Standard Protection): i Preview sono protetti; automazione
  via `x-vercel-protection-bypass`. Dettaglio → [INFRASTRUCTURE.md](INFRASTRUCTURE.md).

### Gestione dei segreti
- ✅ Segreti solo in `app/.env.local` (gitignored) e nelle env Vercel; **mai** nel repo né in chat.
  Inventario → [ENVIRONMENT.md](ENVIRONMENT.md).
- ✅ La KB pubblica non contiene segreti (IBAN/codici): l'IBAN vive in `properties.settings` e arriva
  solo via Tier 2 (PKS §8 → [KNOWLEDGE.md](KNOWLEDGE.md)).

### Issue storiche
- ✅ **SB-01** open-redirect via `?next=` in auth callback — **risolto** (commit `84ca3e7`).

### ⚠️ Segreti da ruotare PRIMA del go-live pubblico
- ✅ `SUPABASE_SERVICE_ROLE_KEY` e `ANTHROPIC_API_KEY` — esposti in chat in sessioni precedenti.
- ✅ `GMAIL_CLIENT_SECRET` + `GMAIL_REFRESH_TOKEN` (accesso lettura/invio alla casella del pilot) e
  `VERCEL_AUTOMATION_BYPASS_SECRET` (bypass della Deployment Protection) — presenti in `app/.env.local`.
- ✅ `CRON_SECRET` — ancora **placeholder** in locale → impostare un valore forte definitivo e allinearlo
  tra Vercel e il job `pg_cron` (0009).
- ◐ Pubblicare l'app OAuth Google (evitare scadenza refresh token a 7 giorni in stato "testing").

---

## Go-Live Security Assessment (30/06/2026)

> **Assessment completo dell'intera superficie** (architettura, RLS, API, AI pipeline, upload, Gmail,
> segreti, frontend/backend, logging, multi-tenant), con verifica reale del codice + prova live dell'RLS.
> Decisione e gate: [DECISIONS.md](DECISIONS.md) **ADR-0019**. Questa tabella è lo **stato vivo dei
> controlli** (aggiornarla man mano che i P0/P1 si chiudono).

**Verdetto: 🟠 NO-GO per esposizione pubblica non ristretta finché i P0 non sono chiusi.** Il pilot email
LunArt controllato (single-tenant, autosend OFF) prosegue.

### P0 — bloccanti prima del go-live pubblico
| ID | Vulnerabilità | Dove | Stato |
|---|---|---|---|
| **P0-1** | Segreti di produzione esposti (service_role, Anthropic, Gmail, Vercel bypass) + `CRON_SECRET` placeholder → **ruotare tutti** | `app/.env.local` | 🔴 aperto |
| **P0-2** | RPC `SECURITY DEFINER` che si fidano di parametri del chiamante / concesse a `authenticated` → cross-tenant write e **possibile takeover di tenant** (aggravato da signup aperto) | `enroll_user_in_org` (0002), `transition_booking_request` (0008), `process_*_deadlines` (0014) | ✅ **chiuso** (0015 · 02/07/2026 · signup chiuso) |
| **P0-3** | Chat pubblica: `X-Forwarded-For` spoofabile → bypass rate-limit/IP-block; nessun cap globale conversazioni → DoS/cost-abuse | `lib/ai/guardrail.ts:15`, `api/chat/route.ts` | 🔴 aperto |
| **P0-4** | Nessun security header (CSP/X-Frame-Options/HSTS) né `middleware.ts` → clickjacking sul widget pubblico | `next.config.ts` | 🔴 aperto |
| **P0-5** | Dirottamento destinatario email: `guest_contact` estratto dall'LLM sovrascrive il destinatario di consegna → IBAN/PDF a indirizzo iniettato (bypassa il kill-switch via Tier-2) | `orchestrate.ts:249`, `deliverToGuest.ts:38` | 🔴 aperto |

### Evidence of verification — P0-2 (chiuso, 02/07/2026)
Traccia permanente delle prove reali che hanno chiuso P0-2 (migrazione `0015_p0_2_rpc_hardening.sql`).
Tooling: `app/scripts/probe-rpc-authz.mts`, `app/scripts/p0-2-authz-tests.sql`, `app/scripts/p0-2-guest-e2e.mts`.

- ✅ **Migrazione `0015` applicata** nel SQL Editor (existence-guarded, idempotente). Mitigazione interim: **self-signup disabilitato** in Supabase Auth.
- ✅ **`to_regprocedure`**: `enroll_user_in_org`, `transition_booking_request`, `process_payment_expiry`, `process_operational_deadlines` presenti dopo l'apply.
- ✅ **ACL (`proacl`)**: `anon` **assente** su tutte; `process_*` solo `service_role`; `enroll`/`transition` = `authenticated`+`service_role`.
- ✅ **Probe anon**: `enroll_user_in_org` e `transition_booking_request` → `42501 permission denied` (prima: eseguivano).
- ✅ **Test authenticated**: self-enroll su propria org → OK; enroll self su org popolata (**takeover**) → `42501 already has members`; `transition` su org altrui (**cross-tenant**) → `42501 not a member`.
- ✅ **Test service_role**: `transition` → `not_found` (guard saltato, pipeline backend intatta).
- ✅ **Test staff reale**: `transition` authenticated-**membro** sulla propria org → `not_found` (guard superato), zero mutazioni sui dati reali.
- ✅ **Test guest E2E** (pipeline `service_role`, stessa `processConversationTurn` della chat): risposta AI corretta, **nessun errore di autorizzazione**, conversazione di test rimossa con cleanup verificato (conversation/messages/ai_calls = 0; booking_requests/notifications create = 0).

**Rinviato:** test comportamentale della whitelist ruoli `enroll` (già applicata via guard funzione + `CHECK` DB) → hardening finale.
**Issue separata (fuori scope P0-2):** `process_due_followups()` assente nel DB reale (0006 non applicata) → il cron `vesta-followups` falliva — **KI-11, risolto il 12/07** dalla migrazione `0016` (command existence-guarded, run `succeeded`); vedi [KNOWN_ISSUES](context/KNOWN_ISSUES.md).

### Evidence of verification — 0017 least-privilege (applicata in produzione, 28/08/2026)
Traccia permanente dell'applicazione della migrazione `0017_security_least_privilege.sql` (baseline least-privilege post-0015/0016, esito del **Production DB Reality Gate** — verdetto B, Codex CONCUR).

- ✅ **Design Codex-ACCEPTED** (adversarial, 6 iterazioni): revoca `CREATE` su `public` da `PUBLIC`/`anon`/`authenticated`; EXECUTE allowlist esplicita sulle 7 funzioni app (incl. chiusura del P0 `user_in_org` EXECUTE-to-PUBLIC); revoca `TRUNCATE`/`TRIGGER`/`REFERENCES`; sequences minimizzate; **default ACL default-deny** (grantor `postgres`) per routine/tabelle/sequences future; fix policy `ip_blocklist` (NULL-escape); `NOTIFY pgrst`. Rollback pack = generatori esatti da `audit.acl_snapshot_0017_*`.
- ✅ **Applicata in produzione il 28/08/2026** via WorkspaceOS `provider-mutate` (approvazione **Phone RED** di Jacopo dalla Operator PWA, 23:43 UTC; auto-resume dell'executor; **una sola transazione atomica**: preflight → snapshot → 0017 → post-apply asserts in-transaction → receipt → COMMIT). Receipt durable `ok:true`; riga `audit.migration_receipt` parte della stessa transazione committata.
- ✅ **Artefatto identico al repo**: il payload eseguito embeddava lo 0017 **byte-identico** al file su questo branch (sha256 `7e29628356defca234c7efcad77e5b87b1043052ada4724c6689a23bdc4b2652`, self-check pre-esecuzione).
- ✅ **Credenziale write a ciclo chiuso**: token OAuth `database:write` ottenuto solo per la mutazione (bounded-refresh model, broker Codex-ACCEPTED), retention totale ~22 min, teardown verificato (revoke refresh HTTP 204 + access 401-REVOKED + refs Keychain eliminati). Nessuna credenziale write residua.
- ⏳ **Verifica esterna pendente**: run di **`app/scripts/0017-readonly-verification.sql`** (SOLO SELECT, sha256 `a754f6f42fafa222a579c5318d54a7c63fee3f539de7c81204528ff8809c4169`) via capability read-only — conferma indipendente del post-state. (Il pack completo `0017-least-privilege-verification.sql` include preflight/snapshot MUTANTI ed è riservato al momento dell'apply — non eseguibile read-only.)
- **Fuori scope documentato**: default ACL con grantor `supabase_admin` + 118 funzioni pgvector `supabase_admin`-owned (non alterabili come `postgres`; residuo bounded ai soli oggetti futuri `supabase_admin`-owned).

### P1 — da correggere a breve
- Nessun cap di lunghezza sul corpo email pre-LLM (`ingest.ts`) → cost-abuse.
- Messaggi d'errore grezzi nelle risposte API (poll/diag/ical/preview) → info disclosure (dietro auth).
- Macchina a stati pilotabile dall'ospite ("303"/"ho pagato") crea `pending_action` pre-caricate (`orchestrate.ts:75-143`).
- Prompt injection su KB/cronologia non delimitata (danno contenuto: IBAN/prezzi fuori contesto).
- Upload PDF senza check magic-byte `%PDF-` + manca `nosniff` sulla route file.
- Nessun `middleware.ts` di backstop auth (oggi ogni pagina autentica).
- **Osservabilità di sicurezza assente** (nessun audit-log strutturato oltre `guardrail_events`).

### P2 — miglioramenti successivi
- SSRF via URL feed iCal (`ical/sync.ts`) — non sfruttabile oggi (nessuna UI lo scrive), Medium al self-service feed.
- Confronto `CRON_SECRET` non timing-safe. `/api/email/diag` rivela la casella. IBAN hardcoded in script di test. `postcss` build-time moderate (non forzare il fix).

### Già solido (verificato, non regredire)
RLS live-verificato · l'AI non ha tool con effetti e non riceve segreti/prezzi nel contesto · kill-switch
robusto (bypass Tier-2 solo staff autenticato) · zero `dangerouslySetInnerHTML` + email template escapato ·
webhook WhatsApp HMAC timing-safe · storage privato con authz RLS · logging senza segreti · `npm audit` 0 High/Critical.

---

## Parte 2 — Guiding Principles

- **Difesa in profondità.** Più livelli indipendenti: RLS (dati) + Router L0 + `hasAutomatedMarkers`
  (email) + kill-switch + guardrail (web) + Deployment Protection (piattaforma). La caduta di uno non
  apre il sistema.
- **Human-in-the-Loop per l'irreversibile.** Tutto ciò che impegna denaro/camere/promesse verso
  l'ospite passa dallo staff. La sicurezza nasce dal *non poter* fare danni in automatico.
- **Sicuro di default.** Autosend OFF, budget AI limitato, canali env-gated: lo stato di riposo è quello
  prudente.
- **Minimo privilegio.** Nessun nuovo accesso/credenziale se non strettamente necessario (PROJECT_RULES §11).
- **Segreti fuori da codice e conversazioni.** E rotazione obbligatoria di ciò che è stato esposto.
- **Fail-fast anche per la sicurezza.** Un errore DB non ingoiato evita stati incoerenti silenziosi
  (es. dedup inerte → spam-storm se autosend fosse ON).

---

## Future Evolution
*Coerenti coi principi; non roadmap.*
- Ruoli RLS più fini (`staff` solo correzioni vs `manager/owner`) — oggi tutti i membri org possono editare.
- Verifica contatto ospite (OTP email/WhatsApp) prima di creare il lead da web chat.
- Secret management via Supabase Vault per i job pg_cron (evitare il secret in chiaro nella migrazione).
- Audit log di sicurezza consolidato (oggi: `guardrail_events` + `email_routing_log` separati).

---

## Related Documents
- [../PROJECT_RULES.md](../PROJECT_RULES.md) — §5 Human-in-the-Loop, §11 Sicurezza, §12 Pilota sicuro
- [ARCHITECTURE.md](ARCHITECTURE.md) — Tier 1/Tier 2, guardrail, Router L0
- [INFRASTRUCTURE.md](INFRASTRUCTURE.md) — Deployment Protection, bypass automazione
- [ENVIRONMENT.md](ENVIRONMENT.md) — inventario segreti
- [DATABASE.md](DATABASE.md) — RLS, `user_in_org`
- [DECISIONS.md](DECISIONS.md) — ADR-0011 (Human-in-the-Loop), ADR-0004 (Fail-Fast)
- [RUNBOOKS/rotate-secrets.md](RUNBOOKS/rotate-secrets.md)
