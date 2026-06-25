import { createClient } from '@/lib/supabase/server'
import { generateDocument } from '@/lib/documents'
import type { PropertyContext } from '@/lib/ai/types'

// Anteprima/scarica del PDF (preventivo|conferma) di un lead. Read-only, auth via sessione +
// appartenenza org. Genera al volo (store:false). Per la schermata "Approva e invia".
export async function GET(request: Request) {
  const url = new URL(request.url)
  const leadId = (url.searchParams.get('lead') ?? '').trim()
  const type = url.searchParams.get('type') === 'conferma' ? 'conferma' : 'preventivo'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('unauthorized', { status: 401 })
  const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).limit(1).single()
  if (!member) return new Response('forbidden', { status: 403 })
  const { data: lead } = await supabase.from('booking_requests').select('id, property_id').eq('id', leadId).single()
  if (!lead) return new Response('not found', { status: 404 })
  const { data: p } = await supabase.from('properties').select('id, org_id, name, settings, supervision_mode').eq('id', lead.property_id).eq('org_id', member.org_id).single()
  if (!p) return new Response('forbidden', { status: 403 })

  const property: PropertyContext = { id: p.id, orgId: p.org_id, name: p.name, settings: (p.settings ?? {}) as Record<string, unknown>, supervisionMode: p.supervision_mode }
  try {
    const gen = await generateDocument(supabase, property, leadId, type, {})
    return new Response(new Uint8Array(gen.buffer), {
      headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${type}.pdf"` },
    })
  } catch (e) {
    return new Response('errore generazione documento: ' + (e instanceof Error ? e.message : String(e)), { status: 500 })
  }
}
