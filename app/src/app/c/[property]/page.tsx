import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import Chat from './chat'

export const dynamic = 'force-dynamic'

export default async function PublicChatPage({
  params,
}: {
  params: Promise<{ property: string }>
}) {
  const { property: propertyId } = await params

  // Pagina pubblica: nessun auth, lettura property via service_role (server-only).
  const sb = createAdminClient()
  const { data: prop } = await sb
    .from('properties')
    .select('id, name')
    .eq('id', propertyId)
    .is('deleted_at', null)
    .single()

  if (!prop) notFound()

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-base font-semibold text-slate-900">{prop.name}</h1>
        <p className="text-xs text-slate-500">Concierge · ti aiuto con informazioni e disponibilità</p>
      </header>
      <Chat propertyId={prop.id} propertyName={prop.name} />
    </div>
  )
}
