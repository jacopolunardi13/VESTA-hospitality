import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DOCUMENTS_BUCKET } from '@/lib/documents-center/ingest'

// Serve il PDF archiviato di un documento. Autorizzazione via sessione utente: la riga
// document_center è letta col client utente (RLS = solo il proprio tenant); i bytes sono poi
// scaricati col client admin (il bucket è privato, nessuna policy storage pubblica).
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!id) return new Response('missing id', { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('unauthorized', { status: 401 })

  const db = supabase as unknown as SupabaseClient
  const { data: doc } = await db.from('document_center').select('storage_path, heading').eq('id', id).limit(1).single()
  const storagePath = (doc as { storage_path: string | null } | null)?.storage_path
  if (!storagePath) return new Response('not found', { status: 404 })

  const admin = createAdminClient()
  const { data: blob, error } = await admin.storage.from(DOCUMENTS_BUCKET).download(storagePath)
  if (error || !blob) return new Response('not found', { status: 404 })

  const filename = storagePath.split('/').pop() || 'documento.pdf'
  return new Response(blob, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  })
}
