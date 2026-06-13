import Link from "next/link";
import { notFound } from "next/navigation";
import { getBookingRequest, getConversation } from "@/lib/mock/data";
import { actorLabels, scoringEventLabels, bookingStatusLabels } from "@/lib/labels";
import {
  formatDate,
  formatDateRange,
  formatDateTime,
  formatEuro,
  formatGuests,
} from "@/lib/format";
import { ReliabilityChip, ScoreBadge, SourceChip, StatusBadge } from "@/components/badges";
import EditOfferButton from "@/components/edit-offer-button";
import RequestActions from "@/components/request-actions";
import { nextActionLabels, priceSourceLabels } from "@/lib/labels";

export default async function BookingRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = getBookingRequest(id);
  if (!request) notFound();

  const conversation = request.conversationId
    ? getConversation(request.conversationId)
    : undefined;

  const nextAction = nextActionLabels[request.status];
  const guestSavingCents = request.otaPriceCents - request.offerTotalCents;
  const guestSavingPct = Math.round((guestSavingCents / request.otaPriceCents) * 100);
  const otaCommissionCents = Math.round(
    (request.otaPriceCents * request.otaCommissionPct) / 100
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/inbox" className="text-sm text-slate-500 hover:text-slate-800">
          ← Inbox
        </Link>
      </div>

      {/* Intestazione */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">
          Richiesta {request.code} · {request.guestName ?? request.guestContact ?? "Ospite"}
        </h1>
        <ScoreBadge score={request.leadScore} priority={request.priority} />
        <StatusBadge status={request.status} />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
        {request.offerExpiresAt && ["proposal_sent", "interested"].includes(request.status) && (
          <span className="font-medium text-indigo-700">
            ⏱ offerta valida fino al {formatDateTime(request.offerExpiresAt)}
          </span>
        )}
        {request.holdExpiresAt && request.status === "awaiting_payment" && (
          <span className="font-medium text-purple-700">
            ⏱ disponibilità bloccata fino al {formatDateTime(request.holdExpiresAt)}
          </span>
        )}
        <span>creata il {formatDateTime(request.createdAt)}</span>
      </div>

      {/* Prossima azione — sempre in evidenza */}
      {nextAction ? (
        <div className="flex items-center gap-3 rounded-lg bg-red-600 px-4 py-3 text-white">
          <span className="text-xl" aria-hidden>
            ⚡
          </span>
          <span className="text-xs font-bold tracking-wide uppercase opacity-80">
            Prossima azione
          </span>
          <span className="text-base font-bold">{nextAction}</span>
        </div>
      ) : request.status === "proposal_sent" ? (
        <div className="flex items-center gap-3 rounded-lg bg-indigo-50 px-4 py-3 text-indigo-900">
          <span aria-hidden>⏳</span>
          <span className="text-sm font-medium">
            In attesa dell&apos;ospite — nessuna azione richiesta ora.
          </span>
        </div>
      ) : null}

      {/* Dati richiesta + proposta */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Dati richiesta
          </h2>
          <dl className="flex flex-col gap-2 text-sm text-slate-700">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Soggiorno</dt>
              <dd className="font-medium">
                {formatDateRange(request.checkIn, request.checkOut)} ({request.nights} notti)
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Ospiti</dt>
              <dd className="font-medium">{formatGuests(request.adults, request.children)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Lingua</dt>
              <dd className="font-medium uppercase">{request.language}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Contatto</dt>
              <dd className="font-medium">{request.guestContact ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Source</dt>
              <dd>
                <SourceChip source={request.source} />
              </dd>
            </div>
            {request.specialRequests && (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Richieste speciali</dt>
                <dd className="text-right font-medium">{request.specialRequests}</dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Affidabilità dati</dt>
              <dd>
                <ReliabilityChip reliability={request.reliability} />
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Proposta
          </h2>
          <p className="mb-2 text-sm font-medium text-slate-900">{request.roomName}</p>
          <dl className="flex flex-col gap-1.5 text-sm text-slate-700">
            <div className="flex justify-between">
              <dt className="text-slate-500">Prezzo su Booking (stima)</dt>
              <dd className="text-slate-400 line-through">
                {formatEuro(request.otaPriceCents)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Prezzo listino diretto</dt>
              <dd>{formatEuro(request.grossTotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Sconto diretto −{request.discountPct}%</dt>
              <dd className="text-green-700">
                −{formatEuro(request.grossTotalCents - request.offerTotalCents)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold text-slate-900">
              <dt>Totale offerta</dt>
              <dd>{formatEuro(request.offerTotalCents)}</dd>
            </div>
            <div className="flex justify-between text-sm font-medium text-green-700">
              <dt>Risparmio ospite vs Booking</dt>
              <dd>
                −{formatEuro(guestSavingCents)} (−{guestSavingPct}%)
              </dd>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <dt>Tassa di soggiorno (in loco)</dt>
              <dd>{formatEuro(request.cityTaxCents)}</dd>
            </div>
          </dl>

          {/* Economia per la struttura */}
          <div className="mt-3 rounded-md bg-green-50 px-3 py-2.5">
            <p className="text-xs font-semibold tracking-wide text-green-800 uppercase">
              💶 Per la struttura
            </p>
            <dl className="mt-1.5 flex flex-col gap-1 text-sm text-green-900">
              <div className="flex justify-between">
                <dt>Commissione OTA evitata (~{request.otaCommissionPct}%)</dt>
                <dd className="font-semibold">{formatEuro(otaCommissionCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Valore prenotazione diretta</dt>
                <dd className="font-semibold">{formatEuro(request.offerTotalCents)}</dd>
              </div>
            </dl>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-slate-500">
              Dettaglio per notte ({request.items.length} righe)
            </summary>
            <ul className="mt-2 flex flex-col gap-1 text-xs text-slate-600">
              {request.items.map((item, i) => (
                <li key={i} className="flex justify-between">
                  <span>
                    {formatDate(item.date)} · {item.roomName}
                  </span>
                  <span>{formatEuro(item.priceCents)}</span>
                </li>
              ))}
            </ul>
          </details>

        </section>
      </div>

      {/* Fonte tariffa · Disponibilità · Suggerimento AI */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Box 1 — Fonte tariffa (pricing dinamico: snapshot, non listino) */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            🏷 Fonte tariffa
          </h2>
          <dl className="flex flex-col gap-2 text-sm text-slate-700">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Origine prezzo</dt>
              <dd className="font-medium">{priceSourceLabels[request.priceSource]}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Ultimo aggiornamento</dt>
              <dd
                className={`font-medium ${
                  request.reliability === "high" ? "" : "text-amber-700"
                }`}
              >
                {formatDateTime(request.ratesUpdatedAt)}
                {request.reliability !== "high" && " ⚠"}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-slate-500">Promozioni attive</dt>
              <dd className="font-medium">
                {request.activePromotions.length === 0 ? (
                  <span className="text-slate-400">Nessuna</span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {request.activePromotions.map((p) => (
                      <li
                        key={p}
                        className="rounded bg-orange-50 px-2 py-1 text-xs font-medium text-orange-800"
                      >
                        🏁 {p}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Modifica manuale staff</dt>
              <dd className="font-medium">
                {request.staffModifiedOffer ? (
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                    ✎ Sì
                  </span>
                ) : (
                  <span className="text-slate-400">No</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Affidabilità</dt>
              <dd>
                <ReliabilityChip reliability={request.reliability} />
              </dd>
            </div>
          </dl>
          <div className="mt-3 border-t border-slate-200 pt-3">
            <EditOfferButton status={request.status} />
          </div>
        </section>

        {/* Box 2 — Disponibilità struttura */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            🛏 Disponibilità struttura
          </h2>
          <dl className="flex flex-col gap-2 text-sm text-slate-700">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Camere libere per le date</dt>
              <dd className="font-semibold">
                {request.availability.roomsFree} di {request.availability.roomsTotal}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Camere occupate</dt>
              <dd className="font-medium">
                {request.availability.roomsTotal - request.availability.roomsFree}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-slate-500">Camera proposta</dt>
              <dd className="font-medium">
                {request.roomName}{" "}
                {request.availability.proposedRoomAvailable ? (
                  <span className="font-semibold text-green-700">✓ disponibile</span>
                ) : (
                  <span className="font-semibold text-red-700">✗ non disponibile</span>
                )}
              </dd>
            </div>
          </dl>
          {request.availability.lastRoomAvailable && (
            <p className="mt-3 rounded-md bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900">
              🔥 Ultima camera disponibile per queste date
            </p>
          )}
        </section>

        {/* Box 3 — Suggerimento AI (mock) */}
        <section className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-indigo-700">
            🤖 Suggerimento AI
            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
              MOCK
            </span>
          </h2>
          <p className="text-sm text-slate-700">{request.aiSuggestion.reasoning}</p>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Probabilità di conversione</span>
              <span className="text-sm font-bold text-indigo-800">
                {request.aiSuggestion.conversionProbability}%
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-indigo-100">
              <div
                className={`h-full rounded-full ${
                  request.aiSuggestion.conversionProbability >= 70
                    ? "bg-green-500"
                    : request.aiSuggestion.conversionProbability >= 40
                      ? "bg-amber-400"
                      : "bg-red-400"
                }`}
                style={{ width: `${request.aiSuggestion.conversionProbability}%` }}
              />
            </div>
          </div>
          <p className="mt-3 rounded-md bg-white px-3 py-2 text-sm text-slate-700">
            💡{" "}
            {request.aiSuggestion.priceAdvice ?? (
              <span className="text-slate-400">
                Nessuna modifica di prezzo consigliata.
              </span>
            )}
          </p>
        </section>
      </div>

      {/* Azioni */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Azioni
        </h2>
        <RequestActions status={request.status} />
      </section>

      {/* Timeline + score */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Timeline (audit)
          </h2>
          <ul className="flex flex-col gap-2.5 text-sm">
            {request.events.map((e, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-28 shrink-0 text-xs text-slate-400">
                  {formatDateTime(e.at)}
                </span>
                <span className="w-14 shrink-0 text-xs font-medium text-slate-500">
                  {actorLabels[e.actor]}
                </span>
                <span className="text-slate-700">
                  {e.fromStatus ? `${bookingStatusLabels[e.fromStatus]} → ` : ""}
                  <strong>{bookingStatusLabels[e.toStatus]}</strong>
                  {e.note && <span className="block text-xs text-slate-400">{e.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Score (trasparenza)
            </h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {request.scoring.map((s, i) => (
                <li key={i} className="flex justify-between text-slate-700">
                  <span>{scoringEventLabels[s.event] ?? s.event}</span>
                  <span className={s.delta >= 0 ? "font-medium text-green-700" : "font-medium text-red-600"}>
                    {s.delta >= 0 ? "+" : ""}
                    {s.delta}
                  </span>
                </li>
              ))}
              <li className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
                <span>Lead score</span>
                <span>{request.leadScore}</span>
              </li>
            </ul>
          </section>

          {conversation && (
            <Link
              href={`/conversations/${conversation.id}`}
              className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50"
            >
              💬 Vai alla conversazione →
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Ultimo messaggio: “{conversation.lastMessagePreview}”
              </span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
