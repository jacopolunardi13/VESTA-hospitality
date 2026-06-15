import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { senderLabels, bookingStatusLabels } from '@/lib/labels'
import { formatDateTime } from '@/lib/format'
import { ConversationStatusBadge, SourceChip, StatusBadge } from '@/components/badges'
import StaffReplyBox from '@/components/staff-reply-box'
import type { Sender, ConversationStatus, Source } from '@/lib/mock/types'
import type { BookingStatus } from '@/lib/quote/types'

const bubbleStyles: Record<Sender, string> = {
  guest: 'self-end bg-slate-900 text-white',
  ai: 'self-start bg-slate-100 text-slate-800',
  staff: 'self-start border border-emerald-300 bg-emerald-50 text-emerald-900',
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

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase, propertyId } = await resolveProperty()

  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, guest_name, guest_contact, source, status, language, intent, stage, booking_request_id')
    .eq('id', id)
    .eq('property_id', propertyId)
    .is('deleted_at', null)
    .single()
  if (!conversation) notFound()

  const [{ data: messages }, lead] = await Promise.all([
    supabase
      .from('messages')
      .select('id, sender, content, created_at')
      .eq('conversation_id', id)
      .order('created_at'),
    conversation.booking_request_id
      ? supabase
          .from('booking_requests')
          .select('id, status')
          .eq('id', conversation.booking_request_id)
          .single()
      : Promise.resolve({ data: null }),
  ])

  const request = lead.data

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/conversations" className="text-sm text-slate-500 hover:text-slate-800">
          ← Conversazioni
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">
          {conversation.guest_name ?? conversation.guest_contact ?? 'Ospite'}
        </h1>
        <SourceChip source={conversation.source as Source} />
        <ConversationStatusBadge status={conversation.status as ConversationStatus} />
        <span className="text-xs uppercase text-slate-400">lingua: {conversation.language}</span>
      </div>

      {request && (
        <Link
          href={`/inbox/${request.id}`}
          className="flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900 transition-colors hover:bg-indigo-100"
        >
          🔗 Lead collegato
          <StatusBadge status={request.status as BookingStatus} />
          <span className="ml-auto">→</span>
        </Link>
      )}

      {/* Thread */}
      <section className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-4">
        {(messages ?? []).length === 0 && (
          <p className="text-center text-sm text-slate-400">Nessun messaggio.</p>
        )}
        {(messages ?? []).map((m) => {
          const sender = m.sender as Sender
          return (
            <div
              key={m.id}
              className={`flex max-w-[85%] flex-col ${sender === 'guest' ? 'self-end items-end' : 'self-start items-start'}`}
            >
              <span className="px-1 text-[10px] uppercase tracking-wide text-slate-400">
                {senderLabels[sender]} · {formatDateTime(m.created_at)}
              </span>
              <div className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${bubbleStyles[sender]}`}>
                {m.content}
              </div>
            </div>
          )
        })}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <StaffReplyBox disabled={conversation.status === 'closed'} />
      </section>
    </div>
  )
}
