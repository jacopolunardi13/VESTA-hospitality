// Client Gmail API minimale (REST via fetch, nessuna dipendenza esterna) per il
// pilot email Vesta. Auth server-to-server tramite refresh token (no password).
// Scope richiesto: https://www.googleapis.com/auth/gmail.modify (read+send+label).

import { randomUUID } from 'node:crypto'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export interface InboundEmail {
  id: string            // id messaggio Gmail
  threadId: string      // id thread Gmail (per rispondere in-thread)
  from: string          // indirizzo mittente (lowercase)
  fromName: string      // nome visualizzato
  subject: string
  rfcMessageId: string  // header Message-ID (per In-Reply-To)
  references: string    // header References (catena thread)
  inReplyTo: string     // header In-Reply-To (fallback mapping conversazione)
  body: string          // testo pulito (quote rimossa)
  listUnsubscribe?: string // header List-Unsubscribe (→ newsletter)
  autoSubmitted?: string   // header Auto-Submitted (→ automatico)
  precedence?: string      // header Precedence (bulk → newsletter)
}

interface GmailHeader { name: string; value: string }
interface GmailPart {
  mimeType?: string
  body?: { data?: string }
  parts?: GmailPart[]
  headers?: GmailHeader[]
}
interface GmailMessageFull { id: string; threadId: string; snippet?: string; payload?: GmailPart }

export async function getAccessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID ?? '',
      client_secret: process.env.GMAIL_CLIENT_SECRET ?? '',
      refresh_token: process.env.GMAIL_REFRESH_TOKEN ?? '',
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`gmail token ${res.status}: ${await res.text()}`)
  const j = (await res.json()) as { access_token?: string }
  if (!j.access_token) throw new Error('gmail token: access_token mancante')
  return j.access_token
}

// Elenca i messaggi RECENTI in INBOX (letti o no). La deduplica NON dipende dallo
// stato "non letto": è gestita a valle dal ledger su messages.metadata.gmail_message_id.
export async function listRecent(accessToken: string, max = 25, windowDays = 3): Promise<{ id: string; threadId: string }[]> {
  const url = `${API}/messages?q=${encodeURIComponent(`in:inbox newer_than:${windowDays}d`)}&maxResults=${max}`
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`gmail list ${res.status}: ${await res.text()}`)
  const j = (await res.json()) as { messages?: { id: string; threadId: string }[] }
  return (j.messages ?? []).map((m) => ({ id: m.id, threadId: m.threadId }))
}

function headerOf(p: GmailPart | undefined, name: string): string {
  const h = (p?.headers ?? []).find((x) => x.name.toLowerCase() === name.toLowerCase())
  return h?.value ?? ''
}

function decode(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8')
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

function extractText(p: GmailPart | undefined): string {
  if (!p) return ''
  if (p.mimeType === 'text/plain' && p.body?.data) return decode(p.body.data)
  if (p.parts) {
    for (const sub of p.parts) if (sub.mimeType === 'text/plain' && sub.body?.data) return decode(sub.body.data)
    for (const sub of p.parts) { const t = extractText(sub); if (t) return t }
    for (const sub of p.parts) if (sub.mimeType === 'text/html' && sub.body?.data) return stripHtml(decode(sub.body.data))
  }
  if (p.mimeType === 'text/html' && p.body?.data) return stripHtml(decode(p.body.data))
  return ''
}

function parseFrom(v: string): { email: string; name: string } {
  const m = v.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() }
  return { name: '', email: v.trim().toLowerCase() }
}

