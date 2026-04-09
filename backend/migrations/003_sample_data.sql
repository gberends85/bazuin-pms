-- ============================================================
-- Sample data voor demo/test
-- ============================================================

-- Klanten
INSERT INTO customers (id, first_name, last_name, email, phone) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Guido',   'Bakker',   'guido.bakker@gmail.com',    '0612345678'),
  ('c1000000-0000-0000-0000-000000000002', 'Sandra',  'Visser',   'sandra.visser@outlook.com', '0623456789'),
  ('c1000000-0000-0000-0000-000000000003', 'Pieter',  'de Vries', 'p.devries@hotmail.com',     '0634567890'),
  ('c1000000-0000-0000-0000-000000000004', 'Marieke', 'Jansen',   'marieke.jansen@gmail.com',  '0645678901'),
  ('c1000000-0000-0000-0000-000000000005', 'Tom',     'Smit',     'tom.smit@live.nl',          '0656789012')
ON CONFLICT (email) DO NOTHING;

-- Reservering 1: Vandaag aankomst (26-NZ-FH)
INSERT INTO reservations (reference, customer_id, parking_lot_id, rate_id,
  status, payment_status, payment_method,
  arrival_date, departure_date,
  ferry_outbound_id, ferry_outbound_time, ferry_outbound_destination,
  ferry_return_id, ferry_return_time, ferry_return_destination,
  base_price, total_price, vat_amount)
SELECT 'BZ-2026-001',
  'c1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'booked', 'paid', 'ideal',
  CURRENT_DATE, CURRENT_DATE + 5,
  'f0000000-0000-0000-0000-000000000001', '08:45', 'terschelling',
  'f0000000-0000-0000-0000-000000000001', '17:30', 'terschelling',
  80.00, 80.00, 13.88
WHERE NOT EXISTS (SELECT 1 FROM reservations WHERE reference = 'BZ-2026-001');

INSERT INTO vehicles (reservation_id, license_plate, rdw_make, rdw_model, rdw_color, rdw_fuel_type, rdw_year)
SELECT id, '26-NZ-FH', 'Volkswagen', 'Golf', 'Zwart', 'Benzine', 2019
FROM reservations WHERE reference = 'BZ-2026-001'
AND NOT EXISTS (SELECT 1 FROM vehicles v JOIN reservations r ON v.reservation_id = r.id WHERE r.reference = 'BZ-2026-001');

-- Reservering 2: Vandaag aankomst (23-PB-KJ)
INSERT INTO reservations (reference, customer_id, parking_lot_id, rate_id,
  status, payment_status, payment_method,
  arrival_date, departure_date,
  ferry_outbound_id, ferry_outbound_time, ferry_outbound_destination,
  ferry_return_id, ferry_return_time, ferry_return_destination,
  base_price, total_price, vat_amount)
SELECT 'BZ-2026-002',
  'c1000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'booked', 'paid', 'ideal',
  CURRENT_DATE, CURRENT_DATE + 3,
  'f0000000-0000-0000-0000-000000000003', '11:00', 'terschelling',
  'f0000000-0000-0000-0000-000000000003', '16:30', 'terschelling',
  55.00, 55.00, 9.54
WHERE NOT EXISTS (SELECT 1 FROM reservations WHERE reference = 'BZ-2026-002');

INSERT INTO vehicles (reservation_id, license_plate, rdw_make, rdw_model, rdw_color, rdw_fuel_type, rdw_year)
SELECT id, '23-PB-KJ', 'Toyota', 'Yaris', 'Wit', 'Benzine', 2021
FROM reservations WHERE reference = 'BZ-2026-002'
AND NOT EXISTS (SELECT 1 FROM vehicles v JOIN reservations r ON v.reservation_id = r.id WHERE r.reference = 'BZ-2026-002');

-- Reservering 3: Ingecheckt (Vlieland), plek A14
INSERT INTO reservations (reference, customer_id, parking_lot_id, rate_id,
  status, payment_status, payment_method,
  arrival_date, departure_date,
  ferry_outbound_id, ferry_outbound_time, ferry_outbound_destination,
  ferry_return_id, ferry_return_time, ferry_return_destination,
  base_price, total_price, vat_amount,
  checkin_at, parking_spot)
