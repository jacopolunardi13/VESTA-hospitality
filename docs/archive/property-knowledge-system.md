# Property Knowledge System (PKS) — La fonte unica di verità

> Versione 1.0 — 13 giugno 2026
> Specifica del sistema di conoscenza per property che alimenta conversazioni AI, FAQ, preventivi e risposte automatiche. Poggia interamente sullo schema esistente (`knowledge_assets`, `knowledge_asset_versions`, `knowledge_embeddings`, `kb_suggestions` — migrazione 0001): **zero modifiche schema per l'MVP**.

## 1. Ruolo e principi

Il PKS è la **fonte unica di verità** su tutto ciò che riguarda la struttura. Quattro principi non negoziabili:

1. **Niente asset, niente risposta**: l'AI non afferma mai nulla su policy, servizi o regole della struttura che non sia riconducibile a un asset del PKS (o a un dato strutturato, §2). Se manca → gap + escalation (mai inventare — LunArt Voice §7.3).
2. **Modificabile dal gestore, senza tecnici**: tutto si gestisce dall'editor in dashboard (D7) in linguaggio naturale — niente markdown obbligatorio, niente codice, niente re-deploy. Una modifica salvata è subito attiva nelle conversazioni.
3. **Multi-struttura by design**: ogni asset appartiene a una property (`org_id` + `property_id`); l'AI di una struttura non vede mai la conoscenza di un'altra, nemmeno nella stessa organization.
4. **Mai cancellare, sempre sostituire**: versioning automatico + `supersedes_asset_id` — la storia della conoscenza è ricostruibile (audit) e ogni modifica è reversibile (rollback).

## 2. Cosa va nel PKS e cosa no — la regola di separazione

> **Se è un numero che cambia o alimenta un calcolo → dato strutturato. Se è una spiegazione → asset KB.**

| Tipo di informazione | Dove vive | Come la usa l'AI |
|---|---|---|
| Prezzi, disponibilità, min-stay | `rate_calendar` | Solo via motore preventivo (mai dal testo) |
| Sconti, tassa, hold, soglie trattativa, orari operativi | `properties.settings` | Iniettati come dati nel prompt/template |
| Camere (capienza, descrizione breve) | `rooms` | Dati per il preventivo |
| FAQ, policy, procedure, descrizioni, consigli locali | `knowledge_assets` (testo) | Risposta FTS o grounding generativo |
| Brochure, menu, regolamenti firmabili | `knowledge_assets` (file su Storage + `content` estratto) | Testo estratto per rispondere; file allegabile se `attachable` |

Questa separazione evita il problema classico delle KB: numeri duplicati nel testo che divergono dalla realtà. La FAQ "quanto costa la colazione?" può esistere come testo, ma il check-in time, la tassa di soggiorno e i prezzi **non si scrivono mai in un asset**: l'editor D7 mostra un avviso se rileva pattern di prezzo/orario nel testo ("questo dato vive nelle Impostazioni: vuoi collegarlo?" — Fase 2: variabili `{{check_in_time}}` nei testi).

## 3. Tassonomia dei contenuti

Sul modello dati esistente (`type` + `origin` + `priority` + `tags[]` + `languages[]`):

**Tipi** (`type`, già nello schema): `faq` · `policy` · `procedura` · `brochure` · `pdf` · `correzione`.

**Categorie standard** (via `tags[]`, nessuna modifica schema) — l'editor le propone come scelte fisse, con possibilità di tag liberi aggiuntivi:

| Categoria (tag) | Contenuti tipici | Include domande d'oro |
|---|---|---|
| `arrivo` | Check-in/out, self check-in, deposito bagagli, parcheggio | #1, #2, #3 |
| `servizi` | Colazione, Wi-Fi, pulizie, lavanderia | #4 |
| `regole` | Animali, fumo, orari silenzio, cancellazione | #5, #9 |
| `famiglie` | Culla, bambini, seggioloni | #6 |
| `accessibilita` | Ascensore, barriere, esigenze speciali | #7 |
| `zona` | Posizione, come arrivare, consigli locali, ristoranti | #8 |
| `camere` | Descrizioni estese, dotazioni, viste | — |
| `pagamenti` | Metodi accettati, fatturazione (mai IBAN nel testo: vive in settings) | — |
| `emergenze` | Contatti utili, guasti, primo soccorso | — |

Le **9 domande d'oro** (ui-mvp-plan §10.3) sono marcate `golden`: rispondono solo via FTS+template e la checklist di onboarding non si chiude finché non sono tutte coperte.

**Priorità di retrieval** (`priority`, già nello schema): correzioni/gap dallo staff = 100 > inserimento manuale del gestore = 50 > import massivo = 0. A parità: più recente vince. È la gerarchia che fa sì che **una correzione dello staff batta sempre il testo originale**.

## 4. Ciclo di vita di un asset

```
crea (bozza) ──► attiva (usable_by_concierge = true) ──► aggiorna ──► sostituisci ──► disattiva
                        │                                  │               │
                        ▼                                  ▼               ▼
                  subito vivo nelle             nuova riga in        supersedes_asset_id:
                  conversazioni               knowledge_asset_       il vecchio diventa
                                              versions (rollback)    non-usable, MAI delete
```

- **Ogni salvataggio** crea una versione immutabile (`knowledge_asset_versions`, con autore) → rollback con un click in D7.
- **Sostituzione** (`supersedes_asset_id`): il nuovo asset disattiva il vecchio mantenendo la catena — usato anche dall'auto-learning.
- **Disattivazione** (`usable_by_concierge = false`): l'asset resta consultabile in D7 ma invisibile all'AI. Soft-delete solo per pulizia, mai hard delete.

