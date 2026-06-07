-- Migration 015: invoice extra items + payment status/method update support
-- Voegt handmatige factuurregels toe aan reserveringen

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS invoice_extra_items JSONB DEFAULT '[]'::jsonb;

-- Index for faster queries if needed
-- (invoice_extra_items is rarely queried by content, so no GIN index needed)
