# LunArt Operating Agent v0 — Runbook operativo interno

> **Per chi:** staff LunArt (Jacopo, Diego). **Da quando:** pilot interno, autosend OFF (R0.1).
> **Cos'è Vesta oggi:** l'assistente operativo interno della struttura — prepara, rileva e
> tiene traccia; **le decisioni e gli invii restano dello staff**.
> Ultimo aggiornamento: 2026-07-12 (sprint Operating Agent v0).

## 1 · Cosa può fare Vesta oggi

| Area | Cosa fa Vesta | Cosa resta a te |
|---|---|---|
| **Email in arrivo** | Legge la casella `lunartfirenze@gmail.com` periodicamente via cron (attualmente ~ogni 2 min), separa ospiti / OTA / fornitori / newsletter | Nulla: la smistatura è automatica |
| **Richieste ospiti** | Classifica la richiesta, calcola il preventivo (prezzi SOLO dal Calendario tariffe) e **prepara una bozza di risposta** | **Rivedere e approvare** ogni invio (autosend OFF) |
| **Preventivi** | Propone tutte le camere adatte con prezzi, sconto diretto, tassa di soggiorno separata | Verificare la disponibilità reale nel PMS/QuoVai prima di riservare |
| **Scadenze pagamento** | Rileva da solo (ogni 5 min) le riserve con 24h scadute senza pagamento e apre una task in **Coda operativa** + notifica | Verificare il bonifico e premere "Pagamento ricevuto" o "Non ricevuto" |
| **Documenti** | Archivia da solo le fatture PDF delle email Booking nel **Document Center** (email e PDF originali conservati) | Inviare i PDF al commercialista e registrare l'invio |
| **Audit** | Registra ogni passaggio di stato nella Timeline della pratica | — |

## 2 · Dove guardare, in ordine

1. **⚡ Coda operativa** (`/tasks`, tab mobile "Da fare") — le cose urgenti rilevate da Vesta
   (oggi: pagamenti con 24h scadute). Se è verde, non c'è nulla di urgente.
2. **📥 Inbox richieste** (`/inbox`) — la sezione "⚡ Da gestire" in alto è il lavoro del giorno.
   Il chip rosso **"⏰ 24h scadute"** su una riga = c'è una task aperta su quella pratica.
3. **🔔 Notifiche** (campanella) — escalation e avvisi (es. "ospite dichiara di aver pagato",
   "errore tecnico: risposta AI non generata").
4. **📂 Document Center** (`/documents`) — tab "Pronti per il commercialista".

## 3 · Come gestire una richiesta ospite (flusso tipo)

1. Apri la pratica dall'Inbox. La card **"Azione richiesta"** in alto dice l'unica cosa da fare.
2. `📝 Bozza pronta` → leggi la risposta preparata da Vesta (testo completo in pagina).
   Se va bene: **"✅ Approva e invia proposta"**. Se non va bene: correggi il prezzo da
   "Dettagli pratica → Modifica prezzo/offerta" e poi approva, oppure gestisci a mano
   dalla conversazione.
3. Ospite interessato → **verifica la disponibilità su QuoVai**, poi
   **"✅ Disponibile → riserva 24h e richiedi pagamento (IBAN)"** (o "Non disponibile → alternative").
4. Pagamento: quando arriva il bonifico → **"✅ Pagamento ricevuto → conferma e invia PDF"**.
5. La **Timeline** in fondo alla pagina è lo storico completo (chi ha fatto cosa, quando).

**Richieste poco chiare:** Vesta non inventa — chiede chiarimenti all'ospite o passa la mano
("pending staff" + notifica). Se una pratica dice "gestiscila a mano", apri la conversazione
e rispondi tu con il box staff.

## 4 · Task di pagamento (Coda operativa)

Quando una camera riservata supera le 24h senza pagamento confermato:
- la task compare in **Coda operativa** con importo atteso, date e scadenza della riserva;
- da lì **"Gestisci la pratica →"** porta alla pagina con i due soli bottoni possibili:
  - **✅ Pagamento ricevuto** → conferma la prenotazione e invia il PDF all'ospite;
  - **✖ Non ricevuto** → avvisa l'ospite della scadenza. ⚠️ **La camera va liberata a mano
    nel PMS/QuoVai**: Vesta non tocca mai l'inventario.
- le task risolte restano visibili 7 giorni nella coda (chi/che esito).

## 5 · Document Center / Finance Inbox v0

- Le **fatture Booking** arrivano da sole (dall'email, con PDF). Altri documenti: caricali
  a mano col form in alto (PDF, max 10 MB, scegli fornitore e categoria).
- Flusso: tab **"Pronti per il commercialista"** → apri/controlla i PDF → **scaricali e
  inviali tu** al commercialista → seleziona le righe e **"Segna come inviati"** (con nota).
  Lo storico invii resta in fondo alla pagina.
- v0 riconosce solo Booking; Airbnb/Expedia/altre fatture estere vanno caricate a mano
  (riconoscimento automatico in una fase successiva).

## 6 · Cosa resta manuale (per scelta, finché non c'è il PMS)

- Verifica disponibilità e **blocco/sblocco camere su QuoVai** — sempre tu.
- **Invio di ogni messaggio all'ospite** — sempre previa tua approvazione (autosend OFF).
- Conferma dei **pagamenti** (verifica bonifico) e invio **IBAN**.
- Invio dei documenti **al commercialista**.
- Tariffe: si aggiornano solo dal **Calendario tariffe** (o CSV/iCal), mai dall'AI.

## 7 · Cosa è VIETATO aspettarsi da Vesta (fino ad approvazioni future)

- ❌ Non invia email da sola (kill-switch autosend OFF per tutta la R0.1).
- ❌ Non conferma prenotazioni né dichiara camere "riservate" senza click dello staff.
- ❌ Non modifica tariffe, disponibilità o il PMS.
- ❌ Non manda IBAN o richieste di pagamento in autonomia.
- ❌ Non cancella dati.

## 8 · Limiti noti della v0

- **Camera senza prezzo in Calendario = non proposta** (nessun avviso: se un preventivo
  sembra "corto", controlla il Calendario tariffe di quella camera).
- Il riconoscimento documenti copre **solo Booking**; il resto è upload manuale.
- Le task operative coprono oggi **solo la scadenza pagamento 24h**.
- Follow-up automatici agli ospiti non attivi (le email di sollecito le mandi tu).
- Un errore tecnico dell'AI genera una notifica "Errore tecnico" → gestisci a mano quella
  conversazione.

## 9 · Se qualcosa non va

1. Fai uno **screenshot** e annota ora + pagina + pratica (ID breve in alto).
2. Scrivilo nel canale interno a Jacopo (o registro osservazioni UX del pilot).
3. **Non forzare azioni ripetute** sulla stessa pratica (ogni click può inviare email
   all'ospite): se un bottone fallisce due volte, fermati e segnala.
4. Emergenza canale email (nessuna email entra da ore): avvisa Jacopo — runbook tecnico
   `docs/RUNBOOKS/` (incident email).

---
*Vesta = AI Operations Layer: prepara e sorveglia, lo staff decide. Questo runbook si
aggiorna a ogni release del pilot (Documentation as Code).*
