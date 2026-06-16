import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAsset, updateAsset, toggleActive, deleteAsset } from './actions'

const TYPE_LABELS: Record<string, string> = {
  faq: 'FAQ',
  policy: 'Policy',
  procedura: 'Procedura',
  correzione: 'Correzione',
  brochure: 'Brochure',
  pdf: 'PDF',
}

const BANNERS: Record<string, { type: 'success' | 'error'; message: string }> = {
  created: { type: 'success', message: 'Asset creato.' },
  updated: { type: 'success', message: 'Asset aggiornato.' },
  deleted: { type: 'success', message: 'Asset eliminato.' },
  toggled: { type: 'success', message: 'Stato aggiornato.' },
  missing_title: { type: 'error', message: 'Il titolo è obbligatorio.' },
  not_found: { type: 'error', message: 'Asset non trovato o non autorizzato.' },
  create_failed: { type: 'error', message: 'Errore durante la creazione. Riprova.' },
  update_failed: { type: 'error', message: 'Errore durante il salvataggio. Riprova.' },
  delete_failed: { type: 'error', message: "Errore durante l'eliminazione. Riprova." },
  toggle_failed: { type: 'error', message: 'Errore durante il cambio stato. Riprova.' },
  version_conflict: {
    type: 'error',
    message:
      'Asset modificato da un\'altra sessione. Ricarica per vedere le ultime modifiche.',
  },
}

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; edit?: string }>
}) {
  const { saved, error, edit } = await searchParams

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

  const { data: assets } = await supabase
    .from('knowledge_assets')
    .select('id, type, title, content, usable_by_concierge, priority, current_version, origin, updated_at')
    .eq('property_id', property.id)
    .is('deleted_at', null)
    .order('priority', { ascending: false })
    .order('updated_at', { ascending: false })

  const banner = saved ? BANNERS[saved] : error ? BANNERS[error] : null

  const inputCls =
    'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none'
  const labelCls = 'mb-1 block text-sm font-medium text-slate-700'
  const saveBtnCls =
    'rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700'
  const editBtnCls =
    'rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50'
  const deleteBtnCls =
    'rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50'

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-8 text-xl font-semibold text-slate-900">Knowledge Base</h1>

      {banner && (
        <p
          className={`mb-6 rounded-md px-3 py-2 text-sm ${
            banner.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {banner.message}
        </p>
      )}

      {/* ── AGGIUNGI ASSET ────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-base font-semibold text-slate-800">Aggiungi asset</h2>
        <form className="flex flex-col gap-4">
          <div>
            <label htmlFor="new_type" className={labelCls}>
              Tipo
            </label>
            <select id="new_type" name="type" className={inputCls}>
              <option value="faq">FAQ</option>
              <option value="policy">Policy</option>
              <option value="procedura">Procedura</option>
              <option value="correzione">Correzione</option>
              <option value="brochure">Brochure</option>
            </select>
          </div>
          <div>
            <label htmlFor="new_title" className={labelCls}>
              Titolo <span className="text-red-500">*</span>
            </label>
            <input id="new_title" name="title" type="text" required className={inputCls} />
          </div>
          <div>
            <label htmlFor="new_content" className={labelCls}>
              Contenuto
            </label>
            <textarea id="new_content" name="content" rows={4} className={inputCls} />
          </div>
          <div>
            <button formAction={createAsset} className={saveBtnCls}>
              Aggiungi asset
            </button>
          </div>
        </form>
      </section>

      <hr className="mb-8 border-slate-200" />

      {/* ── LISTA ASSET ───────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-slate-800">
          Asset registrati{assets && assets.length > 0 ? ` (${assets.length})` : ''}
        </h2>

        {!assets || assets.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nessun asset ancora. Aggiungi il primo qui sopra.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {assets.map((asset) => {
              const isPdf = asset.type === 'pdf'
              const isEditing = edit === asset.id && !isPdf
              return (
                <li key={asset.id} className="rounded-lg border border-slate-200 p-4">
                  {isEditing ? (
                    /* ── Edit form (optimistic locking: current_version hidden) ── */
                    <form className="flex flex-col gap-3">
                      <input type="hidden" name="asset_id" value={asset.id} />
                      <input type="hidden" name="current_version" value={asset.current_version} />
                      <div>
                        <label className={labelCls}>
                          Titolo <span className="text-red-500">*</span>
                        </label>
                        <input
                          name="title"
                          type="text"
                          required
                          defaultValue={asset.title}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Contenuto</label>
                        <textarea
                          name="content"
                          rows={5}
                          defaultValue={asset.content ?? ''}
                          className={inputCls}
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <button formAction={updateAsset} className={saveBtnCls}>
                          Salva
                        </button>
                        <a href="/knowledge" className="text-sm text-slate-500 hover:underline">
                          Annulla
                        </a>
                      </div>
                    </form>
                  ) : (
                    /* ── Display row ── */
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                              {TYPE_LABELS[asset.type] ?? asset.type}
                            </span>
                            {asset.usable_by_concierge ? (
                              <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
                                Attivo
                              </span>
                            ) : (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-400">
                                Inattivo
                              </span>
                            )}
                            <span className="text-xs text-slate-400">
                              v{asset.current_version}
                            </span>
                          </div>
                          <p className="font-medium text-slate-900">{asset.title}</p>
                          {asset.content && (
                            <p className="mt-1 text-sm text-slate-500">{asset.content}</p>
                          )}
                        </div>

                        {!isPdf ? (
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <div className="flex items-center gap-2">
                              <a href={`/knowledge?edit=${asset.id}`} className={editBtnCls}>
                                Modifica
                              </a>
                              <form>
                                <input type="hidden" name="asset_id" value={asset.id} />
                                <input
                                  type="hidden"
                                  name="usable_by_concierge"
                                  value={asset.usable_by_concierge ? 'false' : 'true'}
                                />
                                <button formAction={toggleActive} className={editBtnCls}>
                                  {asset.usable_by_concierge ? 'Disattiva' : 'Attiva'}
                                </button>
                              </form>
                              <form>
                                <input type="hidden" name="asset_id" value={asset.id} />
                                <button formAction={deleteAsset} className={deleteBtnCls}>
                                  Elimina
                                </button>
                              </form>
                            </div>
                          </div>
                        ) : (
                          <p className="shrink-0 text-xs text-slate-400">
                            PDF — sola lettura
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
