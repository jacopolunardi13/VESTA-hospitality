// Aggiornamento KB LunArt (approvato 22/06/2026): correzioni policy + arricchimenti +
// split Musei/Gite/Itinerari + nuovi asset (Wellness, Transfer/NCC, Biancheria).
// Idempotente: ri-eseguibile senza duplicare né creare versioni inutili.
// Replica le convenzioni dell'app (snapshot knowledge_asset_versions + current_version++).
// Uso: node --env-file=.env.local --import tsx scripts/kb-lunart-update.mts [--dry]
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

const DRY = process.argv.includes('--dry')
const PROPERTY_ID = '00000000-0000-0000-0000-000000000011'
const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const { data: prop } = await sb.from('properties').select('id, org_id').eq('id', PROPERTY_ID).single()
const orgId = prop!.org_id
const { data: mem } = await sb.from('org_members').select('user_id').eq('org_id', orgId).limit(1).single()
const editedBy = mem!.user_id

const norm = (s: string | null) => (s ?? '').trim().replace(/\s+/g, ' ')

// — EDIT: trova per titolo (match), aggiorna titolo/contenuto/tag/priorità con snapshot versione —
type Edit = { match: string; title?: string; content: string; tags?: string[]; priority?: number }
const edits: Edit[] = [
  // ── Correzioni policy ──
  { match: 'Bambini e culle',
    content: 'LunArt accetta famiglie con bambini e neonati. I minori devono essere accompagnati da un adulto responsabile. Culle e lettini disponibili su richiesta, da segnalare almeno il giorno prima.' },
  { match: 'Animali',
    content: 'Gli animali domestici (cane, gatto o altri animali, pet) non sono normalmente ammessi. Eventuali eccezioni possono essere valutate esclusivamente caso per caso e previa autorizzazione della struttura: contattare prima di prenotare.' },
  // Rinomina per evitare la collisione di retrieval "porta"/"portare" nel titolo "Gite fuori porta".
  { match: 'Gite fuori porta', title: 'Gite ed escursioni',
    content: 'Gite ed escursioni in giornata da Firenze: Pisa (Torre Pendente) ~1h in auto (A11) oppure treno da Firenze SMN ~1h, ogni ~30 minuti; Siena ~1h15 in auto (superstrada FI-SI) o bus SENA/FlixBus dall’Autostazione (Piazza Adua); San Gimignano ~1h in auto oppure bus SITA con cambio a Poggibonsi (~1h30); Chianti (Greve, Radda, Gaiole) ideale in auto su strade panoramiche. Tour privati in auto con conducente prenotabili tramite la struttura.',
    tags: ['lunart', 'gite', 'escursioni', 'pisa', 'siena', 'chianti', 'san gimignano'] },
  // Fix retrieval: include il singolare "itinerario" (lo stemmer non lega itinerario↔itinerari).
  { match: 'Itinerari consigliati',
    content: 'Idee di itinerario a Firenze. Itinerario di mezza giornata: Ponte Vecchio → Galleria degli Uffizi → Piazza della Signoria e Palazzo Vecchio → aperitivo (Il Santino o Opera Caffè) → cena (Trattoria dall’Oste). Itinerario di 3 giorni: Giorno 1 — Uffizi, Piazza della Signoria, cena alla Giostra; Giorno 2 — Galleria dell’Accademia (David), Duomo, gelato da Edoardo, bistecca da Perseus; Giorno 3 — Oltrarno e Palazzo Pitti, gelato Sbrino, aperitivo Il Santino. Itinerari su misura su richiesta.' },
  { match: 'Cancellazione',
    content: 'Per le prenotazioni dirette la policy standard è: non cancellabile e non rimborsabile (pagamento anticipato). La struttura può, a propria discrezione, valutare uno spostamento delle date o una soluzione alternativa, ma non è garantito automaticamente. Per qualsiasi esigenza contattare la struttura.' },
  // ── Arricchimenti ──
  { match: 'Dotazioni in camera',
    content: 'Ogni camera dispone di: letto matrimoniale, bagno privato con doccia e bidet, accappatoio e pantofole, amenities, AC + riscaldamento, TV flat screen, minibar e frigorifero, macchina Nespresso (capsule selezionate), bollitore con tè e tisane, cassaforte, scaldasalviette. All’arrivo (al check-in) prosecco di benvenuto e acqua. Note d’uso: il climatizzatore ha sensori che lo spengono automaticamente se finestra/porta restano aperte o la camera è vuota; dopo l’accensione dello split attendere ~2 minuti prima che parta l’aria (è normale). Scaldasalviette IRSAP touch: per accenderlo sfiorare il tasto + per 3-5 secondi (caldo in ~10 minuti); reset: staccare 60 secondi, riattaccare, tenere - per 5 secondi poi +.' },
  { match: 'Le camere',
    content: 'Cinque camere prenotabili al 3° piano, tutte con bagno privato e vista sull’Arno: 301 Standard (la più raccolta), 302 Deluxe, 303 Superior (la più richiesta, doppia esposizione, vista completa su Arno e Uffizi), 304 Deluxe, 305 Superior (ampia e appartata). Le camere 303 e 305 sono allestibili come triple (letto aggiuntivo). Le più silenziose sono la 302, la 303 e la 305 (affacci su cortile interno o sull’Arno, lontano dal traffico). La camera 306 Suite Familiare (due camere da letto + due bagni) è attualmente in ristrutturazione e non è ancora prenotabile. Essendo in pieno centro storico è comunque possibile percepire il normale rumore urbano.' },
  { match: 'Ristoranti consigliati',
    content: 'Bistecca e cucina toscana: Trattoria dall’Oste (Via dei Cerchi 40/R, tel 055 213142; e Borgo S. Lorenzo 31, tel 055 202 6862), specialità bistecca alla fiorentina; Antico Ristorante Paoli 1827 (Via dei Tavolini 12/R, tel 055 216215), il ristorante più antico di Firenze; Perseus (Viale Don Minzoni 10/R, tel 055 588226, chiuso domenica). Trattoria classica: Cammillo (Borgo San Jacopo 57/R, vicino Ponte Vecchio, tel 055 212427). Romantico: La Giostra (Borgo Pinti 16/R, tel 055 241341, aperto fino a tarda sera). Tartufo e terrazza panoramica: Osteria delle Tre Panche (Vicolo Marzio 1, sopra Ponte Vecchio, tel +39 348 456 2480).' },
  { match: 'Gelaterie e aperitivo',
    content: 'Gelato: Sbrino Gelatificio Contadino (Via dei Serragli 32/R, Oltrarno), artigianale; Vivoli (Via Isola delle Stinche 7/R, storica dal 1930, chiuso lunedì); Edoardo il Gelato Biologico (Piazza del Duomo 45/R), biologico; La Carraia (Piazza Nazario Sauro 25/R), ottimo rapporto qualità/prezzo. Aperitivo: L’Opera Caffè (Piazza del Duomo 62/R, 30% di sconto per gli ospiti LunArt) e Il Santino (Via Santo Spirito 60/R), wine bar con salumi e formaggi.' },
  { match: 'Deposito bagagli',
    content: 'Deposito bagagli gratuito all’Opera Caffè (Piazza del Duomo 62R), orari 8:30–20:00 (fino a mezzanotte in alta stagione), ritiro a qualsiasi ora, valido sia prima del check-in sia dopo il check-out. In alternativa, a pagamento, è disponibile un Luggage Store nelle vicinanze della struttura.' },
  { match: 'Parcheggio e ZTL',
    content: 'Garage Lungarno (Borgo San Iacopo 10, a pochi passi; ~€35 al giorno fisso indipendentemente dalla dimensione dell’auto; prenotabile su garagelungarno.it; aperto 7:00–1:00). In alternativa Garage Ponte Vecchio (Via de’ Bardi 45, stesso edificio di LunArt; servizio valet; tariffe €35 auto piccola / €45–55 media / €70 grande o SUV; tel 055 239 8600; Lun–Sab 8:00–24:00, Dom 9:00–13:00 e 15:00–20:00): il più comodo ma il più caro. LunArt è in ZTL: dal passaggio sotto la telecamera si hanno al massimo 2h30 per arrivare al garage e far registrare la targa (annulla la multa); all’uscita non ripassare dalle telecamere ZTL, perché la targa non può essere registrata di nuovo.',
    tags: ['lunart', 'golden', 'parcheggio', 'auto', 'garage', 'ztl', 'valet'] },
  // ── Split: "Musei e itinerari" diventa "Musei principali" ──
  { match: 'Musei e itinerari', title: 'Musei principali',
    content: 'Galleria degli Uffizi: martedì–domenica 8:15–18:30, chiuso lunedì; prenotazione consigliata (uffizi.it, tel 055 294883); visita media 2–3 ore. Galleria dell’Accademia (David di Michelangelo): martedì–domenica 8:15–18:50, chiuso lunedì; prenotazione consigliata (galleriaaccademiafirenze.it, tel 055 098 7100); visita media 1–1.5 ore. Entrambe a pochi minuti a piedi da LunArt.',
    tags: ['lunart', 'musei', 'uffizi', 'accademia', 'david'] },
]

