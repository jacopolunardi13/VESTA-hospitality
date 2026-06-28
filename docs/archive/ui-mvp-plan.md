# AI Concierge & Direct Quote — Piano UI dell'MVP

> Versione 0.11 — 14 giugno 2026 (aggiornate priorità schermate: D1+D2 elevate a P0 critiche come cuore del flusso prenotazione; chiarito ruolo KB come infrastruttura AI; aggiornata tabella priorità §6)
> Derivato da `supabase/schema.sql` (migrazione 0001), [product-brief](product-brief.md), [roadmap](roadmap.md), [dev-plan](dev-plan.md).
> Solo progettazione: nessun riferimento implementativo oltre alle route.

---

## 1. Inventario schermate MVP

Due superfici separate: **app ospite** (pubblica, senza login) e **dashboard gestore** (autenticata).

### Superficie ospite (pubblica)

| ID | Schermata | Route | Tabelle servite |
|---|---|---|---|
| G1 | Web chat | `/c/[property]` | `conversations`, `messages` |
| G2 | Card proposta (dentro la chat) | — (componente di G1) | `booking_requests`, `booking_request_items` |

### Superficie gestore (dashboard)

| ID | Schermata | Route | Tabelle servite |
|---|---|---|---|
| A1 | Login / Registrazione | `/login` | `auth.users` |
| A2 | Onboarding (wizard org + property) | `/onboarding` | `organizations`, `org_members`, `properties` |
| D1 | **Inbox richieste** (home) | `/inbox` | `booking_requests`, `scoring_events` |
| D2 | Dettaglio richiesta | `/inbox/[id]` | `booking_requests`, `*_items`, `*_events`, `scoring_events`, `conversations` |
| D3 | Conversazioni (lista) | `/conversations` | `conversations` |
| D4 | Dettaglio conversazione | `/conversations/[id]` | `messages`, `conversations`, `ai_calls` |
| D5 | Calendario tariffe | `/calendar` | `rate_calendar`, `rooms`, `ical_feeds` |
| D6 | Camere | `/rooms` | `rooms` |
| D7 | Knowledge base | `/knowledge` | `knowledge_assets`, `knowledge_asset_versions` |
| D8 | Template messaggi | `/templates` | `templates` |
| D9 | Follow-up | `/followups` | `followup_rules`, `followup_jobs` |
| D10 | Impostazioni property | `/settings/property` | `properties` (settings, supervision, learning mode) |
| D11 | Organizzazione e membri | `/settings/organization` | `organizations`, `org_members` |
| D12 | AI e costi (lite) | `/settings/ai` | `ai_calls` |
| D13 | Analytics / KPI | `/analytics` | `booking_requests`, `*_events`, `conversations`, `ai_calls` (vedi §11.3) |

**Totale MVP: 14 schermate** (2 ospite + 12 gestore). Le schermate post-MVP sono elencate al §6.

---

## 2. Flusso completo gestore

### 2.1 Primo utilizzo (onboarding → struttura operativa)

```
Registrazione (A1)
   │
   ▼
Onboarding (A2) — wizard in 3 step:
   1. Crea organization (nome)
   2. Crea prima property (nome, città, timezone, lingua)
   3. Riepilogo settings di default (sconto 10%, hold 24h, supervision ON)
   │
   ▼
Setup guidato (checklist in D1 finché incompleta):
   ① Camere (D6)  →  ② Tariffe (D5: manuale o CSV, feed iCal opzionale)
   →  ③ Knowledge base (D7: almeno info base struttura)
   →  ④ Verifica template default (D8)
   │
   ▼
Condivisione link/QR web chat (da D10) → la struttura è live
```

### 2.2 Operatività quotidiana (ciclo Direct Quote)

```
Notifica/inbox: nuova richiesta (D1, status = 'received')
   │
   ▼
Dettaglio richiesta (D2): dati estratti dall'AI, prezzo calcolato,
affidabilità dati, proposta generata
   │
   ├── supervision_mode ON  → il gestore rivede/modifica → [Invia proposta]
   └── supervision_mode OFF → proposta già inviata dall'AI (il gestore osserva)
   │
   ▼ status = 'proposal_sent'  (follow-up automatici attivi)
   │
Ospite clicca "Sono interessato" → status = 'interested' → notifica
   │
   ▼
Gestore in D2: [Verifica disponibilità] → status = 'to_verify'
   → [Blocca disponibilità] → status = 'availability_blocked' (hold 24h, countdown)
   → [Richiedi pagamento]  → status = 'awaiting_payment'
   │
   ├── Pagamento ricevuto → [Conferma] → status = 'confirmed'
   │      → follow-up post-conferma (istruzioni check-in)
   ├── Hold scaduto (cron) → status = 'expired'
   └── [Rifiuta] / ospite rinuncia → 'rejected' / 'cancelled'
```

### 2.3 Supervisione conversazioni ed escalation

```
Conversazione richiede lo staff (status = 'pending_staff') → badge in D3
   │
   ▼
D4: il gestore legge il thread → scrive la risposta come "staff"
   → la conversazione torna "aperta" (AI riprende) oppure viene chiusa
```

### 2.4 Manutenzione

- Aggiornamento tariffe (D5) — l'indicatore di freshness in D1/D2 lo sollecita.
- Aggiornamento KB (D7) quando emergono domande senza risposta.
- Regole follow-up (D9), impostazioni commerciali (D10), membri (D11), monitoraggio costi AI (D12).

---

## 3. Flusso completo ospite

```
Scansiona QR / apre link  →  /c/[property]
   │
   ▼
Web chat: messaggio di benvenuto nella lingua del browser
(selettore lingua disponibile) + disclaimer della struttura
   │
   ├── Domanda informativa ("c'è il parcheggio?")
   │      → risposta AI grounded sulla KB (secondi)
   │      → se l'AI non sa rispondere → "Chiedo allo staff" (escalation)
   │
   └── Richiesta disponibilità ("avete posto dal 20 al 23 per 2 adulti e 1 bimbo?")
          → l'AI estrae date/ospiti; se mancano dati li chiede
          → CARD PROPOSTA (G2): camere, notti, prezzo totale, sconto diretto,
            tassa di soggiorno, validità offerta, disclaimer affidabilità
          → [ Sono interessato ]   [ Fai un'altra domanda ]
   │
   ▼ click "Sono interessato"
Messaggio AI: "Perfetto! Lo staff verifica e ti blocca la disponibilità.
Ti aggiorniamo qui." (status → interessato, lato gestore)
   │
   ▼ (lo staff blocca e richiede il pagamento)
Messaggio in chat con istruzioni di pagamento + scadenza hold 24h
   │
   ▼ (pagamento verificato dallo staff)
Messaggio di conferma + follow-up automatici (istruzioni check-in)
```

Punti fermi UX ospite:
- **Zero login, zero form**: tutto avviene in conversazione; nome/contatto chiesti dall'AI solo quando servono (prima della proposta).
- **Il prezzo è sempre in una card strutturata**, mai sciolto nel testo: leggibile, con scadenza esplicita.
- La chat resta accessibile rivisitando il link (sessione legata al browser).

---

## 4. Navigazione dell'app

### Dashboard gestore

```
┌────────────────────────────────────────────────────────────────┐
│ TOPBAR:  [Logo]  [Property: Struttura Demo A ▾]      [👤 Menu] │
├──────────────┬─────────────────────────────────────────────────┤
│ SIDEBAR      │                                                 │
│              │                                                 │
│ ▸ Inbox  (3) │              AREA CONTENUTO                     │
│ ▸ Conversa-  │                                                 │
│   zioni  (1) │                                                 │
│ ▸ Calendario │                                                 │
│ ▸ Camere     │                                                 │
│ ▸ Knowledge  │                                                 │
│ ▸ Template   │                                                 │
│ ▸ Follow-up  │                                                 │
│ ──────────   │                                                 │
│ ▸ Imposta-   │                                                 │
│   zioni      │                                                 │
└──────────────┴─────────────────────────────────────────────────┘
```

