import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export type NotificationType =
  | 'proposal_auto_sent'
  | 'proposal_draft'
  | 'escalation'
  | 'new_lead'

/** Crea una notifica staff (scritta dal backend service_role). */
export async function createNotification(
  sb: SupabaseClient<Database>,
  n: {
    orgId: string
    propertyId: string | null
    type: NotificationType
    title: string
    body?: string | null
    bookingRequestId?: string | null
    conversationId?: string | null
  }
): Promise<void> {
  await sb.from('notifications').insert({
    org_id: n.orgId,
    property_id: n.propertyId,
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    booking_request_id: n.bookingRequestId ?? null,
    conversation_id: n.conversationId ?? null,
  })
}
