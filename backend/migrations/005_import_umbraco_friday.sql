-- ============================================================
-- Import vrijdagaankomsten uit Umbraco — 11 april 2026
-- Gegenereerd op basis van live CMS data (Chloë Visser #23030)
-- ============================================================

DO $$
DECLARE
  v_customer_id   UUID;
  v_reservation_id UUID;
  v_ev_service_id  UUID;
  v_vehicle_id     UUID;
BEGIN

  -- Stap 1: Klant upserten
  INSERT INTO customers (first_name, last_name, email, phone)
  VALUES ('Chloë', 'Visser', 'chloe.visser@postcodeloterij.nl', '0647864853')
  ON CONFLICT (email) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name  = EXCLUDED.last_name,
    phone      = EXCLUDED.phone,
    updated_at = NOW()
  RETURNING id INTO v_customer_id;

  -- Stap 2: EV laadservice ophalen (goedkoopste actieve service met kWh)
  SELECT id INTO v_ev_service_id
  FROM services
  WHERE kwh IS NOT NULL AND is_active = true
  ORDER BY price ASC
  LIMIT 1;

  -- Stap 3: Reservering aanmaken
  INSERT INTO reservations (
    reference,
    customer_id,
    parking_lot_id,
    arrival_date,
    departure_date,
    ferry_outbound_id,
    ferry_outbound_destination,
    ferry_outbound_time,
    is_fast_ferry_outbound,
    ferry_return_id,
    ferry_return_destination,
    ferry_return_time,
    status,
    payment_status,
    payment_method,
    base_price,
    season_surcharge_amount,
    services_total,
    on_site_surcharge,
    total_price,
    vat_amount,
    vat_percentage,
    admin_notes,
    policy_anchor_date
  ) VALUES (
    'AB-23030',
    v_customer_id,
    'b0000000-0000-0000-0000-000000000001',
    '2026-04-11',
    '2026-04-12',
    'f0000000-0000-0000-0000-000000000001',  -- Veerdienst Terschelling
    'terschelling',
    '14:05',
    false,
    'f0000000-0000-0000-0000-000000000001',  -- Veerdienst Terschelling (retour)
    'terschelling',
    '11:50',
    'booked',
    'pending',
    'on_site',
    140.00,
    0.00,
    3.00,
    0.00,
    140.00,
    24.30,
    21.00,
    'Kenteken V-606-XV pakt op zaterdag de ochtend boot van 09:05 - komt eerder terug. Kenteken R-303-XK moet worden geladen. [Geïmporteerd uit Umbraco #23030]',
    '2026-04-11'
  ) RETURNING id INTO v_reservation_id;

  -- Stap 4: Voertuigen invoeren
  INSERT INTO vehicles (reservation_id, license_plate, sort_order)
  VALUES
    (v_reservation_id, 'V-606-XV', 1),
    (v_reservation_id, 'T-269-VZ', 2),
    (v_reservation_id, 'R-839-JD', 3);

  -- Stap 5: R-303-XK met EV-laadservice
  INSERT INTO vehicles (reservation_id, license_plate, ev_service_id, ev_kwh, ev_price, sort_order)
  VALUES (
    v_reservation_id,
    'R-303-XK',
    v_ev_service_id,
    10,
    3.00,
    4
  ) RETURNING id INTO v_vehicle_id;

  -- Stap 6: Reservation service koppelen
  IF v_ev_service_id IS NOT NULL THEN
    INSERT INTO reservation_services (reservation_id, service_id, vehicle_id, quantity, unit_price, total_price)
    VALUES (v_reservation_id, v_ev_service_id, v_vehicle_id, 1, 3.00, 3.00);
  END IF;

  RAISE NOTICE 'Import geslaagd — reservation_id: %, klant: %', v_reservation_id, v_customer_id;

EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Reservering AB-23030 bestaat al — overgeslagen.';
END $$;
