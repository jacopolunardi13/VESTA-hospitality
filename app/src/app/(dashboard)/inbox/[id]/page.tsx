import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { actorLabels, bookingStatusLabels } from '@/lib/labels'
import { formatDate, formatDateRange, formatDateTime, formatEuro, formatGuests } from '@/lib/format'
import { DeliveryBadge, ReliabilityChip, ScoreBadge, SourceChip, StatusBadge } from '@/components/badges'
import RequestActions from '@/components/request-actions'
import { sendProposal, overridePrice, approveProposalDraft, confirmAvailability, markUnavailable, confirmBooking, markPaymentNotReceived, transitionRequest } from '../actions'
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
  const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).limit(1).single()
  if (!member) redirect('/onboarding')
  const { data: property } = await supabase.from('properties').select('id, settings').eq('org_id', member.org_id).is('deleted_at', null).limit(1).single()
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
    .from('booking_requests').select('*').eq('id', id).eq('property_id', propertyId).is('deleted_at', null).single()
  if (!request) notFound()

  // Task operativa aperta (Operational Queue): se presente, è la superficie d'azione prioritaria.
  const openTask = await getOpenTaskForBooking(supabase, id)
  const taskCard = openTask ? presentTask(openTask.type, { guestName: request.guest_name }) : null
  const actionForKind: Record<TaskActionKind, typeof confirmBooking> = {
    confirm_paid: confirmBooking,
    mark_not_paid: markPaymentNotReceived,
  }

  const [{ data: items }, { data: events }, { data: scoring }, { data: rooms }] = await Promise.all([
    supabase.from('booking_request_items').select('*, rooms(name)').eq('booking_request_id', id).order('date'),
    supabase.from('booking_request_events').select('*').eq('booking_request_id', id).order('created_at'),
    supabase.from('scoring_events').select('*').eq('booking_request_id', id).order('created_at'),
    request.status === 'received'
      ? supabase.from('rooms').select('id, name').eq('property_id', propertyId).is('deleted_at', null).order('name')
      : Promise.resolve({ data: null }),
  ])

  // Messaggio originale dell'ospite (il CONTESTO).
  const { data: firstMessage } = request.conversation_id
    ? await supabase.from('messages').select('content, created_at').eq('conversation_id', request.conversation_id).eq('direction', 'in').order('created_at').limit(1).maybeSingle()
    : { data: null }

  // Risposta preparata da Vesta: testo COMPLETO + stato di consegna reale.
  const { data: lastOut } = request.conversation_id
    ? await supabase.from('messages').select('content, sender, delivery_status, created_at').eq('conversation_id', request.conversation_id).eq('direction', 'out').order('created_at', { ascending: false }).limit(1).maybeSingle()
    : { data: null }
  const deliveryStatus = (lastOut?.delivery_status as string | null) ?? null

  const parsedRequests = Array.isArray(request.parsed_requests)
    ? (request.parsed_requests as Array<{ room_type?: string | null; check_in?: string | null; check_out?: string | null; adults?: number | null }>)
    : []
  const combinationRooms = Array.from(
    new Map(
      (Array.isArray(items) ? (items as Array<{ room_id: string; rooms?: { name?: string } | null }>) : [])
        .map((it) => [it.room_id, it.rooms?.name ?? 'Camera'] as const)
    ).values()
  )
  const isCombination = combinationRooms.length >= 2

  const status = request.status as BookingStatus
  const children = (Array.isArray(request.children) ? request.children : []) as { age: number }[]
  const nights = request.check_in && request.check_out
    ? Math.round((new Date(request.check_out).getTime() - new Date(request.check_in).getTime()) / 86_400_000)
    : 0
  const propSettings = (settings ?? {}) as Record<string, unknown>
  const defaultDiscount = Number(propSettings['direct_discount_pct'] ?? 10)
  const hasProposal = request.gross_total_cents != null
  // Bozza non ancora consegnata: c'è una risposta AI outbound il cui stato di consegna NON è 'sent'.
  // Copre anche il preventivo multi-camera (senza gross) e resta vero se la consegna è fallita.
  const hasUndeliveredDraft = status === 'received' && !!lastOut?.content && deliveryStatus !== 'sent'
  const missingDates = status === 'received' && (!request.check_in || !request.check_out)
  const noRooms = status === 'received' && !!request.check_in && !!request.check_out && (!rooms || rooms.length === 0)

  // ── PIANO D'AZIONE: l'UNICO prossimo intervento umano richiesto (il centro della pagina). ──
  type Tone = 'do' | 'wait' | 'warn' | 'done'
  let plan: { tone: Tone; title: string; body: string }
  if (status === 'received' && missingDates) plan = { tone: 'warn', title: 'Completa la richiesta', body: 'Mancano le date del soggiorno: aggiungile prima di poter proporre.' }
  else if (status === 'received' && noRooms) plan = { tone: 'warn', title: 'Nessuna camera configurata', body: 'Crea almeno una camera in Camere prima di inviare una proposta.' }
  else if (status === 'received' && hasUndeliveredDraft) plan = { tone: 'do', title: 'Rivedi e invia la proposta', body: 'Vesta ha preparato una risposta ma NON è ancora stata consegnata. Rivedila e inviala all’ospite: solo allora la pratica passa a "Preventivo inviato".' }
  else if (status === 'received') plan = { tone: 'do', title: 'Invia una proposta', body: 'Scegli la camera: il prezzo è calcolato dal calendario tariffe. Poi invia all’ospite.' }
  else if (status === 'proposal_sent') plan = { tone: 'wait', title: 'In attesa dell’ospite', body: 'L’ospite sta valutando le camere proposte. Nessun intervento richiesto ora.' }
  else if (status === 'interested') plan = { tone: 'do', title: 'Verifica la disponibilità nel PMS', body: 'Controlla QuoVai. Se la camera è libera: bloccala e invia il preventivo con l’IBAN. Altrimenti proponi le alternative.' }
  else if (status === 'availability_blocked') plan = { tone: 'do', title: 'Richiedi il pagamento', body: 'Camera riservata: invia all’ospite le istruzioni di pagamento.' }
  else if (status === 'awaiting_payment' && taskCard) plan = { tone: 'do', title: taskCard.title, body: taskCard.description }
  else if (status === 'awaiting_payment') plan = { tone: 'do', title: 'Verifica il pagamento', body: 'Controlla se il bonifico è arrivato, poi conferma la prenotazione.' }
  else if (status === 'confirmed') plan = { tone: 'done', title: 'Prenotazione confermata', body: 'Nessuna azione richiesta.' }
  else plan = { tone: 'done', title: 'Pratica chiusa', body: `Stato: ${bookingStatusLabels[status]}. Nessuna azione richiesta.` }

  const toneCard: Record<Tone, string> = {
    do:   'border-indigo-300 bg-white ring-1 ring-indigo-100',
    wait: 'border-slate-200 bg-slate-50',
    warn: 'border-amber-300 bg-amber-50',
    done: 'border-green-200 bg-green-50',
  }
  const toneKicker: Record<Tone, { text: string; cls: string }> = {
    do:   { text: '⚡ Azione richiesta',  cls: 'text-indigo-700' },
    wait: { text: '⏳ In attesa',         cls: 'text-slate-500' },
    warn: { text: '⚠ Da completare',      cls: 'text-amber-700' },
    done: { text: '✓ Nessuna azione',     cls: 'text-green-700' },
  }
  const btnPrimary = 'rounded-md bg-slate-900 px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-slate-700'
  const btnGhost = 'rounded-md border border-slate-300 px-4 py-2.5 text-center text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100'

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/inbox" className="text-sm text-slate-500 hover:text-slate-800">← Inbox</Link>
      </div>

      {saved && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          {saved === 'created' && '✓ Richiesta creata.'}
          {saved === 'proposal_sent' && '✓ Proposta inviata.'}
          {saved === 'price_updated' && '✓ Prezzo aggiornato.'}
          {saved === 'ok' && '✓ Stato aggiornato.'}
          {saved === 'availability_confirmed' && '✓ Camera riservata 24h: proposta + IBAN inviati all\'ospite.'}
          {saved === 'booking_confirmed' && '✓ Prenotazione confermata: conferma + PDF inviati all\'ospite.'}
          {saved === 'payment_not_received' && '✓ Comunicazione di scadenza inviata. Libera la camera manualmente nel PMS.'}
          {saved === 'marked_unavailable' && '✓ Alternative proposte all\'ospite.'}
          {saved === 'proposal_sent_manual' && '✓ Proposta registrata come inviata manualmente (lead senza canale Vesta).'}
        </div>
      )}
      {errorKey && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">✗ {
          errorKey === 'transition_failed' ? 'Transizione non valida.'
          : errorKey === 'missing_dates' ? 'Imposta le date prima di proporre.'
          : errorKey === 'delivery_failed' ? 'Invio all\'ospite FALLITO: la pratica resta in bozza, riprova.'
          : errorKey === 'no_channel' ? 'Lead senza canale: nessuna bozza da inviare.'
          : errorKey === 'no_draft' ? 'Nessuna bozza da inviare (o già consegnata).'
          : errorKey === 'invalid_state' ? 'Stato non valido per questa azione.'
          : `Errore: ${errorKey}`
        }</div>
      )}

      {/* 1 · RIGA DECISIONE — stato pratica + stato consegna, a colpo d'occhio */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-3">
        <h1 className="text-xl font-semibold text-slate-900">{request.guest_name ?? request.guest_contact ?? 'Ospite'} · {id.slice(0, 8)}</h1>
        <ScoreBadge score={request.lead_score} priority={request.priority as 'high' | 'medium' | 'low'} />
        <StatusBadge status={status} />
        <DeliveryBadge status={deliveryStatus} />
        <span className="ml-auto flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {request.offer_expires_at && ['proposal_sent', 'interested'].includes(status) && (<span className="font-medium text-indigo-700">⏱ offerta fino al {formatDateTime(request.offer_expires_at)}</span>)}
          {request.hold_expires_at && status === 'awaiting_payment' && (<span className="font-medium text-purple-700">⏱ riservata fino al {formatDateTime(request.hold_expires_at)}</span>)}
          <span>creata il {formatDateTime(request.created_at)}</span>
        </span>
      </div>

      {/* 2 · AZIONE RICHIESTA — il centro della pagina */}
      <section className={`rounded-xl border-2 p-5 ${toneCard[plan.tone]}`}>
        <p className={`text-xs font-bold uppercase tracking-wide ${toneKicker[plan.tone].cls}`}>{toneKicker[plan.tone].text}</p>
        <h2 className="mt-1 text-lg font-bold text-slate-900">{plan.title}</h2>
        <p className="mt-1 text-sm text-slate-600">{plan.body}</p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {/* received · bozza non consegnata → approva e invia (consegna reale → proposal_sent) */}
          {status === 'received' && hasUndeliveredDraft && (
            <form action={approveProposalDraft}>
              <input type="hidden" name="request_id" value={id} />
              <button type="submit" className={btnPrimary}>✅ Approva e invia proposta</button>
            </form>
          )}
          {/* received · senza bozza → form proposta (camera + prezzo) */}
          {status === 'received' && !hasUndeliveredDraft && !missingDates && !noRooms && rooms && rooms.length > 0 && (
            <form action={sendProposal} className="flex w-full flex-col gap-3 sm:flex-row sm:items-end">
              <input type="hidden" name="request_id" value={id} />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600" htmlFor="room_id">Camera proposta</label>
                <select id="room_id" name="room_id" required className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900">
                  <option value="">Seleziona camera…</option>
                  {rooms.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600" htmlFor="manual_price_cents">Prezzo/notte (¢) — fallback</label>
                <input id="manual_price_cents" name="manual_price_cents" type="number" min="0" placeholder="Es. 15000" className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
              </div>
              <button type="submit" className={btnPrimary}>Calcola e invia →</button>
            </form>
          )}
          {status === 'received' && missingDates && (
            <span className="text-sm text-amber-800">⚠ Aggiungi le date check-in/check-out per procedere.</span>
          )}
          {status === 'received' && noRooms && (
            <Link href="/rooms" className={btnGhost}>Vai a Camere →</Link>
          )}

          {/* interested → verifica disponibilità */}
          {status === 'interested' && (
            <>
              <form action={confirmAvailability}><input type="hidden" name="request_id" value={id} /><button type="submit" className={btnPrimary}>✅ Disponibile → riserva e invia preventivo + IBAN</button></form>
              <form action={markUnavailable}><input type="hidden" name="request_id" value={id} /><button type="submit" className={btnGhost}>↩︎ Non disponibile → proponi alternative</button></form>
              <a href={`/api/documents/preview?lead=${id}&type=preventivo`} target="_blank" rel="noopener noreferrer" className="self-center text-sm text-slate-600 underline hover:text-slate-900">📄 Anteprima PDF</a>
            </>
          )}

          {/* availability_blocked → richiedi pagamento */}
          {status === 'availability_blocked' && (
            <form action={transitionRequest}><input type="hidden" name="request_id" value={id} /><input type="hidden" name="to_status" value="awaiting_payment" /><button type="submit" className={btnPrimary}>💰 Richiedi pagamento</button></form>
          )}

          {/* awaiting_payment + task scadenza → due sole azioni (Task Catalog) */}
          {status === 'awaiting_payment' && taskCard && taskCard.actions.map((a) => (
            <form key={a.code} action={actionForKind[a.kind]}>
              <input type="hidden" name="request_id" value={id} />
              <button type="submit" className={a.style === 'danger' ? 'rounded-md border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50' : btnPrimary}>{a.label}</button>
            </form>
          ))}
          {/* awaiting_payment senza task → conferma pagamento */}
          {status === 'awaiting_payment' && !taskCard && (
            <>
              <form action={confirmBooking}><input type="hidden" name="request_id" value={id} /><button type="submit" className={btnPrimary}>✅ Pagamento ricevuto → Conferma e invia PDF</button></form>
              <a href={`/api/documents/preview?lead=${id}&type=conferma`} target="_blank" rel="noopener noreferrer" className="self-center text-sm text-slate-600 underline hover:text-slate-900">📄 Anteprima PDF</a>
            </>
          )}
        </div>
        {status === 'awaiting_payment' && taskCard?.note && <p className="mt-3 text-xs text-slate-500">{taskCard.note}</p>}
      </section>

      {/* Multi-richiesta (se presente): da verificare tutte */}
      {parsedRequests.length >= 2 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-800">Richieste rilevate · {parsedRequests.length}</h2>
          <ol className="flex flex-col gap-1.5 text-sm text-slate-700">
            {parsedRequests.map((s, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{i + 1}) {s.room_type ?? 'camera'}</span>
                <span className="text-slate-600">{s.check_in ? (s.check_out ? formatDateRange(s.check_in, s.check_out) : `Arrivo ${formatDate(s.check_in)}`) : 'date da confermare'}{s.adults ? ` · ${s.adults} adulti` : ''}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-amber-700">Più richieste in un solo messaggio — verificale tutte. Nessun preventivo automatico inviato.</p>
        </section>
      )}

      {/* 3 · RICHIESTA DELL'OSPITE (il contesto) */}
      {firstMessage?.content && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Richiesta dell&apos;ospite</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{firstMessage.content}</p>
        </section>
      )}

      {/* 4 · RISPOSTA PREPARATA DA VESTA (email completa + stato consegna) */}
      {lastOut?.content && (
        <section className={`rounded-lg border p-4 ${deliveryStatus === 'sent' ? 'border-green-300 bg-green-50' : deliveryStatus === 'failed' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{deliveryStatus === 'sent' ? '✓ Risposta inviata all\'ospite' : deliveryStatus === 'failed' ? '⚠ Risposta NON consegnata' : '📝 Bozza di risposta AI'}</h2>
            <DeliveryBadge status={deliveryStatus} />
            <span className="text-xs text-slate-500">{formatDateTime(lastOut.created_at as string)}</span>
          </div>
          <p className="mb-2 text-xs font-medium text-slate-600">{deliveryStatus === 'sent' ? 'Questo è il testo REALMENTE inviato all\'ospite.' : deliveryStatus === 'failed' ? 'Invio FALLITO: questo è il testo che Vesta avrebbe inviato.' : deliveryStatus === 'autosend_off' ? 'Autosend OFF: bozza pronta, NON inviata all\'ospite.' : 'Bozza generata, non ancora consegnata all\'ospite.'}</p>
          <div className="whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800">{lastOut.content}</div>
          {request.conversation_id && (<Link href={`/conversations/${request.conversation_id}`} className="mt-2 inline-block text-xs text-slate-500 underline hover:text-slate-800">Conversazione completa →</Link>)}
        </section>
      )}

      {/* 5 · DETTAGLI PRATICA (secondario, collassabile) */}
      <details className="rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Dettagli pratica</summary>
        <div className="flex flex-col gap-4 border-t border-slate-200 p-4">
          {isCombination && (
            <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3 text-sm">
              <span className="font-medium text-indigo-800">Combinazione · {combinationRooms.length} camere:</span> {combinationRooms.join(' + ')}
              <p className="mt-1 text-xs text-indigo-700">Camere separate e non comunicanti. Verifica tutte nel PMS.</p>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Dati richiesta</h3>
              <dl className="flex flex-col gap-2 text-sm text-slate-700">
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Soggiorno</dt><dd className="font-medium">{request.check_in && request.check_out ? `${formatDateRange(request.check_in, request.check_out)} (${nights} notti)` : <span className="text-slate-400">Non specificato</span>}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Ospiti</dt><dd className="font-medium">{formatGuests(request.adults ?? 1, children)}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Lingua</dt><dd className="font-medium uppercase">{request.language}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Contatto</dt><dd className="font-medium">{request.guest_contact ?? '—'}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Canale</dt><dd><SourceChip source={request.source as Source} /></dd></div>
                {request.special_requests && (<div className="flex justify-between gap-2"><dt className="text-slate-500">Richieste</dt><dd className="text-right font-medium">{request.special_requests}</dd></div>)}
              </dl>
            </div>
            {hasProposal && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Proposta</h3>
                {items && items.length > 0 && (<p className="mb-2 text-sm font-medium text-slate-900">{isCombination ? `Combinazione · ${combinationRooms.length} camere` : (items[0] as { rooms?: { name?: string } }).rooms?.name ?? '—'}</p>)}
                <dl className="flex flex-col gap-1.5 text-sm text-slate-700">
                  <div className="flex justify-between"><dt className="text-slate-500">Prezzo listino</dt><dd>{formatEuro(request.gross_total_cents!)}</dd></div>
                  {request.discount_pct != null && (<div className="flex justify-between"><dt className="text-slate-500">Sconto −{request.discount_pct}%</dt><dd className="text-green-700">−{formatEuro(request.gross_total_cents! - (request.offer_total_cents ?? 0))}</dd></div>)}
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold text-slate-900"><dt>Totale offerta</dt><dd>{formatEuro(request.offer_total_cents ?? 0)}</dd></div>
                  {request.city_tax_cents != null && request.city_tax_cents > 0 && (<div className="flex justify-between text-xs text-slate-500"><dt>Tassa soggiorno (in loco)</dt><dd>{formatEuro(request.city_tax_cents)}</dd></div>)}
                  {request.data_reliability && (<div className="flex justify-between pt-1"><dt className="text-slate-500">Affidabilità</dt><dd><ReliabilityChip reliability={request.data_reliability as Reliability} /></dd></div>)}
                  <div className="flex justify-between"><dt className="text-slate-500">Origine prezzo</dt><dd className="font-medium">{request.price_source ? (priceSourceLabel[request.price_source] ?? request.price_source) : '—'}</dd></div>
                </dl>
                {['received', 'proposal_sent', 'interested'].includes(status) && (
                  <details className="mt-3 border-t border-slate-200 pt-3 text-sm">
                    <summary className="cursor-pointer font-medium text-slate-700">✎ Modifica prezzo/offerta</summary>
                    <form action={overridePrice} className="mt-3 flex flex-col gap-3">
                      <input type="hidden" name="request_id" value={id} />
                      <div className="flex flex-col gap-1"><label className="text-xs font-medium text-slate-600" htmlFor="gross_total_cents">Prezzo lordo (centesimi)</label><input id="gross_total_cents" name="gross_total_cents" type="number" min="0" defaultValue={request.gross_total_cents ?? undefined} className="rounded border border-slate-300 px-2 py-1.5 text-sm" /></div>
                      <div className="flex flex-col gap-1"><label className="text-xs font-medium text-slate-600" htmlFor="discount_pct">Sconto %</label><input id="discount_pct" name="discount_pct" type="number" min="0" max="100" step="0.5" defaultValue={request.discount_pct ?? defaultDiscount} className="rounded border border-slate-300 px-2 py-1.5 text-sm" /></div>
                      <button type="submit" className="self-end rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">Aggiorna →</button>
                    </form>
                  </details>
                )}
              </div>
            )}
          </div>
          {/* Altre azioni di stato (controllo manuale: rifiuta/cancella/override) */}
          <div className="border-t border-slate-200 pt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Altre azioni</h3>
            <RequestActions requestId={id} status={status} paymentTaskOpen={!!openTask} />
          </div>
          {/* Score */}
          {scoring && scoring.length > 0 && (
            <div className="border-t border-slate-200 pt-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Score lead: {request.lead_score}</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {scoring.map((s, i) => (<li key={i} className="flex justify-between text-slate-700"><span>{s.event as string}</span><span className={(s.delta as number) >= 0 ? 'font-medium text-green-700' : 'font-medium text-red-600'}>{(s.delta as number) >= 0 ? '+' : ''}{s.delta as number}</span></li>))}
              </ul>
            </div>
          )}
        </div>
      </details>

      {/* 6 · TIMELINE — solo storico, in fondo */}
      <details className="rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Timeline (storico)</summary>
        <div className="border-t border-slate-200 p-4">
          {events && events.length > 0 ? (
            <ul className="flex flex-col gap-2.5 text-sm">
              {events.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-28 shrink-0 text-xs text-slate-400">{formatDateTime(e.created_at as string)}</span>
                  <span className="w-14 shrink-0 text-xs font-medium text-slate-500">{actorLabels[e.actor as keyof typeof actorLabels]}</span>
                  <span className="text-slate-700">{e.from_status ? `${bookingStatusLabels[e.from_status as BookingStatus]} → ` : ''}<strong>{bookingStatusLabels[e.to_status as BookingStatus]}</strong>{e.note && <span className="block text-xs text-slate-400">{e.note as string}</span>}</span>
                </li>
              ))}
            </ul>
          ) : (<p className="text-sm text-slate-400">Nessun evento registrato.</p>)}
        </div>
      </details>
    </div>
  )
}
