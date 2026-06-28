# ROADMAP

Fonte ufficiale per le **priorità operative**. La direzione strategica di lungo periodo è in
[BUSINESS.md](BUSINESS.md); le evoluzioni coerenti per area nelle sezioni *Future Evolution* dei singoli
documenti. Questa roadmap è volutamente **breve e attuale**.

> **Legenda** (PROJECT_RULES §2): ✅ verificata · ◐ dedotta · ○ ipotizzata.

---

## Parte 1 — Current State

### Cosa è congelato
- ✅ **Fase B (workflow commerciale)** e il flusso prenotazioni sono **congelati**: nessuna nuova
  funzionalità sul booking. Focus su rendere Vesta realmente utilizzabile su LunArt.

### Priorità attuali (in ordine)
1. ◐ **Validazione E2E del canale email** sul pilota (in pausa: in corso il consolidamento
   documentazione + il fix fail-fast da deployare su Preview). → [RUNBOOKS/email-e2e-test.md](RUNBOOKS/email-e2e-test.md)
2. ◐ **Document Center MVP (Booking)**: merge in `main` + deploy dopo l'E2E, poi **test reale con una
   fattura Booking**.
3. ◐ **WhatsApp Business**: attivazione del canale (oggi inerte) quando disponibile il numero/credenziali.

### Blocco noto prima del go-live autosend
- ✅ **Router L0 — falsi positivi `guest`** (Tonico/Amazon/Poste): da rafforzare prima di abilitare
  l'autosend per ospiti reali ("Router Training Sprint #1"). Vedi [CHANGELOG.md](CHANGELOG.md).

### Stato moduli (sintesi)
- ✅ Front Office (concierge + booking): in produzione. Email in pilota (autosend OFF).
- ✅ Back Office (Document Center MVP): costruito sul branch, **non** completato (manca merge + E2E).
- ◐ Operations / Revenue / Financial Intelligence / Operational Memory: direzione, non implementati.

---

## Parte 2 — Guiding Principles

- **Esecuzione prima di nuova progettazione.** Validare il pilota reale prima di aprire nuove aree.
- **Una cosa alla volta, completata davvero** (Definition of Done): niente feature "implementate ma non
  completate" che si accumulano.
- **Sicurezza del pilota.** Nessun passo che possa contattare ospiti reali senza verifica.
- **La roadmap non duplica la strategia.** Le evoluzioni di lungo periodo vivono in BUSINESS/Future
  Evolution, non qui (Single Source of Truth).

---

## Future Evolution
*Direzione, non impegni (→ [BUSINESS.md](BUSINESS.md)).*
- Back Office Assistant F1→F5 (archivio → documenti IT → scadenze → controllo → riconciliazione).
- Multi-property → vendita ad altre strutture → Vesta Experiences → marketplace.
- Capability Engine / altri verticali ([DOMAINS.md](DOMAINS.md)) se confermati dall'esperienza.

---

## Related Documents
- [BUSINESS.md](BUSINESS.md) — visione e direzione
- [ARCHITECTURE.md](ARCHITECTURE.md) — stato tecnico
- [CHANGELOG.md](CHANGELOG.md) — cosa è cambiato di recente
- [DECISIONS.md](DECISIONS.md) — decisioni che vincolano le priorità
