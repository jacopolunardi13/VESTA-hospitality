import type Anthropic from '@anthropic-ai/sdk'

// Identità + voce del Concierge. Blocco STABILE (property-independent) →
// prompt caching massimo. Orientato a conversione e riduzione lavoro gestore,
// NON guida digitale / FAQ chatbot.
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

/**
 * System prompt a blocchi per generate_reply.
 * Blocco 1 (identità/voce) e blocco 2 (KB property) sono stabili → cache_control
 * ephemeral: ~90% di risparmio sull'input dalle richieste successive.
 */
export function buildSystemBlocks(opts: {
  propertyName: string
  kbText: string
}): Anthropic.Messages.TextBlockParam[] {
  const blocks: Anthropic.Messages.TextBlockParam[] = [
    { type: 'text', text: CONCIERGE_IDENTITY, cache_control: { type: 'ephemeral' } },
  ]
  const kb = opts.kbText.trim()
  blocks.push({
    type: 'text',
    text: `Struttura: ${opts.propertyName}\n\n=== KNOWLEDGE BASE ===\n${
      kb || '(nessun contenuto disponibile — rispondi che metterai in contatto con la struttura)'
    }`,
    cache_control: { type: 'ephemeral' },
  })
  return blocks
}
