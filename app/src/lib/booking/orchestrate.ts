// Orchestrazione di UN turno di conversazione, condivisa tra web chat ed email.
// Presuppone che il chiamante abbia già: risolto/creato la conversation e
// persistito il messaggio in ingresso. Qui: short-circuit del flusso prenotazioni
// (scelta camera / contabile), budget/safe-mode, pipeline, persistenza risposta,
// aggiornamento conversazione, creazione/aggiornamento lead. Ritorna la risposta;
// la CONSEGNA esterna (es. invio email) è responsabilità del canale chiamante.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TablesUpdate, Json } from '@/lib/supabase/database.types'
import { getBudgetState } from '@/lib/ai/budget'
import { logGuardrail } from '@/lib/ai/guardrail'
import { runPipeline, childrenNeedingBed } from '@/lib/ai/pipeline'
import { persistProposal, persistCombination, selectAllQuotes, selectAvailableRooms } from '@/lib/quote/draftProposal'
import { selectRoomCombinations } from '@/lib/quote/roomCombinations'
import { executeTransition } from '@/lib/quote/stateMachine'
import { createNotification } from '@/lib/notifications'
import { isInterest, isPaymentClaim, matchRoomChoice, matchCombination, chooseRoomPrompt, availabilityCheckAck, paymentAck, normLang } from '@/lib/ai/messages'
import type { ChatTurn, PropertyContext } from '@/lib/ai/types'

export interface TurnResult {
  reply: string
  intent: string
  confidence: number
  stage: string
  status: string
  source: string
  escalated: boolean
  /** Documento da allegare/recapitare alla risposta (Tier 1): preventivo a totale risolto
   *  (ospite ha scelto camera/combinazione). Il canale decide allegato/documento/link. */
  document?: { leadId: string; type: 'preventivo' | 'conferma' }
}

/** Sorgente del lead alla creazione (canale d'origine). */
export type LeadSource = 'website_chat' | 'email' | 'whatsapp'

