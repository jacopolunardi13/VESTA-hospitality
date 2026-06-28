# Vesta Hospitality — Motore Prezzi & Disponibilità (architettura definitiva)

> Documento ufficiale di riferimento. Versione 1.0 — 16/06/2026.
> Decisione architetturale approvata. Vincola tutte le fasi di sviluppo del motore prezzi/disponibilità.
> Correlati: `docs/dev-plan.md`, memoria `architecture-decisions`.

## 0. Principio fondante (invariante)
**Modello canonico interno + connettori a innesto (ports & adapters).** Il motore legge **solo** il modello canonico. Ogni fonte (PMS, Channel Manager, iCal, CSV, manuale, OTA) è un **adapter** che *scrive dentro* il canonico. → Aggiungere una fonte = nuovo adapter, **zero riscrittura del motore**. È il vincolo che impedisce il rework.

## 1. Strati
1. **Modello canonico** (verità unica): `rate_calendar` per camera/giorno — `available`, `price_cents`, restrizioni, `min_stay`, **`source`**, **`updated_at`**; + `promotions` (regole sconto); + `ota_observations` (confronto, **separato**).
2. **Registro connettori** (per property): `kind` (api/ical/csv/manual/ota_observed), config/token (mai password), stato, schedule, **room-mapping** (id esterno ↔ camera Vesta).
3. **Sync engine cloud** (pg_cron): pull → normalizza → **UPSERT** nel canonico con provenienza + timestamp.
4. **Affidabilità/freshness**: confidenza per record → valvola di sicurezza.
5. **Motore Quote/Disponibilità**: legge il canonico, applica promozioni + sconto diretto, **rispetta la disponibilità**.
6. **Layer confronto OTA**: `ota_observations`, separato, per il messaggio "il diretto conviene".

## 2. I tre livelli di integrazione (funzionano tutti, sullo stesso canonico)
| Tier | Fonte | Cosa porta | Adapter | Fedeltà |
|---|---|---|---|---|
| **1 — ideale** | API PMS / Channel Manager | disponibilità + tariffe + restrizioni (bidirezionale) | `channel_api`/`pms_api` | piena → zero-touch |
| **2 — intermedio** | iCal (disponibilità) · CSV (tariffe batch) | parziale | `ical_pull`, `csv_import` | il prezzo arriva da altra fonte |
| **3 — universale** | inserimento manuale (dashboard) | tutto, a mano | `manual` | sempre disponibile, fallback |

Una property può **mischiare** i tier (es. iCal-disponibilità + prezzi-manuali). Il motore non lo sa: legge il canonico.

## 3. Fonti prezzi, fallback e bootstrap OTA
Scala di autorevolezza del prezzo (precedenza decrescente):
1. **Override manuale staff** (sempre vince).
2. **API PMS/Channel Manager** (autoritativa).
3. **CSV PMS** (batch).
4. **Prezzi manuali aggiornati** (dashboard).
5. **Bootstrap OTA (`ota_stimato`)** — *fonte temporanea di ultima istanza.*

### 3.1 Bootstrap dal prezzo pubblico OTA (fonte temporanea)
Se **non** è disponibile alcuna fonte prezzi autoritativa (no API PMS, no CSV PMS, no prezzi manuali aggiornati), Vesta **può** usare il **prezzo pubblico OTA osservato** come **base provvisoria di bootstrap**, con queste regole non negoziabili:
- viene salvato con provenienza **`price_source = 'ota_stimato'`** e tenuto **separato** dal prezzo di vendita autoritativo;
- la base di vendita provvisoria si deriva con una **regola configurabile** (`base = ota_osservato × (1 − margine_sicurezza)`), mai cablata nel motore;
- l'**affidabilità (`data_reliability`) viene abbassata** → di conseguenza, per policy, **l'auto-invio è disabilitato** quando necessario (la proposta va in **bozza supervisionata**);
- l'osservazione OTA preferibilmente **manuale** (no scraping automatico: fragile/ToS/non scala);
- appena arriva una fonte autoritativa (manuale aggiornata / CSV / API), questa **vince** e l'osservazione OTA torna al suo ruolo originario di **solo confronto**.

In sintesi: il bootstrap OTA **sblocca un prezzo indicativo quando non c'è altro**, ma **non** abilita l'auto-invio finché l'affidabilità resta bassa — si resta in supervisione.

## 4. Pilot LunArt — come ottenere disponibilità e prezzi
- **Disponibilità:** QuoVai **iCal pull** per camera → canonico. Self-serve, nessuna partnership.
- **Prezzi:** **manuali** (calendario dashboard); QuoVai non espone tariffe via API self-serve. Affidabilità alta (staff).
- **Promozioni:** `direct_discount_pct` (+ regole opzionali poi).
- **Confronto OTA:** osservazione Booking manuale (opzionale); bootstrap OTA solo se mancano i prezzi manuali.
- **Risultato:** auto-invio già attivo per richieste standard su date coperte.

## 5. Evoluzione verso qualsiasi PMS/Channel Manager
- Ogni PMS/CM = un **adapter** sullo stesso contratto → canonico `{room, date, available, price, restrictions, source, fetched_at}`.
- **Room-mapping** per connettore.
- Onboarding: la property sceglie i propri connettori (config-driven, **nessun codice per-struttura**).
- La partnership QuoVai = **un** adapter che copre tutti i tenant QuoVai. Stesso schema per Octorate/Beds24/Smoobu/ecc.
- **Il motore non cambia mai.** Nuovo PMS = solo nuovo adapter.

