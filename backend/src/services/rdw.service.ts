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
  // PHEV
  actie_radius_extern_opladen_wltp?: string;
  elektrisch_verbruik_extern_opladen_wltp?: string;
}

export interface EvInfo {
  wltpRangeKm: number;        // WLTP EV bereik in km
  wltpConsumptionWhPerKm: number; // WLTP verbruik Wh/km
  batteryCapacityKwh: number; // Geschatte accucapaciteit in kWh
  realisticKmPerKwh: number;  // Realistisch bereik per geladen kWh (×0.7)
  suggestedKwh: number;       // Aanbevolen laadpakket (helft accu)
  maxKwh: number;             // Max laden (= accucapaciteit)
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
        // Find primary fuel type (first entry, or electric if available)
        const entries = fuelResponse.data;
        const electricEntry = entries.find(e =>
          e.brandstof_omschrijving?.toLowerCase().includes('elektriciteit') ||
          e.brandstof_omschrijving?.toLowerCase().includes('electric')
        );
        fuelType = entries[0].brandstof_omschrijving || 'Onbekend';

        if (electricEntry) {
          // BEV: enkel elektrisch / PHEV: extern opladen
          const rangeStr = electricEntry.actie_radius_enkel_elektrisch_wltp
            || electricEntry.actie_radius_extern_opladen_wltp;
          const consumptionStr = electricEntry.elektrisch_verbruik_enkel_elektrisch_wltp
            || electricEntry.elektrisch_verbruik_extern_opladen_wltp;

          const wltpRange = rangeStr ? parseFloat(rangeStr) : 0;
          const wltpConsumption = consumptionStr ? parseFloat(consumptionStr) : 0;

          if (wltpRange > 0 && wltpConsumption > 0) {
            const batteryCapacity = Math.round((wltpRange * wltpConsumption / 1000) * 10) / 10;
            const realisticKmPerKwh = Math.round((1000 / wltpConsumption) * 0.85 * 10) / 10;
            // Adviseer volledige lading, maximaal 30 kWh (afgerond omhoog)
            const suggestedKwh = Math.min(Math.ceil(batteryCapacity), 30);
            evInfo = {
              wltpRangeKm: wltpRange,
              wltpConsumptionWhPerKm: wltpConsumption,
              batteryCapacityKwh: batteryCapacity,
              realisticKmPerKwh,
              suggestedKwh,
              maxKwh: Math.floor(batteryCapacity),
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
