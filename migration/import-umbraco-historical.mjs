/**
 * ================================================================
 * Umbraco → Bazuin PMS  —  Historische bulk-import
 * ================================================================
 * Importeert ALLE historische reserveringen uit Umbraco
 * (aankomsten vóór de cutover-datum van het nieuwe systeem).
 *
 * Gebruik (op de VPS):
 *        node migration/import-umbraco-historical.mjs
 *
 *   Het script logt automatisch in op Umbraco met de ingebouwde credentials.
 *   Optioneel: UMBRACO_TOKEN="<token>" meegeven om auto-login over te slaan.
 *
 * Opties:
 *   --from 2016-01-01   Begindatum (default: 2016-01-01)
 *   --to   2026-04-09   Einddatum   (default: gisteren tov cutover)
 *   --dry-run           Niet schrijven, alleen tellen
 *   --month 2023-06     Importeer slechts één maand
 *   --debug             Toon volledige API-respons per boeking
 * ================================================================
 */

import pg from 'pg';
import { randomUUID } from 'crypto';

const { Pool } = pg;

// ── Config ────────────────────────────────────────────────────────────────────
const UMBRACO_BASE   = 'https://cms.autostallingdebazuin.nl';
const UMBRACO_USER   = 'info@parkeren-harlingen.nl';
const UMBRACO_PASS   = '2u^6_)s^%N';
const PARKING_LOT_ID = 'b0000000-0000-0000-0000-000000000001';
const RATE_ID        = '00000000-0000-0000-0000-000000000001';
const DB_URL         = 'postgresql://bazuin:BKNq9PBh@localhost:5432/bazuin_pms';

// Statussen om te proberen in de list-API (Umbraco-waarden)
const STATE_FILTERS = ['All', 'Booked', 'CheckedIn', 'CheckedOut', 'Completed', 'Cancelled', 'NoShow'];

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg  = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i+1] : null; };
const hasFlag = (flag) => args.includes(flag);

const FROM_DATE = getArg('--from') || '2016-01-01';
const TO_DATE   = getArg('--to')   || '2026-04-09';
const DRY_RUN   = hasFlag('--dry-run');
const DEBUG     = hasFlag('--debug');
const SINGLE_MONTH = getArg('--month'); // bijv. "2023-06"

let TOKEN = process.env.UMBRACO_TOKEN || '';

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (h, m) => (h != null && m != null) ? `${pad(h)}:${pad(m)}` : null;

function normalizePlate(p) {
  if (!p) return null;
  const n = p.replace(/[-\s]/g, '').toUpperCase();
  return n.length > 0 && n.length <= 12 ? n : null;
}

// Kentekens uit beschrijvingstekst halen (patroon: XX-999-XX of 9-XXX-99 etc.)
function extractPlatesFromText(text) {
  if (!text) return [];
  // Standaard NL-patroon met koppeltekens
  const matches = text.match(/\b([A-Z]{1,3}-\d{2,3}-[A-Z]{0,3}\d{0,2}|\d{1,2}-[A-Z]{2,3}-\d{1,2}|[A-Z]{2}-\d{2}-[A-Z]{2}|\d{2}-[A-Z]{2,3}-\d{1,2})\b/gi) || [];
  return matches.map(p => normalizePlate(p)).filter(Boolean);
}

function splitName(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: 'Onbekend', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  const last = parts.pop();
  return { first: parts.join(' '), last };
}

function mapStatus(r, today) {
  if (r.cancelled === true) return 'cancelled';
  const dep = r.endDate ? r.endDate.slice(0, 10) : r.departure;
  if (dep && dep < today) return 'completed';
  return 'booked';
}

function mapPaymentMethod(method) {
  if (!method) return null;
  const m = method.toLowerCase();
  if (m === 'ideal') return 'ideal';
  if (m === 'paypal') return 'paypal';
  if (m === 'sepa') return 'sepa';
  if (m === 'bancontact') return 'bancontact';
  if (['mastercard','visa','amex','card','creditcard'].some(x => m.includes(x))) return 'card';
  return null;
}