SELECT 'BZ-2026-003',
  'c1000000-0000-0000-0000-000000000003',
  'b0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'checked_in', 'paid', 'card',
  CURRENT_DATE - 2, CURRENT_DATE + 2,
  'f0000000-0000-0000-0000-000000000002', '09:30', 'vlieland',
  'f0000000-0000-0000-0000-000000000002', '15:00', 'vlieland',
  65.00, 65.00, 11.28,
  NOW() - INTERVAL '2 days', 'A14'
WHERE NOT EXISTS (SELECT 1 FROM reservations WHERE reference = 'BZ-2026-003');

INSERT INTO vehicles (reservation_id, license_plate, rdw_make, rdw_model, rdw_color, rdw_fuel_type, rdw_year)
SELECT id, 'GH-432-L', 'BMW', '3 Serie', 'Grijs', 'Diesel', 2020
FROM reservations WHERE reference = 'BZ-2026-003'
AND NOT EXISTS (SELECT 1 FROM vehicles v JOIN reservations r ON v.reservation_id = r.id WHERE r.reference = 'BZ-2026-003');

-- Reservering 4: Morgen aankomst, 2 autos
INSERT INTO reservations (reference, customer_id, parking_lot_id, rate_id,
  status, payment_status, payment_method,
  arrival_date, departure_date,
  ferry_outbound_id, ferry_outbound_time, ferry_outbound_destination,
  ferry_return_id, ferry_return_time, ferry_return_destination,
  base_price, total_price, vat_amount)
SELECT 'BZ-2026-004',
  'c1000000-0000-0000-0000-000000000004',
  'b0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'booked', 'paid', 'ideal',
  CURRENT_DATE + 1, CURRENT_DATE + 7,
  'f0000000-0000-0000-0000-000000000001', '13:30', 'terschelling',
  'f0000000-0000-0000-0000-000000000001', '18:00', 'terschelling',
  160.00, 160.00, 27.77
WHERE NOT EXISTS (SELECT 1 FROM reservations WHERE reference = 'BZ-2026-004');

INSERT INTO vehicles (reservation_id, license_plate, rdw_make, rdw_model, rdw_color, rdw_fuel_type, rdw_year, sort_order)
SELECT id, 'KL-789-M', 'Opel', 'Astra', 'Blauw', 'Benzine', 2018, 0
FROM reservations WHERE reference = 'BZ-2026-004'
AND NOT EXISTS (SELECT 1 FROM vehicles v JOIN reservations r ON v.reservation_id = r.id WHERE r.reference = 'BZ-2026-004' AND v.license_plate = 'KL-789-M');

INSERT INTO vehicles (reservation_id, license_plate, rdw_make, rdw_model, rdw_color, rdw_fuel_type, rdw_year, sort_order)
SELECT id, 'RT-556-Z', 'Renault', 'Clio', 'Rood', 'Benzine', 2022, 1
FROM reservations WHERE reference = 'BZ-2026-004'
AND NOT EXISTS (SELECT 1 FROM vehicles v JOIN reservations r ON v.reservation_id = r.id WHERE r.reference = 'BZ-2026-004' AND v.license_plate = 'RT-556-Z');

-- Reservering 5: Vorige week afgerond
INSERT INTO reservations (reference, customer_id, parking_lot_id, rate_id,
  status, payment_status, payment_method,
  arrival_date, departure_date,
  ferry_outbound_destination,
  base_price, total_price, vat_amount,
  checkin_at, parking_spot)
SELECT 'BZ-2026-005',
  'c1000000-0000-0000-0000-000000000005',
  'b0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'completed', 'paid', 'ideal',
  CURRENT_DATE - 8, CURRENT_DATE - 1,
  'terschelling',
  80.00, 80.00, 13.88,
  NOW() - INTERVAL '8 days', 'B07'
WHERE NOT EXISTS (SELECT 1 FROM reservations WHERE reference = 'BZ-2026-005');

INSERT INTO vehicles (reservation_id, license_plate, rdw_make, rdw_model, rdw_color, rdw_fuel_type, rdw_year)
SELECT id, 'ND-234-K', 'Skoda', 'Octavia', 'Zilver', 'Diesel', 2017
FROM reservations WHERE reference = 'BZ-2026-005'
AND NOT EXISTS (SELECT 1 FROM vehicles v JOIN reservations r ON v.reservation_id = r.id WHERE r.reference = 'BZ-2026-005');