**Multilingua**: l'asset si scrive nella lingua principale della property (`languages: ['it']`); l'AI risponde nella lingua dell'ospite traducendo al volo in conversazione (MVP). Quando la traduzione deve essere **controllata** (policy di cancellazione, regolamenti) si creano varianti esplicite per lingua (`languages: ['en']`) che vincono sulla traduzione automatica.

## 5. Pipeline di retrieval (come il PKS alimenta le risposte)

Coerente con la pipeline knowledge-first (dev-plan §7.1):

1. **Filtro base** (sempre): `property_id` corrente + `usable_by_concierge = true` + `deleted_at IS NULL` — usa l'indice `idx_ka_retrieval` già nello schema.
2. **Livello FTS (zero AI)**: match su `idx_ka_fts`; sopra soglia di confidenza → risposta diretta dall'asset (obbligatorio per i `golden`).
3. **Livello generativo**: l'intera KB della property entra nel system prompt, ordinata per `priority desc, updated_at desc`, **con prompt caching** (la KB è stabile → ~90% di risparmio input).
4. **Budget di contesto**: finché la KB resta sotto soglia (~50K token, da tarare) va tutta nel prompt; oltre, selezione per categoria pertinente + top-N FTS. Gli `knowledge_embeddings` (già pronti nello schema, provider-agnostic) si attivano solo se questo non basta (Fase 2) — la KB di un B&B tipico non li richiede.
5. **Conflitti**: vince priorità più alta, poi recency; il conflict check dell'auto-learning (`kb_suggestions.conflict_asset_id` + `similarity`) intercetta i duplicati in ingresso prima che diventino contraddizioni.

**Provenienza**: ogni risposta generativa registra quali asset erano nel contesto (via `ai_calls` + messaggio collegato); in D4 lo staff vede "[da KB: Animali ammessi?]" — è il gancio per la correzione rapida.

## 6. Alimentazione e manutenzione (zero interventi tecnici)

| Canale | Quando | Come |
|---|---|---|
| **Onboarding guidato** | Setup property | Wizard con le 9 domande d'oro come form ("C'è il parcheggio? Raccontalo come lo diresti a un ospite") + caricamento PDF/brochure |
| **Editor D7** | Sempre | CRUD con categorie proposte, anteprima, versioni, rollback |
| **Correzione dallo staff** | In conversazione (D4) | "Salva risposta in KB": la risposta dello staff diventa proposta `correzione` (priority 100) — Fase 2 con distillazione AI (`kb_suggestions`) |
| **Gap automatici** | Quando l'AI non sa rispondere | La domanda diventa gap loggato → coda suggerimenti, secondo `knowledge_learning_mode` (manual / assisted / automatic) |
| **Import massivo** | Migrazione da altri sistemi | Incolla testo/CSV → asset `origin: import` (priority 0: tutto ciò che il gestore tocca a mano li supera) |

**Igiene della conoscenza** (D7 + nudge):
- **Coverage score** per property: % categorie standard coperte (golden = obbligatorie) — visibile in D7 e nella checklist di setup in D1.
- **Review reminder**: asset non aggiornati da N mesi (default 6, su `updated_at`) → suggerimento di revisione ("Le info sul parcheggio sono di 8 mesi fa: ancora valide?").
- **Gap report**: le domande senza risposta più frequenti del periodo, ordinate per frequenza — è la to-do list di scrittura del gestore.

## 7. Multi-struttura

- **Isolamento rigido**: ogni query filtra per `property_id`; la RLS org-level esistente protegge tra organizations, il filtro property nelle query separa le strutture della stessa org. L'AI di "Struttura A" non cita mai asset di "Struttura B".
- **Duplicazione assistita** (stessa org): azione "Copia su un'altra struttura" in D7 — crea un asset indipendente (i contenuti spesso divergono: parcheggi diversi, regole diverse). Niente condivisione live nell'MVP.
- **Asset org-wide condivisi** (Fase 2/3, richiede `property_id` nullable in migrazione dedicata): per catene con policy comuni. Rimandato finché un cliente reale non lo chiede.

## 8. Permessi e sicurezza

- MVP: tutti i membri dell'org possono editare la KB (limite RLS noto, dev-plan §4); con i ruoli vincolanti (migrazione 0004) si valuterà `staff` = solo correzioni, `manager/owner` = tutto.
- I file caricati vivono nel bucket Storage `knowledge-files` con path per org/property e policy di accesso (dev-plan Fase 0).
- Nel testo degli asset non vanno mai segreti (IBAN, codici cassaforte, password Wi-Fi? — il Wi-Fi sì ma con consapevolezza: l'editor avvisa che il contenuto è visibile a chiunque chatti; le info riservate post-conferma viaggiano nei template `istruzioni_checkin`, non nella KB pubblica).

## 9. KPI del PKS (alimentano D13, blocco "AI vs staff")

- % risposte servite dal solo FTS (zero AI) — il PKS che lavora gratis.
- Tasso di risoluzione: domande risposte da KB / domande totali (target 60–70%).
- Gap aperti vs chiusi nel periodo; tempo medio di chiusura gap.
- Coverage score medio; asset scaduti da revisione.
- Correzioni staff pubblicate (= la KB sta imparando).

## Documenti correlati

- [UI MVP Plan](ui-mvp-plan.md) — D7 (editor), §10.3 (domande d'oro) · [Dev Plan](dev-plan.md) — §7.1 (pipeline), §7-bis.2 (golden) · [LunArt Voice](lunart-voice.md) — §7.3 (mai inventare policy) · [Product Brief](product-brief.md)
