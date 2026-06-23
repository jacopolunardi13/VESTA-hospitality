// Entry point del motore documenti: da un lead → modello → PDF → (storage).
// Il PDF si genera UNA volta e si archivia per il riuso multi-canale (allegato email,
// documento WhatsApp, link chat). Tutto dai dati già presenti nel preventivo.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PropertyContext } from '@/lib/ai/types'
import { buildDocumentModel, type BuildOpts } from './model'
import { renderDocumentPdf } from './render'
import type { DocumentModel, DocumentType } from './types'

export * from './types'
export { buildDocumentModel } from './model'
export { renderDocumentPdf } from './render'
export { getDocumentConfig, LUNART_DOC_CONFIG } from './config'

const BUCKET = 'documents'

export interface GeneratedDocument {
  model: DocumentModel
  buffer: Buffer
  /** Percorso in Storage (se archiviato). */
  storagePath?: string
  /** URL firmato per il riuso multi-canale (se archiviato). */
  url?: string
}

/**
 * Genera il PDF del documento per un lead. `store=false` (default per i test) salta l'upload.
 * Con `store=true` archivia su Supabase Storage e ritorna percorso + URL firmato (best-effort:
 * se il bucket non esiste, ritorna comunque il buffer senza url).
 */
export async function generateDocument(
  sb: SupabaseClient<Database>,
  property: PropertyContext,
  leadId: string,
  type: DocumentType,
  opts: BuildOpts & { store?: boolean } = {}
): Promise<GeneratedDocument> {
  const model = await buildDocumentModel(sb, property, leadId, type, opts)
  const buffer = await renderDocumentPdf(model)
  if (!opts.store) return { model, buffer }

  try {
    const stamp = (opts.issueDate ?? new Date()).toISOString().slice(0, 10)
    const storagePath = `${property.id}/${leadId}/${type}-${stamp}.pdf`
    const up = await sb.storage.from(BUCKET).upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true })
    if (up.error) return { model, buffer } // bucket assente o errore → almeno il buffer
    const signed = await sb.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 30)
    return { model, buffer, storagePath, url: signed.data?.signedUrl }
  } catch {
    return { model, buffer }
  }
}
