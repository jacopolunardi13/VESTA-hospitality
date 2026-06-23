// Render PDF del documento (pdfkit). Layout ispirato ai modelli ufficiali LunArt:
// intestazione brand · titolo · ospite · tabella · totale · note · firma · footer legale.
// Font standard (Helvetica) → nessun file font da includere. Ritorna un Buffer.
import PDFDocument from 'pdfkit'
import type { DocumentModel } from './types'

const eur = (cents: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)

const INK = '#1a1a1a'   // nero grafico (palette LunArt)
const MUTE = '#6b6b6b'  // grigio testo secondario
const LINE = '#d9d4cc'  // grigio carta per le righe

const M = 50            // margine
const X0 = M
const X_DETAILS = 312
const X_AMOUNT = 430
const X_RIGHT = 545     // 595.28 - 50

export function renderDocumentPdf(model: DocumentModel): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: M, info: { Title: `${model.title} – ${model.config.brandName}` } })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const rule = (y: number, color = LINE) => doc.moveTo(X0, y).lineTo(X_RIGHT, y).lineWidth(0.7).strokeColor(color).stroke()

    // ── Intestazione ──
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text(model.config.brandName, X0, M)
    doc.font('Helvetica').fontSize(9).fillColor(MUTE).text(model.config.locality, X0, doc.y + 1)
    let y = doc.y + 10
    rule(y, INK); y += 16

    // ── Titolo documento ──
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text(model.title.toUpperCase(), X0, y, { characterSpacing: 2 })
    y = doc.y + 4
    doc.font('Helvetica').fontSize(9).fillColor(MUTE)
    doc.text(model.issuePlaceDate, X0, y, { width: 250 })
    doc.text(model.reference, X_DETAILS, y, { width: X_RIGHT - X_DETAILS, align: 'right' })
    y = doc.y + 14

    // ── Ospite ──
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTE).text('OSPITE', X0, y, { characterSpacing: 1 })
    doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(model.guestName, X0, doc.y + 1)
    doc.font('Helvetica').fontSize(9).fillColor(MUTE).text(model.guestsLabel, X0, doc.y + 1)
    y = doc.y + 16

    // ── Tabella ──
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTE)
    doc.text('DESCRIZIONE', X0, y); doc.text('DETTAGLI', X_DETAILS, y)
    doc.text('IMPORTO', X_AMOUNT, y, { width: X_RIGHT - X_AMOUNT, align: 'right' })
    y += 14; rule(y); y += 8

    doc.fontSize(10)
    for (const ln of model.lines) {
      doc.font('Helvetica-Bold').fillColor(INK).text(ln.description, X0, y, { width: X_DETAILS - X0 - 8 })
      const hDesc = doc.y - y
      doc.font('Helvetica').fillColor(MUTE).fontSize(9).text(ln.details, X_DETAILS, y, { width: X_AMOUNT - X_DETAILS - 8 })
      doc.font('Helvetica').fillColor(INK).fontSize(10).text(eur(ln.amountCents), X_AMOUNT, y, { width: X_RIGHT - X_AMOUNT, align: 'right' })
      y += Math.max(hDesc, 14) + 6
    }
    // Riga soggiorno (date · notti · ospiti)
    doc.font('Helvetica').fillColor(MUTE).fontSize(9)
    doc.text(`Check-in: ${model.checkInLabel}  ·  Check-out: ${model.checkOutLabel}`, X0, y, { width: X_AMOUNT - X0 - 8 })
    doc.text(`${model.nights} ${model.nights === 1 ? 'notte' : 'notti'} · ${model.guestsCount} ospiti`, X_AMOUNT, y, { width: X_RIGHT - X_AMOUNT, align: 'right' })
    y = doc.y + 8; rule(y); y += 10

    // ── Totale (+ acconto/saldo per la conferma) ──
    const totalRow = (label: string, value: string, bold: boolean) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor(INK)
      doc.text(label, 250, y, { width: X_AMOUNT - 250 - 8 })
      doc.text(value, X_AMOUNT, y, { width: X_RIGHT - X_AMOUNT, align: 'right' })
      y = doc.y + 6
    }
    totalRow('TOTALE SOGGIORNO', eur(model.totalCents), true)
    if (model.depositCents != null) { totalRow('Acconto versato', eur(model.depositCents), false); totalRow('Saldo all’arrivo', eur(model.balanceCents ?? 0), false) }
    y += 6

    // ── Note / condizioni ──
    doc.font('Helvetica').fontSize(8).fillColor(MUTE)
    doc.text(model.cityTaxNote, X0, y, { width: X_RIGHT - X0 }); y = doc.y + 4
    for (const c of model.conditions) { doc.text(c, X0, y, { width: X_RIGHT - X0 }); y = doc.y + 2 }
    y += 14

    // ── Firma ──
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(model.config.signerName, X0, y)
    doc.font('Helvetica').fontSize(9).fillColor(MUTE).text(model.config.brandName, X0, doc.y + 1)
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(INK).text(`Grazie per aver scelto ${model.config.brandName.split(' ')[0]} — Vi aspettiamo a Firenze!`, X0, doc.y + 8)

    // ── Footer legale (in fondo pagina, 3 righe a 7pt entro il margine inferiore) ──
    const c = model.config
    const footerY = 748
    rule(footerY - 8)
    doc.font('Helvetica').fontSize(7).fillColor(MUTE)
    doc.text(`${c.legalName}  ·  ${c.vat}  ·  ${c.taxCode}  ·  ${c.rea}`, X0, footerY, { width: X_RIGHT - X0, align: 'center' })
    doc.text(`${c.legalAddress}  ·  ${c.propertyAddress}`, X0, doc.y + 1, { width: X_RIGHT - X0, align: 'center' })
    doc.text(`${c.pec}  ·  ${c.email}  ·  ${c.phone}`, X0, doc.y + 1, { width: X_RIGHT - X0, align: 'center' })

    doc.end()
  })
}
