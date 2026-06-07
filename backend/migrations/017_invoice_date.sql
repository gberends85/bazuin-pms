-- Migration 017: instelbare factuurdatum per reservering
-- Standaard NULL = gebruik created_at (reserveringsdatum)
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS invoice_date DATE DEFAULT NULL;
