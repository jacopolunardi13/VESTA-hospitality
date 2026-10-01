// Pre-arrival — test delle fondamenta. Offline, deterministico, orologio fisso: nessuna
// rete, nessun DB, nessuna credenziale. Oltre al comportamento, verifica staticamente gli
// invarianti strutturali del modulo (confini di import, assenza di orologio implicito,
// vocabolario non duplicato, azioni ammesse congelate) leggendo i sorgenti della cartella —
// compreso QUESTO file, così gli invarianti valgono anche per il test che li verifica.
//
// L'invariante di AUTORIZZAZIONE è provata con input OSTILE e non solo con stati costruiti dal
// modulo: stato confezionato a mano con l'elenco dei permessi iniettato, `kind` sconosciuti,
// nomi del prototipo, azioni inventate. È la lezione del difetto High del 01/10/2026 — il
// percorso felice passava, e passava anche il codice sbagliato.
//
// Uso (da `app/`): node --import tsx src/lib/prearrival/foundations.test.mts
//
// L'import della superficie pubblica è RELATIVO (`./index`) e non `@/lib/prearrival`, che è
// invece la convenzione di `app/scripts/`. Motivo: l'alias `@/*` vive in `app/tsconfig.json` e
// tsx lo risolve a partire dalla CWD, quindi con l'alias il test gira solo se lanciato da
// `app/`. Relativo, gira da qualunque cartella — e questa è la sola forma invocabile in un
// ambiente che non consente di cambiare cartella (dove però l'esecuzione resta negata per
// altri motivi: vedi in `index.ts` la nota sugli strumenti di verifica, con i tentativi e le
// risposte raccolte). Il resto del file è già indipendente dalla CWD: la scansione dei
// sorgenti parte da `import.meta.url`, non da `process.cwd()`.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PREARRIVAL_ACTION_KINDS,
  PREARRIVAL_PURPOSES,
  PREARRIVAL_PURPOSE_VALUES,
  PREARRIVAL_RESOLUTION_VALUES,
  PREARRIVAL_STATE_CATALOG,
  PREARRIVAL_STATE_KINDS,
  PREARRIVAL_TASK_TYPES,
  PREARRIVAL_TASK_TYPE_VALUES,
  PREARRIVAL_WINDOW_DAYS,
  allowedActionsFor,
  isActionAllowed,
  isDegraded,
  isPrearrivalActionKind,
  isPrearrivalCardStateKind,
  isPrearrivalResolution,
  isPrearrivalTaskType,
  isWithinPrearrivalWindow,
  prearrivalAnchorId,
  prearrivalAnchorIds,
  prearrivalCardState,
  prearrivalWindowBounds,
  purposeForTaskType,
  reasonFor,
  romeCalendarDate,
  uuidv5,
  daysUntilCheckIn,
} from './index'
import type { PrearrivalActionKind, PrearrivalCardStateKind } from './index'

let pass = 0
let fail = 0
const ok = (c: boolean, m: string) => {
  if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) }
}
const eq = (a: unknown, b: unknown, m: string) =>
  ok(Object.is(a, b), `${m}${Object.is(a, b) ? '' : ` (atteso ${String(b)}, ottenuto ${String(a)})`}`)

