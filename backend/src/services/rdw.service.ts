import axios from 'axios';
import { query } from '../db/pool';

interface RdwVehicle {
  kenteken: string;
  merk: string;
  handelsbenaming: string;
  eerste_kleur: string;
  brandstof_omschrijving: string;
  voertuigsoort: string;
  datum_eerste_toelating: string;
  inrichting: string;
}

interface RdwFuelEntry {
  kenteken: string;
  brandstof_omschrijving: string;
  // BEV
  actie_radius_enkel_elektrisch_wltp?: string;
  elektrisch_verbruik_enkel_elektrisch_wltp?: string;
  actie_radius_enkel_elektrisch_stad_wltp?: string;
  // PHEV (WLTP)
  actie_radius_extern_opladen_wltp?: string;
  elektrisch_verbruik_extern_opladen_wltp?: string;
  // Oudere velden (voertuigen van vóór WLTP, bv. bouwjaar < ~2018)
  actieradius_extern_oplaadbaar?: string;              // EV-bereik extern opladen (km)
  elektriciteitsverbruik_gewogen_gecombineerd?: string; // Wh/km (gewogen gecombineerd)
  klasse_hybride_elektrisch_voertuig?: string;          // "OVC-HEV" = plug-in (extern oplaadbaar)
}

export interface EvInfo {
  wltpRangeKm: number;        // WLTP EV bereik in km
  wltpConsumptionWhPerKm: number; // WLTP verbruik Wh/km
  batteryCapacityKwh: number; // Geschatte accucapaciteit in kWh
  realisticKmPerKwh: number;  // Realistisch bereik per geladen kWh (×0.85)
  suggestedKwh: number;       // Aanbevolen laadpakket
  maxKwh: number;             // Accucapaciteit (grens voor frontend filter)
  isBev: boolean;             // true = volledig elektrisch, false = PHEV
}

export interface VehicleInfo {
  licensePlate: string;
  make: string;
  model: string;
  color: string;
  fuelType: string;
  year: number | null;
  vehicleType: string;
  ev?: EvInfo;
}

// Normalize Dutch license plate to standard format (no dashes, uppercase)
export function normalizePlate(plate: string): string {
  return plate.replace(/[-\s]/g, '').toUpperCase();
}

// Format plate for display
export function formatPlate(plate: string): string {
  return normalizePlate(plate);
}

/**
 * Look up vehicle info from the Dutch RDW open data API.
 * Caches results in the vehicles table.
 */
