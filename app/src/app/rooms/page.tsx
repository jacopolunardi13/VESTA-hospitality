import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createRoom, updateRoom, deleteRoom } from './actions'

const BANNERS: Record<string, { type: 'success' | 'error'; message: string }> = {
  created: { type: 'success', message: 'Camera aggiunta.' },
  updated: { type: 'success', message: 'Camera aggiornata.' },
  deleted: { type: 'success', message: 'Camera eliminata.' },
  missing_name: { type: 'error', message: 'Il nome della camera è obbligatorio.' },
  not_found: { type: 'error', message: 'Camera non trovata o non autorizzata.' },
  create_failed: { type: 'error', message: 'Errore durante l\'aggiunta. Riprova.' },
  update_failed: { type: 'error', message: 'Errore durante l\'aggiornamento. Riprova.' },
  delete_failed: { type: 'error', message: 'Errore durante l\'eliminazione. Riprova.' },
}

export default async function RoomsPage({
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

  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, max_guests, description, created_at')
    .eq('property_id', property.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

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
      <h1 className="mb-8 text-xl font-semibold text-slate-900">Camere</h1>

      {banner && (
        <p
          className={`mb-6 rounded-md px-3 py-2 text-sm ${
            banner.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {banner.message}
        </p>
      )}

      {/* ── AGGIUNGI CAMERA ───────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-base font-semibold text-slate-800">Aggiungi camera</h2>
        <form className="flex flex-col gap-4">
          <div>
            <label htmlFor="new_name" className={labelCls}>
              Nome <span className="text-red-500">*</span>
            </label>
            <input id="new_name" name="name" type="text" required className={inputCls} />
          </div>
          <div>
            <label htmlFor="new_max_guests" className={labelCls}>
              Ospiti massimi <span className="text-red-500">*</span>
            </label>
            <input
              id="new_max_guests"
              name="max_guests"
              type="number"
              min="1"
              required
              defaultValue={2}
              className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="new_description" className={labelCls}>
              Descrizione
            </label>
            <textarea
              id="new_description"
              name="description"
              rows={2}
              className={inputCls}
            />
          </div>
          <div>
            <button formAction={createRoom} className={saveBtnCls}>
              Aggiungi camera
            </button>
          </div>
        </form>
      </section>

      <hr className="mb-8 border-slate-200" />

      {/* ── LISTA CAMERE ──────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-slate-800">
          Camere registrate{rooms && rooms.length > 0 ? ` (${rooms.length})` : ''}
        </h2>

        {!rooms || rooms.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nessuna camera ancora. Aggiungi la prima qui sopra.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {rooms.map((room) => (
              <li key={room.id} className="rounded-lg border border-slate-200 p-4">
                {edit === room.id ? (
                  /* ── Edit form ── */
                  <form className="flex flex-col gap-3">
                    <input type="hidden" name="room_id" value={room.id} />
                    <div>
                      <label className={labelCls}>
                        Nome <span className="text-red-500">*</span>
                      </label>
                      <input
                        name="name"
                        type="text"
                        required
                        defaultValue={room.name}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>
                        Ospiti massimi <span className="text-red-500">*</span>
                      </label>
                      <input
                        name="max_guests"
                        type="number"
                        min="1"
                        required
                        defaultValue={room.max_guests}
                        className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Descrizione</label>
                      <textarea
                        name="description"
                        rows={2}
                        defaultValue={room.description ?? ''}
                        className={inputCls}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <button formAction={updateRoom} className={saveBtnCls}>
                        Salva
                      </button>
                      <a href="/rooms" className="text-sm text-slate-500 hover:underline">
                        Annulla
                      </a>
                    </div>
                  </form>
                ) : (
                  /* ── Display row ── */
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-900">{room.name}</p>
                      <p className="text-sm text-slate-500">Max {room.max_guests} ospiti</p>
                      {room.description && (
                        <p className="mt-1 text-sm text-slate-600">{room.description}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <a href={`/rooms?edit=${room.id}`} className={editBtnCls}>
                        Modifica
                      </a>
                      <form>
                        <input type="hidden" name="room_id" value={room.id} />
                        <button formAction={deleteRoom} className={deleteBtnCls}>
                          Elimina
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
