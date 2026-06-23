// Template email HTML brandizzato con l'identità della STRUTTURA (non Vesta), email-safe
// (tabelle + CSS inline, ~600px). Footer discreto "Powered by Vesta Hospitality".
// Vedi branding-architecture: le comunicazioni verso gli ospiti usano il brand della property.
import type { PropertyDocConfig } from '@/lib/documents/types'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Converte il testo della risposta (con a-capo e bullet "•") in HTML email-safe. */
function bodyToHtml(text: string): string {
  return esc(text)
    .split('\n')
    .map((line) => {
      const t = line.trimEnd()
      if (t === '') return '<div style="height:10px;line-height:10px">&nbsp;</div>'
      if (/^[•\-]\s/.test(t)) return `<div style="margin:2px 0 2px 8px">${t}</div>`
      if (/^—\s.+\s—$/.test(t)) return `<div style="margin:14px 0 4px;font-weight:bold;color:#1a1a1a">${t}</div>`
      return `<div style="margin:4px 0">${t}</div>`
    })
    .join('')
}

/** HTML dell'email per l'ospite, brandizzato con la struttura. */
export function renderEmailHtml(config: PropertyDocConfig, bodyText: string): string {
  const ink = '#1a1a1a', mute = '#6b6b6b', line = '#e5e1d8'
  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f1;font-family:Arial,Helvetica,sans-serif;color:${ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f1;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${line};border-radius:8px;overflow:hidden">
  <tr><td style="padding:22px 28px;border-bottom:2px solid ${ink}">
    <div style="font-size:20px;font-weight:bold;color:${ink}">${esc(config.brandName)}</div>
    <div style="font-size:12px;color:${mute};margin-top:2px">${esc(config.locality)}</div>
  </td></tr>
  <tr><td style="padding:24px 28px;font-size:14px;line-height:1.6;color:${ink}">
    ${bodyToHtml(bodyText)}
  </td></tr>
  <tr><td style="padding:18px 28px;border-top:1px solid ${line};font-size:12px;color:${mute};line-height:1.6">
    <div style="font-weight:bold;color:${ink}">${esc(config.brandName)}</div>
    <div>${esc(config.email)} · ${esc(config.phone)}</div>
    <div style="margin-top:10px;color:#a8a39a">Powered by Vesta Hospitality</div>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}
