import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Vista operativa del Router L0 per il pilot: conteggi per categoria + ultime email classificate.
// email_routing_log non è ancora nei tipi generati → client locale non tipizzato (cast unico).
export const dynamic = 'force-dynamic'

interface LogRow {
  decided_at: string
  from_address: string | null
  subject: string | null
  category: string
  source: string | null
  method: string
  confidence: number | null
  suppressed: boolean
}

const CATS = [
  { key: 'guest', label: 'Ospiti', cls: 'bg-emerald-50 text-emerald-700' },
  { key: 'ota_pms', label: 'OTA / PMS', cls: 'bg-blue-50 text-blue-700' },
  { key: 'supplier_admin', label: 'Fornitori / admin', cls: 'bg-amber-50 text-amber-700' },
  { key: 'newsletter_spam', label: 'Newsletter / spam', cls: 'bg-slate-100 text-slate-600' },
] as const
const catCls = (k: string) => CATS.find((c) => c.key === k)?.cls ?? 'bg-slate-100 text-slate-600'
const catLabel = (k: string) => CATS.find((c) => c.key === k)?.label ?? k

export default async function EmailRouterPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).limit(1).single()
  if (!member) redirect('/onboarding')
  const { data: property } = await supabase.from('properties').select('id, name').eq('org_id', member.org_id).is('deleted_at', null).limit(1).single()
  if (!property) redirect('/onboarding')

  const db = supabase as unknown as SupabaseClient
  const counts: Record<string, number> = {}
  for (const c of CATS) {
    const { count } = await db.from('email_routing_log').select('*', { count: 'exact', head: true }).eq('property_id', property.id).eq('category', c.key)
    counts[c.key] = count ?? 0
  }
  const { count: suppressed } = await db.from('email_routing_log').select('*', { count: 'exact', head: true }).eq('property_id', property.id).eq('suppressed', true)
  const { data: rowsData } = await db.from('email_routing_log')
    .select('decided_at, from_address, subject, category, source, method, confidence, suppressed')
    .eq('property_id', property.id).order('decided_at', { ascending: false }).limit(50)
  const rows = (rowsData ?? []) as LogRow[]

  const fmt = (iso: string) => { try { return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return iso } }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Router email — {property.name}</h1>
      <p className="mb-6 text-sm text-slate-500">Classificazione delle email in entrata (strumento operativo del pilot).</p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {CATS.map((c) => (
          <div key={c.key} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{counts[c.key]}</p>
          </div>
        ))}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Soppresse (rete sicurezza)</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{suppressed ?? 0}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Quando</th>
              <th className="px-3 py-2 font-medium">Mittente</th>
              <th className="px-3 py-2 font-medium">Oggetto</th>
              <th className="px-3 py-2 font-medium">Categoria</th>
              <th className="px-3 py-2 font-medium">Metodo</th>
              <th className="px-3 py-2 font-medium">Conf.</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Nessuna email classificata (il router parte al collegamento di Gmail).</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmt(r.decided_at)}</td>
                <td className="max-w-[180px] truncate px-3 py-2 text-slate-700" title={r.from_address ?? ''}>{r.from_address}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-slate-600" title={r.subject ?? ''}>{r.subject}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${catCls(r.category)}`}>{catLabel(r.category)}{r.source && r.source !== 'unknown' ? ` · ${r.source}` : ''}</span>
                  {r.suppressed && <span className="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600">soppressa</span>}
                </td>
                <td className="px-3 py-2 text-slate-500">{r.method}</td>
                <td className="px-3 py-2 text-slate-500">{r.confidence != null ? Math.round(r.confidence * 100) + '%' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
