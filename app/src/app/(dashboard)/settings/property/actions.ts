'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Resolves the current user's property server-side.
// property_id is never taken from the client — derived from user → org_members → properties.
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
    .select('id, settings')
    .eq('org_id', member.org_id)
    .is('deleted_at', null)
    .limit(1)
    .single()

  if (!property) redirect('/onboarding')

  return {
    supabase,
    propertyId: property.id,
    currentSettings: (property.settings ?? {}) as Record<string, unknown>,
  }
}

export async function updateAnagrafica(formData: FormData) {
  const name = ((formData.get('name') as string | null) ?? '').trim()
  const address = ((formData.get('address') as string | null) ?? '').trim()
  const city = ((formData.get('city') as string | null) ?? '').trim()
  const timezone = (formData.get('timezone') as string | null) ?? 'Europe/Rome'
  const defaultLanguage = (formData.get('default_language') as string | null) ?? 'it'

  if (!name) redirect('/settings/property?error=anagrafica_missing_name')

  const { supabase, propertyId } = await resolveProperty()

  const { error } = await supabase
    .from('properties')
    .update({
      name,
      address: address || null,
      city: city || null,
      timezone,
      default_language: defaultLanguage,
    })
    .eq('id', propertyId)

  if (error) redirect('/settings/property?error=anagrafica_update_failed')

  redirect('/settings/property?saved=anagrafica')
}

export async function updateCommerciale(formData: FormData) {
  const discountRaw = parseFloat((formData.get('direct_discount_pct') as string | null) ?? '10')
  const cityTaxRaw = parseFloat((formData.get('city_tax_euros') as string | null) ?? '0')
  const holdRaw = parseInt((formData.get('hold_hours') as string | null) ?? '24', 10)
  const offerRaw = parseInt((formData.get('offer_validity_hours') as string | null) ?? '48', 10)
  const iban = ((formData.get('iban') as string | null) ?? '').trim()
  const paymentInstructions = ((formData.get('payment_instructions') as string | null) ?? '').trim()
  const disclaimer = ((formData.get('disclaimer') as string | null) ?? '').trim()

  const directDiscountPct = isNaN(discountRaw) ? 10 : Math.max(0, Math.min(100, discountRaw))
  const cityTaxCents = isNaN(cityTaxRaw) ? 0 : Math.max(0, Math.round(cityTaxRaw * 100))
  const holdHours = isNaN(holdRaw) ? 24 : Math.max(1, holdRaw)
  const offerValidityHours = isNaN(offerRaw) ? 48 : Math.max(1, offerRaw)

  const { supabase, propertyId, currentSettings } = await resolveProperty()

  const { error } = await supabase
    .from('properties')
    .update({
      settings: {
        ...currentSettings,
        direct_discount_pct: directDiscountPct,
        city_tax_cents: cityTaxCents,
        hold_hours: holdHours,
        offer_validity_hours: offerValidityHours,
        iban,
        payment_instructions: paymentInstructions,
        disclaimer,
      },
    })
    .eq('id', propertyId)

  if (error) redirect('/settings/property?error=commerciale_update_failed')

  redirect('/settings/property?saved=commerciale')
}

export async function updateAI(formData: FormData) {
  const supervisionMode = formData.get('supervision_mode') === 'true'
  const klmRaw = (formData.get('knowledge_learning_mode') as string | null) ?? 'assisted'
  const knowledgeLearningMode =
    klmRaw === 'manual' || klmRaw === 'assisted' || klmRaw === 'automatic'
      ? klmRaw
      : ('assisted' as const)

  const { supabase, propertyId } = await resolveProperty()

  const { error } = await supabase
    .from('properties')
    .update({ supervision_mode: supervisionMode, knowledge_learning_mode: knowledgeLearningMode })
    .eq('id', propertyId)

  if (error) redirect('/settings/property?error=ai_update_failed')

  redirect('/settings/property?saved=ai')
}

export async function updateProtezioni(formData: FormData) {
  const budgetRaw = parseFloat((formData.get('ai_daily_budget_euros') as string | null) ?? '5')
  const convLimitRaw = parseFloat(
    (formData.get('ai_conversation_cost_limit_euros') as string | null) ?? '0.5'
  )
  const msgLimitRaw = parseInt(
    (formData.get('ai_session_message_limit') as string | null) ?? '30',
    10
  )
  const safeMode = formData.get('safe_mode') === 'true'

  const aiDailyBudgetCents = isNaN(budgetRaw) ? 500 : Math.max(0, Math.round(budgetRaw * 100))
  const aiConvCostLimitCents = isNaN(convLimitRaw)
    ? 50
    : Math.max(0, Math.round(convLimitRaw * 100))
  const aiSessionMsgLimit = isNaN(msgLimitRaw) ? 30 : Math.max(1, msgLimitRaw)

  const { supabase, propertyId, currentSettings } = await resolveProperty()

  const { error } = await supabase
    .from('properties')
    .update({
      settings: {
        ...currentSettings,
        ai_daily_budget_cents: aiDailyBudgetCents,
        ai_conversation_cost_limit_cents: aiConvCostLimitCents,
        ai_session_message_limit: aiSessionMsgLimit,
        safe_mode: safeMode,
      },
    })
    .eq('id', propertyId)

  if (error) redirect('/settings/property?error=protezioni_update_failed')

  redirect('/settings/property?saved=protezioni')
}
