# OPEN DECISIONS — decisioni aperte e ADR candidate

> **SOLO ciò che NON è ancora deciso.** Appena una decisione è presa → diventa una **ADR in [DECISIONS.md](../DECISIONS.md)** ed è **rimossa da qui** (migrazione one-way). Le decisioni già prese **non** vivono qui.
> **Aggiornato:** 2026-09-28.

## Decisioni aperte

### OD-2 — Signup Supabase aperto o chiuso per il go-live pubblico
- **Contesto:** se il signup è aperto (default), qualunque utente Internet ottiene un JWT `authenticated`; combinato con le RPC `SECURITY DEFINER` concesse ad `authenticated` (KI-7), diventa vettore di takeover di tenant.
- **Opzioni:** (a) **disabilitare il signup** finché non esiste un onboarding self-service controllato; (b) tenerlo aperto ma **solo dopo** aver chiuso P0-2 (hardening RPC).
- **Raccomandazione:** **(a)** nel breve — disabilitare finché non serve l'onboarding di una 2ª struttura. Da decidere nel Security Sprint P0. → [SECURITY](../SECURITY.md) P0-2, [KNOWN_ISSUES](KNOWN_ISSUES.md) KI-7.

### OD-3 — Confine multi-tenant per il go-live pubblico
- **Contesto:** oggi il pilot è single-tenant (LunArt). Le vulnerabilità cross-tenant (KI-7) sono latenti finché esiste un solo tenant, ma diventano reali con la 2ª struttura.
- **Decisione da prendere:** quali garanzie di sicurezza sono prerequisito **prima** di onboardare un 2° tenant (almeno: P0-2 chiuso + verifica GRANT/signup). → [DECISIONS](../DECISIONS.md) ADR-0019.

### OD-1 — Quando attivare l'autosend email
- **Contesto:** il cron `vesta-email-poll` è **attivo** (validato al Giorno Zero) e la milestone Operational Queue è **completata**; resta aperta solo la tempistica dell'**autosend ON** (oggi OFF per tutta la R0.1).
- **Stato (28/09/2026):** il prerequisito della raccomandazione (b) è SODDISFATTO — Router Training Sprint #1 completato e **in produzione dal 27/09** (E2E verde; shadow analysis su 687 record reali senza difetti). Resta SOLO la decisione di timing di Jacopo; set minimo di label review: conferma dei 2 record Tonico del 28/06 (vedi [KNOWN_ISSUES](KNOWN_ISSUES.md) KI-1).

## ADR candidate (idee emerse, non bloccanti)
*Non implementare finché un caso d'uso reale non le giustifica (PROJECT_RULES — Product First).*
- **AC-1:** promuovere `details.title` / `created_by` a colonne di `operational_tasks` quando nascerà la **creazione manuale** di task (additivo, nessun refactor). → [[operational-queue]]
- **AC-2:** vista unica "Operational Queue" (lista cross-type) quando arriverà il **2° tipo** non legato a una prenotazione (housekeeping/manutenzione).

*(Quando una di queste viene decisa, si registra come ADR in DECISIONS.md e si rimuove da qui.)*
