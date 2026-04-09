-- ============================================================
-- Autostalling De Bazuin — Complete Database Schema
-- PostgreSQL 15+
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ADMIN USERS
-- ============================================================
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LOCATIONS (Locaties)
-- ============================================================
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  address VARCHAR(255),
  total_spots INTEGER NOT NULL DEFAULT 55,
  online_spots INTEGER NOT NULL DEFAULT 50,
  checkout_margin_min INTEGER NOT NULL DEFAULT 30,
  checkin_margin_slow_min INTEGER NOT NULL DEFAULT 120,
  checkin_margin_fast_min INTEGER NOT NULL DEFAULT 90,
  whatsapp_number VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PARKING LOTS (Parkeerterreinen)
-- ============================================================
CREATE TABLE parking_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  total_spots INTEGER NOT NULL DEFAULT 55,
  is_covered BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FERRIES (Veerboten)
-- ============================================================
CREATE TABLE ferries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  duration_min INTEGER NOT NULL,
  is_fast BOOLEAN NOT NULL DEFAULT false,
  destination VARCHAR(50) CHECK (destination IN ('terschelling', 'vlieland', 'both')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily ferry schedules
CREATE TABLE ferry_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferry_id UUID NOT NULL REFERENCES ferries(id) ON DELETE CASCADE,
  schedule_date DATE NOT NULL,
  departure_time TIME NOT NULL,
  arrival_harlingen TIME,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('outbound', 'return')),
  destination VARCHAR(50) NOT NULL CHECK (destination IN ('terschelling', 'vlieland')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ferry_id, schedule_date, departure_time, direction)
);

-- Recurring schedule templates (Ma-Zo patroon)
CREATE TABLE ferry_schedule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferry_id UUID NOT NULL REFERENCES ferries(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  departure_time TIME NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('outbound', 'return')),
  destination VARCHAR(50) NOT NULL CHECK (destination IN ('terschelling', 'vlieland')),
  valid_from DATE NOT NULL,
  valid_until DATE,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================
-- RATES (Tarieven)
-- ============================================================
CREATE TABLE rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parking_lot_id UUID NOT NULL REFERENCES parking_lots(id),
  name VARCHAR(100) NOT NULL,
  base_day_price DECIMAL(10,2) NOT NULL DEFAULT 8.00,
  min_days INTEGER NOT NULL DEFAULT 1,
  max_days INTEGER NOT NULL DEFAULT 100,
  customer_info TEXT,
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Day price table per rate (dag 1..100 → prijs)
CREATE TABLE rate_day_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_id UUID NOT NULL REFERENCES rates(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  is_manual_override BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(rate_id, day_number)
);

