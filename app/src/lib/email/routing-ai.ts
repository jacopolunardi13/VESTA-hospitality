// Proposta di categoria via AI (Haiku) — usata dal router SOLO sui casi dubbi. PROPONE solo
// una categoria: non decide mai se rispondere (la decisione è rule-based sulla categoria).
import { anthropic } from '@/lib/ai/client'
import { MODELS } from '@/lib/ai/models'
import type { InboundEmail } from './gmail'
import type { EmailCategory } from './routing'

const CATS: EmailCategory[] = ['guest', 'ota_pms', 'supplier_admin', 'newsletter_spam']

export async function proposeEmailCategory(email: InboundEmail): Promise<{ category: EmailCategory; confidence: number } | null> {
  try {
    const res = await anthropic().messages.create({
      model: MODELS.classify,
      max_tokens: 128,
      system: `Classifica un'email ricevuta dalla casella di una struttura ricettiva in UNA categoria:
- guest: un OSPITE reale (persona) che scrive per informazioni, disponibilità, prenotazione diretta.
- ota_pms: notifica automatica da OTA/PMS/channel manager (Booking, Expedia, Airbnb, QuoVai, QVI…): nuova prenotazione, modifica, cancellazione.
- supplier_admin: fornitore, utenze, commercialista, comunicazioni amministrative.
- newsletter_spam: newsletter, marketing, spam.
Proponi SOLO la categoria più probabile e una confidenza 0–1.`,
      tool_choice: { type: 'tool', name: 'propose_category' },
      tools: [{
        name: 'propose_category',
        description: 'Proposta di categoria email.',
        input_schema: {
          type: 'object',
          properties: { category: { type: 'string', enum: CATS }, confidence: { type: 'number' } },
          required: ['category', 'confidence'],
        },
      }],
      messages: [{ role: 'user', content: `Da: ${email.fromName} <${email.from}>\nOggetto: ${email.subject}\n\n${email.body.slice(0, 1200)}` }],
    })
    const tu = res.content.find((b) => b.type === 'tool_use')
    if (tu && tu.type === 'tool_use') {
      const i = tu.input as { category?: string; confidence?: number }
      if (i.category && (CATS as string[]).includes(i.category)) {
        return { category: i.category as EmailCategory, confidence: typeof i.confidence === 'number' ? Math.max(0, Math.min(1, i.confidence)) : 0.5 }
      }
    }
    return null
  } catch {
    return null
  }
}