// ── Vocabolario (§5.6) ───────────────────────────────────────────────────────
console.log('— Vocabolario: cardinalità, unicità, convenzioni —')
eq(PREARRIVAL_TASK_TYPE_VALUES.length, 2, 'due `type`')
eq(PREARRIVAL_RESOLUTION_VALUES.length, 5, 'cinque `resolution`')
eq(PREARRIVAL_PURPOSE_VALUES.length, 2, 'due `purpose`')
const allVocab = [...PREARRIVAL_TASK_TYPE_VALUES, ...PREARRIVAL_RESOLUTION_VALUES, ...PREARRIVAL_PURPOSE_VALUES]
eq(new Set(allVocab).size, allVocab.length, 'nessun valore ripetuto tra i tre vocabolari')
ok(PREARRIVAL_TASK_TYPE_VALUES.every((t) => /^[a-z]+\.[a-z0-9_]+$/.test(t)), '`type` segue `area.<fatto>` (0014)')
ok(PREARRIVAL_RESOLUTION_VALUES.every((r) => /^[a-z][a-z0-9_]*$/.test(r)), '`resolution` sono codici snake_case')
ok(PREARRIVAL_PURPOSE_VALUES.every((p) => /^[a-z][a-z0-9_]*$/.test(p)), '`purpose` sono codici snake_case')
eq(purposeForTaskType(PREARRIVAL_TASK_TYPES.infoMissing), PREARRIVAL_PURPOSES.infoRequest, 'info → purpose info')
eq(purposeForTaskType(PREARRIVAL_TASK_TYPES.etaMissing), PREARRIVAL_PURPOSES.etaRequest, 'eta → purpose eta')
ok(PREARRIVAL_TASK_TYPE_VALUES.every(isPrearrivalTaskType), 'guard `type` accetta i valori del vocabolario')
ok(!isPrearrivalTaskType('booking.payment_window_expired'), 'guard `type` rifiuta un type di un altro dominio')
ok(PREARRIVAL_RESOLUTION_VALUES.every(isPrearrivalResolution), 'guard `resolution` accetta i valori del vocabolario')
ok(!isPrearrivalResolution('paid'), 'guard `resolution` rifiuta una resolution di un altro dominio')
// `resolution` e `status` viaggiano sulla STESSA riga di `operational_tasks` e `QueueTask` le
// espone entrambe: un esito omonimo di uno `status` renderebbe il literal ambiguo (task annullata
// o soggiorno annullato?) e un filtro sulla colonna sbagliata sbaglierebbe in silenzio. Il
// vocabolario di `status` è fissato da un CHECK SQL in 0014, quindi è un insieme chiuso e noto.
const TASK_STATUS_VALUES = ['open', 'resolved', 'cancelled'] as const
eq(
  PREARRIVAL_RESOLUTION_VALUES.filter((r) => (TASK_STATUS_VALUES as readonly string[]).includes(r)).length,
  0,
  'nessun `resolution` è omonimo di uno `status` di operational_tasks (CHECK della 0014)',
)

// ── Finestra e tempo ─────────────────────────────────────────────────────────
console.log('\n— Finestra: ampiezza, fuso, arrivi passati —')
eq(PREARRIVAL_WINDOW_DAYS, 3, 'PREARRIVAL_WINDOW_DAYS vale 3')

// Ora legale attiva (CEST, UTC+2): le 23:30 UTC sono già il giorno dopo a Roma.
eq(romeCalendarDate(new Date('2026-09-29T23:30:00Z')), '2026-09-30', 'CEST: 23:30Z → giorno successivo a Roma')
eq(romeCalendarDate(new Date('2026-09-29T21:30:00Z')), '2026-09-29', 'CEST: 21:30Z → stesso giorno a Roma')
// Ora solare (CET, UTC+1).
eq(romeCalendarDate(new Date('2026-01-15T23:30:00Z')), '2026-01-16', 'CET: 23:30Z → giorno successivo a Roma')
eq(romeCalendarDate(new Date('2026-01-15T22:30:00Z')), '2026-01-15', 'CET: 22:30Z → stesso giorno a Roma')

const now = new Date('2026-09-29T09:00:00Z') // Roma: 2026-09-29, 11:00
const bounds = prearrivalWindowBounds(now)
eq(bounds.from, '2026-09-29', 'limite inferiore = oggi a Roma')
eq(bounds.to, '2026-10-01', 'limite superiore = oggi + 2 (finestra di 3 giorni, inclusiva)')
eq(daysUntilCheckIn('2026-10-01', now), 2, 'giorni all’arrivo calcolati sul calendario di Roma')
eq(daysUntilCheckIn('2026-09-28', now), -1, 'arrivo di ieri → giorni negativi')
ok(!isWithinPrearrivalWindow('2026-09-28', now), 'check_in < oggi è fuori finestra (arrivo passato)')
ok(!isWithinPrearrivalWindow('2025-09-29', now), 'arrivo di un anno fa è fuori finestra')
ok(isWithinPrearrivalWindow('2026-09-29', now), 'arrivo di oggi è in finestra')
ok(isWithinPrearrivalWindow('2026-09-30', now), 'arrivo di domani è in finestra')
ok(isWithinPrearrivalWindow('2026-10-01', now), 'arrivo fra 2 giorni è in finestra')
ok(!isWithinPrearrivalWindow('2026-10-02', now), 'arrivo fra 3 giorni è oltre la finestra')
ok(!isWithinPrearrivalWindow(null, now), 'check_in nullo non entra mai in finestra')
ok(!isWithinPrearrivalWindow('', now), 'check_in vuoto non entra mai in finestra')
ok(!isWithinPrearrivalWindow('2026-02-30', now), 'data inesistente non entra mai in finestra')
ok(!isWithinPrearrivalWindow('30/09/2026', now), 'data in formato non ISO non entra mai in finestra')

