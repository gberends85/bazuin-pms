-- Migration 016: betaalmethoden uitbreiden met contant, pin en tikkie
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_payment_method_check;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_payment_method_check
  CHECK (payment_method IS NULL OR payment_method::text = ANY (ARRAY[
    'ideal', 'card', 'paypal', 'sepa', 'bancontact',
    'on_site', 'contant', 'pin', 'tikkie'
  ]::text[]));
