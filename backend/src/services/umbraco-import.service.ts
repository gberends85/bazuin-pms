/**
 * Umbraco historische import service
 * Verwerkt ruwe Umbraco-reserveringsrecords naar het Bazuin PMS schema.
 */
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';

const PARKING_LOT_ID = 'b0000000-0000-0000-0000-000000000001';
const RATE_ID        = '00000000-0000-0000-0000-000000000001';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmtTime(h: any, m: any): string | null {
  return (h != null && m != null) ? `${pad(Number(h))}:${pad(Number(m))}` : null;
}

function normalizePlate(p: any): string | null {
  if (!p) return null;
  const n = String(p).replace(/[-\s]/g, '').toUpperCase();
  return n.length > 0 && n.length <= 12 ? n : null;
}

function extractPlatesFromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(
    /\b([A-Z]{1,3}-\d{2,3}-[A-Z]{0,3}\d{0,2}|\d{1,2}-[A-Z]{2,3}-\d{1,2}|[A-Z]{2}-\d{2}-[A-Z]{2}|\d{2}-[A-Z]{2,3}-\d{1,2})\b/gi
  ) || [];
  return matches.map(p => normalizePlate(p)).filter(Boolean) as string[];
}

/**
 * Haal kenteken(s) uit het plaatveld. Klanten zetten soms 2 kentekens achter
 * elkaar ("HZZ-70-J EN XX-99-YY", "AB12CD / EF34GH", "AB-12-CD, EF-34-GH").
 * We willen die als 2 aparte kentekens (= 2 plaatsen) herkennen.
 */
function parsePlatesFromField(raw: string): string[] {
  if (!raw) return [];
  // 1) Herkenbare kentekenformaten (met streepjes) eruit halen
  const found = extractPlatesFromText(raw);
  if (found.length >= 2) return found;
  // 2) Splitsen op scheidingstekens / het woord "en" en elk deel normaliseren
  const parts = raw
    .split(/\s+en\s+|\s*[,;/&+]\s*|\s{2,}/i)
    .map(p => normalizePlate(p))
    .filter((p): p is string => !!p && p.length >= 4 && p.length <= 8);
  if (parts.length >= 2) return Array.from(new Set(parts));
  // 3) Eén herkend kenteken, of het hele veld als één kenteken
  if (found.length === 1) return found;
  const single = normalizePlate(raw);
  return single ? [single] : [];
}

function splitName(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: 'Onbekend', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  const last = parts.pop()!;
  return { first: parts.join(' '), last };
}

function mapPaymentMethod(method: any): string | null {
  if (!method) return null;
  const m = String(method).toLowerCase();
  if (m === 'ideal') return 'ideal';
  if (m === 'paypal') return 'paypal';
  if (m === 'sepa') return 'sepa';
  if (m === 'bancontact') return 'bancontact';
  if (['mastercard','visa','amex','card','creditcard'].some(x => m.includes(x))) return 'card';
  return null;
}

