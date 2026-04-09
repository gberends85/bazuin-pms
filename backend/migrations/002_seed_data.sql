-- ============================================================
-- Seed data — Autostalling De Bazuin (gebaseerd op live systeem)
-- ============================================================

-- Admin user (wachtwoord: 'changeme123' — DIRECT WIJZIGEN na installatie)
INSERT INTO admin_users (name, email, password_hash, role)
VALUES ('Beheerder', 'admin@autostallingdebazuin.nl',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniMnGYAB5UB8ZXfMy2d5PvKzO', 'admin');

-- Location
INSERT INTO locations (id, name, description, address, total_spots, online_spots,
  checkout_margin_min, checkin_margin_slow_min, checkin_margin_fast_min, whatsapp_number)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Autostalling De Bazuin',
  'Overdekte autostalling op loopafstand van de veerboten naar Terschelling en Vlieland.',
  'Franekereind 13, 8861 KL Harlingen',
  55, 50, 30, 120, 90, '31612345678'
);

-- Parking lot
INSERT INTO parking_lots (id, location_id, name, description, total_spots, is_covered)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Overdekt',
  'Overdekte parkeerplaats Autostalling De Bazuin',
  55, true
);

-- ============================================================
-- FERRIES (exact uit Umbraco)
-- ============================================================
INSERT INTO ferries (id, name, duration_min, is_fast, destination, sort_order) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'Veerdienst Terschelling', 120, false, 'terschelling', 1),
  ('f0000000-0000-0000-0000-000000000002', 'Veerdienst Vlieland', 105, false, 'vlieland', 2),
  ('f0000000-0000-0000-0000-000000000003', 'Sneldienst', 50, true, 'terschelling', 3),
  ('f0000000-0000-0000-0000-000000000004', 'Waddentaxi', 60, true, 'both', 4),
  ('f0000000-0000-0000-0000-000000000005', 'Watertaxi De Bazuin', 55, true, 'both', 5);

-- Voorbeeld boottijden (standaard schema, per dag handmatig aanpasbaar)
-- Terschelling heen
INSERT INTO ferry_schedule_templates (ferry_id, day_of_week, departure_time, direction, destination, valid_from)
SELECT 'f0000000-0000-0000-0000-000000000001', d, t::TIME, 'outbound', 'terschelling', '2025-01-01'
FROM (VALUES (0,'08:45'),(0,'13:30'),(0,'18:00'),
             (1,'08:45'),(1,'11:00'),(1,'14:30'),(1,'17:45'),
             (2,'08:45'),(2,'11:00'),(2,'14:30'),(2,'17:45'),
             (3,'08:45'),(3,'11:00'),(3,'14:30'),(3,'17:45'),
             (4,'08:45'),(4,'11:00'),(4,'14:30'),(4,'17:45'),
             (5,'08:45'),(5,'11:00'),(5,'14:30'),(5,'17:45'),
             (6,'08:45'),(6,'13:30'),(6,'18:00')) AS v(d, t);

-- Terschelling terug
INSERT INTO ferry_schedule_templates (ferry_id, day_of_week, departure_time, direction, destination, valid_from)
SELECT 'f0000000-0000-0000-0000-000000000001', d, t::TIME, 'return', 'terschelling', '2025-01-01'
FROM (VALUES (0,'11:00'),(0,'16:00'),(0,'19:30'),
             (1,'10:00'),(1,'13:00'),(1,'16:30'),(1,'19:30'),
             (2,'10:00'),(2,'13:00'),(2,'16:30'),(2,'19:30'),
             (3,'10:00'),(3,'13:00'),(3,'16:30'),(3,'19:30'),
             (4,'10:00'),(4,'13:00'),(4,'16:30'),(4,'19:30'),
             (5,'10:00'),(5,'13:00'),(5,'16:30'),(5,'19:30'),
             (6,'11:00'),(6,'16:00'),(6,'19:30')) AS v(d, t);

-- Vlieland heen
INSERT INTO ferry_schedule_templates (ferry_id, day_of_week, departure_time, direction, destination, valid_from)
SELECT 'f0000000-0000-0000-0000-000000000002', d, t::TIME, 'outbound', 'vlieland', '2025-01-01'
FROM (VALUES (0,'10:15'),(0,'15:30'),
             (1,'10:15'),(1,'15:30'),
             (2,'10:15'),(2,'15:30'),
             (3,'10:15'),(3,'15:30'),
             (4,'10:15'),(4,'15:30'),
             (5,'10:15'),(5,'15:30'),
             (6,'10:15'),(6,'15:30')) AS v(d, t);

