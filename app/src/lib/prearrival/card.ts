// Pre-arrival — catalogo degli stati della card: per ciascuno, il motivo da mostrare allo
// staff e l'insieme chiuso delle azioni ammesse. Tabella pura: nessun I/O, nessun tempo.
//
// Invariante presidiata qui (e verificata nel test del modulo): `prepare_draft` esiste solo
// nello stato nominale. Uno stato degradato significa "non so abbastanza per scrivere
// all'ospite": lasciare la stesura aperta trasformerebbe un dato mancante in una frase
// inventata. `open_booking` resta sempre disponibile perché è sola navigazione.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ CONFINE DI FIDUCIA — correzione del 01/10/2026 (difetto High in revisione)
// ─────────────────────────────────────────────────────────────────────────────
// La stesura precedente esponeva `isActionAllowed(state, action)` e rispondeva leggendo
// `state.allowedActions.includes(action)`, dichiarandosi «unico punto di verifica per UI e
// server action». Non era una verifica: era una DOMANDA AL CHIAMANTE SE FOSSE AUTORIZZATO.
// `PrearrivalCardState` è un oggetto semplice e serializzabile, quindi attraversa il confine
// in entrambi i versi — server → props del componente, e client → argomenti di una server
// action. Una action che accettasse lo stato della card (la forma naturale: è esattamente
// ciò che ha appena reso) e chiedesse `isActionAllowed(state, 'prepare_draft')` avrebbe
// accettato una richiesta confezionata a mano con
//   { kind: 'kb_incomplete', reason: '', allowedActions: ['prepare_draft', 'resolve'] }
// Il cancello che tiene la stesura fuori dagli stati degradati era presidiato da un valore
// che il chiamante scrive. Peggio: `kind` e `allowedActions` potevano contraddirsi, e la
// risposta veniva dal campo falsificabile, non dallo stato dichiarato.
//
// Tre mosse, in ordine di forza:
//   1. L'ELENCO NON VIAGGIA PIÙ. `allowedActions` è stato rimosso da `PrearrivalCardState`
//      (vedi `types.ts`): l'unico elenco esiste in `PREARRIVAL_STATE_CATALOG`, locale al
//      modulo e congelato. Non c'è più nulla da falsificare, perché non c'è più nulla da
//      mandare. La UI chiede le azioni da rendere con `allowedActionsFor(state.kind)`.
//   2. LA VERIFICA PRENDE IL `kind`, NON L'OGGETTO. Un'unica stringa appartenente a un
//      insieme chiuso e noto, confrontata con il catalogo. L'array falsificabile non è più
//      un parametro: il difetto non è stato mitigato, è stato reso inesprimibile.
//   3. FAIL-CLOSED su tutto ciò che non è riconosciuto, e senza mai schiantare. Un `kind`
//      ignoto equivale a `undetermined` (che non ammette né `prepare_draft` né `resolve`);
//      un'azione ignota è negata. Il catalogo non viene MAI indicizzato con una stringa non
//      validata: con `'__proto__'` un accesso diretto restituirebbe `Object.prototype` e il
//      successivo `.allowedActions.includes(...)` lancerebbe — un 500 al posto di un rifiuto.
//
// OBBLIGO RESIDUO, che questo modulo non può imporre e che perciò va scritto qui: il `kind`
// passato alla verifica deve essere RI-DERIVATO lato server nella stessa richiesta, dai fatti
// (copertura della knowledge base, canale verso l'ospite, freschezza della riga). Un `kind`
// arrivato insieme alla richiesta è un suggerimento di rendering, non un'autorizzazione.
import type {
  PrearrivalActionKind,
  PrearrivalCardState,
  PrearrivalCardStateKind,
  PrearrivalStateSpec,
} from './types'

