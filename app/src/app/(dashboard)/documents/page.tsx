import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { markSentToAccountant } from './actions'

// Document Center MVP (solo Booking). Elenco documenti archiviati automaticamente dalle email
// Booking (PDF allegato), con stato e azione "Inviato al commercialista" + storico invii.
// Niente AI/OCR/classificazione: percorso minimo e robusto.
export const dynamic = 'force-dynamic'

interface DocRow {
  id: string
  created_at: string
  supplier: string | null
  category: string
  heading: string | null
  status: string
  storage_path: string | null
  gmail_message_id: string | null
}
interface ExportRow { sent_at: string; document_ids: string[]; note: string | null }

const STATUS = {
  ready_for_accountant: { label: 'Pronto per il commercialista', cls: 'bg-emerald-50 text-emerald-700' },
  sent_to_accountant: { label: 'Inviato al commercialista', cls: 'bg-slate-100 text-slate-600' },
} as const
const statusMeta = (s: string) => STATUS[s as keyof typeof STATUS] ?? { label: s, cls: 'bg-slate-100 text-slate-600' }

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams
  const filter = f === 'sent' || f === 'all' ? f : 'ready'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).limit(1).single()
  if (!member) redirect('/onboarding')
  const { data: property } = await supabase.from('properties').select('id, name').eq('org_id', member.org_id).is('deleted_at', null).limit(1).single()
  if (!property) redirect('/onboarding')

  const db = supabase as unknown as SupabaseClient
  const { count: readyCount } = await db.from('document_center').select('*', { count: 'exact', head: true })
    .eq('property_id', property.id).eq('status', 'ready_for_accountant')
  const { count: sentCount } = await db.from('document_center').select('*', { count: 'exact', head: true })
    .eq('property_id', property.id).eq('status', 'sent_to_accountant')

  let q = db.from('document_center')
    .select('id, created_at, supplier, category, heading, status, storage_path, gmail_message_id')
    .eq('property_id', property.id).order('created_at', { ascending: false }).limit(200)
  if (filter === 'ready') q = q.eq('status', 'ready_for_accountant')
  else if (filter === 'sent') q = q.eq('status', 'sent_to_accountant')
  const { data: rowsData } = await q
  const rows = (rowsData ?? []) as DocRow[]

  const { data: expData } = await db.from('accountant_exports')
    .select('sent_at, document_ids, note').eq('property_id', property.id).order('sent_at', { ascending: false }).limit(20)
  const exports = (expData ?? []) as ExportRow[]

  const fmt = (iso: string) => { try { return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return iso } }
  const tab = (key: string, label: string, n?: number) => (
    <a href={`/documents?f=${key}`} className={`rounded-md px-3 py-1.5 text-sm font-medium ${filter === key ? 'bg-brand-anthracite text-white' : 'bg-white text-slate-600 hover:bg-slate-100'} border border-slate-200`}>
      {label}{typeof n === 'number' ? ` (${n})` : ''}
    </a>
  )

  return (
    <div className="px-1 py-2">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Document Center — {property.name}</h1>
      <p className="mb-5 text-sm text-slate-500">Documenti archiviati automaticamente dalle email Booking (fattura PDF allegata). L&apos;email originale e il PDF restano conservati.</p>

      <div className="mb-4 flex flex-wrap gap-2">
        {tab('ready', 'Pronti per il commercialista', readyCount ?? 0)}
        {tab('sent', 'Inviati', sentCount ?? 0)}
        {tab('all', 'Tutti')}
      </div>

      <form action={markSentToAccountant} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {filter === 'ready' && <th className="w-8 px-3 py-2"></th>}
              <th className="px-3 py-2 font-medium">Ricevuto</th>
              <th className="px-3 py-2 font-medium">Fornitore</th>
              <th className="px-3 py-2 font-medium">Documento</th>
              <th className="px-3 py-2 font-medium">Stato</th>
              <th className="px-3 py-2 font-medium">PDF</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Nessun documento{filter === 'ready' ? ' in attesa' : ''}. Arrivano automaticamente dalle email Booking con fattura PDF.</td></tr>
            )}
            {rows.map((r) => {
              const sm = statusMeta(r.status)
              return (
                <tr key={r.id} className="border-b border-slate-100 last:border-0">
                  {filter === 'ready' && (
                    <td className="px-3 py-2"><input type="checkbox" name="ids" value={r.id} defaultChecked className="h-4 w-4 rounded border-slate-300" /></td>
                  )}
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmt(r.created_at)}</td>
                  <td className="px-3 py-2 text-slate-700">{r.supplier ?? '—'}</td>
                  <td className="max-w-[280px] truncate px-3 py-2 text-slate-600" title={r.heading ?? ''}>
                    <span className="mr-1 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">{r.category}</span>
                    {r.heading ?? '—'}
                  </td>
                  <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-medium ${sm.cls}`}>{sm.label}</span></td>
                  <td className="px-3 py-2">
                    {r.storage_path
                      ? <a href={`/api/documents/file?id=${r.id}`} target="_blank" rel="noopener" className="font-medium text-brand-anthracite underline">Apri PDF</a>
                      : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filter === 'ready' && rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50 px-3 py-3">
            <input name="note" placeholder="Nota invio (facoltativa)" className="min-w-[200px] flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
            <button type="submit" className="rounded-md bg-brand-anthracite px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
              Segna come inviati al commercialista
            </button>
          </div>
        )}
      </form>

      <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Storico invii al commercialista</h2>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2 font-medium">Quando</th><th className="px-3 py-2 font-medium">Documenti</th><th className="px-3 py-2 font-medium">Nota</th></tr>
          </thead>
          <tbody>
            {exports.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-400">Nessun invio registrato.</td></tr>}
            {exports.map((e, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmt(e.sent_at)}</td>
                <td className="px-3 py-2 text-slate-700">{e.document_ids?.length ?? 0}</td>
                <td className="px-3 py-2 text-slate-600">{e.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
