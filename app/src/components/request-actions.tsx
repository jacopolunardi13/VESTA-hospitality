"use client";

import { useState } from "react";
import type { BookingStatus } from "@/lib/mock/types";

// Azioni disponibili per stato (macchina a stati, ui-mvp-plan §7).
const actionsByStatus: Record<BookingStatus, { label: string; primary?: boolean; danger?: boolean }[]> = {
  received: [
    { label: "📤 Invia proposta", primary: true },
    { label: "✖ Rifiuta", danger: true },
  ],
  proposal_sent: [
    { label: "✋ Segna interessato", primary: true },
    { label: "✖ Rifiuta", danger: true },
  ],
  interested: [
    { label: "🔍 Verifica disponibilità", primary: true },
    { label: "✖ Rifiuta", danger: true },
  ],
  to_verify: [
    { label: "🔒 Blocca disponibilità", primary: true },
    { label: "✖ Rifiuta", danger: true },
  ],
  availability_blocked: [
    { label: "💰 Richiedi pagamento", primary: true },
    { label: "✖ Rifiuta", danger: true },
  ],
  awaiting_payment: [
    { label: "✅ Pagamento ricevuto → Conferma", primary: true },
    { label: "✖ Rifiuta", danger: true },
  ],
  confirmed: [],
  expired: [{ label: "↩ Riapri (con nota)" }],
  rejected: [],
  cancelled: [],
};

export default function RequestActions({ status }: { status: BookingStatus }) {
  const [notice, setNotice] = useState<string | null>(null);
  const actions = actionsByStatus[status];

  if (actions.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Nessuna azione disponibile per questo stato.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() =>
              setNotice(`Demo con dati mock: l'azione «${a.label.replace(/^[^\w]+\s*/, "")}» sarà attiva con il collegamento al database.`)
            }
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              a.primary
                ? "bg-slate-900 text-white hover:bg-slate-700"
                : a.danger
                  ? "border border-red-200 text-red-700 hover:bg-red-50"
                  : "border border-slate-300 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
      {notice && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {notice}
        </p>
      )}
    </div>
  );
}
