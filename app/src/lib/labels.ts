// Etichette italiane per i valori interni (inglesi) — decisione 12/06/2026.
import type {
  BookingStatus,
  ConversationStatus,
  EventActor,
  PriceSource,
  Priority,
  Reliability,
  Sender,
  Source,
} from "@/lib/mock/types";

export const bookingStatusLabels: Record<BookingStatus, string> = {
  received: "Richiesta ricevuta",
  proposal_sent: "Proposta inviata",
  interested: "Interessato",
  to_verify: "Da verificare",
  availability_blocked: "Disponibilità bloccata",
  awaiting_payment: "In attesa di pagamento",
  confirmed: "Confermata",
  expired: "Scaduta",
  rejected: "Rifiutata",
  cancelled: "Cancellata",
};

export const priorityLabels: Record<Priority, string> = {
  high: "Alta",
  medium: "Media",
  low: "Bassa",
};

// Affidabilità prezzo/disponibilità a 3 livelli (pricing dinamico).
export const reliabilityLabels: Record<Reliability, string> = {
  high: "Alta",
  medium: "Da verificare",
  low: "Critica",
};

export const sourceLabels: Record<Source, string> = {
  website_chat: "Web chat",
  website_form: "Form sito",
  manual: "Manuale",
};

export const conversationStatusLabels: Record<ConversationStatus, string> = {
  open: "Aperta",
  pending_staff: "In attesa staff",
  closed: "Chiusa",
};

export const senderLabels: Record<Sender, string> = {
  guest: "Ospite",
  ai: "AI",
  staff: "Staff",
};

export const actorLabels: Record<EventActor, string> = {
  system: "Sistema",
  staff: "Staff",
  guest: "Ospite",
};

export const priceSourceLabels: Record<PriceSource, string> = {
  manual: "manuale (struttura)",
  csv: "import CSV",
  ical: "feed iCal",
  api: "API",
  ota_estimated: "stima OTA",
};

/** Prossima azione dello staff per stato (null = nessuna azione attesa). */
export const nextActionLabels: Record<BookingStatus, string | null> = {
  received: "Invia proposta",
  proposal_sent: null, // in attesa dell'ospite
  interested: "Verifica disponibilità",
  to_verify: "Blocca camera",
  availability_blocked: "Richiedi pagamento",
  awaiting_payment: "Verifica pagamento",
  confirmed: null,
  expired: null,
  rejected: null,
  cancelled: null,
};

export const scoringEventLabels: Record<string, string> = {
  interested_click: "Click «Sono interessato»",
  reply_received: "Risposta ricevuta",
  dates_close: "Date ravvicinate",
  contact_provided: "Contatto fornito",
  high_season_dates: "Date alta stagione",
  mid_season_dates: "Date media stagione",
  family_stay: "Soggiorno famiglia",
  group_stay: "Soggiorno gruppo",
  single_night: "Notte singola",
  stale_rates_penalty: "Tariffe non aggiornate",
  no_reply_penalty: "Nessuna risposta",
  phone_lead: "Lead telefonico",
  payment_received: "Pagamento ricevuto",
};
