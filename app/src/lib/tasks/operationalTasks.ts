// operational_tasks — Operational Queue: coda unica del lavoro operativo di Vesta
// (l'inbox è solo una vista che la legge). Tabella non ancora nei tipi generati →
// client locale non tipizzato (cast unico, payload tipizzati qui), come pendingActions.ts.
import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { dbThrow } from '@/lib/supabase/guard'

const db = (sb: SupabaseClient<Database>) => sb as unknown as SupabaseClient

/** type = FATTO di business (mai l'azione). Vocabolario `area.<fatto>`. */
export type OperationalTaskType = 'booking.payment_window_expired'
/** Esito (contratto stabile); le etichette vivono nel Task Catalog. */
export type TaskResolution = 'paid' | 'not_paid'

export interface OpenTask {
  id: string
  type: string
  subjectType: string | null
  subjectId: string | null
  createdAt: string
}

/** Task operativa 'open' di una prenotazione (per la UI inbox). null se assente. */
export async function getOpenTaskForBooking(
  sb: SupabaseClient<Database>,
  bookingRequestId: string,
): Promise<OpenTask | null> {
  const { data, error } = await db(sb)
    .from('operational_tasks')
    .select('id, type, subject_type, subject_id, created_at')
    .eq('subject_type', 'booking_request')
    .eq('subject_id', bookingRequestId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
  dbThrow(error, 'getOpenTaskForBooking')
  const row = (Array.isArray(data) ? data[0] : null) as
    | { id: string; type: string; subject_type: string | null; subject_id: string | null; created_at: string }
    | null
  if (!row) return null
  return { id: row.id, type: row.type, subjectType: row.subject_type, subjectId: row.subject_id, createdAt: row.created_at }
}

/**
 * Risolve la task operativa aperta di una prenotazione (idempotente: agisce solo
 * sulle 'open'). Registra l'esito; lo staff resta responsabile del PMS.
 */
export async function resolveTaskForBooking(
  sb: SupabaseClient<Database>,
  p: { bookingRequestId: string; type: OperationalTaskType; resolution: TaskResolution },
): Promise<void> {
  const { error } = await db(sb)
    .from('operational_tasks')
    .update({ status: 'resolved', resolution: p.resolution })
    .eq('subject_type', 'booking_request')
    .eq('subject_id', p.bookingRequestId)
    .eq('type', p.type)
    .eq('status', 'open')
  dbThrow(error, 'resolveTaskForBooking')
}
