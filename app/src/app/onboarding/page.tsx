import { createOrg, createProperty, finalizeOnboarding } from './actions'

const ERROR_MESSAGES: Record<string, string> = {
  missing_name: "Il nome dell'organizzazione è obbligatorio.",
  create_org_failed: "Errore durante la creazione dell'organizzazione. Riprova.",
  enroll_failed: "Errore critico durante la configurazione dell'account. Contatta il supporto.",
  missing_fields: 'Compila tutti i campi obbligatori.',
  create_property_failed: 'Errore durante la creazione della struttura. Riprova.',
  finalize_failed: 'Errore durante il salvataggio delle impostazioni. Riprova.',
}

const TIMEZONES = [
  'Europe/Rome',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Amsterdam',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Tokyo',
]

const LANGUAGES = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
]

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{
    step?: string
    org_id?: string
    property_id?: string
    error?: string
  }>
}) {
  const { step: stepParam, org_id, property_id, error } = await searchParams

  let step = parseInt(stepParam ?? '1', 10)
  if (isNaN(step) || step < 1 || step > 3) step = 1
  if (step === 2 && !org_id) step = 1
  if (step === 3 && (!org_id || !property_id)) step = 1

  const errorMessage = error ? (ERROR_MESSAGES[error] ?? 'Si è verificato un errore. Riprova.') : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Step {step} di 3
          </p>
          <h1 className="text-lg font-semibold text-slate-900">
            {step === 1 && 'La tua attività'}
            {step === 2 && 'La tua prima struttura'}
            {step === 3 && 'Impostazioni iniziali'}
          </h1>
          {step === 3 && (
            <p className="mt-1 text-sm text-slate-500">Modificabili in qualsiasi momento dalle impostazioni.</p>
          )}
        </div>

        {errorMessage && (
          <p className="mb-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
        )}

        {step === 1 && (
          <form className="flex flex-col gap-4">
            <div>
              <label htmlFor="org-name" className="mb-1 block text-sm font-medium text-slate-700">
                Nome organizzazione
              </label>
              <input
                id="org-name"
                name="name"
                type="text"
                required
                autoFocus
                placeholder="es. Villa Rossi"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
              />
            </div>
            <button
              formAction={createOrg}
              className="mt-2 w-full rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
            >
              Continua
            </button>
          </form>
        )}

        {step === 2 && org_id && (
          <form className="flex flex-col gap-4">
            <input type="hidden" name="org_id" value={org_id} />

            <div>
              <label htmlFor="prop-name" className="mb-1 block text-sm font-medium text-slate-700">
                Nome struttura <span className="text-red-500">*</span>
              </label>
              <input
                id="prop-name"
                name="name"
                type="text"
                required
                autoFocus
                placeholder="es. B&B Il Giardino"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="prop-city" className="mb-1 block text-sm font-medium text-slate-700">
                  Città
                </label>
                <input
                  id="prop-city"
                  name="city"
                  type="text"
                  placeholder="es. Firenze"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="prop-tz" className="mb-1 block text-sm font-medium text-slate-700">
                  Timezone
                </label>
                <select
                  id="prop-tz"
                  name="timezone"
                  defaultValue="Europe/Rome"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="prop-lang" className="mb-1 block text-sm font-medium text-slate-700">
                Lingua principale
              </label>
              <select
                id="prop-lang"
                name="default_language"
                defaultValue="it"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
              >
                {LANGUAGES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="mt-2 flex gap-3">
              <a
                href="/onboarding"
                className="flex-1 rounded-md border border-slate-300 py-2.5 text-center text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Indietro
              </a>
              <button
                formAction={createProperty}
                className="flex-1 rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
              >
                Continua
              </button>
            </div>
          </form>
        )}

        {step === 3 && org_id && property_id && (
          <form className="flex flex-col gap-4">
            <input type="hidden" name="org_id" value={org_id} />
            <input type="hidden" name="property_id" value={property_id} />

            <div>
              <label htmlFor="discount-pct" className="mb-1 block text-sm font-medium text-slate-700">
                Sconto diretto
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="discount-pct"
                  name="direct_discount_pct"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue="10"
                  className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                />
                <span className="text-sm text-slate-500">%</span>
              </div>
            </div>

            <div>
              <label htmlFor="hold-hours" className="mb-1 block text-sm font-medium text-slate-700">
                Blocco disponibilità
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="hold-hours"
                  name="hold_hours"
                  type="number"
                  min="1"
                  defaultValue="24"
                  className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                />
                <span className="text-sm text-slate-500">ore</span>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Supervisione proposte AI</p>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="supervision_mode"
                    value="true"
                    defaultChecked
                    className="accent-slate-900"
                  />
                  Sì
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="supervision_mode"
                    value="false"
                    className="accent-slate-900"
                  />
                  No
                </label>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Con supervisione attiva le proposte AI richiedono conferma prima dell&apos;invio.
              </p>
            </div>

            <div className="mt-2 flex gap-3">
              <a
                href={`/onboarding?step=2&org_id=${org_id}`}
                className="flex-1 rounded-md border border-slate-300 py-2.5 text-center text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Indietro
              </a>
              <button
                formAction={finalizeOnboarding}
                className="flex-1 rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
              >
                Inizia
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