-- Vlieland terug
INSERT INTO ferry_schedule_templates (ferry_id, day_of_week, departure_time, direction, destination, valid_from)
SELECT 'f0000000-0000-0000-0000-000000000002', d, t::TIME, 'return', 'vlieland', '2025-01-01'
FROM (VALUES (0,'12:30'),(0,'17:30'),
             (1,'12:30'),(1,'17:30'),
             (2,'12:30'),(2,'17:30'),
             (3,'12:30'),(3,'17:30'),
             (4,'12:30'),(4,'17:30'),
             (5,'12:30'),(5,'17:30'),
             (6,'12:30'),(6,'17:30')) AS v(d, t);

-- ============================================================
-- RATES — Voorjaar 2026 (exact uit Umbraco)
-- ============================================================
INSERT INTO rates (id, parking_lot_id, name, base_day_price, min_days, max_days,
  customer_info, valid_from, valid_until)
VALUES (
  'r0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'Voorjaar 2026',
  8.00, 1, 100,
  'Najaar en voorjaar 2025/2026',
  '2025-09-25', '2026-04-29'
);

INSERT INTO rate_day_prices (rate_id, day_number, price) VALUES
  ('r0000000-0000-0000-0000-000000000001', 1, 35.00),
  ('r0000000-0000-0000-0000-000000000001', 2, 45.00),
  ('r0000000-0000-0000-0000-000000000001', 3, 55.00),
  ('r0000000-0000-0000-0000-000000000001', 4, 65.00),
  ('r0000000-0000-0000-0000-000000000001', 5, 73.00),
  ('r0000000-0000-0000-0000-000000000001', 6, 80.00),
  ('r0000000-0000-0000-0000-000000000001', 7, 87.00),
  ('r0000000-0000-0000-0000-000000000001', 8, 95.00),
  ('r0000000-0000-0000-0000-000000000001', 9, 103.00),
  ('r0000000-0000-0000-0000-000000000001', 10, 111.00),
  ('r0000000-0000-0000-0000-000000000001', 11, 119.00),
  ('r0000000-0000-0000-0000-000000000001', 12, 127.00),
  ('r0000000-0000-0000-0000-000000000001', 13, 135.00),
  ('r0000000-0000-0000-0000-000000000001', 14, 140.00);

-- Zomertarief 2026
INSERT INTO rates (id, parking_lot_id, name, base_day_price, min_days, max_days,
  valid_from, valid_until)
VALUES (
  'r0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000001',
  'Zomer 2026', 10.00, 1, 100, '2026-05-01', '2026-10-30'
);

INSERT INTO rate_day_prices (rate_id, day_number, price) VALUES
  ('r0000000-0000-0000-0000-000000000002', 1, 40.00),
  ('r0000000-0000-0000-0000-000000000002', 2, 50.00),
  ('r0000000-0000-0000-0000-000000000002', 3, 60.00),
  ('r0000000-0000-0000-0000-000000000002', 4, 70.00),
  ('r0000000-0000-0000-0000-000000000002', 5, 80.00),
  ('r0000000-0000-0000-0000-000000000002', 6, 89.00),
  ('r0000000-0000-0000-0000-000000000002', 7, 97.00),
  ('r0000000-0000-0000-0000-000000000002', 14, 160.00);

-- ============================================================
-- SERVICES — exact uit Umbraco
-- ============================================================
INSERT INTO services (name, description, customer_info, price, unit, kwh, admin_only, sort_order) VALUES
  ('Toeslag ter plekke betalen',
   'Toeslag voor betaling bij aankomst (pin of contant).',
   'Dit wordt als extra toeslag in rekening gebracht bij het in- of uitchecken. Om deze extra kosten te vermijden, kunt u uw reservering vooraf betalen via PayPal, creditcard of iDEAL.',
   5.00, 'per_vehicle', NULL, false, 0),
  ('Auto laden — 10 kWh',
   '10 kWh (~30-50 km bereik)', '10 kWh (~30 - 50km)',
   10.00, 'fixed', 10, false, 1),
  ('Auto laden — 20 kWh',
   '20 kWh (~75-125 km bereik)', '20 kWh (~75 - 125km)',
   15.00, 'fixed', 20, false, 2),
  ('Auto laden — 30 kWh',
   '30 kWh (~100-150 km bereik)', '30 kWh (~100-150km)',
   20.00, 'fixed', 30, false, 3),
  ('Auto laden — 40 kWh',
   '40 kWh (~125-200 km bereik)', '40 kWh (~125 - 200km)',
   25.00, 'fixed', 40, false, 4),
  ('Auto laden — 60 kWh',
   '60 kWh (~175-300 km bereik)', '60 kWh (~175 - 300km)',
   40.00, 'fixed', 60, false, 5),
  ('Auto laden (vol)',
   'Volledig opladen. Opstarttarief €5 + 50 cent per kWh, achteraf betalen.',
   '€5,-opstarttarief + 50 cent per KW/u, achteraf betalen.',
   5.00, 'per_kwh', NULL, true, 6);

