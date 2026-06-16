// Parser iCal minimale: estrae le notti OCCUPATE dai VEVENT (DTSTART..DTEND esclusivo).
// I feed iCal di Booking/Airbnb/Channel Manager esportano la sola disponibilità (no prezzi).

function unfold(ics: string): string[] {
  // Le righe continuate iniziano con spazio/tab (RFC 5545 line folding).
  const out: string[] = []
  for (const raw of ics.split(/\r?\n/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += raw.slice(1)
    } else {
      out.push(raw)
    }
  }
  return out
}

/** Estrae il valore data da una riga DTSTART/DTEND (gestisce ;VALUE=DATE e datetime). */
function parseDateValue(line: string): Date | null {
  const v = line.substring(line.indexOf(':') + 1).trim()
  const m = v.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!m) return null
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Ritorna l'insieme ordinato delle notti occupate (YYYY-MM-DD).
 * DTEND è esclusivo (giorno di check-out non occupato).
 */
export function parseIcsBusyNights(ics: string): string[] {
  const lines = unfold(ics)
  const busy = new Set<string>()
  let inEvent = false
  let start: Date | null = null
  let end: Date | null = null

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) { inEvent = true; start = null; end = null; continue }
    if (line.startsWith('END:VEVENT')) {
      if (start && end) {
        for (const d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) busy.add(dateStr(d))
      } else if (start && !end) {
        busy.add(dateStr(start)) // evento di un solo giorno
      }
      inEvent = false
      continue
    }
    if (!inEvent) continue
    if (line.startsWith('DTSTART')) start = parseDateValue(line)
    else if (line.startsWith('DTEND')) end = parseDateValue(line)
  }

  return [...busy].sort()
}
