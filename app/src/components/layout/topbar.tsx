import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { platformBrand } from '@/lib/brand'
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
      {/* Logo piattaforma Vesta (asset statico swappabile). eslint-disable: SVG da /public,
          referenziato per percorso così l'SVG definitivo si sostituisce senza toccare il codice. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={platformBrand.logo} alt={platformBrand.name} className="h-8 w-auto shrink-0" />
      {property && (
        <span className="min-w-0 truncate border-l border-slate-200 pl-2 text-sm text-slate-600 sm:pl-3">{property.name}</span>
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