- **Property switcher** in topbar: tutte le viste sono scoped sulla property selezionata (il modello org→properties lo richiede). Con una sola property il selettore è discreto.
- **Badge numerici**: Inbox = richieste che attendono azione dello staff; Conversazioni = thread `pending_staff`.
- **Impostazioni** raggruppa: Property (D10), Organizzazione e membri (D11), AI e costi (D12).
- Mobile: sidebar → bottom nav con le 4 voci principali (Inbox, Conversazioni, Calendario, Altro).

### Superficie ospite

Una sola route (`/c/[property]`), nessuna navigazione: header con nome struttura + selettore lingua, thread, input. La card proposta è inline nel thread.

---

## 5. Wireframe testuali

### G1 — Web chat ospite (`/c/[property]`)

```
┌──────────────────────────────────────────────┐
│  🏠 B&B Il Giardino          [🌐 IT ▾]      │
├──────────────────────────────────────────────┤
│                                              │
│  ● AI  Benvenuto! Sono l'assistente del      │
│        B&B Il Giardino. Posso darti info     │
│        o un preventivo per il tuo soggiorno. │
│                                              │
│                 C'è il parcheggio?  Ospite ● │
│                                              │
│  ● AI  Sì, parcheggio interno gratuito,      │
│        accesso da via Roma 12. [da KB]       │
│                                              │
│            Avete posto 20–23 luglio          │
│            per 2 adulti e 1 bimbo? Ospite ●  │
│                                              │
│  ● AI  Controllo subito! Quanti anni ha      │
│        il bambino?                           │
│                                              │
│  ┌─ G2 · CARD PROPOSTA ─────────────────┐    │
│  │ (vedi wireframe successivo)          │    │
│  └──────────────────────────────────────┘    │
│                                              │
├──────────────────────────────────────────────┤
│ [ Scrivi un messaggio…              ] [Invia]│
│      Risposte generate con AI · Privacy      │
└──────────────────────────────────────────────┘
```

Stati particolari: indicatore "sta scrivendo…" durante lo streaming; banner discreto "Lo staff ti risponderà a breve" quando la conversazione è `pending_staff`.

### G2 — Card proposta (componente in chat)

```
┌──────────────────────────────────────────────┐
│ ✨ PROPOSTA PER IL TUO SOGGIORNO             │
│                                              │
│ 📅 20 → 23 luglio · 3 notti                  │
│ 👥 2 adulti + 1 bambino (4 anni)             │
│ 🛏  Camera Tripla "Glicine"                  │
│                                              │
│   Prezzo listino        € 360,00             │
│   Sconto diretto −10%   − € 36,00            │
│   ──────────────────────────────             │
│   TOTALE OFFERTA        € 324,00             │
│   + tassa di soggiorno  € 12,00 (in loco)    │
│                                              │
│ ⏱ Offerta valida fino a: 14 giu, 18:00       │
│ ℹ Prezzo aggiornato dalla struttura il 11/06 │
│ ⚠ La disponibilità non è ancora bloccata:    │
│   questa è una proposta indicativa.          │
│                                              │
│ [ ✅ Sono interessato ]  [ Ho una domanda ]  │
└──────────────────────────────────────────────┘
```

Dopo il click su "Sono interessato" la card mostra lo stato avanzato (es. "🔒 Disponibilità bloccata fino al 14 giu 18:00 — in attesa di pagamento").

### A1 — Login / Registrazione (`/login`)

```
┌──────────────────────────────────────────────┐
│              AI Concierge & DQ               │
│                                              │
│   Email     [........................]       │
│   Password  [........................]       │
│                                              │
│   [        Accedi        ]                   │
│   Non hai un account? → Registrati           │
│   Password dimenticata?                      │
└──────────────────────────────────────────────┘
```

### A2 — Onboarding (`/onboarding`)

```
  Step 1/3 ─ La tua attività
   Nome organizzazione  [...................]
                                   [Continua]

  Step 2/3 ─ La tua prima struttura
   Nome struttura  [.....................]
   Città [..........]  Timezone [Europe/Rome ▾]
   Lingua principale [Italiano ▾]
                          [Indietro] [Continua]

  Step 3/3 ─ Impostazioni iniziali (modificabili dopo)
   Sconto diretto      [10] %
   Blocco disponibilità [24] ore
   Supervisione proposte AI   (●) Sì  ( ) No
                          [Indietro] [Inizia 🚀]
```

### D1 — Inbox richieste (`/inbox`) — home della dashboard

```
┌─ Inbox richieste ──────────────────────────────────────────────┐
│ ⚠ Setup incompleto: manca il calendario tariffe → [Completa]   │  ← solo finché serve
│                                                                │
│ Filtri: [Stato ▾] [Source ▾] [Priorità ▾]      [🔍 cerca]      │
│ Ordina: (●) Priorità/score  ( ) Più recenti                    │
├────────────────────────────────────────────────────────────────┤
│ 🔴 87  Maria Rossi      20–23 lug · 2+1   Proposta inviata     │
│        website_chat · affidabilità ALTA   ⏱ scade tra 22h      │
├────────────────────────────────────────────────────────────────┤
│ 🟡 54  j.smith@mail.com 1–4 ago · 4       Richiesta ricevuta   │
│        manual · affidabilità MEDIA        🕐 2 min fa          │
├────────────────────────────────────────────────────────────────┤
│ 🟢 12  +39 333 1234567  12 set · 2        interessato ✋        │
│        website_chat · affidabilità BASSA  → AZIONE RICHIESTA   │
└────────────────────────────────────────────────────────────────┘
                                        [+ Nuova richiesta manuale]
```

Ogni riga: score (colore = priorità), ospite, date/ospiti, stato (chip), source, affidabilità dati, urgenza temporale. Click → D2.

### D2 — Dettaglio richiesta (`/inbox/[id]`)

```
┌─ Richiesta #BR-0042 · Maria Rossi ─────────────── score 87 🔴 ─┐
│ STATO: Proposta inviata   ⏱ offerta scade 14 giu 18:00         │
│                                                                │
│ ┌─ Dati richiesta ─────────────┐ ┌─ Proposta ────────────────┐ │
│ │ 📅 20→23 lug (3 notti)       │ │ Camera Glicine            │ │
│ │ 👥 2 adulti + 1 bimbo (4)    │ │ 3 notti × €120 = €360     │ │
│ │ 🌐 italiano                  │ │ Sconto −10%:    −€36      │ │
│ │ 📱 website_chat              │ │ TOTALE:         €324      │ │
│ │ ✎ Richieste speciali: culla  │ │ Tassa sogg.:    €12       │ │
│ │ Affidabilità dati: ALTA      │ │ [dettaglio per notte ▾]   │ │
│ └──────────────────────────────┘ │ ─────────────────────────  │ │
│                                  │ Fonte prezzo: manuale      │ │
│                                  │ Tariffe agg.: 2 giorni fa ⚠│ │
│                                  │ [✎ Modifica prezzo/offerta]│ │
│                                  └───────────────────────────┘ │
│                                                                │
│ AZIONI (per stato corrente):                                   │
│ [✋ Segna interessato] [🔒 Blocca disponibilità] [✖ Rifiuta]    │
│                                                                │
│ ┌─ Timeline (audit) ───────────────────────────────────────┐   │
│ │ 13/06 14:02  system  received → proposal_sent              │  │
│ │ 13/06 14:02  AI      classificazione (audit ▾)            │  │
│ │ 13/06 14:01  guest   richiesta creata via website_chat    │  │
│ └──────────────────────────────────────────────────────────┘   │
│ ┌─ Score (trasparenza) ────────┐  💬 Vai alla conversazione →  │
│ │ +30 risposta ricevuta        │                               │
│ │ +25 date alta stagione       │                               │
│ └──────────────────────────────┘                               │
└────────────────────────────────────────────────────────────────┘
```

Le azioni mostrate dipendono dallo stato (macchina a stati): es. in `awaiting_payment` compaiono [💰 Pagamento ricevuto → Conferma] e il countdown hold. Con `supervision_mode` ON e proposta non ancora inviata: anteprima messaggio editabile + [📤 Invia proposta].

### D3 — Conversazioni (`/conversations`)

