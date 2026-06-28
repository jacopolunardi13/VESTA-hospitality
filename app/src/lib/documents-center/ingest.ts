// Document Center — ingest generico, primo modulo del Back Office Assistant. Data un'email non-ospite,
// consulta il registry dei Recognizer (Supplier Knowledge): se uno la rivendica, scarica i PDF, li
// salva nel bucket Storage `documents` e crea i record in `document_center` con i metadati del
// recognizer (supplier/categoria/stato). NIENTE AI/OCR/classificazione nell'MVP. È BEST-EFFORT:
// cattura ogni errore internamente e non solleva mai, così non può rompere il poll né l'archivio OTA.
// Estendere = aggiungere un recognizer al registry; questo file NON cambia al crescere delle fasi.
import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PropertyContext } from '@/lib/ai/types'
import { downloadAttachment, type InboundEmail, type EmailAttachmentRef } from '@/lib/email/gmail'
import type { RouteResult } from '@/lib/email/routing'
import { recognizeEmail } from './registry'

const db = (sb: SupabaseClient<Database>) => sb as unknown as SupabaseClient
export const DOCUMENTS_BUCKET = 'documents'

/** È un PDF? (deterministico: mime application/pdf o estensione .pdf). */
export function isPdf(a: { filename: string; mimeType: string }): boolean {
  return a.mimeType.toLowerCase().includes('pdf') || /\.pdf$/i.test(a.filename)
}

/** Nome file sicuro per lo storage path (no slash/spazi/caratteri strani). */
export function safeName(name: string): string {
  return (name || 'documento.pdf').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120)
}

export interface DocIngestResult { recognizer: string | null; created: number; skipped: number; errors: number }

/** Archivia nel Document Center i PDF di un'email, se un recognizer la rivendica.
 *  Idempotente per (gmail_message_id, storage_path) → re-run e poll ripetuti sono sicuri. */
export async function archiveEmailDocuments(
  sb: SupabaseClient<Database>,
  property: PropertyContext,
  email: InboundEmail,
  route: RouteResult,
  otaInboxId: string | null,
  accessToken: string
): Promise<DocIngestResult> {
  const rec = recognizeEmail(email, route)
  const out: DocIngestResult = { recognizer: rec?.id ?? null, created: 0, skipped: 0, errors: 0 }
  if (!rec) return out

  const accepts = rec.acceptsAttachment ?? (() => true)
  const pdfs = (email.attachments ?? []).filter((a: EmailAttachmentRef) => isPdf(a) && accepts(a))
  if (pdfs.length === 0) return out

  for (const att of pdfs) {
    try {
      const filename = safeName(att.filename)
      const storagePath = `${property.id}/${rec.id}/${email.id}/${filename}`
      // Idempotenza: se esiste già un documento per questa email+file, salta.
      const { data: existing } = await db(sb).from('document_center').select('id')
        .eq('property_id', property.id).eq('gmail_message_id', email.id).eq('storage_path', storagePath).limit(1)
      if (Array.isArray(existing) && existing.length > 0) { out.skipped++; continue }

      const bytes = await downloadAttachment(accessToken, email.id, att.id)
      if (!bytes) { console.error(`[doc-ingest] download fallito ${email.id}/${att.id}`); out.errors++; continue }

      const up = await sb.storage.from(DOCUMENTS_BUCKET)
        .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true })
      if (up.error) { console.error(`[doc-ingest] storage ${storagePath}: ${up.error.message}`); out.errors++; continue }

      const meta = rec.describe(email, att)
      const ins = await db(sb).from('document_center').insert({
        org_id: property.orgId, property_id: property.id,
        ota_inbox_id: otaInboxId, gmail_message_id: email.id,
        source: meta.source, supplier: meta.supplier, category: meta.category,
        heading: meta.heading,
        doc_date: meta.docDate ?? null, doc_number: meta.docNumber ?? null,
        amount_cents: meta.amountCents ?? null, currency: meta.currency ?? null,
        has_vat: meta.hasVat ?? null, vat_number: meta.vatNumber ?? null,
        storage_path: storagePath,
        attachments: [{ filename, mime: 'application/pdf' }],
        status: meta.status,
      })
      // Best-effort: NON lancia (non deve rompere il poll) ma logga sempre l'errore (mai silenzioso).
      if (ins.error) { console.error(`[doc-ingest] insert document_center: ${ins.error.message}`); out.errors++; continue }
      out.created++
    } catch (e) {
      console.error(`[doc-ingest] eccezione: ${e instanceof Error ? e.message : String(e)}`)
      out.errors++
    }
  }
  return out
}
