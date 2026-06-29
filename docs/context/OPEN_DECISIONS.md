# OPEN DECISIONS — decisioni aperte e ADR candidate

> **SOLO ciò che NON è ancora deciso.** Appena una decisione è presa → diventa una **ADR in [DECISIONS.md](../DECISIONS.md)** ed è **rimossa da qui** (migrazione one-way). Le decisioni già prese **non** vivono qui.
> **Aggiornato:** 2026-06-29.

## Decisioni aperte

### OD-1 — Quando attivare autosend email + cron `vesta-email-poll`
- **Contesto:** il go-live operativo dell'email dipende dalla milestone Operational Queue completata + E2E approvato.
- **Opzioni:** (a) attivare subito dopo l'E2E della milestone; (b) attivare solo dopo il **Router Training Sprint #1** (hardening falsi positivi `guest`).
- **Pro/contro:** (a) più veloce, ma rischio di auto-rispondere a non-ospiti (Tonico/Amazon/Poste); (b) più sicuro per gli ospiti reali, più lento.
- **Raccomandazione:** **(b)** — autosend ON solo dopo l'hardening del Router L0 (vedi [KNOWN_ISSUES](KNOWN_ISSUES.md) KI-1).

## ADR candidate (idee emerse, non bloccanti)
*Non implementare finché un caso d'uso reale non le giustifica (PROJECT_RULES — Product First).*
- **AC-1:** promuovere `details.title` / `created_by` a colonne di `operational_tasks` quando nascerà la **creazione manuale** di task (additivo, nessun refactor). → [[operational-queue]]
- **AC-2:** vista unica "Operational Queue" (lista cross-type) quando arriverà il **2° tipo** non legato a una prenotazione (housekeeping/manutenzione).

*(Quando una di queste viene decisa, si registra come ADR in DECISIONS.md e si rimuove da qui.)*
