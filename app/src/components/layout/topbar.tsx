import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NotificationBell, { type NotificationItem } from './notification-bell'

export default async function Topbar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('org_members').select('org_id').eq('user_id', user.id).limit(1).single()
  const { data: property } = member
    ? await supabase
        .from('properties').select('id, name').eq('org_id', member.org_id).is('deleted_at', null).limit(1).single()
    : { data: null }

  const initials = (user.email ?? 'U').slice(0, 2).toUpperCase()

  let notifications: NotificationItem[] = []
  if (property) {
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, booking_request_id, conversation_id, read_at, created_at')
      .eq('property_id', property.id)
      .order('created_at', { ascending: false })
      .limit(30)
    notifications = (data ?? []) as NotificationItem[]
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:gap-4 sm:px-4">
      <span className="shrink-0 text-sm font-bold tracking-tight whitespace-nowrap text-slate-900">
        Vesta<span className="hidden font-normal text-slate-400 lg:inline"> · Concierge &amp; Direct Quote</span>
      </span>
      {property && (
        <span className="min-w-0 truncate text-sm text-slate-600">{property.name}</span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        {property && <NotificationBell propertyId={property.id} initial={notifications} />}
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white"
          title={user.email ?? undefined}
        >
          {initials}
        </div>
      </div>
    </header>
  )
}
