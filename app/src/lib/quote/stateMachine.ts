import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { TransitionParams, TransitionResult } from './types'

export async function executeTransition(
  supabase: SupabaseClient<Database>,
  params: TransitionParams
): Promise<TransitionResult> {
  const { data, error } = await supabase.rpc('transition_booking_request', {
    p_request_id:        params.requestId,
    p_org_id:            params.orgId,
    p_to_status:         params.toStatus,
    p_actor:             params.actor,
    p_note:              params.note ?? null,
    p_gross_total_cents: params.grossTotalCents ?? null,
    p_discount_pct:      params.discountPct ?? null,
    p_offer_total_cents: params.offerTotalCents ?? null,
    p_city_tax_cents:    params.cityTaxCents ?? null,
    p_price_source:      params.priceSource ?? null,
    p_data_reliability:  params.dataReliability ?? null,
  })

  if (error) return { ok: false, error: error.message }
  return data as TransitionResult
}
