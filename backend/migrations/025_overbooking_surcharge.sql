-- Overboekingstoeslag als aparte kolom op reservations, zodat de toeslag
-- zichtbaar is in de prijsopbouw én op de factuur (net als on_site_surcharge).
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS overbooking_surcharge NUMERIC(10,2) NOT NULL DEFAULT 0;
