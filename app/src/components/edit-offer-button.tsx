"use client";

import { useState } from "react";
import type { BookingStatus } from "@/lib/mock/types";

// L'offerta è modificabile finché la camera non è bloccata (pricing dinamico).
const editableStatuses: BookingStatus[] = [
  "received",
  "proposal_sent",
  "interested",
  "to_verify",
];

export default function EditOfferButton({ status }: { status: BookingStatus }) {
  const [notice, setNotice] = useState(false);
  const editable = editableStatuses.includes(status);

  if (!editable) {
    return (
      <p className="text-xs text-slate-400">
        Prezzo non più modificabile dopo il blocco camera.
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setNotice(true)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
      >
        ✎ Modifica prezzo/offerta
      </button>
      {notice && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Demo con dati mock: la modifica di prezzo, sconto e validità (con audit in
          timeline) sarà attiva con il collegamento al database.
        </p>
      )}
    </div>
  );
}