```
┌─ Conversazioni ────────────────────────────────────────────────┐
│ Filtri: [Stato ▾] [Source ▾]                                   │
├────────────────────────────────────────────────────────────────┤
│ ✋ Maria Rossi       website_chat   In attesa staff   2 min     │
│    "L'AI non sa se accettate animali di grossa taglia…"        │
├────────────────────────────────────────────────────────────────┤
│ ● j.smith@mail.com  website_chat   aperta            1 h       │
│    Ultimo: AI → "Your offer is valid until…"   [BR-0043 →]     │
├────────────────────────────────────────────────────────────────┤
│ ○ +39 333 1234567   manual         chiusa            ieri      │
└────────────────────────────────────────────────────────────────┘
```

### D4 — Dettaglio conversazione (`/conversations/[id]`)

```
┌─ Maria Rossi · website_chat · In attesa staff ──────────────────┐
│ 🔗 Richiesta collegata: BR-0042 (Proposta inviata) →            │
├─────────────────────────────────────────────────────────────────┤
│  Ospite  Accettate animali di grossa taglia?                    │
│  AI      Non ho informazioni precise, chiedo allo staff. ⚠      │
│          [escalation: KB senza risposta]                        │
├─────────────────────────────────────────────────────────────────┤
│ Rispondi come STAFF:                                            │
│ [ Sì, accettiamo cani fino a 30kg con supplemento…    ] [Invia] │
│ [✓ Chiudi conversazione]  [↩ Restituisci all'AI]                │
└─────────────────────────────────────────────────────────────────┘
```

(Fase 2: da qui "Salva risposta in KB" → `kb_suggestions`.)

### D5 — Calendario tariffe (`/calendar`)

```
┌─ Calendario tariffe · luglio 2026 ──────── [‹] [oggi] [›] ─────┐
│ Camera: [Tutte ▾]      [⬆ Importa CSV] [🔄 Feed iCal] [Aiuto]  │
├─────────────────────────────────────────────────────────────────┤
│           lun 20   mar 21   mer 22   gio 23   ven 24   sab 25   │
│ Glicine   €120 ✓   €120 ✓   €120 ✓   €120 ✓   €140 ✓   €140 ✕  │
│ Rosa      €95  ✓   €95  ✓   —  ⚠    €95  ✓   €110 ✓   €110 ✓  │
│           (✓ disponibile · ✕ occupato · — prezzo mancante)      │
├─────────────────────────────────────────────────────────────────┤
│ Selezione multipla → [Prezzo €__] [Disponibile ▾] [Min stay __] │
│ Ultimo aggiornamento prezzi: 2 giorni fa → freshness MEDIA ⚠    │
└─────────────────────────────────────────────────────────────────┘
```

Modale "Feed iCal": lista feed per camera (url, ultimo sync, stato, attivo on/off) + [Aggiungi feed]. Solo disponibilità, mai prezzi.

### D6 — Camere (`/rooms`)

```
┌─ Camere ───────────────────────────────────────────┐
│ [+ Nuova camera]                                   │
│ ≡ Glicine   max 3 ospiti   "Tripla con balcone…"  ✎│
│ ≡ Rosa      max 2 ospiti   "Matrimoniale…"        ✎│
└────────────────────────────────────────────────────┘
```

Editor inline/modale: nome, max ospiti, descrizione, ordinamento (drag ≡).

### D7 — Knowledge base (`/knowledge`)

> Specifica completa del sistema di conoscenza: [Property Knowledge System](property-knowledge-system.md). In sintesi per la UI: categorie standard proposte dall'editor (tag fissi + liberi), **coverage score** visibile in testata, avviso anti-numeri nel testo ("questo dato vive nelle Impostazioni"), review reminder sugli asset vecchi, gap report come to-do di scrittura.

```
┌─ Knowledge base ───────────────────────────────────────────────┐
│ [+ Nuovo contenuto ▾ (FAQ / Policy / Procedura / PDF / Brochure)]│
│ Filtri: [Tipo ▾] [Lingua ▾] [solo attivi ✓]    [🔍 cerca]      │
├─────────────────────────────────────────────────────────────────┤
│ ⭐100 FAQ   "Animali ammessi?"        it,en   ✓ concierge   ✎   │
│ ⭐50  Policy "Cancellazione"          it      ✓ concierge   ✎   │
│ ⭐0   PDF   "Brochure 2026" 📎        it      ✓ allegabile  ✎   │
│ ⊘    FAQ   "Vecchi orari" (superata da ↑)                  ▾   │
├─────────────────────────────────────────────────────────────────┤
│ Editor: Titolo [...] Tipo [FAQ ▾] Lingue [it ✓ en ✓]            │
│ Contenuto [..................................................] │
│ □ Usabile dal concierge  □ Allegabile  File [⬆ carica]          │
│ Versioni: v3 (oggi) · v2 · v1 [ripristina]      [Salva]         │
└─────────────────────────────────────────────────────────────────┘
```

⭐ = priorità di retrieval (origin: import 0 / manuale 50 / correzione 100), mostrata come badge non editabile direttamente.

### D8 — Template messaggi (`/templates`)

```
┌─ Template ─────────────────────────────────────────────────────┐
│ [Globali (default)] [Personalizzati]            [+ Nuovo]      │
├─────────────────────────────────────────────────────────────────┤
│ proposta_disponibile     email  it,en   —        [Personalizza]│
│ proposta_disponibile_ota web    it      🛡 OTA    [Personalizza]│
│ reminder_offerta         email  it      —        ✎             │
├─────────────────────────────────────────────────────────────────┤
│ Editor: Codice [reminder_offerta] Canale [email ▾] Lingua [it ▾]│
│ □ Sicuro per OTA (no IBAN, no link diretti) 🛡                  │
│ Oggetto [.....................]                                 │
│ Corpo   [Gentile {{guest_name}}, la tua offerta da             │
│          {{totale_offerta}} scade il {{scadenza}}…]             │
│ Variabili: {{guest_name}} {{check_in}} {{totale_offerta}} …     │
│ [Anteprima con dati di esempio]                    [Salva]      │
└─────────────────────────────────────────────────────────────────┘
```

### D9 — Follow-up (`/followups`)

```
┌─ Follow-up automatici ─────────────────────────────────────────┐
│ REGOLE                                  [+ Nuova regola]       │
│ ✓ Quando "proposal_sent" +24h → reminder_offerta               │
│   (solo se nessuna risposta)                              ✎    │
│ ✓ Quando "confirmed" +0h → istruzioni_checkin             ✎    │
├─────────────────────────────────────────────────────────────────┤
│ CODA PROSSIMI INVII                                             │
│ 14/06 14:02  BR-0042  reminder_offerta   pending   [annulla]   │
│ 13/06 18:00  BR-0040  istruzioni_checkin done ✓                │
└─────────────────────────────────────────────────────────────────┘
```

### D10 — Impostazioni property (`/settings/property`)

```
┌─ Impostazioni struttura ───────────────────────────────────────┐
│ ANAGRAFICA   Nome [...] Indirizzo [...] Città [...]            │
│              Timezone [▾] Lingua default [▾]                   │
│ COMMERCIALE  Sconto diretto [10]%  · Tassa soggiorno [€ 2,00]  │
│              Hold disponibilità [24] h · Validità offerta [48]h│
│              IBAN/istruzioni pagamento [................]      │
│              Disclaimer proposta [..........................]  │
│ AFFIDABILITÀ Freshness ALTA < [6] h · MEDIA < [48] h           │
│ AI           Supervisione proposte (●) ON ( ) OFF              │
│              Apprendimento KB [assisted ▾]  (Fase 2)           │
│ PROTEZIONI   Budget AI giornaliero [€ 5,00]                    │
│              Soglia costo per conversazione [€ 0,50]           │
│              🛟 SAFE MODE (solo FAQ e template, niente AI)      │
│                 ( ) OFF (●) — si attiva da solo a budget 100%  │
│ WEB CHAT     Link: https://…/c/il-giardino  [copia] [QR ⬇]     │
│                                                  [Salva]       │
└─────────────────────────────────────────────────────────────────┘
```

### D11 — Organizzazione e membri (`/settings/organization`)

```
┌─ Organizzazione ───────────────────────────────────────────────┐
│ Nome [Demo Organization]                          [Salva]      │
│ STRUTTURE   Struttura Demo A (Firenze) ✎   [+ Nuova struttura] │
│ MEMBRI                                     [+ Invita membro]   │
│ jacopo@…   owner    (tu)                                       │
│ staff@…    staff ▾  [rimuovi]                                  │
│ ⓘ Nell'MVP tutti i membri hanno gli stessi permessi;           │
│   i ruoli diventeranno vincolanti in una fase successiva.      │
└─────────────────────────────────────────────────────────────────┘
```

