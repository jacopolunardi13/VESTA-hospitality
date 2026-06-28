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
| ADR-0011 | Human-in-the-Loop (Tier 1/Tier 2) | Architecture | Approvata | [ARCHITECTURE.md](ARCHITECTURE.md) |
| ADR-0012 | Pipeline Knowledge-First | AI | Approvata | [AI.md](AI.md) |
| ADR-0013 | Orchestrazione condivisa tra canali | Architecture | Approvata | [ARCHITECTURE.md](ARCHITECTURE.md) |
| ADR-0014 | Seam Registry/Recognizer | Architecture | **Superata (→ ADR-0017)** | [ARCHITECTURE.md](ARCHITECTURE.md) |
| ADR-0015 | Governance delle ADR (ADR-driven changes) | Process | Approvata | DECISIONS.md |
| ADR-0016 | Architettura "Operating System" a strati (acquisition-first) | Architecture | Approvata | [ARCHITECTURE.md](ARCHITECTURE.md) |
| ADR-0017 | Recognizer = interpreti, non gatekeeper (Universal Intake) | Architecture | Approvata | [ARCHITECTURE.md](ARCHITECTURE.md) |

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
- **Data:** giugno 2026 ◐ (consolidata 27/06/2026) · **Stato:** Approvata · **Categoria:** Architecture
- **Contesto:** azioni che impegnano denaro/camere/promesse verso l'ospite.
- **Problema:** cosa può fare Vesta in autonomia e cosa no.
- **Alternative:** automazione totale; approvazione manuale di tutto.
- **Decisione:** Tier 1 (concierge/FAQ/preventivo informativo) automatico; Tier 2 (proposta, conferma,
  IBAN, blocco camera) sempre approvato dallo staff. Vesta non blocca camere, non invia IBAN, non
  conferma da sola.
- **Motivazioni:** fiducia e sicurezza; Vesta assiste, non sostituisce il gestore.
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

---

## Related Documents
- [../PROJECT_RULES.md](../PROJECT_RULES.md) — le regole che queste decisioni codificano
- [ARCHITECTURE.md](ARCHITECTURE.md) — applicazione tecnica delle decisioni
- [BUSINESS.md](BUSINESS.md) · [DOMAINS.md](DOMAINS.md) — direzione e verticali (ADR-0007, 0008)
- [CHANGELOG.md](CHANGELOG.md) — eventi (es. incidente che ha generato ADR-0004/0009)
