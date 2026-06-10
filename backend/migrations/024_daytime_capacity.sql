-- 024: Dag-/wisselcapaciteit
-- Naast de nacht-capaciteit (online_spots / availability_overrides.available_spots)
-- voeren we een aparte, doorgaans hogere "dag-max" in: het maximale aantal voertuigen
-- dat gelijktijdig overdag aanwezig mag zijn tijdens de wisseling (vertrekkers die nog
-- staan + nieuwe aankomsten). De dag-max telt elke dag die een verblijf aanraakt
-- (aankomst- t/m vertrekdag), de nacht-max telt alleen de nachten [aankomst, vertrek).

-- Standaard dag-max per locatie (NULL → val terug op online_spots).
ALTER TABLE locations ADD COLUMN IF NOT EXISTS daytime_spots INTEGER;
UPDATE locations SET daytime_spots = 70 WHERE daytime_spots IS NULL;

-- Per-datum dag-max (NULL → gebruik de locatie-standaard). Staat naast de bestaande
-- per-datum nacht-max (available_spots) in dezelfde overrides-tabel.
ALTER TABLE availability_overrides ADD COLUMN IF NOT EXISTS daytime_spots INTEGER;

-- Nacht-max per datum mag nu ook NULL zijn (→ locatie-standaard), zodat een datum
-- uitsluitend een dag-max-override kan hebben zonder de nacht-max te wijzigen.
ALTER TABLE availability_overrides ALTER COLUMN available_spots DROP NOT NULL;
