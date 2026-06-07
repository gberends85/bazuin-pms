-- ============================================================
-- 014 — Voertuigen en tariefperiode fixes
-- 1. Jan Boekel (#23120): 3 kentekens toevoegen (stonden als één string in Umbraco)
-- 2. Erik de Jong (#23090): 2e auto toevoegen (leeg; invullen bij aankomst)
-- 3. Tariefperiode: Voorjaar 2026 doorlopen t/m 29 april (gap sluiten)
-- ============================================================

BEGIN;

-- ─── Jan Boekel: 3 voertuigen (XS533Z & GH627N & GK864L) ──────────────────────
-- Umbraco had alle drie als één string: "XS533Z & GH627N & GK864L" (>12 chars → overgeslagen)
INSERT INTO vehicles (reservation_id, license_plate, sort_order) VALUES
  ('e0000000-0000-0000-0000-000000023120', 'XS533Z',  0),
  ('e0000000-0000-0000-0000-000000023120', 'GH627N',  1),
  ('e0000000-0000-0000-0000-000000023120', 'GK864L',  2);

UPDATE reservations
SET admin_notes = 'Import Umbraco #23120 — 3 voertuigen (kentekens hersteld uit aaneengesloten Umbraco-veld)'
WHERE id = 'e0000000-0000-0000-0000-000000023120';

-- ─── Erik de Jong: 2e auto toevoegen (kenteken onbekend, invullen bij aankomst) ─
-- Umbraco #23090 registreert 2 auto's; de 2e was niet in de licensePlate-import
INSERT INTO vehicles (reservation_id, license_plate, sort_order) VALUES
  ('e0000000-0000-0000-0000-000000023090', '', 1);

UPDATE reservations
SET admin_notes = 'Import Umbraco #23090 — 2 voertuigen; 2e kenteken invullen bij aankomst'
WHERE id = 'e0000000-0000-0000-0000-000000023090';

-- ─── Tariefperiode: sluit de kloof — Zomer begint 30 april ────────────────────
-- Voorjaar 2026 loopt t/m 29 april (correct).
-- Zomer 2026 begon op 1 mei → 30 april was niet gedekt.
-- "Tarieven verspringen ná 29 april" → Zomer vanaf 30 april.
UPDATE rates
SET valid_from = '2026-04-30'
WHERE id = '00000000-0000-0000-0000-000000000002'
  AND name = 'Zomer 2026';

COMMIT;