### D12 — AI, costi e protezioni (`/settings/ai`)

```
┌─ AI, costi e protezioni ───────────────────────────────────────┐
│ OGGI    Budget: €5,00 · Speso: €3,90  [████████░░] 78% ⚠       │
│         Risposte knowledge-first (senza AI): 41%               │
│                                                                │
│ 30 GIORNI  Chiamate: 1.240 · Errori: 3 · Latenza media: 1,8s   │
│            Token in/out: 2,1M / 310K → costo stimato: € 9,40   │
│            Per funzione: generate_reply 61% · classify 22% ·   │
│            extract 17%                                         │
│                                                                │
│ AVVISI RECENTI                                                 │
│ ⚠ 13/06 11:40  Budget all'80% — avviso inviato via email       │
│ 🚨 12/06 23:10  Traffico anomalo: 14 conversazioni dallo       │
│                 stesso IP in 1h → rate limit applicato         │
│ ⚠ 12/06 18:22  Conversazione #c-0917 oltre soglia (€0,61)      │
│                                                                │
│ [Ultime 50 chiamate AI ▾] [Eventi di protezione ▾] [Export CSV]│
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Priorità: MVP vs Post-MVP

### Dentro l'MVP (P0 = indispensabile, P1 = necessario ma può essere essenziale)

Il criterio di priorità riflette la gerarchia strategica: il flusso prenotazione viene prima di tutto il resto.

| Schermata / elemento | Priorità | Fase | Note di taglio |
|---|---|---|---|
| A1 Login, A2 Onboarding | **P0** | 1a ✅ | Onboarding può essere form unico invece di wizard |
| D5 Calendario tariffe (editing manuale) | **P0** | 1a ✅ | Senza tariffe niente proposte |
| D6 Camere | **P0** | 1a ✅ | CRUD minimo |
| D7 Knowledge base (testo) | **P0 infrastruttura** | 1a ✅ | CRUD operativo. Non è una feature utente finale ma il substrato dell'AI; upload PDF: P1 |
| **D1 Inbox richieste** | **P0 critico** | 1b | Home del prodotto e home operativa del gestore. Con checklist setup integrata |
| **D2 Dettaglio richiesta** (macchina a stati + azioni + timeline) | **P0 critico** | 1b | Cuore del Direct Quote. Le azioni di stato non si tagliano; la timeline può essere collassata |
| D10 Impostazioni property | **P0** | 1b | Senza sconto/hold/pagamento il flusso non chiude |
| G1 Web chat + G2 card proposta | **P0** | 1c | Canale di acquisizione principale; nessun taglio |
| D3/D4 Conversazioni + risposta staff | **P1** | 1c | L'escalation è promessa dell'MVP; UI può essere spartana |
| D5 Import CSV + feed iCal | **P1** | 1c | Slittati da 1a; non bloccanti per il primo flusso prenotazione |
| D8 Template (personalizzazione) | **P1** | 1d | All'inizio bastano i template globali in sola lettura |
| D9 Follow-up | **P1** | 1d | Regole default precaricate; editor può arrivare a fine fase |
| D11 Org e membri | **P1** | 1d | All'inizio basta il solo owner; inviti a fine fase |
| D12 AI e costi | **P1** | 1d | Anche solo contatori aggregati |
| D13 Analytics KPI | **P1** | 1d | Ultima schermata da costruire; indispensabile per la chiusura del pilot |

### Post-MVP (Fase 2–3) — fuori da questo piano UI

| Elemento | Fase |
|---|---|
| Inbox unificata multicanale (WhatsApp, email) + presa in carico (`assigned_to`) | 2 |
| KB strutturata: coverage score, gap report, 9 domande d'oro, auto-learning end-to-end | 2 |
| Coda revisione KB auto-learning (`kb_suggestions`: proposta → approva/rifiuta) | 2 |
| "Salva risposta in KB" da D4 | 2 |
| Pagina proposta dedicata per l'ospite (link fuori dalla chat) | 2 |
| Revenue Assistant (analisi competitor, suggerimenti tariffari, alert prezzi) | 3 |
| Canali OTA/social in D1/D3 (filtri già predisposti via `source_category`) | 3 |
| Analytics avanzate (conversione proposta→confermata, valore prenotazioni dirette) | 3 |
| Billing, piani, onboarding self-service completo | 3 |
| Permessi UI differenziati per ruolo | 3 |

### Criterio guida

Il percorso che deve essere impeccabile è **uno solo**: *richiesta → proposta con prezzo calcolato → interessato → blocco → pagamento → confermata*, con il gestore che capisce sempre "cosa devo fare adesso" da D1 e può eseguire l'azione corretta da D2. Tutto il resto (chat AI, template, CSV, iCal, statistiche) serve questo percorso.
---

## 7. Approfondimento: il flusso che genera prenotazioni

`richiesta → conversazione → proposta → follow-up → conferma`. Per ogni fase: le due esperienze, le schermate, cosa si legge e si scrive, gli automatismi, i trigger AI e i casi di errore.

> **Prerequisito (§9)**: questo flusso vale solo per le conversazioni con intent `booking`. L'intent detection avviene in Fase A/B, prima di qualsiasi estrazione o preventivo; gli altri intent seguono gli instradamenti di §9.1.

### Fase A — Richiesta (l'ospite arriva e scrive)

| Dimensione | Dettaglio |
|---|---|
| **Esperienza ospite** | Apre link/QR → benvenuto nella lingua del browser, disclaimer, input libero. Scrive il primo messaggio. Nessun login, nessun form. |
| **Esperienza gestore** | Passiva: la conversazione compare in D3 in tempo reale. Nessuna azione richiesta. |
| **Schermate** | G1 (chat) · D3 (lista, realtime) |
| **Letture DB** | `properties` (slug→property, lingua, disclaimer, `settings`, safe mode, budget residuo) · conversazione esistente per la sessione browser |
| **Scritture DB** | `conversations` (insert: `source='website_chat'`, `language`) · `messages` (insert: `direction='in'`, `sender='guest'`) |
| **Eventi automatici** | Aggiornamento contatori anti-abuse (IP, sessione) — vedi §8 |
| **Trigger AI** | Nessuno diretto: il primo messaggio entra nella pipeline knowledge-first (§8); l'AI (`classify`, Haiku) parte solo se i livelli senza AI non bastano |
| **Casi di errore** | Property inesistente/disattivata → pagina cortese "struttura non disponibile" · rate limit IP superato → messaggio statico, niente insert · messaggio oltre lunghezza max → errore inline nell'input, nessuna chiamata · safe mode attivo → banner + solo risposte FAQ/template |

### Fase B — Conversazione (Q&A e raccolta dati)

| Dimensione | Dettaglio |
|---|---|
| **Esperienza ospite** | Domande libere, risposte in streaming in pochi secondi. Se chiede disponibilità, l'AI raccoglie i dati mancanti (date, ospiti, età bambini) in modo conversazionale. Se l'AI non sa rispondere: "Chiedo allo staff, ti risponderanno qui". |
| **Esperienza gestore** | Osserva in D3/D4 (facoltativo). Se scatta l'escalation: badge su Conversazioni + notifica → risponde come staff da D4. |
| **Schermate** | G1 · D3/D4 |
| **Letture DB** | `knowledge_assets` (prima via FTS `idx_ka_fts`, poi nel prompt: filtrati per property, `usable_by_concierge`, ordinati per priority/recency) · `messages` (storico thread) · `properties.settings` |
| **Scritture DB** | `messages` (out, `sender='ai'`, `ai_call_id`) · `ai_calls` (ogni chiamata: function, modello, token, latenza) · `conversations.status='pending_staff'` se escalation |
| **Eventi automatici** | Escalation automatica quando l'AI dichiara di non sapere o l'ospite chiede un umano · aggiornamento contatori costo/messaggi per conversazione |
| **Trigger AI** | Pipeline: ① match deterministico (bottoni/intenti strutturati, zero AI) → ② FTS sulla KB ad alta confidenza (risposta da KB, zero AI) → ③ `classify` (Haiku) → ④ `generate_reply` (Sonnet, KB nel prompt con caching) |
| **Casi di errore** | Provider AI giù/timeout → messaggio template "ti rispondiamo a breve" + escalation, `ai_calls.success=false` · budget giornaliero esaurito → safe mode automatico (§8) · limite messaggi/sessione raggiunto → invito a lasciare un contatto + escalation · domanda fuori perimetro (non pertinente alla struttura) → risposta di cortesia template, zero AI ulteriore |

### Fase C — Proposta (estrazione → calcolo → invio)

| Dimensione | Dettaglio |
|---|---|
| **Esperienza ospite** | Riceve la card proposta (G2): camere, notti, listino, sconto diretto, totale, tassa, validità, disclaimer affidabilità. CTA: [Sono interessato] / [Ho una domanda]. Prima della card l'AI chiede nome/contatto se mancanti. |
| **Esperienza gestore** | `supervision_mode` ON: la proposta appare in D2 come bozza editabile → [Invia proposta]. OFF: riceve solo la notifica "proposta inviata". In entrambi i casi la richiesta è in D1 con score e priorità. **Il prezzo è uno snapshot operativo, non un listino**: D2 mostra sempre fonte prezzo, ultimo aggiornamento tariffe e affidabilità, e lo staff può modificare prezzo/sconto/offerta con [✎ Modifica prezzo/offerta] in qualsiasi momento prima del blocco camera (override tracciato in timeline). |
| **Schermate** | G2 · D2 · D1 |
| **Letture DB** | `rate_calendar` (prezzi/disponibilità/min_stay per range e camere) · `rooms` (capienza vs ospiti) · `properties.settings` (sconto, tassa, validità offerta, disclaimer) · `templates` (`proposta_disponibile`, lingua/canale; per OTA solo `ota_safe`) |
| **Scritture DB** | `booking_requests` (insert: date, ospiti, `children` jsonb, `ai_classification`, `data_reliability` da freshness, prezzi in cents, `offer_expires_at`) · `booking_request_items` (snapshot prezzo per camera/notte) · `booking_request_events` (`received`→`proposal_sent`, actor system o staff) · `scoring_events` + `lead_score` · `messages` (card) · `ai_calls` (`extract`) · `conversations.booking_request_id` |
| **Eventi automatici** | Materializzazione follow-up: `followup_rules` con trigger `'proposal_sent'` → `followup_jobs` schedulati · notifica al gestore |
| **Trigger AI** | `extract` (Haiku, structured output: date/ospiti/lingua) · eventuale `select_template` (Haiku). **Il prezzo non è mai generato dall'AI**: calcolo deterministico da `rate_calendar` |
| **Casi di errore** | Date non disponibili → messaggio template + proposta di contatto staff (stato resta `'received'`) · prezzi mancanti nel range → `data_reliability='low'`: con supervision ON va in bozza per lo staff, OFF → escalation invece di proposta sbagliata · capienza insufficiente → l'AI lo spiega e suggerisce di contattare lo staff · estrazione incerta → l'AI ri-chiede i dati (mai inventare date) · tariffe stantie (oltre soglia freshness) → disclaimer rafforzato in card + warning in D2 |

### Fase D — Follow-up (reminder, interesse, blocco, pagamento)

| Dimensione | Dettaglio |
|---|---|
| **Esperienza ospite** | Se non risponde: reminder gentile prima della scadenza. Click [Sono interessato] → conferma immediata in chat ("lo staff verifica e blocca per te"). Poi: istruzioni di pagamento con countdown hold 24h. La card G2 aggiorna lo stato a ogni passaggio. |
| **Esperienza gestore** | Notifica "interessato" → D2: [Verifica] → [Blocca disponibilità] → [Richiedi pagamento]. D1 ordina per urgenza (hold in scadenza in alto). D9 mostra la coda invii programmati. |
| **Schermate** | G1/G2 (stato card) · D1 · D2 · D9 |
| **Letture DB** | `followup_jobs` pending scaduti (cron, indice parziale `idx_followup_jobs_due`) · `booking_requests` con `offer_expires_at`/`hold_expires_at` scaduti (indici parziali dedicati) · `followup_rules.conditions` (es. solo_se_nessuna_risposta) · `templates` |
| **Scritture DB** | `followup_jobs` (`done`/`failed`, `executed_at`, `result`) · `messages` (out, reminder/istruzioni) · `booking_requests.status` (`'interested'`→`'to_verify'`→`'availability_blocked'`→`'awaiting_payment'`, `hold_expires_at`) · `booking_request_events` (ogni transizione, actor guest/staff/system) · `scoring_events` (es. `click_interested` +30) · opzionale `rate_calendar.available=0` sulle notti bloccate (`source='manual'`) |
| **Eventi automatici** | Cron: reminder offerta · scadenza offerta → `'expired'` · scadenza hold → `'expired'` + eventuale sblocco disponibilità + notifica · sospensione follow-up se conversazione `'pending_staff'` |
| **Trigger AI** | **Nessuno di default** (fase interamente template-driven, coerente col principio knowledge-first). Solo se l'ospite risponde con una nuova domanda si rientra in Fase B |
| **Casi di errore** | Invio fallito → `followup_jobs.status='failed'` + retry singolo + alert gestore · template mancante per la lingua → fallback lingua default property · ospite chiede modifica date dopo il blocco → escalation a staff (mai gestita in autonomia dall'AI) · doppio click "interessato" → idempotente (transizione già avvenuta, nessun doppio evento) |

### Fase E — Conferma

| Dimensione | Dettaglio |
|---|---|
| **Esperienza ospite** | Messaggio di conferma con riepilogo soggiorno. A seguire i follow-up post-conferma (es. istruzioni check-in a −2 giorni). |
| **Esperienza gestore** | Verificato il pagamento (bonifico in MVP): D2 → [💰 Pagamento ricevuto → Conferma]. La richiesta esce dalle "da gestire" e resta consultabile (filtro stato). |
| **Schermate** | D2 · G1/G2 (card "✅ Confermata") |
| **Letture DB** | `booking_requests` (stato corrente, idempotenza transizione) · `templates` (`conferma`, `istruzioni_checkin`) |
| **Scritture DB** | `booking_requests` (`status='confirmed'`, `payment_received_at`) · `booking_request_events` (actor staff) · `followup_jobs` (post-conferma da rules con trigger `'confirmed'`) · `messages` (out conferma) |
| **Eventi automatici** | Sequenza post-conferma schedulata · (Fase 2 prodotto: aggiornamento metriche conversione) |
| **Trigger AI** | Nessuno (template). In Fase 2: `distill_kb` se la conversazione ha generato correzioni/gap |
| **Casi di errore** | Pagamento arrivato dopo la scadenza hold (stato già `'expired'`) → lo staff riapre con azione esplicita tracciata in `booking_request_events` (nota obbligatoria) · conflitto disponibilità rilevato dal sync iCal prima della conferma → warning bloccante in D2 · click doppio su Conferma → idempotente |

---

## 8. Cost Control & Anti Abuse

Principio: **knowledge-first — l'AI è l'ultima risorsa, non la prima**. Ogni messaggio attraversa livelli a costo zero prima di toccare un modello; ogni chiamata è budgetata, loggata e interrompibile. Dettaglio tecnico nel [dev-plan §7](dev-plan.md); qui l'impatto su UX e schermate.

### 8.1 Pipeline knowledge-first (per ogni messaggio ospite)

```
Messaggio ospite
  │
  ① Guard-rail input (zero AI): lunghezza max, rate limit IP,
  │  limite messaggi/sessione, safe mode check
  │
  ② Intenti deterministici (zero AI): click su bottoni (es. "Sono
  │  interessato"), comandi riconoscibili → azione diretta + template
  │
  ③ Match KB via full-text search (zero AI): se una FAQ risponde con
  │  alta confidenza → risposta dalla KB / template
  │
  ④ Solo ora: AI — classify (Haiku) → extract (Haiku) /
     generate_reply (Sonnet con KB cached)
```

Target dichiarato in D12: % di risposte servite senza AI (atteso 30–50% a regime con una KB curata).

### 8.2 Limiti attivi (default, configurabili per property)

| Limite | Default | Comportamento al superamento (fallback senza AI) |
|---|---|---|
| Lunghezza messaggio | 1.000 caratteri | Errore inline nell'input, nessuna chiamata |
| Rate limit per IP | 20 msg/min · 5 nuove conversazioni/h | Messaggio statico "troppe richieste, riprova tra poco" |
| Messaggi per sessione | 30 / conversazione / giorno | Template: "per proseguire lascia un contatto, ti risponde lo staff" + escalation |
| Costo per conversazione | € 0,50 | Stop AI sul thread → solo FAQ/template + escalation; alert al gestore |
| **Budget AI giornaliero per property** | € 5,00 | All'80%: alert · al 100%: **safe mode automatico** fino a mezzanotte (timezone property) |

### 8.3 Safe mode

- **Attivazione**: manuale (toggle in D10) o automatica (budget esaurito, possibile uso in caso di attacco).
- **Comportamento chat**: nessuna chiamata AI. Risposte solo da match FAQ e template; per le richieste di disponibilità raccolta dati guidata (bottoni/domande fisse) → `booking_request` creata per gestione manuale dello staff. Banner trasparente per l'ospite: "Assistente in modalità ridotta — lo staff ti risponderà al più presto".
- **Disattivazione**: manuale, o automatica a mezzanotte se era scattato il budget.

### 8.4 Alert automatici al gestore (email + banner in D1)

| Evento | Soglia |
|---|---|
| Budget giornaliero | 80% raggiunto (e di nuovo al 100% con ingresso in safe mode) |
| Traffico anomalo | es. conversazioni/ora > 3× la media mobile 7 giorni, o N conversazioni dallo stesso IP in 1h |
| Conversazione fuori soglia | costo AI > € 0,50 o > 40 messaggi su un singolo thread |

### 8.5 Log e report

- `ai_calls`: già nello schema — ogni chiamata con function, provider, modello, token, latenza, esito → costi esatti per giorno/funzione/property.
- **Eventi di protezione** (rate limit scattati, soglie superate, ingressi/uscite safe mode, anomalie): log dedicato consultabile da D12 ed esportabile CSV (tabella in migrazione futura, vedi dev-plan §10).
- D12 è la vista unica: budget del giorno con barra, % knowledge-first, avvisi recenti, ultime chiamate, export.

### 8.6 Impatto sulle schermate

| Schermata | Aggiunta |
|---|---|
| G1 | Banner stato ridotto (safe mode / limite sessione raggiunto); messaggi statici per rate limit |
| D1 | Banner alert (budget 80%/100%, traffico anomalo) con link a D12 |
| D10 | Sezione "Protezioni": budget giornaliero, soglia per conversazione, toggle safe mode |
| D12 | Rinominata "AI, costi e protezioni": budget bar, % knowledge-first, avvisi recenti, eventi di protezione, export |

---

## 9. Intent detection e Inbox per categoria

Ogni conversazione viene classificata **prima** di qualsiasi elaborazione (dettaglio tecnico: [dev-plan §7.1-bis](dev-plan.md)). Per la UX vale una regola sola: **non tutto è una prenotazione** — solo l'intent `booking` entra nel Direct Quote, e il gestore vede ogni categoria nel posto giusto.

### 9.1 Effetto sugli instradamenti (lato ospite, G1)

| Intent | Cosa vede l'ospite/mittente |
|---|---|
| Prenotazione | Flusso normale: raccolta dati → card proposta (G2) |
| FAQ | Risposta dalla KB in secondi |
| Assistenza ospite | Risposta KB o "lo staff ti risponde a breve" (con priorità) |
| Partnership / Agenzie | Ack cortese: "Grazie, inoltriamo al responsabile — ti ricontatterà" |
| Commerciale | Ack breve o nessuna risposta (configurabile per property) |
| Interesse prodotto / Gestore | Ack dedicato: "Grazie dell'interesse per AI Concierge! Ti lasciamo il contatto del nostro team: …" (+ link prodotto) |
| Spam | Nessuna risposta |
| Non classificato | Domanda di chiarimento con quick reply: [🛏 Vorrei un preventivo] [ℹ Ho una domanda] [📞 Sono già ospite] |

### 9.2 Inbox per categoria (estensione di D3)

La vista Conversazioni guadagna **tab per categoria con conteggi separati**; la Inbox richieste (D1) resta per definizione solo `booking`.

```
┌─ Conversazioni ────────────────────────────────────────────────┐
│ [Tutte (24)] [🛏 Prenotazioni (8)] [🧳 Ospiti (4)]              │
│ [🤝 Partnership (2)] [📢 Commerciale (3)] [🚀 Lead SaaS (1)]    │
│ [🚫 Spam (6)]                                                  │
├────────────────────────────────────────────────────────────────┤
│ … lista filtrata per la tab attiva …                           │
│                                                                │
│ Tab Partnership/Commerciale: righe con [Rispondi] [Archivia]   │
│ Tab Lead SaaS: righe con badge PRIORITÀ ALTA, [Rispondi]       │
│   [Segna gestito] — notifica già inoltrata al team piattaforma │
│ Tab Spam: righe attenuate con [Ripristina] [🚫 Blocca IP]      │
└────────────────────────────────────────────────────────────────┘
```

- **Badge sidebar/bottom-nav**: il conteggio di "Conversazioni" resta legato alle sole conversazioni che richiedono lo staff (`pending_staff` + partnership da valutare + **lead SaaS non gestiti**), non allo spam.
- **Riclassificazione manuale**: in D4 il gestore può correggere l'intent da un menu ("In realtà è… → Prenotazione") — il cambio a `booking` avvia il flusso preventivo; la correzione alimenta il miglioramento del classificatore (Fase 2, `kb_suggestions`-like).
- **Tab Spam**: consultabile ma fuori dai flussi; azioni Ripristina (riclassifica) e Blocca IP (con conferma; logga `ip_blocked`).
- **D12**: nuovo riquadro "Intent (ultimi 30 giorni)": distribuzione per categoria, % spam respinto senza AI, tasso `unclassified` (se alto, la classificazione va rivista).

### 9.3 Integrazione con Cost Control & Anti Abuse (§8)

| Protezione | Comportamento |
|---|---|
| Rate limit | Applicato **prima** della classificazione: lo spam massivo non arriva mai all'AI |
| Blocco IP sospetti | Automatico oltre soglia spam/h dallo stesso IP (24h) o manuale dalla tab Spam; logga `ip_blocked` |
| Contatore richieste anomale | Per property/IP/intent: picchi di spam, di `unclassified` o di nuove conversazioni |
| Alert allo staff | Email + banner D1: picco spam, IP bloccato, tasso non classificato anomalo |
| Log eventi | `guardrail_events`: `spam_detected`, `ip_blocked`, `intent_unclassified_loop` — consultabili da D12 con export |

Principio di costo: `spam` muore sulle euristiche deterministiche (zero token), `partnership`/`vendor`/`saas_lead`/`unclassified` costano al più una classify Haiku + template (zero AI generativa) — coerente con la pipeline knowledge-first di §8.1.

> **Nota su Lead SaaS**: non confondere con Partnership (chi vuole collaborare **con la struttura**) né con Commerciale (chi vuole vendere **alla struttura**) — il lead SaaS vuole **comprare il nostro software**. In dubbio, il classificatore preferisce `saas_lead`: un falso positivo costa un ack di troppo, un lead perso costa un cliente (dettaglio nel [dev-plan §7.1-bis](dev-plan.md)).

---

## 10. Flusso conversazionale completo: "Buongiorno, avete disponibilità?" → prenotazione

Progettazione end-to-end della conversazione ospite (web chat e WhatsApp — stesso motore, vedi nota §10.9). Specifiche tecniche nel [dev-plan §7-bis](dev-plan.md). **Tutti i testi seguono la [LunArt Voice](lunart-voice.md)**: professionale e cordiale, zero emoji salvo rare eccezioni di mirroring, ogni messaggio chiude con un solo passo avanti.

### 10.1 Fasi della conversazione

| # | Fase | Obiettivo | Comportamento AI |
|---|---|---|---|
| 1 | **Saluto** | Accogliere e classificare (intent §9) | Risposta immediata, calda, nella lingua rilevata; mai un muro di domande: una sola domanda di apertura |
| 2 | **Raccolta dati mancanti** (slot filling) | Completare i dati obbligatori (§10.2) | Max 2 domande per messaggio; mai ridomandare dati già forniti; parsing tollerante ("il 20", "questo weekend") con conferma esplicita se ambiguo |
| 3 | **Verifica disponibilità** | Trovare camere e prezzo | **Zero AI**: motore preventivo su `rate_calendar`; l'AI comunica solo l'esito |
| 4 | **Proposta** | Card G2 con prezzo, sconto vs OTA, scadenza, affidabilità | Se affidabilità non Alta o supervision ON → bozza per lo staff, l'ospite riceve "verifichiamo e ti confermiamo a breve" |
| 5 | **Gestione obiezioni** | Trattenere il lead senza improvvisare | Prezzo ("su Booking costa meno") → confronto trasparente con la card; sconti oltre il configurato → **mai**: passa allo staff. Date non disponibili → propone alternative vicine (da motore). Domande servizi → KB |
| 6 | **Follow-up** | Riattivare chi non risponde | Cadenza 1h/24h/72h (§10.5), template, zero AI |
| 7 | **Conferma** | Chiudere: interesse → hold → pagamento → conferma | Stati e card aggiornata (§7 Fasi D–E); post-conferma: istruzioni check-in |
| 8 | **Passaggio allo staff** | Uscita sicura in qualsiasi momento | Trigger di escalation (§10.4): messaggio di cortesia + `conversations.status='pending_staff'` + notifica con contesto completo |

**Dialogo di riferimento** (web chat, intent `booking` con 0 slot):

```
Ospite  Buongiorno, avete disponibilità?
AI      Buongiorno, benvenuti! Certo, la aiuto subito: per quali date cercate, e in quanti siete?
Ospite  Dal 20 al 23 luglio, 2 adulti e un bimbo
AI      Perfetto! Quanti anni ha il bimbo? Così vi propongo la sistemazione giusta.
Ospite  4 anni
AI      Grazie! Mi lascia un nome e un recapito per inviarle la proposta?    [solo web chat]
Ospite  Maria Rossi, maria.rossi@mail.com
        ── verifica disponibilità (motore, zero AI) ──
AI      [CARD PROPOSTA: Camera Glicine · 3 notti · €324 (−18% vs Booking) · valida fino al 14/06 18:00]
Ospite  Però su Booking ho visto un prezzo simile…
AI      Le confermo il confronto: stesse date su Booking ~€396, qui €324 con cancellazione
        diretta con la struttura. Se vuole verifico anche altre camere!     [obiezione: da template+dati]
        ── +1h senza risposta → reminder soft · poi 24h · 72h ──
Ospite  Sono interessato ✅
        ── staff: verifica → blocco 24h → istruzioni pagamento → conferma ──
```

### 10.2 Dati necessari per il preventivo

| Dato | Obbligatorio | Note di raccolta |
|---|---|---|
| Check-in | **Sì** | Parsing robusto; se ambiguo ("il 20") → conferma mese/anno |
| Check-out | **Sì** | In alternativa n. notti ("3 notti dal 20") |
| N. adulti | **Sì** | |
| Bambini (sì/no) | **Sì** | Se sì → età obbligatorie |
| Età bambini | **Sì se presenti** | Determinano tariffa, culla, capienza |
| Lingua | **Sì (auto)** | Rilevata, mai chiesta; cambia se l'ospite cambia lingua |
| Nome + recapito | **Sì prima della proposta** (solo web chat) | Su WhatsApp il numero c'è già: si chiede solo il nome, opzionale |
| Preferenze camera | Opzionale | Vista, piano, letti separati |
| Richieste speciali | Opzionale | Culla, animali, accessibilità, orario arrivo |
| Motivo soggiorno | Opzionale | Mai chiesto esplicitamente; se emerge → utile per scoring/escalation (evento!) |

Regola d'oro: **l'AI chiede solo ciò che manca, al massimo 2 cose per volta**, e ricapitola prima della proposta ("Riepilogo: 20→23 luglio, 2 adulti + bimbo di 4 anni, culla. Corretto?").

### 10.3 Knowledge Base — le 9 domande d'oro (risposta senza AI generativa)

Queste domande devono ricevere risposta **dal match FTS sulla KB + template, zero `generate_reply`**. Sono asset obbligatori: la checklist di onboarding (D1) non si completa finché non sono compilate tutte.

| # | Tema | Esempio asset richiesto |
|---|---|---|
| 1 | Parcheggio | Dove, costo, prenotabile |
| 2 | Orari check-in/check-out | Fasce, early/late e relative policy |
| 3 | Deposito bagagli | Sì/no, dove, orari |
| 4 | Colazione | Inclusa?, orari, intolleranze |
| 5 | Animali | Ammessi?, taglie, supplemento |
| 6 | Culla / bambini | Disponibilità, costo, età gratuità |
| 7 | Ascensore / accessibilità | Piani, barriere |
| 8 | Posizione / come arrivare | Indirizzo, mezzi, distanze |
| 9 | Politica di cancellazione | Termini per prenotazione diretta |

Se una delle 9 non ha asset → la domanda diventa **gap** (escalation + `kb_suggestions` in Fase 2) e il banner di setup la segnala.

### 10.4 Escalation — quando l'AI si ferma e chiama lo staff

| Trigger | Riconoscimento | Comportamento |
|---|---|---|
| Richiesta gruppo | > 6 ospiti o > 2 camere (soglie configurabili) | "Per i gruppi vi mettiamo in contatto con lo staff" + escalation prioritaria |
| Richiesta evento | Parole chiave (matrimonio, festa, cerimonia, meeting) | Escalation, mai preventivo automatico |
| Richieste particolari | Fuori KB e fuori policy (accessibilità specifica, late check-in oltre fascia, esigenze mediche) | Escalation con contesto |
| VIP | Ospite ricorrente riconosciuto dal contatto, soggiorno > 7 notti o valore > soglia € | Escalation "soft": la proposta parte ma lo staff è notificato per cura extra |
| Reclami | Tono negativo / parole chiave (rimborso, disservizio, recensione) | **Mai risposta generativa**: scuse template + escalation immediata prioritaria |
| Non classificato | 2 chiarimenti falliti (§9) | Escalation |
| Richiesta umano | "posso parlare con qualcuno?" | Escalation immediata, sempre rispettata |
| Pagamenti/rimborsi | Qualsiasi richiesta su denaro già versato | Solo staff |

In ogni escalation: messaggio di cortesia all'ospite, follow-up sospesi, notifica al gestore con riepilogo conversazione + dati raccolti.

### 10.5 Follow-up automatici (post-proposta)

| Quando | Messaggio (template, zero AI) | Condizione |
|---|---|---|
| **+1 ora** | Soft: "Ha avuto modo di vedere la proposta? Sono qui per qualsiasi domanda." | Solo se nessuna risposta dalla proposta |
| **+24 ore** | Leva: "La proposta è ancora valida fino a {{scadenza}}. {{#ultima_camera}}È rimasta l'ultima camera per quelle date.{{/ultima_camera}}" | Solo se ancora nessuna risposta |
| **+72 ore** | Ultimo tocco: "L'offerta sta per scadere. Vuole che verifichiamo date alternative?" → poi stop definitivo | Solo se ancora nessuna risposta; dopo, la richiesta scade naturalmente |

**Regole di stop** (qualunque follow-up si annulla se):
- l'ospite risponde qualsiasi cosa (il ciclo riparte solo da una nuova proposta);
- la richiesta avanza di stato (interessato o oltre);
- la conversazione è `pending_staff` o l'intent è stato riclassificato;
- l'ospite declina ("non mi interessa") → stato `rejected`, **stop immediato e definitivo**;
- quiet hours (22:00–08:00, timezone property): l'invio slitta alla mattina;
- massimo **3 follow-up per richiesta**, mai più di 1 al giorno;
- canali OTA: solo template `ota_safe`. WhatsApp: vedi vincolo finestra 24h in §10.9.

### 10.6 Macchina a stati della conversazione

Stati conversazionali (`stage`, persistiti — vedi dev-plan §7-bis; si affiancano allo status DB `open`/`pending_staff`/`closed`):

```
            ┌────────────────────────────────────────────────────────┐
            ▼                                                        │
 new ─► intent_pending ─► collecting_data ─► quoting ─► proposal_sent
            │                  │   ▲             │            │
            │ (altri intent    │   └─ dati       │ (no disp./ │──► negotiating ─┐
            │  → flussi §9)    │      ambigui    │  affidab.  │    (obiezioni,  │
            ▼                  │                 ▼  bassa)    │     domande)    │
        [faq/support/...]      │            handoff_staff ◄───┼─────────────────┤
                               │                 ▲            │                 │
                               ▼                 │            ▼                 ▼
                          handoff_staff ◄── (escalation da ogni stato)   follow_up (1h/24h/72h)
                                                              │                 │
                                                              ▼                 ▼
                                            booking_confirmed ◄── interested→hold→paid    expired/closed
```

| Stage | Significato | Esce verso |
|---|---|---|
| `new` | Primo messaggio ricevuto | `intent_pending` |
| `intent_pending` | Classificazione in corso (transitorio) | `collecting_data` (booking) / flussi §9 / `handoff_staff` |
| `collecting_data` | Slot filling | `quoting` (slot completi) / `handoff_staff` |
| `quoting` | Verifica disponibilità + calcolo (transitorio) | `proposal_sent` / `handoff_staff` (no disponibilità, affidabilità bassa, supervision) |
| `proposal_sent` | Card inviata | `negotiating` / `follow_up` / `booking_confirmed` |
| `negotiating` | Obiezioni e domande post-proposta | `proposal_sent` (nuova proposta) / `follow_up` / `handoff_staff` |
| `follow_up` | In attesa, reminder attivi | `negotiating` / `booking_confirmed` / `expired` |
| `handoff_staff` | Lo staff ha il controllo (= `pending_staff`) | qualsiasi (lo staff restituisce all'AI o chiude) |
| `booking_confirmed` | Richiesta confermata, conversazione in modalità post-vendita | `closed` |
| `expired` / `closed` | Offerta scaduta / conversazione chiusa | riattivabile da un nuovo messaggio ospite (`collecting_data`) |

### 10.7 Dashboard gestore per stage

| Stage | Cosa vede il gestore | Cosa può fare il gestore | Cosa può fare l'AI |
|---|---|---|---|
| `collecting_data` | Conversazione live in D3/D4, dati raccolti finora | Osservare; intervenire (presa in carico) | Chiedere i dati mancanti, rispondere FAQ |
| `quoting` | (transitorio) | — | Solo calcolo via motore; nessun prezzo generato |
| `proposal_sent` | Richiesta in D1 "In attesa dell'ospite" + card in D2 | Modificare prezzo/offerta, ritirare proposta, scrivere all'ospite | Rispondere a domande sulla proposta; follow-up programmati |
| `negotiating` | Thread con obiezione evidenziata | Autorizzare sconto extra, subentrare | Confronto OTA da dati, risposte KB; **mai** sconti non configurati |
| `follow_up` | Countdown follow-up in D2/D9 | Annullare/anticipare follow-up, subentrare | Inviare i template alle cadenze (1h/24h/72h) |
| `handoff_staff` | Badge ✋ in D3, banner in D4 con riepilogo dati + motivo escalation | Rispondere come staff, restituire all'AI, chiudere | **Nulla** (silenziata finché lo staff non restituisce) |
| `booking_confirmed` | Richiesta `confirmed` in D1, conversazione in post-vendita | Scrivere, gestire richieste post-conferma | Solo template post-conferma (istruzioni check-in) |
| `expired`/`closed` | Negli archivi/filtri | Riaprire con nota (tracciato) | Riattivarsi solo se l'ospite riscrive |

### 10.8 KPI del funnel

Misurati per property e per periodo (definizioni e fonti dati nel [dev-plan §7-bis.6](dev-plan.md)); vista dedicata in D12/analytics:

```
Richieste ricevute ─► Preventivi inviati ─► Interessati ─► Camere bloccate ─► Confermate
      120                  98 (82%)            41 (42%)        28 (68%)        22 (79%)
                                  CONVERSIONE END-TO-END: 18,3%
      Valore medio prenotazione: €286 · Valore generato: €6.292 · Commissioni OTA evitate: €1.380
```

### 10.9 Nota WhatsApp (Fase 2, progettata ora)

Stesso motore e stessi stage, con tre differenze: ① il numero è già noto (slot contatto auto-compilato); ② **finestra di servizio 24h di Meta**: oltre 24h dall'ultimo messaggio dell'ospite si può inviare solo un **template WhatsApp pre-approvato** → i follow-up +24h e +72h devono esistere anche come template Meta approvati; ③ niente card interattiva ricca: la proposta è un messaggio strutturato + bottoni quick reply nativi ("Sono interessato" / "Ho una domanda").

---

## 11. Fase finale MVP: governo commerciale, human handoff, dashboard KPI

Solo progettazione UX (specifiche in [dev-plan §7-ter](dev-plan.md)); nessun nuovo wireframe — le superfici esistenti si estendono.

### 11.1 Governo sconti e trattativa (impatto UX)

- **D10 Impostazioni → nuova sottosezione "Trattativa"**: sconto diretto standard (%), sconto extra trattabile dall'AI (%, default 5), prezzo minimo per notte (floor, opzionale), toggle "L'AI può trattare" e n. massimo concessioni (default 1). Copy guida accanto a ogni campo: la struttura deve capire che sta delegando margine.
- **D2 in `negotiating`**: il gestore vede i limiti correnti ("AI autorizzata fino a −5% extra · floor € 90/notte") e l'eventuale concessione già fatta (evidenziata in timeline con delta ceduto in €).
- **Handoff trattativa**: quando l'AI si ferma, il pulsante [Autorizza sconto] in D2 apre l'override prezzo già esistente (✎ Modifica prezzo/offerta) precompilato con la cifra chiesta dall'ospite.
- **Lato ospite (G1/G2)**: la concessione appare come aggiornamento della card proposta (nuovo totale + nuova scadenza), mai come messaggio ambiguo.

### 11.2 Human Handoff — esperienza staff

- **Mappa escalation a 4 priorità** (P1 15 min · P2 1 h · P3 4 h · P4 24 h — tabella completa nel dev-plan §7-ter.2).
- **Handoff card** in cima a D4 quando una conversazione è `pending_staff`: motivo escalation, priorità con **countdown SLA**, slot raccolti, valore e scadenze della richiesta collegata, registro (Lei/tu), ultimi 5 messaggi, azioni rapide (rispondi · autorizza sconto · blocca camera · restituisci all'AI).
- **D3/Inbox**: badge priorità (P1 rosso, P2 ambra…) e ordinamento per SLA residuo — un reclamo P1 sta sopra qualunque trattativa.
- **Notifiche**: immediata all'escalation, promemoria a metà SLA, alert ripetuto allo sforamento (loggato come `sla_breach`).

### 11.3 D13 — Dashboard KPI (`/analytics`)

Pagina a 5 blocchi, filtrabile per periodo e property; ogni blocco risponde a una domanda del gestore:

| Blocco | Domanda a cui risponde | Metriche principali |
|---|---|---|
| **Operativo** | "Stiamo rispondendo in tempo?" | Tempo prima risposta AI · richiesta→proposta · risposta staff vs SLA (% rispettati per priorità) |
| **Commerciale** | "Quanto sta fruttando?" | Valore generato · valore medio · pipeline aperta · sconto medio e margine ceduto (AI vs staff) |
| **Conversione** | "Dove perdo gli ospiti?" | Funnel a 5 step (§10.8) · conversione per canale/lingua · risposta ai follow-up per cadenza |
| **OTA vs diretto** | "Quanto sto risparmiando?" | Commissioni evitate (€) · risparmio medio ospite · quota direct vs OTA |
| **AI vs staff** | "Quanto fa da sola l'AI?" | % risolte solo AI · % knowledge-first · escalation per categoria · costo AI per conferma · conversione AI-only vs con staff |

Il funnel di §10.8 è il blocco centrale; D12 resta la vista tecnica (costi/protezioni), D13 quella di business — con link incrociati.

## Documenti correlati

- [Product Brief](product-brief.md) · [Roadmap](roadmap.md) · [Dev Plan](dev-plan.md)
- Schema database: `supabase/schema.sql`
