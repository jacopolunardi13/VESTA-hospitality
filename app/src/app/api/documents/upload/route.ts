import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DOCUMENTS_BUCKET, isPdf, safeName } from '@/lib/documents-center/ingest'

// Upload manuale di un documento nel Document Center (sorgente 'upload', oltre all'ingest email).
// Autorizzazione via sessione utente (RLS sul tenant); Storage + insert via admin (bucket privato).
// Form HTML semplice → redirect a /documents (nessun JS client). Errori: loggati + mostrati (mai silenziosi).
export const dynamic = 'force-dynamic'

const CATEGORIES = ['invoice', 'contract', 'insurance', 'utility', 'tax', 'pec', 'employee', 'certificate', 'other']

export async function POST(request: Request) {
  const back = (q: string) => Response.redirect(new URL(`/documents?${q}`, request.url), 303)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.redirect(new URL('/login', request.url), 303)
  const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).limit(1).single()
  if (!member) return Response.redirect(new URL('/onboarding', request.url), 303)
  const { data: property } = await supabase.from('properties').select('id').eq('org_id', member.org_id).is('deleted_at', null).limit(1).single()
  if (!property) return Response.redirect(new URL('/onboarding', request.url), 303)

  const form = await request.formData()
  const file = form.get('file')
  const supplier = ((form.get('supplier') as string | null) ?? '').trim() || null
  let category = ((form.get('category') as string | null) ?? 'other').trim()
  if (!CATEGORIES.includes(category)) category = 'other'

  if (!(file instanceof File) || file.size === 0) return back('error=nofile')
  if (!isPdf({ filename: file.name, mimeType: file.type })) return back('error=notpdf')
  if (file.size > 10 * 1024 * 1024) return back('error=toobig')

  const filename = safeName(file.name)
  const bytes = Buffer.from(await file.arrayBuffer())
  const storagePath = `${property.id}/upload/${Date.now()}-${filename}`

  const admin = createAdminClient()
  const up = await admin.storage.from(DOCUMENTS_BUCKET).upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false })
  if (up.error) { console.error(`[doc-upload] storage: ${up.error.message}`); return back('error=storage') }

  const db = admin as unknown as SupabaseClient
  const ins = await db.from('document_center').insert({
    org_id: member.org_id, property_id: property.id,
    source: 'upload', supplier, category,
    heading: file.name,
    storage_path: storagePath,
    attachments: [{ filename, mime: 'application/pdf' }],
    status: 'ready_for_accountant',
  })
  if (ins.error) { console.error(`[doc-upload] insert: ${ins.error.message}`); return back('error=db') }

  return back('uploaded=1')
}
