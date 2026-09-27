# DECISIONS — Architecture Decision Record (ADR)

Registro **permanente e operativo** delle decisioni architetturali e di processo. Obiettivo: capire,
anche tra due anni, non solo **quale** decisione è stata presa ma **perché**. Da oggi ogni decisione
importante si registra qui (PROJECT_RULES §7).

## Regola operativa (ADR-driven changes)
Prima di modificare un'area importante del sistema, **verificare se esiste una ADR collegata**. Se esiste:
- la modifica deve essere **coerente** con quella decisione; **oppure**
- va creata una **nuova ADR che sostituisce esplicitamente** la precedente (campo *Sostituisce*).

**Nessuna decisione architetturale importante va modificata implicitamente: ogni cambiamento lascia una
traccia.** (Registrata come [ADR-0015](#adr-0015--governance-delle-adr-adr-driven-changes).)

## Convenzioni
- **Struttura ADR**: Data · Stato · Categoria · Contesto · Problema · Alternative · Decisione ·
  Motivazioni · Conseguenze positive · Trade-off · Documenti collegati · Sostituisce.
- **Stati**: Proposta · Approvata · Superata.
- **Categorie**: Product · Architecture · Infrastructure · Database · Security · AI · Business · Process.
- **Date** (PROJECT_RULES §2): senza traccia oggettiva → marcate ◐ (approssimata).

## Indice
| ID | Titolo | Categoria | Stato | Documento principale |
|---|---|---|---|---|
| ADR-0001 | Product First | Product | Approvata | [../PROJECT_RULES.md](../PROJECT_RULES.md) |
| ADR-0002 | Documentation as Code | Process | Approvata | [../PROJECT_RULES.md](../PROJECT_RULES.md) |
| ADR-0003 | Definition of Done | Process | Approvata | [../PROJECT_RULES.md](../PROJECT_RULES.md) |
| ADR-0004 | Fail-Fast Policy | Architecture | Approvata | [ARCHITECTURE.md](ARCHITECTURE.md) |
| ADR-0005 | Struttura dei documenti | Process | Approvata | [README.md](README.md) |
| ADR-0006 | Single Source of Truth | Process | Approvata | [../PROJECT_RULES.md](../PROJECT_RULES.md) |
| ADR-0007 | Capability Engine = direzione | Architecture | Approvata | [ARCHITECTURE.md](ARCHITECTURE.md) |
| ADR-0008 | Hospitality primo dominio | Business | Approvata | [BUSINESS.md](BUSINESS.md) |
| ADR-0009 | Migrazioni verificate (`to_regclass`) | Database | Approvata | [DATABASE.md](DATABASE.md) |
| ADR-0010 | Classificazione affermazioni tecniche | Process | Approvata | [../PROJECT_RULES.md](../PROJECT_RULES.md) |
| ADR-0011 | Human-in-the-Loop (Tier 1/Tier 2) — nessuna azione operativa senza PMS | Architecture | Approvata (rafforzata 28/06) | [ARCHITECTURE.md](ARCHITECTURE.md) |
| ADR-0012 | Pipeline Knowledge-First | AI | Approvata | [AI.md](AI.md) |
| ADR-0013 | Orchestrazione condivisa tra canali | Architecture | Approvata | [ARCHITECTURE.md](ARCHITECTURE.md) |
| ADR-0014 | Seam Registry/Recognizer | Architecture | **Superata (→ ADR-0017)** | [ARCHITECTURE.md](ARCHITECTURE.md) |
| ADR-0015 | Governance delle ADR (ADR-driven changes) | Process | Approvata | DECISIONS.md |
| ADR-0016 | Architettura "Operating System" a strati (acquisition-first) | Architecture | Approvata | [ARCHITECTURE.md](ARCHITECTURE.md) |
| ADR-0017 | Recognizer = interpreti, non gatekeeper (Universal Intake) | Architecture | Approvata | [ARCHITECTURE.md](ARCHITECTURE.md) |
| ADR-0018 | Context Layer (stato vivo nel repo) per sync assistenti | Process | Approvata | [context/](context/) · [../PROJECT_RULES.md](../PROJECT_RULES.md) |
| ADR-0019 | Postura di sicurezza pre-go-live (gate P0) | Security | Approvata | [SECURITY.md](SECURITY.md) |
| ADR-0020 | Product Execution Rule (vincolante a livello workstream) | Process | Approvata | [../PROJECT_RULES.md](../PROJECT_RULES.md) |
| ADR-0021 | Milestone-scoped RED delegation | Process | Approvata | [../PROJECT_RULES.md](../PROJECT_RULES.md) |
| ADR-0022 | System Map canonica + domini target approvati | Product | Approvata | [SYSTEM_MAP.md](SYSTEM_MAP.md) |
| ADR-0023 | Provider Action Contract; browser governato = execution adapter di prima classe | Architecture | Approvata | [SYSTEM_MAP.md](SYSTEM_MAP.md) §2 |
| ADR-0024 | Autonomia progressiva L0–L4 (policy-bounded) | Product | Approvata | [SYSTEM_MAP.md](SYSTEM_MAP.md) §1 |

---

## ADR-0001 — Product First
- **Data:** 28/06/2026 · **Stato:** Approvata · **Categoria:** Product
- **Contesto:** documentazione e architettura in crescita; rischio di complessità "ingegneristica".
- **Problema:** evitare che eleganza tecnica o pattern alla moda guidino le scelte.
- **Alternative:** architettura-driven (astrazioni anticipate); decidere caso per caso senza principio.
- **Decisione:** ogni decisione tecnica parte dal prodotto; la complessità si giustifica solo con un
  beneficio reale; l'architettura segue il prodotto.
- **Motivazioni:** massimizzare valore consegnato, ridurre over-engineering.
- **Conseguenze positive:** scelte più semplici e mirate; meno debito da astrazioni inutili.
- **Trade-off:** a volte si rimanda un'astrazione "bella" finché un secondo caso non la giustifica.
- **Documenti:** [../PROJECT_RULES.md](../PROJECT_RULES.md) (Principio guida), [ARCHITECTURE.md](ARCHITECTURE.md) §2.
- **Sostituisce:** —

## ADR-0002 — Documentation as Code
- **Data:** 28/06/2026 · **Stato:** Approvata · **Categoria:** Process
- **Contesto:** decisioni e architettura vivevano solo nella memoria/chat.
- **Problema:** la documentazione divergeva dal codice reale.
- **Alternative:** doc "best-effort" non vincolante; wiki esterna.
- **Decisione:** la doc fa parte del prodotto; ogni modifica significativa (architettura, DB, infra,
  workflow, capability, API, processi) aggiorna contestualmente la doc; PR senza doc = incompleta.
- **Motivazioni:** mantenere la doc fonte ufficiale e affidabile.
- **Conseguenze positive:** doc sempre coerente col codice; onboarding e manutenzione più semplici.
- **Trade-off:** ogni cambiamento costa anche tempo di documentazione.
- **Documenti:** [../PROJECT_RULES.md](../PROJECT_RULES.md) §7.
- **Sostituisce:** —

## ADR-0003 — Definition of Done
- **Data:** 27/06/2026 · **Stato:** Approvata · **Categoria:** Process
- **Contesto:** feature dichiarate "fatte" ma non realmente operative.
- **Problema:** distinguere "implementato" da "completato".
- **Alternative:** done = "codice scritto"; done = "merge in main".
- **Decisione:** completata solo con (1) codice in `main` + (2) migrazione verificata con `to_regclass`
  + (3) E2E reale. Manca uno → "implementata, non completata".
- **Motivazioni:** intercettare i tre modi in cui qualcosa sembra pronto senza esserlo.
- **Conseguenze positive:** niente feature "fantasma"; stato reale sempre chiaro.
- **Trade-off:** ritmo apparente più lento, qualità più alta.
- **Documenti:** [../PROJECT_RULES.md](../PROJECT_RULES.md) §1, [TESTING.md](TESTING.md), [DATABASE.md](DATABASE.md).
- **Sostituisce:** —

## ADR-0004 — Fail-Fast Policy (nessun errore Supabase ignorato)
- **Data:** 27/06/2026 · **Stato:** Approvata · **Categoria:** Architecture
- **Contesto:** incidente: tabelle 0011–0013 mai applicate, ma il sistema "sembrava funzionare".
- **Problema:** il codice faceva `insert/select` senza controllare `.error` (supabase-js non lancia) →
  guasti silenziosi (dedup inerte → duplicazione massiva).
- **Alternative:** logging soft ovunque; try/catch generici; lasciare com'era.
- **Decisione:** ogni accesso DB controlla `.error`; i percorsi dati **lanciano** (helper `dbThrow`),
  la telemetria **logga** (mai silenziosa).
- **Motivazioni:** un guasto deve esplodere subito, non nascondersi.
- **Conseguenze positive:** problemi visibili immediatamente; impossibile ripetere quell'incidente in silenzio.
- **Trade-off:** errori prima invisibili ora possono interrompere un percorso (è voluto).
- **Documenti:** [../PROJECT_RULES.md](../PROJECT_RULES.md) §4, [ARCHITECTURE.md](ARCHITECTURE.md), [CHANGELOG.md](CHANGELOG.md).
- **Sostituisce:** —

## ADR-0005 — Struttura dei documenti (Current State / Guiding Principles / Future Evolution + Related Documents)
- **Data:** 28/06/2026 · **Stato:** Approvata · **Categoria:** Process
- **Contesto:** rischio di mischiare stato attuale, principi e idee future in un unico flusso.
- **Problema:** distinguere chiaramente presente, motivazioni ed evoluzioni coerenti.
- **Alternative:** documenti liberi senza struttura fissa.
- **Decisione:** ogni documento ha *Current State* + *Guiding Principles* + *Future Evolution* (non
  roadmap) + *Related Documents* (rete navigabile).
- **Motivazioni:** doc = tecnica + manuale di evoluzione + memoria progettuale.
- **Conseguenze positive:** più difficile rompere l'architettura senza capirne il motivo.
- **Trade-off:** documenti un po' più lunghi e strutturati.
- **Documenti:** tutti i `docs/*`; standard codificato in [README.md](README.md) (da creare).
- **Sostituisce:** —

## ADR-0006 — Single Source of Truth
- **Data:** 28/06/2026 · **Stato:** Approvata · **Categoria:** Process
- **Contesto:** stessi argomenti duplicati in più documenti (dev-plan/ui-mvp-plan/product-brief).
- **Problema:** evitare divergenze e contraddizioni nel tempo.
- **Alternative:** duplicare per comodità di lettura.
- **Decisione:** ogni argomento ha un solo documento ufficiale; gli altri **rimandano**, non copiano;
  la modifica completa si fa solo nel documento principale.
- **Motivazioni:** impedire che due documenti divergano.
- **Conseguenze positive:** coerenza garantita; manutenzione localizzata.
- **Trade-off:** più rimandi, meno testo auto-contenuto.
- **Documenti:** [../PROJECT_RULES.md](../PROJECT_RULES.md) §3.
- **Sostituisce:** la documentazione "planning" duplicata (→ `docs/archive/`).

## ADR-0007 — Capability Engine come direzione, non implementazione
- **Data:** 25/06/2026 ◐ · **Stato:** Approvata · **Categoria:** Architecture
- **Contesto:** molti moduli sembrano appartenere a un motore operativo AI generico.
- **Problema:** evitare di costruire ora un'astrazione universale non ancora giustificata.
- **Alternative:** implementare subito un Capability Engine generico; ignorare del tutto la direzione.
- **Decisione:** il Capability Engine resta **direzione futura**; oggi si mantiene il codice modulare
  (seam Registry/Recognizer) senza astrazioni premature.
- **Motivazioni:** Product First; validare prima l'hospitality.
- **Conseguenze positive:** nessun over-engineering; evoluzione possibile se confermata dai dati.
- **Trade-off:** alcune generalizzazioni rimandate.
- **Documenti:** [ARCHITECTURE.md](ARCHITECTURE.md) (Future Evolution), [BUSINESS.md](BUSINESS.md), [DOMAINS.md](DOMAINS.md).
- **Sostituisce:** —

## ADR-0008 — Hospitality come primo dominio verticale
- **Data:** 27/06/2026 ◐ · **Stato:** Approvata · **Categoria:** Business
- **Contesto:** il core sembra applicabile a più verticali (restaurant, retail, ecc.).
- **Problema:** scegliere dove validare il prodotto.
- **Alternative:** partire multi-dominio; costruire subito un core orizzontale.
- **Decisione:** hospitality è il **primo dominio applicativo** (LunArt, poi Bella Vigna); l'eventuale
  core riutilizzabile si estrae **solo se** l'esperienza lo conferma.
- **Motivazioni:** dominio meglio conosciuto, validazione concreta col pilota.
- **Conseguenze positive:** focus, feedback reale, rischio ridotto.
- **Trade-off:** scelte iniziali ottimizzate per hospitality.
- **Documenti:** [BUSINESS.md](BUSINESS.md), [DOMAINS.md](DOMAINS.md).
- **Sostituisce:** —

## ADR-0009 — Migrazioni sempre verificate con `to_regclass`
- **Data:** 27/06/2026 · **Stato:** Approvata · **Categoria:** Database
- **Contesto:** migrazioni date per applicate da memoria/sintesi, in realtà assenti.
- **Problema:** "applicata" non era mai verificata sul DB reale.
- **Alternative:** fidarsi delle note/del comportamento dell'app.
- **Decisione:** una migrazione non è applicata finché `to_regclass` (o controllo catalogo) non lo
  conferma sul DB; una migrazione funzionale per volta.
- **Motivazioni:** evitare il desync repo↔DB (causa dell'incidente duplicazione).
- **Conseguenze positive:** stato dello schema sempre certo.
- **Trade-off:** un passo di verifica in più per ogni migrazione.
- **Documenti:** [DATABASE.md](DATABASE.md), [RUNBOOKS/apply-migration.md](RUNBOOKS/apply-migration.md), [../PROJECT_RULES.md](../PROJECT_RULES.md) §6.
- **Sostituisce:** —

## ADR-0010 — Classificazione delle affermazioni tecniche (verificata / dedotta / ipotizzata)
- **Data:** 27/06/2026 · **Stato:** Approvata · **Categoria:** Process
- **Contesto:** affermazioni "sembra funzionare" prese per fatti.
- **Problema:** distinguere fatti provati da deduzioni e ipotesi.
- **Alternative:** nessuna distinzione formale.
- **Decisione:** ogni affermazione tecnica è etichettata verificata/dedotta/ipotizzata; le verifiche
  hanno una prova oggettiva; mai assumere vero ciò che non è verificato.
- **Motivazioni:** rigore, prevenzione di errori da assunzione.
- **Conseguenze positive:** diagnosi affidabili; meno errori propagati.
- **Trade-off:** richiede prove esplicite.
- **Documenti:** [../PROJECT_RULES.md](../PROJECT_RULES.md) §2.
- **Sostituisce:** —

## ADR-0011 — Human-in-the-Loop (Tier 1 / Tier 2)
- **Data:** giugno 2026 ◐ (consolidata 27/06/2026; **rafforzata 28/06/2026**) · **Stato:** Approvata · **Categoria:** Architecture
- **Contesto:** azioni che impegnano denaro/camere/promesse verso l'ospite.
- **Problema:** cosa può fare Vesta in autonomia e cosa no.
- **Alternative:** automazione totale; approvazione manuale di tutto.
- **Decisione:** Tier 1 (concierge/FAQ/preventivo informativo) automatico; Tier 2 (proposta, conferma,
  IBAN, blocco camera) sempre approvato dallo staff. Vesta non blocca camere, non invia IBAN, non
  conferma da sola.
- **🔒 Rafforzamento (28/06/2026) — nessuna azione operativa senza PMS (vincolo permanente fino a nuovo
  ordine):** finché Vesta non avrà un'**integrazione ufficiale e affidabile con PMS/Channel Manager**
  (API o equivalente), **non deve eseguire autonomamente alcuna azione che modifichi lo stato operativo**
  della struttura. In particolare NON deve: bloccare camere · confermare prenotazioni · liberare camere ·
  modificare disponibilità · modificare tariffe · aggiornare QuoVai/altri PMS · confermare pagamenti ·
  qualsiasi altra azione irreversibile o economicamente vincolante.
  **Flusso corretto (autoritativo):** 1) Vesta prepara il preventivo → 2) invia il preventivo → 3) il
  cliente conferma → 4) Vesta crea una **Pending Action** per lo staff → 5) lo **staff** blocca
  manualmente la camera per 24h → 6) lo **staff** approva l'invio delle istruzioni di pagamento → 7)
  Vesta invia la comunicazione → 8) dopo 24h Vesta genera un **promemoria** → 9) lo **staff** verifica il
  bonifico → 10) **solo lo staff** conferma o libera la camera.
  **Re-valutazione:** quando esisterà un'integrazione PMS ufficiale, si rivaluterà il livello di
  automazione (eventuale nuova ADR).
