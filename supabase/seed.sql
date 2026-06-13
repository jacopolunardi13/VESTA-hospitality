-- ============================================================================
-- AI CONCIERGE & DIRECT QUOTE — SEED DEMO
-- ============================================================================
-- Prerequisiti : 0001 applicata, 0002 applicata (valori EN, chiavi settings EN).
-- Scopo        : dati di sviluppo/test locali. Non applicare in produzione.
-- Contenuto    :
--   - Organization e property demo (con settings EN completo)
--   - Camere demo
--   - Template globali: proposta + follow-up (3 cadenze)
--   - Regole follow-up di default (seed delle followup_rules)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ORGANIZATION E PROPERTY DEMO
-- (sostituisce il placeholder di 0001 con settings EN completo)
-- ----------------------------------------------------------------------------
INSERT INTO public.organizations (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Demo Organization')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.properties (id, org_id, name, city, knowledge_learning_mode, settings) VALUES
  (
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    'Struttura Demo A', 'Firenze', 'assisted',
    jsonb_build_object(
      -- Commerciale
      'direct_discount_pct',             10,
      'hold_hours',                       24,
      'offer_validity_hours',             48,
      'city_tax_cents',                   0,
      'iban',                             '',
      'payment_instructions',             '',
      'disclaimer',                       'La disponibilità non è ancora bloccata: questa è una proposta indicativa.',
      -- Affidabilità tariffe
      'freshness_high_hours',             6,
      'freshness_medium_hours',           48,
      -- AI cost control
      'ai_daily_budget_cents',            500,
      'ai_conversation_cost_limit_cents', 50,
      'ai_session_message_limit',         30,
      'safe_mode',                        false,
      -- Trattativa (§7-ter.1)
      'max_extra_discount_pct',           5,
      'ai_negotiation_enabled',           true,
      'negotiation_rounds_max',           1,
      -- Escalation soglie (§7-bis.3)
      'escalation_group_guests',          6,
      'escalation_group_rooms',           2,
      'escalation_event_keywords',        'matrimonio,festa,cerimonia,meeting',
      'vip_nights_threshold',             7,
      'vip_value_threshold_cents',        100000
    )
  ),
  (
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000001',
    'Struttura Demo B', 'Firenze', 'assisted',
    jsonb_build_object(
      'direct_discount_pct',             10,
      'hold_hours',                       24,
      'offer_validity_hours',             48,
      'city_tax_cents',                   0,
      'iban',                             '',
      'payment_instructions',             '',
      'disclaimer',                       'La disponibilità non è ancora bloccata: questa è una proposta indicativa.',
      'freshness_high_hours',             6,
      'freshness_medium_hours',           48,
      'ai_daily_budget_cents',            500,
      'ai_conversation_cost_limit_cents', 50,
      'ai_session_message_limit',         30,
      'safe_mode',                        false,
      'max_extra_discount_pct',           5,
      'ai_negotiation_enabled',           true,
      'negotiation_rounds_max',           1,
      'escalation_group_guests',          6,
      'escalation_group_rooms',           2,
      'escalation_event_keywords',        'matrimonio,festa,cerimonia,meeting',
      'vip_nights_threshold',             7,
      'vip_value_threshold_cents',        100000
    )
  )
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      settings = EXCLUDED.settings;

-- ----------------------------------------------------------------------------
-- CAMERE DEMO
-- ----------------------------------------------------------------------------
INSERT INTO public.rooms (org_id, property_id, name, max_guests, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Camera Glicine', 3, 1),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Camera Rosa',    2, 2),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 'Camera Demo 1',  2, 1)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- TEMPLATE GLOBALI (org_id NULL = default per tutti i tenant)
-- Copertura minima per il ciclo Direct Quote:
--   proposta_disponibile (email IT/EN + web OTA IT)
--   followup_soft / followup_urgency / followup_last_call (web IT)
--   conferma / istruzioni_checkin (web IT)
--   ack_partnership / ack_vendor / ack_saas_lead (web IT — zero AI generativa)
--   chiarimento_intent (web IT — per unclassified)
-- ----------------------------------------------------------------------------