## 6. PMS senza API
Scala di fallback: **API → iCal (disponibilità) + CSV (tariffe) → manuale → bootstrap OTA**.
- PMS senza API ma con export iCal → iCal per disponibilità + manuale/CSV per prezzi.
- Niente di niente → **full manuale** (dashboard); se anche i prezzi mancano → **bootstrap OTA** (§3.1), in supervisione.
- La guardia freshness garantisce che un dato vecchio **non** generi mai un auto-invio con prezzo errato.

## 7. iCal / CSV / API / manuale senza riscrivere il motore
Tutte sono **adapter** che scrivono nel canonico con `source` + affidabilità. Il motore legge **solo** il canonico → agnostico a *come* è arrivato il dato. La **precedenza** risolve i conflitti: **override manuale staff > API PMS/CM > CSV > iCal/manuale > stima OTA**. Aggiungere/togliere una fonte = config + adapter, **mai** una modifica al motore.

## 8. Ciclo di vita disponibilità & blocco camera
Flusso operativo con **blocco temporaneo della disponibilità**:

```
disponibilità verificata
   → proposta inviata (offer_expires_at)
      → blocco camera 24h (hold_expires_at = now + hold_hours)
         → attesa pagamento
            → conferma (contabile ricevuto)
   ↳ rilascio automatico se scaduta (hold/offerta non onorata) → stato 'expired'
```

Mappatura sugli stati esistenti di `booking_requests`:
- *proposta inviata* → `proposal_sent` (con `offer_expires_at`).
- *blocco camera* → `availability_blocked` (con `hold_expires_at = now + hold_hours`, default 24h).
- *attesa pagamento* → `awaiting_payment`.
- *conferma* → `confirmed`.
- *rilascio automatico* → un job **cloud (pg_cron)** porta a `expired` le richieste con `hold_expires_at`/`offer_expires_at` scaduti e **rilascia il blocco**.

Regole del blocco:
- Mentre una camera/data è bloccata, il canonico la espone come **non disponibile** (blocco interno `source='vesta_hold'`, con precedenza) → il motore **non** la riquota per un altro ospite.
- Il rilascio (scadenza o cancellazione) **ripristina** la disponibilità nel canonico.
- **Limite onesto secondo il tier:** in integrazione **read-only (iCal)** il blocco è **interno a Vesta** e **non** viene propagato a QuoVai/OTA → resta un rischio residuo di overbooking lato OTA finché non esiste un write-back. Con **Tier 1 (API bidirezionale)** il blocco può essere **propagato** al Channel Manager. La robustezza del blocco dipende quindi dal tier di integrazione.
- **Ri-verifica al blocco:** prima di passare a `availability_blocked` il motore ri-controlla la disponibilità (anti-overbooking sul momento che conta).

## 9. Garanzia del requisito non negoziabile
*"Richiesta disponibilità → risposta automatica con prezzo corretto"* è garantita da **condizioni di auto-invio** valutate sul canonico:
- disponibilità **verificata** (fresca) **+** tariffa **presente** **+** affidabilità **sufficiente** (non bassa) **+** richiesta **standard** → **auto-invio**.
- Se una condizione manca → **bozza supervisionata / escalation** (mai auto-invio sbagliato).
- **Disponibilità ibrida:** sync periodico (quote veloci) + **ri-verifica al blocco**.
- **Prezzo corretto** garantito da: prezzo **solo** dal canonico (fonte autoritativa), **mai** dall'AI; guardia freshness; override manuale prioritario; promozioni deterministiche; bootstrap OTA solo in supervisione.
- Vale **in tutti i tier**, perché la decisione di auto-invio dipende dal **canonico + affidabilità**, non da quale fonte l'ha riempito.

## 10. Revenue Layer (futuro — P2)
Vesta **non genera autonomamente i prezzi**. Il Revenue Layer è un livello di **supporto alle decisioni** che **suggerisce** variazioni tariffarie, lasciando sempre la decisione allo staff:
- input: **occupazione** (dal canonico/blocchi), **stagionalità**, **storico** (booking_requests/conversioni), **prezzi OTA osservati** (`ota_observations`).
- output: **suggerimenti** di variazione tariffa (alza/abbassa, effetto stimato su conversione), **alert** (es. OTA sotto la tariffa diretta).
- vincolo non negoziabile: il Revenue Layer **propone**, non scrive mai prezzi in autonomia nel canonico di vendita; ogni variazione applicata resta un'azione **autorizzata dallo staff** (override manuale).
- si appoggia agli stessi strati (canonico + osservazioni OTA), **senza modificare il motore**.

## 11. Invarianti non negoziabili (regole anti-rework)
1. Il motore legge **solo** il canonico.
2. Le fonti sono **adapter** che alimentano il canonico.
3. **Prezzo di vendita ≠ prezzo OTA di confronto** (sempre separati).
4. La **disponibilità** è di prima classe: rispettata dal motore + ri-verificata al blocco + rilascio automatico alla scadenza.
5. **Affidabilità/freshness** governano l'auto-invio (bassa → mai auto; bootstrap OTA → supervisione).
6. L'**AI non fissa mai i prezzi**; il Revenue Layer **suggerisce**, non decide.
7. **Multi-tenant**: connettori per-property, isolamento RLS, scala a 1000.

## 12. Stato attuale vs target (ancorato)
- **Già allineato:** `rate_calendar` con `source`/`updated_at`; `data_reliability`/freshness; enum `price_source` (incl. `ota_stimato`); tabella `ical_feeds`; stati `booking_requests` con `hold_expires_at`/`offer_expires_at`; policy standard/non-standard/affidabilità.
- **Da completare (futuro, non in questo documento):** generalizzazione registro connettori; job sync iCal; **disponibilità rispettata dal motore** (oggi ignorata); blocco interno `vesta_hold` nel canonico + rilascio automatico via cron; ri-verifica al blocco; tabelle `promotions` e `ota_observations`; room-mapping; Revenue Layer (P2).
