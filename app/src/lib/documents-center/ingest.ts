// Document Center — MVP deterministico (solo Booking). Quando un'email Booking (ota_pms/booking)
// porta uno o più PDF allegati, scarica i bytes, li salva nel bucket Storage `documents` e crea
// un record in `document_center` con stato 'ready_for_accountant' ("Pronto per il commercialista").
// NIENTE AI/OCR/classificazione: percorso minimo, robusto, isolato. È BEST-EFFORT: cattura ogni
// errore internamente e non solleva mai, così non può rompere il poll email né l'archivio OTA.
import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PropertyContext } from '@/lib/ai/types'
import { downloadAttachment, type InboundEmail } from '@/lib/email/gmail'

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

export interface DocIngestResult { created: number; skipped: number; errors: number }

/** Archivia i PDF di un'email Booking nel Document Center. Idempotente per (gmail_message_id, filename). */
export async function archiveBookingDocuments(
  sb: SupabaseClient<Database>,
  property: PropertyContext,
  email: InboundEmail,
  otaInboxId: string | null,
  accessToken: string
): Promise<DocIngestResult> {
  const out: DocIngestResult = { created: 0, skipped: 0, errors: 0 }
  const pdfs = (email.attachments ?? []).filter(isPdf)
  if (pdfs.length === 0) return out

  for (const att of pdfs) {
    try {
      const filename = safeName(att.filename)
      // Idempotenza: se esiste già un documento per questa email+file, salta (re-run sicuri).
      const { data: existing } = await db(sb).from('document_center').select('id')
        .eq('property_id', property.id).eq('gmail_message_id', email.id)
        .eq('storage_path', `${property.id}/booking/${email.id}/${filename}`).limit(1)
      if (Array.isArray(existing) && existing.length > 0) { out.skipped++; continue }

      const bytes = await downloadAttachment(accessToken, email.id, att.id)
      if (!bytes) { out.errors++; continue }

      const storagePath = `${property.id}/booking/${email.id}/${filename}`
      const up = await sb.storage.from(DOCUMENTS_BUCKET)
        .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true })
      if (up.error) { out.errors++; continue }

      const ins = await db(sb).from('document_center').insert({
        org_id: property.orgId, property_id: property.id,
        ota_inbox_id: otaInboxId, gmail_message_id: email.id,
        source: 'booking', supplier: 'Booking.com', category: 'invoice',
        heading: email.subject || filename,
        storage_path: storagePath,
        attachments: [{ filename, mime: 'application/pdf' }],
        status: 'ready_for_accountant',
      })
      if (ins.error) { out.errors++; continue }
      out.created++
    } catch {
      out.errors++
    }
  }
  return out
}
