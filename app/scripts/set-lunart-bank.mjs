// Salva gli estremi bancari LunArt in properties.settings (merge non distruttivo).
// Usati automaticamente nel flusso commerciale (Fase 2) quando l'ospite procede.
// Uso: node --env-file=.env.local scripts/set-lunart-bank.mjs
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const PROP = '00000000-0000-0000-0000-000000000011' // LunArt B&B

const BANK = {
  iban: 'IT77X0503402801000000020689',
  payment_holder: 'LUNARDI JACOPO',
  payment_branch: 'FIRENZE - PIAZZA DEI DAVANZATI',
  payment_causal: 'LunArt Firenze',
}

const { data: prop, error: e1 } = await sb.from('properties').select('settings').eq('id', PROP).single()
if (e1 || !prop) { console.error('KO read property:', e1?.message); process.exit(1) }

const settings = { ...(prop.settings ?? {}), ...BANK }
const { error: e2 } = await sb.from('properties').update({ settings }).eq('id', PROP)
if (e2) { console.error('KO update:', e2.message); process.exit(1) }

console.log('OK — estremi bancari salvati in settings:')
for (const k of Object.keys(BANK)) console.log(`  ${k}: ${settings[k]}`)
