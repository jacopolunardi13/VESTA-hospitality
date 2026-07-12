// Coda operativa — vista UNICA del lavoro operativo (operational_tasks).
// Qui lo staff vede COSA va fatto; l'azione si esegue nella pagina della pratica
// (una sola superficie d'azione → responsabilità e audit chiari).
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDateRange, formatDateTime, formatEuro } from '@/lib/format'
import { listTasksForProperty, type QueueTask } from '@/lib/tasks/operationalTasks'
import { presentTask, taskResolutionLabels } from '@/lib/tasks/catalog'

async function resolveProperty() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).limit(1).single()
  if (!member) redirect('/onboarding')
  const { data: property } = await supabase.from('properties').select('id').eq('org_id', member.org_id).is('deleted_at', null).limit(1).single()
  if (!property) redirect('/onboarding')
  return { supabase, propertyId: property.id }
}

interface BookingCtx {
  id: string
  guest_name: string | null
  guest_contact: string | null
  check_in: string | null
  check_out: string | null
  offer_total_cents: number | null
  hold_expires_at: string | null
}

export default async function OperationalQueuePage() {
  const { supabase, propertyId } = await resolveProperty()
  const { open, recentlyResolved } = await listTasksForProperty(supabase, propertyId)

  // Contesto delle pratiche collegate (subject polimorfico, niente FK → seconda query).
  const bookingIds = [...open, ...recentlyResolved]
    .filter((t) => t.subjectType === 'booking_request' && t.subjectId)
    .map((t) => t.subjectId as string)
  let bookings = new Map<string, BookingCtx>()
  if (bookingIds.length > 0) {
    const { data } = await supabase
      .from('booking_requests')
      .select('id, guest_name, guest_contact, check_in, check_out, offer_total_cents, hold_expires_at')
      .in('id', bookingIds)
    bookings = new Map(((data ?? []) as BookingCtx[]).map((b) => [b.id, b]))
  }

  function TaskCard({ t }: { t: QueueTask }) {
    const booking = t.subjectId ? bookings.get(t.subjectId) : undefined
    const card = presentTask(t.type, { guestName: booking?.guest_name })
    // type sconosciuto al catalogo: mostralo comunque (mai nascondere lavoro allo staff)
    const title = card?.title ?? `Task operativa: ${t.type}`
    const description = card?.description ?? 'Tipo di task non ancora catalogato. Apri la pratica collegata per i dettagli.'
    return (
      <li className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start gap-2">
          <span className="text-lg leading-none">{card?.icon ?? '🗂'}</span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <p className="mt-0.5 text-sm text-slate-600">{description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>rilevata da Vesta il {formatDateTime(t.createdAt)}</span>
              {booking?.check_in && booking?.check_out && (
                <span className="whitespace-nowrap">📅 {formatDateRange(booking.check_in, booking.check_out)}</span>
              )}
              {booking?.offer_total_cents != null && (
                <span className="whitespace-nowrap font-medium text-slate-700">💶 {formatEuro(booking.offer_total_cents)}</span>
              )}
              {t.status === 'open' && booking?.hold_expires_at && (
                <span className="whitespace-nowrap font-medium text-purple-700">⏱ riservata fino al {formatDateTime(booking.hold_expires_at)}</span>
              )}
              {t.status === 'resolved' && t.resolution && (
                <span className="font-medium text-slate-700">{taskResolutionLabels[t.resolution] ?? `esito: ${t.resolution}`}</span>
              )}
            </div>
            {t.status === 'open' && card?.note && <p className="mt-2 text-xs text-slate-500">{card.note}</p>}
          </div>
          {t.status === 'open' && t.subjectType === 'booking_request' && t.subjectId && (
            <Link
              href={`/inbox/${t.subjectId}`}
              className="shrink-0 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
            >
              Gestisci la pratica →
            </Link>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Coda operativa</h1>
        <p className="mt-1 text-sm text-slate-500">
          Le cose da fare rilevate da Vesta (controllo automatico ogni 5 minuti). Ogni task si
          risolve dalla pagina della pratica: qui vedi cosa è aperto e cosa è stato chiuso di recente.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-red-700">⚡ Da fare ({open.length})</h2>
        {open.length === 0 ? (
          <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-6 text-center text-sm text-green-800">
            ✓ Nessuna task aperta. Vesta continua a controllare le scadenze ogni 5 minuti: quando
            rileva qualcosa (es. pagamento non confermato entro 24h) la troverai qui e tra le notifiche.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">{open.map((t) => <TaskCard key={t.id} t={t} />)}</ul>
        )}
      </section>

      {recentlyResolved.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Risolte negli ultimi 7 giorni ({recentlyResolved.length})
          </h2>
          <ul className="flex flex-col gap-2 opacity-75">{recentlyResolved.map((t) => <TaskCard key={t.id} t={t} />)}</ul>
        </section>
      )}
    </div>
  )
}
