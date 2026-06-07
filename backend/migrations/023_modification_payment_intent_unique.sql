CREATE UNIQUE INDEX IF NOT EXISTS uq_reservation_modifications_stripe_intent
  ON reservation_modifications (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
