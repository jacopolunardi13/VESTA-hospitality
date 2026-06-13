import { login, signup, forgotPassword } from './actions'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email o password non corretti.',
  missing_fields: 'Compila tutti i campi obbligatori.',
  email_taken: 'Esiste già un account con questa email.',
  signup_failed: 'Errore durante la registrazione. Riprova.',
  session_expired: 'La sessione è scaduta. Richiedi un nuovo link di recupero.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string; confirmed?: string; sent?: string; reset?: string }>
}) {
  const { error, mode, confirmed, sent, reset } = await searchParams
  const isSignup = mode === 'signup'
  const isForgot = mode === 'forgot'
  const isConfirmed = confirmed === '1'
  const isSent = sent === '1'
  const isReset = reset === '1'
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? 'Si è verificato un errore.') : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold text-slate-900">
          {isSignup ? 'Crea un account' : isForgot ? 'Recupera password' : 'Accedi'}
        </h1>
        <p className="mb-6 text-sm text-slate-500">AI Concierge &amp; Direct Quote</p>

        {isReset && !errorMessage && (
          <p className="mb-4 rounded-md bg-green-50 px-3 py-3 text-sm text-green-800">
            Password aggiornata. Accedi con le nuove credenziali.
          </p>
        )}

        {errorMessage && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        {isSignup && isConfirmed ? (
          <>
            <p className="rounded-md bg-green-50 px-3 py-3 text-sm text-green-800">
              Registrazione completata. Controlla la tua email per confermare l&apos;account e iniziare.
            </p>
            <p className="mt-4 text-center text-sm text-slate-500">
              <a href="/login" className="font-medium text-slate-900 hover:underline">
                Torna al login
              </a>
            </p>
          </>
        ) : isSignup ? (
          <>
            <form className="flex flex-col gap-4">
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                />
              </div>
              <button
                formAction={signup}
                className="mt-2 w-full rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
              >
                Registrati
              </button>
            </form>
            <p className="mt-4 text-center text-sm text-slate-500">
              Hai già un account?{' '}
              <a href="/login" className="font-medium text-slate-900 hover:underline">
                Accedi
              </a>
            </p>
          </>
        ) : isForgot && isSent ? (
          <>
            <p className="rounded-md bg-green-50 px-3 py-3 text-sm text-green-800">
              Se l&apos;indirizzo è registrato, riceverai un link per reimpostare la password.
            </p>
            <p className="mt-4 text-center text-sm text-slate-500">
              <a href="/login" className="font-medium text-slate-900 hover:underline">
                Torna al login
              </a>
            </p>
          </>
        ) : isForgot ? (
          <>
            <form className="flex flex-col gap-4">
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                />
              </div>
              <button
                formAction={forgotPassword}
                className="mt-2 w-full rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
              >
                Invia link di recupero
              </button>
            </form>
            <p className="mt-4 text-center text-sm text-slate-500">
              <a href="/login" className="font-medium text-slate-900 hover:underline">
                Torna al login
              </a>
            </p>
          </>
        ) : (
          <>
            <form className="flex flex-col gap-4">
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                />
              </div>
              <button
                formAction={login}
                className="mt-2 w-full rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
              >
                Accedi
              </button>
            </form>
            <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
              <a href="/login?mode=forgot" className="hover:underline">
                Password dimenticata?
              </a>
              <a href="/login?mode=signup" className="font-medium text-slate-900 hover:underline">
                Registrati
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
