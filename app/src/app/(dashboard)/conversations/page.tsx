import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/format'
import { ConversationStatusBadge, SourceChip } from '@/components/badges'
import type { ConversationStatus, Source } from '@/lib/mock/types'
import type { ConversationIntent } from '@/lib/supabase/database.types'

const intentLabels: Record<ConversationIntent, string> = {
  booking: 'Prenotazione',
  faq: 'Informazioni',
  guest_support: 'Assistenza ospite',
  partnership: 'Partnership',
  vendor: 'Commerciale',
  saas_lead: 'Lead SaaS',
  spam: 'Spam',
  unclassified: 'Da classificare',
}

const intentStyles: Record<ConversationIntent, string> = {
  booking: 'bg-green-100 text-green-800',
  faq: 'bg-blue-100 text-blue-800',
  guest_support: 'bg-amber-100 text-amber-800',
  partnership: 'bg-purple-100 text-purple-800',
  vendor: 'bg-slate-200 text-slate-700',
  saas_lead: 'bg-fuchsia-100 text-fuchsia-800',
  spam: 'bg-gray-200 text-gray-500',
  unclassified: 'bg-slate-100 text-slate-500',
}

async function resolveProperty() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: member } = await supabase
    .from('org_members').select('org_id').eq('user_id', user.id).limit(1).single()
  if (!member) redirect('/onboarding')
  const { data: property } = await supabase
    .from('properties').select('id').eq('org_id', member.org_id).is('deleted_at', null).limit(1).single()
  if (!property) redirect('/onboarding')
  return { supabase, propertyId: property.id }
}

export default async function ConversationsPage() {
  const { supabase, propertyId } = await resolveProperty()

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, guest_name, guest_contact, source, status, intent, booking_request_id, updated_at')
    .eq('property_id', propertyId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  const convs = conversations ?? []

  // Ultimo messaggio per conversazione (1 query, dedupe in JS).
  const ids = convs.map((c) => c.id)
  const previews = new Map<string, { content: string; at: string }>()
  if (ids.length > 0) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('conversation_id, content, created_at')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
    for (const m of msgs ?? []) {
      if (!previews.has(m.conversation_id)) {
        previews.set(m.conversation_id, { content: m.content, at: m.created_at })
      }
    }
  }

  // pending_staff in cima, poi per recency.
  const list = [...convs].sort((a, b) => {
    const aP = a.status === 'pending_staff', bP = b.status === 'pending_staff'
    if (aP !== bP) return aP ? -1 : 1
    return (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
  })

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Conversazioni</h1>

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {list.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-slate-400">
            Nessuna conversazione. Quelle dalla chat pubblica compariranno qui.
          </li>
        )}
        {list.map((c) => {
          const preview = previews.get(c.id)
          const intent = c.intent as ConversationIntent | null
          return (
            <li key={c.id}>
              <Link
                href={`/conversations/${c.id}`}
                className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-slate-50"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 truncate font-medium whitespace-nowrap text-slate-900">
                    {c.guest_name ?? c.guest_contact ?? 'Ospite'}
                  </span>
                  <SourceChip source={c.source as Source} />
                  <ConversationStatusBadge status={c.status as ConversationStatus} />
                  {intent && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${intentStyles[intent]}`}>
                      {intentLabels[intent]}
                    </span>
                  )}
                  <span className="ml-auto text-xs whitespace-nowrap text-slate-400">
                    {preview ? formatDateTime(preview.at) : formatDateTime(c.updated_at)}
                  </span>
                </div>
                <p className="truncate pl-1 text-sm text-slate-500">
                  {preview ? `“${preview.content}”` : <span className="text-slate-400">nessun messaggio</span>}
                  {c.booking_request_id && (
                    <span className="ml-2 text-xs font-medium text-indigo-600">[lead collegato]</span>
                  )}
                </p>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
