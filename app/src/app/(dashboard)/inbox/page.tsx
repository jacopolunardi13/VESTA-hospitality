import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import InboxFilters from './filters'

async function resolveProperty() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()
  if (!member) redirect('/onboarding')

  const { data: property } = await supabase
    .from('properties')
    .select('id')
    .eq('org_id', member.org_id)
    .is('deleted_at', null)
    .limit(1)
    .single()
  if (!property) redirect('/onboarding')

  return { supabase, propertyId: property.id }
}

export default async function InboxPage() {
  const { supabase, propertyId } = await resolveProperty()

  const { data: requests } = await supabase
    .from('booking_requests')
    .select('*')
    .eq('property_id', propertyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Inbox richieste</h1>
      <InboxFilters requests={requests ?? []} />
      <div>
        <Link
          href="/inbox/new"
          className="inline-block rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          + Nuova richiesta manuale
        </Link>
      </div>
    </div>
  )
}
