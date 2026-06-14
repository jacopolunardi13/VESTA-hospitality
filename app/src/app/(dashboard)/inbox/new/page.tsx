import Link from 'next/link'
import { createRequest } from '../actions'

export default function NewRequestPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/inbox" className="text-sm text-slate-500 hover:text-slate-800">
          ← Inbox
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-slate-900">Nuova richiesta manuale</h1>

      <form
        action={createRequest}
        className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="guest_name">
              Nome ospite
            </label>
            <input
              id="guest_name"
              name="guest_name"
              type="text"
              placeholder="Mario Rossi"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="guest_contact">
              Contatto (tel / email)
            </label>
            <input
              id="guest_contact"
              name="guest_contact"
              type="text"
              placeholder="+39 333 ..."
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="check_in">
              Check-in
            </label>
            <input
              id="check_in"
              name="check_in"
              type="date"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="check_out">
              Check-out
            </label>
            <input
              id="check_out"
              name="check_out"
              type="date"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="adults">
              Adulti
            </label>
            <input
              id="adults"
              name="adults"
              type="number"
              min="1"
              defaultValue="2"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="special_requests">
            Richieste speciali
          </label>
          <textarea
            id="special_requests"
            name="special_requests"
            rows={3}
            placeholder="Es. piano alto, culla, allergie..."
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div className="flex justify-end gap-3">
          <Link
            href="/inbox"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Annulla
          </Link>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
          >
            Crea richiesta →
          </button>
        </div>
      </form>
    </div>
  )
}