function countParkingItemVehicles(items: any[]): number {
  if (!Array.isArray(items)) return 1;
  let total = 0;
  for (const item of items) {
    // reservationItemType=1 = parkeerplaats, =2 = service add-on (laadpaal, toeslag etc.)
    const itemType = item.reservationItemType ?? item.ReservationItemType ?? item.itemType ?? item.type;
    const name = (item.name || item.Name || item.description || '').toLowerCase();
    const isParkingItem =
      itemType === 1 ||
      name.includes('parkeer') || name.includes('stalling') || name.includes('auto') ||
      name.includes('overdekt') || name.includes('open ') || name.includes('buiten');
    if (isParkingItem) {
      const qty = parseInt(item.quantity ?? item.Quantity ?? item.count ?? 1);
      if (!isNaN(qty)) total += qty;
    }
  }
  return Math.max(total, 1);
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function matchFerryDestination(
  client: PoolClient, date: string, timeStr: string | null, direction: string
): Promise<string | null> {
  if (!timeStr || !date) return null;
  try {
    const res = await client.query(
      `SELECT destination FROM ferry_schedules
       WHERE schedule_date = $1 AND direction = $2
         AND ABS(EXTRACT(EPOCH FROM (departure_time - $3::time)) / 60) <= 20
       ORDER BY ABS(EXTRACT(EPOCH FROM (departure_time - $3::time)))
       LIMIT 1`,
      [date, direction, timeStr]
    );
    return res.rows[0]?.destination ?? null;
  } catch { return null; }
}

async function matchEvService(client: PoolClient, itemName: string): Promise<{ id: string; kwh: number } | null> {
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

async function alreadyExists(client: PoolClient, umbId: number, reference: string): Promise<boolean> {
  const r1 = await client.query(`SELECT id FROM reservations WHERE reference = $1`, [reference]);
  if (r1.rows.length > 0) return true;
  const r2 = await client.query(
    `SELECT id FROM reservations WHERE admin_notes LIKE $1 LIMIT 1`,
    [`%Umbraco #${umbId}%`]
  );
  return r2.rows.length > 0;
}

// ── Import één record ─────────────────────────────────────────────────────────

export interface ImportResult {
  result: 'imported' | 'skip' | 'error' | 'dry';
  umbId?: number;
  reason?: string;
  fullName?: string;
  arrival?: string;
  outTime?: string | null;
  outDest?: string | null;
  plates?: string[];
  status?: string;
  totalPrice?: number;
}

export async function importUmbracoRecord(
  client: PoolClient,
  item: any,
  today: string,
  dryRun = false
): Promise<ImportResult> {
  const umbId = item.reservationId ?? item.ReservationId ?? item.id ?? item.Id;
  if (!umbId) return { result: 'skip', reason: 'geen id' };

  const year = new Date().getFullYear();
  const reference = `DB-${year}-U${umbId}`;

  if (await alreadyExists(client, umbId, reference)) {
    return { result: 'skip', reason: 'al aanwezig' };
  }

  // Klantdata
  const customer = item.customer ?? {};
  const fullName = customer.fullName ?? customer.name ?? item.customerName ?? item.name ?? '';
  const { first, last } = splitName(fullName);
  const email = (
    customer.emailAddress ?? customer.email ?? item.email ?? ''
  ).toLowerCase().trim() || `umbraco-hist-${umbId}@noemail.local`;
  const phone = customer.phoneNumber ?? customer.telephone ?? item.phone ?? '';

  // Datums
  const arrival   = (item.startDate ?? '').slice(0, 10);
  const departure = (item.endDate   ?? '').slice(0, 10);
  if (!arrival || !departure) return { result: 'error', reason: 'geen datum' };

  // Vertrektijden
  const outTime = fmtTime(
    item.ferryDepartureHour ?? item.depH,
    item.ferryDepartureMinutes ?? item.depM
  );
  const retTime = fmtTime(
    item.ferryReturnHour ?? item.retH,
    item.ferryReturnMinutes ?? item.retM
  );

  // Betaalstatus
  const isPaid = item.isPaid ?? item.paid ?? false;
  const paymentMethod = mapPaymentMethod(item.paymentMethod ?? item.method);
  const stripeId = item.paymentIntentId ?? null;
  const payStatus = isPaid ? 'paid' : 'pending';

  // Status
  const isCancelled = item.cancelled ?? false;
  const status = isCancelled ? 'cancelled' : (departure < today ? 'completed' : 'booked');

  // Prijs
  const totalPrice = parseFloat(item.price ?? item.totalPrice ?? 0);

  // Notes
  const customerNote = [
    item.message, item.note, item.notes, item.comment,
    item.customerMessage, item.customerNote, item.remarks,
    typeof item.description === 'string'
      ? item.description.replace(/Imported from v1[^\r\n]*/gi, '').trim() || null
      : null,
  ].find(v => typeof v === 'string' && v.trim()) ?? null;

  const origId = (item.description ?? item.note ?? '').match?.(/Original ID:\s*(\d+)/i)?.[1];
  const adminNotes = [
    `Import Umbraco #${umbId}`,
    origId ? `v1-id: ${origId}` : null,
  ].filter(Boolean).join(' — ');

  // Items (laadregels)
  const items: any[] = item.items ?? item.Items ?? [];
  const evItem = items.find((i: any) => /laden|opladen/i.test(i.name ?? i.description ?? ''));

  // Kentekens + aantal voertuigen
  // Strategie: plaatveld kan meerdere kentekens bevatten ("AB-12-CD EN EF-34-GH"),
  // daarna extra kentekens uit de beschrijving (combineren, niet vervangen)
  const fieldPlates = parsePlatesFromField(item.licensePlate ?? item.plate ?? '');
  const descPlates  = extractPlatesFromText(item.description ?? item.note ?? '');
  const nVehiclesFromItems = countParkingItemVehicles(items);
  const nVehiclesFromField = parseInt(item.numberOfVehicles ?? item.places ?? 0) || 0;

  // Combineer: kentekens uit plaatveld voorop, extra uit beschrijving erachter (dedupliceren)
  const combinedPlates: string[] = [];
  for (const p of [...fieldPlates, ...descPlates]) {
    if (!combinedPlates.includes(p)) combinedPlates.push(p);
  }

  const nVehicles = Math.max(
    combinedPlates.length,
    nVehiclesFromItems > 1 ? nVehiclesFromItems : 0,
    nVehiclesFromField,
    1,
  );

  let plates: string[] = [...combinedPlates];
  while (plates.length < nVehicles) plates.push(`ONBEKEND${plates.length + 1}`);

  if (dryRun) {
    return { result: 'dry', umbId, fullName, arrival, outTime, plates, status, totalPrice };
  }

  // ── Schrijven naar DB ──────────────────────────────────────────────────────

  // Ferry bestemming opzoeken
  const outDest = await matchFerryDestination(client, arrival, outTime, 'outbound');
  const evService = evItem ? await matchEvService(client, evItem.name ?? evItem.description ?? '') : null;

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

  const resId = randomUUID();

  await client.query(
    `INSERT INTO reservations (
      id, reference, customer_id, parking_lot_id, rate_id,
      status, payment_status, payment_method, stripe_payment_intent_id,
      arrival_date, departure_date,
      ferry_outbound_time, ferry_outbound_destination, is_fast_ferry_outbound,
      ferry_return_time, ferry_return_custom_time, ferry_return_custom,
      base_price, services_total, total_price,
      notes, admin_notes, policy_anchor_date, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,$9,
      $10,$11,
      $12,$13,$14,
      $15,NULL,false,
      $16,0,$16,
      $17,$18,$10,NOW(),NOW()
    )`,
    [
      resId, reference, customerId, PARKING_LOT_ID, RATE_ID,
      status, payStatus, paymentMethod, stripeId,
      arrival, departure,
      outTime, outDest, item.isFastFerry ?? false,
      retTime,
      totalPrice,
      customerNote,
      adminNotes,
    ]
  );

  // Voertuigen
  for (let i = 0; i < plates.length; i++) {
    const isEvVehicle = i === 0 && evService != null;
    await client.query(
      `INSERT INTO vehicles (reservation_id, license_plate, ev_service_id, ev_kwh, ev_price, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT DO NOTHING`,
      [
        resId, plates[i],
        isEvVehicle ? evService!.id : null,
        isEvVehicle ? evService!.kwh : null,
        isEvVehicle ? (evItem?.price ?? evItem?.unitPrice ?? 0) : null,
        i,
      ]
    );
  }

  // EV-service koppelen
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

  return { result: 'imported', umbId, fullName, arrival, outTime, outDest, plates, status, totalPrice };
}