-- Season surcharges (seizoenstarieven als % opslag)
CREATE TABLE season_surcharges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  surcharge_pct DECIMAL(5,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SERVICES (Diensten / Extra's)
-- ============================================================
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  customer_info TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit VARCHAR(20) DEFAULT 'fixed',
  kwh INTEGER,
  admin_only BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CUSTOMERS (Klanten)
-- ============================================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(30),
  btw_number VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(email)
);

-- ============================================================
-- RESERVATIONS (Reserveringen)
-- ============================================================
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference VARCHAR(20) UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  parking_lot_id UUID NOT NULL REFERENCES parking_lots(id),
  rate_id UUID REFERENCES rates(id),

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked', 'checked_in', 'completed', 'cancelled', 'no_show')),
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'on_site', 'refunded', 'partial_refund', 'failed')),
  payment_method VARCHAR(20)
    CHECK (payment_method IN ('ideal', 'card', 'paypal', 'sepa', 'bancontact', 'on_site')),

  -- Stripe
  stripe_payment_intent_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),

  -- Dates & times
  arrival_date DATE NOT NULL,
  departure_date DATE NOT NULL,
  nights INTEGER NOT NULL GENERATED ALWAYS AS (departure_date - arrival_date) STORED,

  -- Ferry outbound
  ferry_outbound_id UUID REFERENCES ferries(id),
  ferry_outbound_time TIME,
  ferry_outbound_destination VARCHAR(50) CHECK (ferry_outbound_destination IN ('terschelling', 'vlieland')),
  is_fast_ferry_outbound BOOLEAN NOT NULL DEFAULT false,

  -- Ferry return
  ferry_return_id UUID REFERENCES ferries(id),
  ferry_return_time TIME,
  ferry_return_destination VARCHAR(50) CHECK (ferry_return_destination IN ('terschelling', 'vlieland')),
  ferry_return_custom BOOLEAN NOT NULL DEFAULT false,
  ferry_return_custom_time TIME,
  is_fast_ferry_return BOOLEAN NOT NULL DEFAULT false,

  -- Pricing
  base_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  season_surcharge_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  services_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  on_site_surcharge DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  vat_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  vat_percentage DECIMAL(5,2) NOT NULL DEFAULT 21.00,

  -- Check-in
  checkin_at TIMESTAMPTZ,
  checkin_by UUID REFERENCES admin_users(id),
  parking_spot VARCHAR(20),
  checkin_mail_sent_at TIMESTAMPTZ,

  -- Cancellation
  cancellation_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES admin_users(id),
  cancellation_reason TEXT,
  refund_amount DECIMAL(10,2),
  refund_percentage INTEGER,

  -- Notes
  notes TEXT,
  admin_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- VEHICLES (Voertuigen per reservering)
-- ============================================================
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  license_plate VARCHAR(12) NOT NULL,

  -- RDW data (cached)
  rdw_make VARCHAR(100),
  rdw_model VARCHAR(100),
  rdw_color VARCHAR(50),
  rdw_fuel_type VARCHAR(50),
  rdw_year INTEGER,
  rdw_fetched_at TIMESTAMPTZ,

  -- EV charging service
  ev_service_id UUID REFERENCES services(id),
  ev_kwh INTEGER,
  ev_price DECIMAL(10,2),

  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- RESERVATION SERVICES (extra diensten per reservering)
-- ============================================================
CREATE TABLE reservation_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),
  vehicle_id UUID REFERENCES vehicles(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  notes TEXT
);

-- ============================================================
-- AVAILABILITY OVERRIDES (handmatige beschikbaarheidsaanpassing)
-- ============================================================
CREATE TABLE availability_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parking_lot_id UUID NOT NULL REFERENCES parking_lots(id),
  override_date DATE NOT NULL,
  available_spots INTEGER NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(parking_lot_id, override_date)
);

-- ============================================================
-- CANCELLATION POLICIES (Annuleringsbeleid)
-- ============================================================
CREATE TABLE cancellation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  days_before_min INTEGER NOT NULL,
  days_before_max INTEGER,
  refund_percentage INTEGER NOT NULL CHECK (refund_percentage BETWEEN 0 AND 100),
  description VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- EMAIL TEMPLATES (E-mailsjablonen)
-- ============================================================
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body_html TEXT NOT NULL,
  description TEXT,
  variables JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES admin_users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SETTINGS (Systeeminstellingen)
-- ============================================================
CREATE TABLE settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_reservations_arrival_date ON reservations(arrival_date);
CREATE INDEX idx_reservations_departure_date ON reservations(departure_date);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_reservations_payment_status ON reservations(payment_status);
CREATE INDEX idx_reservations_customer_id ON reservations(customer_id);
CREATE INDEX idx_reservations_reference ON reservations(reference);
CREATE INDEX idx_reservations_cancellation_token ON reservations(cancellation_token);
CREATE INDEX idx_vehicles_license_plate ON vehicles(license_plate);
CREATE INDEX idx_vehicles_reservation_id ON vehicles(reservation_id);
CREATE INDEX idx_ferry_schedules_date ON ferry_schedules(schedule_date);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_customers_email ON customers(email);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_admin_users_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_locations_updated_at BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ferries_updated_at BEFORE UPDATE ON ferries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_rates_updated_at BEFORE UPDATE ON rates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_reservations_updated_at BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
