-- ============================================================================
-- MIGRAZIONE 0002: Enum → EN · vincoli aggiuntivi · normalizzazione settings
-- ============================================================================
-- Prerequisito : migrazione 0001 applicata su un progetto Supabase pulito.
-- Quando       : Fase 0, PRIMA che esistano dati di produzione.
-- Cosa fa      :
--   1. Converte tutti i valori enum da italiano a inglese.
--   2. Ricostruisce i due indici parziali che referenziano status IT.
--   3. Aggiunge UNIQUE su templates e CHECK date su booking_requests.
--   4. Normalizza le chiavi JSON di properties.settings (IT → EN).
--   5. Aggiunge la funzione RPC enroll_user_in_org (auth callback onboarding).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Abbandona gli indici parziali che referenziano valori IT nel WHERE
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_br_hold_expiry;
DROP INDEX IF EXISTS public.idx_br_offer_expiry;

-- ----------------------------------------------------------------------------
-- 2. CONVERSIONE ENUM IT → EN
--    Pattern: DROP vincolo → UPDATE dati → ADD vincolo EN → SET DEFAULT EN
--    I nomi dei vincoli seguono la convenzione PostgreSQL: {table}_{col}_check.
--    Se un nome non corrisponde, identificarlo con:
--      SELECT conname FROM pg_constraint
--      WHERE conrelid = 'public.<table>'::regclass AND contype = 'c';
-- ----------------------------------------------------------------------------

-- 2a. conversations.status
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_status_check;

UPDATE public.conversations SET status = CASE status
  WHEN 'aperta'          THEN 'open'
  WHEN 'in_attesa_staff' THEN 'pending_staff'
  WHEN 'chiusa'          THEN 'closed'
  ELSE status END;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_status_check
  CHECK (status IN ('open', 'pending_staff', 'closed'));

ALTER TABLE public.conversations
  ALTER COLUMN status SET DEFAULT 'open';

-- ──────────────────────────────────────────────────────────────────────────
-- 2b. booking_requests.status (10 stati)
ALTER TABLE public.booking_requests
  DROP CONSTRAINT IF EXISTS booking_requests_status_check;

UPDATE public.booking_requests SET status = CASE status
  WHEN 'richiesta_ricevuta'     THEN 'received'
  WHEN 'proposta_inviata'       THEN 'proposal_sent'
  WHEN 'interessato'            THEN 'interested'
  WHEN 'da_verificare'          THEN 'to_verify'
  WHEN 'disponibilita_bloccata' THEN 'availability_blocked'
  WHEN 'in_attesa_pagamento'    THEN 'awaiting_payment'
  WHEN 'confermata'             THEN 'confirmed'
  WHEN 'scaduta'                THEN 'expired'
  WHEN 'rifiutata'              THEN 'rejected'
  WHEN 'cancellata'             THEN 'cancelled'
  ELSE status END;

ALTER TABLE public.booking_requests
  ADD CONSTRAINT booking_requests_status_check
  CHECK (status IN (
    'received', 'proposal_sent', 'interested', 'to_verify',
    'availability_blocked', 'awaiting_payment', 'confirmed',
    'expired', 'rejected', 'cancelled'));

ALTER TABLE public.booking_requests
  ALTER COLUMN status SET DEFAULT 'received';

-- ──────────────────────────────────────────────────────────────────────────
-- 2c. booking_requests.priority
ALTER TABLE public.booking_requests
  DROP CONSTRAINT IF EXISTS booking_requests_priority_check;

UPDATE public.booking_requests SET priority = CASE priority
  WHEN 'alta'  THEN 'high'
  WHEN 'media' THEN 'medium'
  WHEN 'bassa' THEN 'low'
  ELSE priority END;

ALTER TABLE public.booking_requests
  ADD CONSTRAINT booking_requests_priority_check
  CHECK (priority IN ('high', 'medium', 'low'));

ALTER TABLE public.booking_requests
  ALTER COLUMN priority SET DEFAULT 'low';