// Il confine di giornata è quello di Roma, non quello UTC.
const afterRomeMidnight = new Date('2026-09-29T22:30:00Z') // Roma: 2026-09-30, 00:30
eq(prearrivalWindowBounds(afterRomeMidnight).from, '2026-09-30', 'dopo la mezzanotte di Roma la finestra è già scorsa')
ok(!isWithinPrearrivalWindow('2026-09-29', afterRomeMidnight), 'l’arrivo di ieri esce dalla finestra a mezzanotte di Roma')

// ── Id ancora ────────────────────────────────────────────────────────────────
console.log('\n— Id ancora: determinismo e conformità UUID v5 —')
// Vettore noto (documentazione Python `uuid`): uuid5(NAMESPACE_DNS, 'python.org').
eq(
  uuidv5('python.org', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
  '886313e1-3b8a-5372-9b90-0c9aee199e5d',
  'uuidv5 riproduce il vettore noto NAMESPACE_DNS/python.org',
)
const booking = '11111111-2222-3333-4444-555555555555'
const other = '99999999-8888-7777-6666-555555555555'
const a1 = prearrivalAnchorId(PREARRIVAL_TASK_TYPES.infoMissing, booking)
const a2 = prearrivalAnchorId(PREARRIVAL_TASK_TYPES.infoMissing, booking)
const aEta = prearrivalAnchorId(PREARRIVAL_TASK_TYPES.etaMissing, booking)
const aOther = prearrivalAnchorId(PREARRIVAL_TASK_TYPES.infoMissing, other)
eq(a1, a2, 'stessa coppia (type, bookingRequestId) → stesso id')
ok(a1 !== aEta, 'type diverso → id diverso')
ok(a1 !== aOther, 'prenotazione diversa → id diverso')
ok(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a1), 'forma UUID v5, variante RFC 4122')
const ids = prearrivalAnchorIds(booking)
eq(ids[PREARRIVAL_TASK_TYPES.infoMissing], a1, 'prearrivalAnchorIds coerente per il type info')
eq(ids[PREARRIVAL_TASK_TYPES.etaMissing], aEta, 'prearrivalAnchorIds coerente per il type eta')
eq(Object.keys(ids).length, PREARRIVAL_TASK_TYPE_VALUES.length, 'un id ancora per ciascun type')
let anchorThrew = false
try { prearrivalAnchorId(PREARRIVAL_TASK_TYPES.infoMissing, '  ') } catch { anchorThrew = true }
ok(anchorThrew, 'bookingRequestId vuoto → errore esplicito (fail-fast)')

// ── Card: stato nominale e stati degradati ───────────────────────────────────
console.log('\n— Card: motivo da mostrare e azioni ammesse per stato —')
eq(PREARRIVAL_STATE_KINDS.length, 5, 'cinque stati: nominale + quattro degradati')
for (const k of ['actionable', 'kb_incomplete', 'no_channel', 'stale', 'undetermined'] as const) {
  ok(PREARRIVAL_STATE_KINDS.includes(k), `stato "${k}" presente nel catalogo`)
}
eq(PREARRIVAL_ACTION_KINDS.length, 5, 'cinque azioni dichiarate')
for (const kind of PREARRIVAL_STATE_KINDS) {
  const state = prearrivalCardState(kind)
  const actions = allowedActionsFor(kind)
  const degraded = kind !== 'actionable'
  eq(state.kind, kind, `"${kind}": lo stato costruito conserva il proprio kind`)
  eq(isDegraded(kind), degraded, `"${kind}": classificazione nominale/degradato`)
  ok(actions.length > 0, `"${kind}": ha almeno un'azione ammessa`)
  ok(actions.every(isPrearrivalActionKind), `"${kind}": le azioni ammesse sono tutte dichiarate`)
  ok(isActionAllowed(kind, 'open_booking'), `"${kind}": aprire la pratica è sempre ammesso (sola navigazione)`)
  if (degraded) {
    ok(state.reason.trim().length > 0, `"${kind}": espone un motivo da mostrare allo staff`)
    ok(!isActionAllowed(kind, 'prepare_draft'), `"${kind}": NON può preparare una comunicazione`)
  } else {
    eq(state.reason, '', '"actionable": nessun motivo da mostrare')
    ok(isActionAllowed(kind, 'prepare_draft'), '"actionable": può preparare la comunicazione (resta HITL)')
  }
}
ok(isActionAllowed('kb_incomplete', 'open_knowledge'), 'kb_incomplete rimanda alla knowledge base')
ok(isActionAllowed('no_channel', 'resolve'), 'no_channel consente di registrare l’esito')
ok(isActionAllowed('stale', 'refresh'), 'stale consente di ricaricare')
ok(isActionAllowed('undetermined', 'refresh'), 'indeterminato consente di ricaricare')
eq(prearrivalCardState('kb_incomplete', 'Manca l’orario del check-in.').reason, 'Manca l’orario del check-in.',
  'un motivo specifico sostituisce quello di catalogo')
