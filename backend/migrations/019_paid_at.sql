-- Migration 019: voeg paid_at toe aan reservations
-- Dit vastlegt het exacte tijdstip waarop een betaling werd geregistreerd.
-- Backfill: gebruik updated_at als benadering voor bestaande 'paid' reserveringen.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Backfill: voor al betaalde reserveringen nemen we updated_at als benadering
UPDATE reservations
   SET paid_at = updated_at
 WHERE payment_status = 'paid'
   AND paid_at IS NULL;
