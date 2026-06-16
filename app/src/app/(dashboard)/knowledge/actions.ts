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

  return { supabase, userId: user.id, orgId: member.org_id, propertyId: property.id }
}

// DB check constraint values (must match schema.sql exactly):
// type in ('faq','brochure','pdf','procedura','policy','correzione')
// 'pdf' intentionally excluded — no file upload in C10
const ALLOWED_TYPES = ['faq', 'policy', 'procedura', 'correzione', 'brochure'] as const
type AssetType = typeof ALLOWED_TYPES[number]

function toAssetType(raw: string): AssetType {
  return (ALLOWED_TYPES as readonly string[]).includes(raw) ? (raw as AssetType) : 'faq'
}

export async function createAsset(formData: FormData) {
  const title = ((formData.get('title') as string | null) ?? '').trim()
  const typeRaw = (formData.get('type') as string | null) ?? 'faq'
  const content = ((formData.get('content') as string | null) ?? '').trim()

  if (!title) redirect('/knowledge?error=missing_title')

  const { supabase, orgId, propertyId } = await resolveProperty()

  const { error } = await supabase.from('knowledge_assets').insert({
    org_id: orgId,
    property_id: propertyId,
    type: toAssetType(typeRaw),
    origin: 'manual',
    title,
    content: content || null,
  })

  if (error) redirect('/knowledge?error=create_failed')
  redirect('/knowledge?saved=created')
}

export async function updateAsset(formData: FormData) {
  const assetId = ((formData.get('asset_id') as string | null) ?? '').trim()
  const title = ((formData.get('title') as string | null) ?? '').trim()
  const content = ((formData.get('content') as string | null) ?? '').trim()
  const versionFromForm = parseInt((formData.get('current_version') as string | null) ?? '0', 10)

  if (!assetId) redirect('/knowledge?error=not_found')
  if (!title) redirect(`/knowledge?edit=${assetId}&error=missing_title`)
  if (isNaN(versionFromForm)) redirect(`/knowledge?edit=${assetId}&error=not_found`)

  const { supabase, userId, orgId, propertyId } = await resolveProperty()

  const { data: existing } = await supabase
    .from('knowledge_assets')
    .select('id, property_id, current_version')
    .eq('id', assetId)
    .is('deleted_at', null)
    .single()

  if (!existing || existing.property_id !== propertyId) {
    redirect('/knowledge?error=not_found')
  }

  // Optimistic locking: if version changed since the form was loaded, another
  // session saved first — reject to prevent silent overwrites
  if (existing.current_version !== versionFromForm) {
    redirect(`/knowledge?edit=${assetId}&error=version_conflict`)
  }

  const nextVersion = existing.current_version + 1

  // Snapshot captures the new content being saved (immutable audit trail)
  const { error: versionError } = await supabase.from('knowledge_asset_versions').insert({
    org_id: orgId,
    asset_id: assetId,
    version: nextVersion,
    title,
    content: content || null,
    edited_by: userId,
  })

  if (versionError) redirect(`/knowledge?edit=${assetId}&error=update_failed`)

  const { error: assetError } = await supabase
    .from('knowledge_assets')
    .update({ title, content: content || null, current_version: nextVersion })
    .eq('id', assetId)

  if (assetError) redirect(`/knowledge?edit=${assetId}&error=update_failed`)

  redirect('/knowledge?saved=updated')
}

export async function toggleActive(formData: FormData) {
  const assetId = ((formData.get('asset_id') as string | null) ?? '').trim()
  const newValue = formData.get('usable_by_concierge') === 'true'
  if (!assetId) redirect('/knowledge?error=not_found')

  const { supabase, propertyId } = await resolveProperty()

  const { data: existing } = await supabase
    .from('knowledge_assets')
    .select('id, property_id')
    .eq('id', assetId)
    .is('deleted_at', null)
    .single()

  if (!existing || existing.property_id !== propertyId) {
    redirect('/knowledge?error=not_found')
  }

  const { error } = await supabase
    .from('knowledge_assets')
    .update({ usable_by_concierge: newValue })
    .eq('id', assetId)

  if (error) redirect('/knowledge?error=toggle_failed')
  redirect('/knowledge?saved=toggled')
}

export async function deleteAsset(formData: FormData) {
  const assetId = ((formData.get('asset_id') as string | null) ?? '').trim()
  if (!assetId) redirect('/knowledge?error=not_found')

  const { supabase, propertyId } = await resolveProperty()

  const { data: existing } = await supabase
    .from('knowledge_assets')
    .select('id, property_id')
    .eq('id', assetId)
    .is('deleted_at', null)
    .single()

  if (!existing || existing.property_id !== propertyId) {
    redirect('/knowledge?error=not_found')
  }

  const { error } = await supabase
    .from('knowledge_assets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', assetId)

  if (error) redirect('/knowledge?error=delete_failed')
  redirect('/knowledge?saved=deleted')
}
