-- ============================================================
-- 006_contract_invoicing.sql
-- Autostalling De Bazuin — Contractklanten met dagtarief
-- ============================================================

-- 1. Contractklanten (gescheiden van reguliere `customers`)
CREATE TABLE IF NOT EXISTS contract_customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(150) NOT NULL,
  company         VARCHAR(150),
  email           VARCHAR(255),
  phone           VARCHAR(30),
  address         VARCHAR(255),
  postal_code     VARCHAR(15),
  city            VARCHAR(100),
  btw_number      VARCHAR(30),
  daily_rate      DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  vat_percentage  DECIMAL(5,2) NOT NULL DEFAULT 21.00,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_contract_customers_updated_at
  BEFORE UPDATE ON contract_customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. Dagregistratie: aantal auto's per dag per contractklant
CREATE TABLE IF NOT EXISTS contract_day_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_customer_id  UUID NOT NULL REFERENCES contract_customers(id) ON DELETE CASCADE,
  entry_date            DATE NOT NULL,
  car_count             INTEGER NOT NULL DEFAULT 0 CHECK (car_count >= 0),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contract_customer_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_contract_day_entries_customer_date
  ON contract_day_entries(contract_customer_id, entry_date);

CREATE TRIGGER trg_contract_day_entries_updated_at
  BEFORE UPDATE ON contract_day_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Opgeslagen facturen
CREATE TABLE IF NOT EXISTS contract_invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number        VARCHAR(30) UNIQUE NOT NULL,
  contract_customer_id  UUID NOT NULL REFERENCES contract_customers(id),
  period_from           DATE NOT NULL,
  period_to             DATE NOT NULL,
  daily_rate            DECIMAL(10,2) NOT NULL,
  vat_percentage        DECIMAL(5,2) NOT NULL,
  total_cars            INTEGER NOT NULL,
  subtotal_excl_vat     DECIMAL(10,2) NOT NULL,
  vat_amount            DECIMAL(10,2) NOT NULL,
  total_incl_vat        DECIMAL(10,2) NOT NULL,
  snapshot              JSONB NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_invoices_customer
  ON contract_invoices(contract_customer_id);
CREATE INDEX IF NOT EXISTS idx_contract_invoices_created
  ON contract_invoices(created_at DESC);
