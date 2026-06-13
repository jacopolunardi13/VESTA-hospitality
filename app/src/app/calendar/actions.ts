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

  return { supabase, orgId: member.org_id, propertyId: property.id }
}

export async function setRates(formData: FormData) {
  const roomId = ((formData.get('room_id') as string | null) ?? '').trim()
  const fromDateStr = ((formData.get('from_date') as string | null) ?? '').trim()
  const toDateStr = ((formData.get('to_date') as string | null) ?? '').trim()
  const priceEurosRaw = parseFloat((formData.get('price_euros') as string | null) ?? '')
  // Schema: available int not null default 1 check (available in (0,1)) — integer, NOT boolean
  const available: 0 | 1 = formData.get('available') === 'on' ? 1 : 0
  const minStayRaw = parseInt((formData.get('min_stay') as string | null) ?? '1', 10)

  if (!roomId) redirect('/calendar?error=missing_room')
  if (!fromDateStr || !toDateStr) redirect('/calendar?error=missing_dates')
  if (isNaN(priceEurosRaw) || priceEurosRaw < 0) redirect('/calendar?error=invalid_price')

  const minStay = isNaN(minStayRaw) ? 1 : Math.max(1, minStayRaw)
  const priceCents = Math.round(priceEurosRaw * 100)

  // Parse as UTC midnight to avoid local-timezone drift in date iteration
  const fromDate = new Date(fromDateStr + 'T00:00:00Z')
  const toDate = new Date(toDateStr + 'T00:00:00Z')

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    redirect('/calendar?error=invalid_dates')
  }
  if (toDate < fromDate) redirect('/calendar?error=invalid_date_range')

  // 90-day cap (inclusive): from=Jul 1, to=Sep 28 → 90 days allowed; to=Sep 29 → rejected
  const diffDays =
    Math.floor((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  if (diffDays > 90) redirect('/calendar?error=range_too_large')

  const { supabase, orgId, propertyId } = await resolveProperty()

  // Application-level room ownership check
  const { data: room } = await supabase
    .from('rooms')
    .select('id, property_id')
    .eq('id', roomId)
    .is('deleted_at', null)
    .single()

  if (!room || room.property_id !== propertyId) {
    redirect('/calendar?error=room_not_found')
  }

  // Build one row per date using UTC date methods to avoid DST issues
  const rows: Array<{
    org_id: string
    property_id: string
    room_id: string
    date: string
    price_cents: number
    available: 0 | 1
    min_stay: number
    source: 'manual'
  }> = []

  const current = new Date(fromDate)
  while (current <= toDate) {
    rows.push({
      org_id: orgId,
      property_id: propertyId,
      room_id: roomId,
      date: current.toISOString().slice(0, 10),
      price_cents: priceCents,
      available,
      min_stay: minStay,
      source: 'manual',
    })
    current.setUTCDate(current.getUTCDate() + 1)
  }

  // onConflict references the unique (room_id, date) constraint in schema.sql:139
  const { error } = await supabase
    .from('rate_calendar')
    .upsert(rows, { onConflict: 'room_id,date' })

  if (error) redirect('/calendar?error=upsert_failed')
  redirect(`/calendar?saved=rates_set`)
}

export async function deleteRate(formData: FormData) {
  const rateId = ((formData.get('rate_id') as string | null) ?? '').trim()
  if (!rateId) redirect('/calendar?error=not_found')

  const { supabase, propertyId } = await resolveProperty()

  // Ownership check before hard delete (rate_calendar has no deleted_at)
  const { data: existing } = await supabase
    .from('rate_calendar')
    .select('id, property_id')
    .eq('id', rateId)
    .single()

  if (!existing || existing.property_id !== propertyId) {
    redirect('/calendar?error=not_found')
  }

  const { error } = await supabase
    .from('rate_calendar')
    .delete()
    .eq('id', rateId)

  if (error) redirect('/calendar?error=delete_failed')
  redirect('/calendar?saved=rate_cleared')
}
