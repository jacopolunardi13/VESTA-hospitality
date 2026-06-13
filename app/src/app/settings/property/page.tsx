import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateAnagrafica, updateCommerciale, updateAI, updateProtezioni } from './actions'

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

const ERROR_MESSAGES: Record<string, string> = {
  anagrafica_missing_name: 'Il nome della struttura è obbligatorio.',
  anagrafica_update_failed: 'Errore durante il salvataggio. Riprova.',
  commerciale_update_failed: 'Errore durante il salvataggio. Riprova.',
  ai_update_failed: 'Errore durante il salvataggio. Riprova.',
  protezioni_update_failed: 'Errore durante il salvataggio. Riprova.',
}

function SectionBanner({ type, message }: { type: 'success' | 'error'; message: string }) {
  return (
    <p
      className={`mb-5 rounded-md px-3 py-2 text-sm ${
        type === 'success'
          ? 'bg-green-50 text-green-800'
          : 'bg-red-50 text-red-700'
      }`}
    >
      {message}
    </p>
  )
}

function SectionDivider() {
  return <hr className="my-8 border-slate-200" />
}

export default async function PropertySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const { saved, error } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!member) redirect('/onboarding')

  const { data: property } = await supabase
    .from('properties')
    .select('*')
    .eq('org_id', member.org_id)
    .is('deleted_at', null)
    .limit(1)
    .single()

  if (!property) redirect('/onboarding')

  const settings = (property.settings ?? {}) as Record<string, unknown>

  const directDiscountPct = (settings.direct_discount_pct as number | undefined) ?? 10
  const cityTaxEuros = ((settings.city_tax_cents as number | undefined) ?? 0) / 100
  const holdHours = (settings.hold_hours as number | undefined) ?? 24
  const offerValidityHours = (settings.offer_validity_hours as number | undefined) ?? 48
  const iban = (settings.iban as string | undefined) ?? ''
  const paymentInstructions = (settings.payment_instructions as string | undefined) ?? ''
  const disclaimer =
    (settings.disclaimer as string | undefined) ??
    'La disponibilità non è ancora bloccata: questa è una proposta indicativa.'
  const aiDailyBudgetEuros = ((settings.ai_daily_budget_cents as number | undefined) ?? 500) / 100
  const aiConvCostLimitEuros =
    ((settings.ai_conversation_cost_limit_cents as number | undefined) ?? 50) / 100
  const aiSessionMsgLimit = (settings.ai_session_message_limit as number | undefined) ?? 30
  const safeMode = (settings.safe_mode as boolean | undefined) ?? false

  const errorSection = error ? error.split('_')[0] : null
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? 'Errore durante il salvataggio.') : null

  const inputCls =
    'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none'
  const labelCls = 'mb-1 block text-sm font-medium text-slate-700'
  const saveBtnCls =
    'mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700'

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-8 text-xl font-semibold text-slate-900">
        Impostazioni — {property.name}
      </h1>

      {/* ── ANAGRAFICA ────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-slate-800">Anagrafica</h2>

        {saved === 'anagrafica' && (
          <SectionBanner type="success" message="Dati anagrafica salvati." />
        )}
        {errorSection === 'anagrafica' && errorMessage && (
          <SectionBanner type="error" message={errorMessage} />
        )}

        <form className="flex flex-col gap-4">
          <div>
            <label htmlFor="name" className={labelCls}>
              Nome struttura <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={property.name}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="address" className={labelCls}>
              Indirizzo
            </label>
            <input
              id="address"
              name="address"
              type="text"
              defaultValue={property.address ?? ''}
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="city" className={labelCls}>
                Città
              </label>
              <input
                id="city"
                name="city"
                type="text"
                defaultValue={property.city ?? ''}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="timezone" className={labelCls}>
                Timezone
              </label>
              <select
                id="timezone"
                name="timezone"
                defaultValue={property.timezone}
                className={inputCls}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="default_language" className={labelCls}>
              Lingua principale
            </label>
            <select
              id="default_language"
              name="default_language"
              defaultValue={property.default_language}
              className={inputCls}
            >
              {LANGUAGES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <button formAction={updateAnagrafica} className={saveBtnCls}>
            Salva anagrafica
          </button>
        </form>
      </section>

      <SectionDivider />

      {/* ── COMMERCIALE ───────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-slate-800">Commerciale</h2>

        {saved === 'commerciale' && (
          <SectionBanner type="success" message="Impostazioni commerciali salvate." />
        )}
        {errorSection === 'commerciale' && errorMessage && (
          <SectionBanner type="error" message={errorMessage} />
        )}

        <form className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="direct_discount_pct" className={labelCls}>
                Sconto diretto (%)
              </label>
              <input
                id="direct_discount_pct"
                name="direct_discount_pct"
                type="number"
                min="0"
                max="100"
                defaultValue={directDiscountPct}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="city_tax_euros" className={labelCls}>
                Tassa soggiorno (€/notte)
              </label>
              <input
                id="city_tax_euros"
                name="city_tax_euros"
                type="number"
                min="0"
                step="0.01"
                defaultValue={cityTaxEuros.toFixed(2)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="hold_hours" className={labelCls}>
                Blocco disponibilità (ore)
              </label>
              <input
                id="hold_hours"
                name="hold_hours"
                type="number"
                min="1"
                defaultValue={holdHours}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="offer_validity_hours" className={labelCls}>
                Validità offerta (ore)
              </label>
              <input
                id="offer_validity_hours"
                name="offer_validity_hours"
                type="number"
                min="1"
                defaultValue={offerValidityHours}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label htmlFor="iban" className={labelCls}>
              IBAN
            </label>
            <input
              id="iban"
              name="iban"
              type="text"
              defaultValue={iban}
              placeholder="IT00 X000 0000 0000 0000 0000 000"
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="payment_instructions" className={labelCls}>
              Istruzioni di pagamento
            </label>
            <textarea
              id="payment_instructions"
              name="payment_instructions"
              rows={3}
              defaultValue={paymentInstructions}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="disclaimer" className={labelCls}>
              Disclaimer proposta
            </label>
            <textarea
              id="disclaimer"
              name="disclaimer"
              rows={2}
              defaultValue={disclaimer}
              className={inputCls}
            />
          </div>

          <button formAction={updateCommerciale} className={saveBtnCls}>
            Salva commerciale
          </button>
        </form>
      </section>

      <SectionDivider />

      {/* ── AI ────────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-slate-800">AI</h2>

        {saved === 'ai' && (
          <SectionBanner type="success" message="Impostazioni AI salvate." />
        )}
        {errorSection === 'ai' && errorMessage && (
          <SectionBanner type="error" message={errorMessage} />
        )}

        <form className="flex flex-col gap-4">
          <div>
            <p className={labelCls}>Supervisione proposte AI</p>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="supervision_mode"
                  value="true"
                  defaultChecked={property.supervision_mode}
                  className="accent-slate-900"
                />
                Attiva
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="supervision_mode"
                  value="false"
                  defaultChecked={!property.supervision_mode}
                  className="accent-slate-900"
                />
                Disattiva
              </label>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Con supervisione attiva le proposte AI richiedono conferma prima dell&apos;invio.
            </p>
          </div>

          <div>
            <label htmlFor="knowledge_learning_mode" className={labelCls}>
              Apprendimento knowledge base
            </label>
            <select
              id="knowledge_learning_mode"
              name="knowledge_learning_mode"
              defaultValue={property.knowledge_learning_mode}
              className={inputCls}
            >
              <option value="manual">Manuale — nessuna pubblicazione automatica</option>
              <option value="assisted">Assistito — proposta + conferma esplicita</option>
              <option value="automatic">Automatico — correzioni owner pubblicate subito</option>
            </select>
          </div>

          <button formAction={updateAI} className={saveBtnCls}>
            Salva AI
          </button>
        </form>
      </section>

      <SectionDivider />

      {/* ── PROTEZIONI ────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-slate-800">Protezioni</h2>
        <p className="mb-4 text-sm text-slate-500">
          Soglie di controllo costi AI. Il budget si azzera ogni mezzanotte (timezone struttura).
        </p>

        {saved === 'protezioni' && (
          <SectionBanner type="success" message="Impostazioni protezioni salvate." />
        )}
        {errorSection === 'protezioni' && errorMessage && (
          <SectionBanner type="error" message={errorMessage} />
        )}

        <form className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ai_daily_budget_euros" className={labelCls}>
                Budget AI giornaliero (€)
              </label>
              <input
                id="ai_daily_budget_euros"
                name="ai_daily_budget_euros"
                type="number"
                min="0"
                step="0.01"
                defaultValue={aiDailyBudgetEuros.toFixed(2)}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-slate-400">A 80% alert; a 100% safe mode automatico.</p>
            </div>
            <div>
              <label htmlFor="ai_conversation_cost_limit_euros" className={labelCls}>
                Limite per conversazione (€)
              </label>
              <input
                id="ai_conversation_cost_limit_euros"
                name="ai_conversation_cost_limit_euros"
                type="number"
                min="0"
                step="0.01"
                defaultValue={aiConvCostLimitEuros.toFixed(2)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label htmlFor="ai_session_message_limit" className={labelCls}>
              Limite messaggi per sessione
            </label>
            <input
              id="ai_session_message_limit"
              name="ai_session_message_limit"
              type="number"
              min="1"
              defaultValue={aiSessionMsgLimit}
              className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <p className={labelCls}>Safe mode</p>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="safe_mode"
                  value="true"
                  defaultChecked={safeMode}
                  className="accent-slate-900"
                />
                Attivo
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="safe_mode"
                  value="false"
                  defaultChecked={!safeMode}
                  className="accent-slate-900"
                />
                Disattivo
              </label>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              In safe mode nessuna chiamata AI viene eseguita. Si attiva automaticamente al 100% del budget.
            </p>
          </div>

          <button formAction={updateProtezioni} className={saveBtnCls}>
            Salva protezioni
          </button>
        </form>
      </section>
    </div>
  )
}