export async function processConversationTurn(opts: {
  sb: SupabaseClient<Database>
  property: PropertyContext
  conversationId: string
  userMessage: string
  leadSource?: LeadSource
}): Promise<TurnResult> {
  const { sb, property, conversationId, userMessage } = opts
  const propertyId = property.id
  const leadSource: LeadSource = opts.leadSource ?? 'website_chat'

  // ── Flusso prenotazioni definitivo: progressione di un lead esistente ──
  // Riconosce la SCELTA della camera (su un preventivo già inviato) o la
  // COMUNICAZIONE del pagamento. Vesta non blocca mai né dichiara "riservata".
  {
    const { data: conv2 } = await sb
      .from('conversations')
      .select('booking_request_id, language')
      .eq('id', conversationId)
      .single()
    const lang = normLang(conv2?.language)
    if (conv2?.booking_request_id) {
      const leadId = conv2.booking_request_id
      const { data: lead } = await sb
        .from('booking_requests')
        .select('status, check_in, check_out, adults, children')
        .eq('id', leadId)
        .single()

      // PASSO 2-4 — scelta camera su un preventivo già inviato.
      if (lead?.status === 'proposal_sent' && lead.check_in && lead.check_out && lead.adults != null) {
        const all = await selectAllQuotes(sb, {
          propertyId, orgId: property.orgId,
          checkIn: lead.check_in, checkOut: lead.check_out,
          adults: lead.adults, childrenBeds: childrenNeedingBed(Array.isArray(lead.children) ? (lead.children as { age: number | null }[]) : []),
          todayIso: new Date().toISOString().slice(0, 10),
        })
        if (all.length > 0) {
          const options = all.map((r) => ({ roomId: r.roomId, name: r.roomName, amountEur: Math.round(r.quote.offerTotalCents / 100) }))
          const matched = matchRoomChoice(userMessage, options)
          let chosen = matched.length === 1 ? all.find((r) => r.roomId === matched[0].roomId) ?? null : null
          if (!chosen && matched.length === 0 && isInterest(userMessage) && all.length === 1) chosen = all[0]

          if (chosen) {
            await persistProposal(sb, { orgId: property.orgId, bookingRequestId: leadId, roomName: chosen.roomName, quote: chosen.quote, autoSend: true })
            const offerEur = Math.round(chosen.quote.offerTotalCents / 100)
            await executeTransition(sb, { requestId: leadId, orgId: property.orgId, toStatus: 'interested', actor: 'guest', note: `Cliente ha scelto: ${chosen.roomName} (€${offerEur}) — richiede verifica disponibilità PMS` })
            const reply = availabilityCheckAck(lang, chosen.roomName)
            await sb.from('messages').insert({ org_id: property.orgId, property_id: propertyId, conversation_id: conversationId, direction: 'out', sender: 'ai', content: reply })
            await sb.from('conversations').update({ stage: 'negotiating' }).eq('id', conversationId)
            await createNotification(sb, { orgId: property.orgId, propertyId, type: 'escalation', title: 'Verifica disponibilità richiesta', body: `L'ospite ha scelto ${chosen.roomName} (€${offerEur}). Verifica la disponibilità nel PMS, poi premi "Disponibile → riserva" oppure "Non disponibile".`, bookingRequestId: leadId, conversationId })
            return { reply, intent: 'booking', confidence: 1, stage: 'negotiating', status: 'interested', source: 'template', escalated: false, document: { leadId, type: 'preventivo' } }
          }

          // Scelta ambigua, o intenzione di procedere con più camere → chiedi quale.
          if (matched.length > 1 || (isInterest(userMessage) && all.length > 1)) {
            const reply = chooseRoomPrompt(lang, matched.length > 1 ? matched : options)
            await sb.from('messages').insert({ org_id: property.orgId, property_id: propertyId, conversation_id: conversationId, direction: 'out', sender: 'ai', content: reply })
            return { reply, intent: 'booking', confidence: 1, stage: 'proposal_sent', status: 'open', source: 'template', escalated: false }
          }
          // Nessuna scelta riconosciuta → prosegui con la pipeline.
        }
      }

      // PASSO 2-4 (GRUPPI) — scelta di una combinazione (Opzione A/B) su un preventivo gruppo.
      if (lead?.status === 'proposal_sent' && lead.check_in && lead.check_out && lead.adults != null) {
        const pick = matchCombination(userMessage)
        if (pick !== null) {
          const requiredBeds = lead.adults + childrenNeedingBed(Array.isArray(lead.children) ? (lead.children as { age: number | null }[]) : [])
          const available = await selectAvailableRooms(sb, { propertyId, orgId: property.orgId, checkIn: lead.check_in, checkOut: lead.check_out, adults: lead.adults, todayIso: new Date().toISOString().slice(0, 10) })
          const combos = selectRoomCombinations(available.map((r) => ({ roomId: r.roomId, roomName: r.roomName, maxGuests: r.maxGuests, offerTotalCents: r.quote.offerTotalCents })), requiredBeds, { maxOptions: 2 })
          const chosen = combos[pick]
          if (chosen) {
            const rooms = chosen.rooms.map((cr) => available.find((a) => a.roomId === cr.roomId)).filter((r): r is NonNullable<typeof r> => !!r)
            await persistCombination(sb, { orgId: property.orgId, bookingRequestId: leadId, rooms })
            const names = rooms.map((r) => r.roomName).join(' + ')
            const totalEur = Math.round(rooms.reduce((s, r) => s + r.quote.offerTotalCents, 0) / 100)
            await executeTransition(sb, { requestId: leadId, orgId: property.orgId, toStatus: 'interested', actor: 'guest', note: `Cliente ha scelto la combinazione: ${names} (€${totalEur}) — richiede verifica disponibilità PMS` })
            const reply = availabilityCheckAck(lang, names)
            await sb.from('messages').insert({ org_id: property.orgId, property_id: propertyId, conversation_id: conversationId, direction: 'out', sender: 'ai', content: reply })
            await sb.from('conversations').update({ stage: 'negotiating' }).eq('id', conversationId)
            await createNotification(sb, { orgId: property.orgId, propertyId, type: 'escalation', title: 'Verifica disponibilità richiesta', body: `L'ospite ha scelto la combinazione ${names} (€${totalEur}). Verifica la disponibilità nel PMS, poi premi "Disponibile → riserva" oppure "Non disponibile".`, bookingRequestId: leadId, conversationId })
            return { reply, intent: 'booking', confidence: 1, stage: 'negotiating', status: 'interested', source: 'template', escalated: false, document: { leadId, type: 'preventivo' } }
          }
        }
      }

      // PASSO 6 — pagamento/contabile comunicato → notifica staff, NESSUNA conferma automatica.
      if (lead?.status === 'awaiting_payment' && isPaymentClaim(userMessage)) {
        const reply = paymentAck(lang)
        await sb.from('messages').insert({ org_id: property.orgId, property_id: propertyId, conversation_id: conversationId, direction: 'out', sender: 'ai', content: reply })
        await createNotification(sb, { orgId: property.orgId, propertyId, type: 'escalation', title: 'Contabile ricevuta – verifica richiesta', body: 'L\'ospite dichiara di aver pagato. Verifica la contabile e premi "Conferma prenotazione".', bookingRequestId: leadId, conversationId })
        return { reply, intent: 'booking', confidence: 1, stage: 'negotiating', status: 'awaiting_payment', source: 'template', escalated: false }
      }
    }
  }

  // Budget / safe mode.
  const budget = await getBudgetState(sb, propertyId, property.settings)
  if (budget.over80 && !budget.safeMode) {
    await logGuardrail(sb, { orgId: property.orgId, propertyId, type: 'budget_80', details: { ...budget } })
  }
  if (budget.safeMode) {
    await logGuardrail(sb, { orgId: property.orgId, propertyId, type: 'budget_100', details: { ...budget } })
  }

  // Storico (ultimi 10, escluso il corrente già persistito dal chiamante).
  const { data: msgs } = await sb
    .from('messages')
    .select('direction, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(11)
  const history: ChatTurn[] = (msgs ?? [])
    .reverse()
    .slice(0, -1)
    .map((m) => ({ role: m.direction === 'in' ? 'user' : 'assistant', content: m.content }))

  // Pipeline knowledge-first.
  let result
  try {
    result = await runPipeline({
      sb, property, history, userMessage, aiEnabled: !budget.safeMode,
      todayIso: new Date().toISOString().slice(0, 10),
    })
  } catch {
    const fallback = 'Mi spiace, ho avuto un problema tecnico. Riprova tra poco o lascia un recapito allo staff.'
    await sb.from('messages').insert({
      org_id: property.orgId, property_id: propertyId, conversation_id: conversationId,
      direction: 'out', sender: 'ai', content: fallback,
    })
    return { reply: fallback, intent: 'unclassified', confidence: 0, stage: 'new', status: 'open', source: 'template', escalated: false }
  }

  // Persisti la risposta (se presente — lo spam non risponde).
  if (result.text) {
    await sb.from('messages').insert({
      org_id: property.orgId, property_id: propertyId, conversation_id: conversationId,
      direction: 'out', sender: 'ai', content: result.text,
    })
  }

  // Aggiorna metadati conversazione.
  await sb.from('conversations').update({
    intent: result.intent, intent_confidence: result.confidence,
    stage: result.stage, status: result.status,
  }).eq('id', conversationId)

  // Lead (booking): crea/collega booking_request + slot + esito preventivo.
  if (result.createLead) {
    const { data: conv } = await sb
      .from('conversations')
      .select('booking_request_id, guest_name, guest_contact')
      .eq('id', conversationId)
      .single()

    let leadId = conv?.booking_request_id ?? null
    const slots = result.slots

    if (conv && !leadId) {
      const { data: br } = await sb
        .from('booking_requests')
        .insert({
          org_id: property.orgId, property_id: propertyId, conversation_id: conversationId,
          source: leadSource, status: 'received',
          guest_name: slots?.guest_name ?? conv.guest_name,
          guest_contact: slots?.guest_contact ?? conv.guest_contact,
        })
        .select('id')
        .single()
      if (br) {
        leadId = br.id
        await sb.from('conversations').update({ booking_request_id: br.id }).eq('id', conversationId)
        await sb.from('booking_request_events').insert({
          org_id: property.orgId, booking_request_id: br.id,
          from_status: null, to_status: 'received', actor: 'system',
          note: `Lead generato da ${leadSource === 'email' ? 'email' : 'chat'} (intent booking)`,
        })
      }
    }

    if (leadId && slots) {
      const upd: TablesUpdate<'booking_requests'> = {}
      if (slots.check_in) upd.check_in = slots.check_in
      if (slots.check_out) upd.check_out = slots.check_out
      if (slots.adults) upd.adults = slots.adults
      if (slots.children.length) upd.children = slots.children as Json
      if (slots.language) upd.language = slots.language
      if (slots.special_requests) upd.special_requests = slots.special_requests
      if (slots.guest_name) upd.guest_name = slots.guest_name
      if (slots.guest_contact) upd.guest_contact = slots.guest_contact
      // Conserva TUTTE le richieste rilevate (multi-camera/multi-periodo), nessuna persa.
      if (slots.segments && slots.segments.length > 0) upd.parsed_requests = slots.segments as unknown as Json
      if (Object.keys(upd).length > 0) {
        await sb.from('booking_requests').update(upd).eq('id', leadId).eq('org_id', property.orgId)
      }
      const convUpd: TablesUpdate<'conversations'> = {}
      if (slots.guest_name) convUpd.guest_name = slots.guest_name
      if (slots.guest_contact) convUpd.guest_contact = slots.guest_contact
      if (slots.language) convUpd.language = slots.language
      if (Object.keys(convUpd).length > 0) {
        await sb.from('conversations').update(convUpd).eq('id', conversationId)
      }
    }

    // Passo 1: preventivo MULTI-camera → proposal_sent + notifica staff.
    if (leadId && result.proposalRooms && result.proposalRooms.length > 0) {
      const n = result.proposalRooms.length
      await executeTransition(sb, {
        requestId: leadId, orgId: property.orgId, toStatus: 'proposal_sent', actor: 'system',
        note: `Preventivo inviato: ${n} camere disponibili mostrate all'ospite`,
      })
      await createNotification(sb, {
        orgId: property.orgId, propertyId, type: 'proposal_auto_sent',
        title: `Preventivo inviato · ${n} camere`,
        body: `Mostrate ${n} camere disponibili all'ospite; in attesa della scelta della camera.`,
        bookingRequestId: leadId, conversationId,
      })
    // Passo 1 GRUPPI: combinazioni proposte → proposal_sent + notifica staff.
    } else if (leadId && result.proposalCombinations && result.proposalCombinations.length > 0) {
      const n = result.proposalCombinations.length
      await executeTransition(sb, {
        requestId: leadId, orgId: property.orgId, toStatus: 'proposal_sent', actor: 'system',
        note: `Preventivo gruppo inviato: ${n} combinazioni di camere proposte`,
      })
      await createNotification(sb, {
        orgId: property.orgId, propertyId, type: 'proposal_auto_sent',
        title: `Preventivo gruppo · ${n} combinazioni`,
        body: `Gruppo oltre la capienza singola: proposte ${n} combinazioni; in attesa della scelta dell'ospite.`,
        bookingRequestId: leadId, conversationId,
      })
    } else if (leadId && result.draft) {
      await persistProposal(sb, {
        orgId: property.orgId, bookingRequestId: leadId,
        roomName: result.draft.roomName, quote: result.draft.quote, autoSend: !!result.autoSend,
      })
      const offerStr = (result.draft.quote.offerTotalCents / 100).toFixed(2) + '€'
      if (result.autoSend) {
        await executeTransition(sb, {
          requestId: leadId, orgId: property.orgId, toStatus: 'proposal_sent', actor: 'system',
          note: `Proposta standard generata e inviata automaticamente: ${result.draft.roomName}, ${offerStr}`,
        })
        await createNotification(sb, {
          orgId: property.orgId, propertyId, type: 'proposal_auto_sent',
          title: `Proposta inviata · ${offerStr}`,
          body: `Inviata automaticamente all'ospite (${result.draft.roomName}).`,
          bookingRequestId: leadId, conversationId,
        })
      } else {
        await createNotification(sb, {
          orgId: property.orgId, propertyId, type: 'proposal_draft',
          title: `Richiesta preventivo da gestire · ${offerStr}`,
          body: `Per Jacopo: verifica disponibilità/tariffa e invia (${result.draft.roomName}, affidabilità ${result.draft.quote.dataReliability}).`,
          bookingRequestId: leadId, conversationId,
        })
      }
    } else if (leadId && result.slotsReady && !result.autoSend) {
      await createNotification(sb, {
        orgId: property.orgId, propertyId, type: 'escalation',
        title: 'Richiesta preventivo da gestire',
        body: 'Per Jacopo: verifica disponibilità e migliore tariffa, poi invia una proposta personalizzata.',
        bookingRequestId: leadId, conversationId,
      })
    }

    // Multi-richiesta: notifica staff con l'elenco di TUTTE le richieste (nessun auto-preventivo).
    const segs = result.slots?.segments ?? []
    if (leadId && segs.length >= 2) {
      const lines = segs.map((s, n) => `${n + 1}) ${s.room_type ?? 'camera'} ${s.check_in ?? '?'}${s.check_out ? '→' + s.check_out : ''}`).join(' · ')
      await createNotification(sb, {
        orgId: property.orgId, propertyId, type: 'escalation',
        title: `Richiesta multipla · ${segs.length} richieste`,
        body: `Più richieste in un solo messaggio: ${lines}. Verificale tutte (nessun preventivo automatico inviato).`,
        bookingRequestId: leadId, conversationId,
      })
    }

    // Richiesta MISTA: la domanda concierge non ha trovato risposta nella KB (es. locale
    // esterno) → notifica staff con il testo della domanda. Il flusso booking è invariato:
    // l'ospite ha già ricevuto preventivo + rimando cortese allo staff nello stesso messaggio.
    if (leadId && result.conciergeUnanswered) {
      await createNotification(sb, {
        orgId: property.orgId, propertyId, type: 'escalation',
        title: 'Domanda concierge senza risposta',
        body: `L'ospite, insieme alla richiesta di soggiorno, ha posto una domanda a cui la knowledge base non sa rispondere: «${userMessage}». Rispondi tu direttamente.`,
        bookingRequestId: leadId, conversationId,
      })
    }
  }

  // Notifica staff per le escalation / richieste da gestire (pending_staff).
  if (result.status === 'pending_staff' && result.intent !== 'booking') {
    await createNotification(sb, {
      orgId: property.orgId, propertyId, type: 'escalation',
      title: result.escalated ? 'Richiesta da gestire (escalation)' : 'Nuova richiesta da gestire',
      body: `Categoria: ${result.intent}. La conversazione richiede attenzione dello staff.`,
      conversationId,
    })
  }

  return {
    reply: result.text, intent: result.intent, confidence: result.confidence,
    stage: result.stage, status: result.status, source: result.source, escalated: result.escalated,
  }
}