export async function lookupRdw(rawPlate: string): Promise<VehicleInfo | null> {
  const plate = normalizePlate(rawPlate);

  try {
    const response = await axios.get<RdwVehicle[]>(
      `${process.env.RDW_BASE_URL || 'https://opendata.rdw.nl/resource'}/m9d7-ebf2.json`,
      {
        params: { kenteken: plate },
        timeout: 5000,
        headers: { 'Accept': 'application/json' },
      }
    );

    if (!response.data || response.data.length === 0) {
      return null;
    }

    const vehicle = response.data[0];

    // Fetch fuel entries (brandstof) for fuel type + EV data
    let fuelType = 'Onbekend';
    let evInfo: EvInfo | undefined;
    try {
      const fuelResponse = await axios.get<RdwFuelEntry[]>(
        `${process.env.RDW_BASE_URL || 'https://opendata.rdw.nl/resource'}/8ys7-d773.json`,
        { params: { kenteken: plate }, timeout: 3000 }
      );
      if (fuelResponse.data && fuelResponse.data.length > 0) {
        const entries = fuelResponse.data;
        const num = (v?: string) => { const n = v != null ? parseFloat(v) : NaN; return Number.isFinite(n) ? n : 0; };
        const combustionRe = /benzine|diesel|lpg|cng|gas|waterstof|alcohol/i;

        const electricEntry = entries.find(e => /elektr|electric/i.test(e.brandstof_omschrijving || ''));
        const hasCombustion = entries.some(e => combustionRe.test(e.brandstof_omschrijving || ''));

        // Weergegeven brandstof: bij hybride alle brandstoffen tonen (bv. "Benzine / Elektriciteit")
        fuelType = entries.length > 1
          ? entries.map(e => e.brandstof_omschrijving).filter(Boolean).join(' / ')
          : (entries[0].brandstof_omschrijving || 'Onbekend');

        // Kan de auto extern opladen? Plug-in (OVC-HEV) of een extern-oplaadbaar-bereik > 0.
        // Zo blijven gewone/mild-hybrides (niet oplaadbaar) terecht uitgesloten.
        // OVC-HEV = plug-in (extern oplaadbaar). Let op: NOVC-HEV = NIET oplaadbaar,
        // dus een woordgrens gebruiken zodat "NOVC-HEV" niet meetelt.
        const isOvcHev = entries.some(e => /\bOVC-HEV\b/i.test(e.klasse_hybride_elektrisch_voertuig || ''));
        const externalRange = Math.max(0, ...entries.map(e => num(e.actieradius_extern_oplaadbaar)));
        const combinedElecConsumption = Math.max(0, ...entries.map(e => num(e.elektriciteitsverbruik_gewogen_gecombineerd)));

        if (electricEntry) {
          // Bereik: WLTP indien beschikbaar, anders het oudere extern-oplaadbaar-bereik.
          const wltpRange = num(electricEntry.actie_radius_enkel_elektrisch_wltp)
            || num(electricEntry.actie_radius_extern_opladen_wltp);
          const range = wltpRange > 0 ? wltpRange : externalRange;

          // Verbruik: WLTP indien beschikbaar, anders gewogen gecombineerd, anders ~200 Wh/km.
          const wltpConsumption = num(electricEntry.elektrisch_verbruik_enkel_elektrisch_wltp)
            || num(electricEntry.elektrisch_verbruik_extern_opladen_wltp);
          const consumption = wltpConsumption > 0 ? wltpConsumption : (combinedElecConsumption > 0 ? combinedElecConsumption : 200);

          // Alleen laden aanbieden als de auto ook echt extern oplaadbaar is.
          const chargeable = range > 0 || isOvcHev || externalRange > 0;

          if (chargeable) {
            const batteryCapacity = range > 0
              ? Math.round((range * consumption / 1000) * 10) / 10
              : 8; // extern oplaadbaar maar geen bereik bekend → veilige standaard
            const realisticKmPerKwh = Math.round((1000 / consumption) * 0.85 * 10) / 10;
            const isBev = !hasCombustion; // BEV = geen verbrandingsmotor; anders PHEV
            // BEV: adviseer ~50% (rijdt nooit leeg); PHEV: adviseer volledige lading
            const suggestedKwh = isBev
              ? Math.round(batteryCapacity * 0.5 * 10) / 10
              : batteryCapacity;
            evInfo = {
              wltpRangeKm: range,
              wltpConsumptionWhPerKm: consumption,
              batteryCapacityKwh: batteryCapacity,
              realisticKmPerKwh,
              suggestedKwh,
              maxKwh: batteryCapacity,
              isBev,
            };
          }
        }
      }
    } catch {
      // Fuel lookup failed, use default
    }

    const year = vehicle.datum_eerste_toelating
      ? parseInt(vehicle.datum_eerste_toelating.substring(0, 4))
      : null;

    return {
      licensePlate: plate,
      make: titleCase(vehicle.merk || ''),
      model: titleCase(vehicle.handelsbenaming || ''),
      color: titleCase(vehicle.eerste_kleur || ''),
      fuelType: titleCase(fuelType),
      year,
      vehicleType: titleCase(vehicle.voertuigsoort || ''),
      ev: evInfo,
    };
  } catch (err) {
    // RDW API unavailable — fail silently, return null
    console.warn('RDW lookup failed for plate', plate, err);
    return null;
  }
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
