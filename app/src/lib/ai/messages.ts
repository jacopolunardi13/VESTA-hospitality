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

// ── Flusso definitivo: opzione camera per il preventivo multi-camera ──
export interface RoomOption { roomId: string; name: string; description?: string | null; amountEur: number }

function roomLine(r: RoomOption, perStay: Record<Lang, string>, lang: Lang): string {
  const desc = r.description && r.description.trim() ? `\n  ${r.description.trim()}` : ''
  return `• ${r.name} — €${r.amountEur} ${perStay[lang]}${desc}`
}

// ── Passo 1: preventivo con TUTTE le camere disponibili (prezzo + descrizione) ──
export function proposalAllText(lang: Lang, rooms: RoomOption[]): string {
  const perStay: Record<Lang, string> = {
    it: "per l'intero soggiorno, colazione inclusa",
    en: 'for the entire stay, breakfast included',
    es: 'por toda la estancia, desayuno incluido',
    fr: "pour l'ensemble du séjour, petit-déjeuner inclus",
    de: 'für den gesamten Aufenthalt, Frühstück inklusive',
  }
  const intro: Record<Lang, string> = {
    it: 'Grazie per la sua richiesta. Per il soggiorno richiesto queste sono le camere disponibili:',
    en: 'Thank you for your request. For your stay, these are the available rooms:',
    es: 'Gracias por su solicitud. Para su estancia, estas son las habitaciones disponibles:',
    fr: 'Merci pour votre demande. Pour votre séjour, voici les chambres disponibles :',
    de: 'Vielen Dank für Ihre Anfrage. Für Ihren Aufenthalt sind dies die verfügbaren Zimmer:',
  }
  const outro: Record<Lang, string> = {
    it: 'Mi indichi quale camera preferisce e sarò lieto di guidarla nella prenotazione.',
    en: 'Let me know which room you prefer and I will gladly guide you through the booking.',
    es: 'Indíqueme qué habitación prefiere y estaré encantado de guiarle en la reserva.',
    fr: 'Indiquez-moi quelle chambre vous préférez et je vous guiderai volontiers dans la réservation.',
    de: 'Sagen Sie mir, welches Zimmer Sie bevorzugen, und ich begleite Sie gerne bei der Buchung.',
  }
  const list = rooms.map((r) => roomLine(r, perStay, lang)).join('\n\n')
  return `${intro[lang]}\n\n${list}\n\n${outro[lang]}`
}

// ── Passo 2: disambiguazione scelta camera ──
export function chooseRoomPrompt(lang: Lang, rooms: RoomOption[]): string {
  const names = rooms.map((r) => `${r.name} (€${r.amountEur})`).join('; ')
  const T: Record<Lang, string> = {
    it: `Per procedere, mi indichi quale camera preferisce tra: ${names}.`,
    en: `To proceed, please tell me which room you prefer among: ${names}.`,
    es: `Para continuar, indíqueme qué habitación prefiere entre: ${names}.`,
    fr: `Pour continuer, indiquez-moi quelle chambre vous préférez parmi : ${names}.`,
    de: `Um fortzufahren, sagen Sie mir bitte, welches Zimmer Sie bevorzugen: ${names}.`,
  }
  return T[lang]
}

// ── Passo 4: conferma cliente → richiesta inoltrata allo staff (NESSUN blocco/IBAN) ──
export function availabilityCheckAck(lang: Lang, roomName: string): string {
  const T: Record<Lang, string> = {
    it: `Grazie. Ho inoltrato la sua richiesta per la ${roomName} al nostro staff, che verificherà la disponibilità e le confermerà a breve. La camera non è ancora riservata: non effettui alcun pagamento finché non riceve la nostra conferma.`,
    en: `Thank you. I have forwarded your request for ${roomName} to our staff, who will verify availability and confirm shortly. The room is not yet reserved: please do not make any payment until you receive our confirmation.`,
    es: `Gracias. He remitido su solicitud de la ${roomName} a nuestro personal, que verificará la disponibilidad y le confirmará en breve. La habitación aún no está reservada: no realice ningún pago hasta recibir nuestra confirmación.`,
    fr: `Merci. J'ai transmis votre demande pour la ${roomName} à notre personnel, qui vérifiera la disponibilité et vous confirmera sous peu. La chambre n'est pas encore réservée : n'effectuez aucun paiement avant de recevoir notre confirmation.`,
    de: `Vielen Dank. Ich habe Ihre Anfrage für das ${roomName} an unser Team weitergeleitet, das die Verfügbarkeit prüft und Ihnen in Kürze bestätigt. Das Zimmer ist noch nicht reserviert: Bitte leisten Sie keine Zahlung, bevor Sie unsere Bestätigung erhalten.`,
  }
  return T[lang]
}