-- ============================================================
-- CANCELLATION POLICIES
-- ============================================================
INSERT INTO cancellation_policies (days_before_min, days_before_max, refund_percentage, description, sort_order) VALUES
  (14, NULL, 100, 'Meer dan 14 dagen van tevoren: volledige restitutie', 1),
  (7, 13, 75, '7 tot 14 dagen van tevoren: 75% restitutie', 2),
  (2, 6, 50, '2 tot 7 dagen van tevoren: 50% restitutie', 3),
  (0, 1, 0, 'Minder dan 2 dagen van tevoren: geen restitutie', 4);

-- ============================================================
-- EMAIL TEMPLATES
-- ============================================================
INSERT INTO email_templates (slug, name, subject, body_html, description, variables) VALUES
('booking_confirmed', 'Boekingsbevestiging', 'Uw reservering is bevestigd — {{reference}}',
'<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
<div style="background:#0a2240;padding:24px;text-align:center">
  <h1 style="color:#e8a020;margin:0;font-size:22px">Autostalling De Bazuin</h1>
  <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:13px">Harlingen · Op loopafstand van de veerboten</p>
</div>
<div style="padding:32px 24px">
  <h2 style="color:#0a2240;margin:0 0 8px">Reservering bevestigd!</h2>
  <p style="color:#555;margin:0 0 24px">Beste {{voornaam}}, uw reservering is ontvangen en bevestigd.</p>

  <div style="background:#f4f6f9;border-radius:8px;padding:20px;margin-bottom:24px">
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px">Boekingsreferentie</p>
    <p style="margin:0;font-size:24px;font-weight:700;font-family:monospace;color:#0a7c6e;letter-spacing:2px">{{reference}}</p>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;font-size:14px">Aankomst</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;font-size:14px">{{aankomst_datum}}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;font-size:14px">Vertrek</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;font-size:14px">{{vertrek_datum}}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;font-size:14px">Kenteken(s)</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;font-size:14px">{{kentekenlijst}}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;font-size:14px">Veerboot heen</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;font-size:14px">{{veerboot_heen}} om {{vertrektijd_heen}}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;font-size:14px">Veerboot terug</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;font-size:14px">{{veerboot_terug}} om {{vertrektijd_terug}}</td></tr>
    <tr><td style="padding:8px 0;color:#555;font-size:14px">Totaal betaald</td><td style="padding:8px 0;font-weight:700;font-size:16px;color:#0a7c6e">{{totaal_bedrag}}</td></tr>
  </table>

  <div style="background:#fff8e6;border:1px solid #e8a020;border-radius:8px;padding:16px;margin-bottom:24px">
    <p style="margin:0 0 8px;font-weight:700;color:#7a5010">🔑 Verplichte sleutelafgifte</p>
    <p style="margin:0;font-size:13px;color:#7a5010">Bij aankomst parkeert u uw auto op de geel gemarkeerde vakken op het buitenterrein en werpt u uw autosleutel in de beveiligde afgiftekluis. Gooi alleen de kale sleutel in de kluis — geen hoesjes, siliconen omhulsels of enveloppen.</p>
  </div>

  <div style="margin-bottom:24px">
    <a href="{{annuleringslink}}" style="display:inline-block;background:#f4f6f9;color:#0a2240;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;margin-right:8px">Reservering annuleren</a>
    <a href="{{wijzigingslink}}" style="display:inline-block;background:#f4f6f9;color:#0a2240;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600">Reservering wijzigen</a>
  </div>

  <p style="font-size:13px;color:#888">Vragen? WhatsApp ons op <a href="https://wa.me/{{whatsapp_nummer}}" style="color:#0a7c6e">+{{whatsapp_nummer}}</a></p>
</div>
<div style="background:#0a2240;padding:16px;text-align:center">
  <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:0">Autostalling De Bazuin · Harlingen · autostallingdebazuin.nl</p>
</div>
</div>',
'Automatisch verstuurd na bevestigde boeking',
'["voornaam","reference","aankomst_datum","vertrek_datum","kentekenlijst","veerboot_heen","vertrektijd_heen","veerboot_terug","vertrektijd_terug","totaal_bedrag","annuleringslink","wijzigingslink","whatsapp_nummer"]'),

