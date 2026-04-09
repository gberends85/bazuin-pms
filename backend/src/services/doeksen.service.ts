// ── Doeksen API Sync Service ───────────────────────────────────
// Haalt automatisch afvaartschema's op van api-2021.rederij-doeksen.nl
// en schrijft ze naar ferry_schedules in de database.

import { query } from '../db/pool';

const DOEKSEN_API = 'https://api-2021.rederij-doeksen.nl';

// Mapping Doeksen vessel-code → ferry_id in onze database
const VESSEL_TO_FERRY_ID: Record<string, string> = {
  FR:  'f0000000-0000-0000-0000-000000000001', // ms. Friesland (Veerdienst Terschelling)
  WDV: 'f0000000-0000-0000-0000-000000000001', // ms. Willem de Vlamingh (Veerdienst Terschelling)
  TI:  'f0000000-0000-0000-0000-000000000003', // Sneldienst Terschelling
  VL:  'f0000000-0000-0000-0000-000000000002', // Veerdienst Vlieland
  KW:  'f0000000-0000-0000-0000-000000000002', // Veerdienst Vlieland (alternatief)
  MK:  'f0000000-0000-0000-0000-000000000002', // Veerdienst Vlieland (alternatief)
};

// Routes die we ophalen: [van, naar, destination, direction]
const ROUTES = [
  { from: 'H', to: 'T', destination: 'terschelling', direction: 'outbound' },
  { from: 'T', to: 'H', destination: 'terschelling', direction: 'return'   },
  { from: 'H', to: 'V', destination: 'vlieland',     direction: 'outbound' },
  { from: 'V', to: 'H', destination: 'vlieland',     direction: 'return'   },
] as const;

interface DoeksenDeparture {
  vessel: string;
  departureDateTime: string;
  arrivalDateTime: string;
  status: string;
}

async function fetchDepartures(from: string, to: string, date: Date): Promise<DoeksenDeparture[]> {
  // Doeksen verwacht datum als ISO string met T02:00:00.000Z
  const dateStr = date.toISOString().slice(0, 10) + 'T02:00:00.000Z';
  const url = `${DOEKSEN_API}/departures/${from}/${to}/${dateStr}`;

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Doeksen API fout ${res.status} voor ${from}→${to} op ${dateStr}`);
  }

  const data = await res.json() as { departures: DoeksenDeparture[] };
  return data.departures || [];
}

function toTimeStr(isoStr: string): string {
  // "2026-04-03T15:05:00+02:00" → "15:05:00"
  const d = new Date(isoStr);
  return d.toLocaleTimeString('nl-NL', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Europe/Amsterdam',
    hour12: false,
  });
}

function toDateStr(isoStr: string): string {
  // "2026-04-03T15:05:00+02:00" → "2026-04-03"
  const d = new Date(isoStr);
  return d.toLocaleDateString('nl-NL', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: 'Europe/Amsterdam',
  }).split('-').reverse().join('-'); // dd-mm-yyyy → yyyy-mm-dd
}

export async function syncDoeksenSchedule(date: Date): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const route of ROUTES) {
    await sleep(800); // voorkom rate-limiting
    try {
      const departures = await fetchDepartures(route.from, route.to, date);

      for (const dep of departures) {
        if (dep.status === 'CANCELLED') {
          skipped++;
          continue;
        }

        const ferryId = VESSEL_TO_FERRY_ID[dep.vessel];
        if (!ferryId) {
          // Onbekend schip — sla op als Veerdienst op basis van bestemming
          const fallbackId = route.destination === 'terschelling'
            ? 'f0000000-0000-0000-0000-000000000001'
            : 'f0000000-0000-0000-0000-000000000002';

          console.warn(`Onbekend Doeksen schip "${dep.vessel}", gebruik fallback ferry_id`);

          const scheduleDate = toDateStr(dep.departureDateTime);
          const departureTime = toTimeStr(dep.departureDateTime);
          const arrivalTime = route.direction === 'return' ? toTimeStr(dep.arrivalDateTime) : null;

          await query(
            `INSERT INTO ferry_schedules
               (ferry_id, schedule_date, departure_time, arrival_harlingen, direction, destination, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (ferry_id, schedule_date, departure_time, direction) DO NOTHING`,
            [fallbackId, scheduleDate, departureTime, arrivalTime, route.direction, route.destination, `Doeksen sync: ${dep.vessel}`]
          );

          inserted++;
          continue;
        }

        const scheduleDate = toDateStr(dep.departureDateTime);
        const departureTime = toTimeStr(dep.departureDateTime);
        const arrivalTime = route.direction === 'return' ? toTimeStr(dep.arrivalDateTime) : null;

        const result = await query(
          `INSERT INTO ferry_schedules
             (ferry_id, schedule_date, departure_time, arrival_harlingen, direction, destination, notes)
           VALUES ($1, $2, $3, $4, $5, $6, 'Doeksen sync')
           ON CONFLICT (ferry_id, schedule_date, departure_time, direction) DO NOTHING`,
          [ferryId, scheduleDate, departureTime, arrivalTime, route.direction, route.destination]
        );

        if ((result.rowCount ?? 0) > 0) {
          inserted++;
        } else {
          skipped++;
        }
      }
    } catch (err: any) {
      const msg = `Fout bij route ${route.from}→${route.to}: ${err.message}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  return { inserted, skipped, errors };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Sync voor vandaag + de komende N dagen
export async function syncDoeksenScheduleDays(days = 7): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);

    const result = await syncDoeksenSchedule(date);
    const dateLabel = date.toISOString().slice(0, 10);
    console.log(`Doeksen sync ${dateLabel}: +${result.inserted} nieuw, ${result.skipped} overgeslagen${result.errors.length ? ', fouten: ' + result.errors.join('; ') : ''}`);

    // Wacht 2 seconden tussen dagen om rate-limiting te voorkomen
    if (i < days - 1) await sleep(2000);
  }
}
