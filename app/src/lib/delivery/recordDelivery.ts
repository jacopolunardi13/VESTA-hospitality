// Finalizzazione della CONSEGNA di un turno (separata dalla GENERAZIONE).
// Il core (orchestrate) genera e persiste la risposta come BOZZA (delivery_status='draft').
// Qui il CANALE registra l'esito reale della consegna e — solo se il preventivo è stato
// davvero consegnato — fa avanzare la pratica a 'proposal_sent'.
//
// Stati di consegna (messages.delivery_status):
//   draft        → generato, non ancora consegnato (default del core)
//   sent         → consegnato davvero all'ospite
//   failed       → tentata la consegna ma fallita
//   autosend_off → bozza pronta, NON inviata perché il kill-switch è OFF
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PropertyContext } from '@/lib/ai/types'
import { executeTransition } from '@/lib/quote/stateMachine'
import { createNotification } from '@/lib/notifications'
import { dbThrow } from '@/lib/supabase/guard'

export type DeliveryOutcome = 'sent' | 'failed' | 'autosend_off'

export async function recordDelivery(
  sb: SupabaseClient<Database>,
  args: {
    property: PropertyContext
    conversationId: string
    leadId?: string
    /** true se il turno ha generato un preventivo (bozza) da consegnare. */
    proposalGenerated?: boolean
    outcome: DeliveryOutcome
  }
): Promise<void> {
  const { property, conversationId, leadId, proposalGenerated, outcome } = args
  const orgId = property.orgId
  const propertyId = property.id

  // 1) Aggiorna lo stato di consegna dell'ULTIMO messaggio outbound del turno.
  const { data: last } = await sb
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('direction', 'out')
    .order('created_at', { ascending: false })
    .limit(1)
  if (last && last[0]) {
    dbThrow((await sb.from('messages')
      .update({ delivery_status: outcome })
      .eq('id', last[0].id)).error, 'recordDelivery.message')
  }

  // 2) Avanzamento pratica + notifica staff: dipende dall'esito REALE.
  if (!proposalGenerated || !leadId) return

  if (outcome === 'sent') {
    // Solo ORA il preventivo è "inviato": received → proposal_sent (se ancora received).
    const { data: lead } = await sb.from('booking_requests').select('status').eq('id', leadId).single()
    if (lead?.status === 'received') {
      await executeTransition(sb, {
        requestId: leadId, orgId, toStatus: 'proposal_sent', actor: 'system',
        note: 'Preventivo inviato all\'ospite (consegna confermata)',
      })
    }
    await createNotification(sb, {
      orgId, propertyId, type: 'proposal_auto_sent',
      title: 'Preventivo inviato', body: 'Consegnato all\'ospite.',
      bookingRequestId: leadId, conversationId,
    })
  } else if (outcome === 'autosend_off') {
    await createNotification(sb, {
      orgId, propertyId, type: 'proposal_draft',
      title: 'Bozza preventivo pronta — non inviata',
      body: 'Autosend OFF: la bozza è pronta in dashboard ma NON è stata inviata all\'ospite. Rivedila e inviala manualmente.',
      bookingRequestId: leadId, conversationId,
    })
  } else { // failed
    await createNotification(sb, {
      orgId, propertyId, type: 'escalation',
      title: 'Invio preventivo FALLITO',
      body: 'La consegna del preventivo all\'ospite è fallita: gestire manualmente.',
      bookingRequestId: leadId, conversationId,
    })
  }
}
