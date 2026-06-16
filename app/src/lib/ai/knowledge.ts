import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { KbHit } from './types'

// Retrieval KB app-side con normalizzazione italiana (stemming leggero + stopword).
// Motivo: la FTS Postgres 'simple' non fa stemming ("parcheggiare" ≠ "parcheggio")
// né rimuove le stopword. Qui le gestiamo, così varianti morfologiche e domande
// naturali recuperano l'asset corretto. La KB per property è piccola (decine di asset).

const STOPWORDS = new Set([
  'a','ad','al','allo','ai','agli','alla','alle','con','col','coi','da','dal','dallo','dai','dagli','dalla','dalle',
  'di','del','dello','dei','degli','della','delle','in','nel','nello','nei','negli','nella','nelle','su','sul','sullo',
  'sui','sugli','sulla','sulle','per','tra','fra','e','ed','o','oppure','ma','se','che','chi','cui','non','come','dove',
  'quando','perche','perché','quale','quali','quanto','quanta','quanti','quante','io','tu','lui','lei','noi','voi','loro',
  'il','lo','la','i','gli','le','un','uno','una','mi','ti','ci','vi','si','ne','è','e','ho','hai','ha','abbiamo','avete',
  'hanno','sono','sei','siamo','siete','posso','puoi','può','possiamo','potete','vorrei','vorremmo','c','qual',
  'mio','mia','miei','mie','tuo','tua','questo','questa','questi','queste','quello','quella','vostro','vostra',
  'buongiorno','salve','ciao','grazie','prego',
])

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ')
}

// Stemmer italiano leggero: rimuove i suffissi flessionali più comuni.
const SUFFIXES = ['amento','azione','azioni','zione','zioni','aggio','aggi','mente','issim','ando','endo',
  'are','ere','ire','ato','ati','ata','ate','ito','iti','ita','ite','oso','osa','osi','ose','i','o','a','e']

function stem(word: string): string {
  let w = word
  for (const suf of SUFFIXES) {
    if (w.length - suf.length >= 4 && w.endsWith(suf)) return w.slice(0, -suf.length)
  }
  return w
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .map(stem)
}

/** Soglia minima di rilevanza per rispondere direttamente dalla KB (safe mode). */
export const KB_DIRECT_ANSWER_RANK = 1

/**
 * Recupera gli asset KB più rilevanti per la query (stemming + stopword italiane).
 * Punteggio: match stem nel titolo (peso 2) + nel contenuto (peso 1) + priorità come spareggio.
 */
export async function searchKnowledge(
  sb: SupabaseClient<Database>,
  propertyId: string,
  query: string,
  limit = 5
): Promise<KbHit[]> {
  const qStems = new Set(tokens(query))
  if (qStems.size === 0) return []

  const { data, error } = await sb
    .from('knowledge_assets')
    .select('id, title, content, type, priority')
    .eq('property_id', propertyId)
    .is('deleted_at', null)
    .eq('usable_by_concierge', true)
  if (error || !data) return []

  const scored = data
    .map((a) => {
      const titleStems = new Set(tokens(a.title ?? ''))
      const bodyStems = new Set(tokens(a.content ?? ''))
      let score = 0
      for (const q of qStems) {
        if (titleStems.has(q)) score += 2
        else if (bodyStems.has(q)) score += 1
      }
      return { a, score }
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || (y.a.priority ?? 0) - (x.a.priority ?? 0))
    .slice(0, limit)

  return scored.map(({ a, score }) => ({
    id: a.id, title: a.title, content: a.content, type: a.type,
    priority: a.priority ?? 0, rank: score,
  }))
}

/** Concatena i contenuti KB come contesto per generate_reply. */
export function kbContextText(hits: KbHit[]): string {
  if (hits.length === 0) return ''
  return hits.map((h) => `## ${h.title}\n${h.content ?? ''}`.trim()).join('\n\n')
}