- **Motivazioni:** fiducia e sicurezza; Vesta assiste, non sostituisce il gestore. Senza una fonte di
  verità affidabile (PMS), automatizzare lo stato operativo causerebbe incoerenze irreversibili.
- **Conseguenze positive:** nessuna azione irreversibile non voluta; pilota sicuro.
- **Trade-off:** lo staff resta nel ciclo per le azioni impegnative.
- **Documenti:** [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [../PROJECT_RULES.md](../PROJECT_RULES.md) §5.
- **Sostituisce:** —

## ADR-0012 — Pipeline Knowledge-First (AI come componente, non cuore)
- **Data:** giugno 2026 ◐ · **Stato:** Approvata · **Categoria:** AI
- **Contesto:** rischio di dipendere dall'AI per ogni risposta (costo, imprevedibilità).
- **Problema:** dare risposte affidabili e controllabili a costo sostenibile.
- **Alternative:** AI-first su ogni messaggio.
- **Decisione:** rispondere prima da regole deterministiche e KB curata; usare l'AI solo quando serve
  (intent, estrazione, generazione); safe-mode a budget esaurito.
- **Motivazioni:** affidabilità, controllo, riduzione costi.
- **Conseguenze positive:** risposte coerenti, costi limitati, degradazione controllata.
- **Trade-off:** richiede una KB curata e mantenuta.
- **Documenti:** [ARCHITECTURE.md](ARCHITECTURE.md), [AI.md](AI.md), [KNOWLEDGE.md](KNOWLEDGE.md).
- **Sostituisce:** —

## ADR-0013 — Orchestrazione condivisa tra i canali
- **Data:** giugno 2026 ◐ · **Stato:** Approvata · **Categoria:** Architecture
- **Contesto:** tre canali (Web, Email, WhatsApp).
- **Problema:** evitare che i canali divergano nel comportamento.
- **Alternative:** logica duplicata per canale.
- **Decisione:** un unico `processConversationTurn`; il canale è un adapter sottile.
- **Motivazioni:** coerenza, un solo posto per la logica.
- **Conseguenze positive:** comportamento uniforme; manutenzione centralizzata.
- **Trade-off:** l'orchestratore deve restare canale-agnostico.
- **Documenti:** [ARCHITECTURE.md](ARCHITECTURE.md).
- **Sostituisce:** —

## ADR-0014 — Seam Registry / Recognizer (Document Center)
- **Data:** 25/06/2026 ◐ · **Stato:** **Superata da [ADR-0017]** (28/06/2026) · **Categoria:** Architecture
- **Nota:** il pattern Registry/Recognizer resta valido, ma il **ruolo** dei recognizer cambia da
  *gatekeeper* (decidono SE un documento entra) a *interprete* (decidono COME). Vedi ADR-0017.
- **Contesto:** Document Center come primo modulo del Back Office Assistant.
- **Problema:** estendere a nuovi fornitori/documenti senza toccare poll/ingest.
- **Alternative:** logica hard-coded per fornitore; AI come parser principale.
- **Decisione:** registro di recognizer (Supplier Knowledge a 2 livelli); un nuovo fornitore = un nuovo
  recognizer; AI solo dopo regole/parser/librerie.
- **Motivazioni:** estensibilità pulita; costi/controllo (regole prima dell'AI).
- **Conseguenze positive:** crescita senza modifiche all'idraulica; dimostrato con Booking.
- **Trade-off:** ogni fornitore richiede una scheda recognizer.
- **Documenti:** [ARCHITECTURE.md](ARCHITECTURE.md).
- **Sostituisce:** —

## ADR-0015 — Governance delle ADR (ADR-driven changes)
- **Data:** 28/06/2026 · **Stato:** Approvata · **Categoria:** Process
- **Contesto:** le decisioni rischiano di essere modificate implicitamente nel tempo.
- **Problema:** evitare che un'area importante cambi senza traccia della decisione.
- **Alternative:** ADR come solo archivio storico (non operativo).
- **Decisione:** prima di modificare un'area importante si verifica l'ADR collegata; la modifica deve
  essere coerente, oppure si crea una nuova ADR che **sostituisce** esplicitamente la precedente.
  Nessuna decisione importante modificata implicitamente.
- **Motivazioni:** rendere DECISIONS.md operativo, non solo storico; tracciabilità.
- **Conseguenze positive:** evoluzione consapevole; storia delle scelte sempre ricostruibile.
- **Trade-off:** un passo di verifica prima delle modifiche architetturali.
- **Documenti:** [../PROJECT_RULES.md](../PROJECT_RULES.md) §7.
- **Sostituisce:** —

## ADR-0016 — Architettura "Operating System" a strati (acquisition-first)
- **Data:** 28/06/2026 · **Stato:** Approvata · **Categoria:** Architecture
- **Contesto:** il sistema era pensato come collezione di moduli con ingressi separati (Conversation,
  Booking, Document Center…). La milestone M4 ha definito una piattaforma unica.
- **Problema:** evitare che ogni modulo abbia la propria logica d'ingresso e che informazioni vengano
  perse o gestite in modo incoerente tra canali.
- **Alternative:** mantenere moduli indipendenti; introdurre subito un event bus distribuito.
- **Decisione:** Vesta è una **spina dorsale unica a strati** — Foundation · Ingress · **Operational
  Intake** · **Event Model (logico)** · Interpretation · Domini · Knowledge & Memory · Action/Output —
  con principio guida **acquisizione indipendente dagli interpreti**. L'**Event Model resta logico**
  (system of record + dispatch su Postgres), **non** un message bus. Il **Capability Engine** è il
  *framework* che rende i blocchi innestabili, **non** un nodo di runtime. **Knowledge ≠ Operational
  Memory**; **Delivery (esterno) ≠ Notification (staff)**.
- **Motivazioni:** coerenza tra canali, nessuna informazione persa, estensibilità, Product First.
- **Conseguenze positive:** un solo percorso per ogni informazione; domini innestabili; migrazione
  evolutiva (non rewrite — è la formalizzazione di ciò che esiste).
- **Trade-off:** richiede disciplina nel non far gateare gli interpreti; alcuni strati restano
  concettuali (Event Model, Operational Memory) finché non servono davvero.
- **Documenti:** [ARCHITECTURE.md](ARCHITECTURE.md) (Parte 0).
- **Sostituisce:** —

## ADR-0017 — Recognizer = interpreti, non gatekeeper (Universal Intake)
- **Data:** 28/06/2026 · **Stato:** Approvata · **Categoria:** Architecture
- **Contesto:** test reale → un PDF amministrativo arrivato da email non-Booking non entrava nel Document
  Center (l'ingresso dipendeva dal recognizer Booking).
- **Problema:** l'acquisizione non deve dipendere dagli interpreti; nessun documento amministrativo deve
  andare perso solo perché il fornitore non è ancora "conosciuto".
- **Alternative:** pre-costruire un recognizer per ogni fornitore prima di acquisire (non scalabile);
  lasciare l'intake gateato.
- **Decisione:** l'**intake è garantito** per ogni allegato-documento; i recognizer diventano
  **interpreti** che aggiungono significato (fornitore/categoria/campi/classificazione), e **non**
  decidono più se il documento entra. Un documento non riconosciuto entra come `to_verify`. Generalizza
  il principio a **qualsiasi informazione**, non solo i documenti.
- **Motivazioni:** zero perdite, recognizer incrementali, coerenza con ADR-0016.
- **Conseguenze positive:** copertura universale; il valore dei recognizer cresce nel tempo senza
  bloccare l'acquisizione.
- **Trade-off:** più rumore/triage (serve gate "amministrativo" + vista di verifica); privacy degli
  allegati ospite e dedup di contenuto (`content_hash`) diventano decisioni da affrontare.
- **Documenti:** [ARCHITECTURE.md](ARCHITECTURE.md) (Document Intelligence, Future Evolution).
- **Sostituisce:** **raffina/supera [ADR-0014]** (recognizer: gate → interprete).

## ADR-0018 — Context Layer (stato vivo nel repo) per la sincronizzazione assistenti
- **Data:** 29/06/2026 · **Stato:** Approvata · **Categoria:** Process
- **Contesto:** lo "stato vivo" del progetto (dove siamo, prossimo task, decisioni aperte, problemi) era frammentato tra ROADMAP/CHANGELOG/DEPLOYMENT **e** nella memoria privata dell'assistente — invisibile ad altri assistenti (es. ChatGPT) e soggetto a drift (es. `DEPLOYMENT.md` diceva "`document-center` non in `main`" mentre git mostrava `main` == `document-center`).
- **Problema:** rendere il **repository GitHub** l'unica fonte di verità dello stato, così che qualsiasi assistente (Claude o ChatGPT) si riallinei dal repo, non dalle chat.
- **Alternative:** lasciare lo stato nelle chat/memoria; un singolo file di stato monolitico; affidarsi solo a ROADMAP/CHANGELOG (che hanno scopi diversi: priorità e storia, non snapshot).
- **Decisione:** introdurre un **layer di contesto** in `docs/context/` distinto dal layer di conoscenza (`docs/*`): `CURRENT_STATE.md`, `NEXT_TASK.md`, `OPEN_DECISIONS.md`, `KNOWN_ISSUES.md`, `PROJECT_SYNC_REPORT_TEMPLATE.md` (template stabile) e `PROJECT_SYNC_REPORT.md` (report vivo da incollare in chat). I file sono **snapshot sintetici** che **rimandano** alle SSOT (no duplicazione, PROJECT_RULES §3). Confine netto: `OPEN_DECISIONS` contiene solo decisioni **non ancora prese**; alla decisione diventano ADR qui e sono rimosse. Aggiornarli è parte della **Definition of Done** (PROJECT_RULES §1.4 + §13).
- **Motivazioni:** eliminare la dipendenza dalle chat; riallineo rapido di un assistente; coerenza repo↔stato.
- **Conseguenze positive:** stato sempre nel repo, versionato e diff-abile; onboarding di un assistente in minuti; drift documentale reso visibile e correggibile.
- **Trade-off:** sei file in più da mantenere a ogni milestone (mitigato da stile sintetico, header `data·commit·branch` e gate DoD). La memoria privata dell'assistente viene **degradata a puntatore** verso `docs/context/` per non creare una terza fonte di verità.
- **Documenti:** [context/](context/), [../PROJECT_RULES.md](../PROJECT_RULES.md) §1 e §13, [README.md](README.md).
- **Sostituisce:** —

## ADR-0019 — Postura di sicurezza pre-go-live (gate P0)
- **Data:** 30/06/2026 · **Stato:** Approvata · **Categoria:** Security
- **Contesto:** prima dell'esposizione pubblica di Vesta su Internet è stato eseguito un **Go-Live Security Assessment** (ruolo Senior Security Engineer) sull'intero progetto: architettura, repository, Next.js, Supabase, autenticazione/autorizzazioni, RLS, API, AI pipeline, prompt, upload documenti, Gmail, gestione segreti, frontend/backend, logging, error handling, multi-tenant. Verifica reale del codice + **prova live dell'RLS** (chiave anon → 0 righe su tutte le tabelle core).
- **Problema:** stabilire se e con quali condizioni Vesta può essere esposta pubblicamente, e fissare le invarianti di sicurezza vincolanti.
- **Alternative:** (a) go-live pubblico immediato; (b) rimandare ogni esposizione; (c) **gate su un set minimo di correzioni bloccanti (P0)** mantenendo il pilot interno controllato.
- **Decisione:** **(c).** **NO-GO per esposizione pubblica non ristretta** finché non è chiuso il **Security Sprint P0**. Il **pilot email LunArt controllato** (single-tenant, autosend OFF) **prosegue**. Invarianti di sicurezza codificate come **vincolanti**: isolamento multi-tenant via **RLS `user_in_org`**; **least-privilege sulle RPC `SECURITY DEFINER`** (nessuna funzione privilegiata deve fidarsi di parametri del chiamante per l'autorizzazione, né essere concessa a `authenticated`/`public` senza controllo esplicito); l'**AI non ha strumenti con effetti** e non riceve segreti/IBAN/prezzi nel contesto; **kill-switch autosend OFF** di default; **Human-in-the-Loop per l'irreversibile** ([ADR-0011]); **segreti fuori da codice e chat** + rotazione obbligatoria di ciò che è stato esposto; **nessun dato estratto dall'LLM promosso a parametro di sicurezza** (destinatario di consegna ancorato all'identità di trasporto del canale).
- **Motivazioni:** architettura sana con difese profonde reali (RLS live-verificato, no-tool-AI, kill-switch), ma **controlli di bordo per l'Internet aperto incompleti** (header, anti-abuso chat pubblica, hardening RPC). Il rischio è **concentrato e chiudibile** in uno sprint.
- **Conseguenze positive:** gate chiaro e verificabile; postura di sicurezza versionata e diff-abile; il Security Sprint P0 ha ambito definito.
- **Trade-off:** l'esposizione pubblica slitta di ~1 sprint; alcune correzioni P0 (hardening RPC) richiedono migrazioni DB e passano dalla DoD.
- **Documenti:** [SECURITY.md](SECURITY.md) (Go-Live Security Assessment + tabella P0/P1/P2), [context/KNOWN_ISSUES.md](context/KNOWN_ISSUES.md), [context/NEXT_TASK.md](context/NEXT_TASK.md).
- **Sostituisce:** —

## ADR-0020 — Product Execution Rule (regola vincolante a livello di workstream)
- **Data:** 04/09/2026 · **Stato:** Approvata · **Categoria:** Process
- **Contesto:** dopo la riconciliazione del 04/09 e il Router Training Sprint #1, il lavoro tecnico (hardening, tooling, capability di controllo) tendeva a espandersi oltre l'outcome hospitality che lo giustificava; la regola operativa che lo impediva viveva solo nelle chat/memoria degli assistenti — contro [ADR-0018] (lo stato e le regole vivono nel repo).
- **Problema:** vincolare ogni workstream a chiudere un problema operativo hospitality concreto, con criteri espliciti di stop e di chiusura, e rendere la regola canonica nel repository.
- **Alternative:** lasciarla nella memoria degli assistenti (drift, invisibile ad altri assistenti); un documento dedicato nuovo (duplicherebbe il layer regole).
- **Decisione:** aggiungere a [../PROJECT_RULES.md](../PROJECT_RULES.md) la sezione vincolante **"Product Execution Rule"** (workstream-level): dichiarazione di apertura del workstream (8 campi, che riusa il gate 8 punti §18 e la DoD §1 senza duplicarli), **STOP RULE** (il lavoro tecnico che non avvicina l'outcome si chiude al minimo necessario), **CLOSURE RULE** (outcome raggiunto + residui non bloccanti → chiudere; residui nel backlog [context/KNOWN_ISSUES.md](context/KNOWN_ISSUES.md)), sequenza preferita **CLOSE → SHIP → VERIFY → NEXT**, confine di piattaforma (WorkspaceOS = control plane; Vesta = owner della logica hospitality).
- **Motivazioni:** decisione esplicita di Jacopo (04/09/2026) per impedire i loop analyze → harden → analyze-again → expand-infrastructure; coerenza con §18 Strategic Product Boundary.
- **Conseguenze positive:** ogni workstream ha apertura e chiusura verificabili; meno review-loop senza finding materiali; i residui hanno una casa (backlog) invece di estendere il workstream.
- **Trade-off:** lieve overhead di apertura (dichiarazione a 8 campi).
- **Documenti:** [../PROJECT_RULES.md](../PROJECT_RULES.md) (sezione "Product Execution Rule") · [context/KNOWN_ISSUES.md](context/KNOWN_ISSUES.md).
- **Sostituisce:** — (rafforza [ADR-0018] e PRODUCT.md §18)

## ADR-0021 — Milestone-scoped RED delegation (il milestone come unità di autorizzazione)
- **Data:** 27/09/2026 · **Stato:** Approvata · **Categoria:** Process
- **Contesto:** con il modello per-azione ogni push/deploy dentro un milestone già approvato richiedeva una nuova interruzione umana, anche quando perimetro, controlli e rollback erano identici a quelli già autorizzati (es. SHIP Router Sprint #1: push+deploy+smoke approvati insieme, poi Email E2E bloccato in attesa di APPROVE ripetute).
- **Problema:** mantenere le azioni RED classificate, auditabili e fail-closed riducendo le interruzioni umane senza valore decisionale aggiunto.
- **Alternative:** per-azione puro (troppe interruzioni); delega totale (inaccettabile: perde il controllo umano su scope/strategia); grant tecnici per-comando nel control plane (granularità sbagliata: il rischio vive a livello di outcome, non di comando).
- **Decisione:** il **milestone esplicitamente approvato da Jacopo** diventa l'unità di autorizzazione operativa. Un'azione RED è auto-eseguibile senza nuovo stop umano solo se **tutte** le condizioni valgono: (1) milestone già approvato esplicitamente; (2) azione prevedibile e necessaria alla sua chiusura; (3) esattamente dentro perimetro/acceptance criteria approvati; (4) controlli tecnici Claude+Codex completati; (5) pin/stato/precondizioni verificati fail-closed; (6) nessun nuovo effetto esterno sostanziale non previsto; (7) nessun cambio di decisione strategica/prodotto/architettura; (8) rollback/recovery ragionevole quando applicabile; (9) audit/evidence completi. Fresh Human Authority resta obbligatoria per l'elenco in [../PROJECT_RULES.md](../PROJECT_RULES.md) ("Milestone-scoped RED delegation"). **Fail-closed:** nel dubbio l'azione è una nuova RED.
- **Motivazioni:** decisione strategica esplicita di Jacopo (27/09/2026); il controllo umano si concentra dove aggiunge valore (approvazione dell'envelope, scope, strategia) invece che su ogni comando già previsto.
- **Conseguenze positive:** milestone completabili end-to-end senza attese morte; audit invariato (ogni RED resta registrata con pin ed evidence); il confine umano è esplicito e verificabile.
- **Trade-off:** più responsabilità sull'accuratezza dell'envelope al momento dell'APPROVE; mitigato dalla fail-closed rule e dall'obbligo di POST-MILESTONE REPORT.
- **Documenti:** [../PROJECT_RULES.md](../PROJECT_RULES.md) ("Milestone-scoped RED delegation") · [SECURITY.md](SECURITY.md) · [context/NEXT_TASK.md](context/NEXT_TASK.md).
- **Sostituisce:** — (specializza [ADR-0011] e ADR-0019 per il processo di release: le tutele guest-facing e di sicurezza restano invariate)

## ADR-0022 — System Map canonica e domini target approvati (Full Product Reconstruction)
- **Data:** 28/09/2026 · **Stato:** Approvata · **Categoria:** Product
- **Contesto:** il prodotto finale (domini, workflow, confini, direzioni) esisteva in parte solo nelle vecchie chat, nelle fonti esterne mai committate (`BRAND_FOUNDATIONS_SUMMARY`, `MASTER_PRODUCT_SUMMARY`, `PRODUCT_SOURCE_MAP`) e in `docs/archive/*` marcato "superato" — invisibile a chi legge i doc correnti. Un agente non può sviluppare Vesta correttamente senza una mappa canonica nel repo (la Costituzione stessa dichiara la visione di lungo periodo un'Open Question, Parte III item 9).
- **Problema:** fissare nel repository, in modo canonico e tracciabile, che cosa deve diventare Vesta — separando implementato, approvato-non-implementato, idea storica compatibile, superato e aperto — senza inventare né promuovere idee prive di evidence.
- **Alternative:** gonfiare PRODUCT.md (violerebbe i suoi confini); espandere WORKFLOW.md (mischierebbe policy corrente vincolante e target); lasciare la visione nelle chat (lo status quo che questo ADR corregge).
- **Decisione:** (1) creare **`docs/SYSTEM_MAP.md`** come SSOT della **mappa operativa target** (current → target per dominio, con legenda di tracciabilità ✅◐◇○?✕ e provenienza); confine SSOT esplicito: principi → PRODUCT, comportamento corrente vincolante → WORKFLOW, ordine → ROADMAP, come tecnico → ARCHITECTURE. (2) Formalizzare come **approved target (◇)** gli input di prodotto del founder (27–28/09/2026): Guest Experience/Concierge con consigli contestuali e direzione "Vesta Experiences" dentro il guest journey; **Revenue & Market Intelligence come pilastro** (property/market/competitor/channel data) con progressione obbligatoria observe→analyze→recommend→approve→execute→verify→policy-bounded autonomy; guest journey completo fino al post-stay; Operational Queue correlata; **Operational Memory come pilastro** (FACTS PERSIST, ACTIONS FOLLOW POLICY); Document/Admin target completo; Financial Intelligence come controllo operativo (non contabilità); housekeeping/maintenance/suppliers nel target OS (supera il ranking "fuori scope" del product-brief archiviato); Management Intelligence che spiega "cosa merita attenzione e perché"; multi-property senza hardcoding LunArt nel core. (3) Il recupero storico è classificato nel ledger della mappa (A–E) mantenendo il livello di certezza originale.
- **Motivazioni:** input espliciti e approvati del founder in questo milestone; ADR-0018 (lo stato vive nel repo); autonomia futura degli agenti.
- **Conseguenze positive:** un agente può sviluppare Vesta dal repo; current vs target separati; le idee storiche non si perdono né si promuovono indebitamente.
- **Trade-off:** un documento in più da mantenere (mitigato dal confine SSOT netto e dalla legenda di status).
- **Documenti:** [SYSTEM_MAP.md](SYSTEM_MAP.md) · [foundations/PRODUCT.md](foundations/PRODUCT.md) · [ROADMAP.md](ROADMAP.md).
- **Sostituisce:** — (dettaglia PRODUCT §3 e scioglie parzialmente Parte III item 9: la mappa dei domini è ora canonica; restano aperti naming, ruolo nel settore a 5–10 anni, pricing, brand story)

## ADR-0023 — Provider Action Contract: browser governato come execution adapter di prima classe
- **Data:** 28/09/2026 · **Stato:** Approvata · **Categoria:** Architecture
- **Contesto:** le operazioni provider (Booking, QuoVai, Expedia, futuri PMS/CM) sono il collo di bottiglia del target: le API possono non esistere, essere riservate a partner, costose, incomplete o non ancora integrate. Il founder ha già creato/previsto **account dedicati limitati** (Booking, QuoVai) proprio per operare con minimum privilege anche senza API.
- **Problema:** progettare i workflow provider senza l'assunzione "provider operation = API integration required", mantenendo governance, audit e i confini di piattaforma.
- **Alternative:** attendere sempre le API ufficiali (blocca il prodotto); scraping non sanzionato (fragile, contro ToS — già rifiutato dall'architettura storica); duplicare un browser generico dentro Vesta (viola il confine di piattaforma).
- **Decisione:** ogni decisione hospitality si esprime come **Provider Action Contract** indipendente dal mezzo, eseguito da uno di tre adapter in ordine canonico: **(1) API/connector ufficiale** quando disponibile, affidabile ed economicamente giustificato; **(2) browser/UI automation GOVERNATA e AUTENTICATA** con account Vesta dedicato minimum-privilege — **execution adapter di prima classe, non un hack temporaneo**; **(3) human manual adapter**. Confine di riuso: il runtime browser generico (sessioni, credential isolation, form, evidence, recovery) è capability di piattaforma (WorkspaceOS / infrastruttura riusabile — il suo stato vivo NON è asserito nel repo Vesta: seam dichiarato, source of truth = WorkspaceOS); Vesta resta owner di intent, workflow, decisione, policy, risk class, expected result, verifica post-azione e semantica di audit hospitality; selettori/procedure provider-specific possono vivere lato Vesta/adapter. Governance target (contract, non implementazione): action preview → approval gate → bounded authorization → evidence before/after → final-state verification → fail-closed; credenziali mai in repo/chat.
- **Motivazioni:** input founder approvato (27–28/09); il workflow non si ridisegna quando un provider passa da browser ad API.
- **Conseguenze positive:** i domini C/D/E diventano progettabili oggi; il confine WorkspaceOS/Vesta resta netto; audit uniforme sui tre adapter.
- **Trade-off:** la capability browser va costruita/riusata con disciplina (governance sopra) prima di qualsiasi write.
- **Documenti:** [SYSTEM_MAP.md](SYSTEM_MAP.md) §2 · [archive/pricing-availability-architecture.md](archive/pricing-availability-architecture.md).
- **Sostituisce:** con distinguo, la preferenza storica "osservazione OTA manuale (no scraping automatico)" di [archive/pricing-availability-architecture.md] §3.1: quella cautela resta valida per lo scraping NON sanzionato; il browser governato con account propri dedicati è un caso diverso. **NON modifica ADR-0011/ADR-0019**: oggi nessun provider write, nessun login automatizzato, nessuna mutazione — questo ADR autorizza documentazione e design, non esecuzione.

## ADR-0024 — Autonomia progressiva L0–L4 (policy-bounded)
- **Data:** 28/09/2026 · **Stato:** Approvata · **Categoria:** Product
- **Contesto:** il target OS richiede che Vesta arrivi a eseguire classi di azione delegate; oggi il confine è ADR-0011 (HITL, nessuna azione autonoma sullo stato operativo senza PMS affidabile). Serviva il modello canonico della progressione, per non farla emergere implicitamente feature per feature.
- **Problema:** definire COME cresce l'autonomia senza mai creare "autonomia totale" generica.
- **Alternative:** autonomia per-feature implicita (non auditabile); delega generica (inaccettabile).
- **Decisione:** modello a 5 livelli — **L0 OBSERVE · L1 RECOMMEND · L2 APPROVE&EXECUTE · L3 POLICY DELEGATION (Jacopo approva un envelope/policy) · L4 AUTONOMOUS OPERATIONS (solo classi già delegate)**. La delega è specifica per workflow · property · provider · classe di azione · livello di rischio · policy bounded. Ogni azione porta source, confidence, actor, policy, risk, approval state, execution evidence, verification, audit e recovery/rollback quando applicabile. Pagamenti, azioni irreversibili, secrets e modifiche di sicurezza provider mantengono SEMPRE il loro Human Authority boundary a qualunque livello.
- **Motivazioni:** input founder approvato; coerenza con ADR-0011 (che resta il gate corrente), ADR-0019 (invarianti di sicurezza) e ADR-0021 (delega per-milestone nel processo di sviluppo — stesso principio, piano diverso).
- **Conseguenze positive:** ogni futura richiesta di autonomia si colloca su una scala nota, con requisiti espliciti; l'invariante revenue "l'AI non fissa mai i prezzi da sola" diventa un caso di L1/L2 finché una policy L3 non delega classi specifiche.
- **Trade-off:** più struttura da rispettare a ogni salto di livello (voluto).
- **Documenti:** [SYSTEM_MAP.md](SYSTEM_MAP.md) §1 · ADR-0011 · ADR-0021.
- **Sostituisce:** — (specializza ADR-0011 verso il futuro senza modificarne il vincolo corrente)

---

## Related Documents
- [../PROJECT_RULES.md](../PROJECT_RULES.md) — le regole che queste decisioni codificano
- [ARCHITECTURE.md](ARCHITECTURE.md) — applicazione tecnica delle decisioni
- [BUSINESS.md](BUSINESS.md) · [DOMAINS.md](DOMAINS.md) — direzione e verticali (ADR-0007, 0008)
- [CHANGELOG.md](CHANGELOG.md) — eventi (es. incidente che ha generato ADR-0004/0009)
