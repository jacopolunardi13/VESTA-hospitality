// Demo LIVE del layer AI del Concierge (intent + reply) contro l'API Anthropic.
// Riproduce fedelmente src/lib/ai/prompts.ts e src/lib/ai/intent.ts.
// Scopo: verificare l'orientamento a conversione (lead/disponibilità/proposta/escalation),
// NON un chatbot turistico generico. Non tocca il DB (la persistenza richiede la 0004).
//
// Uso: node --env-file=.env.local scripts/test-concierge.mjs

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// === Mirror di src/lib/ai/prompts.ts ===
const CONCIERGE_IDENTITY = `Sei il concierge digitale di una struttura ricettiva. Il tuo obiettivo è duplice:
1. aiutare l'ospite con risposte precise e cordiali;
2. trasformare l'interesse in una prenotazione diretta con la struttura (non tramite portali OTA).

Principi:
- Rispondi SEMPRE nella lingua dell'ospite (rilevala dal messaggio).
- Tono professionale e caloroso, asciutto, senza emoji.
- Usa SOLO le informazioni presenti nella Knowledge Base fornita. Se un'informazione non c'è, non inventarla: dillo e proponi di mettere in contatto con la struttura.
- Non comunicare MAI prezzi o disponibilità di tua iniziativa: questi arrivano dal sistema, non da te. Se l'ospite chiede un preventivo, raccogli date e numero di ospiti e indica che preparerai una proposta.
- Quando rispondi a una domanda informativa, se è naturale, invita con misura (una sola volta, mai insistente) a verificare la disponibilità per le sue date.
- Non promettere nulla che non sia nella Knowledge Base (politiche, servizi, eccezioni).`

// === Mirror di src/lib/ai/intent.ts ===
const INTENTS = ['booking','faq','guest_support','partnership','vendor','saas_lead','spam','unclassified']
const CLASSIFY_GUIDE = `Classifica il messaggio dell'ospite in UNA categoria. Non trattare ogni messaggio come una prenotazione.
- booking: vuole prenotare/sapere disponibilità o prezzo per date.
- faq: domanda informativa sul soggiorno senza intento immediato di prenotare.
- guest_support: ha già una prenotazione.
- partnership: agenzia/tour operator che vuole collaborare (tariffe gruppi).
- vendor: vuole vendere qualcosa ALLA struttura.
- saas_lead: gestore di strutture interessato a QUESTO software.
- spam: spam, link sospetti.
- unclassified: non chiaro.`

// KB di esempio (le "9 domande d'oro").
const KB = `## Parcheggio
Parcheggio privato gratuito in struttura, non serve prenotare.
## Check-in / Check-out
Check-in dalle 15:00, check-out entro le 10:30.
## Colazione
Colazione a buffet inclusa, servita dalle 7:30 alle 10:00.
## Animali
Animali di piccola taglia ammessi senza supplemento.
## Cancellazione
Cancellazione gratuita fino a 7 giorni prima dell'arrivo.`

async function classify(message) {
  const res = await client.messages.create({
    model: 'claude-haiku-4-5', max_tokens: 256, system: CLASSIFY_GUIDE,
    tool_choice: { type: 'tool', name: 'record_intent' },
    tools: [{ name: 'record_intent', description: 'Registra la categoria.', input_schema: {
      type: 'object',
      properties: { intent: { type: 'string', enum: INTENTS }, confidence: { type: 'number' } },
      required: ['intent','confidence'] } }],
    messages: [{ role: 'user', content: message }],
  })
  const tu = res.content.find((b) => b.type === 'tool_use')
  return tu ? tu.input : { intent: 'unclassified', confidence: 0 }
}

async function reply(message) {
  const res = await client.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 1024,
    system: [
      { type: 'text', text: CONCIERGE_IDENTITY, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `Struttura: Locanda Demo\n\n=== KNOWLEDGE BASE ===\n${KB}`, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: message }],
  })
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
}

const SCENARIOS = [
  'Avete disponibilità dal 10 al 12 agosto per 2 adulti?',
  'Buongiorno, c’è il parcheggio in struttura?',
  'A che ora è il check-in e fate colazione?',
  'Salve, siamo un tour operator, vorremmo tariffe per gruppi.',
]

console.log('\n================ DEMO CONCIERGE (live Anthropic) ================\n')
for (const msg of SCENARIOS) {
  const intent = await classify(msg)
  console.log(`👤 OSPITE: ${msg}`)
  console.log(`   ↳ intent: ${intent.intent} (conf ${intent.confidence})`)
  if (intent.intent === 'booking' || intent.intent === 'faq' || intent.intent === 'guest_support') {
    const r = await reply(msg)
    console.log(`🤖 CONCIERGE: ${r}\n`)
  } else {
    console.log(`🤖 CONCIERGE: [template ack — ${intent.intent}, instradato a inbox dedicata, zero AI generativa]\n`)
  }
}
console.log('=================================================================\n')
