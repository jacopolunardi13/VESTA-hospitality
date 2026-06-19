'use client'

import { transitionRequest, confirmAvailability, markUnavailable } from '@/app/(dashboard)/inbox/actions'
import type { BookingStatus } from '@/lib/quote/types'

interface ActionDef {
  to: BookingStatus
  label: string
  primary?: boolean
  danger?: boolean
}

// Per 'received', la transizione primary (proposal_sent) è gestita dal form inline nel dettaglio.
const actionsByStatus: Record<BookingStatus, ActionDef[]> = {
  received:              [
    { to: 'rejected',  label: '✖ Rifiuta',  danger:  true },
    { to: 'cancelled', label: '✖ Cancella', danger:  true },
  ],
  proposal_sent:         [
    { to: 'interested',  label: '✋ Segna interessato',     primary: true },
    { to: 'expired',     label: '⏱ Segna scaduta' },
    { to: 'rejected',    label: '✖ Rifiuta',                danger:  true },
    { to: 'cancelled',   label: '✖ Cancella',               danger:  true },
  ],
  // 'interested' = "In attesa verifica disponibilità": le azioni primarie sono dedicate
  // (confirmAvailability / markUnavailable, vedi sotto). Qui restano solo rifiuta/cancella.
  interested:            [
    { to: 'rejected',             label: '✖ Rifiuta',               danger:  true },
    { to: 'cancelled',            label: '✖ Cancella',              danger:  true },
  ],
  availability_blocked:  [
    { to: 'awaiting_payment', label: '💰 Richiedi pagamento', primary: true },
    { to: 'expired',          label: '⏱ Scaduta' },
    { to: 'cancelled',        label: '✖ Cancella',            danger:  true },
  ],
  awaiting_payment:      [
    { to: 'confirmed', label: '✅ Pagamento ricevuto → Conferma', primary: true },
    { to: 'cancelled', label: '✖ Cancella',                       danger:  true },
  ],
  confirmed:             [
    { to: 'cancelled', label: '✖ Cancella prenotazione', danger: true },
  ],
  to_verify:             [],
  expired:               [],
  rejected:              [],
  cancelled:             [],
}

export default function RequestActions({
  requestId,
  status,
}: {
  requestId: string
  status: BookingStatus
}) {
  const actions = actionsByStatus[status]

  if (actions.length === 0 && status !== 'interested') {
    return (
      <p className="text-sm text-slate-400">
        Nessuna azione disponibile per questo stato.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'interested' && (
        <>
          <form action={confirmAvailability}>
            <input type="hidden" name="request_id" value={requestId} />
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
            >
              ✅ Disponibile → riserva e richiedi pagamento
            </button>
          </form>
          <form action={markUnavailable}>
            <input type="hidden" name="request_id" value={requestId} />
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              ↩︎ Non disponibile → proponi alternative
            </button>
          </form>
        </>
      )}
      {actions.map(a => (
        <form key={a.to} action={transitionRequest}>
          <input type="hidden" name="request_id" value={requestId} />
          <input type="hidden" name="to_status" value={a.to} />
          <button
            type="submit"
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              a.primary
                ? 'bg-slate-900 text-white hover:bg-slate-700'
                : a.danger
                  ? 'border border-red-200 text-red-700 hover:bg-red-50'
                  : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {a.label}
          </button>
        </form>
      ))}
    </div>
  )
}
