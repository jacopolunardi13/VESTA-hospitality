# WORKFLOW.md — Workflow ufficiale di Vesta (commerciale + pagamento)

> **Policy di prodotto ufficiale e vincolante**, valida **fino all'integrazione ufficiale con un PMS/Channel Manager (API) o fino a una successiva decisione esplicita.**
> Questo documento è la **SSOT del flusso operativo**. I *principi* vivono in [PRODUCT.md](PRODUCT.md) (§14 Tier-1/Tier-2, §18 non negoziabili, §19 decisioni confermate); la *decisione di governo* è [DECISIONS.md](../DECISIONS.md) **ADR-0011** (Human-in-the-Loop, nessuna azione operativa autonoma senza PMS). Qui sta il **dettaglio del flusso**.
> **Aggiornato:** 2026-06-29.

---

## Principio
**L'AI lavora, lo staff decide.** Vesta automatizza tutto ciò che non comporta impegni economici o modifiche al PMS; ogni azione vincolante (IBAN, blocco camera, conferma, pagamento, liberazione) passa **sempre** dall'approvazione dello staff. Finché non esiste un'integrazione PMS affidabile, **Vesta non modifica mai lo stato operativo della struttura** (non blocca né libera camere, non tocca l'inventario).

## Tier 1 — completamente automatico
Vesta **gestisce e invia automaticamente** le richieste che non comportano impegni economici né modifiche al PMS:
- FAQ · check-in · parcheggio · ristoranti · servizi
- disponibilità · prezzi · **primo preventivo** · chiarimenti

Queste risposte sono **inviate automaticamente** (canale email: invio reale soggetto al kill-switch `email_autosend_enabled`).

## Passaggio a Tier 2 — l'ospite sceglie una camera o manifesta chiaramente l'intenzione di prenotare
Vesta in questo momento:
- **NON** blocca la camera;
- **NON** invia l'IBAN;
- **NON** conferma alcuna prenotazione.

Vesta invece:
- risponde all'ospite confermando la presa in carico e dichiarando esplicitamente che **la camera non è ancora riservata e di non effettuare alcun pagamento** (Tier-1);
- crea una **Pending Action + notifica** allo staff;
- porta la pratica in stato `interested`.

## Intervento dello staff
Lo staff:
1. verifica la disponibilità **reale nel PMS (QuoVai)**;
2. **blocca manualmente** la camera;
3. **approva l'invio**.

## Solo dopo l'approvazione dello staff
Vesta invia **automaticamente** all'ospite:
- il **PDF del preventivo**;
- l'**IBAN** e gli estremi del bonifico;
- la **spiegazione del blocco della camera per 24 ore**.

La pratica passa a **`awaiting_payment`** (scadenza a +24h).

## Pagamento — finestra 24 ore
Se entro 24 ore il pagamento non viene confermato:
- Vesta crea **automaticamente** una **Operational Task** (`booking.payment_window_expired`) + **notifica** allo staff;
- **nessuna email automatica** viene inviata all'ospite.

## Decisione finale dello staff — due sole azioni
- **Pagamento ricevuto** → Vesta invia **automaticamente la conferma finale** della prenotazione (+ PDF di conferma); pratica `confirmed`.
- **Pagamento non ricevuto** → Vesta invia **automaticamente la comunicazione di decadenza**; pratica `cancelled`. **La liberazione della camera nel PMS resta manuale.**

---

## Riepilogo: chi fa cosa
| Fase | Vesta (auto) | Staff (Jacopo/Diego) |
|---|---|---|
| FAQ/concierge/disponibilità/prezzi/primo preventivo | invia | — |
| Scelta camera / intenzione | ack senza IBAN + Pending Action + notifica | — |
| Verifica disponibilità reale + blocco camera | — | QuoVai (manuale) |
| Approvazione invio proposta | — | clic in dashboard |
| Invio PDF preventivo + IBAN + blocco 24h | invia | — |
| Scadenza 24h senza pagamento | crea Operational Task + notifica (nessuna email) | — |
| Esito pagamento | invia conferma **o** decadenza | clic: ricevuto / non ricevuto |
| Liberazione camera (se non pagato) | — | QuoVai (manuale) |

## Implementazione (riferimenti per la verifica)
- Tier-1 invio email: `app/src/lib/email/ingest.ts` (gate `email_autosend_enabled`).
- Orchestrazione (scelta camera → `interested`, niente IBAN): `app/src/lib/booking/orchestrate.ts`.
- Approvazione + invio Tier-2: `app/src/app/(dashboard)/inbox/actions.ts` (`confirmAvailability`, `confirmBooking`, `markPaymentNotReceived`).
- Testi ospite: `app/src/lib/ai/messages.ts` (`availabilityCheckAck`, `paymentInstructions`, `confirmationText`, `expiryText`).
- Scadenza 24h: migrazione `supabase/migrations/0014_operational_tasks.sql` (`process_payment_expiry` + dispatcher); helper `app/src/lib/tasks/`; presentazione `app/src/lib/tasks/catalog.ts` (due azioni).
- Consegna outbound: `app/src/lib/delivery/deliverToGuest.ts` (Tier-2 bypassa il kill-switch).

## Note
- **Re-valutazione:** quando esisterà un'integrazione PMS ufficiale, il livello di automazione sarà rivalutato con una **nuova ADR** (vedi ADR-0011). Fino ad allora questo workflow è definitivo.
- Modifiche a questo documento seguono le *Evolution Rules* di [PRODUCT.md](PRODUCT.md): solo decisioni consolidate, mai brainstorming.
