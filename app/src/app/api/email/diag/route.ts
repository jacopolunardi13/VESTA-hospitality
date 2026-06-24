import { getAccessToken, getProfile } from '@/lib/email/gmail'

// Diagnostica READ-ONLY del collegamento Gmail in produzione. Nessuna scrittura DB, nessun
// polling, nessun invio: esegue solo lo scambio refresh-token e Gmail users.getProfile.
// Protetto da CRON_SECRET. Serve a verificare QUALE casella usa la produzione dopo il redeploy.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const token = await getAccessToken()
    const profile = await getProfile(token)
    return Response.json({
      ok: true,
      emailAddress: profile.emailAddress,
      messagesTotal: profile.messagesTotal,
      accessAt: new Date().toISOString(),
    })
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