('checkin_confirmation', 'Check-in bevestiging', 'Uw auto is ingecheckt — {{reference}}',
'<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
<div style="background:#0a2240;padding:24px;text-align:center">
  <h1 style="color:#e8a020;margin:0;font-size:22px">Autostalling De Bazuin</h1>
</div>
<div style="padding:32px 24px">
  <h2 style="color:#0a2240;margin:0 0 16px">✓ Uw auto is veilig ingecheckt</h2>
  <p style="color:#555">Beste {{voornaam}}, uw auto ({{kenteken}}) is ingecheckt om {{inchecktijd}}{{#if vaknummer}} op vak {{vaknummer}}{{/if}}.</p>
  {{#if extra_bericht}}<div style="background:#f4f6f9;border-radius:8px;padding:16px;margin:16px 0"><p style="margin:0;font-size:14px">{{extra_bericht}}</p></div>{{/if}}
  <div style="background:#fff8e6;border:1px solid #e8a020;border-radius:8px;padding:16px;margin:16px 0">
    <p style="margin:0 0 6px;font-weight:700;color:#7a5010">Uw auto ophalen</p>
    <p style="margin:0;font-size:13px;color:#7a5010">Uw auto moet binnen 30 minuten na aankomst van de boot opgehaald zijn. Zijn de deuren gesloten? Bel aan bij de intercom.</p>
  </div>
  <p style="font-size:13px;color:#888">Vragen? WhatsApp: <a href="https://wa.me/{{whatsapp_nummer}}" style="color:#0a7c6e">+{{whatsapp_nummer}}</a></p>
</div>
</div>',
'Optioneel verstuurd door admin bij inchecken',
'["voornaam","kenteken","reference","inchecktijd","vaknummer","extra_bericht","whatsapp_nummer"]'),

('cancellation_confirmed', 'Annuleringsbevestiging', 'Reservering geannuleerd — {{reference}}',
'<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
<div style="background:#0a2240;padding:24px;text-align:center"><h1 style="color:#e8a020;margin:0;font-size:22px">Autostalling De Bazuin</h1></div>
<div style="padding:32px 24px">
  <h2 style="color:#0a2240">Reservering geannuleerd</h2>
  <p>Beste {{voornaam}}, uw reservering {{reference}} is geannuleerd.</p>
  <p><strong>Restitutie:</strong> {{restitutie_bedrag}} ({{restitutie_pct}}%) wordt binnen 5-10 werkdagen teruggestort.</p>
  <p style="font-size:13px;color:#888">Vragen? WhatsApp: <a href="https://wa.me/{{whatsapp_nummer}}">+{{whatsapp_nummer}}</a></p>
</div></div>',
'Automatisch verstuurd bij annulering',
'["voornaam","reference","restitutie_bedrag","restitutie_pct","whatsapp_nummer"]'),

('modification_confirmed', 'Wijzigingsbevestiging', 'Reservering gewijzigd — {{reference}}',
'<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
<div style="background:#0a2240;padding:24px;text-align:center"><h1 style="color:#e8a020;margin:0;font-size:22px">Autostalling De Bazuin</h1></div>
<div style="padding:32px 24px">
  <h2 style="color:#0a2240">Reservering gewijzigd</h2>
  <p>Beste {{voornaam}}, uw reservering {{reference}} is gewijzigd.</p>
  <p><strong>Nieuwe aankomst:</strong> {{nieuwe_aankomst}}<br><strong>Nieuw vertrek:</strong> {{nieuw_vertrek}}</p>
  <p style="font-size:13px;color:#888">Vragen? WhatsApp: <a href="https://wa.me/{{whatsapp_nummer}}">+{{whatsapp_nummer}}</a></p>
</div></div>',
'Verstuurd na wijziging reservering',
'["voornaam","reference","nieuwe_aankomst","nieuw_vertrek","whatsapp_nummer"]');

-- ============================================================
-- SETTINGS
-- ============================================================
INSERT INTO settings (key, value, description) VALUES
  ('vat_percentage', '21', 'BTW percentage'),
  ('on_site_surcharge', '5.00', 'Toeslag ter plekke betalen (per auto)'),
  ('max_vehicles_per_booking', '5', 'Maximum aantal auto''s per boeking'),
  ('booking_url', 'https://parkeren-harlingen.nl', 'URL klantportal'),
  ('admin_url', 'https://admin.autostallingdebazuin.nl', 'URL admin portaal'),
  ('company_name', 'Autostalling De Bazuin', 'Bedrijfsnaam'),
  ('company_address', 'Franekereind 13, 8861 KL Harlingen', 'Adres'),
  ('company_phone', '+31 517 412345', 'Telefoonnummer'),
  ('company_email', 'info@autostallingdebazuin.nl', 'E-mailadres'),
  ('company_whatsapp', '31612345678', 'WhatsApp nummer (zonder +)'),
  ('checkin_instructions',
   'Bij aankomst parkeert u uw auto op de geel gemarkeerde vakken op het buitenterrein. Gooi uw kale autosleutel (zonder hoesje of envelop) in de beveiligde afgiftekluis. Wij rijden uw auto zo snel mogelijk naar binnen.',
   'Sleutelafgifte instructies (getoond in boekingsmail en boekingsproces)');
