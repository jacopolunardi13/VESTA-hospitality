'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { dbThrow } from '@/lib/supabase/guard'

// Document Center MVP — azioni staff. Nessuna automazione: lo staff marca esplicitamente i
// documenti come "Inviati al commercialista" e ne resta lo storico (accountant_exports).
async function resolveProperty() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).limit(1).single()
  if (!member) redirect('/onboarding')
  const { data: property } = await supabase.from('properties').select('id').eq('org_id', member.org_id).is('deleted_at', null).limit(1).single()
  if (!property) redirect('/onboarding')
  return { db: supabase as unknown as SupabaseClient, userId: user.id, orgId: member.org_id, propertyId: property.id }
}

/** Marca i documenti selezionati come inviati al commercialista + registra lo storico invio. */
export async function markSentToAccountant(formData: FormData) {
  const ids = formData.getAll('ids').map((v) => String(v)).filter(Boolean)
  if (ids.length === 0) return
  const note = ((formData.get('note') as string | null) ?? '').trim() || null
  const { db, userId, orgId, propertyId } = await resolveProperty()

  // Aggiorna solo documenti della property ancora "pronti" (idempotente; RLS protegge il tenant).
  const { data: updated, error: updErr } = await db.from('document_center')
    .update({ status: 'sent_to_accountant' })
    .eq('property_id', propertyId).in('id', ids).eq('status', 'ready_for_accountant')
    .select('id')
  dbThrow(updErr, 'markSentToAccountant.update')
  const sentIds = ((updated ?? []) as { id: string }[]).map((r) => r.id)
  if (sentIds.length === 0) { revalidatePath('/documents'); return }

  const { error: expErr } = await db.from('accountant_exports').insert({
    org_id: orgId, property_id: propertyId, sent_by: userId, document_ids: sentIds, note,
  })
  dbThrow(expErr, 'markSentToAccountant.export')
  revalidatePath('/documents')
}
