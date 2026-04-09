-- ============================================================
-- 004_modification_feature.sql
-- Autostalling De Bazuin — Reserveringswijziging
-- ============================================================

-- 1. Policy anchor date op reserveringen
--    Wordt éénmalig gezet op de ORIGINELE aankomstdatum.
--    Wordt NOOIT bijgewerkt bij wijzigingen (anti-gaming).
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS policy_anchor_date DATE;

UPDATE reservations SET policy_anchor_date = arrival_date WHERE policy_anchor_date IS NULL;

ALTER TABLE reservations ALTER COLUMN policy_anchor_date SET NOT NULL;
ALTER TABLE reservations ALTER COLUMN policy_anchor_date SET DEFAULT CURRENT_DATE;

-- 2. Wijzigingshistorie
CREATE TABLE IF NOT EXISTS reservation_modifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id        UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  modified_by           VARCHAR(20) NOT NULL CHECK (modified_by IN ('customer', 'admin')),
  admin_user_id         UUID REFERENCES admin_users(id),
  old_arrival_date      DATE NOT NULL,
  old_departure_date    DATE NOT NULL,
  new_arrival_date      DATE NOT NULL,
  new_departure_date    DATE NOT NULL,
  old_total_price       DECIMAL(10,2) NOT NULL,
  new_total_price       DECIMAL(10,2) NOT NULL,
  price_difference      DECIMAL(10,2) NOT NULL,
  modification_fee      DECIMAL(10,2) NOT NULL DEFAULT 0,
  stripe_charge_id      VARCHAR(255),
  stripe_refund_id      VARCHAR(255),
  admin_override_price  DECIMAL(10,2),
  admin_notes           TEXT,
  status                VARCHAR(30) NOT NULL DEFAULT 'completed',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservation_modifications_reservation_id
  ON reservation_modifications(reservation_id);

-- 3. Instellingen voor wijzigingen
INSERT INTO settings (key, value, description) VALUES
  ('modification_fee', '0.00', 'Wijzigingstoeslag in euros per wijziging'),
  ('modification_min_days_before', '0', 'Wijziging minimaal X dagen voor aankomst toegestaan (0 = altijd)')
ON CONFLICT (key) DO NOTHING;
