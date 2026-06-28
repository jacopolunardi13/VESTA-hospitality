# SECURITY

Fonte ufficiale per: isolamento multi-tenant, controllo delle azioni (Tier 1/Tier 2), kill-switch,
guardrail anti-abuso, protezione dei deploy, gestione dei segreti e **segreti da ruotare prima del
go-live**.

> **Legenda** (PROJECT_RULES §2): ✅ verificata · ◐ dedotta · ○ ipotizzata.

---

## Parte 1 — Current State

### Isolamento multi-tenant (RLS)
- ✅ Ogni tabella applicativa ha `org_id` + policy `using (public.user_in_org(org_id))` (vedi
  [DATABASE.md](DATABASE.md)). L'AI/le query di una struttura non vedono i dati di un'altra.
- ✅ Il **service-role** (server) bypassa RLS; l'**anon** (browser/azioni) è soggetto a RLS.

### Controllo delle azioni — Human-in-the-Loop
- ✅ **Tier 1** (automatico): concierge/FAQ/preventivo informativo.
- ✅ **Tier 2** (approvazione staff): invio proposta, conferma, IBAN, blocco camera. Coda
  `pending_actions` + `deliverToGuest` solo su azione staff. **Vesta non blocca camere, non invia IBAN,
  non conferma da sola.** Dettaglio → [ARCHITECTURE.md](ARCHITECTURE.md); decisione → [DECISIONS.md](DECISIONS.md) ADR-0011.

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
- ✅ `CRON_SECRET` — usato in comandi durante il debug (comparso nei log di sessione) → impostare un
  valore definitivo e allinearlo tra Vercel e il job `pg_cron` (0009).
- ◐ Pubblicare l'app OAuth Google (evitare scadenza refresh token a 7 giorni in stato "testing").

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
