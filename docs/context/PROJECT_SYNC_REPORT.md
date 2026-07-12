# PROJECT SYNC REPORT — Vesta Hospitality

> **Report vivo e compilato.** Copia/incolla questo file in una nuova chat (ChatGPT o Claude) per riallineare l'assistente in pochi minuti. Generato dai file di stato in `docs/context/`.
> **Aggiornato:** 2026-07-12 · branch `chore/autonomous-engineering` · HEAD `8066431`.

## 1. Identità progetto
**Vesta Hospitality** — SaaS multi-tenant: "dipendente virtuale" per piccole strutture ricettive (front + back office). Repo GitHub `jacopolunardi13/VESTA-hospitality`. Pilota: **LunArt B&B** (Firenze), Giorno Zero 30/06/2026. **Confine strategico VINCOLANTE:** Vesta = **AI Operations Layer hospitality**, non chatbot/wrapper generico (gate 8 punti — PRODUCT.md §18). **La fonte di verità è il repo, non le chat.**

## 2. Stack minimo
TypeScript · **Next.js 16** (App Router) / React 19 · **Supabase** (Postgres + Auth OAuth + Storage + RLS, pg_cron) · **Anthropic Claude** (Haiku + Sonnet) · pdfkit · Gmail API · hosting **Vercel** (prod = `main`).

## 3. Stato attuale — ⚠️ divergenza a 3 vie (nessun merge in `main`)
- **Branch attivo:** `chore/autonomous-engineering` @ **`8066431`** (+5 su `main`). `main` @ `d239698`. `security/p0-2-rpc-hardening` @ `5f0d4a1` = **P0-2 / migrazione `0015` applicata al DB prod, NON mergiata**. Storici: `document-center`, `fase-b`.
- **⚠️ DB prod avanti al repo:** `0015` è in produzione ma vive solo sul branch security → **riconciliazione branch aperta**.
- **In prod / DB:** Front Office (Tier-1/Tier-2), **Operational Queue** (`0014` applicata+verificata), Document Center MVP; **P0-2 live** (`anon` negato ✅, RLS attivo); **canale email prod ripristinato** (Google Cloud progetto ufficiale **542106** / casella `lunartfirenze`).
- **Multi-agente / WorkspaceOS:** PROJECT_REGISTRY creato, **Vesta registrata**; **Codex = review-only**; **Claude Code = unico writer**; **Jacopo** approva solo 🔴 RED.
- **Flag:** autosend **OFF** (R0.1) · `vesta-email-poll` attivo · `vesta-followups` **da verificare** (KI-11) · signup Supabase **chiuso**.

## 3-bis. Foundations (Costituzione del prodotto)
- `docs/foundations/PRODUCT.md` (con **§18 Strategic Product Boundary**) · `WORKFLOW.md` · **`ENGINEERING.md` creato** (Autonomous Engineering, F1). `BRAND.md` = non ancora creato.

## 4. Prossimi passi — check per il pilot interno
1. **Anthropic in produzione** — verificare la chiave prod (`.env.local` invalida in locale; possibile blocker concierge se anche prod fosse invalida).
2. **KI-11 / `vesta-followups`** — confermare lo scheduling del cron detector 24h (logica OK all'E2E).
3. **Riconciliazione branch** — portare P0-2 + Autonomous Engineering + Product Boundary in `main`.
4. Poi residui: rotazione segreti (P0-1 parziale) → P0-4 header → P0-3 anti-abuso chat → P0-5 destinatario email.

## 5. Decisioni aperte
- **OD-1:** tempistica autosend ON (dopo hardening Router L0 + P0). · **OD-2:** signup (attualmente **chiuso**, mitigazione P0-2). · **OD-3:** prerequisiti 2° tenant (almeno P0-2). · **OD-4:** riconciliazione/merge dei 3 branch in `main`.

## 6. Problemi noti P0/P1 (SSOT: [SECURITY](../SECURITY.md) + [KNOWN_ISSUES](KNOWN_ISSUES.md))
- ✅ **P0-2 CHIUSO** — RPC `SECURITY DEFINER` hardenizzate (`0015`: REVOKE anon/authenticated, guard `auth.uid()`); anon negato live.
- 🔴 **Anthropic `.env.local` invalida** → concierge locale rotto; **prod da verificare**.
- 🟡 **KI-11** — divergenza migrazioni↔DB: `process_due_followups()` assente → cron `vesta-followups` forse fallisce.
- **P0 residui:** segreti da ruotare (P0-1 parziale) · P0-3 chat anti-abuso · P0-4 header · P0-5 destinatario email · Router L0 falsi positivi (KI-1, autosend OFF).
- **P1:** hold 24h non propagato a `rate_calendar` (KI-5).

## 7. Regole non negoziabili
- **DoD:** codice in `main` + migrazione verificata (`to_regclass`) + E2E reale + **context layer aggiornato**.
- **Strategic Product Boundary (VINCOLANTE):** ogni feature supera il **gate 8 punti** o è riformulata come workflow / rifiutata (PROJECT_RULES "Product First" + PRODUCT.md §18; gate = `product-guardian`).
- **Human-in-the-Loop fino a PMS (ADR-0011):** Vesta non blocca/libera camere, non invia IBAN, non conferma pagamenti, non tocca tariffe/PMS in autonomia.
- **Postura di sicurezza (ADR-0019):** RLS `user_in_org`; least-privilege RPC; nessun segreto in codice/chat; nessun dato LLM promosso a parametro di sicurezza.
- **Pilota sicuro:** autosend OFF · nessun contatto reale non verificato · migrazioni manuali una alla volta, sempre verificate.
- **Ruoli:** Claude Code = writer · Codex = review-only · Jacopo = approva RED.

## 8. Come applicare una migrazione
Solo il titolare: Supabase SQL Editor → incolla la migrazione → Run → verifica con `to_regclass`. Procedura: `docs/RUNBOOKS/apply-migration.md`.

---
*Dettaglio completo: `docs/context/` (stato vivo) e `docs/` (conoscenza). Aggiornare questo report ad ogni milestone (DoD §13).*
