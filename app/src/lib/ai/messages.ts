// Messaggi del flusso commerciale, localizzati nelle 5 lingue pilota (it/en/es/fr/de).
// La lingua è quella già rilevata dal sistema (conversations.language / extract).

export type Lang = 'it' | 'en' | 'es' | 'fr' | 'de'
const LANGS: Lang[] = ['it', 'en', 'es', 'fr', 'de']
export function normLang(l: string | null | undefined): Lang {
  const x = (l ?? 'it').slice(0, 2).toLowerCase()
  return (LANGS as string[]).includes(x) ? (x as Lang) : 'it'
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// ── Rilevamento "cliente interessato" (fase 2) ──
const INTEREST = /\b(si|sì|yes|ja|oui|claro|d'accordo|ok|okay)\b.*\b(interess|proceder|prenot|conferm|book|reserv|confirm)|vorrei procedere|voglio (procedere|confermare|prenotare)|come (posso )?(prenot|conferm)|i('?d| would)? like to proceed|how (can i|do i) book|i want to (confirm|proceed|book)|quiero (proceder|confirmar|reservar)|como (puedo )?reserv|je (voudrais|veux) (proceder|confirmer|reserver)|comment (puis-je |)?reserv|ich (mochte|will) (fortfahren|buchen|bestatigen)|wie (kann ich |)?buch/i
export function isInterest(message: string): boolean {
  return INTEREST.test(norm(message))
}

// ── Rilevamento "pagamento effettuato / contabile inviata" (fase 3) ──
const PAYMENT = /ho pagato|pagamento (fatto|effettuat|eseguit)|bonifico (fatto|effettuat|eseguit|inviat)|(invia|allego|ecco|mando).*(contabile|ricevut|bonifico|screenshot|pagament)|i('?ve| have)? paid|payment (done|made|sent|completed)|(sent|here).*(receipt|transfer|screenshot)|he pagado|pago (hecho|realizad|efectuad)|(envi|aqui|adjunto).*(comprobante|recibo|justificante)|j'?ai paye|virement (effectue|fait|envoye)|(voici|envoye|joint).*(recu|justificatif|preuve)|ich habe bezahlt|uberweisung (getatigt|erledigt|gesendet)|(hier|gesendet|anbei).*(beleg|nachweis|quittung)/i
export function isPaymentClaim(message: string): boolean {
  return PAYMENT.test(norm(message))
}

// ── Fase 1: proposta (semplice, naturale, niente sconto/tassa/validità) ──
export function proposalText(lang: Lang, room: string, amountEur: number): string {
  const a = String(amountEur)
  const T: Record<Lang, string> = {
    it: `Grazie per la sua richiesta.\n\nPer il soggiorno richiesto possiamo proporle la Camera ${room} al prezzo di €${a} per l'intero soggiorno, colazione inclusa.\n\nSe desidera procedere con la prenotazione, sarò lieto di fornirle le istruzioni per la conferma.`,
    en: `Thank you for your request.\n\nFor your stay we can offer you Room ${room} at €${a} for the entire stay, breakfast included.\n\nIf you would like to proceed with the booking, I will gladly provide the instructions to confirm.`,
    es: `Gracias por su solicitud.\n\nPara su estancia podemos ofrecerle la Habitación ${room} por €${a} por toda la estancia, desayuno incluido.\n\nSi desea proceder con la reserva, estaré encantado de facilitarle las instrucciones para confirmar.`,
    fr: `Merci pour votre demande.\n\nPour votre séjour, nous pouvons vous proposer la Chambre ${room} au prix de €${a} pour l'ensemble du séjour, petit-déjeuner inclus.\n\nSi vous souhaitez procéder à la réservation, je serai ravi de vous fournir les instructions pour la confirmation.`,
    de: `Vielen Dank für Ihre Anfrage.\n\nFür Ihren Aufenthalt können wir Ihnen das Zimmer ${room} zum Preis von €${a} für den gesamten Aufenthalt anbieten, Frühstück inklusive.\n\nWenn Sie mit der Buchung fortfahren möchten, stelle ich Ihnen gerne die Anweisungen zur Bestätigung bereit.`,
  }
  return T[lang]
}

export interface BankDetails { holder: string; iban: string; branch: string; causal: string }

// ── Fase 2: istruzioni di pagamento (bonifico anticipato, riserva 24h) ──
export function paymentInstructions(lang: Lang, b: BankDetails): string {
  const labels: Record<Lang, { holder: string; branch: string; causal: string }> = {
    it: { holder: 'Intestatario', branch: 'Filiale', causal: 'Causale' },
    en: { holder: 'Account holder', branch: 'Branch', causal: 'Reference' },
    es: { holder: 'Titular', branch: 'Sucursal', causal: 'Concepto' },
    fr: { holder: 'Titulaire', branch: 'Agence', causal: 'Motif' },
    de: { holder: 'Kontoinhaber', branch: 'Filiale', causal: 'Verwendungszweck' },
  }
  const L = labels[lang]
  const bank = `${L.holder}: ${b.holder}\nIBAN: ${b.iban}\n${L.branch}: ${b.branch}\n${L.causal}: ${b.causal}`
  const body: Record<Lang, string> = {
    it: `Perfetto.\n\nPer confermare la prenotazione è previsto il pagamento anticipato tramite bonifico bancario.\n\nLa camera verrà riservata per 24 ore in attesa del pagamento.\n\n${bank}\n\nUna volta effettuato il bonifico, le chiediamo gentilmente di inviarci la contabile oppure uno screenshot completo del pagamento.\n\nDopo la verifica da parte del nostro staff, riceverà la conferma definitiva della prenotazione.\n\nGrazie e per qualsiasi necessità non esiti a contattarci.\n\nJacopo\nLunArt`,
    en: `Perfect.\n\nTo confirm the booking, advance payment by bank transfer is required.\n\nThe room will be reserved for 24 hours pending payment.\n\n${bank}\n\nOnce the transfer is made, please kindly send us the receipt or a full screenshot of the payment.\n\nAfter verification by our staff, you will receive the final booking confirmation.\n\nThank you, and please do not hesitate to contact us for anything you need.\n\nJacopo\nLunArt`,
    es: `Perfecto.\n\nPara confirmar la reserva se requiere el pago anticipado mediante transferencia bancaria.\n\nLa habitación se reservará durante 24 horas a la espera del pago.\n\n${bank}\n\nUna vez realizada la transferencia, le rogamos que nos envíe el comprobante o una captura completa del pago.\n\nTras la verificación por parte de nuestro personal, recibirá la confirmación definitiva de la reserva.\n\nGracias y no dude en contactarnos para cualquier necesidad.\n\nJacopo\nLunArt`,
    fr: `Parfait.\n\nPour confirmer la réservation, un paiement anticipé par virement bancaire est requis.\n\nLa chambre sera réservée pendant 24 heures en attente du paiement.\n\n${bank}\n\nUne fois le virement effectué, merci de nous envoyer le reçu ou une capture d'écran complète du paiement.\n\nAprès vérification par notre personnel, vous recevrez la confirmation définitive de la réservation.\n\nMerci et n'hésitez pas à nous contacter pour tout besoin.\n\nJacopo\nLunArt`,
    de: `Perfekt.\n\nZur Bestätigung der Buchung ist eine Vorauszahlung per Banküberweisung erforderlich.\n\nDas Zimmer wird für 24 Stunden bis zum Zahlungseingang reserviert.\n\n${bank}\n\nNach Ausführung der Überweisung senden Sie uns bitte den Beleg oder einen vollständigen Screenshot der Zahlung.\n\nNach der Prüfung durch unser Team erhalten Sie die endgültige Buchungsbestätigung.\n\nVielen Dank, und zögern Sie nicht, uns bei Bedarf zu kontaktieren.\n\nJacopo\nLunArt`,
  }
  return body[lang]
}

// ── Fase 3: conferma ricezione comunicazione di pagamento (no auto-conferma) ──
export function paymentAck(lang: Lang): string {
  const T: Record<Lang, string> = {
    it: `Grazie. Abbiamo ricevuto la sua comunicazione di pagamento. Il nostro staff verificherà la contabile e le invierà la conferma definitiva della prenotazione al più presto.`,
    en: `Thank you. We have received your payment notification. Our staff will verify the receipt and send you the final booking confirmation as soon as possible.`,
    es: `Gracias. Hemos recibido su notificación de pago. Nuestro personal verificará el comprobante y le enviará la confirmación definitiva de la reserva lo antes posible.`,
    fr: `Merci. Nous avons bien reçu votre notification de paiement. Notre personnel vérifiera le reçu et vous enverra la confirmation définitive de la réservation dès que possible.`,
    de: `Vielen Dank. Wir haben Ihre Zahlungsmitteilung erhalten. Unser Team prüft den Beleg und sendet Ihnen so bald wie möglich die endgültige Buchungsbestätigung.`,
  }
  return T[lang]
}
