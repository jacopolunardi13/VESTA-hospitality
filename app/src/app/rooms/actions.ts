'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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

  return { supabase, propertyId: property.id, orgId: member.org_id }
}

export async function createRoom(formData: FormData) {
  const name = ((formData.get('name') as string | null) ?? '').trim()
  const maxGuestsRaw = parseInt((formData.get('max_guests') as string | null) ?? '1', 10)
  const description = ((formData.get('description') as string | null) ?? '').trim()

  if (!name) redirect('/rooms?error=missing_name')
  const maxGuests = isNaN(maxGuestsRaw) ? 1 : Math.max(1, maxGuestsRaw)

  const { supabase, propertyId, orgId } = await resolveProperty()

  const { error } = await supabase.from('rooms').insert({
    org_id: orgId,
    property_id: propertyId,
    name,
    max_guests: maxGuests,
    description: description || null,
  })

  if (error) redirect('/rooms?error=create_failed')
  redirect('/rooms?saved=created')
}

export async function updateRoom(formData: FormData) {
  const roomId = ((formData.get('room_id') as string | null) ?? '').trim()
  const name = ((formData.get('name') as string | null) ?? '').trim()
  const maxGuestsRaw = parseInt((formData.get('max_guests') as string | null) ?? '1', 10)
  const description = ((formData.get('description') as string | null) ?? '').trim()

  if (!roomId) redirect('/rooms?error=not_found')
  if (!name) redirect(`/rooms?edit=${roomId}&error=missing_name`)
  const maxGuests = isNaN(maxGuestsRaw) ? 1 : Math.max(1, maxGuestsRaw)

  const { supabase, propertyId } = await resolveProperty()

  const { data: existing } = await supabase
    .from('rooms')
    .select('id, property_id')
    .eq('id', roomId)
    .is('deleted_at', null)
    .single()

  if (!existing || existing.property_id !== propertyId) {
    redirect('/rooms?error=not_found')
  }

  const { error } = await supabase
    .from('rooms')
    .update({ name, max_guests: maxGuests, description: description || null })
    .eq('id', roomId)

  if (error) redirect('/rooms?error=update_failed')
  redirect('/rooms?saved=updated')
}

export async function deleteRoom(formData: FormData) {
  const roomId = ((formData.get('room_id') as string | null) ?? '').trim()
  if (!roomId) redirect('/rooms?error=not_found')

  const { supabase, propertyId } = await resolveProperty()

  const { data: existing } = await supabase
    .from('rooms')
    .select('id, property_id')
    .eq('id', roomId)
    .is('deleted_at', null)
    .single()

  if (!existing || existing.property_id !== propertyId) {
    redirect('/rooms?error=not_found')
  }

  const { error } = await supabase
    .from('rooms')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', roomId)

  if (error) redirect('/rooms?error=delete_failed')
  redirect('/rooms?saved=deleted')
}
