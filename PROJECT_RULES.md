# PROJECT_RULES.md — Costituzione di Vesta Hospitality

Regole **permanenti** di sviluppo del progetto. Valgono per ogni contributo, umano o AI.
Qui NON ci sono dettagli tecnici: ogni regola rimanda al documento `docs/` competente, che è la
sua fonte ufficiale. In caso di conflitto tra una scelta operativa e queste regole, **prevalgono
queste regole**. Le modifiche a questo file sono decisioni di processo: vanno registrate in
[docs/DECISIONS.md](docs/DECISIONS.md).

---

## Principio guida — Product First
Ogni decisione tecnica parte dal **prodotto**, non dalla tecnologia. Non introduciamo architetture,
astrazioni, pattern o complessità solo perché eleganti dal punto di vista ingegneristico: **ogni
livello di complessità deve essere giustificato da un reale beneficio per il prodotto o per la sua
evoluzione**. L'architettura segue le esigenze del prodotto, mai il contrario. Questo principio è
trasversale e prevale nel dubbio: a parità di risultato per il prodotto, si sceglie la soluzione più
semplice.

---

## 1. Definition of Done
Una funzionalità è **completata** solo quando, *contemporaneamente*:
1. il codice è integrato nel branch **`main`**;
2. le migrazioni sono **realmente applicate e verificate con `to_regclass`** (mai assunte);
3. è stato eseguito con successo un **test end-to-end sul percorso reale**;
4. la **documentazione di contesto** in `docs/context/` è aggiornata — almeno `CURRENT_STATE.md`, `NEXT_TASK.md` e `PROJECT_SYNC_REPORT.md` (vedi §13).

Se manca anche un solo punto → la feature è **"implementata, non completata"**.
→ dettagli: [docs/DATABASE.md](docs/DATABASE.md), [docs/TESTING.md](docs/TESTING.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/context/](docs/context/)

## 2. Classificazione delle affermazioni tecniche
Ogni affermazione tecnica deve essere etichettata come **verificata**, **dedotta** o **ipotizzata**.
- **Verificata** = ha una **prova oggettiva** (output di comando, risultato di query, log, screenshot).
- Una deduzione o un'ipotesi non vanno mai presentate come fatti.
- **Mai assumere vero ciò che non è stato verificato direttamente.** "Sembra funzionare" non è una
  verifica: gli errori possono essere nascosti (vedi Fail-Fast, §4).

## 3. Single Source of Truth
Ogni argomento ha **un solo documento ufficiale**. Se una modifica interessa più documenti,
l'informazione **completa** si aggiorna **solo nel documento principale**; gli altri si limitano a
**rimandare** a quello, senza copiarne il contenuto. Obiettivo: non solo evitare duplicazioni, ma
**impedire che due documenti possano divergere nel tempo**.

## 4. Fail-Fast Policy
**Nessun errore Supabase/DB può essere ignorato.** Ogni scrittura/lettura controlla `.error`:
i percorsi dati **lanciano** (helper `dbThrow`), la telemetria best-effort **logga** (mai silenziosa).
Un guasto deve esplodere subito, non nascondersi.
→ dettagli: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 5. Human-in-the-Loop
Le azioni **Tier 2** sono **sempre approvate dallo staff**. Vesta non blocca camere, non invia
l'IBAN, non conferma prenotazioni e non compie azioni irreversibili verso l'ospite senza approvazione
umana. **Vincolo permanente (fino a integrazione PMS ufficiale):** finché Vesta non avrà
un'integrazione affidabile con PMS/Channel Manager, **non esegue autonomamente alcuna azione che
modifichi lo stato operativo** (bloccare/liberare camere, disponibilità, tariffe, conferme,
pagamenti, aggiornamenti PMS). → elenco completo + flusso: [docs/DECISIONS.md](docs/DECISIONS.md)
ADR-0011, [docs/SECURITY.md](docs/SECURITY.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 6. Migrazioni sempre verificate
Una migrazione **non è "applicata"** finché il catalogo del DB reale non lo conferma (`to_regclass`).
Si applica **una migrazione funzionale per volta**, verificando ogni volta.
→ dettagli: [docs/DATABASE.md](docs/DATABASE.md), [docs/RUNBOOKS/apply-migration.md](docs/RUNBOOKS/apply-migration.md)

## 7. Documentation as Code
La documentazione **fa parte del prodotto**. Ogni modifica significativa a **architettura, database,
infrastruttura, workflow, capability, API o processi operativi** aggiorna **contestualmente** la
documentazione interessata. Una funzionalità con un aggiornamento documentale ancora da eseguire
**non è completata** (integra la Definition of Done, §1). Una PR che cambia il comportamento del
sistema senza aggiornare la doc è **incompleta**.

**ADR-driven changes**: prima di modificare un'area importante, verificare l'ADR collegata in
[docs/DECISIONS.md](docs/DECISIONS.md). La modifica dev'essere **coerente** con quella decisione, oppure
creare una **nuova ADR che la sostituisce** esplicitamente. Nessuna decisione architetturale importante
va modificata implicitamente.

## 8. Deploy
La **produzione** si distribuisce **solo dal branch `main`** (auto-deploy). I test si fanno su
**Preview**. La Deployment Protection resta attiva.
→ dettagli: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md)

## 9. Branching
Si lavora su **feature branch**; il merge in `main` avviene **solo a Definition of Done soddisfatta**;
una migrazione funzionale per volta. → dettagli: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## 10. Testing
**Test offline** (in `app/scripts/`) **+ E2E reale** prima di dichiarare "fatto".
→ dettagli: [docs/TESTING.md](docs/TESTING.md)

## 11. Sicurezza e minimo privilegio
I **segreti** non compaiono mai in chat né nel repository; vanno **ruotati prima del go-live**
pubblico. Vale il **principio del minimo privilegio**: nessun nuovo accesso/credenziale se non
strettamente necessario. Isolamento multi-tenant via RLS.
→ dettagli: [docs/SECURITY.md](docs/SECURITY.md)

## 12. Pilota sicuro
**Autosend OFF di default**; kill-switch sempre disponibile; nessuna automazione che possa contattare
ospiti reali senza verifica preventiva.
→ dettagli: [docs/SECURITY.md](docs/SECURITY.md), [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md)

## 13. Context Layer — lo stato vivo vive nel repo
La **fonte di verità dello stato del progetto è il repository**, non le chat né la memoria di un
assistente. Lo stato vivo è in `docs/context/` (distinto dalla *conoscenza* in `docs/`): `CURRENT_STATE.md`
(fotografia), `NEXT_TASK.md` (prossimo passo), `OPEN_DECISIONS.md` (solo decisioni non ancora prese),
`KNOWN_ISSUES.md` (problemi/rischi), `PROJECT_SYNC_REPORT_TEMPLATE.md` (template) e `PROJECT_SYNC_REPORT.md`
(report vivo da incollare per riallineare un assistente). Sono **snapshot sintetici che rimandano** alle
SSOT (§3): non duplicano ROADMAP/CHANGELOG/SECURITY/DECISIONS. **Ogni milestone importante li aggiorna
prima di essere considerata completa** (integra §1.4). → dettagli: [docs/context/](docs/context/),
[docs/DECISIONS.md](docs/DECISIONS.md) ADR-0018.

---

*Le regole sono permanenti; i dettagli vivono nei documenti `docs/`. La mappa della documentazione è in
[docs/README.md](docs/README.md).*
