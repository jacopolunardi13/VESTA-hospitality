// Parser iniziali OTA/PMS → campi per reservations_staging. Best-effort: il campo `confidence`
// riflette quanti dati sono stati estratti; `verified=false` finché non valida lo staff. Il body
// grezzo resta in ota_inbox, quindi i parser si possono migliorare e ri-eseguire senza perdite.
import type { InboundEmail } from './gmail'
import type { OtaSource } from './routing'

export interface StagingFields {
  source: OtaSource
  external_id: string | null
  guest_name: string | null
  check_in: string | null   // ISO YYYY-MM-DD
  check_out: string | null
  room: string | null
  amount_cents: number | null
  status: 'new' | 'modified' | 'cancelled' | 'unknown'
  confidence: number
}

const MONTHS: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8,
  settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
}
const pad = (n: number) => String(n).padStart(2, '0')

/** Trova le date nel testo (ISO, DD/MM/YYYY, "1 agosto 2026", "1 August 2026") in ordine. */
function findDates(text: string): string[] {
  const out: { pos: number; iso: string }[] = []
  let m: RegExpExecArray | null
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g
  while ((m = iso.exec(text))) out.push({ pos: m.index, iso: `${m[1]}-${m[2]}-${m[3]}` })
  const dmy = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g
  while ((m = dmy.exec(text))) out.push({ pos: m.index, iso: `${m[3]}-${pad(+m[2])}-${pad(+m[1])}` })
  const named = /\b(\d{1,2})\s+([a-zA-Zàèéìòù]+)\s+(\d{4})\b/g
  while ((m = named.exec(text))) {
    const mo = MONTHS[m[2].toLowerCase()]
    if (mo) out.push({ pos: m.index, iso: `${m[3]}-${pad(mo)}-${pad(+m[1])}` })
  }
  return out.sort((a, b) => a.pos - b.pos).map((x) => x.iso)
}

function parseAmountCents(text: string): number | null {
  const m = text.match(/(?:tot[ae]le?|total|importo|amount|prezzo|price)\D{0,15}?(?:€|eur)?\s*([0-9][0-9.\s]{0,8})(?:[,.]([0-9]{2}))?/i)
  if (!m) return null
  const intPart = m[1].replace(/[.\s]/g, '')
  const cents = m[2] ? +m[2] : 0
  const val = parseInt(intPart, 10)
  return isNaN(val) ? null : val * 100 + cents
}

function detectStatus(text: string): StagingFields['status'] {
  if (/cancell|annull|disdett/i.test(text)) return 'cancelled'
  if (/modific|chang|aggiorn|updat|variazione/i.test(text)) return 'modified'
  if (/prenotazione|reservation|booking|confermat|confirmed/i.test(text)) return 'new'
  return 'unknown'
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re)
  return m ? m[1].trim() : null
}

const ID_PATTERNS: Record<OtaSource, RegExp | null> = {
  booking: /(?:booking number|numero (?:di )?prenotazione|conferma(?:tion)?(?:\s*(?:number|n[°.]?))?)\D{0,6}(\d{7,12})/i,
  expedia: /(?:itinerary|itinerario)\D{0,6}(\d{8,16})/i,
  airbnb: /\b([A-Z]{2}[A-Z0-9]{6,10})\b/,
  quovai: /(?:prenotazione|reservation|id)\D{0,6}([A-Z0-9-]{5,20})/i,
  qvi: /(?:prenotazione|reservation|id)\D{0,6}([A-Z0-9-]{5,20})/i,
  unknown: /(?:reservation|prenotazione|booking|conferma)\D{0,6}([A-Z0-9-]{5,20})/i,
}

/** Estrae i campi di staging da un'email OTA/PMS. Mai lancia: ritorna sempre un best-effort. */
export function parseOtaEmail(source: OtaSource, email: InboundEmail): StagingFields {
  const text = `${email.subject}\n${email.body}`
  const dates = findDates(text)
  const idRe = ID_PATTERNS[source] ?? ID_PATTERNS.unknown
  const external_id = idRe ? firstMatch(text, idRe) : null
  const guest_name = firstMatch(text, /(?:guest(?:\s*name)?|ospite|nome ospite|cliente)\s*[:\-]\s*([A-Za-zÀ-ÿ' ]{3,40})/i)
  const room = firstMatch(text, /(?:room|camera|stanza|unit[àa]?)\s*[:\-]\s*([A-Za-zÀ-ÿ0-9'’ \-—]{2,40})/i)
  const amount_cents = parseAmountCents(text)
  const status = detectStatus(text)

  const got = [external_id, dates[0], dates[1], guest_name, amount_cents].filter((x) => x != null).length
  const confidence = Math.min(0.95, 0.2 + got * 0.15) // 0.2 base, +0.15 per campo (max ~0.95)

  return {
    source,
    external_id,
    guest_name,
    check_in: dates[0] ?? null,
    check_out: dates[1] ?? null,
    room,
    amount_cents,
    status,
    confidence: Math.round(confidence * 100) / 100,
  }
}
