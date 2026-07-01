# PROJECT SYNC REPORT — Vesta Hospitality

> **Report vivo e compilato.** Copia/incolla questo file in una nuova chat (ChatGPT o Claude) per riallineare l'assistente in pochi minuti. Generato dai file di stato in `docs/context/`.
> **Aggiornato:** 2026-06-30 · branch `main` · HEAD `19df477`.

## 1. Identità progetto
**Vesta Hospitality** — SaaS multi-tenant: "dipendente virtuale" per piccole strutture ricettive (front office + back office). Repo GitHub `jacopolunardi13/VESTA-hospitality`. Pilota: **LunArt B&B** (Firenze), **Giorno Zero 30/06/2026**. **La fonte di verità è il repo, non le chat.**

## 2. Stack minimo
TypeScript · **Next.js 16** (App Router) / React 19 · **Supabase** (Postgres + Auth OAuth + Storage + RLS, pg_cron) · **Anthropic Claude** (Haiku + Sonnet) · pdfkit · Gmail API · hosting **Vercel** (prod = `main`).

## 3. Stato attuale
- **Branch/HEAD:** `main` a **`19df477`** (= `origin/main`). `document-center` **mergiato** in `main`; nessuna divergenza aperta.
- **In `main`:** Front Office (concierge + booking/preventivi Tier-1/Tier-2); **Operational Queue** + scadenza pagamento 24h (`0014` applicata+verificata, E2E reale); **separazione stato-pratica/stato-consegna** + Variante B; **coerenza state machine** (proposal_sent solo dopo consegna reale, un solo flusso Tier-1, markUnavailable consegna, availability_blocked collassato); Document Center MVP; Fail-Fast; doc v1.0 + Foundations + Context Layer.
- **Pilot reale — Giorno Zero (30/06):** DB operativo **azzerato** (~59.991 record di test). Base ufficiale conservata (KB, prezzi, camere, impostazioni, Gmail, cron, IBAN). Da ora ogni richiesta in Inbox = dato reale.
- **Sicurezza:** eseguito **Go-Live Security Assessment** → **🟠 NO-GO per esposizione pubblica non ristretta** finché non sono chiusi i **P0** (ADR-0019). Il pilot email controllato prosegue.
- **Flag:** autosend **OFF** (R0.1) · `vesta-email-poll` **attivo** · `vesta-followups` attivo.

## 3-bis. Foundations (Costituzione del prodotto)
- **`docs/foundations/PRODUCT.md`** + **`docs/foundations/WORKFLOW.md`** = **completati** (workflow verificato allineato al codice). **`BRAND.md` · `ENGINEERING.md` = non ancora creati** (solo su decisione esplicita).

## 4. Prossimo task
**Security Sprint P0** (in **chat dedicata**) — 5 vulnerabilità bloccanti pre-go-live pubblico. **Sviluppo skill/agenti sospeso** fino a chiusura. Ordine: P0-1 rotazione segreti → P0-2 hardening RPC `SECURITY DEFINER` (migrazione) → P0-4 security header → P0-3 anti-abuso chat → P0-5 dirottamento destinatario email. Dettaglio: [SECURITY](../SECURITY.md) + [NEXT_TASK](NEXT_TASK.md).

## 5. Decisioni aperte
- **OD-1:** tempistica autosend ON (raccomandato: dopo hardening Router L0 + P0 sicurezza).
- **OD-2:** signup Supabase aperto o chiuso per il go-live (raccomandato: **chiuso** finché non serve onboarding self-service).
- **OD-3:** garanzie prerequisito prima di onboardare un 2° tenant (almeno P0-2 chiuso).

## 6. Problemi noti P0/P1 (SSOT: [SECURITY](../SECURITY.md) + [KNOWN_ISSUES](KNOWN_ISSUES.md))
- **P0** Segreti esposti → ruotare (service_role, Anthropic, Gmail, Vercel bypass, CRON_SECRET). *(KI-2)*
- **P0** RPC `SECURITY DEFINER` privilegiate → cross-tenant / takeover; bypassano RLS. *(KI-7)*
- **P0** Chat pubblica abusabile (XFF spoof, no cap conversazioni) → DoS/cost-abuse. *(KI-8)*
- **P0** Nessun security header → clickjacking widget. *(KI-9)*
- **P0** Dirottamento destinatario email via `guest_contact` LLM. *(KI-10)*
- **P0** Router L0 falsi positivi `guest` → autosend OFF finché non rafforzato. *(KI-1)*
- **P1** Hold 24h non propagato a `rate_calendar` → rischio doppia prenotazione in finestra. *(KI-5)*

## 7. Regole non negoziabili
- **DoD:** codice in `main` + migrazione verificata (`to_regclass`) + E2E reale + **context layer aggiornato**.
- **Human-in-the-Loop fino a PMS (ADR-0011):** Vesta non blocca/libera camere, non invia IBAN, non conferma pagamenti, non tocca tariffe/PMS in autonomia.
- **Postura di sicurezza (ADR-0019):** RLS `user_in_org`; least-privilege sulle RPC `SECURITY DEFINER`; l'AI non ha tool con effetti né segreti nel contesto; segreti fuori da codice/chat; nessun dato LLM promosso a parametro di sicurezza.
- **Pilota sicuro:** autosend OFF, cron sospendibile, nessun contatto a ospiti reali senza verifica.
- **Migrazioni:** manuali nel SQL Editor, una alla volta, sempre verificate.

## 8. Come applicare una migrazione
Solo il titolare: Supabase SQL Editor → incolla la migrazione → Run → verifica con `to_regclass`. Procedura: `docs/RUNBOOKS/apply-migration.md`.

---
*Dettaglio completo: `docs/context/` (stato vivo) e `docs/` (conoscenza). Aggiornare questo report ad ogni milestone (DoD §13).*