// `Object.freeze` sugli array e sul catalogo non è decorazione: `readonly` esiste solo per il
// compilatore, e `allowedActionsFor` restituisce PER RIFERIMENTO l'array del catalogo. Senza
// freeze, un singolo `(actions as PrearrivalActionKind[]).push('prepare_draft')` — o un
// `.sort()` in un componente che ordina i bottoni — corromperebbe il catalogo per OGNI card
// del processo, non solo per quella. Essendo questo il cancello che tiene `prepare_draft`
// fuori dagli stati degradati, il guasto sarebbe silenzioso e nel verso sbagliato: congelare
// trasforma quella mutazione in un errore immediato.
// L'annotazione esplicita del tipo tipizza contestualmente i letterali (nessun allargamento a
// `string`); il congelamento avviene dopo, come istruzione, senza affidarsi all'inferenza.
const CATALOG: Record<PrearrivalCardStateKind, PrearrivalStateSpec> = {
  actionable: {
    reason: '',
    allowedActions: ['open_booking', 'prepare_draft', 'resolve'],
  },
  kb_incomplete: {
    reason:
      'La knowledge base della struttura non copre ciò che andrebbe chiesto: completala prima di scrivere all’ospite.',
    allowedActions: ['open_booking', 'open_knowledge'],
  },
  no_channel: {
    reason: 'Nessun canale utile verso l’ospite: la richiesta non è recapitabile da Vesta.',
    allowedActions: ['open_booking', 'resolve'],
  },
  stale: {
    reason: 'I dati mostrati sono stati superati da un aggiornamento più recente: ricarica prima di agire.',
    allowedActions: ['open_booking', 'refresh'],
  },
  undetermined: {
    reason: 'Non è stato possibile stabilire lo stato di questa prenotazione: riprova o aprila per controllare.',
    allowedActions: ['open_booking', 'refresh'],
  },
}

for (const spec of Object.values(CATALOG)) {
  Object.freeze(spec.allowedActions)
  Object.freeze(spec)
}

export const PREARRIVAL_STATE_CATALOG: Readonly<Record<PrearrivalCardStateKind, PrearrivalStateSpec>> =
  Object.freeze(CATALOG)

// L'elenco è DERIVATO dalle chiavi del catalogo invece di essere riscritto a mano: `CATALOG` è
// dichiarato `Record<PrearrivalCardStateKind, …>`, quindi è il compilatore a pretendere che copra
// tutti gli stati, mentre una seconda lista letterale potrebbe restare indietro in silenzio.
// L'ordine è quello di dichiarazione di `CATALOG` (nominale prima, poi i degradati).
// Il congelamento è un'ISTRUZIONE a sé, come sopra per gli `allowedActions`, e non si appoggia al
// tipo di ritorno di `Object.freeze`. ⚠️ CORREZIONE del 01/10/2026: la stesura precedente passava
// un argomento di tipo esplicito (`Object.freeze<PrearrivalCardStateKind>([…])`) motivandolo con un
// overload `freeze<T>(a: T[]): readonly T[]` che NON ESISTE — ✅ verificato in
// `node_modules/typescript/lib/lib.es5.d.ts:222-234` (TypeScript 5.9.3), dove gli overload sono
// soltanto tre: `<T extends Function>`, la coppia `<T, U>` vincolata a una index signature, e
// `freeze<T>(o: T): Readonly<T>`. Con UN solo argomento di tipo esplicito la coppia è esclusa per
// arità e il primo per vincolo, quindi restava applicabile solo il terzo, che legava
// `T = PrearrivalCardStateKind` e rifiutava perciò un array. Non era un dettaglio di stile ma un
// errore di compilazione: `app/tsconfig.json` include `**/*.mts` e `next.config.ts` non disattiva
// il controllo dei tipi, quindi avrebbe fatto fallire `next build`.
const STATE_KINDS: PrearrivalCardStateKind[] = Object.keys(CATALOG) as PrearrivalCardStateKind[]
Object.freeze(STATE_KINDS)

/** Elenco ordinato degli stati (iterazione e test di esaustività). */
export const PREARRIVAL_STATE_KINDS: readonly PrearrivalCardStateKind[] = STATE_KINDS

// L'universo delle azioni è dichiarato, non dedotto dall'unione degli `allowedActions` del
// catalogo: quell'unione oggi coincide, ma se un domani uno stato smettesse di offrire
// `refresh` l'azione svanirebbe dall'universo e il guard la rifiuterebbe in silenzio.
// `satisfies Record<PrearrivalActionKind, 0>` è ciò che lo tiene allineato al tipo: obbliga
// a coprire tutte le azioni e rifiuta quelle inventate, senza che la lista sia riscritta a mano
// altrove. (`satisfies` è disponibile da TypeScript 4.9; qui gira la 5.9.3.)
// Il congelamento è un'istruzione a sé, come sopra per `STATE_KINDS`: non si appoggia al tipo
// di ritorno di `Object.freeze`.
const ACTION_KINDS: PrearrivalActionKind[] = Object.keys({
  open_booking: 0,
  prepare_draft: 0,
  resolve: 0,
  open_knowledge: 0,
  refresh: 0,
} satisfies Record<PrearrivalActionKind, 0>) as PrearrivalActionKind[]
Object.freeze(ACTION_KINDS)

