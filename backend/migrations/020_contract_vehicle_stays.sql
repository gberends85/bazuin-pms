-- Tarieftype + vaste-periode-velden op contractklanten
ALTER TABLE contract_customers
  ADD COLUMN IF NOT EXISTS rate_type VARCHAR(20) DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS fixed_period_days INT DEFAULT 2,
  ADD COLUMN IF NOT EXISTS fixed_period_rate DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_day_rate DECIMAL(10,2) DEFAULT 0;

-- Kenteken-registratie per verblijf (voor vaste-periode-klanten)
CREATE TABLE IF NOT EXISTS contract_vehicle_stays (
  id SERIAL PRIMARY KEY,
  contract_customer_id UUID NOT NULL REFERENCES contract_customers(id) ON DELETE CASCADE,
  license_plate VARCHAR(20) NOT NULL,
  arrival_date DATE NOT NULL,
  departure_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_cvs_dates CHECK (departure_date >= arrival_date)
);

CREATE INDEX IF NOT EXISTS idx_cvs_customer_dates
  ON contract_vehicle_stays(contract_customer_id, arrival_date, departure_date);
