# CURRENT STATE — stato vivo del progetto

> **Layer di CONTESTO** (stato vivo), non di conoscenza. Fonte di verità = repository GitHub.
> **Aggiornato:** 2026-06-30 · branch `main` · HEAD `19df477` · ✅ verificato con git
> **SSOT:** priorità → [ROADMAP](../ROADMAP.md) · storia → [CHANGELOG](../CHANGELOG.md) · decisioni → [DECISIONS](../DECISIONS.md) · sicurezza → [SECURITY](../SECURITY.md). Qui solo la **fotografia**, niente duplicati.

## Branch & git (✅ verificato)
- Branch corrente: **`main`** (HEAD `19df477`) · `origin/main` allineato.
- `document-center` è stato **mergiato in `main`** (fast-forward). Nessuna divergenza doc/branch aperta.

## In `main` (= 19df477)
- **Front Office** — AI Concierge + motore prenotazioni/preventivi (flusso Tier-1/Tier-2). In produzione.
- **Operational Queue** (`operational_tasks`) + sotto-flusso **scadenza pagamento 24h** — migrazione `0014` **applicata e verificata**, E2E reale superato, mergiata (`50e9929`).
- **Separazione stato-pratica / stato-consegna** + risposta AI completa + pagina richiesta decision-first (Variante B) — `3cb97d6`.
- **Coerenza state machine** (fix pilot): `proposal_sent` solo dopo consegna reale; un solo flusso Tier-1 (room-picker solo per lead manuali); `markUnavailable` consegna davvero; `availability_blocked` collassato — `6282d60`→`d5753a3`→`19df477`. E2E consegna 22/22.
- **Document Center MVP (Booking)** — codice in `main`. ⚠️ chiusura DoD (fattura Booking reale) da confermare.
- **Fail-Fast** su tutte le scritture Supabase. **Documentazione v1.0** + Foundations (`PRODUCT.md`, `WORKFLOW.md`) + Context Layer (ADR-0018).

## Pilot reale — Giorno Zero (30/06/2026)
- **Giorno Zero del Pilot LunArt B&B** dichiarato ufficialmente. **DB operativo azzerato** (~59.991 record di test eliminati: richieste, conversazioni, messaggi, notifiche, log AI/guardrail, archivio OTA). Inbox vuota.
- Conservata integralmente la **base ufficiale**: Knowledge Base (24 asset), `rate_calendar` (837), 5 camere LunArt, ical_feeds, impostazioni/IBAN, config Gmail, cron, org/owner. `email_routing_log` (53) mantenuto (anti re-import).
- Property "Struttura Demo B" + "Camera Demo 1" → **soft-delete**. Da ora ogni richiesta in Inbox è **dato reale**.

## Ultima milestone completata (per DoD)
- **Operational Queue / scadenza 24h** (codice in `main` + `0014` verificata + E2E reale) e i **fix di coerenza state machine** (`19df477`, validati dal titolare in produzione). Poi **Giorno Zero** + pulizia DB.

## Milestone corrente
- **Security Sprint P0** (pre-go-live pubblico) — vedi [NEXT_TASK](NEXT_TASK.md). **Sviluppo skill/agenti sospeso** finché i P0 non sono chiusi. Gate e invarianti: [SECURITY](../SECURITY.md) (Go-Live Security Assessment) + [DECISIONS](../DECISIONS.md) **ADR-0019**.
- **Verdetto assessment:** 🟠 **NO-GO** per esposizione pubblica non ristretta finché i P0 non sono chiusi; il **pilot email controllato prosegue**.

## Flag operativi
- `email_autosend_enabled` = **OFF** (per tutta la R0.1) · cron `vesta-email-poll` = **attivo** (validato al Giorno Zero) · cron `vesta-followups` = attivo (dispatcher scadenze dopo apply 0014).