// ── Passo 5 (staff: non disponibile) → proposta alternative ──
export function alternativesText(lang: Lang, rooms: RoomOption[]): string {
  const perStay: Record<Lang, string> = {
    it: "per l'intero soggiorno, colazione inclusa",
    en: 'for the entire stay, breakfast included',
    es: 'por toda la estancia, desayuno incluido',
    fr: "pour l'ensemble du séjour, petit-déjeuner inclus",
    de: 'für den gesamten Aufenthalt, Frühstück inklusive',
  }
  const intro: Record<Lang, string> = {
    it: 'Ci dispiace, la camera scelta non è più disponibile per le date richieste. In alternativa possiamo proporle:',
    en: 'We are sorry, the chosen room is no longer available for your dates. As an alternative we can offer:',
    es: 'Lo sentimos, la habitación elegida ya no está disponible para sus fechas. Como alternativa podemos ofrecerle:',
    fr: "Nous sommes désolés, la chambre choisie n'est plus disponible pour vos dates. En alternative, nous pouvons vous proposer :",
    de: 'Es tut uns leid, das gewählte Zimmer ist für Ihre Daten nicht mehr verfügbar. Alternativ können wir Ihnen anbieten:',
  }
  const outro: Record<Lang, string> = {
    it: 'Mi faccia sapere se una di queste fa al caso suo.',
    en: 'Let me know if one of these works for you.',
    es: 'Dígame si alguna de estas le conviene.',
    fr: "Dites-moi si l'une d'elles vous convient.",
    de: 'Sagen Sie mir, ob eines davon für Sie passt.',
  }
  const list = rooms.map((r) => roomLine(r, perStay, lang)).join('\n\n')
  return `${intro[lang]}\n\n${list}\n\n${outro[lang]}`
}

// ── Passo 5 (staff: nessuna alternativa) ──
export function noAvailabilityText(lang: Lang): string {
  const T: Record<Lang, string> = {
    it: 'Ci dispiace, al momento non abbiamo altre camere disponibili per le date richieste. Il nostro staff la ricontatterà al più presto.',
    en: 'We are sorry, we currently have no other rooms available for your dates. Our staff will get back to you as soon as possible.',
    es: 'Lo sentimos, por el momento no tenemos otras habitaciones disponibles para sus fechas. Nuestro personal se pondrá en contacto con usted lo antes posible.',
    fr: "Nous sommes désolés, nous n'avons actuellement aucune autre chambre disponible pour vos dates. Notre personnel vous recontactera dès que possible.",
    de: 'Es tut uns leid, derzeit haben wir keine weiteren Zimmer für Ihre Daten verfügbar. Unser Team meldet sich so bald wie möglich bei Ihnen.',
  }
  return T[lang]
}

// ── Matcher scelta camera (parsing libero): numero → prezzo → tipo → "più economica" ──
function roomTypeKey(name: string): string | null {
  const parts = name.split(/[—\-]/)
  if (parts.length < 2) return null
  return norm(parts[parts.length - 1]).trim().split(/\s+/)[0] || null
}
export function matchRoomChoice(
  message: string,
  rooms: Array<{ roomId: string; name: string; amountEur: number }>
): Array<{ roomId: string; name: string; amountEur: number }> {
  const n = norm(message)
  const numberMatches = rooms.filter((r) => {
    const m = r.name.match(/\d{2,4}/)
    return !!m && new RegExp(`(^|\\D)${m[0]}(\\D|$)`).test(n)
  })
  if (numberMatches.length >= 1) return numberMatches
  const priceMatches = rooms.filter((r) => new RegExp(`(^|\\D)${r.amountEur}(\\D|$)`).test(n))
  if (priceMatches.length === 1) return priceMatches
  const typeMatches = rooms.filter((r) => { const t = roomTypeKey(r.name); return !!t && n.includes(t) })
  if (typeMatches.length >= 1) return typeMatches
  if (priceMatches.length > 1) return priceMatches
  if (/\b(economic\w*|meno car\w*|cheap\w*|barat\w*|prima|first|primera|premiere|erste|gunstig\w*|guenstig\w*)\b/.test(n)) {
    return rooms.length ? [rooms[0]] : []
  }
  return []
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