export async function getMessage(accessToken: string, id: string): Promise<InboundEmail> {
  const res = await fetch(`${API}/messages/${id}?format=full`, { headers: { authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`gmail get ${res.status}: ${await res.text()}`)
  const j = (await res.json()) as GmailMessageFull
  const from = parseFrom(headerOf(j.payload, 'From'))
  let body = extractText(j.payload)
  // Rimuove la cronologia citata (taglio al primo marcatore di reply IT/EN).
  body = body.split(/\n\s*(?:On .+wrote:|Il .+ha scritto:|-{2,}\s*Original Message|Da:\s)/i)[0].trim()
  return {
    id: j.id, threadId: j.threadId,
    from: from.email, fromName: from.name,
    subject: headerOf(j.payload, 'Subject'),
    rfcMessageId: headerOf(j.payload, 'Message-ID'),
    references: headerOf(j.payload, 'References'),
    inReplyTo: headerOf(j.payload, 'In-Reply-To'),
    body: body || (j.snippet ?? ''),
    listUnsubscribe: headerOf(j.payload, 'List-Unsubscribe'),
    autoSubmitted: headerOf(j.payload, 'Auto-Submitted'),
    precedence: headerOf(j.payload, 'Precedence'),
  }
}

export async function markRead(accessToken: string, id: string): Promise<void> {
  await fetch(`${API}/messages/${id}/modify`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  })
}

export interface EmailAttachment { filename: string; mimeType: string; content: Buffer }
export interface SendReplyOpts {
  to: string; from: string; subject: string
  body: string            // testo semplice (fallback)
  html?: string           // corpo HTML (multipart/alternative)
  attachments?: EmailAttachment[] // allegati (es. PDF preventivo)
  inReplyTo?: string; references?: string; threadId?: string
}

const wrap76 = (b: Buffer) => b.toString('base64').replace(/(.{76})/g, '$1\r\n')

/** Costruisce il MIME completo (testo / multipart-alternative / multipart-mixed con allegati).
 *  Estratto da sendReply per essere testabile senza inviare. */
export function buildMimeMessage(opts: SendReplyOpts): string {
  const subject = /^re:/i.test(opts.subject) ? opts.subject : `Re: ${opts.subject || '(nessun oggetto)'}`
  const headers = [`From: ${opts.from}`, `To: ${opts.to}`, `Subject: ${subject}`, 'MIME-Version: 1.0']
  if (opts.inReplyTo) {
    headers.push(`In-Reply-To: ${opts.inReplyTo}`)
    headers.push(`References: ${opts.references ? opts.references + ' ' : ''}${opts.inReplyTo}`)
  }
  const atts = opts.attachments ?? []
  const altPart = (alt: string) => {
    const p = [`--${alt}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '', opts.body]
    if (opts.html) p.push(`--${alt}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '', opts.html)
    p.push(`--${alt}--`)
    return p.join('\r\n')
  }

  let mimeBody: string
  if (atts.length > 0) {
    const mixed = `mixed_${randomUUID()}`, alt = `alt_${randomUUID()}`
    headers.push(`Content-Type: multipart/mixed; boundary="${mixed}"`)
    const parts = [`--${mixed}`, `Content-Type: multipart/alternative; boundary="${alt}"`, '', altPart(alt)]
    for (const a of atts) {
      parts.push(`--${mixed}`,
        `Content-Type: ${a.mimeType}; name="${a.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${a.filename}"`, '', wrap76(a.content))
    }
    parts.push(`--${mixed}--`)
    mimeBody = parts.join('\r\n')
  } else if (opts.html) {
    const alt = `alt_${randomUUID()}`
    headers.push(`Content-Type: multipart/alternative; boundary="${alt}"`)
    mimeBody = altPart(alt)
  } else {
    headers.push('Content-Type: text/plain; charset="UTF-8"')
    mimeBody = opts.body
  }
  return headers.join('\r\n') + '\r\n\r\n' + mimeBody
}

export async function sendReply(accessToken: string, opts: SendReplyOpts): Promise<void> {
  const raw = Buffer.from(buildMimeMessage(opts), 'utf8').toString('base64url')
  const res = await fetch(`${API}/messages/send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(opts.threadId ? { raw, threadId: opts.threadId } : { raw }),
  })
  if (!res.ok) throw new Error(`gmail send ${res.status}: ${await res.text()}`)
}