// — NEW: crea se non esiste (per titolo) —
type New = { title: string; type: Database['public']['Tables']['knowledge_assets']['Row']['type']; content: string; tags: string[]; priority: number }
const news: New[] = [
  { title: 'Gite ed escursioni', type: 'faq', priority: 30, tags: ['lunart', 'gite', 'escursioni', 'pisa', 'siena', 'chianti', 'san gimignano'],
    content: 'Gite ed escursioni in giornata da Firenze: Pisa (Torre Pendente) ~1h in auto (A11) oppure treno da Firenze SMN ~1h, ogni ~30 minuti; Siena ~1h15 in auto (superstrada FI-SI) o bus SENA/FlixBus dall’Autostazione (Piazza Adua); San Gimignano ~1h in auto oppure bus SITA con cambio a Poggibonsi (~1h30); Chianti (Greve, Radda, Gaiole) ideale in auto su strade panoramiche. Tour privati in auto con conducente prenotabili tramite la struttura.' },
  { title: 'Itinerari consigliati', type: 'faq', priority: 30, tags: ['lunart', 'itinerari', 'itinerario', 'cosa vedere', 'firenze'],
    content: 'Idee di itinerario a Firenze. Itinerario di mezza giornata: Ponte Vecchio → Galleria degli Uffizi → Piazza della Signoria e Palazzo Vecchio → aperitivo (Il Santino o Opera Caffè) → cena (Trattoria dall’Oste). Itinerario di 3 giorni: Giorno 1 — Uffizi, Piazza della Signoria, cena alla Giostra; Giorno 2 — Galleria dell’Accademia (David), Duomo, gelato da Edoardo, bistecca da Perseus; Giorno 3 — Oltrarno e Palazzo Pitti, gelato Sbrino, aperitivo Il Santino. Itinerari su misura su richiesta.' },
  { title: 'Wellness e relax', type: 'faq', priority: 30, tags: ['lunart', 'spa', 'massaggio', 'yoga', 'relax', 'benessere', 'wellness'],
    content: 'Benessere e relax vicino a LunArt: Soulspace SPA (Via Sant’Egidio 12, tel 055 200 1794, soulspace.it) — ingresso spa libero, trattamenti su prenotazione; YogaInCentro Firenze (Via de’ Marsili 1, tel 347 696 1312, yogaincentro.it) — prenotazione obbligatoria; Silathai Thai Massage (Via dei Serragli 63r, tel 055 217559, silathaimassage.com) — prenotazione consigliata, chiuso il martedì.' },
  { title: 'Transfer e NCC privato', type: 'faq', priority: 50, tags: ['lunart', 'ncc', 'transfer', 'taxi', 'aeroporto', 'stazione', 'auto'],
    content: 'Transfer privato con conducente (NCC) prenotabile tramite la struttura, almeno il giorno prima e su preventivo con pagamento anticipato: aeroporto, stazione, tour della Toscana. Per richieste contattare la struttura (Jacopo +39 392 472 5263).' },
  { title: 'Biancheria', type: 'policy', priority: 60, tags: ['lunart', 'biancheria', 'asciugamani', 'teli', 'pulizie'],
    content: 'Cambio biancheria ogni 3 giorni. Cambi extra a richiesta: €5 a pezzo, oppure set completo €15 (2 teli grandi + 2 teli medi + tappetino).' },
]

