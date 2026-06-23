// Costruisce il DocumentModel da un lead esistente (booking_requests + items + rooms) e dalla
// config della property. Nessun input manuale: tutto deriva dal preventivo già calcolato.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PropertyContext } from '@/lib/ai/types'
import { getDocumentConfig } from './config'
import type { DocumentModel, DocumentType, DocLine } from './types'

const eur = (cents: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const dateLong = (iso: string) => {
  try { return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso + 'T00:00:00Z')) }
  catch { return iso }
}
const nightsBetween = (ci: string, co: string) =>
  Math.max(1, Math.round((new Date(co + 'T00:00:00Z').getTime() - new Date(ci + 'T00:00:00Z').getTime()) / 86400000))
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x }

export interface BuildOpts {
  issueDate?: Date
  /** Conferma: importi acconto/saldo (cent). */
  depositCents?: number
  reference?: string // override del riferimento (es. codice prenotazione esterno)
}

export async function buildDocumentModel(
  sb: SupabaseClient<Database>,
  property: PropertyContext,
  leadId: string,
  type: DocumentType,
  opts: BuildOpts = {}
): Promise<DocumentModel> {
  const config = getDocumentConfig(property)
  const issueDate = opts.issueDate ?? new Date()

  const { data: lead, error } = await sb
    .from('booking_requests')
    .select('id, guest_name, check_in, check_out, adults, children, gross_total_cents')
    .eq('id', leadId).eq('property_id', property.id).single()
  if (error || !lead) throw new Error(`lead non trovato (${leadId}): ${error?.message ?? 'null'}`)
  if (!lead.check_in || !lead.check_out || !lead.adults) throw new Error(`lead ${leadId} senza date/ospiti: documento non generabile`)

  const { data: items } = await sb
    .from('booking_request_items')
    .select('room_id, price_cents')
    .eq('booking_request_id', leadId)
  const rows = items ?? []
  if (rows.length === 0) throw new Error(`lead ${leadId} senza preventivo (nessun item): documento non generabile`)

  const roomIds = [...new Set(rows.map((r) => r.room_id))]
  const { data: rooms } = await sb.from('rooms').select('id, name, sort_order').in('id', roomIds)
  const nameById = new Map((rooms ?? []).map((r) => [r.id, r.name]))
  const orderById = new Map((rooms ?? []).map((r) => [r.id, r.sort_order ?? 0]))

  // Raggruppa per camera: notti (numero righe) + totale.
  const byRoom = new Map<string, { nights: number; total: number }>()
  for (const r of rows) {
    const g = byRoom.get(r.room_id) ?? { nights: 0, total: 0 }
    g.nights += 1; g.total += r.price_cents
    byRoom.set(r.room_id, g)
  }
  const nights = nightsBetween(lead.check_in, lead.check_out)
  const lines: DocLine[] = [...byRoom.entries()]
    .sort((a, b) => (orderById.get(a[0]) ?? 0) - (orderById.get(b[0]) ?? 0))
    .map(([roomId, g]) => ({
      description: `Pernottamento – ${nameById.get(roomId) ?? 'Camera'}`,
      details: `Colazione inclusa · ${g.nights} ${g.nights === 1 ? 'notte' : 'notti'}`,
      amountCents: g.total,
    }))

  const totalCents = lead.gross_total_cents ?? rows.reduce((s, r) => s + r.price_cents, 0)
  const children = Array.isArray(lead.children) ? (lead.children as { age: number | null }[]) : []
  const guestsCount = lead.adults + children.length
  const guestsLabel = `${lead.adults} ${lead.adults === 1 ? 'adulto' : 'adulti'}` +
    (children.length ? ` · ${children.length} ${children.length === 1 ? 'bambino' : 'bambini'}` : '')

  const cityTaxNote = `La tassa di soggiorno comunale (${eur(config.cityTaxPerAdultNightCents)} a persona/notte) non è inclusa e va corrisposta direttamente in struttura.`

  const isPreventivo = type === 'preventivo'
  const reference = opts.reference ?? (isPreventivo
    ? `Valido fino al ${dateLong(addDays(issueDate, config.validityDays).toISOString().slice(0, 10))}`
    : `Rif. prenotazione ${leadId.slice(0, 8).toUpperCase()}`)

  const conditions = isPreventivo
    ? ['La prenotazione si intende confermata al ricevimento del pagamento.', 'Il presente preventivo non costituisce fattura.']
    : [`Check-in dalle ore ${config.checkInFrom} · Check-out entro le ore ${config.checkOutBy}`,
       'Per modifiche o cancellazioni si prega di contattare la struttura.',
       'Il presente documento non costituisce fattura.']

  const depositCents = opts.depositCents
  const balanceCents = depositCents != null ? Math.max(0, totalCents - depositCents) : undefined

  return {
    type,
    title: isPreventivo ? 'PREVENTIVO' : 'CONFERMA DI PRENOTAZIONE',
    config,
    issuePlaceDate: `Firenze, ${dateLong(issueDate.toISOString().slice(0, 10))}`,
    reference,
    guestName: lead.guest_name?.trim() || 'Gentile Ospite',
    guestsLabel,
    checkInLabel: dateLong(lead.check_in),
    checkOutLabel: dateLong(lead.check_out),
    nights,
    guestsCount,
    lines,
    totalCents,
    cityTaxNote,
    conditions,
    depositCents,
    balanceCents,
  }
}
