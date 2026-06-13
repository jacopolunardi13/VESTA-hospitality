// Tipi mock allineati allo schema (supabase/schema.sql).
// Valori interni in inglese (decisione 12/06/2026); etichette IT in lib/labels.ts.

export type BookingStatus =
  | "received"
  | "proposal_sent"
  | "interested"
  | "to_verify"
  | "availability_blocked"
  | "awaiting_payment"
  | "confirmed"
  | "expired"
  | "rejected"
  | "cancelled";

export type Priority = "high" | "medium" | "low";
export type Reliability = "high" | "medium" | "low";
export type Source = "website_chat" | "website_form" | "manual";
export type ConversationStatus = "open" | "pending_staff" | "closed";
export type PriceSource = "manual" | "csv" | "ical" | "api" | "ota_estimated";
export type Sender = "guest" | "ai" | "staff";
export type EventActor = "system" | "staff" | "guest";

export interface BookingItem {
  date: string; // ISO date
  roomName: string;
  priceCents: number;
}

export interface BookingEvent {
  at: string; // ISO datetime
  actor: EventActor;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  note?: string;
}

export interface ScoringEvent {
  event: string;
  delta: number;
}

export interface AvailabilityInfo {
  roomsTotal: number;
  roomsFree: number; // libere per le date richieste
  proposedRoomAvailable: boolean;
  lastRoomAvailable: boolean;
}

export interface AiSuggestion {
  reasoning: string;
  conversionProbability: number; // 0–100
  priceAdvice: string | null; // null = nessuna modifica consigliata
}

export interface BookingRequest {
  id: string;
  code: string; // es. BR-0042
  guestName: string | null;
  guestContact: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: { age: number }[];
  language: string;
  source: Source;
  status: BookingStatus;
  priority: Priority;
  leadScore: number;
  reliability: Reliability;
  specialRequests?: string;
  roomName: string;
  grossTotalCents: number;
  discountPct: number;
  offerTotalCents: number;
  cityTaxCents: number;
  currency: string;
  /** Prezzo stimato per lo stesso soggiorno su Booking/OTA (confronto). */
  otaPriceCents: number;
  /** Commissione OTA stimata (%) evitata prenotando diretto. */
  otaCommissionPct: number;
  offerExpiresAt?: string;
  holdExpiresAt?: string;
  priceSource: PriceSource;
  ratesUpdatedAt: string; // ultimo aggiornamento tariffe del range richiesto
  activePromotions: string[]; // promozioni attive sul prezzo (vuoto = nessuna)
  staffModifiedOffer: boolean; // prezzo/offerta ritoccati a mano dallo staff
  availability: AvailabilityInfo;
  aiSuggestion: AiSuggestion;
  conversationId?: string;
  createdAt: string;
  items: BookingItem[];
  events: BookingEvent[];
  scoring: ScoringEvent[];
}

export interface ChatMessage {
  id: string;
  sender: Sender;
  content: string;
  at: string;
  escalation?: boolean;
}

export interface Conversation {
  id: string;
  guestName: string | null;
  guestContact: string | null;
  source: Source;
  status: ConversationStatus;
  language: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  bookingRequestId?: string;
  messages: ChatMessage[];
}

export interface Property {
  id: string;
  name: string;
  city: string;
}