-- Proposta disponibilità — email italiano
INSERT INTO public.templates (org_id, property_id, code, channel, language, ota_safe, subject, body) VALUES
(null, null, 'proposta_disponibile', 'email', 'it', false,
 'Disponibilità per il tuo soggiorno — offerta diretta',
 'Gentile {{guest_name}},

abbiamo disponibilità dal {{check_in}} al {{check_out}} per {{adults}} adulti{{#children}} e {{children_count}} bambino/i{{/children}}.

{{#rooms}}
{{room_name}}: {{nights}} notti × {{price_per_night}} = {{room_subtotal}}
{{/rooms}}

Prezzo di listino:   {{gross_total}}
Sconto diretto −{{discount_pct}}%:  −{{discount_amount}}
────────────────────────────────
TOTALE OFFERTA:      {{offer_total}}
Tassa di soggiorno:  {{city_tax}} (da pagare in loco)

{{disclaimer}}
Offerta valida fino al {{offer_expires_at}}.

Per confermare il suo interesse risponda a questa email o scriva "Sono interessato" in chat.

{{property_name}}')
ON CONFLICT DO NOTHING;

-- Proposta disponibilità — email inglese
INSERT INTO public.templates (org_id, property_id, code, channel, language, ota_safe, subject, body) VALUES
(null, null, 'proposta_disponibile', 'email', 'en', false,
 'Availability for your stay — direct offer',
 'Dear {{guest_name}},

we have availability from {{check_in}} to {{check_out}} for {{adults}} adult(s){{#children}} and {{children_count}} child(ren){{/children}}.

{{#rooms}}
{{room_name}}: {{nights}} nights × {{price_per_night}} = {{room_subtotal}}
{{/rooms}}

List price:           {{gross_total}}
Direct discount −{{discount_pct}}%: −{{discount_amount}}
──────────────────────────────────
TOTAL OFFER:          {{offer_total}}
City tax:             {{city_tax}} (payable on site)

{{disclaimer}}
Offer valid until {{offer_expires_at}}.

To confirm your interest, reply to this email or type "I am interested" in chat.

{{property_name}}')
ON CONFLICT DO NOTHING;

-- Proposta OTA-safe — web italiano
INSERT INTO public.templates (org_id, property_id, code, channel, language, ota_safe, subject, body) VALUES
(null, null, 'proposta_disponibile_ota', 'web', 'it', true,
 null,
 'Gentile {{guest_name}}, abbiamo disponibilità dal {{check_in}} al {{check_out}} per {{adults}} ospiti. Totale: {{offer_total}}. {{disclaimer}} L''offerta è valida fino al {{offer_expires_at}}. Se interessato, risponda a questo messaggio.')
ON CONFLICT DO NOTHING;

-- Follow-up +1h (soft)
INSERT INTO public.templates (org_id, property_id, code, channel, language, ota_safe, subject, body) VALUES
(null, null, 'followup_soft', 'web', 'it', true,
 null,
 'Gentile {{guest_name}}, ha avuto modo di vedere la proposta? Sono qui per qualsiasi domanda.')
ON CONFLICT DO NOTHING;

INSERT INTO public.templates (org_id, property_id, code, channel, language, ota_safe, subject, body) VALUES
(null, null, 'followup_soft', 'email', 'it', false,
 'Ha visto la nostra proposta?',
 'Gentile {{guest_name}},

le scrivo per assicurarmi che abbia ricevuto la nostra proposta per il soggiorno dal {{check_in}} al {{check_out}}.

Sono a disposizione per qualsiasi domanda.

{{property_name}}')
ON CONFLICT DO NOTHING;

-- Follow-up +24h (urgency)
INSERT INTO public.templates (org_id, property_id, code, channel, language, ota_safe, subject, body) VALUES
(null, null, 'followup_urgency', 'web', 'it', true,
 null,
 'Gentile {{guest_name}}, la proposta è ancora valida fino al {{offer_expires_at}}.{{#last_room}} È rimasta l''ultima camera disponibile per quelle date.{{/last_room}} Siamo a sua disposizione.')
ON CONFLICT DO NOTHING;

INSERT INTO public.templates (org_id, property_id, code, channel, language, ota_safe, subject, body) VALUES
(null, null, 'followup_urgency', 'email', 'it', false,
 'La sua offerta è ancora disponibile',
 'Gentile {{guest_name}},

la proposta per il soggiorno dal {{check_in}} al {{check_out}} ({{offer_total}}) è ancora valida fino al {{offer_expires_at}}.{{#last_room}}

Tenga presente che è rimasta l''ultima camera disponibile per quelle date.{{/last_room}}

Se ha domande o desidera procedere, siamo a sua completa disposizione.

{{property_name}}')
ON CONFLICT DO NOTHING;

-- Follow-up +72h (last call)
INSERT INTO public.templates (org_id, property_id, code, channel, language, ota_safe, subject, body) VALUES
(null, null, 'followup_last_call', 'web', 'it', true,
 null,
 'Gentile {{guest_name}}, l''offerta sta per scadere. Vuole che verifichiamo date alternative o ha bisogno di altre informazioni?')
ON CONFLICT DO NOTHING;

INSERT INTO public.templates (org_id, property_id, code, channel, language, ota_safe, subject, body) VALUES
(null, null, 'followup_last_call', 'email', 'it', false,
 'Ultima occasione per il suo soggiorno',
 'Gentile {{guest_name}},

l''offerta per il soggiorno dal {{check_in}} al {{check_out}} scade il {{offer_expires_at}}.

Se le date non sono più comode, possiamo verificare disponibilità alternative. Le basta rispondere con le nuove preferenze.

{{property_name}}')
ON CONFLICT DO NOTHING;

-- Conferma prenotazione
INSERT INTO public.templates (org_id, property_id, code, channel, language, ota_safe, subject, body) VALUES
(null, null, 'conferma', 'email', 'it', false,
 'Prenotazione confermata — {{property_name}}',
 'Gentile {{guest_name}},

siamo lieti di confermare la sua prenotazione:

Struttura:   {{property_name}}
Date:        {{check_in}} → {{check_out}} ({{nights}} notti)
Ospiti:      {{adults}} adulti{{#children}}, {{children_count}} bambino/i{{/children}}
Camera:      {{room_name}}
Totale:      {{offer_total}}

La aspettiamo!

{{property_name}}')
ON CONFLICT DO NOTHING;

-- Istruzioni check-in (post-conferma, inviato −2 giorni)
INSERT INTO public.templates (org_id, property_id, code, channel, language, ota_safe, subject, body) VALUES
(null, null, 'istruzioni_checkin', 'email', 'it', false,
 'Il suo soggiorno si avvicina — istruzioni di arrivo',
 'Gentile {{guest_name}},

mancano due giorni al suo arrivo: non vediamo l''ora di accoglierla!

{{checkin_instructions}}

Per qualsiasi domanda siamo a disposizione.

{{property_name}}')
ON CONFLICT DO NOTHING;

-- Ack partnership
INSERT INTO public.templates (org_id, property_id, code, channel, language, ota_safe, subject, body) VALUES
(null, null, 'ack_partnership', 'web', 'it', true,
 null,
 'Grazie per averci contattato. La sua richiesta è stata inoltrata al responsabile commerciale, che la ricontatterà al più presto.')
ON CONFLICT DO NOTHING;

-- Ack vendor/commerciale
INSERT INTO public.templates (org_id, property_id, code, channel, language, ota_safe, subject, body) VALUES
(null, null, 'ack_vendor', 'web', 'it', true,
 null,
 'Grazie per il messaggio. Provvederemo a esaminare la sua proposta.')
ON CONFLICT DO NOTHING;

-- Ack SaaS lead (gestore interessato al prodotto)
INSERT INTO public.templates (org_id, property_id, code, channel, language, ota_safe, subject, body) VALUES
(null, null, 'ack_saas_lead', 'web', 'it', true,
 null,
 'Grazie per l''interesse verso AI Concierge! Il nostro team sarà felice di mostrarle come funziona. Può contattarci a {{saas_contact_email}} oppure visitare {{saas_product_url}}.')
ON CONFLICT DO NOTHING;

-- Chiarimento intent (unclassified)
INSERT INTO public.templates (org_id, property_id, code, channel, language, ota_safe, subject, body) VALUES
(null, null, 'chiarimento_intent', 'web', 'it', true,
 null,
 'Buongiorno! Come posso aiutarla?')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- FOLLOWUP RULES DI DEFAULT
-- (da copiare per ogni org/property durante l''onboarding, o usare come globali)
-- Trigger status usa i valori EN (post-0002).
-- Le condizioni usano chiavi snake_case (non vincolate da CHECK).
-- ----------------------------------------------------------------------------
INSERT INTO public.followup_rules
  (org_id, property_id, trigger_status, delay_minutes, template_code, conditions, active)
VALUES
  -- +1h: reminder soft
  ('00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000011',
   'proposal_sent',
   60,
   'followup_soft',
   '{"only_if_no_reply": true}'::jsonb,
   true),

  -- +24h: urgency con variabile ultima camera
  ('00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000011',
   'proposal_sent',
   1440,
   'followup_urgency',
   '{"only_if_no_reply": true}'::jsonb,
   true),

  -- +72h: last call → poi stop definitivo
  ('00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000011',
   'proposal_sent',
   4320,
   'followup_last_call',
   '{"only_if_no_reply": true}'::jsonb,
   true),

  -- Post-conferma: istruzioni check-in (−2 giorni = 0 min delay, inviato dal cron su check_in − 2d)
  ('00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000011',
   'confirmed',
   0,
   'istruzioni_checkin',
   '{"days_before_checkin": 2}'::jsonb,
   true)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- NOTA POST-SIGNUP:
-- Dopo aver creato il tuo utente in Supabase Auth, collegalo alla demo org:
--   SELECT enroll_user_in_org(
--     '00000000-0000-0000-0000-000000000001',
--     'TUO-USER-UUID',
--     'owner'
--   );
-- Oppure usa l''RPC dalla dashboard Supabase → SQL Editor.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- FINE SEED DEMO
-- ============================================================================