// Bepaal aantal voertuigen op basis van items (laadregels)
// Zoek naar "Parkeerplaats" of "Auto parkeren" regels
function countParkingItemVehicles(items) {
  if (!Array.isArray(items)) return 1;
  let total = 0;
  for (const item of items) {
    const name = (item.name || item.Name || item.description || '').toLowerCase();
    if (name.includes('parkeer') || name.includes('stalling') || name.includes('auto')) {
      const qty = parseInt(item.quantity ?? item.Quantity ?? item.count ?? 1);
      if (!isNaN(qty)) total += qty;
    }
  }
  return Math.max(total, 1);
}

// ── Umbraco API ───────────────────────────────────────────────────────────────

async function login() {
  console.log('Inloggen op Umbraco...');
  const res = await fetch(`${UMBRACO_BASE}/umbraco/management/api/v1/security/back-office/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      username: UMBRACO_USER,
      password: UMBRACO_PASS,
      client_id: 'umbraco-back-office',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Login mislukt (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const token = data.access_token || data.token || data.accessToken;
  if (!token) throw new Error('Geen access_token in login-respons: ' + JSON.stringify(data).slice(0, 200));
  console.log('✓ Ingelogd\n');
  return token;
}

async function fetchWithToken(url, method = 'GET') {
  const res = await fetch(url, {
    method,
    headers: { 'Authorization': `Bearer ${TOKEN}` },
  });
  if (res.status === 401) throw new Error('Token verlopen — haal een nieuw token op uit de browser');
  // 404 kan ook "geen resultaten" zijn voor sommige stateFilter-waarden
  if (res.status === 404) return { items: [] };
  if (!res.ok) throw new Error(`API fout ${res.status} voor ${url}`);
  return res.json();
}

// Haalt alle reserveringen op voor een maand via de list-API
// Probeert meerdere stateFilter-waarden en pagineert tot er niets meer is.
async function fetchMonthReservations(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const startDate = `${yearMonth}-01T00:00:00`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${yearMonth}-${pad(lastDay)}T23:59:59`;

  const seen = new Map(); // id → record
  let workingStateFilters = [];

  for (const stateFilter of STATE_FILTERS) {
    let skip = 0;
    const take = 200;
    let fetched = 0;
    let firstPage = true;

    while (true) {
      const url = `${UMBRACO_BASE}/umbraco/management/api/v1/reservation/list`
        + `?startDate=${startDate}&endDate=${endDate}&dateFilterBy=Arrival`
        + `&stateFilter=${stateFilter}&orderBy=FerryHour&skip=${skip}&take=${take}`;

      let data;
      try {
        // De Umbraco list-endpoint vereist POST (ook al zijn het query-params)
        data = await fetchWithToken(url, 'POST');
      } catch (err) {
        if (firstPage) {
          // Sla ongeldige stateFilter over
          break;
        }
        throw err;
      }

      const items = data.items ?? data.Items ?? data.data ?? (Array.isArray(data) ? data : []);
      fetched += items.length;

      for (const item of items) {
        const id = item.reservationId ?? item.ReservationId ?? item.id ?? item.Id;
        if (id != null && !seen.has(id)) {
          seen.set(id, item);
        }
      }

      if (items.length > 0 && firstPage) {
        workingStateFilters.push(stateFilter);
      }

      firstPage = false;
      if (items.length < take) break;
      skip += take;
    }
  }

  return { records: [...seen.values()], workingStateFilters };
}

// Haalt volledige details op voor één Umbraco reservering
async function fetchDetail(umbId) {
  try {
    const r = await fetchWithToken(
      `${UMBRACO_BASE}/umbraco/management/api/v1/reservation/get?id=${umbId}`
    );
    // Lege response of lege items array = niet gevonden
    if (!r || (Array.isArray(r.items) && r.items.length === 0 && !r.startDate)) return null;
    return r;
  } catch {
    return null;
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function matchFerryDestination(client, date, timeStr, direction) {
  if (!timeStr || !date) return null;
  const res = await client.query(
    `SELECT destination FROM ferry_schedules
     WHERE schedule_date = $1 AND direction = $2
       AND ABS(EXTRACT(EPOCH FROM (departure_time - $3::time)) / 60) <= 20
     ORDER BY ABS(EXTRACT(EPOCH FROM (departure_time - $3::time)))
     LIMIT 1`,
    [date, direction, timeStr]
  );
  return res.rows[0]?.destination ?? null;
}

async function matchEvService(client, itemName) {
  const kwhMatch = (itemName || '').match(/(\d+)\s*kWh/i);
  if (kwhMatch) {
    const res = await client.query(
      `SELECT id, kwh FROM services WHERE kwh = $1 AND is_active = true LIMIT 1`,
      [parseInt(kwhMatch[1])]
    );
    return res.rows[0] ?? null;
  }
  if (/laden|opladen/i.test(itemName)) {
    const res = await client.query(
      `SELECT id, kwh FROM services WHERE name ILIKE '%laden%' AND is_active = true ORDER BY price DESC LIMIT 1`
    );
    return res.rows[0] ?? null;
  }
  return null;
}

// Controleer of een reservering al bestaat (op referentie of admin_notes)
async function alreadyExists(client, umbId, reference) {
  const r1 = await client.query(
    `SELECT id FROM reservations WHERE reference = $1`, [reference]
  );
  if (r1.rows.length > 0) return true;
  const r2 = await client.query(
    `SELECT id FROM reservations WHERE admin_notes LIKE $1 LIMIT 1`,
    [`%Umbraco #${umbId}%`]
  );
  return r2.rows.length > 0;
}

// ── Import één reservering ────────────────────────────────────────────────────

async function importReservation(client, item, today) {
  // Probeer eerst de volledige detail op te halen
  const umbId = item.reservationId ?? item.ReservationId ?? item.id ?? item.Id;
  if (!umbId) return { result: 'skip', reason: 'geen id' };

  const year = new Date().getFullYear();
  const reference = `DB-${year}-U${umbId}`;

  if (await alreadyExists(client, umbId, reference)) {
    return { result: 'skip', reason: 'al aanwezig' };
  }

  // Volledige detail ophalen
  const r = await fetchDetail(umbId) ?? item;

  // Klantdata
  const customer = r.customer ?? {};
  const fullName  = customer.fullName ?? r.customerName ?? item.customerName ?? '';
  const { first, last } = splitName(fullName);
  const email = (customer.emailAddress ?? r.email ?? item.email ?? '').toLowerCase().trim()
    || `umbraco-hist-${umbId}@noemail.local`;
  const phone = customer.phoneNumber ?? customer.telephone ?? r.phone ?? item.phone ?? '';

  // Klant upserten
  const custRes = await client.query(
    `INSERT INTO customers (id, first_name, last_name, email, phone, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
     ON CONFLICT (email) DO UPDATE SET
       first_name = CASE WHEN customers.first_name='' THEN EXCLUDED.first_name ELSE customers.first_name END,
       last_name  = CASE WHEN customers.last_name=''  THEN EXCLUDED.last_name  ELSE customers.last_name  END,
       phone      = CASE WHEN customers.phone=''      THEN EXCLUDED.phone      ELSE customers.phone      END,
       updated_at = NOW()
     RETURNING id`,
    [randomUUID(), first, last, email, phone]
  );
  const customerId = custRes.rows[0].id;

  // Datums
  const arrival   = (r.startDate ?? item.startDate ?? '').slice(0, 10);
  const departure = (r.endDate   ?? item.endDate   ?? '').slice(0, 10);
  if (!arrival || !departure) return { result: 'error', reason: 'geen datum' };

  // Vertrektijden
  const outH = r.ferryDepartureHour ?? item.depH ?? item.ferryDepartureHour;
  const outM = r.ferryDepartureMinutes ?? item.depM ?? item.ferryDepartureMinutes;
  const retH = r.ferryReturnHour ?? item.retH ?? item.ferryReturnHour;
  const retM = r.ferryReturnMinutes ?? item.retM ?? item.ferryReturnMinutes;
  const outTime = fmtTime(outH, outM);
  const retTime = fmtTime(retH, retM);

  // Bestemming
  const outDest = await matchFerryDestination(client, arrival, outTime, 'outbound');

  // Betaalstatus
  const isPaid = r.isPaid ?? item.isPaid ?? item.paid ?? false;
  const paymentMethod = mapPaymentMethod(r.paymentMethod ?? item.paymentMethod ?? item.method);
  const stripeId = r.paymentIntentId ?? item.stripe ?? null;
  const payStatus = isPaid ? 'paid' : 'pending';

  // Status
  const isCancelled = r.cancelled ?? item.cancelled ?? false;
  const status = isCancelled ? 'cancelled'
    : (departure < today ? 'completed' : 'booked');

  // Prijs
  const totalPrice = parseFloat(r.price ?? item.price ?? 0);

  // Klantopmerking
  const customerNote = [
    r.message, r.note, r.notes, r.comment, r.customerMessage, r.customerNote, r.remarks,
    (r.description ?? item.note ?? '').replace(/Imported from v1[^\r\n]*/gi, '').trim() || null,
  ].find(v => typeof v === 'string' && v.trim()) ?? null;

  // Admin notes — inclusief origineel v1-ID als aanwezig
  const origId = (r.description ?? item.note ?? '').match(/Original ID:\s*(\d+)/i)?.[1];
  const adminNotes = [
    `Import Umbraco #${umbId}`,
    origId ? `v1-id: ${origId}` : null,
  ].filter(Boolean).join(' — ');

  // EV-laadservice
  const items = r.items ?? [];
  const evItem = items.find(i => /laden|opladen/i.test(i.name ?? i.description ?? ''));
  const evService = evItem ? await matchEvService(client, evItem.name ?? evItem.description) : null;

  // Aantal voertuigen + kentekens
  const mainPlate  = normalizePlate(r.licensePlate ?? item.plate ?? '');
  const descPlates = extractPlatesFromText(r.description ?? item.note ?? '');

  // Bepaal aantal auto's
  const nVehiclesFromItems = countParkingItemVehicles(items);
  const nVehiclesFromField = parseInt(r.numberOfVehicles ?? r.places ?? item.places ?? 0) || 0;
  const nVehicles = Math.max(
    descPlates.length > 0 ? descPlates.length : (mainPlate ? 1 : 0),
    nVehiclesFromItems > 1 ? nVehiclesFromItems : 0,
    nVehiclesFromField,
    mainPlate ? 1 : 1, // altijd minimaal 1
  );

  // Stel de kentekens samen
  let plates = [];
  if (descPlates.length >= nVehicles) {
    plates = descPlates.slice(0, nVehicles);
  } else if (descPlates.length > 0) {
    plates = [...descPlates];
    while (plates.length < nVehicles) plates.push(`ONBEKEND${plates.length + 1}`);
  } else if (mainPlate) {
    plates = [mainPlate];
    while (plates.length < nVehicles) plates.push(`ONBEKEND${plates.length + 1}`);
  } else {
    plates = Array.from({ length: nVehicles }, (_, i) => `ONBEKEND${i + 1}`);
  }

  if (DEBUG) {
    console.log(`\n  DEBUG #${umbId}:`, JSON.stringify({
      fullName, arrival, departure, outTime, retTime, outDest, isPaid, status,
      totalPrice, nVehicles, plates, evService: evService?.kwh ?? null,
      nVehiclesFromItems, nVehiclesFromField, descPlates, mainPlate,
    }, null, 2));
  }

  if (DRY_RUN) {
    const isFast = r.isFastFerry ?? item.fast ?? false;
    return { result: 'dry', umbId, fullName, arrival, departure, outTime, outDest, plates, status, totalPrice, evService };
  }

  // ── DB schrijven ──
  const resId = randomUUID();

  await client.query(
    `INSERT INTO reservations (
      id, reference, customer_id, parking_lot_id, rate_id,
      status, payment_status, payment_method, stripe_payment_intent_id,
      arrival_date, departure_date,
      ferry_outbound_time, ferry_outbound_destination, is_fast_ferry_outbound,
      ferry_return_time, ferry_return_custom_time, ferry_return_custom,
      base_price, services_total, total_price,
      notes, admin_notes, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,$9,
      $10,$11,
      $12,$13,$14,
      $15,NULL,false,
      $16,0,$16,
      $17,$18,NOW(),NOW()
    )`,
    [
      resId, reference, customerId, PARKING_LOT_ID, RATE_ID,
      status, payStatus, paymentMethod, stripeId,
      arrival, departure,
      outTime, outDest, r.isFastFerry ?? item.fast ?? false,
      retTime,
      totalPrice,
      customerNote,
      adminNotes,
    ]
  );

  // Voertuigen invoegen
  for (let i = 0; i < plates.length; i++) {
    const isEvVehicle = i === 0 && evService != null;
    await client.query(
      `INSERT INTO vehicles (reservation_id, license_plate, ev_service_id, ev_kwh, ev_price, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT DO NOTHING`,
      [
        resId,
        plates[i],
        isEvVehicle ? evService.id : null,
        isEvVehicle ? evService.kwh : null,
        isEvVehicle ? (evItem?.price ?? evItem?.unitPrice ?? 0) : null,
        i,
      ]
    );
  }

  // EV-laadservice koppelen
  if (evService) {
    const vRes = await client.query(
      `SELECT id FROM vehicles WHERE reservation_id=$1 AND sort_order=0`, [resId]
    );
    if (vRes.rows.length > 0) {
      await client.query(
        `INSERT INTO reservation_services (reservation_id, service_id, vehicle_id, quantity, unit_price, total_price)
         VALUES ($1,$2,$3,1,$4,$4)
         ON CONFLICT DO NOTHING`,
        [resId, evService.id, vRes.rows[0].id, evItem?.price ?? evItem?.unitPrice ?? 0]
      );
    }
  }

  return { result: 'imported', umbId, fullName, arrival, outTime, outDest, plates, status };
}

// ── Maand-iterator ────────────────────────────────────────────────────────────

function* iterateMonths(from, to) {
  let [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (fy < ty || (fy === ty && fm <= tm)) {
    yield `${fy}-${pad(fm)}`;
    fm++;
    if (fm > 12) { fm = 1; fy++; }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const pool = new Pool({ connectionString: DB_URL });

  // Auto-login als er geen token meegegeven is
  if (!TOKEN) {
    try {
      TOKEN = await login();
    } catch (err) {
      console.error('❌ Auto-login mislukt:', err.message);
      console.error('   Geef een token mee via: UMBRACO_TOKEN="..." node import-umbraco-historical.mjs');
      process.exit(1);
    }
  }

  console.log('='.repeat(65));
  console.log('  Umbraco Historische Bulk-Import');
  console.log('='.repeat(65));
  console.log(`  Van:      ${FROM_DATE}`);
  console.log(`  Tot:      ${TO_DATE}`);
  console.log(`  Dry-run:  ${DRY_RUN ? 'JA' : 'nee'}`);
  console.log('='.repeat(65) + '\n');

  const months = SINGLE_MONTH
    ? [SINGLE_MONTH]
    : [...iterateMonths(FROM_DATE.slice(0, 7), TO_DATE.slice(0, 7))];

  console.log(`${months.length} maanden te verwerken: ${months[0]} → ${months[months.length - 1]}\n`);

  // Ontdek werkende stateFilters via de eerste maand
  let discoveredFilters = STATE_FILTERS;
  console.log('Detecteren werkende stateFilter-waarden...');
  const probe = await fetchMonthReservations(months[0]);
  if (probe.workingStateFilters.length > 0) {
    discoveredFilters = probe.workingStateFilters;
    console.log(`Werkende stateFilters: ${discoveredFilters.join(', ')}\n`);
  } else {
    console.log('Geen specifieke filters herkend — probeer alle waarden\n');
  }

  let totalImported = 0;
  let totalSkipped  = 0;
  let totalErrors   = 0;
  let totalDry      = 0;

  for (const month of months) {
    process.stdout.write(`📅 ${month} ... `);

    let monthData;
    try {
      monthData = await fetchMonthReservations(month);
    } catch (err) {
      console.log(`❌ API-fout: ${err.message}`);
      if (err.message.includes('Token')) { console.error('\nToken verlopen. Stop.'); break; }
      totalErrors++;
      continue;
    }

    const { records } = monthData;
    if (records.length === 0) {
      console.log('geen reserveringen');
      continue;
    }

    let mImported = 0, mSkipped = 0, mErrors = 0, mDry = 0;
    const client = await pool.connect();

    try {
      for (const item of records) {
        try {
          await client.query('BEGIN');
          const res = await importReservation(client, item, today);

          if (res.result === 'imported') {
            await client.query('COMMIT');
            mImported++;
            if (!DEBUG) {
              const evLabel = res.evService ? ` ⚡${res.evService.kwh ?? 'vol'}` : '';
              console.log(`\n  ✓ #${res.umbId} ${res.fullName} | ${res.arrival} ${res.outTime ?? '--:--'} ${res.outDest ?? '?'} | ${res.plates.join('+')} | ${res.status}${evLabel}`);
            }
          } else if (res.result === 'dry') {
            await client.query('ROLLBACK');
            mDry++;
            const evLabel = res.evService ? ` ⚡` : '';
            console.log(`\n  [dry] #${res.umbId} ${res.fullName} | ${res.arrival} ${res.outTime ?? '--:--'} ${res.outDest ?? '?'} | ${res.plates.join('+')} | ${res.status} | €${res.totalPrice}${evLabel}`);
          } else {
            await client.query('ROLLBACK');
            mSkipped++;
          }
        } catch (err) {
          await client.query('ROLLBACK');
          const umbId = item.reservationId ?? item.id ?? '?';
          console.log(`\n  ✗ #${umbId} fout: ${err.message}`);
          mErrors++;
        }
      }
    } finally {
      client.release();
    }

    const summary = `gevonden ${records.length}, geïmporteerd ${mImported}${mDry ? ` (dry: ${mDry})` : ''}, overgeslagen ${mSkipped}, fouten ${mErrors}`;
    if (mImported > 0 || mErrors > 0 || mDry > 0) {
      console.log(`\n  → ${summary}`);
    } else {
      console.log(summary);
    }

    totalImported += mImported;
    totalSkipped  += mSkipped;
    totalErrors   += mErrors;
    totalDry      += mDry;

    // Korte pauze zodat de API niet overbelast raakt
    await new Promise(r => setTimeout(r, 200));
  }

  await pool.end();

  console.log('\n' + '='.repeat(65));
  console.log('  Resultaat');
  console.log('='.repeat(65));
  console.log(`  Geïmporteerd:  ${totalImported}`);
  if (DRY_RUN) console.log(`  Dry-run:       ${totalDry}`);
  console.log(`  Al aanwezig:   ${totalSkipped}`);
  console.log(`  Fouten:        ${totalErrors}`);
  console.log('='.repeat(65) + '\n');

  if (totalErrors > 0) {
    console.log('⚠️  Er zijn fouten opgetreden. Controleer de output hierboven.');
    console.log('   Het script is idempotent — opnieuw uitvoeren is veilig.\n');
  }
}

main().catch(err => {
  console.error('\n💥 Fatale fout:', err.message);
  process.exit(1);
});
