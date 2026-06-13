'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function createOrg(formData: FormData) {
  const name = ((formData.get('name') as string | null) ?? '').trim()
  if (!name) redirect('/onboarding?error=missing_name')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Use service role to bypass RLS: new users are not yet org members,
  // so user_in_org(new_org_id) = false and the WITH CHECK on organizations blocks the INSERT.
  const admin = createAdminClient()
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({ name })
    .select('id')
    .single()

  if (orgError || !org) redirect('/onboarding?error=create_org_failed')

  // Enroll immediately — if this fails, abort: do not redirect to step 2.
  const { error: enrollError } = await supabase.rpc('enroll_user_in_org', {
    p_org_id: org.id,
    p_user_id: user.id,
  })
  if (enrollError) redirect('/onboarding?error=enroll_failed')

  redirect(`/onboarding?step=2&org_id=${org.id}`)
}

export async function createProperty(formData: FormData) {
  const orgId = ((formData.get('org_id') as string | null) ?? '').trim()
  const name = ((formData.get('name') as string | null) ?? '').trim()
  const cityRaw = ((formData.get('city') as string | null) ?? '').trim()
  const timezone = (formData.get('timezone') as string | null) ?? 'Europe/Rome'
  const defaultLanguage = (formData.get('default_language') as string | null) ?? 'it'

  if (!orgId || !name) redirect('/onboarding?error=missing_fields')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Authenticated client is sufficient: user_in_org(orgId) = true after step 1 enrollment.
  const { data: property, error } = await supabase
    .from('properties')
    .insert({
      org_id: orgId,
      name,
      timezone,
      default_language: defaultLanguage,
      ...(cityRaw ? { city: cityRaw } : {}),
    })
    .select('id')
    .single()

  if (error || !property) {
    redirect(`/onboarding?step=2&org_id=${orgId}&error=create_property_failed`)
  }

  redirect(`/onboarding?step=3&org_id=${orgId}&property_id=${property.id}`)
}

export async function finalizeOnboarding(formData: FormData) {
  const orgId = ((formData.get('org_id') as string | null) ?? '').trim()
  const propertyId = ((formData.get('property_id') as string | null) ?? '').trim()
  const supervisionMode = formData.get('supervision_mode') === 'true'
  const discountPctRaw = parseInt((formData.get('direct_discount_pct') as string | null) ?? '10', 10)
  const holdHoursRaw = parseInt((formData.get('hold_hours') as string | null) ?? '24', 10)
  const discountPct = Number.isNaN(discountPctRaw) ? 10 : Math.max(0, Math.min(100, discountPctRaw))
  const holdHours = Number.isNaN(holdHoursRaw) ? 24 : Math.max(1, holdHoursRaw)

  if (!orgId || !propertyId) redirect('/onboarding?error=missing_fields')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // settings is {} on a fresh property from step 2 — direct assignment is safe.
  const { error } = await supabase
    .from('properties')
    .update({
      supervision_mode: supervisionMode,
      settings: { direct_discount_pct: discountPct, hold_hours: holdHours },
    })
    .eq('id', propertyId)

  if (error) {
    redirect(`/onboarding?step=3&org_id=${orgId}&property_id=${propertyId}&error=finalize_failed`)
  }

  redirect('/inbox')
}