/** Elenco ordinato delle azioni (iterazione e test di esaustività). */
export const PREARRIVAL_ACTION_KINDS: readonly PrearrivalActionKind[] = ACTION_KINDS

/**
 * `v` è uno degli stati del catalogo? Guard sul confine: da usare su un `kind` che arriva da
 * una richiesta o dal DB, PRIMA di trattarlo come stato.
 */
export function isPrearrivalCardStateKind(v: unknown): v is PrearrivalCardStateKind {
  return typeof v === 'string' && (STATE_KINDS as readonly string[]).includes(v)
}

/**
 * `v` è una delle azioni del modulo? Serve a una server action che smisti su un nome di
 * azione ricevuto dal client: validare prima, agire dopo.
 */
export function isPrearrivalActionKind(v: unknown): v is PrearrivalActionKind {
  return typeof v === 'string' && (ACTION_KINDS as readonly string[]).includes(v)
}

/**
 * Riconduce un valore qualunque a uno stato del catalogo. Fail-closed: ciò che non è
 * riconosciuto è `undetermined` — lo stato che significa, letteralmente, "non è stato
 * possibile stabilire lo stato", e che non ammette né la stesura né la registrazione di un
 * esito. Una sola regola per tutto il modulo, così autorizzazione e rendering non possono
 * divergere su un valore sconosciuto.
 */
function normalizeStateKind(kind: unknown): PrearrivalCardStateKind {
  return isPrearrivalCardStateKind(kind) ? kind : 'undetermined'
}

/**
 * Le azioni ammesse in uno stato, dal catalogo. Accetta `unknown` perché è una funzione DI
 * CONFINE: il `kind` può venire da una richiesta, e un cast al tipo buono nasconderebbe
 * esattamente il rischio da presidiare. L'array è quello del catalogo, congelato: va letto,
 * non mutato.
 */
export function allowedActionsFor(kind: unknown): readonly PrearrivalActionKind[] {
  return PREARRIVAL_STATE_CATALOG[normalizeStateKind(kind)].allowedActions
}

/**
 * Il motivo di catalogo di uno stato (fail-closed come sopra).
 */
export function reasonFor(kind: unknown): string {
  return PREARRIVAL_STATE_CATALOG[normalizeStateKind(kind)].reason
}

/**
 * Costruisce lo stato della card. `reason` può essere precisato dal chiamante (es. quale
 * informazione manca nella knowledge base); se assente vale il motivo di catalogo.
 * Lo stato nominale non ammette motivo: se c'è qualcosa da spiegare, non è nominale.
 *
 * Il valore restituito porta `kind` e `reason` e NIENTE elenco di azioni: è dato da mostrare,
 * non un'autorizzazione (vedi la testata). Per i bottoni da rendere: `allowedActionsFor`.
 */
export function prearrivalCardState(kind: PrearrivalCardStateKind, reason?: string): PrearrivalCardState {
  // La normalizzazione è difensiva: la firma è tipizzata, ma questo valore finisce in una
  // risposta e un `kind` arrivato da fuori con un cast non deve poter inventare uno stato.
  const safeKind = normalizeStateKind(kind)
  const detail = reason?.trim()
  return {
    kind: safeKind,
    reason: safeKind === 'actionable' ? '' : detail || reasonFor(safeKind),
  }
}

/** Lo stato è degradato (cioè: non nominale)? Fail-closed: un `kind` ignoto è degradato. */
export function isDegraded(kind: unknown): boolean {
  return normalizeStateKind(kind) !== 'actionable'
}

/**
 * L'azione è ammessa in questo stato? UNICO punto di verifica per UI e server action.
 *
 * Prende il `kind` e non lo stato della card: l'elenco delle azioni arriva dal catalogo, mai
 * dal chiamante (la testata spiega perché la firma precedente era falsificabile). Il tipo del
 * `kind` è `unknown` di proposito — chi chiama dal confine non deve dover fare un cast per
 * farsi verificare. Fail-closed in entrambi gli argomenti: `kind` ignoto ⇒ `undetermined`,
 * azione ignota ⇒ negata.
 *
 * Non sostituisce l'autorizzazione sull'ORGANIZZAZIONE: dice soltanto che l'azione è coerente
 * con lo stato, e presuppone un `kind` ri-derivato lato server nella stessa richiesta.
 */
export function isActionAllowed(kind: unknown, action: PrearrivalActionKind): boolean {
  return allowedActionsFor(kind).includes(action)
}
