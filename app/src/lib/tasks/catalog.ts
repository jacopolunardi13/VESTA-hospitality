// Task Catalog — traduce il FATTO DI BUSINESS (operational_tasks.type) nel
// linguaggio dello staff: titolo, descrizione, azioni. I codici (type/resolution)
// sono CONTRATTI stabili; etichette e frasi vivono QUI e possono cambiare o
// localizzarsi liberamente. Nuovo type = nuova voce qui, nessuna migrazione.

export type TaskActionKind = 'confirm_paid' | 'mark_not_paid'

export interface TaskAction {
  /** esito registrato (resolution) quando lo staff sceglie questa azione */
  code: string
  label: string
  /** chiave che la UI mappa sulla server action concreta */
  kind: TaskActionKind
  style: 'primary' | 'danger' | 'default'
}

export interface TaskPresentation {
  area: string
  icon: string
  title: string
  description: string
  note?: string
  actions: TaskAction[]
}

export interface TaskSubjectContext {
  guestName?: string | null
  roomName?: string | null
}

/** Presenta una task per lo staff. null per type sconosciuti (difensivo). */
export function presentTask(type: string, ctx: TaskSubjectContext = {}): TaskPresentation | null {
  switch (type) {
    case 'booking.payment_window_expired': {
      const who = ctx.guestName?.trim() || 'ospite'
      return {
        area: 'booking',
        icon: '💳',
        title: `Verifica il pagamento della prenotazione ${who}`,
        description:
          'Sono trascorse 24h dalla riserva senza conferma del pagamento. ' +
          'Verifica se è arrivato, poi conferma la prenotazione oppure libera la camera e avvisa l’ospite.',
        note: 'La camera va liberata manualmente nel PMS/QuoVai: Vesta non modifica l’inventario.',
        actions: [
          { code: 'paid', label: '✅ Pagamento ricevuto → conferma e invia PDF', kind: 'confirm_paid', style: 'primary' },
          { code: 'not_paid', label: '✖ Pagamento non ricevuto → libera e avvisa l’ospite', kind: 'mark_not_paid', style: 'danger' },
        ],
      }
    }
    default:
      return null
  }
}
