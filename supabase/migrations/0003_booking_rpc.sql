-- Funzione atomica per le transizioni di stato di booking_requests.
-- SECURITY DEFINER bypassa RLS; l'ownership check è in-function via p_org_id.
-- Migrazione 0003 — booking engine (Fase 1b).

CREATE OR REPLACE FUNCTION public.transition_booking_request(
  p_request_id          uuid,
  p_org_id              uuid,
  p_to_status           text,
  p_actor               text,           -- 'staff' | 'system' | 'guest'
  p_note                text       DEFAULT NULL,
  p_gross_total_cents   integer    DEFAULT NULL,
  p_discount_pct        numeric    DEFAULT NULL,
  p_offer_total_cents   integer    DEFAULT NULL,
  p_city_tax_cents      integer    DEFAULT NULL,
  p_price_source        text       DEFAULT NULL,
  p_data_reliability    text       DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req     booking_requests%ROWTYPE;
  v_from    text;
  v_now     timestamptz := now();
  v_hold_h  integer;
  v_offer_h integer;
BEGIN
  -- 1. Lock esclusivo: previene transizioni concorrenti sullo stesso record.
  SELECT * INTO v_req
  FROM booking_requests
  WHERE id = p_request_id
    AND org_id = p_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_from := v_req.status;

  -- 2. Transizioni valide MVP (to_verify escluso dalle transizioni attive).
  IF NOT (
    (v_from = 'received'             AND p_to_status IN ('proposal_sent','rejected','cancelled')) OR
    (v_from = 'proposal_sent'        AND p_to_status IN ('interested','expired','rejected','cancelled')) OR
    (v_from = 'interested'           AND p_to_status IN ('availability_blocked','rejected','cancelled')) OR
    (v_from = 'availability_blocked' AND p_to_status IN ('awaiting_payment','expired','cancelled')) OR
    (v_from = 'awaiting_payment'     AND p_to_status IN ('confirmed','cancelled')) OR
    (v_from = 'confirmed'            AND p_to_status = 'cancelled')
  ) THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'invalid_transition',
      'from', v_from, 'to', p_to_status
    );
  END IF;

  -- 3. Legge settings della property per i calcoli di scadenza.
  SELECT
    COALESCE((settings->>'hold_hours')::integer, 24),
    COALESCE((settings->>'offer_validity_hours')::integer, 48)
  INTO v_hold_h, v_offer_h
  FROM properties
  WHERE id = v_req.property_id;

  -- 4. Applica la transizione con tutti i side-effects di stato.
  UPDATE booking_requests SET
    status              = p_to_status,
    updated_at          = v_now,
    proposal_sent_at    = CASE WHEN p_to_status = 'proposal_sent'
                               THEN v_now ELSE proposal_sent_at END,
    interested_at       = CASE WHEN p_to_status = 'interested'
                               THEN v_now ELSE interested_at END,
    payment_received_at = CASE WHEN p_to_status = 'confirmed'
                               THEN v_now ELSE payment_received_at END,
    offer_expires_at    = CASE WHEN p_to_status = 'proposal_sent'
                               THEN v_now + (v_offer_h || ' hours')::interval
                               ELSE offer_expires_at END,
    hold_expires_at     = CASE WHEN p_to_status = 'availability_blocked'
                               THEN v_now + (v_hold_h || ' hours')::interval
                               ELSE hold_expires_at END,
    gross_total_cents   = COALESCE(p_gross_total_cents,  gross_total_cents),
    discount_pct        = COALESCE(p_discount_pct,       discount_pct),
    offer_total_cents   = COALESCE(p_offer_total_cents,  offer_total_cents),
    city_tax_cents      = COALESCE(p_city_tax_cents,     city_tax_cents),
    price_source        = COALESCE(p_price_source,       price_source),
    data_reliability    = COALESCE(p_data_reliability,   data_reliability)
  WHERE id = p_request_id;

  -- 5. Audit trail obbligatorio su ogni transizione.
  INSERT INTO booking_request_events (
    org_id, booking_request_id, from_status, to_status, actor, note
  ) VALUES (
    p_org_id, p_request_id, v_from, p_to_status, p_actor, p_note
  );

  RETURN jsonb_build_object('ok', true, 'from', v_from, 'to', p_to_status);
END;
$$;

REVOKE ALL ON FUNCTION public.transition_booking_request FROM public;
GRANT EXECUTE ON FUNCTION public.transition_booking_request TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_booking_request TO service_role;