const report = { updated: [] as string[], created: [] as string[], skipped: [] as string[] }

for (const e of edits) {
  const { data: a } = await sb.from('knowledge_assets').select('id, title, content, current_version, tags')
    .eq('property_id', PROPERTY_ID).eq('title', e.match).is('deleted_at', null).single()
  if (!a) {
    // forse già rinominato (split ri-eseguito)
    if (e.title) { report.skipped.push(`${e.match} → ${e.title} (già rinominato o assente)`); continue }
    report.skipped.push(`${e.match} (asset non trovato)`); continue
  }
  const newTitle = e.title ?? a.title
  const same = norm(a.content) === norm(e.content) && a.title === newTitle && (!e.tags || JSON.stringify(a.tags) === JSON.stringify(e.tags))
  if (same) { report.skipped.push(`${a.title} (già aggiornato)`); continue }
  if (DRY) { report.updated.push(`${a.title}${e.title ? ' → ' + e.title : ''} (DRY)`); continue }
  const nextVersion = a.current_version + 1
  await sb.from('knowledge_asset_versions').insert({ org_id: orgId, asset_id: a.id, version: nextVersion, title: newTitle, content: e.content, edited_by: editedBy })
  const upd: Record<string, unknown> = { title: newTitle, content: e.content, current_version: nextVersion }
  if (e.tags) upd.tags = e.tags
  if (e.priority != null) upd.priority = e.priority
  await sb.from('knowledge_assets').update(upd).eq('id', a.id)
  report.updated.push(`${a.title}${e.title ? ' → ' + e.title : ''}`)
}

for (const n of news) {
  const { data: exists } = await sb.from('knowledge_assets').select('id')
    .eq('property_id', PROPERTY_ID).eq('title', n.title).is('deleted_at', null).maybeSingle()
  if (exists) { report.skipped.push(`${n.title} (già esistente)`); continue }
  if (DRY) { report.created.push(`${n.title} (DRY)`); continue }
  await sb.from('knowledge_assets').insert({
    org_id: orgId, property_id: PROPERTY_ID, type: n.type, origin: 'manual',
    title: n.title, content: n.content, tags: n.tags, priority: n.priority, usable_by_concierge: true,
  })
  report.created.push(n.title)
}

console.log('\n=== AGGIORNATI (' + report.updated.length + ') ===')
report.updated.forEach((x) => console.log('  ✏️  ' + x))
console.log('\n=== CREATI (' + report.created.length + ') ===')
report.created.forEach((x) => console.log('  ➕  ' + x))
console.log('\n=== SALTATI (' + report.skipped.length + ') ===')
report.skipped.forEach((x) => console.log('  ·  ' + x))
process.exit(0)