eq(prearrivalCardState('kb_incomplete', '   ').reason, PREARRIVAL_STATE_CATALOG.kb_incomplete.reason,
  'un motivo vuoto ricade su quello di catalogo')
eq(reasonFor('kb_incomplete'), PREARRIVAL_STATE_CATALOG.kb_incomplete.reason, 'reasonFor legge il motivo di catalogo')
eq(prearrivalCardState('actionable', 'qualcosa').reason, '', 'lo stato nominale non accetta un motivo')

// ── Autorizzazione: il confine di fiducia (difetto High corretto il 01/10/2026) ──
console.log('\n— Autorizzazione: stati confezionati a mano —')
// Primo presidio: l'elenco delle azioni NON viaggia con lo stato. Finché `allowedActions` era
// un campo di `PrearrivalCardState`, una server action che riceveva lo stato dal client (la
// forma naturale: è ciò che il server aveva appena reso) chiedeva al chiamante se il chiamante
// fosse autorizzato. Il controllo è sul valore RESTITUITO, non sul tipo: `readonly` e campi
// assenti sono invisibili a runtime, e il difetto era a runtime.
ok(!('allowedActions' in prearrivalCardState('actionable')), 'lo stato della card non porta con sé alcun permesso')
ok(!('allowedActions' in prearrivalCardState('kb_incomplete')), 'nemmeno uno stato degradato porta permessi')

// Secondo presidio: l'esatta richiesta ostile che la stesura precedente accettava — stato
// degradato, elenco riscritto a mano. Oggi l'elenco non è più un parametro, e la risposta
// viene dal catalogo. Lo stato finto è dichiarato come lo spedirebbe un client, cioè senza
// alcun aiuto dal tipo.
const forged: { kind: string; reason: string; allowedActions: readonly string[] } = {
  kind: 'kb_incomplete',
  reason: '',
  allowedActions: ['prepare_draft', 'resolve', 'open_booking'],
}
ok(!isActionAllowed(forged.kind, 'prepare_draft'), 'un elenco iniettato non apre la stesura su uno stato degradato')
ok(!isActionAllowed(forged.kind, 'resolve'), 'un elenco iniettato non apre la registrazione di un esito')
eq(allowedActionsFor(forged.kind), PREARRIVAL_STATE_CATALOG.kb_incomplete.allowedActions,
  'le azioni ammesse vengono dal catalogo (stesso riferimento), mai dall’oggetto ricevuto')

// Terzo presidio: fail-closed su un `kind` non riconosciuto, e senza schiantare. `'__proto__'`,
// `'constructor'` e i nomi del prototipo sono il caso che un accesso diretto al catalogo
// sbaglierebbe nel verso peggiore: restituirebbe un oggetto del prototipo e la lettura
// successiva lancerebbe — un 500 invece di un rifiuto.
const HOSTILE_KINDS: readonly unknown[] = [
  '', ' ', 'actionable ', 'ACTIONABLE', 'Actionable', 'open_booking', 'unknown',
  '__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty',
  null, undefined, 0, 42, true, {}, [], ['actionable'], { kind: 'actionable' },
]
for (const k of HOSTILE_KINDS) {
  const label = typeof k === 'string' ? `"${k}"` : typeof k === 'object' && k !== null ? JSON.stringify(k) : String(k)
  ok(!isPrearrivalCardStateKind(k), `${label}: non è riconosciuto come stato`)
  let threw = false
  let actions: readonly PrearrivalActionKind[] | null = null
  try {
    actions = allowedActionsFor(k)
  } catch {
    threw = true
  }
  ok(!threw, `${label}: la lettura delle azioni rifiuta invece di schiantare`)
  eq(actions, PREARRIVAL_STATE_CATALOG.undetermined.allowedActions, `${label}: ricade sullo stato indeterminato`)
  ok(!isActionAllowed(k, 'prepare_draft'), `${label}: nessuna stesura`)
  ok(!isActionAllowed(k, 'resolve'), `${label}: nessuna registrazione di esito`)
  ok(!isActionAllowed(k, 'open_knowledge'), `${label}: nessun rimando alla knowledge base`)
  ok(isDegraded(k), `${label}: trattato come degradato`)
  eq(prearrivalCardState(k as PrearrivalCardStateKind).kind, 'undetermined',
    `${label}: la card costruita è indeterminata, non lo stato inventato`)
}

