'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { dbThrow } from '@/lib/supabase/guard'

/** Segna una notifica come letta (RLS garantisce che sia della propria org). */
export async function markNotificationRead(id: string): Promise<void> {
  if (!id) return
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  dbThrow((await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)).error, 'notifications.markRead')
  revalidatePath('/', 'layout')
}

/** Segna tutte le notifiche non lette come lette. */
export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  dbThrow((await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)).error, 'notifications.markAllRead')
  revalidatePath('/', 'layout')
}