-- ──────────────────────────────────────────────────────────────────────────
-- 2d. booking_requests.data_reliability (nullable: solo se NOT NULL)
ALTER TABLE public.booking_requests
  DROP CONSTRAINT IF EXISTS booking_requests_data_reliability_check;

UPDATE public.booking_requests
  SET data_reliability = CASE data_reliability
    WHEN 'alta'  THEN 'high'
    WHEN 'media' THEN 'medium'
    WHEN 'bassa' THEN 'low'
    ELSE data_reliability END
  WHERE data_reliability IS NOT NULL;

ALTER TABLE public.booking_requests
  ADD CONSTRAINT booking_requests_data_reliability_check
  CHECK (data_reliability IN ('high', 'medium', 'low'));

-- ──────────────────────────────────────────────────────────────────────────
-- 2e. knowledge_assets.origin
ALTER TABLE public.knowledge_assets
  DROP CONSTRAINT IF EXISTS knowledge_assets_origin_check;

UPDATE public.knowledge_assets SET origin = CASE origin
  WHEN 'manuale'    THEN 'manual'
  WHEN 'correzione' THEN 'correction'
  ELSE origin END;   -- 'import' e 'gap' restano invariati

ALTER TABLE public.knowledge_assets
  ADD CONSTRAINT knowledge_assets_origin_check
  CHECK (origin IN ('import', 'manual', 'correction', 'gap'));

ALTER TABLE public.knowledge_assets
  ALTER COLUMN origin SET DEFAULT 'manual';

-- ──────────────────────────────────────────────────────────────────────────
-- 2f. kb_suggestions.kind
ALTER TABLE public.kb_suggestions
  DROP CONSTRAINT IF EXISTS kb_suggestions_kind_check;

UPDATE public.kb_suggestions SET kind = CASE kind
  WHEN 'correzione' THEN 'correction'
  ELSE kind END;   -- 'gap' resta

ALTER TABLE public.kb_suggestions
  ADD CONSTRAINT kb_suggestions_kind_check
  CHECK (kind IN ('correction', 'gap'));

-- ──────────────────────────────────────────────────────────────────────────
-- 2g. kb_suggestions.status
ALTER TABLE public.kb_suggestions
  DROP CONSTRAINT IF EXISTS kb_suggestions_status_check;

UPDATE public.kb_suggestions SET status = CASE status
  WHEN 'proposta'     THEN 'proposed'
  WHEN 'in_revisione' THEN 'in_review'
  WHEN 'pubblicata'   THEN 'published'
  WHEN 'rifiutata'    THEN 'rejected'
  ELSE status END;

ALTER TABLE public.kb_suggestions
  ADD CONSTRAINT kb_suggestions_status_check
  CHECK (status IN ('proposed', 'in_review', 'published', 'rejected'));

ALTER TABLE public.kb_suggestions
  ALTER COLUMN status SET DEFAULT 'proposed';

-- ----------------------------------------------------------------------------
-- 3. Ricostruzione indici parziali con valori EN
-- ----------------------------------------------------------------------------
CREATE INDEX idx_br_hold_expiry ON public.booking_requests (hold_expires_at)
  WHERE status = 'awaiting_payment';

CREATE INDEX idx_br_offer_expiry ON public.booking_requests (offer_expires_at)
  WHERE status = 'proposal_sent';

-- ----------------------------------------------------------------------------
-- 4. Nuovi vincoli
-- ----------------------------------------------------------------------------

-- 4a. UNIQUE su templates per (org_id, property_id, code, channel, language).
--     Due indici parziali separati per gestire NULL su org_id (template globali):
--     PostgreSQL tratta NULL come distinti nei UNIQUE, rendendo impossibile
--     un unico vincolo che copra entrambi i casi.

-- Template globali (org_id IS NULL): unique su code+channel+language
CREATE UNIQUE INDEX IF NOT EXISTS templates_unique_global_key
  ON public.templates (code, channel, language)
  WHERE org_id IS NULL AND deleted_at IS NULL;

