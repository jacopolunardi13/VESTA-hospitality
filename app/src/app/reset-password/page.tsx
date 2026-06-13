import { resetPassword } from './actions'

const ERROR_MESSAGES: Record<string, string> = {
  missing_password: 'Inserisci la nuova password.',
  password_too_short: 'La password deve essere di almeno 8 caratteri.',
  update_failed: 'Errore durante il cambio password. Riprova o richiedi un nuovo link.',
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? 'Si è verificato un errore.') : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold text-slate-900">Nuova password</h1>
        <p className="mb-6 text-sm text-slate-500">AI Concierge &amp; Direct Quote</p>

        {errorMessage && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        <form className="flex flex-col gap-4">
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Nuova password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              autoFocus
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </div>
          <button
            formAction={resetPassword}
            className="mt-2 w-full rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
          >
            Aggiorna password
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          <a href="/login" className="font-medium text-slate-900 hover:underline">
            Torna al login
          </a>
        </p>
      </div>
    </div>
  )
}
