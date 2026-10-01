/**
 * ============================================================================
 * MODULO PRE-ARRIVAL — fondamenta
 * ============================================================================
 *
 * Sede del dominio "sapere cosa manca prima dell'arrivo e chiedere l'ETA quando manca"
 * (SYSTEM_MAP, journey TARGET). Questo file è la superficie pubblica del modulo e il
 * VERBALE delle due dipendenze di §11.2: derivazione, letture e azioni poggiano su
 * quanto è registrato qui e non ri-decidono nulla.
 *
 * Confini: questi file non importano Supabase, `lib/ai/*`, `delivery/*` — il guard del test
 * cerca i frammenti `supabase`, `/ai/`, `delivery/`, quindi è indipendente dal prefisso del
 * percorso e non si fa aggirare da un `@/delivery/x` privo di `lib/`.
 * Il modulo descrive il dominio; l'I/O e la consegna arrivano dai livelli che lo useranno.
 * ✅ VERIFICATO per ispezione diretta (ricerca degli specificatori di modulo su tutta la
 * cartella): gli unici importati sono i fratelli `./vocabulary`, `./window`, `./anchor`,
 * `./card`, `./types`, `./index` e quattro builtin `node:` (`crypto`, `fs`, `path`, `url`);
 * `window.ts` non importa nulla. Il test del modulo presidia l'invariante nel tempo — ma
 * quel test non è ancora stato eseguito, quindi oggi la garanzia è l'ispezione, non il test.
 *
 * TEST DEL MODULO (offline, deterministico, nessuna rete né credenziale), da `app/`:
 *   node --import tsx src/lib/prearrival/foundations.test.mts
 * Vive dentro il modulo perché `app/package.json` e `app/scripts/` sono fuori dagli
 * allowed paths di questo task: l'aggancio a `npm run test:*` è un passo successivo.
 * La FORMA del comando non è inventata: è l'idioma di test già in uso nel repo — ✅ verificato
 * in `app/package.json`, dove `test:router` incatena tre `node --import tsx scripts/*.mts`.
 * Quando si aggancerà, basterà aggiungere questo file a quella catena.
 * Il test importa la superficie pubblica per percorso RELATIVO (`./index`) e non con
 * l'alias `@/lib/prearrival` usato da `app/scripts/`: l'alias vive in `app/tsconfig.json`
 * e tsx lo risolve dalla CWD, quindi legherebbe il test all'essere lanciato da `app/`.
 * Così gira da qualunque cartella; da `app/` il comando qui sopra resta quello canonico.
 * Oltre al comportamento verifica quattro invarianti STRUTTURALI, leggendo i sorgenti della
 * cartella (compreso se stesso): nessun import proibito, nessuna lettura implicita
 * dell'orologio, nessuna stringa del vocabolario duplicata fuori da `vocabulary.ts`, e
 * l'insieme delle azioni ammesse congelato a runtime. Il rilevatore di import è a sua volta
 * messo alla prova su un campione sintetico: un controllo che non trova nulla non protegge.
 *
 * ⚠️ `tsx` SERVE DAVVERO: non lo si può sostituire con il solo Node. Node 24 sa già togliere
 * le annotazioni di tipo da un `.mts` senza transpiler, quindi `node <file>.mts` sembra una
 * semplificazione — ma il test importa `./index` SENZA estensione, e il risolutore ESM di Node
 * non prova estensioni né `index` di cartella: fallirebbe in `ERR_MODULE_NOT_FOUND` prima di
 * eseguire un solo controllo. (◐ DEDOTTO dal risolutore, non misurato: la via è stata tentata
 * e l'esecuzione è stata negata, vedi sotto.) Chi volesse quella strada deve prima riscrivere
 * ogni specificatore con l'estensione esplicita; finché gli import restano così, `tsx` è un
 * requisito e non una preferenza.
 *
 * ----------------------------------------------------------------------------
 * STRUMENTI DI VERIFICA — ciò che è eseguibile qui e ciò che non lo è
 * ----------------------------------------------------------------------------
 * In questo ambiente NON è disponibile alcuna shell, e la cosa è ri-accertata a ogni sessione
 * invece di essere ereditata. Esito MISURATO, non supposto:
 *   · il tool `Bash` è stato INVOCATO, non cercato in un registro, e ha risposto alla lettera:
 *     «No such tool available: Bash. Bash is disabled for this session, in subagents as well as
 *     here.» Quel messaggio chiude anche la via del sub-agente senza bisogno di tentarla: la
 *     shell non è negata per permessi, è assente dalla sessione e da ogni sessione figlia.
 *   · il solo altro tool capace di lanciare comandi (`Monitor`) auto-approva unicamente
 *     invocazioni banali. Ri-tentato nella sessione del 01/10/2026 in QUATTRO forme, con le
 *     risposte raccolte alla lettera (non è una via «presunta chiusa», è una via battuta):
 *       – `node --import <abs>/tsx/dist/loader.mjs <abs>/foundations.test.mts > <log> 2>&1`
 *         → «Output redirection to '/tmp/…' was blocked … may only write to files in the
 *           allowed working directories». Scartata anche riportando il log dentro il worktree:
 *           sarebbe un artefatto fuori dagli allowed paths, e qui non c'è modo di rimuoverlo.
 *       – la stessa con `cd … && node …` e con `… 2>&1 | grep -E --line-buffered …`
 *         → «This Bash command contains multiple operations. The following part requires
 *           approval: …» (sia la forma con `cd`, sia il solo `2>&1`/pipe).
 *       – la forma a operazione singola, con percorsi assoluti e con percorsi relativi
 *         → «This command requires approval» in entrambi i casi.
 *     Da sessioni precedenti anche «Permission to use Monitor has been denied» (da sub-agente).
 *   · `.claude/settings.json` pre-autorizza `Bash(node:*)`, ma quella regola presuppone il tool
 *     `Bash`, che qui non esiste. (`node --version` → `v24.18.0`: l'eseguibile c'è sul disco, è
 *     l'esecuzione a non essere raggiungibile da qui.)
 * Per una sessione che abbia la shell: siccome `cd` non è concesso, la forma a operazione
 * singola equivalente al comando canonico è
 *   node --import <repo>/app/node_modules/tsx/dist/loader.mjs \
 *        <repo>/app/src/lib/prearrival/foundations.test.mts
 * ✅ verificato che non fallirebbe per una dipendenza: `app/node_modules/tsx/package.json` dà
 * `"version": "4.22.4"` e mappa l'export `.` esattamente su `./dist/loader.mjs`, che esiste in
 * questo worktree. Il test non dipende dalla CWD (vedi la sua testata).
 *
 * Conseguenza, detta per intero: **il comando di test NON è mai stato eseguito.** Il criterio
 * di accettazione «il comando di test è verde» è perciò APERTO, e si chiude solo eseguendo il
 * comando sopra in una sessione con shell. Al suo posto esiste una verifica A TAVOLINO, ◐
 * DEDOTTA e dichiarata tale: gli invarianti che il test controlla a runtime sono stati
 * ricontrollati a mano con il tool di ricerca (nessuna stringa del vocabolario fuori da
 * `vocabulary.ts`; nessuno specificatore proibito negli import; nessuna lettura implicita
 * dell'orologio → 0 riscontri su tutta la cartella) e il vettore noto di UUID v5 è stato
 * riconciliato con RFC 4122 §4.3 leggendo `anchor.ts`. Nessuna di queste è una prova che il
 * test passi: finché non gira, "verde" resta ○ IPOTIZZATO.
 *
 * QUANTO VALE DAVVERO QUELLA VERIFICA A TAVOLINO — misurato, non argomentato. Il 01/10/2026 ha
 * trovato un errore che nessuna delle ricerche sopra poteva vedere, perché non era una stringa
 * fuori posto ma un tipo: `card.ts` costruiva l'elenco degli stati con
 * `Object.freeze<PrearrivalCardStateKind>([…])`, citando in un commento un overload
 * `freeze<T>(a: T[]): readonly T[]`. Quell'overload NON esiste —
 * `node_modules/typescript/lib/lib.es5.d.ts:222-234` (TypeScript 5.9.3, letto) ne dichiara tre, e
 * con un solo argomento di tipo esplicito resta applicabile soltanto `freeze<T>(o: T): Readonly<T>`,
 * che legando `T = PrearrivalCardStateKind` rifiuta un array. Corretto derivando l'elenco dalle
 * chiavi di `CATALOG` (che il compilatore già obbliga a essere esaustivo) e congelando come
 * istruzione separata; la motivazione sta in `card.ts`. Due letture da tenere insieme: una verifica
 * per ispezione NON è teatro, perché ha morso; e proprio per questo non sostituisce l'esecuzione,
 * perché l'errore era lì da una stesura precedente che si dichiarava verificata.
 *
 * E IL LIMITE DI QUELLA VERIFICA, misurato dalla revisione successiva: né le ricerche né il test
 * hanno visto il difetto più grave di questo modulo — l'autorizzazione delle azioni che leggeva
 * l'elenco dei permessi dall'oggetto ricevuto dal chiamante (sezione «AUTORIZZAZIONE DELLE
 * AZIONI» più sotto). Non poteva vederlo nessuno dei controlli presenti: il codice era
 * tipocorretto, non duplicava vocabolario, non importava nulla di proibito e il test lo
 * esercitava solo con stati costruiti dal modulo stesso, cioè con l'input gentile. La lezione
 * incorporata, non raccontata: gli invarianti di autorizzazione si verificano con input OSTILE
 * (stati confezionati a mano, `kind` sconosciuti, nomi del prototipo), e quei casi ora sono nel
 * test. Un presidio provato solo sul percorso felice è una dichiarazione, non una verifica.
 *
 * E non era un difetto innocuo di un file di test: ✅ verificato che QUESTO MODULO STA DENTRO LA
 * SUPERFICIE TIPOCONTROLLATA del progetto. `app/tsconfig.json` elenca in `include` sia `** /*.ts`
 * sia `** /*.mts` (riga 31; lo spazio dopo `**` va tolto prima di usarli — vedi l'avvertenza 1 più
 * sotto, che spiega perché in questo commento non può non esserci) — quindi anche
 * `foundations.test.mts`, che non è "fuori dal build" come il suo nome suggerirebbe — e
 * `app/next.config.ts`, letto integralmente, non contiene alcun
 * `typescript.ignoreBuildErrors`. Conseguenza: un errore di tipo in uno qualunque di questi file
 * fa fallire `next build`, non solo il test. Perciò `next build` è il secondo comando che chiude
 * questo task, ed è anch'esso NON ESEGUIBILE da qui per la stessa ragione (nessuna shell).
 *
 * Le ricerche, invece, sono state eseguite davvero, con il tool di ricerca del repository
 * (è ripgrep, esclusi i file ignorati da git) e con il tool di glob; sotto, per ciascuna, il
 * comando `rg` equivalente riproducibile a mano da `app/` e l'esito OSSERVATO.
 * DUE AVVERTENZE PER CHI RIESEGUE I COMANDI:
 *   1. nei glob qui sotto `**` e la barra che segue sono separati da uno spazio
 *      (`'src/app/** /route.ts'`). Non è un errore di battitura ed è obbligatorio: questo
 *      verbale vive in un commento di blocco, e un asterisco seguito da barra lo chiuderebbe
 *      a metà frase. Prima di eseguire un comando va TOLTO quello spazio.
 *   2. ogni ricerca ESCLUDE `src/lib/prearrival/`. Il verbale cita i pattern che cerca, quindi
 *      senza quel filtro troverebbe se stesso, e il conteggio cambierebbe a ogni riscrittura
 *      del commento — un numero che si misura da sé non è un riscontro. Con l'esclusione
 *      l'esito è stabile e dice ciò che conta: nel codice che gira non c'è nulla. Come è stata
 *      ottenuta, per trasparenza: il tool di ricerca disponibile non accetta il glob negato,
 *      quindi le ricerche sono state eseguite SENZA esclusione e si è verificato il percorso di
 *      OGNI riscontro, uno per uno; tutti cadono dentro `src/lib/prearrival/`.
 *
 * I due verdetti sono stati ri-verificati in modo indipendente da più sessioni e sono
 * INVARIATI. Il giro non è però mai stato a vuoto: ha corretto tre errori di verbale, che non
 * sono registrati come cronaca ma incorporati dove servono — il controllo della superficie
 * sempre attiva cercava `middleware.ts`, nome che Next 16 non usa più (punto 6); il verdetto
 * (b) offriva `updated_at` come colonna per il guard, e quella colonna non esiste; l'esito
 * «soggiorno annullato» collideva con uno `status` di `operational_tasks` (§5.6 in fondo).
 * Nessun esito è dedotto: ciò che non è eseguibile è dichiarato NON VERIFICATO e trattato
 * come tale.
 * Giro del 01/10/2026 — ri-eseguite le ricerche decisive e RILETTE una per una tutte le citazioni
 * puntuali di questo verbale, perché un numero di riga che nessuno ricontrolla invecchia in
 * silenzio. Tutte confermate alla lettera: il perimetro (9 `route.ts` + 10 `actions.ts` = 19, più
 * `src/proxy.ts` e nessun `middleware.ts`); zero assegnazioni di `runtime` fuori da questa
 * cartella; `src/lib/ai/guardrail.ts:80` come unico `->>` del TypeScript applicativo;
 * `proxy.md:223` e `:774` nella doc di Next 16.2.9 installata; la 0014 colonna per colonna
 * (`created_at` sì, `updated_at` no) con il suo CHECK su `status` e `CREATE INDEX` parziale non
 * UNIQUE; `resolveTaskForBooking` (`src/lib/tasks/operationalTasks.ts:86-98`) che filtra solo
 * scalari e controlla solo `error`. Di verbale, in quel giro, nulla da correggere; di codice,
 * il tipo in `card.ts` descritto sopra. I due verdetti (a) e (b) NON sono toccati dalla
 * revisione successiva, che ha trovato un difetto High nell'autorizzazione delle azioni
 * (sezione qui sotto): è un altro piano del modulo e non rimette in discussione né la scelta
 * della chiave primaria né la forma del guard di concorrenza.
 *
 * ----------------------------------------------------------------------------
 * AUTORIZZAZIONE DELLE AZIONI — il confine di fiducia (correzione del 01/10/2026)
 * ----------------------------------------------------------------------------
 * Difetto High rilevato in revisione, registrato qui perché riguarda un invariante del
 * modulo e non un dettaglio di un file: l'elenco delle azioni ammesse era un campo dello
 * STATO DELLA CARD (`PrearrivalCardState.allowedActions`) e `isActionAllowed(state, action)`
 * rispondeva leggendo quel campo. Essendo lo stato un oggetto serializzabile, attraversa il
 * confine in entrambi i versi — server → props, client → argomenti di una server action —
 * quindi una action che lo accettasse (la forma naturale: è ciò che ha appena reso) chiedeva
 * al chiamante se il chiamante fosse autorizzato. Una richiesta con `kind` degradato e
 * `allowedActions` riscritto a mano otteneva la stesura della comunicazione all'ospite:
 * esattamente ciò che il catalogo esiste per impedire.
 * CORREZIONE, nel verso di rendere il difetto inesprimibile e non di mitigarlo:
 *   · l'elenco è stato RIMOSSO dallo stato (`types.ts`) — non c'è più nulla da falsificare
 *     perché non c'è più nulla da spedire; l'unico elenco è il catalogo di `card.ts`, locale
 *     al modulo e congelato;
 *   · la verifica prende il `kind` (stringa di un insieme chiuso) e non l'oggetto, con firma
 *     `unknown` perché è una funzione di confine e un cast nasconderebbe il rischio;
 *   · fail-closed su tutto l'ignoto, senza schiantare: `kind` non riconosciuto ≡
 *     `undetermined` (che non ammette né stesura né registrazione di esito), azione non
 *     riconosciuta negata, e il catalogo mai indicizzato con una stringa non validata — con
 *     `'__proto__'` un accesso diretto darebbe `Object.prototype` e la lettura successiva
 *     lancerebbe, cioè un 500 al posto di un rifiuto.
 * OBBLIGO RESIDUO PER IL LIVELLO DELLE AZIONI (fuori da questo task, deciso qui): il `kind`
 * passato alla verifica va RI-DERIVATO lato server nella stessa richiesta, dai fatti
 * (copertura della knowledge base, canale, freschezza della riga). Un `kind` che arriva con
 * la richiesta è un suggerimento di rendering. E questa verifica non sostituisce quella
 * sull'organizzazione: dice solo che l'azione è coerente con lo stato.
 * Il test del modulo presidia l'invariante con stati CONFEZIONATI A MANO (elenco di azioni
 * iniettato, `kind` sconosciuto, `'__proto__'`): un controllo di autorizzazione che non è
 * stato messo alla prova con un input ostile non è stato verificato.
 *
 * ----------------------------------------------------------------------------
 * (a) §11.2 — RUNTIME EDGE ⇒ scelta della chiave primaria      ESITO: ✅ VERIFICATO
 * ----------------------------------------------------------------------------
 * Domanda: esiste una route o una server action dell'app che giri su edge runtime?
 * Se sì `node:crypto` non è disponibile lì e la PK deterministica non è percorribile.
 *
 * Comandi eseguiti (da `app/`) ed esito osservato (vedi le due avvertenze qui sopra):
 *   1. rg -n "runtime\s*=\s*['\"]edge['\"]" -g '!src/lib/prearrival/**' .
 *      → 0 riscontri.
 *   2. rg -n "export const runtime" -g '!src/lib/prearrival/**' .
 *      → 0 riscontri (ricerca su tutto il repository, non solo su `src`).
 *   3. rg -n "runtime\s*=" -g "*.{ts,tsx,mts,mjs,js}" -g '!src/lib/prearrival/**' .
 *      → 0 riscontri: in tutto il repository non si assegna MAI un `runtime`, a nessun
 *        valore. Non è che l'edge sia escluso: la direttiva non esiste.
 *   4. rg -ni "\bedge\b" -g "*.{ts,tsx,mts,mjs,js,json}" -g '!src/lib/prearrival/**' .
 *      → 0 riscontri. (A confine di parola, per non annegare nei "knowledge"/"ledger".)
 *   5. Perimetro ENUMERATO, non stimato:
 *        rg --files -g 'src/app/** /route.ts'    → 9 file
 *        rg --files -g 'src/app/** /actions.ts'  → 10 file          ⇒ 19 route e action
 *        rg -l "use server" -g '!src/lib/prearrival/**' .  → 11 file = quei 10 `actions.ts`
 *          + `src/lib/supabase/rpc.ts`. Nessuna server action vive fuori dall'insieme
 *          enumerato, a parte `rpc.ts` (anch'esso senza direttiva di runtime).
 *          L'esclusione è indispensabile proprio qui: senza di essa il comando conta anche
 *          questo file, che la stringa la cita nel comando stesso, e il totale diventa 12.
 *   6. LA SUPERFICIE SEMPRE ATTIVA (intercettazione delle richieste). Va cercata per
 *      convenzione di file, non per `'edge'`: storicamente gira su Edge SENZA alcuna
 *      direttiva esplicita, quindi i punti 1-4 non la vedrebbero.
 *        rg --files -g '** /middleware.ts'  → 0 file
 *        rg --files -g '** /proxy.ts'       → 1 file: `src/proxy.ts`  ⚠️
 *      (`rg --files` salta i percorsi ignorati da git: i soli `middleware.*` del disco
 *       stanno in `node_modules/`, non sono file di convenzione e non contano.)
 *      ⚠️ CORREZIONE di una stesura precedente di questo verbale, che si fermava a
 *      «middleware assente» e dichiarava il controllo chiuso. È un falso negativo: in
 *      **Next.js 16 `middleware.ts` è stato RINOMINATO `proxy.ts`**, e quel file ESISTE —
 *      `src/proxy.ts`, che esporta `proxy(request)` + `config.matcher` e autentica OGNI
 *      richiesta non statica. Cercare il nome vecchio su un progetto Next 16 non prova
 *      nulla. (`app/package.json` → `"next": "16.2.9"`.)
 *      Il verdetto NON cambia, ma per un motivo diverso e più forte, letto nella
 *      documentazione della versione INSTALLATA (non dalla memoria del modello):
 *        node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 *          :223  «Proxy defaults to using the Node.js runtime. The `runtime` config option
 *                 is not available in Proxy files. Setting the `runtime` config option in
 *                 Proxy will throw an error.»
 *          :774  «v16.0.0 | Middleware is deprecated and renamed to Proxy. Proxy defaults
 *                 to the Node.js runtime»
 *      Quindi `src/proxy.ts` gira su Node, e su Next 16 NON PUÒ essere portato su edge:
 *      provarci è un errore a build time. Il «middleware gira su Edge per default» era
 *      vero fino a Next 15 (:775-776 registrano il Node runtime come stabile da v15.5.0)
 *      e non governa più questo repository. `src/proxy.ts` non ha alcun `export const
 *      runtime` (punto 2), coerentemente con il fatto che lì non sarebbe ammesso.
 *   7. Il default delle route e delle action, anch'esso dalla doc installata:
 *        .../03-file-conventions/02-route-segment-config/runtime.md:18
 *          «**`'nodejs'`** (default)»  — i valori possibili sono `'nodejs' | 'edge'`.
 *      Nessun file del repository assegna `runtime` (punto 3), quindi tutte e 19 le
 *      superfici enumerate al punto 5 stanno sul default, cioè su Node.
 *   8. `next.config.ts` → letto integralmente: contiene solo `outputFileTracingIncludes`
 *      (file metrici di pdfkit). Nessuna configurazione di runtime.
 *
 * VERDETTO: nessuna superficie edge, né dichiarata né implicita. Le 19 route/action stanno
 * sul default `'nodejs'`; l'unica superficie sempre attiva (`src/proxy.ts`) è su Node per
 * default e su Next 16 non è nemmeno portabile su edge. `node:crypto` è disponibile ovunque.
 * SCELTA ADOTTATA: **PK deterministica `uuidv5` da `node:crypto`** — l'id ancora è derivato
 * puramente da `(type, bookingRequestId)` in `anchor.ts`, così l'inserimento è idempotente
 * senza una lettura preventiva (un retry collide sulla PK anziché duplicare). La migrazione
 * 0014 la ammette: `id uuid primary key default gen_random_uuid()` — il default c'è ma non
 * è obbligatorio, un id esplicito è accettato.
 * Il **ripiego di §5.2 NON è attivo**: insert non deterministico più deduplica a lettura su
 * `(subject_type, subject_id, type)` tenendo la riga più vecchia — cioè esattamente la
 * semantica dell'indice `idx_operational_tasks_subject` della migrazione 0014.
 * PIANO DI RIENTRO, con il suo innesco reso esplicito: l'unico modo di introdurre una
 * superficie edge su Next 16 è un `export const runtime = 'edge'` in una route o in una
 * page (in `proxy.ts` è vietato). Se compare su un percorso che deriva task pre-arrivo,
 * `prearrivalAnchorId` non va chiamata lì e `PrearrivalCard.anchorId` vale `null` (il tipo
 * lo ammette già), e si attiva il ripiego di §5.2. Il controllo che lo intercetta è il
 * punto 3: una ricerca di `runtime =` che oggi dà 0 riscontri fuori da questa cartella.
 *
 * PREZZO DELLA SCELTA, dichiarato perché non è neutro (trovato il 01/10/2026 confrontando la
 * PK deterministica con l'idempotenza GIÀ in uso nel repo, non supposto). L'unicità della PK
 * non vale "finché la task è aperta": vale PER SEMPRE. Il repo, invece, è idempotente solo
 * sulle aperte, in due punti che dicono la stessa cosa:
 *   · `process_payment_expiry` (0014) salta il booking solo se esiste una task
 *     `… AND ot.status = 'open'`;
 *   · `idx_operational_tasks_subject` è un indice PARZIALE `WHERE status = 'open'` — e NON è
 *     `UNIQUE` (riletta la 0014: `CREATE INDEX`, non `CREATE UNIQUE INDEX`), quindi non
 *     impedisce nulla di per sé: esprime quella semantica, non la impone.
 * Conseguenza concreta: con quel modello, una task risolta e poi tornata pertinente può essere
 * ricreata; con la PK deterministica NO — il secondo insert collide su `id` e PostgREST
 * risponde 409 (`23505`). Le due regole non coincidono, e la differenza si vede solo DOPO una
 * risoluzione, cioè tardi.
 * Per il pre-arrivo la semantica stretta è quella VOLUTA, e qui vale come scelta esplicita:
 * una prenotazione riceve al massimo una richiesta info e una richiesta ETA: se l'ospite non
 * ha risposto non lo si ri-sollecita facendo ripartire la task, e se il dato è stato acquisito
 * la domanda non si ripone. La finestra dura 3 giorni: non c'è lo spazio temporale che
 * giustifichi un secondo giro. (Gli esiti si nominano per chiave in `vocabulary.ts` e non si
 * citano qui per letterale: questo file è fra i sorgenti scansionati dal test, che pretende
 * zero stringhe del vocabolario fuori da quel file — regola che vale anche per i commenti.)
 * Vincolo che ne discende PER IL LIVELLO DI SCRITTURA (fuori da questo task, ma deciso qui):
 * l'inserimento deve dichiarare cosa fare alla collisione invece di subirla — `ON CONFLICT DO
 * NOTHING` (via upsert con `ignoreDuplicates`), così un retry è un no-op e non un errore.
 * Un insert nudo trasformerebbe l'idempotenza in un 409 da gestire a ogni chiamata.
 *
 * ----------------------------------------------------------------------------
 * (b) §11.2 — FILTRO POSTGREST `details->>rev=eq.N`         ESITO: ⛔ NON VERIFICABILE
 * ----------------------------------------------------------------------------
 * Domanda: PostgREST applica davvero un filtro su percorso JSON (`details->>rev=eq.N`)
 * come guard di concorrenza in una UPDATE?
 *
 * Comandi eseguiti (da `app/`) ed esito osservato — tutto ciò che si può sapere staticamente:
 *   1. rg -n -- "->>" -g "src/** /*.ts" .
 *      → UN solo uso nel codice applicativo TypeScript (il perimetro cercato; le migrazioni
 *        SQL non c'entrano, là il JSON si interroga in SQL e non via PostgREST):
 *        `src/lib/ai/guardrail.ts:80` `.filter('metadata->>ip_hash', 'eq', ipHash)`.
 *      Attenzione a come si legge questo riscontro: dice che la SINTASSI del filtro su
 *      percorso JSON è già usata in produzione, ma su una `select(count)`, MAI come guard
 *      di una `update()`. E non è una prova che PostgREST la applichi: se quel filtro
 *      venisse ignorato, il conteggio del rate limit uscirebbe più alto del dovuto e il
 *      limite sarebbe solo più permissivo — un fallimento silenzioso, che nessun test
 *      offline avrebbe mai intercettato. Quindi NON è evidenza a favore.
 *   2. rg -n "resolveTaskForBooking" .
 *      → `src/lib/tasks/operationalTasks.ts:86-98`: l'unico guard di UPDATE già esistente
 *        nel repo filtra su SOLE colonne scalari (`subject_type`, `subject_id`, `type`,
 *        `status = 'open'`). È già, letteralmente, la forma del ripiego di §8.3.
 *
 * Comando che SOLO potrebbe chiudere la domanda — NON ESEGUITO:
 *   curl -X PATCH "$SUPABASE_URL/rest/v1/operational_tasks?details->>rev=eq.1" ...
 * Perché no: la domanda non è decidibile staticamente, serve un'istanza viva. Nessun
 * accesso a produzione è disponibile né ammesso in questo task — ENGINEERING §2 mette la
 * produzione tra le azioni 🔴 RED (riservate al Product Owner), §6 registra Supabase
 * CLI/MCP come non disponibili — e in ogni caso una scrittura di prova su dati reali
 * violerebbe il perimetro. Nessuna credenziale è stata letta né usata.
 *
 * VERDETTO: NON VERIFICATO. Si dichiara quindi l'adozione del **ripiego di §8.3**:
 * il guard ottimistico di concorrenza si esprime **sui soli campi scalari** della riga, mai su
 * un percorso dentro `details`. Non richiede alcuna migrazione ed è la forma già collaudata.
 * QUALI campi: enumerati dalla 0014 colonna per colonna, non assunti. `operational_tasks` ha
 * `id`, `org_id`, `property_id`, `type`, `status`, `subject_type`, `subject_id`, `resolution`,
 * `details`, `created_at` — e **nessun `updated_at`**.
 *   ⚠️ CORREZIONE del 01/10/2026: una stesura precedente di questo verbale offriva proprio
 *   `updated_at` come esempio di colonna su cui esprimere il guard. QUELLA COLONNA NON ESISTE,
 *   e l'errore non era conservativo: un `.eq('updated_at', …)` non "stringe di meno", fa
 *   rispondere PostgREST con un errore di colonna inesistente, cioè rompe l'azione invece di
 *   proteggerla. Verificato che non la aggiunga nemmeno un ALTER successivo:
 *     rg -l "operational_tasks" supabase/migrations  → 1 solo file, la 0014 stessa.
 *   (Da non confondere con `created_at`, che c'è: ma è l'istante di CREAZIONE e non cambia a
 *   ogni scrittura, quindi non può fare da contatore di revisione.)
 * Il guard concreto è perciò la TRANSIZIONE DI STATO, non un numero di revisione: l'UPDATE
 * filtra `status = 'open'` e scrive `status = 'resolved'`, così un secondo tentativo
 * concorrente non trova più la riga e ne tocca 0. È letteralmente ciò che fa già
 * `resolveTaskForBooking` (`src/lib/tasks/operationalTasks.ts:90-97`, riletto riga per riga:
 * `.eq` su `subject_type`, `subject_id`, `type`, `status`, nessun percorso JSON) ed è anche
 * la semantica dell'indice parziale `idx_operational_tasks_subject ... WHERE status = 'open'`.
 * L'alternativa `details->>rev` resta aperta solo se e quando il Product Owner la
 * verificherà su un'istanza reale. Nota di coerenza: il ripiego è anche il motivo per cui
 * lo stato degradato `stale` esiste in `card.ts` — un guard scalare può far fallire
 * l'UPDATE senza errore (0 righe toccate), e quel caso va mostrato allo staff, non ingoiato.
 *
 * LIMITE DELL'HELPER ESISTENTE, trovato il 01/10/2026 leggendo `resolveTaskForBooking` riga per
 * riga e non il suo nome. Quella funzione oggi NON SAPREBBE dire che il guard ha morso: dopo
 * l'UPDATE controlla solo `error` (`dbThrow(error, 'resolveTaskForBooking')`,
 * `src/lib/tasks/operationalTasks.ts:97`) e non chiede né `{ count: 'exact', head: true }` né
 * un `.select()` da cui contare le righe tornate. Ma un UPDATE che non trova nulla NON è un
 * errore per PostgREST: risponde 204 e `error` resta `null`. Quindi "risolta" e "qualcun altro
 * l'ha già risolta un istante fa" sono oggi lo stesso esito osservabile — successo.
 * Non è un difetto di quella funzione nel suo uso attuale (è documentata come idempotente, e
 * per la scadenza pagamento ri-risolvere è innocuo); lo diventa qui, perché è esattamente il
 * segnale su cui `stale` si regge. Vincolo che ne discende PER IL LIVELLO DELLE AZIONI (fuori
 * da questo task, ma deciso qui): la resolve del pre-arrivo deve chiedere il conteggio delle
 * righe toccate e, se è 0, restituire `stale` invece di un successo silenzioso. Riusare
 * `resolveTaskForBooking` così com'è renderebbe `stale` IRRAGGIUNGIBILE — uno stato nel
 * catalogo che nessun percorso di codice può produrre, cioè un presidio solo apparente.
 * (Non va comunque riusata tale e quale: i suoi `OperationalTaskType` e `TaskResolution` sono
 * tipi chiusi sul dominio pagamenti — `'booking.payment_window_expired'`, `'paid' | 'not_paid'`,
 * `src/lib/tasks/operationalTasks.ts:11-13` — e non ammettono il vocabolario di §5.6.)
 *
 * ----------------------------------------------------------------------------
 * ASSUNZIONE DICHIARATA SUL VOCABOLARIO (§5.6)
 * ----------------------------------------------------------------------------
 * Il documento di piano con i valori di §5.6 NON è presente nel repository. Ricerche
 * eseguite ed esito osservato, perché chi legge non debba rifarle:
 *   rg -li "prearrival|pre-arriv" -g "*.md" .  → 1 solo file, `docs/SYSTEM_MAP.md`, e lì
 *     il pre-arrivo compare soltanto come tappa del journey TARGET («sapere cosa manca
 *     prima dell'arrivo e chiedere l'ETA quando manca»), senza alcun vocabolario.
 *   rg -n "11\.2|5\.6|8\.3|5\.2" -g "docs/** /*.md" .  → 2 soli file, entrambi in
 *     `docs/archive/`, e le sezioni omonime trattano altro (`dev-plan.md` §11.2 «Enum DB ↔
 *     etichette UI», `ui-mvp-plan.md` §8.3 «Safe mode», §11.2 «Human Handoff»): la
 *     numerazione coincide per caso, non è il piano citato dal task.
 * I valori in `vocabulary.ts` sono quindi DERIVATI dall'intento del modulo e
 * dalle convenzioni già in vigore (`area.<fatto>` della migrazione 0014), con le cardinalità
 * richieste: 2 `type`, 5 `resolution`, 2 `purpose`. Sono confinati in quell'unico file e
 * mai ripetuti altrove nel modulo: allinearli al piano è una modifica a un file solo.
 *
 * CORREZIONE del 01/10/2026 (collisione trovata rileggendo la 0014 contro il vocabolario, non
 * supposta): l'esito «soggiorno annullato» si chiamava `cancelled`, ma `'cancelled'` è anche un
 * valore ammesso da `operational_tasks.status` (CHECK della 0014: `status in ('open','resolved',
 * 'cancelled')`) e le due colonne stanno sulla STESSA riga — `listTasksForProperty` le seleziona
 * insieme e `QueueTask` le espone entrambe. `status='resolved'` con quell'esito non sarebbe stato
 * sbagliato, ma illeggibile da solo: il literal non distingue più la TASK annullata dal SOGGIORNO
 * annullato, e un filtro o un conteggio sulla colonna sbagliata confonde i due casi senza errore
 * di sintassi, quindi in silenzio. L'esito è stato rinominato con un prefisso che nomina il
 * soggetto (`stay_…`, valore esatto in `vocabulary.ts` — qui non si ripete, è vocabolario).
 * L'invariante non resta affidata al giudizio: il test confronta i 5 `resolution` con l'insieme
 * chiuso degli `status` della 0014 e pretende intersezione vuota.
 */

