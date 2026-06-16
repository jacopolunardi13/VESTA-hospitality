import { createAdminClient } from '@/lib/supabase/admin'
import { syncIcalFeeds } from '@/lib/ical/sync'

// Trigger sincronizzazione disponibilità iCal. Da richiamare da uno scheduler
// cloud (pg_cron→endpoint o Vercel Cron). Protetto da CRON_SECRET.
// Con 0 feed configurati è un no-op. Nessun feed reale collegato in questa fase.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await syncIcalFeeds(createAdminClient())
    return Response.json({ ok: true, ...result })
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