// Quarto presidio: anche l'AZIONE è fail-closed. Una server action che smistasse su un nome
// ricevuto dal client non deve poter inventare un permesso, nemmeno nello stato nominale.
for (const a of ['', 'prepare_draft ', 'PREPARE_DRAFT', 'send_message', '__proto__', 'constructor', 'toString']) {
  ok(!isPrearrivalActionKind(a), `azione "${a}": non riconosciuta`)
  ok(!isActionAllowed('actionable', a as PrearrivalActionKind), `azione "${a}": negata anche nello stato nominale`)
}
ok(PREARRIVAL_ACTION_KINDS.every(isPrearrivalActionKind), 'il guard accetta tutte le azioni dichiarate')
ok(PREARRIVAL_STATE_KINDS.every(isPrearrivalCardStateKind), 'il guard accetta tutti gli stati del catalogo')
// `prepare_draft` è ammessa in UNO stato solo: l'invariante contata, non ispezionata a occhio.
eq(
  PREARRIVAL_STATE_KINDS.filter((k) => isActionAllowed(k, 'prepare_draft')).length,
  1,
  'la stesura è ammessa in un solo stato del catalogo (il nominale)',
)

// Il catalogo è il cancello che tiene `prepare_draft` fuori dagli stati degradati, e
// `allowedActionsFor` restituisce il suo array PER RIFERIMENTO: se fosse mutabile, una sola
// riga altrove potrebbe aprire quel cancello per tutte le card del processo. `readonly` è solo
// un controllo del compilatore e un `as` lo aggira: serve il congelamento a runtime.
// (Questo file è un ES module ⇒ strict mode ⇒ la mutazione di un congelato LANCIA.)
for (const kind of PREARRIVAL_STATE_KINDS) {
  const actions = allowedActionsFor(kind)
  ok(Object.isFrozen(actions), `"${kind}": l'insieme delle azioni ammesse è congelato`)
  let mutationThrew = false
  try {
    ;(actions as PrearrivalActionKind[]).push('prepare_draft')
  } catch {
    mutationThrew = true
  }
  ok(mutationThrew, `"${kind}": tentare di aggiungere un'azione lancia invece di riuscire`)
  ok(!PREARRIVAL_STATE_CATALOG[kind].allowedActions.includes('prepare_draft') || kind === 'actionable',
    `"${kind}": il catalogo è rimasto integro dopo il tentativo di mutazione`)
}
ok(Object.isFrozen(PREARRIVAL_STATE_CATALOG), 'il catalogo degli stati è congelato')
ok(Object.isFrozen(PREARRIVAL_ACTION_KINDS), 'l’elenco delle azioni dichiarate è congelato')

// ── Invarianti strutturali del modulo (analisi statica dei sorgenti) ─────────
console.log('\n— Invarianti strutturali: confini di import, orologio, vocabolario —')
const dir = fileURLToPath(new URL('.', import.meta.url))
// Il test stesso è incluso nella scansione (`.mts`): gli invarianti valgono per TUTTO il
// modulo, non solo per i file che esporta. Senza questo, una lettura implicita dell'orologio
// o un import proibito introdotti nel test non sarebbero rilevati da nulla.
// (Nota: i controlli sotto cercano pattern letterali, quindi nemmeno i commenti di questo
// file possono citarli per esteso — citarli li farebbe scattare su se stessi.)
const sources = readdirSync(dir)
  .filter((f) => f.endsWith('.ts') || f.endsWith('.mts'))
  .map((f) => ({ file: f, text: readFileSync(join(dir, f), 'utf8') }))
ok(sources.length >= 6, `sorgenti del modulo analizzati: ${sources.map((s) => s.file).join(', ')}`)