export {
  PREARRIVAL_TASK_TYPES,
  PREARRIVAL_RESOLUTIONS,
  PREARRIVAL_PURPOSES,
  PREARRIVAL_TASK_TYPE_VALUES,
  PREARRIVAL_RESOLUTION_VALUES,
  PREARRIVAL_PURPOSE_VALUES,
  purposeForTaskType,
  isPrearrivalTaskType,
  isPrearrivalResolution,
} from './vocabulary'
export type { PrearrivalTaskType, PrearrivalResolution, PrearrivalPurpose } from './vocabulary'

export {
  PREARRIVAL_TIMEZONE,
  PREARRIVAL_WINDOW_DAYS,
  romeCalendarDate,
  isCalendarDate,
  addCalendarDays,
  daysBetweenCalendarDates,
  prearrivalWindowBounds,
  daysUntilCheckIn,
  isWithinPrearrivalWindow,
} from './window'

export { PREARRIVAL_UUID_NAMESPACE, uuidv5, prearrivalAnchorId, prearrivalAnchorIds } from './anchor'

export {
  PREARRIVAL_STATE_CATALOG,
  PREARRIVAL_STATE_KINDS,
  PREARRIVAL_ACTION_KINDS,
  prearrivalCardState,
  allowedActionsFor,
  reasonFor,
  isDegraded,
  isActionAllowed,
  isPrearrivalCardStateKind,
  isPrearrivalActionKind,
} from './card'
export type {
  PrearrivalCard,
  PrearrivalCardState,
  PrearrivalCardStateKind,
  PrearrivalActionKind,
  PrearrivalStateSpec,
} from './types'
