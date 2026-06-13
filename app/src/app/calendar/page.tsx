import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { setRates, deleteRate } from './actions'

const BANNERS: Record<string, { type: 'success' | 'error'; message: string }> = {
  rates_set: { type: 'success', message: 'Tariffe aggiornate.' },
  rate_cleared: { type: 'success', message: 'Tariffa eliminata.' },
  missing_room: { type: 'error', message: 'Seleziona una camera.' },
  missing_dates: { type: 'error', message: 'Inserisci data inizio e data fine.' },
  invalid_price: { type: 'error', message: 'Prezzo non valido. Inserisci un valore ≥ 0.' },
  invalid_dates: { type: 'error', message: 'Date non valide.' },
  invalid_date_range: {
    type: 'error',
    message: 'La data di fine deve essere uguale o successiva alla data di inizio.',
  },
  range_too_large: {
    type: 'error',
    message: 'Il range massimo è 90 giorni. Suddividi l\'operazione in più blocchi.',
  },
  room_not_found: { type: 'error', message: 'Camera non trovata o non autorizzata.' },
  upsert_failed: { type: 'error', message: 'Errore durante il salvataggio. Riprova.' },
  not_found: { type: 'error', message: 'Tariffa non trovata o non autorizzata.' },
  delete_failed: { type: 'error', message: "Errore durante l'eliminazione. Riprova." },
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const { saved, error } = await searchParams

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
    .select('id, name')
    .eq('property_id', property.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  // today in UTC — lower bound for the rate list and min on date inputs
  const today = new Date().toISOString().slice(0, 10)

  const { data: rates } = await supabase
    .from('rate_calendar')
    .select('id, room_id, date, price_cents, available, min_stay, source, updated_at')
    .eq('property_id', property.id)
    .gte('date', today)
    .order('date', { ascending: true })
    .order('room_id', { ascending: true })
    .limit(100)

  const banner = saved ? BANNERS[saved] : error ? BANNERS[error] : null
  const roomMap = new Map((rooms ?? []).map((r) => [r.id, r.name]))
  const hasRooms = rooms && rooms.length > 0

  const inputCls =
    'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none'
  const labelCls = 'mb-1 block text-sm font-medium text-slate-700'
  const saveBtnCls =
    'rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700'
  const deleteBtnCls =
    'rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50'

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-8 text-xl font-semibold text-slate-900">Calendario tariffe</h1>

      {banner && (
        <p
          className={`mb-6 rounded-md px-3 py-2 text-sm ${
            banner.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {banner.message}
        </p>
      )}

      {/* ── IMPOSTA TARIFFE ───────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-base font-semibold text-slate-800">Imposta tariffe</h2>

        {!hasRooms ? (
          <p className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
            Nessuna camera trovata.{' '}
            <a href="/rooms" className="font-medium underline hover:no-underline">
              Aggiungi le camere
            </a>{' '}
            prima di impostare le tariffe.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-500">
              Sovrascrive le tariffe già impostate per le date nel range selezionato.
              Massimo 90 giorni per operazione.
            </p>
            <form className="flex flex-col gap-4">
              <div>
                <label htmlFor="room_id" className={labelCls}>
                  Camera <span className="text-red-500">*</span>
                </label>
                <select id="room_id" name="room_id" className={inputCls}>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="from_date" className={labelCls}>
                    Da <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="from_date"
                    name="from_date"
                    type="date"
                    required
                    min={today}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="to_date" className={labelCls}>
                    A <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="to_date"
                    name="to_date"
                    type="date"
                    required
                    min={today}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="price_euros" className={labelCls}>
                    Prezzo/notte (€) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="price_euros"
                    name="price_euros"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    placeholder="0.00"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="min_stay" className={labelCls}>
                    Soggiorno minimo (notti)
                  </label>
                  <input
                    id="min_stay"
                    name="min_stay"
                    type="number"
                    min="1"
                    defaultValue={1}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  {/* available: int 0|1 in schema — checkbox 'on' → 1, absent → 0 */}
                  <input
                    name="available"
                    type="checkbox"
                    defaultChecked
                    className="accent-slate-900"
                  />
                  Camera disponibile in questo range
                </label>
                <p className="mt-1 text-xs text-slate-400">
                  Deseleziona per bloccare la disponibilità senza prezzi visibili.
                </p>
              </div>

              <div>
                <button formAction={setRates} className={saveBtnCls}>
                  Salva tariffe
                </button>
              </div>
            </form>
          </>
        )}
      </section>

      <hr className="mb-8 border-slate-200" />

      {/* ── TARIFFE IMPOSTATE ─────────────────────────────────────── */}
      <section>
        <h2 className="mb-1 text-base font-semibold text-slate-800">
          Tariffe impostate{rates && rates.length > 0 ? ` (${rates.length})` : ''}
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          Dalla data odierna in poi · max 100 righe
        </p>

        {!rates || rates.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nessuna tariffa impostata per i prossimi giorni.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-4">Data</th>
                  <th className="pb-2 pr-4">Camera</th>
                  <th className="pb-2 pr-4">€/notte</th>
                  <th className="pb-2 pr-4">Disponibile</th>
                  <th className="pb-2 pr-4">Min</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => (
                  <tr key={rate.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 font-mono text-slate-700">{rate.date}</td>
                    <td className="py-2 pr-4 text-slate-700">
                      {roomMap.get(rate.room_id) ?? '—'}
                    </td>
                    <td className="py-2 pr-4 text-slate-900">
                      {rate.price_cents != null
                        ? `€${(rate.price_cents / 100).toFixed(2)}`
                        : '—'}
                    </td>
                    <td className="py-2 pr-4">
                      {/* available is 0|1 integer — compare as number literal */}
                      {rate.available === 1 ? (
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
                          Sì
                        </span>
                      ) : (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">
                          No
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{rate.min_stay}</td>
                    <td className="py-2">
                      <form>
                        <input type="hidden" name="rate_id" value={rate.id} />
                        <button formAction={deleteRate} className={deleteBtnCls}>
                          Elimina
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
