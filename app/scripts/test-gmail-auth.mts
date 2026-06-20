// Test di autenticazione Gmail (READ-ONLY): verifica presenza env (senza stampare
// valori), ottiene access token dal refresh token, conferma la mailbox autenticata
// e conta le email recenti. NON ingerisce e NON invia nulla.
// Uso: node --env-file=.env.local --import tsx scripts/test-gmail-auth.mts
import { getAccessToken, listRecent } from '@/lib/email/gmail'

function presence(name: string): string {
  const v = process.env[name]
  return v && v.trim() ? `presente (lunghezza ${v.trim().length})` : 'MANCANTE ❌'
}

console.log('── Presenza variabili (valori NON stampati) ──')
for (const n of ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_ADDRESS', 'GMAIL_PROPERTY_ID']) {
  console.log(`  ${n}: ${presence(n)}`)
}

console.log('\n── Autenticazione Gmail ──')
const token = await getAccessToken()
console.log('  access token dal refresh token:', token ? 'ottenuto ✅' : 'KO ❌')

const prof = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
  headers: { authorization: `Bearer ${token}` },
})
if (!prof.ok) {
  console.log('  getProfile: KO', prof.status, await prof.text())
  process.exit(1)
}
const pj = (await prof.json()) as { emailAddress?: string; messagesTotal?: number }
console.log('  mailbox autenticata:', pj.emailAddress, '| messaggi totali:', pj.messagesTotal)

const expected = (process.env.GMAIL_ADDRESS ?? '').trim().toLowerCase()
console.log('  corrisponde a GMAIL_ADDRESS:', pj.emailAddress?.toLowerCase() === expected ? 'SÌ ✅' : 'NO ⚠️')

const recent = await listRecent(token, 25, 3)
console.log('  email recenti in INBOX (ultimi 3 giorni):', recent.length)

console.log('\n✅ Autenticazione Gmail funzionante (nessuna email ingerita, nessuna risposta inviata).')