// Due forme, perché un import proibito può non avere una clausola `from`:
//   1. `import ... from 'x'` / `export ... from 'x'`  2. `import 'x'` (solo effetti collaterali)
// `[^'"]*` invece di `[\s\S]*` non è un dettaglio: impedisce alla scansione di scavalcare un
// letterale di stringa e agganciare un `from` lontano, inventando uno specificatore che non
// esiste. Si ferma alla prima virgoletta, cioè dentro lo statement.
const MODULE_SPEC_RE =
  /(?:^|\n)[ \t]*(?:import|export)\b[^'"]*?\bfrom[ \t]*['"]([^'"]+)['"]|(?:^|\n)[ \t]*import[ \t]*['"]([^'"]+)['"]/g
// Frammenti scelti per NON dipendere dal prefisso del percorso. Un elenco precedente cercava
// `lib/ai/` e `lib/delivery/` (più le varianti `./`): un `@/delivery/x` o un `../delivery/x`,
// senza `lib/` in mezzo, sarebbe passato — e il criterio da presidiare dice `delivery/*`, non
// `lib/delivery/*`. `delivery/` e `/ai/` coprono ogni forma (alias, relativa, risalita) e
// allargare non costa falsi positivi: nessuno dei moduli davvero importati nella cartella (i
// fratelli `./…` e quattro builtin `node:`) contiene uno di questi frammenti.
const FORBIDDEN = ['supabase', 'delivery/', '/ai/']
const moduleSpecs = (text: string): string[] => {
  const specs: string[] = []
  for (const m of text.matchAll(MODULE_SPEC_RE)) specs.push(m[1] ?? m[2])
  return specs
}

// Il rilevatore va messo alla prova PRIMA di fidarsene: un controllo che non sa trovare nulla
// passa su qualunque file e non protegge da niente. Campione sintetico con entrambe le forme.
// NB: ogni riga del campione è racchiusa fra virgolette doppie, quindi nel sorgente di QUESTO
// file non comincia con `import`/`export` e non viene raccolta dalla scansione dei sorgenti
// qui sopra (che include anche questo `.mts`). Se un domani si riformattasse il campione
// mettendo un `import` a inizio riga, il test fallirebbe accusando se stesso.
// Le due righe senza `lib/` sono il caso che l'elenco precedente lasciava passare: stanno qui
// perché un allargamento non verificato è indistinguibile da nessun allargamento.
const probe = [
  "import { createClient } from '@/lib/supabase/server'",
  "import '@/lib/delivery/deliverToGuest'",
  "import { deliver } from '@/delivery/deliverToGuest'",
  "import {\n  runPipeline,\n} from '@/lib/ai/pipeline'",
  "import { draft } from '../ai/draft'",
  "export { x } from './vocabulary'",
].join('\n')
const probeSpecs = moduleSpecs(probe)
eq(probeSpecs.length, 6, 'rilevatore import: trova tutte e sei le forme (anche `import \'x\'` nudo)')
eq(probeSpecs.filter((s) => FORBIDDEN.some((f) => s.includes(f))).length, 5,
  'rilevatore import: riconosce i cinque proibiti del campione, anche senza prefisso `lib/`, e assolve il sesto')

for (const { file, text } of sources) {
  const bad = moduleSpecs(text).filter((s) => FORBIDDEN.some((f) => s.includes(f)))
  eq(bad.length, 0, `${file}: nessun import di Supabase / ai / delivery${bad.length ? ` → ${bad.join(', ')}` : ''}`)
}

// I messaggi NON citano per esteso i pattern cercati: questo file è fra i sorgenti scansionati,
// e un messaggio che contenesse `Date` + `.` + `now(` farebbe scattare il controllo su se stesso.
// Le due espressioni regolari qui sotto sono invece innocue così come sono scritte, perché nel
// sorgente le barre rovesciate dell'escape si frappongono ai caratteri cercati.
for (const { file, text } of sources) {
  ok(!/Date\.now\s*\(/.test(text), `${file}: nessuna lettura diretta dell’orologio di sistema`)
  ok(!/new\s+Date\s*\(\s*\)/.test(text), `${file}: nessuna Date costruita senza argomenti`)
}

for (const { file, text } of sources) {
  if (file === 'vocabulary.ts') continue
  const leaked = allVocab.filter((v) => text.includes(v))
  eq(leaked.length, 0, `${file}: non duplica stringhe del vocabolario${leaked.length ? ` → ${leaked.join(', ')}` : ''}`)
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} pass, ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
