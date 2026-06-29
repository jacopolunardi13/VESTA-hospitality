import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { actorLabels, bookingStatusLabels, nextActionLabels } from '@/lib/labels'
import { formatDate, formatDateRange, formatDateTime, formatEuro, formatGuests } from '@/lib/format'
import { ReliabilityChip, ScoreBadge, SourceChip, StatusBadge } from '@/components/badges'
import RequestActions from '@/components/request-actions'
import { sendProposal, overridePrice, approveProposalDraft, confirmBooking, markPaymentNotReceived } from '../actions'
import { getOpenTaskForBooking } from '@/lib/tasks/operationalTasks'
import { presentTask, type TaskActionKind } from '@/lib/tasks/catalog'
import type { BookingStatus } from '@/lib/quote/types'
import type { Reliability, Source } from '@/lib/mock/types'

const priceSourceLabel: Record<string, string> = {
  manual:     'manuale (struttura)',
  csv:        'import CSV',
  ical:       'feed iCal',
  api:        'API',
  ota_stimato: 'stima OTA',
}

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

  return { supabase, propertyId: property.id, orgId: member.org_id, settings: property.settings }
}

export default async function BookingRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { id } = await params
  const sp = await searchParams
  const saved = sp['saved']
  const errorKey = sp['error']

  const { supabase, propertyId, settings } = await resolveProperty()

  const { data: request } = await supabase
    .from('booking_requests')
    .select('*')
    .eq('id', id)
    .eq('property_id', propertyId)
    .is('deleted_at', null)
    .single()

  if (!request) notFound()

  // Task operativa aperta (work inbox): se presente, è la superficie d'azione prioritaria.
  const openTask = await getOpenTaskForBooking(supabase, id)
  const taskCard = openTask ? presentTask(openTask.type, { guestName: request.guest_name }) : null
  const actionForKind: Record<TaskActionKind, typeof confirmBooking> = {
    confirm_paid: confirmBooking,
    mark_not_paid: markPaymentNotReceived,
  }

  const [{ data: items }, { data: events }, { data: scoring }, { data: rooms }] =
    await Promise.all([
      supabase
        .from('booking_request_items')
        .select('*, rooms(name)')
        .eq('booking_request_id', id)
        .order('date'),
      supabase
        .from('booking_request_events')
        .select('*')
        .eq('booking_request_id', id)
        .order('created_at'),
      supabase
        .from('scoring_events')
        .select('*')
        .eq('booking_request_id', id)
        .order('created_at'),
      request.status === 'received'
        ? supabase.from('rooms').select('id, name').eq('property_id', propertyId).is('deleted_at', null).order('name')
        : Promise.resolve({ data: null }),
    ])

  // Primo messaggio originale dell'ospite (sempre consultabile nel dettaglio).
  const { data: firstMessage } = request.conversation_id
    ? await supabase
        .from('messages')
        .select('content, created_at')
        .eq('conversation_id', request.conversation_id)
        .eq('direction', 'in')
        .order('created_at')
        .limit(1)
        .maybeSingle()
    : { data: null }

  // Richieste rilevate nel messaggio (multi-camera/multi-periodo).
  const parsedRequests = Array.isArray(request.parsed_requests)
    ? (request.parsed_requests as Array<{ room_type?: string | null; check_in?: string | null; check_out?: string | null; adults?: number | null }>)
    : []

  // Camere distinte negli items: se ≥2 è una COMBINAZIONE gruppo (più camere su un lead).
  const combinationRooms = Array.from(
    new Map(
      (Array.isArray(items) ? (items as Array<{ room_id: string; rooms?: { name?: string } | null }>) : [])
        .map((it) => [it.room_id, it.rooms?.name ?? 'Camera'] as const)
    ).values()
  )
  const isCombination = combinationRooms.length >= 2

  const status = request.status as BookingStatus
  const nextAction = nextActionLabels[status]
  const children = (Array.isArray(request.children) ? request.children : []) as { age: number }[]
  const nights = request.check_in && request.check_out
    ? Math.round((new Date(request.check_out).getTime() - new Date(request.check_in).getTime()) / 86_400_000)
    : 0

  const propSettings = (settings ?? {}) as Record<string, unknown>
  const defaultDiscount = Number(propSettings['direct_discount_pct'] ?? 10)

  const hasProposal = request.gross_total_cents != null
  // Bozza AI = richiesta 'received' con preventivo già calcolato, in attesa di approvazione.
  const isDraft = status === 'received' && hasProposal

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/inbox" className="text-sm text-slate-500 hover:text-slate-800">
          ← Inbox
        </Link>
      </div>

      {/* Notifiche */}
      {saved && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          {saved === 'created' && '✓ Richiesta creata.'}
          {saved === 'proposal_sent' && '✓ Proposta inviata — richiesta in attesa dell\'ospite.'}
          {saved === 'price_updated' && '✓ Prezzo aggiornato.'}
          {saved === 'ok' && '✓ Stato aggiornato.'}
          {saved === 'availability_confirmed' && '✓ Camera riservata 24h: proposta + IBAN inviati all\'ospite.'}
          {saved === 'booking_confirmed' && '✓ Prenotazione confermata: conferma + PDF inviati all\'ospite.'}
          {saved === 'payment_not_received' && '✓ Comunicazione di scadenza inviata. Libera la camera manualmente nel PMS.'}
        </div>
      )}
      {errorKey && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          {errorKey === 'transition_failed' && '✗ Transizione non valida.'}
          {errorKey === 'missing_dates' && '✗ Imposta le date check-in/check-out prima di inviare la proposta.'}
          {errorKey === 'items_failed' && '✗ Errore nel salvataggio dettaglio prezzi.'}
          {errorKey === 'invalid_price' && '✗ Prezzo non valido.'}
          {!['transition_failed','missing_dates','items_failed','invalid_price'].includes(errorKey) && `✗ Errore: ${errorKey}`}
        </div>
      )}

      {/* Intestazione */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">
          {request.guest_name ?? request.guest_contact ?? 'Ospite'} · {id.slice(0, 8)}
        </h1>
        <ScoreBadge score={request.lead_score} priority={request.priority as 'high' | 'medium' | 'low'} />
        <StatusBadge status={status} />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
        {request.offer_expires_at && ['proposal_sent', 'interested'].includes(status) && (
          <span className="font-medium text-indigo-700">
            ⏱ offerta valida fino al {formatDateTime(request.offer_expires_at)}
          </span>
        )}
        {request.hold_expires_at && status === 'awaiting_payment' && (
          <span className="font-medium text-purple-700">
            ⏱ disponibilità bloccata fino al {formatDateTime(request.hold_expires_at)}
          </span>
        )}
        <span>creata il {formatDateTime(request.created_at)}</span>
      </div>

      {/* Prossima azione */}
      {nextAction ? (
        <div className="flex items-center gap-3 rounded-lg bg-red-600 px-4 py-3 text-white">
          <span className="text-xl" aria-hidden>⚡</span>
          <span className="text-xs font-bold tracking-wide uppercase opacity-80">Prossima azione</span>
          <span className="text-base font-bold">{nextAction}</span>
        </div>
      ) : status === 'proposal_sent' ? (
        <div className="flex items-center gap-3 rounded-lg bg-indigo-50 px-4 py-3 text-indigo-900">
          <span aria-hidden>⏳</span>
          <span className="text-sm font-medium">In attesa dell&apos;ospite — nessuna azione richiesta ora.</span>
        </div>
      ) : null}

      {/* Operational Queue · task della prenotazione: linguaggio dal Task Catalog, esattamente due azioni */}
      {taskCard && (
        <section className="rounded-lg border-2 border-purple-300 bg-purple-50 p-4">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>{taskCard.icon}</span>
            <h2 className="text-sm font-bold text-purple-900">{taskCard.title}</h2>
          </div>
          <p className="mt-1 text-sm text-purple-800">{taskCard.description}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {taskCard.actions.map((a) => (
              <form key={a.code} action={actionForKind[a.kind]}>
                <input type="hidden" name="request_id" value={id} />
                <button
                  type="submit"
                  className={`rounded-md w-full px-3 py-2.5 text-center text-sm font-medium sm:w-auto transition-colors ${
                    a.style === 'primary'
                      ? 'bg-slate-900 text-white hover:bg-slate-700'
                      : a.style === 'danger'
                        ? 'border border-red-300 bg-white text-red-700 hover:bg-red-50'
                        : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {a.label}
                </button>
              </form>
            ))}
          </div>
          {taskCard.note && <p className="mt-2 text-xs text-purple-700">{taskCard.note}</p>}
        </section>
      )}

      {/* Messaggio originale dell'ospite (sempre consultabile) */}
      {firstMessage?.content && (
        <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Messaggio originale</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{firstMessage.content}</p>
        </section>
      )}

      {/* Richieste rilevate (multi-camera/multi-periodo): nessuna informazione persa */}
      {parsedRequests.length >= 2 && (
        <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-800">
            Richieste rilevate · {parsedRequests.length}
          </h2>
          <ol className="flex flex-col gap-1.5 text-sm text-slate-700">
            {parsedRequests.map((s, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{i + 1}) {s.room_type ?? 'camera'}</span>
                <span className="text-slate-600">
                  {s.check_in
                    ? s.check_out
                      ? formatDateRange(s.check_in, s.check_out)
                      : `Arrivo ${formatDate(s.check_in)} · durata da confermare`
                    : 'date da confermare'}
                  {s.adults ? ` · ${s.adults} adulti` : ''}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-amber-700">Più richieste in un solo messaggio — verificale tutte. Nessun preventivo automatico inviato.</p>
        </section>
      )}

      {/* Combinazione gruppo selezionata (più camere su un solo lead): subito visibile allo staff */}
      {isCombination && (
        <section className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-indigo-800">
            Combinazione selezionata · {combinationRooms.length} camere
          </h2>
          <ul className="flex flex-col gap-1.5 text-sm text-slate-800">
            {combinationRooms.map((name, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-indigo-400">•</span>
                <span className="font-medium">{name}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-indigo-700">Camere separate e non comunicanti. Verifica la disponibilità di tutte le camere nel PMS prima di confermare.</p>
        </section>
      )}

      {/* Dati richiesta */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Dati richiesta
          </h2>
          <dl className="flex flex-col gap-2 text-sm text-slate-700">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Soggiorno</dt>
              <dd className="font-medium">
                {request.check_in && request.check_out
                  ? `${formatDateRange(request.check_in, request.check_out)} (${nights} notti)`
                  : <span className="text-slate-400">Non specificato</span>}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Ospiti</dt>
              <dd className="font-medium">
                {formatGuests(request.adults ?? 1, children)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Lingua</dt>
              <dd className="font-medium uppercase">{request.language}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Contatto</dt>
              <dd className="font-medium">{request.guest_contact ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Source</dt>
              <dd><SourceChip source={request.source as Source} /></dd>
            </div>
            {request.special_requests && (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Richieste speciali</dt>
                <dd className="text-right font-medium">{request.special_requests}</dd>
              </div>
            )}
            {request.data_reliability && (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Affidabilità dati</dt>
                <dd><ReliabilityChip reliability={request.data_reliability as Reliability} /></dd>
              </div>
            )}
          </dl>
        </section>

        {/* Proposta (se esiste) */}
        {hasProposal && (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Proposta
            </h2>
            {items && items.length > 0 && (
              <p className="mb-2 text-sm font-medium text-slate-900">
                {isCombination
                  ? `Combinazione · ${combinationRooms.length} camere (${combinationRooms.join(' + ')})`
                  : (items[0] as { rooms?: { name?: string } }).rooms?.name ?? '—'}
              </p>
            )}
            <dl className="flex flex-col gap-1.5 text-sm text-slate-700">
              <div className="flex justify-between">
                <dt className="text-slate-500">Prezzo listino diretto</dt>
                <dd>{formatEuro(request.gross_total_cents!)}</dd>
              </div>
              {request.discount_pct != null && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Sconto diretto −{request.discount_pct}%</dt>
                  <dd className="text-green-700">
                    −{formatEuro(request.gross_total_cents! - (request.offer_total_cents ?? 0))}
                  </dd>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold text-slate-900">
                <dt>Totale offerta</dt>
                <dd>{formatEuro(request.offer_total_cents ?? 0)}</dd>
              </div>
              {request.city_tax_cents != null && request.city_tax_cents > 0 && (
                <div className="flex justify-between text-xs text-slate-500">
                  <dt>Tassa di soggiorno (in loco)</dt>
                  <dd>{formatEuro(request.city_tax_cents)}</dd>
                </div>
              )}
            </dl>

            {items && items.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-slate-500">
                  Dettaglio per notte ({items.length} righe)
                </summary>
                <ul className="mt-2 flex flex-col gap-1 text-xs text-slate-600">
                  {items.map((item, i) => (
                    <li key={i} className="flex justify-between">
                      <span>
                        {formatDate(item.date as string)} ·{' '}
                        {(item as { rooms?: { name?: string } }).rooms?.name ?? '—'}
                      </span>
                      <span>{formatEuro(item.price_cents as number)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* Modifica prezzo (stati pre-blocco) */}
            {['received', 'proposal_sent', 'interested'].includes(status) && (
              <details className="mt-3 border-t border-slate-200 pt-3 text-sm">
                <summary className="cursor-pointer font-medium text-slate-700">
                  ✎ Modifica prezzo/offerta
                </summary>
                <form action={overridePrice} className="mt-3 flex flex-col gap-3">
                  <input type="hidden" name="request_id" value={id} />
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-600" htmlFor="gross_total_cents">
                      Prezzo lordo (centesimi)
                    </label>
                    <input
                      id="gross_total_cents"
                      name="gross_total_cents"
                      type="number"
                      min="0"
                      defaultValue={request.gross_total_cents ?? undefined}
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-600" htmlFor="discount_pct">
                      Sconto %
                    </label>
                    <input
                      id="discount_pct"
                      name="discount_pct"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      defaultValue={request.discount_pct ?? defaultDiscount}
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                  <button
                    type="submit"
                    className="self-end rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 transition-colors"
                  >
                    Aggiorna →
                  </button>
                </form>
              </details>
            )}
          </section>
        )}
      </div>

      {/* Bozza AI: preventivo calcolato, in attesa di approvazione staff (supervision ON) */}
      {isDraft && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-amber-900">
              📝 Bozza preventivo generata dall&apos;AI — rivedi e approva
            </span>
            <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
              non ancora inviata all&apos;ospite
            </span>
          </div>
          <p className="mt-1 text-xs text-amber-800">
            Offerta proposta: <strong>{request.offer_total_cents != null ? formatEuro(request.offer_total_cents) : '—'}</strong>
            {request.data_reliability && ` · affidabilità ${request.data_reliability}`}.
            Puoi modificare prezzo/sconto qui sopra prima di approvare.
          </p>
          <form action={approveProposalDraft} className="mt-3">
            <input type="hidden" name="request_id" value={id} />
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
            >
              ✅ Approva e invia proposta
            </button>
          </form>
        </section>
      )}

      {/* Form proposta manuale (solo su received SENZA bozza già calcolata) */}
      {status === 'received' && !hasProposal && request.check_in && request.check_out && rooms && rooms.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
            📤 Invia proposta
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Il prezzo viene calcolato dal calendario tariffe. Inserisci un prezzo per notte solo se mancano le tariffe per alcune date.
          </p>
          <form action={sendProposal} className="flex flex-col gap-3">
            <input type="hidden" name="request_id" value={id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700" htmlFor="room_id">
                  Camera proposta
                </label>
                <select
                  id="room_id"
                  name="room_id"
                  required
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">Seleziona camera…</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700" htmlFor="manual_price_cents">
                  Prezzo per notte (¢) — fallback
                </label>
                <input
                  id="manual_price_cents"
                  name="manual_price_cents"
                  type="number"
                  min="0"
                  placeholder="Es. 15000 = € 150,00"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
              >
                Calcola e invia proposta →
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Avviso se received ma mancano date o camere */}
      {status === 'received' && (!request.check_in || !request.check_out) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠ Aggiungi le date check-in e check-out prima di poter inviare la proposta.
        </div>
      )}
      {status === 'received' && request.check_in && request.check_out && (!rooms || rooms.length === 0) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠ Crea almeno una camera in{' '}
          <Link href="/rooms" className="underline font-medium">Camere</Link>{' '}
          prima di poter inviare la proposta.
        </div>
      )}

      {/* Azioni */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Azioni
        </h2>
        {/* Anteprima documento (Approva e invia): visualizza/scarica il PDF prima dell'invio. */}
        {status === 'interested' && (
          <a href={`/api/documents/preview?lead=${id}&type=preventivo`} target="_blank" rel="noopener noreferrer"
            className="mb-3 inline-block text-sm text-slate-700 underline hover:text-slate-900">
            📄 Anteprima PDF preventivo
          </a>
        )}
        {status === 'awaiting_payment' && (
          <a href={`/api/documents/preview?lead=${id}&type=conferma`} target="_blank" rel="noopener noreferrer"
            className="mb-3 inline-block text-sm text-slate-700 underline hover:text-slate-900">
            📄 Anteprima PDF conferma
          </a>
        )}
        <RequestActions requestId={id} status={status} paymentTaskOpen={!!openTask} />
      </section>

      {/* Timeline + Score */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Timeline (audit)
          </h2>
          {events && events.length > 0 ? (
            <ul className="flex flex-col gap-2.5 text-sm">
              {events.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-28 shrink-0 text-xs text-slate-400">
                    {formatDateTime(e.created_at as string)}
                  </span>
                  <span className="w-14 shrink-0 text-xs font-medium text-slate-500">
                    {actorLabels[e.actor as keyof typeof actorLabels]}
                  </span>
                  <span className="text-slate-700">
                    {e.from_status ? `${bookingStatusLabels[e.from_status as BookingStatus]} → ` : ''}
                    <strong>{bookingStatusLabels[e.to_status as BookingStatus]}</strong>
                    {e.note && <span className="block text-xs text-slate-400">{e.note as string}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">Nessun evento registrato.</p>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Score (trasparenza)
            </h2>
            {scoring && scoring.length > 0 ? (
              <ul className="flex flex-col gap-1.5 text-sm">
                {scoring.map((s, i) => (
                  <li key={i} className="flex justify-between text-slate-700">
                    <span>{s.event as string}</span>
                    <span
                      className={
                        (s.delta as number) >= 0
                          ? 'font-medium text-green-700'
                          : 'font-medium text-red-600'
                      }
                    >
                      {(s.delta as number) >= 0 ? '+' : ''}{s.delta as number}
                    </span>
                  </li>
                ))}
                <li className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
                  <span>Lead score</span>
                  <span>{request.lead_score}</span>
                </li>
              </ul>
            ) : (
              <p className="text-sm text-slate-400">
                Lead score: <span className="font-semibold text-slate-700">{request.lead_score}</span>
                {' '}— nessun evento di scoring.
              </p>
            )}
          </section>

          {/* Fonte tariffa (solo se proposta esiste) */}
          {hasProposal && (
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                🏷 Fonte tariffa
              </h2>
              <dl className="flex flex-col gap-2 text-sm text-slate-700">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Origine prezzo</dt>
                  <dd className="font-medium">
                    {request.price_source ? (priceSourceLabel[request.price_source] ?? request.price_source) : '—'}
                  </dd>
                </div>
                {request.data_reliability && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Affidabilità</dt>
                    <dd><ReliabilityChip reliability={request.data_reliability as Reliability} /></dd>
                  </div>
                )}
              </dl>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
