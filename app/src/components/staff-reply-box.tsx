"use client";

import { useState } from "react";

export default function StaffReplyBox({ disabled }: { disabled?: boolean }) {
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const demoNotice = () =>
    setNotice("Demo con dati mock: l'invio sarà attivo con il collegamento al database.");

  if (disabled) {
    return (
      <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-500">
        Conversazione chiusa.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Rispondi come staff
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Scrivi la risposta…"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={demoNotice}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Invia
        </button>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={demoNotice}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          ✓ Chiudi conversazione
        </button>
        <button
          type="button"
          onClick={demoNotice}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          ↩ Restituisci all&apos;AI
        </button>
      </div>
      {notice && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{notice}</p>
      )}
    </div>
  );
}