-- Template org-specifici: unique su (org_id, property_id, code, channel, language)
CREATE UNIQUE INDEX IF NOT EXISTS templates_unique_org_key
  ON public.templates (org_id, property_id, code, channel, language)
  WHERE org_id IS NOT NULL AND deleted_at IS NULL;

-- 4b. check_out > check_in su booking_requests (entrambi nullable al momento della creazione)
ALTER TABLE public.booking_requests
  ADD CONSTRAINT booking_requests_dates_order
  CHECK (check_out IS NULL OR check_in IS NULL OR check_out > check_in);

-- 4c. CHECK su followup_rules.trigger_status
--     I valori devono corrispondere ai valori EN di booking_requests.status:
--     il cron materializza i job con WHERE booking_requests.status = followup_rules.trigger_status.
--     Senza questo vincolo un typo silenzioso produce zero job senza alcun errore visibile.
ALTER TABLE public.followup_rules
  ADD CONSTRAINT followup_rules_trigger_status_check
  CHECK (trigger_status IN (
    'received', 'proposal_sent', 'interested', 'to_verify',
    'availability_blocked', 'awaiting_payment', 'confirmed',
    'expired', 'rejected', 'cancelled'));

-- ----------------------------------------------------------------------------
-- 5. Normalizzazione chiavi JSON in properties.settings (IT → EN)
--    Rinomina le chiavi conservando i valori; le chiavi assenti sono ignorate.
--    Mappa:
--      sconto_diretto_pct   → direct_discount_pct
--      tassa_soggiorno_cents → city_tax_cents
--      freshness_alta_ore   → freshness_high_hours
--      freshness_media_ore  → freshness_medium_hours
-- ----------------------------------------------------------------------------
UPDATE public.properties
SET settings = (
  (settings
    - 'sconto_diretto_pct'
    - 'tassa_soggiorno_cents'
    - 'freshness_alta_ore'
    - 'freshness_media_ore'
  )
  ||
  jsonb_strip_nulls(jsonb_build_object(
    'direct_discount_pct',
      (settings->>'sconto_diretto_pct')::int,
    'city_tax_cents',
      (settings->>'tassa_soggiorno_cents')::int,
    'freshness_high_hours',
      (settings->>'freshness_alta_ore')::int,
    'freshness_medium_hours',
      (settings->>'freshness_media_ore')::int
  ))
)
WHERE settings ?| ARRAY[
  'sconto_diretto_pct',
  'tassa_soggiorno_cents',
  'freshness_alta_ore',
  'freshness_media_ore'
];

-- ----------------------------------------------------------------------------
-- 6. RPC: enroll_user_in_org
--    Chiamata dall'auth callback Next.js durante il completamento
--    dell'onboarding (A2): crea la riga org_members per il nuovo utente.
--    Gestisce idempotenza (ON CONFLICT) per richieste doppie.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enroll_user_in_org(
  p_org_id  uuid,
  p_user_id uuid,
  p_role    text DEFAULT 'owner'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (p_org_id, p_user_id, p_role)
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        updated_at = now();
END $$;

COMMENT ON FUNCTION public.enroll_user_in_org IS
  'Inserisce (o aggiorna) il ruolo di un utente in una organization.
   Invocata dall''auth callback Next.js al completamento dell''onboarding (step A2).
   Usa SECURITY DEFINER per bypassare RLS (il ruolo deve essere creato prima che l''utente sia membro).';

-- ============================================================================
-- FINE MIGRAZIONE 0002
-- Riepilogo vincoli aggiunti / modificati:
--   §2  enum IT→EN (7 colonne, 4 tabelle)
--   §3  indici parziali idx_br_hold_expiry / idx_br_offer_expiry (valori EN)
--   §4a templates UNIQUE (due indici parziali per org_id NULL/NOT NULL)
--   §4b booking_requests CHECK check_out > check_in
--   §4c followup_rules CHECK trigger_status IN (valori EN booking_requests.status)
--   §5  properties.settings chiavi JSON IT→EN
--   §6  RPC enroll_user_in_org (SECURITY DEFINER, idempotente)
-- ============================================================================
