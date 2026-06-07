import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query, getClient } from '../db/pool';
import {
  calculatePrice, calculateRefund, generateReference,
} from '../services/pricing.service';
import { lookupRdw, normalizePlate } from '../services/rdw.service';
import {
  sendBookingConfirmation, sendCheckinMail, sendCancellationMail, sendModificationMail, sendTemplatedEmail, sendSimpleEmail,
} from '../services/email.service';
import {
  createPaymentIntent, processRefund, getPaymentIntent,
  createCheckoutSessionForExtraPayment,
} from '../services/stripe.service';
import {
  requireAuth, requireAdminRole,
  signAccessToken, signRefreshToken, verifyRefreshToken,
  signGuestToken, requireGuestAuth,
} from '../middleware/auth';
import { syncDoeksenSchedule, syncDoeksenScheduleDays } from '../services/doeksen.service';
import { generateInvoicePdf, generateInvoiceHtml, generateCreditNoteHtml } from '../services/invoice.service';
import {
  generateContractInvoicePdf, generateNextContractInvoiceNumber,
} from '../services/contract-invoice.service';
import { importUmbracoRecord } from '../services/umbraco-import.service';

export const router = Router();

// ============================================================
// HELPER — per-nacht beschikbaarheidscheck (rekening met overrides)
// Geeft het minimum aantal vrije plekken over alle nachten in de periode.
// excludeReservationId: huidige reservering buiten beschouwing laten (bij wijzigen)
// ============================================================
async function checkNightlyAvailability(
  lotId: string,
  arrival: string,
  departure: string,
  excludeReservationId?: string
): Promise<{ minAvailable: number; defaultOnlineSpots: number }> {
  const lotResult = await query(
    `SELECT l.online_spots FROM parking_lots pl JOIN locations l ON l.id = pl.location_id WHERE pl.id = $1`,
    [lotId]
  );
  const onlineSpots: number = lotResult.rows[0]?.online_spots ?? 50;

  const result = await query(
    `WITH nights AS (
       SELECT generate_series($2::date, $3::date - '1 day'::interval, '1 day'::interval)::date AS night
     ),
     night_capacity AS (
       SELECT n.night,
              COALESCE(ao.available_spots, $4) AS max_spots,
              (SELECT COUNT(DISTINCT v.id)
               FROM reservations res2
               JOIN vehicles v ON v.reservation_id = res2.id
               WHERE res2.parking_lot_id = $1
                 AND res2.status NOT IN ('cancelled')
                 AND ($5::uuid IS NULL OR res2.id != $5::uuid)
                 AND res2.arrival_date <= n.night
                 AND res2.departure_date > n.night) AS booked_that_night
       FROM nights n
       LEFT JOIN availability_overrides ao ON ao.parking_lot_id = $1 AND ao.override_date = n.night
     )
     SELECT COALESCE(MIN(max_spots - booked_that_night), $4) AS min_available
     FROM night_capacity`,
    [lotId, arrival, departure, onlineSpots, excludeReservationId || null]
  );

  return {
    minAvailable: parseInt(result.rows[0].min_available) || 0,
    defaultOnlineSpots: onlineSpots,
  };
}

// ============================================================
// HEALTH
// ============================================================
router.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// ============================================================
// PUBLIC — geen authenticatie vereist
// ============================================================

// GET /public/terms — Algemene voorwaarden tekst (HTML)
router.get('/public/terms', async (_req, res: Response) => {
  const result = await query(`SELECT value FROM settings WHERE key = 'terms_text'`);
  const text = result.rows[0]?.value || '';
  res.json({ text });
});

// ============================================================
// AUTH
// ============================================================
router.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const result = await query(
    `SELECT * FROM admin_users WHERE email = $1 AND is_active = true`,
    [email]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Onjuiste inloggegevens' });
  }

  const user = result.rows[0];

  // Check lockout
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return res.status(429).json({ error: 'Account tijdelijk geblokkeerd. Probeer later opnieuw.' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    const attempts = user.failed_login_attempts + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await query(
      'UPDATE admin_users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
      [attempts, lockedUntil, user.id]
    );
    return res.status(401).json({ error: 'Onjuiste inloggegevens' });
  }

  // Reset failed attempts
  await query(
    'UPDATE admin_users SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1',
    [user.id]
  );

  const payload = { adminId: user.id, email: user.email, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.json({
    accessToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

router.post('/auth/refresh', async (req: Request, res: Response) => {
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ error: 'Geen refresh token' });

  try {
    const payload = verifyRefreshToken(token);
    const accessToken = signAccessToken({
      adminId: payload.adminId, email: payload.email, role: payload.role,
    });
    return res.json({ accessToken });
  } catch {
    return res.status(401).json({ error: 'Ongeldige refresh token' });
  }
});

router.post('/auth/logout', (_req, res) => {
  res.clearCookie('refresh_token');
  res.json({ success: true });
});

// ============================================================
// GUEST AUTH — gasten inloggen met email + wachtwoord
// ============================================================

/** Stuur een (nieuw) wachtwoord per e-mail */
router.post('/auth/guest/request-password', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  if (!email) return res.status(400).json({ error: 'E-mailadres verplicht' });

  const result = await query(
    'SELECT id, first_name FROM customers WHERE LOWER(email) = LOWER($1)',
    [email]
  );

  // Altijd success teruggeven zodat we niet lekken of een e-mail bestaat
  if (result.rows.length === 0) return res.json({ success: true });

  const customer = result.rows[0];

  // Genereer leesbaar wachtwoord: 3 blokken van 3 alfanumerieke tekens
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const block = () => Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const password = `${block()}-${block()}-${block()}`;

  const hash = await bcrypt.hash(password, 12);
  await query('UPDATE customers SET password_hash = $1 WHERE id = $2', [hash, customer.id]);

  const firstName = customer.first_name || 'Beste gast';
  const loginUrl = `${process.env.BOOKING_BASE_URL || 'https://booking.parkeren-harlingen.nl'}/boeken/login`;

  await sendSimpleEmail(
    email,
    'Uw inlogwachtwoord — Autostalling De Bazuin',
    `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
      <div style="background:#0a2240;padding:20px 24px">
        <span style="color:white;font-size:18px;font-weight:bold">Autostalling De Bazuin</span>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e5e7eb">
        <p style="margin:0 0 16px">Hallo ${firstName},</p>
        <p style="margin:0 0 16px">Uw inlogwachtwoord voor <strong>Mijn reserveringen</strong> is:</p>
        <div style="background:#f3f6fb;border:2px solid #0a2240;border-radius:8px;padding:16px 24px;text-align:center;margin:0 0 20px">
          <span style="font-size:28px;font-weight:900;letter-spacing:4px;color:#0a2240;font-family:monospace">${password}</span>
        </div>
        <p style="margin:0 0 16px">Log in met uw e-mailadres en dit wachtwoord op:</p>
        <a href="${loginUrl}" style="display:inline-block;background:#0a2240;color:white;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:bold">${loginUrl}</a>
        <p style="margin:20px 0 0;font-size:12px;color:#888">Dit wachtwoord blijft geldig totdat u een nieuw wachtwoord aanvraagt.</p>
      </div>
    </div>`
  );

  return res.json({ success: true });
});

/** Inloggen met e-mail + wachtwoord → geeft guest JWT terug */
router.post('/auth/guest/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) return res.status(400).json({ error: 'E-mail en wachtwoord zijn verplicht' });

  const result = await query(
    'SELECT id, email, password_hash FROM customers WHERE LOWER(email) = LOWER($1)',
    [email]
  );

  if (result.rows.length === 0 || !result.rows[0].password_hash) {
    return res.status(401).json({ error: 'Onjuist e-mailadres of wachtwoord' });
  }

  const customer = result.rows[0];
  const valid = await bcrypt.compare(password, customer.password_hash);
  if (!valid) return res.status(401).json({ error: 'Onjuist e-mailadres of wachtwoord' });

  const token = signGuestToken({ guestEmail: customer.email });
  return res.json({ token, email: customer.email });
});

/** Alle reserveringen voor ingelogde gast */
router.get('/auth/guest/reservations', requireGuestAuth, async (req: Request, res: Response) => {
  const result = await query(
    `SELECT r.id, r.reference, r.arrival_date, r.departure_date, r.status,
            r.total_price, r.payment_status, r.cancellation_token,
            r.ferry_outbound_destination, r.refund_amount, r.cancelled_at,
            array_agg(v.license_plate ORDER BY v.sort_order) FILTER (WHERE v.id IS NOT NULL) AS plates
     FROM reservations r
     JOIN customers c ON c.id = r.customer_id
     LEFT JOIN vehicles v ON v.reservation_id = r.id
     WHERE LOWER(c.email) = LOWER($1)
     GROUP BY r.id
     ORDER BY r.arrival_date DESC`,
    [req.guest!.guestEmail]
  );
  return res.json({ reservations: result.rows });
});

// ============================================================
// PUBLIC — AVAILABILITY CALENDAR OVERVIEW (voor kalenderweergave)
// Geeft per dag: available, booked, max — zodat de booking kalender
// volle dagen kan blokkeren.
// ============================================================
router.get('/availability/calendar', async (req: Request, res: Response) => {
  const { from, to, lot_id } = req.query as Record<string, string>;
  if (!from || !to) return res.status(400).json({ error: 'from en to zijn verplicht' });

  const lotResult = await query(
    lot_id
      ? `SELECT pl.id, l.online_spots FROM parking_lots pl JOIN locations l ON l.id = pl.location_id WHERE pl.id = $1 AND pl.is_active = true`
      : `SELECT pl.id, l.online_spots FROM parking_lots pl JOIN locations l ON l.id = pl.location_id WHERE pl.is_active = true ORDER BY pl.sort_order ASC LIMIT 1`,
    lot_id ? [lot_id] : []
  );
  if (lotResult.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const lot = lotResult.rows[0];

  const result = await query(
    `WITH date_series AS (
       SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS d
     ),
     daily_booked AS (
       SELECT d,
         (SELECT COUNT(DISTINCT v.id) FROM reservations r
          JOIN vehicles v ON v.reservation_id = r.id
          WHERE r.parking_lot_id = $3
            AND r.status NOT IN ('cancelled')
            AND r.arrival_date <= d
            AND r.departure_date > d) AS booked
       FROM date_series
     ),
     overrides AS (
       SELECT override_date, available_spots FROM availability_overrides
       WHERE parking_lot_id = $3 AND override_date BETWEEN $1 AND $2
     )
     SELECT ds.d::text AS date,
            db.booked::int AS booked,
            COALESCE(o.available_spots, l.online_spots)::int AS max_available,
            GREATEST(0, COALESCE(o.available_spots, l.online_spots) - db.booked)::int AS available
     FROM date_series ds
     JOIN daily_booked db ON db.d = ds.d
     CROSS JOIN parking_lots pl
     JOIN locations l ON l.id = pl.location_id
     LEFT JOIN overrides o ON o.override_date = ds.d
     WHERE pl.id = $3
     ORDER BY ds.d`,
    [from, to, lot.id]
  );

  return res.json(result.rows);
});

// ============================================================
// PUBLIC — AVAILABILITY
// ============================================================
router.get('/availability', async (req: Request, res: Response) => {
  const { arrival, departure, lot_id } = req.query as Record<string, string>;

  if (!arrival || !departure) {
    return res.status(400).json({ error: 'arrival en departure zijn verplicht' });
  }

  const lotResult = await query(
    lot_id
      ? `SELECT pl.*, l.total_spots, l.online_spots
         FROM parking_lots pl
         JOIN locations l ON l.id = pl.location_id
         WHERE pl.id = $1 AND pl.is_active = true`
      : `SELECT pl.*, l.total_spots, l.online_spots
         FROM parking_lots pl
         JOIN locations l ON l.id = pl.location_id
         WHERE pl.is_active = true
         ORDER BY pl.sort_order ASC LIMIT 1`,
    lot_id ? [lot_id] : []
  );

  if (lotResult.rows.length === 0) {
    return res.status(404).json({ error: 'Parkeerterrein niet gevonden' });
  }

  const lot = lotResult.rows[0];

  // For each night in the period, find the max capacity (override or default)
  // and the number of vehicles parked that night. Take the worst-case (most full) night.
  const capacityResult = await query(
    `WITH nights AS (
       SELECT generate_series($2::date, $3::date - '1 day'::interval, '1 day'::interval)::date AS night
     ),
     night_capacity AS (
       SELECT n.night,
              COALESCE(ao.available_spots, $4) AS max_spots,
              (SELECT COUNT(DISTINCT v.id)
               FROM reservations r
               JOIN vehicles v ON v.reservation_id = r.id
               WHERE r.parking_lot_id = $1
                 AND r.status NOT IN ('cancelled')
                 AND r.arrival_date <= n.night
                 AND r.departure_date > n.night) AS booked_that_night
       FROM nights n
       LEFT JOIN availability_overrides ao ON ao.parking_lot_id = $1 AND ao.override_date = n.night
     )
     SELECT MIN(max_spots - booked_that_night) AS min_available,
            MIN(max_spots) AS min_max,
            MAX(booked_that_night) AS peak_booked
     FROM night_capacity`,
    [lot.id, arrival, departure, lot.online_spots]
  );

  const row = capacityResult.rows[0];
  const available = Math.max(0, parseInt(row.min_available) || 0);
  const booked = parseInt(row.peak_booked) || 0;

  return res.json({
    available,
    total: lot.online_spots,   // altijd de standaardcapaciteit voor weergave
    booked,
    lotId: lot.id,
    lotName: lot.name,
  });
});

// ============================================================
// PUBLIC — PRICE CALCULATION
// ============================================================
router.get('/rates/calculate', async (req: Request, res: Response) => {
  const { arrival, departure, vehicles, lot_id } = req.query as Record<string, string>;

  if (!arrival || !departure) {
    return res.status(400).json({ error: 'arrival en departure zijn verplicht' });
  }

  // Gebruik de meegegeven lot_id, anders de eerste actieve parkeerlocatie uit de DB
  let lotId = lot_id;
  if (!lotId) {
    const lotResult = await query('SELECT id FROM parking_lots WHERE is_active = true ORDER BY sort_order ASC LIMIT 1');
    if (lotResult.rows.length === 0) return res.status(400).json({ error: 'Geen parkeerlocatie geconfigureerd' });
    lotId = lotResult.rows[0].id;
  }

  const vehicleCount = parseInt(vehicles || '1');

  const priceInfo = await calculatePrice(
    new Date(arrival), new Date(departure), lotId, vehicleCount
  );

  return res.json(priceInfo);
});

// ============================================================
// PUBLIC — DOEKSEN SYNC (voor boekingspagina, rate-limited)
// ============================================================
router.post('/ferries/sync', async (req: Request, res: Response) => {
  const { dates } = req.body as { dates: string[] };
  if (!Array.isArray(dates) || dates.length === 0 || dates.length > 3) {
    return res.status(400).json({ error: 'Geef 1–3 datums mee' });
  }
  const results: Record<string, any> = {};
  for (const d of dates) {
    const date = new Date(d);
    if (isNaN(date.getTime())) continue;
    try {
      results[d] = await syncDoeksenSchedule(date);
    } catch (e: any) {
      results[d] = { error: e.message };
    }
  }
  return res.json({ success: true, results });
});

// ============================================================
// PUBLIC — FERRY SCHEDULES
// ============================================================
router.get('/ferries', async (req: Request, res: Response) => {
  const { destination, date, direction } = req.query as Record<string, string>;

  if (!date) return res.status(400).json({ error: 'date is verplicht' });

  const scheduleDate = new Date(date);
  const dayOfWeek = scheduleDate.getDay();

  // First check for manual overrides for this specific date
  let scheduleResult = await query(
    `SELECT fs.*, f.name, f.duration_min, f.is_fast, f.destination as ferry_destination
     FROM ferry_schedules fs
     JOIN ferries f ON f.id = fs.ferry_id
     WHERE fs.schedule_date = $1
       ${destination ? 'AND fs.destination = $2' : ''}
       ${direction ? `AND fs.direction = '${direction === 'return' ? 'return' : 'outbound'}'` : ''}
       AND f.is_active = true
     ORDER BY fs.departure_time`,
    destination ? [date, destination] : [date]
  );

  // Geen template-fallback: alleen echte Doeksen-data of handmatig ingevoerde tijden tonen

  return res.json({
    date,
    schedules: scheduleResult.rows.map(row => ({
      id: row.id,
      ferryId: row.ferry_id,
      ferryName: row.name,
      durationMin: row.duration_min,
      isFast: row.is_fast,
      destination: row.ferry_destination || row.destination,
      direction: row.direction,
      departureTime: row.departure_time?.slice(0, 5),
      arrivalHarlingen: (() => {
        if (row.arrival_harlingen) return row.arrival_harlingen.slice(0, 5);
        if (row.direction === 'return' && row.departure_time && row.duration_min) {
          const [h, m] = row.departure_time.slice(0, 5).split(':').map(Number);
          const total = h * 60 + m + row.duration_min;
          return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
        }
        return null;
      })(),
    })),
  });
});

// ============================================================
// PUBLIC — RDW LOOKUP
// ============================================================
router.get('/vehicles/rdw/:plate', async (req: Request, res: Response) => {
  const plate = normalizePlate(req.params.plate);
  const info = await lookupRdw(plate);

  if (!info) {
    return res.json({ found: false, licensePlate: plate });
  }

  return res.json({ found: true, ...info });
});

// ============================================================
// ADMIN — RDW BULK REFRESH
// Haalt RDW-data op voor alle voertuigen zonder gecachede data
// ============================================================
router.post('/admin/vehicles/rdw-refresh', requireAuth, async (_req: Request, res: Response) => {
  const result = await query(
    `SELECT id, license_plate FROM vehicles WHERE rdw_fetched_at IS NULL AND license_plate IS NOT NULL`,
    []
  );

  const vehicles = result.rows;
  if (vehicles.length === 0) return res.json({ total: 0, updated: 0 });

  // Verwerk parallel in batches van 4 om de RDW API niet te overbelasten
  let updated = 0;
  const batchSize = 4;
  for (let i = 0; i < vehicles.length; i += batchSize) {
    const batch = vehicles.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (v: any) => {
        const info = await lookupRdw(v.license_plate);
        if (info) {
          await query(
            `UPDATE vehicles SET rdw_make=$1, rdw_model=$2, rdw_color=$3, rdw_fuel_type=$4,
             rdw_year=$5, rdw_fetched_at=NOW() WHERE id=$6`,
            [info.make, info.model, info.color, info.fuelType, info.year, v.id]
          );
          return true;
        } else {
          await query(`UPDATE vehicles SET rdw_fetched_at=NOW() WHERE id=$1`, [v.id]);
          return false;
        }
      })
    );
    updated += results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  }

  return res.json({ total: vehicles.length, updated });
});

// ============================================================
// PUBLIC — SERVICES
// ============================================================
router.get('/services', async (_req, res) => {
  const result = await query(
    'SELECT * FROM services WHERE is_active = true AND admin_only = false ORDER BY sort_order',
    []
  );
  return res.json(result.rows);
});

// ============================================================
// PUBLIC — CREATE RESERVATION
// ============================================================
const CreateReservationSchema = z.object({
  arrivalDate: z.string(),
  departureDate: z.string(),
  parkingLotId: z.string().optional(),
  ferryOutboundId: z.string().uuid().optional(),
  ferryOutboundTime: z.string().optional(),
  ferryOutboundDestination: z.enum(['terschelling', 'vlieland', 'anders']),
  isFastFerryOutbound: z.boolean().optional(),
  ferryReturnId: z.string().uuid().optional(),
  ferryReturnTime: z.string().optional(),
  ferryReturnDestination: z.enum(['terschelling', 'vlieland', 'anders']).optional(),
  ferryReturnCustom: z.boolean().optional(),
  ferryReturnCustomTime: z.string().optional(),
  paymentMethod: z.enum(['ideal', 'card', 'paypal', 'sepa', 'bancontact', 'on_site']),
  customerNote: z.string().optional(),
  customer: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
  }),
  vehicles: z.array(z.object({
    licensePlate: z.string().min(4),
    evServiceId: z.string().uuid().optional(),
    evKwh: z.number().optional(),
  })).min(1).max(5),
});

router.post('/reservations', async (req: Request, res: Response) => {
  const parsed = CreateReservationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ongeldige invoer', details: parsed.error.flatten() });
  }

  const data = parsed.data;
  const lotId = data.parkingLotId || 'b0000000-0000-0000-0000-000000000001';
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Double-check availability (lock reservation rows first, then count vehicles)
    await client.query(
      `SELECT id FROM reservations
       WHERE parking_lot_id = $1
         AND status NOT IN ('cancelled')
         AND arrival_date < $3
         AND departure_date > $2
       FOR UPDATE`,
      [lotId, data.arrivalDate, data.departureDate]
    );
    // Per-nacht beschikbaarheidscheck incl. overrides (meest restrictieve nacht bepaalt beschikbaarheid)
    const lotResult = await client.query(
      `SELECT l.online_spots FROM parking_lots pl JOIN locations l ON l.id = pl.location_id WHERE pl.id = $1`, [lotId]
    );
    const onlineSpots = lotResult.rows[0].online_spots;

    const nightCheckResult = await client.query(
      `WITH nights AS (
         SELECT generate_series($2::date, $3::date - '1 day'::interval, '1 day'::interval)::date AS night
       ),
       night_capacity AS (
         SELECT n.night,
                COALESCE(ao.available_spots, $4) AS max_spots,
                (SELECT COUNT(DISTINCT v2.id)
                 FROM reservations r2
                 JOIN vehicles v2 ON v2.reservation_id = r2.id
                 WHERE r2.parking_lot_id = $1
                   AND r2.status NOT IN ('cancelled')
                   AND r2.arrival_date <= n.night
                   AND r2.departure_date > n.night) AS booked_that_night
         FROM nights n
         LEFT JOIN availability_overrides ao ON ao.parking_lot_id = $1 AND ao.override_date = n.night
       )
       SELECT COALESCE(MIN(max_spots - booked_that_night), $4) AS min_available
       FROM night_capacity`,
      [lotId, data.arrivalDate, data.departureDate, onlineSpots]
    );

    const available = parseInt(nightCheckResult.rows[0].min_available) || 0;
    if (available < data.vehicles.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Onvoldoende beschikbare plaatsen. Nog ${available} vrij.` });
    }

    // Upsert customer
    const customerResult = await client.query(
      `INSERT INTO customers (first_name, last_name, email, phone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             phone = COALESCE(EXCLUDED.phone, customers.phone),
             updated_at = NOW()
       RETURNING id`,
      [data.customer.firstName, data.customer.lastName, data.customer.email, data.customer.phone]
    );
    const customerId = customerResult.rows[0].id;

    // Calculate price
    const priceInfo = await calculatePrice(
      new Date(data.arrivalDate), new Date(data.departureDate), lotId, data.vehicles.length
    );

    // EV services total
    let servicesTotal = 0;
    for (const v of data.vehicles) {
      if (v.evServiceId) {
        const svc = await client.query('SELECT price FROM services WHERE id = $1', [v.evServiceId]);
        if (svc.rows.length > 0) servicesTotal += parseFloat(svc.rows[0].price);
      }
    }

    // On-site surcharge
    const onSiteSurcharge = data.paymentMethod === 'on_site' ? 5 * data.vehicles.length : 0;

    const totalPrice = priceInfo.totalPrice + servicesTotal + onSiteSurcharge;
    const vatAmount = Math.round(totalPrice * 0.21 * 100) / 100;

    const reference = await generateReference();

    // Create reservation
    const resResult = await client.query(
      `INSERT INTO reservations (
        reference, customer_id, parking_lot_id, rate_id,
        status, payment_status, payment_method,
        arrival_date, departure_date,
        ferry_outbound_id, ferry_outbound_time, ferry_outbound_destination, is_fast_ferry_outbound,
        ferry_return_id, ferry_return_time, ferry_return_destination,
        ferry_return_custom, ferry_return_custom_time,
        base_price, season_surcharge_amount, services_total, on_site_surcharge,
        total_price, vat_amount, admin_notes, policy_anchor_date
      ) VALUES (
        $1,$2,$3,$4,
        $26,$5,$6,
        $7,$8,
        $9,$10,$11,$12,
        $13,$14,$15,
        $16,$17,
        $18,$19,$20,$21,
        $22,$23,$24,$25
      ) RETURNING id, reference, cancellation_token`,
      [
        reference, customerId, lotId, priceInfo.rateId,
        data.paymentMethod === 'on_site' ? 'pending' : 'pending', data.paymentMethod,
        data.arrivalDate, data.departureDate,
        data.ferryOutboundId || null, data.ferryOutboundTime || null, data.ferryOutboundDestination, data.isFastFerryOutbound || false,
        data.ferryReturnId || null, data.ferryReturnTime || null, data.ferryReturnDestination || null,
        data.ferryReturnCustom || false, data.ferryReturnCustomTime || null,
        priceInfo.totalPrice, priceInfo.seasonSurchargeAmount, servicesTotal, onSiteSurcharge,
        totalPrice, vatAmount, data.customerNote || null, data.arrivalDate,
        // $26: status — 'booked' voor ter plekke, 'pending_payment' voor online betaling (wacht op Stripe webhook)
        data.paymentMethod === 'on_site' ? 'booked' : 'pending_payment',
      ]
    );

    const reservation = resResult.rows[0];

    // Create vehicles
    for (let i = 0; i < data.vehicles.length; i++) {
      const v = data.vehicles[i];
      const plate = normalizePlate(v.licensePlate);

      let evPrice = 0;
      if (v.evServiceId) {
        const svc = await client.query('SELECT price FROM services WHERE id = $1', [v.evServiceId]);
        if (svc.rows.length > 0) evPrice = parseFloat(svc.rows[0].price);
      }

      const vehicleResult = await client.query(
        `INSERT INTO vehicles (reservation_id, license_plate, ev_service_id, ev_kwh, ev_price, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [reservation.id, plate, v.evServiceId || null, v.evKwh || null, evPrice || null, i]
      );

      // Async RDW lookup — don't await, update in background
      lookupRdw(plate).then(rdwInfo => {
        if (rdwInfo) {
          client.query(
            `UPDATE vehicles SET rdw_make=$1, rdw_model=$2, rdw_color=$3, rdw_fuel_type=$4,
             rdw_year=$5, rdw_fetched_at=NOW() WHERE id=$6`,
            [rdwInfo.make, rdwInfo.model, rdwInfo.color, rdwInfo.fuelType, rdwInfo.year, vehicleResult.rows[0].id]
          ).catch(console.error);
        }
      }).catch(console.error);
    }

    await client.query('COMMIT');

    // Stuur bevestigingsmail alleen bij ter plekke betalen.
    // Bij online betaling stuurt de Stripe webhook de mail na bevestiging.
    if (data.paymentMethod === 'on_site') {
      sendBookingConfirmation(reservation.id).catch(err =>
        console.error('Booking email failed:', err)
      );
    }

    return res.status(201).json({
      id: reservation.id,
      reference: reservation.reference,
      cancellationToken: reservation.cancellation_token,
      totalPrice,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ============================================================
// PUBLIC — CREATE STRIPE PAYMENT INTENT
// ============================================================
router.post('/payments/create-intent', async (req: Request, res: Response) => {
  const { reservationId } = req.body;

  if (!reservationId) {
    return res.status(400).json({ error: 'reservationId is verplicht' });
  }

  const result = await query(
    `SELECT r.*, c.first_name, c.last_name, c.email
     FROM reservations r
     JOIN customers c ON c.id = r.customer_id
     WHERE r.id = $1`,
    [reservationId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Reservering niet gevonden' });
  }

  const res2 = result.rows[0];

  // Ter plekke betalen — geen Stripe nodig
  if (res2.payment_method === 'on_site') {
    return res.json({ onSite: true, message: 'Betaling bij aankomst' });
  }

  const { clientSecret, paymentIntentId } = await createPaymentIntent(
    reservationId,
    parseFloat(res2.total_price),
    res2.payment_method,
    res2.email,
    `${res2.first_name} ${res2.last_name}`
  );

  return res.json({ clientSecret, paymentIntentId });
});

// ============================================================
// PUBLIC — GET RESERVATION BY PAYMENT INTENT (for bevestiging page)
// ============================================================
router.get('/reservations/by-payment-intent/:intentId', async (req: Request, res: Response) => {
  const result = await query(
    `SELECT r.id, r.reference, r.arrival_date, r.departure_date, r.total_price,
            r.payment_status, r.payment_method, r.status, r.cancellation_token,
            r.ferry_outbound_time, r.ferry_return_time, r.ferry_return_custom_time,
            c.first_name, c.last_name, c.email
     FROM reservations r JOIN customers c ON c.id = r.customer_id
     WHERE r.stripe_payment_intent_id = $1`,
    [req.params.intentId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const r = result.rows[0];
  const vehicles = await query(
    'SELECT license_plate FROM vehicles WHERE reservation_id = $1 ORDER BY sort_order',
    [r.id]
  );
  const services = await query(
    `SELECT s.name, rs.quantity, rs.unit_price, rs.total_price, rs.notes
     FROM reservation_services rs JOIN services s ON s.id = rs.service_id
     WHERE rs.reservation_id = $1`,
    [r.id]
  );
  return res.json({
    ...r,
    vehicles: vehicles.rows,
    services: services.rows,
  });
});

// ============================================================
// PUBLIC — INVOICE HTML PAGE (browser-printable, single source of truth)
// ============================================================
router.get('/invoice-html/:token', async (req: Request, res: Response) => {
  try {
    const html = await generateInvoiceHtml(req.params.token);
    if (!html) return res.status(404).send('<p>Factuur niet gevonden</p>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err: any) {
    console.error('Invoice HTML error:', err.message);
    return res.status(500).send(`<p>Fout bij genereren factuur: ${err.message}</p>`);
  }
});

// ============================================================
// PUBLIC — CREDIT NOTE HTML PAGE (for cancelled reservations with refund)
// ============================================================
router.get('/creditnota-html/:token', async (req: Request, res: Response) => {
  try {
    const html = await generateCreditNoteHtml(req.params.token);
    if (!html) return res.status(404).send('<p>Creditnota niet gevonden</p>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err: any) {
    console.error('Credit note HTML error:', err.message);
    return res.status(500).send(`<p>Fout bij genereren creditnota: ${err.message}</p>`);
  }
});

// ============================================================
// ADMIN — INVOICE HTML PAGE by reservation ID (auth required)
// ============================================================
// ============================================================
// ADMIN — UMBRACO HISTORISCHE IMPORT (browser-based, secret key auth)
// ============================================================
const IMPORT_SECRET = process.env.IMPORT_SECRET || 'bazuin-import-2026';

router.post('/admin/import-umbraco-batch', async (req: Request, res: Response) => {
  if (req.headers['x-import-key'] !== IMPORT_SECRET) {
    return res.status(401).json({ error: 'Ongeldige import key' });
  }
  const { records, dryRun = false } = req.body as { records: any[]; dryRun?: boolean };
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'records array vereist' });
  }

  const today = new Date().toISOString().slice(0, 10);
  let imported = 0, skipped = 0, errors = 0;
  const details: any[] = [];

  for (const item of records) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const result = await importUmbracoRecord(client, item, today, dryRun);
      await client.query('COMMIT');
      if (result.result === 'imported' || result.result === 'dry') imported++;
      else skipped++;
      details.push(result);
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      errors++;
      details.push({ result: 'error', umbId: item.reservationId, reason: err.message });
    } finally {
      client.release();
    }
  }

  return res.json({ imported, skipped, errors, total: records.length, dryRun, details });
});

router.get('/admin/invoice-html/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    // Look up cancellation_token via reservation id, then reuse the same HTML generator
    const r = await query('SELECT cancellation_token FROM reservations WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).send('<p>Reservering niet gevonden</p>');
    const html = await generateInvoiceHtml(r.rows[0].cancellation_token);
    if (!html) return res.status(404).send('<p>Factuur niet gevonden</p>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err: any) {
    console.error('Admin Invoice HTML error:', err.message);
    return res.status(500).send(`<p>Fout bij genereren factuur: ${err.message}</p>`);
  }
});

// ============================================================
// PUBLIC — DOWNLOAD INVOICE PDF (kept for API / backward compat)
// ============================================================
router.get('/invoice/:token', async (req: Request, res: Response) => {
  try {
    const result = await generateInvoicePdf(req.params.token);
    if (!result) return res.status(404).json({ error: 'Factuur niet gevonden' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.send(result.pdf);
  } catch (err: any) {
    console.error('Invoice PDF error:', err.message);
    return res.status(500).json({ error: 'Factuur kon niet worden gegenereerd: ' + err.message });
  }
});

// ============================================================
// PUBLIC — GET RESERVATION BY TOKEN (for cancellation page)
// ============================================================
router.get('/reservations/token/:token', async (req: Request, res: Response) => {
  const result = await query(
    `SELECT r.*, c.first_name, c.last_name, c.email, c.phone
     FROM reservations r JOIN customers c ON c.id = r.customer_id
     WHERE r.cancellation_token = $1`,
    [req.params.token]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Reservering niet gevonden' });
  }

  const res2 = result.rows[0];
  if (res2.status === 'cancelled') {
    return res.status(410).json({ error: 'Deze reservering is al geannuleerd' });
  }

  const vehicles = await query(
    'SELECT * FROM vehicles WHERE reservation_id = $1 ORDER BY sort_order',
    [res2.id]
  );

  const isoDate2 = (d: any) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const refundInfo = await calculateRefund(
    new Date(isoDate2(res2.policy_anchor_date || res2.arrival_date) + 'T12:00:00'),
    parseFloat(res2.total_price)
  );

  return res.json({
    ...res2,
    vehicles: vehicles.rows,
    refundInfo,
  });
});

// ============================================================
// PUBLIC — CANCEL BY TOKEN
// ============================================================
router.post('/reservations/token/:token/cancel', async (req: Request, res: Response) => {
  const result = await query(
    'SELECT * FROM reservations WHERE cancellation_token = $1',
    [req.params.token]
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const res2 = result.rows[0];

  if (res2.status === 'cancelled') {
    return res.status(410).json({ error: 'Al geannuleerd' });
  }
  if (res2.status === 'checked_in' || res2.status === 'completed') {
    return res.status(400).json({ error: 'Ingecheckte of voltooide reserveringen kunnen niet worden geannuleerd' });
  }

  const refundInfo = await calculateRefund(
    new Date(res2.policy_anchor_date || res2.arrival_date), parseFloat(res2.total_price)
  );

  // Verwerk Stripe restitutie
  if (res2.stripe_payment_intent_id && res2.payment_status === 'paid' && refundInfo.refundAmount > 0) {
    try {
      await processRefund(
        res2.stripe_payment_intent_id,
        refundInfo.refundAmount,
        'Klant geannuleerd via annuleringslink'
      );
    } catch (stripeErr: any) {
      console.error('Stripe restitutie mislukt:', stripeErr.message);
      // Ga toch door met annulering — admin kan handmatig restitueren
    }
  }

  await query(
    `UPDATE reservations SET status='cancelled', cancelled_at=NOW(),
     refund_amount=$1, refund_percentage=$2 WHERE id=$3`,
    [refundInfo.refundAmount, refundInfo.refundPct, res2.id]
  );

  sendCancellationMail(res2.id, refundInfo.refundAmount, refundInfo.refundPct)
    .catch(console.error);

  return res.json({
    success: true,
    refundAmount: refundInfo.refundAmount,
    refundPct: refundInfo.refundPct,
  });
});

// ============================================================
// ADMIN — DASHBOARD STATS
// ============================================================
router.get('/admin/stats', requireAuth, async (_req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const [arrivalsResult, departuresResult, occupancyResult, revenueResult, capacityResult] = await Promise.all([
    query(`SELECT COUNT(*) as count FROM reservations WHERE arrival_date = $1 AND status NOT IN ('cancelled')`, [today]),
    query(`SELECT COUNT(*) as count FROM reservations WHERE departure_date = $1 AND status = 'checked_in'`, [today]),
    query(`SELECT COUNT(DISTINCT v.id) as count FROM reservations r JOIN vehicles v ON v.reservation_id = r.id WHERE r.status = 'checked_in' AND r.arrival_date <= $1 AND r.departure_date >= $1`, [today]),
    query(`SELECT COALESCE(SUM(total_price),0) as total FROM reservations WHERE DATE(created_at) = $1 AND payment_status IN ('paid','on_site')`, [today]),
    query(`SELECT l.total_spots FROM parking_lots pl JOIN locations l ON l.id = pl.location_id WHERE pl.is_active = true ORDER BY pl.sort_order ASC LIMIT 1`, []),
  ]);

  return res.json({
    arrivalsToday: parseInt(arrivalsResult.rows[0].count),
    departuresToday: parseInt(departuresResult.rows[0].count),
    currentOccupancy: parseInt(occupancyResult.rows[0].count),
    totalCapacity: parseInt(capacityResult.rows[0]?.total_spots) || 55,
    revenueToday: parseFloat(revenueResult.rows[0].total),
  });
});

// ============================================================
// ADMIN — TRAFFIC FORECAST (drukte grafiek)
// ============================================================
router.get('/admin/dashboard/traffic', requireAuth, async (req: Request, res: Response) => {
  try {
  const { from, to } = req.query as { from: string; to: string };
  if (!from || !to) return res.status(400).json({ error: 'from en to zijn verplicht' });

  const result = await query(`
    SELECT r.id, r.reference,
           r.arrival_date::text as arrival_date,
           r.departure_date::text as departure_date,
           r.ferry_outbound_time, r.ferry_outbound_destination,
           r.ferry_return_time, r.ferry_return_destination,
           r.ferry_return_custom_time,
           (SELECT COUNT(*) FROM vehicles v WHERE v.reservation_id = r.id) as vehicle_count,
           (SELECT string_agg(v.license_plate, ', ' ORDER BY v.sort_order) FROM vehicles v WHERE v.reservation_id = r.id) as plates,
           c.first_name, c.last_name,
           f_ret.duration_min as ferry_return_duration,
           (SELECT TO_CHAR(fs.arrival_harlingen, 'HH24:MI')
            FROM ferry_schedules fs
            WHERE fs.schedule_date = r.departure_date AND fs.direction = 'return'
              AND r.ferry_return_time IS NOT NULL
              AND ABS(EXTRACT(EPOCH FROM (fs.departure_time - r.ferry_return_time)) / 60) <= 20
            ORDER BY ABS(EXTRACT(EPOCH FROM (fs.departure_time - r.ferry_return_time)))
            LIMIT 1) as ret_schedule_arrival
    FROM reservations r
    LEFT JOIN customers c ON c.id = r.customer_id
    LEFT JOIN ferries f_ret ON f_ret.id = r.ferry_return_id
    WHERE r.status IN ('booked','checked_in')
      AND (
        (r.arrival_date >= $1 AND r.arrival_date <= $2)
        OR (r.departure_date >= $1 AND r.departure_date <= $2)
      )
    ORDER BY r.arrival_date, r.ferry_outbound_time NULLS LAST
  `, [from, to]);

  function toMinutes(t: string): number {
    const [h, m] = t.slice(0, 5).split(':').map(Number);
    return h * 60 + m;
  }
  function fromMinutes(mins: number): string {
    const h = Math.floor(Math.max(0, mins) / 60);
    const m = Math.max(0, mins) % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  function toSlot(t: string): string {
    // Round down to nearest 30 min
    const mins = toMinutes(t);
    const slotMins = Math.floor(mins / 30) * 30;
    return fromMinutes(slotMins);
  }

  interface SlotEntry { slot: string; date: string; brengen: number; halen: number; brengenList: any[]; halenList: any[] }
  const slotMap: Record<string, SlotEntry> = {};
  function ensureSlot(date: string, slot: string) {
    const key = `${date}|${slot}`;
    if (!slotMap[key]) slotMap[key] = { slot, date, brengen: 0, halen: 0, brengenList: [], halenList: [] };
    return slotMap[key];
  }

  for (const r of result.rows) {
    const vehicles = Math.max(1, r.vehicle_count || 1);
    const plates = (r.plates || '').split(', ').filter(Boolean);

    // BRENGEN: ~60 min voor vertrek veerboot op aankomstdatum
    if (r.arrival_date >= from && r.arrival_date <= to && r.ferry_outbound_time) {
      const outTime = r.ferry_outbound_time.slice(0, 5);
      const brengenMins = toMinutes(outTime) - 60;
      const slot = toSlot(fromMinutes(brengenMins));
      ensureSlot(r.arrival_date, slot).brengen += vehicles;
      ensureSlot(r.arrival_date, slot).brengenList.push({
        id: r.id, plates, ferryTime: outTime, vehicles,
      });
    }

    // HALEN: na aankomst veerboot in Harlingen op vertrekdatum
    if (r.departure_date >= from && r.departure_date <= to && r.ferry_return_time) {
      const retTime = r.ferry_return_time.slice(0, 5);
      let halenTime: string | null =
        r.ret_schedule_arrival ||
        (r.ferry_return_duration ? fromMinutes(toMinutes(retTime) + r.ferry_return_duration) : null) ||
        (r.ferry_return_custom_time ? r.ferry_return_custom_time.slice(0, 5) : null);

      if (!halenTime) {
        const dest = (r.ferry_return_destination || r.ferry_outbound_destination || '').toLowerCase();
        const travelMin = dest.includes('vlieland') ? 90 : 120;
        halenTime = fromMinutes(toMinutes(retTime) + travelMin);
      }

      const slot = toSlot(halenTime);
      ensureSlot(r.departure_date, slot).halen += vehicles;
      ensureSlot(r.departure_date, slot).halenList.push({
        id: r.id, plates, arrivalTime: halenTime, vehicles,
      });
    }
  }

  const slots = Object.values(slotMap).sort((a, b) =>
    a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot)
  );

  return res.json({
    slots,
    totalBrengen: slots.reduce((s, x) => s + x.brengen, 0),
    totalHalen: slots.reduce((s, x) => s + x.halen, 0),
  });
  } catch (e: any) {
    console.error('Traffic forecast error:', e.message, e.stack);
    return res.status(500).json({ error: e.message });
  }
});

// ============================================================
// ADMIN — RESERVATIONS LIST
// ============================================================
router.get('/admin/reservations', requireAuth, async (req: Request, res: Response) => {
  const {
    status, payment_status, date_from, date_to, search,
    page = '1', limit = '50', filter = 'arrival',
  } = req.query as Record<string, string>;

  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  let i = 1;

  if (status) { where += ` AND r.status = $${i++}`; params.push(status); }
  if (payment_status) { where += ` AND r.payment_status = $${i++}`; params.push(payment_status); }
  if (date_from) { where += ` AND r.${filter === 'departure' ? 'departure' : 'arrival'}_date >= $${i++}`; params.push(date_from); }
  if (date_to) { where += ` AND r.${filter === 'departure' ? 'departure' : 'arrival'}_date <= $${i++}`; params.push(date_to); }
  if (search) {
    where += ` AND (c.first_name ILIKE $${i} OR c.last_name ILIKE $${i} OR (c.first_name || ' ' || c.last_name) ILIKE $${i} OR r.guest_first_name ILIKE $${i} OR r.guest_last_name ILIKE $${i} OR (COALESCE(r.guest_first_name, c.first_name) || ' ' || COALESCE(r.guest_last_name, c.last_name)) ILIKE $${i} OR r.reference ILIKE $${i} OR EXISTS (SELECT 1 FROM vehicles v WHERE v.reservation_id = r.id AND v.license_plate ILIKE $${i}))`;
    params.push(`%${search}%`); i++;
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT r.*,
              COALESCE(r.guest_first_name, c.first_name) as first_name,
              COALESCE(r.guest_last_name, c.last_name) as last_name,
              c.email, c.phone,
              (SELECT string_agg(v.license_plate, ', ' ORDER BY v.sort_order) FROM vehicles v WHERE v.reservation_id = r.id) as plates,
              (SELECT COUNT(*) FROM vehicles v WHERE v.reservation_id = r.id) as vehicle_count,
              (SELECT bool_or(ev_service_id IS NOT NULL) FROM vehicles v WHERE v.reservation_id = r.id) as has_ev,
              (SELECT COALESCE(SUM(ev_kwh), 0) FROM vehicles v WHERE v.reservation_id = r.id) as ev_kwh_total,
              (SELECT ROUND(CAST(price_difference + modification_fee AS numeric), 2) FROM reservation_modifications
               WHERE reservation_id = r.id AND status='pending_payment' LIMIT 1) as pending_payment_amount,
              (SELECT id::text FROM reservation_modifications
               WHERE reservation_id = r.id AND status='pending_payment' LIMIT 1) as pending_modification_id,
              ig.reference as invoice_group_reference,
              ig.billing_name as invoice_group_billing_name,
              ig.status as invoice_group_status
       FROM reservations r
       JOIN customers c ON c.id = r.customer_id
       LEFT JOIN invoice_groups ig ON ig.id = r.invoice_group_id
       ${where}
       ORDER BY r.arrival_date ASC, r.created_at ASC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM reservations r JOIN customers c ON c.id = r.customer_id ${where}`, params),
  ]);

  return res.json({
    data: dataResult.rows,
    total: parseInt(countResult.rows[0].count),
    page: parseInt(page),
    limit: parseInt(limit),
  });
});

// ============================================================
// ADMIN — TODAY'S ARRIVALS & DEPARTURES (accepts ?date=YYYY-MM-DD)
// ============================================================
router.get('/admin/reservations/today', requireAuth, async (req: Request, res: Response) => {
  const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
  const dateTo = (req.query.to as string) || date; // bereik-ondersteuning: ?date=X&to=Y

  const [arrivals, departures] = await Promise.all([
    query(
      `SELECT r.*,
              COALESCE(r.guest_first_name, c.first_name) as first_name,
              COALESCE(r.guest_last_name, c.last_name) as last_name,
              c.email, c.phone,
              (SELECT string_agg(v.license_plate, ', ' ORDER BY v.sort_order) FROM vehicles v WHERE v.reservation_id = r.id) as plates,
              (SELECT COUNT(*) FROM vehicles v WHERE v.reservation_id = r.id) as vehicle_count,
              (SELECT bool_or(ev_service_id IS NOT NULL) FROM vehicles v WHERE v.reservation_id = r.id) as has_ev,
              (SELECT COALESCE(SUM(ev_kwh), 0) FROM vehicles v WHERE v.reservation_id = r.id) as ev_kwh_total,
              (SELECT bool_or(ev_service_id IS NOT NULL AND ev_kwh IS NULL) FROM vehicles v WHERE v.reservation_id = r.id) as has_ev_vol,
              (SELECT rdw_color FROM vehicles v WHERE v.reservation_id = r.id ORDER BY sort_order LIMIT 1) as rdw_color,
              (SELECT rdw_make FROM vehicles v WHERE v.reservation_id = r.id ORDER BY sort_order LIMIT 1) as rdw_make,
              (SELECT rdw_model FROM vehicles v WHERE v.reservation_id = r.id ORDER BY sort_order LIMIT 1) as rdw_model,
              (SELECT rdw_year FROM vehicles v WHERE v.reservation_id = r.id ORDER BY sort_order LIMIT 1) as rdw_year,
              (SELECT ROUND(CAST(price_difference + modification_fee AS numeric), 2) FROM reservation_modifications
               WHERE reservation_id = r.id AND status='pending_payment' LIMIT 1) as pending_payment_amount,
              (SELECT id::text FROM reservation_modifications
               WHERE reservation_id = r.id AND status='pending_payment' LIMIT 1) as pending_modification_id,
              f_out.name as ferry_outbound_name,
              f_out.duration_min as ferry_outbound_duration,
              f_ret.name as ferry_return_name,
              f_ret.duration_min as ferry_return_duration,
              (SELECT TO_CHAR(fs.arrival_harlingen, 'HH24:MI')
               FROM ferry_schedules fs
               WHERE fs.schedule_date = r.departure_date AND fs.direction = 'return'
                 AND r.ferry_return_time IS NOT NULL
                 AND ABS(EXTRACT(EPOCH FROM (fs.departure_time - r.ferry_return_time)) / 60) <= 20
               ORDER BY ABS(EXTRACT(EPOCH FROM (fs.departure_time - r.ferry_return_time)))
               LIMIT 1) as ret_schedule_arrival,
              ig.id as invoice_group_id,
              ig.reference as invoice_group_reference
       FROM reservations r
       JOIN customers c ON c.id = r.customer_id
       LEFT JOIN ferries f_out ON f_out.id = r.ferry_outbound_id
       LEFT JOIN ferries f_ret ON f_ret.id = r.ferry_return_id
       LEFT JOIN invoice_groups ig ON ig.id = r.invoice_group_id
       WHERE r.arrival_date BETWEEN $1 AND $2 AND r.status NOT IN ('cancelled')
       ORDER BY r.arrival_date ASC, r.ferry_outbound_time ASC NULLS LAST, r.created_at ASC`,
      [date, dateTo]
    ),
    query(
      `SELECT r.*,
              COALESCE(r.guest_first_name, c.first_name) as first_name,
              COALESCE(r.guest_last_name, c.last_name) as last_name,
              c.email, c.phone,
              (SELECT string_agg(v.license_plate, ', ' ORDER BY v.sort_order) FROM vehicles v WHERE v.reservation_id = r.id) as plates,
              (SELECT COUNT(*) FROM vehicles v WHERE v.reservation_id = r.id) as vehicle_count,
              f.name as ferry_return_name,
              f.duration_min as ferry_return_duration,
              (SELECT TO_CHAR(fs.arrival_harlingen, 'HH24:MI')
               FROM ferry_schedules fs
               WHERE fs.schedule_date = r.departure_date AND fs.direction = 'return'
                 AND r.ferry_return_time IS NOT NULL
                 AND ABS(EXTRACT(EPOCH FROM (fs.departure_time - r.ferry_return_time)) / 60) <= 20
               ORDER BY ABS(EXTRACT(EPOCH FROM (fs.departure_time - r.ferry_return_time)))
               LIMIT 1) as ret_schedule_arrival
       FROM reservations r
       JOIN customers c ON c.id = r.customer_id
       LEFT JOIN ferries f ON f.id = r.ferry_return_id
       WHERE r.departure_date BETWEEN $1 AND $2 AND r.status IN ('booked', 'checked_in', 'completed')
       ORDER BY r.departure_date ASC, r.ferry_return_time ASC NULLS LAST`,
      [date, dateTo]
    ),
  ]);

  // Compute return arrival time (vertrek eiland + duration)
  const addMinutes = (time: string, mins: number) => {
    if (!time || !mins) return null;
    const [h, m] = time.slice(0, 5).split(':').map(Number);
    const total = h * 60 + m + mins;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  const mapRow = (r: any) => ({
    ...r,
    ferry_outbound_time: r.ferry_outbound_time?.slice(0, 5) || null,
    ferry_outbound_arrival_island: r.ferry_outbound_time
      ? addMinutes(r.ferry_outbound_time.slice(0, 5), r.ferry_outbound_duration)
      : null,
    ferry_return_time: r.ferry_return_time?.slice(0, 5) || null,
    ferry_return_arrival_harlingen: r.ferry_return_time
      ? (r.ret_schedule_arrival ||
         (r.ferry_return_duration ? addMinutes(r.ferry_return_time.slice(0, 5), r.ferry_return_duration) : null) ||
         r.ferry_return_custom_time?.slice(0, 5) || null)
      : null,
    nights: r.arrival_date && r.departure_date
      ? Math.round((new Date(r.departure_date).getTime() - new Date(r.arrival_date).getTime()) / 86400000)
      : null,
  });

  return res.json({
    arrivals: arrivals.rows.map(mapRow),
    departures: departures.rows.map(mapRow),
  });
});

// ============================================================
// ADMIN — RESERVATION DETAIL
// ============================================================
router.get('/admin/reservations/:id', requireAuth, async (req: Request, res: Response) => {
  const [resResult, vehiclesResult] = await Promise.all([
    query(
      `SELECT r.*,
              COALESCE(r.guest_first_name, c.first_name) as first_name,
              COALESCE(r.guest_last_name, c.last_name) as last_name,
              c.email, c.phone, c.btw_number,
              f_out.name as ferry_outbound_name, f_out.duration_min as ferry_outbound_duration,
              f_ret.name as ferry_return_name,  f_ret.duration_min as ferry_return_duration,
              (SELECT TO_CHAR(fs.arrival_harlingen, 'HH24:MI')
               FROM ferry_schedules fs
               WHERE fs.schedule_date = r.departure_date AND fs.direction = 'return'
                 AND r.ferry_return_time IS NOT NULL
                 AND ABS(EXTRACT(EPOCH FROM (fs.departure_time - r.ferry_return_time)) / 60) <= 20
               ORDER BY ABS(EXTRACT(EPOCH FROM (fs.departure_time - r.ferry_return_time)))
               LIMIT 1) as ret_schedule_arrival
       FROM reservations r
       JOIN customers c ON c.id = r.customer_id
       LEFT JOIN ferries f_out ON f_out.id = r.ferry_outbound_id
       LEFT JOIN ferries f_ret ON f_ret.id = r.ferry_return_id
       WHERE r.id = $1`,
      [req.params.id]
    ),
    query('SELECT * FROM vehicles WHERE reservation_id = $1 ORDER BY sort_order', [req.params.id]),
  ]);

  if (resResult.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });

  const r = resResult.rows[0];
  const addMin = (t: string, m: number) => {
    if (!t || !m) return null;
    const [h, min] = t.slice(0, 5).split(':').map(Number);
    const tot = h * 60 + min + m;
    return `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
  };
  const row = {
    ...r,
    ferry_outbound_time: r.ferry_outbound_time?.slice(0, 5) || null,
    ferry_return_time: r.ferry_return_time?.slice(0, 5) || null,
    ferry_outbound_arrival_island: r.ferry_outbound_time ? addMin(r.ferry_outbound_time, r.ferry_outbound_duration) : null,
    ferry_return_arrival_harlingen: r.ferry_return_time
      ? (r.ret_schedule_arrival ||
         (r.ferry_return_duration ? addMin(r.ferry_return_time, r.ferry_return_duration) : null) ||
         r.ferry_return_custom_time?.slice(0, 5) || null)
      : null,
  };

  return res.json({ ...row, vehicles: vehiclesResult.rows });
});

// ============================================================
// ADMIN — STRIPE BETALINGSDETAILS
// ============================================================
router.get('/admin/reservations/:id/stripe', requireAuth, async (req: Request, res: Response) => {
  const result = await query(
    'SELECT stripe_payment_intent_id, stripe_customer_id, payment_status, payment_method FROM reservations WHERE id = $1',
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });

  const r = result.rows[0];
  if (!r.stripe_payment_intent_id) {
    return res.json({ hasStripe: false, payment_method: r.payment_method, payment_status: r.payment_status });
  }

  try {
    const intent = await getPaymentIntent(r.stripe_payment_intent_id);

    // Haal charge op voor kaartdetails
    let charge: any = null;
    if (intent.latest_charge) {
      const stripe = (await import('stripe')).default;
      const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });
      const chargeId = typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge.id;
      charge = await stripeClient.charges.retrieve(chargeId);
    }

    return res.json({
      hasStripe: true,
      intentId: intent.id,
      intentStatus: intent.status,
      amount: intent.amount / 100,
      amountReceived: intent.amount_received / 100,
      currency: intent.currency,
      created: intent.created,
      stripeCustomerId: r.stripe_customer_id,
      paymentMethodType: intent.payment_method_types?.[0] || null,
      charge: charge ? {
        id: charge.id,
        status: charge.status,
        paid: charge.paid,
        refunded: charge.refunded,
        amountRefunded: charge.amount_refunded / 100,
        paymentMethodDetails: charge.payment_method_details,
        receiptUrl: charge.receipt_url,
        created: charge.created,
      } : null,
    });
  } catch (e: any) {
    // Stripe kon de intent niet ophalen (bijv. test/live mismatch), maar we hebben wel een ID
    return res.json({
      hasStripe: true,
      intentId: r.stripe_payment_intent_id,
      stripeCustomerId: r.stripe_customer_id,
      fetchError: e.message,
      intentStatus: null,
      amount: null,
      amountReceived: null,
      currency: null,
      created: null,
      paymentMethodType: null,
      charge: null,
    });
  }
});

// ============================================================
// ADMIN — NIEUWE BOEKING AANMAKEN (bypass beschikbaarheidscheck)
// ============================================================
router.post('/admin/reservations', requireAuth, async (req: Request, res: Response) => {
  const { arrivalDate, departureDate, ferryOutboundDestination, paymentMethod, customerNote, customer, vehicles, invoiceGroupId } = req.body;
  if (!arrivalDate || !departureDate || !customer?.email || !vehicles?.length) {
    return res.status(400).json({ error: 'Vereiste velden ontbreken' });
  }
  const lotId = 'b0000000-0000-0000-0000-000000000001';
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Upsert customer
    const customerResult = await client.query(
      `INSERT INTO customers (first_name, last_name, email, phone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
             phone = COALESCE(EXCLUDED.phone, customers.phone), updated_at = NOW()
       RETURNING id`,
      [customer.firstName, customer.lastName, customer.email, customer.phone || null]
    );
    const customerId = customerResult.rows[0].id;

    // Calculate price
    const priceInfo = await calculatePrice(new Date(arrivalDate), new Date(departureDate), lotId, vehicles.length);

    // EV services total
    let servicesTotal = 0;
    for (const v of vehicles) {
      if (v.evServiceId) {
        const svc = await client.query('SELECT price FROM services WHERE id = $1', [v.evServiceId]);
        if (svc.rows.length > 0) servicesTotal += parseFloat(svc.rows[0].price);
      }
    }

    // Op factuur: payment_method='invoice', payment_status='invoiced'
    const isInvoice = !!invoiceGroupId;
    const pm = isInvoice ? 'invoice' : (paymentMethod || 'on_site');
    const payStatus = isInvoice ? 'invoiced' : 'pending';
    const totalPrice = priceInfo.totalPrice + servicesTotal; // geen on_site toeslag voor admin
    const vatAmount = Math.round(totalPrice * 0.21 * 100) / 100;
    const reference = await generateReference();

    // Validate invoice group exists
    if (invoiceGroupId) {
      const igCheck = await client.query('SELECT id FROM invoice_groups WHERE id = $1', [invoiceGroupId]);
      if (igCheck.rows.length === 0) return res.status(400).json({ error: 'Factuurgroep niet gevonden' });
    }

    const resResult = await client.query(
      `INSERT INTO reservations (
        reference, customer_id, parking_lot_id, rate_id,
        status, payment_status, payment_method,
        arrival_date, departure_date,
        ferry_outbound_destination,
        base_price, season_surcharge_amount, services_total, on_site_surcharge,
        total_price, vat_amount, admin_notes, policy_anchor_date,
        invoice_group_id,
        guest_first_name, guest_last_name
      ) VALUES (
        $1,$2,$3,$4,
        'booked',$5,$6,
        $7,$8,
        $9,
        $10,$11,$12,0,
        $13,$14,$15,$7,
        $16,
        $17,$18
      ) RETURNING id, reference, cancellation_token`,
      [
        reference, customerId, lotId, priceInfo.rateId,
        payStatus, pm,
        arrivalDate, departureDate,
        ferryOutboundDestination || 'terschelling',
        priceInfo.totalPrice, priceInfo.seasonSurchargeAmount || 0, servicesTotal,
        totalPrice, vatAmount, customerNote || null,
        invoiceGroupId || null,
        invoiceGroupId ? (customer.firstName || null) : null,
        invoiceGroupId ? (customer.lastName || null) : null,
      ]
    );
    const reservation = resResult.rows[0];

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const plate = normalizePlate(v.licensePlate);
      let evPrice = 0;
      if (v.evServiceId) {
        const svc = await client.query('SELECT price FROM services WHERE id = $1', [v.evServiceId]);
        if (svc.rows.length > 0) evPrice = parseFloat(svc.rows[0].price);
      }
      const vehicleResult = await client.query(
        `INSERT INTO vehicles (reservation_id, license_plate, ev_service_id, ev_kwh, ev_price, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [reservation.id, plate, v.evServiceId || null, v.evKwh || null, evPrice || null, i]
      );
      lookupRdw(plate).then(rdwInfo => {
        if (rdwInfo) {
          client.query(
            `UPDATE vehicles SET rdw_make=$1, rdw_model=$2, rdw_color=$3, rdw_fuel_type=$4, rdw_year=$5, rdw_fetched_at=NOW() WHERE id=$6`,
            [rdwInfo.make, rdwInfo.model, rdwInfo.color, rdwInfo.fuelType, rdwInfo.year, vehicleResult.rows[0].id]
          ).catch(console.error);
        }
      }).catch(console.error);
    }

    await client.query('COMMIT');
    sendBookingConfirmation(reservation.id).catch(err => console.error('Admin booking email failed:', err));

    return res.status(201).json({ id: reservation.id, reference: reservation.reference, totalPrice });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ============================================================
// ADMIN — STRIPE STATUS SYNCHRONISEREN
// ============================================================
router.post('/admin/reservations/:id/stripe-sync', requireAuth, async (req: Request, res: Response) => {
  const result = await query(
    'SELECT stripe_payment_intent_id, payment_status FROM reservations WHERE id = $1',
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });

  const r = result.rows[0];
  if (!r.stripe_payment_intent_id) {
    return res.status(400).json({ error: 'Geen Stripe payment intent gekoppeld aan deze reservering' });
  }

  try {
    const intent = await getPaymentIntent(r.stripe_payment_intent_id);

    if (intent.status === 'succeeded' && r.payment_status !== 'paid') {
      await query(
        `UPDATE reservations SET payment_status = 'paid' WHERE id = $1`,
        [req.params.id]
      );
      await query(
        `INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id, new_value)
         VALUES ($1, 'stripe_sync_paid', 'reservation', $2, $3)`,
        [req.admin!.adminId, req.params.id, JSON.stringify({ intentId: intent.id, intentStatus: intent.status })]
      );
      return res.json({ updated: true, newStatus: 'paid', intentStatus: intent.status });
    }

    return res.json({ updated: false, currentStatus: r.payment_status, intentStatus: intent.status });
  } catch (e: any) {
    return res.status(502).json({ error: 'Stripe fout: ' + e.message });
  }
});

// ============================================================
// ADMIN — CHECK-IN
// ============================================================
router.post('/admin/reservations/:id/checkin', requireAuth, async (req: Request, res: Response) => {
  const { parkingSpot } = req.body;

  const result = await query('SELECT * FROM reservations WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });

  const res2 = result.rows[0];
  if (res2.status === 'checked_in') {
    return res.status(400).json({ error: 'Reeds ingecheckt' });
  }

  await query(
    `UPDATE reservations SET status='checked_in', checkin_at=NOW(), checkin_by=$1, parking_spot=$2
     WHERE id=$3`,
    [req.admin!.adminId, parkingSpot || null, req.params.id]
  );

  // Audit log
  await query(
    `INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id, new_value)
     VALUES ($1, 'checkin', 'reservation', $2, $3)`,
    [req.admin!.adminId, req.params.id, JSON.stringify({ parkingSpot, checkinAt: new Date() })]
  );

  return res.json({ success: true, checkinAt: new Date(), parkingSpot });
});

// ============================================================
// ADMIN — CHECK-IN + MAIL
// ============================================================
router.post('/admin/reservations/:id/checkin-mail', requireAuth, async (req: Request, res: Response) => {
  const { parkingSpot, extraMessage } = req.body;

  // First check in
  await query(
    `UPDATE reservations SET status='checked_in', checkin_at=NOW(), checkin_by=$1, parking_spot=$2
     WHERE id=$3 AND status NOT IN ('checked_in','completed','cancelled')`,
    [req.admin!.adminId, parkingSpot || null, req.params.id]
  );

  // Send mail
  await sendCheckinMail(req.params.id, parkingSpot, extraMessage);

  return res.json({ success: true });
});

// ============================================================
// ADMIN — CHECKOUT
// ============================================================
router.post('/admin/reservations/:id/checkout', requireAuth, async (req: Request, res: Response) => {
  await query(
    `UPDATE reservations SET status='completed' WHERE id=$1 AND status='checked_in'`,
    [req.params.id]
  );
  return res.json({ success: true });
});

// ============================================================
// ADMIN — CANCEL (with refund)
// ============================================================
router.post('/admin/reservations/:id/cancel', requireAuth, async (req: Request, res: Response) => {
  const { refundPct, reason } = req.body;

  const result = await query('SELECT * FROM reservations WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });

  const res2 = result.rows[0];

  const refundInfo = await calculateRefund(
    new Date(res2.policy_anchor_date || res2.arrival_date),
    parseFloat(res2.total_price),
    refundPct !== undefined ? parseInt(refundPct) : undefined
  );

  // Stripe restitutie verwerken
  if (res2.stripe_payment_intent_id && res2.payment_status === 'paid' && refundInfo.refundAmount > 0) {
    try {
      await processRefund(
        res2.stripe_payment_intent_id,
        refundInfo.refundAmount,
        reason || 'Admin annulering'
      );
    } catch (stripeErr: any) {
      // Log maar blokkeer niet — admin kan later handmatig restitueren via Stripe dashboard
      console.error('Stripe restitutie mislukt bij admin annulering:', stripeErr.message);
      await query(
        `INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id, new_value)
         VALUES ($1, 'stripe_refund_failed', 'reservation', $2, $3)`,
        [req.admin!.adminId, req.params.id, JSON.stringify({ error: stripeErr.message })]
      );
    }
  }

  await query(
    `UPDATE reservations SET status='cancelled', cancelled_at=NOW(), cancelled_by=$1,
     cancellation_reason=$2, refund_amount=$3, refund_percentage=$4 WHERE id=$5`,
    [req.admin!.adminId, reason || null, refundInfo.refundAmount, refundInfo.refundPct, req.params.id]
  );

  sendCancellationMail(req.params.id, refundInfo.refundAmount, refundInfo.refundPct)
    .catch(console.error);

  return res.json({ success: true, ...refundInfo });
});

// ============================================================
// ADMIN — WHATSAPP LINK GENERATOR
// ============================================================
router.get('/admin/reservations/:id/whatsapp', requireAuth, async (req: Request, res: Response) => {
  const { message } = req.query as { message: string };

  const result = await query(
    'SELECT c.phone FROM reservations r JOIN customers c ON c.id = r.customer_id WHERE r.id = $1',
    [req.params.id]
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });

  const rawPhone = result.rows[0].phone || '';
  // Normaliseer naar internationaal formaat: strip alles behalve cijfers, vervang leading 0 door 31
  const digits = rawPhone.replace(/\D/g, '').replace(/^0/, '31');
  const encodedMsg = encodeURIComponent(message || '');
  const waLink = `whatsapp://send/?phone=%2B${digits}&text=${encodedMsg}`;

  return res.json({ waLink, phone: digits });
});

// ============================================================
// ADMIN — AVAILABILITY OVERVIEW
// ============================================================
router.get('/admin/availability', requireAuth, async (req: Request, res: Response) => {
  const { from, to, lot_id } = req.query as Record<string, string>;
  const lotId = lot_id || 'b0000000-0000-0000-0000-000000000001';

  // Generate date series and count bookings per day
  const result = await query(
    `WITH date_series AS (
       SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS d
     ),
     daily_booked AS (
       SELECT d,
         (SELECT COUNT(DISTINCT v.id) FROM reservations r
          JOIN vehicles v ON v.reservation_id = r.id
          WHERE r.parking_lot_id = $3
            AND r.status NOT IN ('cancelled')
            AND r.arrival_date <= d
            AND r.departure_date > d) AS booked
       FROM date_series
     ),
     overrides AS (
       SELECT override_date, available_spots FROM availability_overrides
       WHERE parking_lot_id = $3 AND override_date BETWEEN $1 AND $2
     )
     SELECT ds.d::text as date,
            db.booked,
            COALESCE(o.available_spots, l.online_spots) as max_available,
            GREATEST(0, COALESCE(o.available_spots, l.online_spots) - db.booked) as available,
            (o.override_date IS NOT NULL) as has_override
     FROM date_series ds
     JOIN daily_booked db ON db.d = ds.d
     CROSS JOIN parking_lots pl
     JOIN locations l ON l.id = pl.location_id
     LEFT JOIN overrides o ON o.override_date = ds.d
     WHERE pl.id = $3
     ORDER BY ds.d`,
    [from, to, lotId]
  );

  return res.json(result.rows);
});

// ============================================================
// ADMIN — AVAILABILITY OVERRIDE
// ============================================================
router.put('/admin/availability/override', requireAuth, async (req: Request, res: Response) => {
  try {
    const { date, availableSpots, reason, lotId } = req.body;
    if (!date || availableSpots === undefined) return res.status(400).json({ error: 'date en availableSpots zijn verplicht' });

    await query(
      `INSERT INTO availability_overrides (parking_lot_id, override_date, available_spots, reason, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (parking_lot_id, override_date) DO UPDATE
         SET available_spots = EXCLUDED.available_spots,
             reason = EXCLUDED.reason,
             created_by = EXCLUDED.created_by`,
      [lotId || 'b0000000-0000-0000-0000-000000000001', date, availableSpots, reason || null, req.admin!.adminId]
    );

    return res.json({ success: true });
  } catch (e: any) {
    console.error('Override error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ============================================================
// ADMIN — REMOVE AVAILABILITY OVERRIDE
// ============================================================
router.delete('/admin/availability/override', requireAuth, async (req: Request, res: Response) => {
  const { date, lotId } = req.body;

  await query(
    `DELETE FROM availability_overrides WHERE parking_lot_id = $1 AND override_date = $2`,
    [lotId || 'b0000000-0000-0000-0000-000000000001', date]
  );

  return res.json({ success: true });
});

// ============================================================
// ADMIN — FINANCIAL REPORT
// ============================================================
router.get('/admin/reports/financial', requireAuth, async (req: Request, res: Response) => {
  const { from, to, status, filter_by = 'arrival' } = req.query as Record<string, string>;

  const dateCol = filter_by === 'departure' ? 'r.departure_date' : 'r.arrival_date';
  const params: unknown[] = [];
  let where = 'WHERE 1=1';
  let i = 1;

  if (from) { where += ` AND ${dateCol} >= $${i++}`; params.push(from); }
  if (to) { where += ` AND ${dateCol} <= $${i++}`; params.push(to); }
  if (status) { where += ` AND r.status = $${i++}`; params.push(status); }

  const [rows, totals] = await Promise.all([
    query(
      `SELECT r.reference, r.arrival_date, r.departure_date, r.nights,
              c.first_name || ' ' || c.last_name as customer_name,
              r.total_price, r.payment_status, r.status, r.invoice_date,
              (SELECT string_agg(v.license_plate, ', ' ORDER BY v.sort_order) FROM vehicles v WHERE v.reservation_id = r.id) as plates
       FROM reservations r JOIN customers c ON c.id = r.customer_id
       ${where} ORDER BY ${dateCol} ASC`,
      params
    ),
    query(
      `SELECT
         COALESCE(SUM(CASE WHEN
           payment_status IN ('paid','on_site')
           OR (payment_status = 'pending' AND status IN ('completed','checked_in'))
         THEN total_price END), 0) as total_revenue,
         COALESCE(SUM(refund_amount), 0) as total_refunded,
         COALESCE(SUM(CASE WHEN status = 'cancelled' THEN total_price END), 0) as total_cancelled
       FROM reservations r ${where}`,
      params
    ),
  ]);

  return res.json({ rows: rows.rows, totals: totals.rows[0] });
});

// ─── Kasoverzicht — dagelijkse contant/pin betalingen ────────────────────────
router.get('/admin/reports/cash', requireAuth, async (req: Request, res: Response) => {
  const { from, to } = req.query as Record<string, string>;

  // Valideer datum-formaat (YYYY-MM-DD)
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const fromDate = dateRe.test(from || '') ? from : new Date().toISOString().slice(0, 10);
  const toDate   = dateRe.test(to   || '') ? to   : fromDate;

  const [transactions, totals] = await Promise.all([
    query(
      `SELECT
         r.id, r.reference, r.payment_method,
         r.total_price, r.arrival_date, r.departure_date, r.nights, r.paid_at,
         c.first_name || ' ' || c.last_name AS customer_name,
         c.phone,
         (SELECT string_agg(v.license_plate, ', ' ORDER BY v.sort_order)
          FROM vehicles v WHERE v.reservation_id = r.id) AS plates
       FROM reservations r
       JOIN customers c ON c.id = r.customer_id
       WHERE r.payment_status = 'paid'
         AND r.payment_method IN ('contant', 'pin', 'tikkie', 'ideal', 'card', 'bancontact', 'sepa', 'paypal')
         AND r.paid_at::date >= $1
         AND r.paid_at::date <= $2
       ORDER BY r.paid_at DESC`,
      [fromDate, toDate]
    ),
    query(
      `SELECT
         payment_method,
         COUNT(*)::int AS count,
         COALESCE(SUM(total_price), 0) AS total
       FROM reservations
       WHERE payment_status = 'paid'
         AND payment_method IN ('contant', 'pin', 'tikkie', 'ideal', 'card', 'bancontact', 'sepa', 'paypal')
         AND paid_at::date >= $1
         AND paid_at::date <= $2
       GROUP BY payment_method
       ORDER BY total DESC`,
      [fromDate, toDate]
    ),
  ]);

  const grandTotal = totals.rows.reduce((s: number, r: any) => s + parseFloat(r.total), 0);

  return res.json({
    from: fromDate,
    to: toDate,
    transactions: transactions.rows,
    totals: totals.rows,
    grandTotal,
  });
});

// ─── Bezetting & omzet per periode (jaar-vergelijk) ──────────────────────────
router.get('/admin/reports/occupancy', requireAuth, async (req: Request, res: Response) => {
  try {
    const { groupBy = 'month', fromYear, toYear, filterMonth } = req.query as Record<string, string>;

    const fy = Math.max(2020, Math.min(2030, parseInt(fromYear) || new Date().getFullYear() - 1));
    const ty = Math.max(fy, Math.min(2030, parseInt(toYear) || new Date().getFullYear()));

    // Period grouping expression (safe: controlled values only)
    let periodExpr: string;
    let extraWhere = '';
    if (groupBy === 'week') {
      periodExpr = `EXTRACT(WEEK FROM stay_date)::int`;
    } else if (groupBy === 'day') {
      periodExpr = `EXTRACT(DAY FROM stay_date)::int`;
      const m = parseInt(filterMonth || '');
      if (m >= 1 && m <= 12) extraWhere = ` AND EXTRACT(MONTH FROM stay_date) = ${m}`;
    } else {
      periodExpr = `EXTRACT(MONTH FROM stay_date)::int`;
    }

    const result = await query(`
      WITH stays AS (
        SELECT
          r.id,
          r.total_price / GREATEST((r.nights + 1)::numeric, 1) AS daily_revenue,
          gs::date AS stay_date
        FROM reservations r,
          LATERAL generate_series(
            r.arrival_date::timestamp,
            r.departure_date::timestamp,
            INTERVAL '1 day'
          ) gs
        WHERE r.status NOT IN ('cancelled')
          AND r.nights > 0
          AND (
            r.payment_status IN ('paid','on_site')
            OR (r.payment_status = 'pending' AND r.status IN ('completed','checked_in'))
          )
          AND r.departure_date >= $1::date
          AND r.arrival_date  <= $2::date
      )
      SELECT
        EXTRACT(YEAR FROM stay_date)::int          AS year,
        ${periodExpr}                              AS period,
        ROUND(SUM(daily_revenue)::numeric, 2)      AS revenue,
        COUNT(DISTINCT id)::int                    AS cars,
        COUNT(*)::int                              AS car_days,
        ROUND((SUM(daily_revenue) / NULLIF(COUNT(*),0))::numeric, 2) AS avg_daily_price
      FROM stays
      WHERE EXTRACT(YEAR FROM stay_date) BETWEEN $3 AND $4
      ${extraWhere}
      GROUP BY EXTRACT(YEAR FROM stay_date), ${periodExpr}
      ORDER BY year, period
    `, [`${fy}-01-01`, `${ty}-12-31`, fy, ty]);

    return res.json({ rows: result.rows });
  } catch (err: any) {
    console.error('Occupancy report error:', err);
    return res.status(500).json({ error: err.message || 'Fout bij laden rapport' });
  }
});

// ============================================================
// ADMIN — RATES
// ============================================================
router.get('/admin/rates', requireAuth, async (_req, res) => {
  const rates = await query(
    'SELECT * FROM rates ORDER BY valid_from ASC'
  );
  return res.json(rates.rows);
});

router.get('/admin/rates/:id/day-prices', requireAuth, async (req: Request, res: Response) => {
  const prices = await query(
    'SELECT * FROM rate_day_prices WHERE rate_id = $1 ORDER BY day_number',
    [req.params.id]
  );
  return res.json(prices.rows);
});

router.put('/admin/rates/:id/day-prices', requireAuth, async (req: Request, res: Response) => {
  const { dayPrices } = req.body; // Array of {dayNumber, price, isManualOverride?}
  const client = await getClient();

  try {
    await client.query('BEGIN');
    for (const dp of dayPrices) {
      const isManual = dp.isManualOverride !== false; // default true voor backwards compat
      await client.query(
        `INSERT INTO rate_day_prices (rate_id, day_number, price, is_manual_override)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (rate_id, day_number) DO UPDATE SET
           price = EXCLUDED.price,
           is_manual_override = EXCLUDED.is_manual_override`,
        [req.params.id, dp.dayNumber, dp.price, isManual]
      );
    }
    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ── Admin: Rate aanmaken ───────────────────────────────────────
router.post('/admin/rates', requireAuth, async (req: Request, res: Response) => {
  const { name, validFrom, validUntil, baseDayPrice, minDays, maxDays, customerInfo, sortOrder } = req.body;
  const lotResult = await query('SELECT id FROM parking_lots LIMIT 1');
  if (lotResult.rows.length === 0) return res.status(400).json({ error: 'Geen parkeerlocatie gevonden' });
  const lotId = lotResult.rows[0].id;

  const result = await query(
    `INSERT INTO rates (parking_lot_id, name, valid_from, valid_until, base_day_price, min_days, max_days, customer_info, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [lotId, name, validFrom, validUntil, baseDayPrice || 8.00, minDays || 1, maxDays || 100, customerInfo || null, sortOrder ?? 0]
  );
  const rate = result.rows[0];

  // Genereer standaard dagprijzen (dag 1..30: dagprijs × aantal dagen)
  const base = parseFloat(baseDayPrice || 8.00);
  for (let d = 1; d <= 30; d++) {
    await query(
      'INSERT INTO rate_day_prices (rate_id, day_number, price, is_manual_override) VALUES ($1, $2, $3, false) ON CONFLICT DO NOTHING',
      [rate.id, d, parseFloat((base * d).toFixed(2))]
    );
  }
  return res.json(rate);
});

// ── Admin: Rate bijwerken ──────────────────────────────────────
router.put('/admin/rates/:id', requireAuth, async (req: Request, res: Response) => {
  const { name, validFrom, validUntil, baseDayPrice, minDays, maxDays, customerInfo, sortOrder, isActive } = req.body;
  const result = await query(
    `UPDATE rates SET
       name        = COALESCE($1, name),
       valid_from  = COALESCE($2::date, valid_from),
       valid_until = COALESCE($3::date, valid_until),
       base_day_price = COALESCE($4, base_day_price),
       min_days    = COALESCE($5, min_days),
       max_days    = COALESCE($6, max_days),
       customer_info = $7,
       sort_order  = COALESCE($8, sort_order),
       is_active   = COALESCE($9, is_active),
       updated_at  = NOW()
     WHERE id = $10 RETURNING *`,
    [name, validFrom || null, validUntil || null, baseDayPrice ?? null, minDays ?? null, maxDays ?? null, customerInfo ?? null, sortOrder ?? null, isActive ?? null, req.params.id]
  );
  return res.json(result.rows[0]);
});

// ── Admin: Rate verwijderen ────────────────────────────────────
router.delete('/admin/rates/:id', requireAuth, async (req: Request, res: Response) => {
  await query('DELETE FROM rates WHERE id = $1', [req.params.id]);
  return res.json({ success: true });
});

// ============================================================
// ADMIN — EMAIL TEMPLATES
// ============================================================
router.get('/admin/email-templates', requireAuth, async (_req, res) => {
  const templates = await query('SELECT id, slug, name, subject, description, variables FROM email_templates');
  return res.json(templates.rows);
});

router.get('/admin/email-templates/:slug', requireAuth, async (req: Request, res: Response) => {
  const result = await query('SELECT * FROM email_templates WHERE slug = $1', [req.params.slug]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  return res.json(result.rows[0]);
});

router.put('/admin/email-templates/:slug', requireAuth, async (req: Request, res: Response) => {
  const { subject, body_html } = req.body;
  await query(
    'UPDATE email_templates SET subject=$1, body_html=$2, updated_at=NOW() WHERE slug=$3',
    [subject, body_html, req.params.slug]
  );
  return res.json({ success: true });
});

router.post('/admin/email-templates/:slug/test', requireAuth, async (req: Request, res: Response) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Ontvanger (to) is verplicht' });

  const testVars: Record<string, string> = {
    voornaam: 'Jan',
    reference: 'TEST-2026-001',
    aankomst_datum: 'maandag 20 april 2026',
    vertrek_datum: 'vrijdag 24 april 2026',
    kentekenlijst: 'AB-123-C',
    veerboot_heen: 'Veerdienst Terschelling',
    vertrektijd_heen: '09:00',
    veerboot_terug: 'Sneldienst',
    vertrektijd_terug: '17:30',
    totaal_bedrag: '€ 45,00',
    annuleringslink: 'https://booking.parkeren-harlingen.nl/annuleren/test-token',
    wijzigingslink: 'https://booking.parkeren-harlingen.nl/wijzigen/test-token',
    factuurlink: 'https://api.booking.parkeren-harlingen.nl/api/v1/invoice/test-token',
    whatsapp_nummer: '31612345678',
    kenteken: 'AB-123-C',
    inchecktijd: '10:30',
    vaknummer: 'A12',
    extra_bericht: 'Dit is een testmail vanuit het admin paneel.',
    restitutie_bedrag: '€ 10,00',
    restitutie_pct: '20%',
    nieuwe_aankomst: 'dinsdag 21 april 2026',
    nieuw_vertrek: 'zaterdag 25 april 2026',
  };

  await sendTemplatedEmail(req.params.slug, to, testVars);
  return res.json({ success: true });
});

// ============================================================
// ADMIN — FERRY SCHEDULES
// ============================================================
router.get('/admin/ferries', requireAuth, async (_req, res) => {
  const ferries = await query('SELECT * FROM ferries WHERE is_active = true ORDER BY sort_order');
  return res.json(ferries.rows);
});

router.post('/admin/ferries/schedule', requireAuth, async (req: Request, res: Response) => {
  const { ferryId, date, departureTime, direction, destination, notes } = req.body;

  // Calculate arrival at Harlingen for return trips
  const ferryResult = await query('SELECT duration_min FROM ferries WHERE id = $1', [ferryId]);
  let arrivalHarlingen = null;
  if (direction === 'return' && ferryResult.rows.length > 0) {
    const [h, m] = departureTime.split(':').map(Number);
    const arrMins = h * 60 + m + ferryResult.rows[0].duration_min;
    arrivalHarlingen = `${String(Math.floor(arrMins / 60)).padStart(2, '0')}:${String(arrMins % 60).padStart(2, '0')}`;
  }

  await query(
    `INSERT INTO ferry_schedules (ferry_id, schedule_date, departure_time, direction, destination, arrival_harlingen, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (ferry_id, schedule_date, departure_time, direction) DO UPDATE
       SET arrival_harlingen = EXCLUDED.arrival_harlingen, notes = EXCLUDED.notes`,
    [ferryId, date, departureTime, direction, destination, arrivalHarlingen, notes || null]
  );

  return res.json({ success: true, arrivalHarlingen });
});

// ── Admin: Doeksen sync handmatig triggeren ───────────────────
router.post('/admin/ferries/doeksen-sync', requireAuth, async (req: Request, res: Response) => {
  const { days = 7, fromDate } = req.body;
  const capped = Math.min(Number(days) || 7, 60);
  const startDate = fromDate ? new Date(fromDate) : undefined;
  // Antwoord direct — sync draait op de achtergrond (kan minuten duren voor veel dagen)
  res.json({ success: true, started: true, days: capped, message: `Doeksen sync gestart voor ${capped} dagen` });
  syncDoeksenScheduleDays(capped, startDate).catch((err: any) => {
    console.error(`Doeksen sync achtergrond fout: ${err.message}`);
  });
});

// ── Admin: Doeksen sync voor specifieke datum ─────────────────
router.post('/admin/ferries/doeksen-sync/:date', requireAuth, async (req: Request, res: Response) => {
  const date = new Date(req.params.date);
  if (isNaN(date.getTime())) return res.status(400).json({ error: 'Ongeldige datum' });
  const result = await syncDoeksenSchedule(date);
  return res.json({ success: true, ...result });
});

// ============================================================
// ADMIN — SERVICES
// ============================================================
router.get('/admin/services', requireAuth, async (_req, res) => {
  const result = await query('SELECT * FROM services ORDER BY sort_order, created_at');
  return res.json(result.rows);
});

router.post('/admin/services', requireAuth, async (req: Request, res: Response) => {
  const { name, description, customerInfo, price, unit, kwh, adminOnly, isActive } = req.body;
  const maxOrder = await query('SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM services');
  const result = await query(
    `INSERT INTO services (name, description, customer_info, price, unit, kwh, admin_only, is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [name || 'Nieuwe dienst', description || null, customerInfo || null,
     parseFloat(price) || 0, unit || 'per_booking', kwh || null,
     adminOnly ?? false, isActive ?? true, maxOrder.rows[0].next]
  );
  return res.status(201).json(result.rows[0]);
});

router.put('/admin/services/:id', requireAuth, async (req: Request, res: Response) => {
  const { name, description, customerInfo, price, unit, kwh, adminOnly, isActive, sortOrder } = req.body;
  const result = await query(
    `UPDATE services SET name=$1, description=$2, customer_info=$3, price=$4,
     unit=$5, kwh=$6, admin_only=$7, is_active=$8, sort_order=COALESCE($9, sort_order), updated_at=NOW()
     WHERE id=$10 RETURNING *`,
    [name, description, customerInfo, parseFloat(price), unit, kwh || null,
     adminOnly, isActive, sortOrder ?? null, req.params.id]
  );
  return res.json(result.rows[0]);
});

router.delete('/admin/services/:id', requireAuth, async (req: Request, res: Response) => {
  await query('DELETE FROM services WHERE id=$1', [req.params.id]);
  return res.json({ success: true });
});

// ============================================================
// ADMIN — CANCELLATION POLICIES
// ============================================================
router.get('/admin/cancellation-policies', requireAuth, async (_req, res) => {
  const result = await query(
    'SELECT * FROM cancellation_policies WHERE is_active = true ORDER BY sort_order'
  );
  return res.json(result.rows);
});

router.put('/admin/cancellation-policies/:id', requireAuth, async (req: Request, res: Response) => {
  const { daysBeforeMin, daysBeforeMax, refundPercentage, description } = req.body;
  await query(
    `UPDATE cancellation_policies SET days_before_min=$1, days_before_max=$2,
     refund_percentage=$3, description=$4 WHERE id=$5`,
    [daysBeforeMin, daysBeforeMax, refundPercentage, description, req.params.id]
  );
  return res.json({ success: true });
});

// ============================================================
// ADMIN — UPDATE RESERVATION (notes, dates, ferry)
// ============================================================
router.put('/admin/reservations/:id', requireAuth, async (req: Request, res: Response) => {
  const { admin_notes, arrival_date, departure_date, parking_spot, parkingSpot,
          ferryOutboundTime, ferryReturnTime, ferryOutboundDestination, ferryReturnDestination, vehicles,
          status, firstName, lastName, email, phone,
          paymentStatus, paymentMethod } = req.body;

  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (admin_notes !== undefined) { updates.push(`admin_notes = $${i++}`); params.push(admin_notes); }
  if (arrival_date) { updates.push(`arrival_date = $${i++}`); params.push(arrival_date); }
  if (departure_date) { updates.push(`departure_date = $${i++}`); params.push(departure_date); }
  const spot = parkingSpot ?? parking_spot;
  if (spot !== undefined) { updates.push(`parking_spot = $${i++}`); params.push(spot); }
  if (ferryOutboundTime !== undefined) { updates.push(`ferry_outbound_time = $${i++}`); params.push(ferryOutboundTime || null); }
  if (ferryReturnTime !== undefined) { updates.push(`ferry_return_time = $${i++}`); params.push(ferryReturnTime || null); }
  if (ferryOutboundDestination !== undefined) { updates.push(`ferry_outbound_destination = $${i++}`); params.push(ferryOutboundDestination || null); }
  if (ferryReturnDestination !== undefined) { updates.push(`ferry_return_destination = $${i++}`); params.push(ferryReturnDestination || null); }
  const allowedStatuses = ['booked', 'checked_in', 'completed', 'cancelled'];
  if (status !== undefined && allowedStatuses.includes(status)) { updates.push(`status = $${i++}`); params.push(status); }
  const allowedPaymentStatuses = ['paid', 'pending', 'partial', 'on_site'];
  if (paymentStatus !== undefined && allowedPaymentStatuses.includes(paymentStatus)) {
    updates.push(`payment_status = $${i++}`); params.push(paymentStatus);
    // Sla tijdstip van betaling op voor kasoverzicht
    if (paymentStatus === 'paid') { updates.push(`paid_at = NOW()`); }
  }
  const allowedPaymentMethods = ['contant', 'pin', 'ideal', 'card', 'paypal', 'sepa', 'bancontact', 'on_site', 'tikkie', 'invoice'];
  if (paymentMethod !== undefined && allowedPaymentMethods.includes(paymentMethod)) { updates.push(`payment_method = $${i++}`); params.push(paymentMethod); }

  // guest_first_name / guest_last_name voor factuurgroep-boekingen
  if (firstName !== undefined) { updates.push(`guest_first_name = $${i++}`); params.push(firstName || null); }
  if (lastName !== undefined) { updates.push(`guest_last_name = $${i++}`); params.push(lastName || null); }

  if (updates.length > 0) {
    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);
    await query(`UPDATE reservations SET ${updates.join(', ')} WHERE id = $${i}`, params);
  }

  // Klantgegevens bijwerken (naam, e-mail, telefoon)
  if (firstName !== undefined || lastName !== undefined || email !== undefined || phone !== undefined) {
    const res2 = await query(`SELECT customer_id FROM reservations WHERE id = $1`, [req.params.id]);
    if (res2.rows.length > 0) {
      const custId = res2.rows[0].customer_id;
      const custUpdates: string[] = [];
      const custParams: unknown[] = [];
      let ci = 1;
      if (firstName !== undefined) { custUpdates.push(`first_name = $${ci++}`); custParams.push(firstName); }
      if (lastName !== undefined) { custUpdates.push(`last_name = $${ci++}`); custParams.push(lastName); }
      if (email !== undefined) { custUpdates.push(`email = $${ci++}`); custParams.push(email); }
      if (phone !== undefined) { custUpdates.push(`phone = $${ci++}`); custParams.push(phone || null); }
      if (custUpdates.length > 0) {
        custUpdates.push(`updated_at = NOW()`);
        custParams.push(custId);
        await query(`UPDATE customers SET ${custUpdates.join(', ')} WHERE id = $${ci}`, custParams);
      }
    }
  }

  // Update vehicle license plates — alleen bestaande voertuigen, nooit nieuwe aanmaken
  if (Array.isArray(vehicles) && vehicles.length > 0) {
    for (const v of vehicles) {
      if (v.license_plate) {
        const plate = normalizePlate(v.license_plate);
        const sortOrder = v.sort_order ?? 0;
        await query(
          `UPDATE vehicles SET license_plate = $1,
            rdw_make = NULL, rdw_model = NULL, rdw_color = NULL,
            rdw_fuel_type = NULL, rdw_year = NULL, rdw_fetched_at = NULL
           WHERE reservation_id = $2 AND sort_order = $3`,
          [plate, req.params.id, sortOrder]
        );
        // Async RDW re-fetch
        lookupRdw(plate).then(info => {
          if (info) {
            query(
              `UPDATE vehicles SET rdw_make=$1, rdw_model=$2, rdw_color=$3, rdw_fuel_type=$4, rdw_year=$5, rdw_fetched_at=NOW()
               WHERE reservation_id=$6 AND sort_order=$7`,
              [info.make, info.model, info.color, info.fuelType, info.year, req.params.id, sortOrder]
            ).catch(console.error);
          }
        }).catch(console.error);
      }
    }
  }

  if (updates.length === 0 && !(Array.isArray(vehicles) && vehicles.length > 0)) {
    return res.status(400).json({ error: 'Geen velden om bij te werken' });
  }

  await query(
    `INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id, new_value)
     VALUES ($1, 'update', 'reservation', $2, $3)`,
    [req.admin!.adminId, req.params.id, JSON.stringify(req.body)]
  );

  return res.json({ success: true });
});

// ============================================================
// ADMIN — EXTRA FACTUURREGELS bijwerken
// ============================================================
router.put('/admin/reservations/:id/extra-items', requireAuth, async (req: Request, res: Response) => {
  const { items } = req.body;

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'items moet een array zijn' });
  }

  // Valideer elk item
  const clean = items.map((it: any) => ({
    description: String(it.description || '').trim(),
    quantity: Math.max(1, parseInt(it.quantity) || 1),
    unit_price: Math.round(parseFloat(it.unit_price || 0) * 100) / 100,
  })).filter(it => it.description.length > 0);

  await query(
    `UPDATE reservations SET invoice_extra_items = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(clean), req.params.id]
  );

  await query(
    `INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id, new_value)
     VALUES ($1, 'update_extra_items', 'reservation', $2, $3)`,
    [req.admin!.adminId, req.params.id, JSON.stringify(clean)]
  );

  return res.json({ success: true, items: clean });
});

// ============================================================
// ADMIN — FACTUURDATUM wijzigen
// ============================================================
router.put('/admin/reservations/:id/invoice-date', requireAuth, async (req: Request, res: Response) => {
  const { invoice_date } = req.body;
  // Accepteer ISO-datum string of null (reset naar reserveringsdatum)
  const dateVal = invoice_date ? String(invoice_date).slice(0, 10) : null;
  if (dateVal && !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
    return res.status(400).json({ error: 'Ongeldige datum, verwacht YYYY-MM-DD' });
  }
  await query(
    `UPDATE reservations SET invoice_date = $1, updated_at = NOW() WHERE id = $2`,
    [dateVal, req.params.id]
  );
  await query(
    `INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id, new_value)
     VALUES ($1, 'update_invoice_date', 'reservation', $2, $3)`,
    [req.admin!.adminId, req.params.id, JSON.stringify({ invoice_date: dateVal })]
  );
  return res.json({ success: true, invoice_date: dateVal });
});

// ============================================================
// ADMIN — BETALEN TER PLEKKE toeslag (+€5)
// ============================================================
router.post('/admin/reservations/:id/on-site-surcharge', requireAuth, async (req: Request, res: Response) => {
  try {
    const { remove } = req.body; // remove=true → zet toeslag terug op 0
    const r = await query(
      `SELECT total_price, base_price, on_site_surcharge, season_surcharge_amount, services_total FROM reservations WHERE id = $1`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Reservering niet gevonden' });

    const currentSurcharge = parseFloat(r.rows[0].on_site_surcharge || '0');
    const currentTotal = parseFloat(r.rows[0].total_price || '0');
    const currentBase = parseFloat(r.rows[0].base_price || '0');

    if (remove) {
      // Verwijder toeslag: zet base_price terug, totaal blijft gelijk
      if (currentSurcharge <= 0) return res.json({ success: true, message: 'Geen toeslag actief' });
      const newBase = Math.round((currentBase + currentSurcharge) * 100) / 100;
      await query(
        `UPDATE reservations SET on_site_surcharge = 0, base_price = $1, payment_status = 'pending', payment_method = NULL, updated_at = NOW() WHERE id = $2`,
        [newBase, req.params.id]
      );
      return res.json({ success: true, on_site_surcharge: 0, total_price: currentTotal, base_price: newBase });
    }

    if (currentSurcharge > 0) {
      // Al ingesteld — alleen payment_status aanpassen
      await query(`UPDATE reservations SET payment_status = 'on_site', updated_at = NOW() WHERE id = $1`, [req.params.id]);
      return res.json({ success: true, on_site_surcharge: currentSurcharge, total_price: currentTotal, alreadySet: true });
    }

    // Splits €5 uit de bestaande base_price — totaalprijs blijft ongewijzigd
    const surcharge = 5;
    if (currentBase < surcharge) {
      return res.status(400).json({ error: 'Base prijs te laag om €5 toeslag uit te splitsen' });
    }
    const newBase = Math.round((currentBase - surcharge) * 100) / 100;
    await query(
      `UPDATE reservations SET on_site_surcharge = $1, base_price = $2, payment_status = 'on_site', updated_at = NOW() WHERE id = $3`,
      [surcharge, newBase, req.params.id]
    );
    await query(
      `INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id, new_value)
       VALUES ($1, 'add_on_site_surcharge', 'reservation', $2, $3)`,
      [req.admin!.adminId, req.params.id, JSON.stringify({ surcharge, newBase, total_unchanged: currentTotal })]
    );
    return res.json({ success: true, on_site_surcharge: surcharge, base_price: newBase, total_price: currentTotal });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ============================================================
// ADMIN — BETAALSTATUS handmatig wijzigen
// ============================================================
router.put('/admin/reservations/:id/payment-status', requireAuth, async (req: Request, res: Response) => {
  const { status, method } = req.body;

  const allowed = ['pending', 'paid', 'on_site', 'failed'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Ongeldige status. Toegestaan: ${allowed.join(', ')}` });
  }

  await query(
    `UPDATE reservations
     SET payment_status = $1, payment_method = $2, updated_at = NOW(),
         paid_at = CASE WHEN $4 = 'paid' THEN NOW() ELSE paid_at END
     WHERE id = $3`,
    [status, method || null, req.params.id, status]
  );

  await query(
    `INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id, new_value)
     VALUES ($1, 'update_payment_status', 'reservation', $2, $3)`,
    [req.admin!.adminId, req.params.id, JSON.stringify({ status, method })]
  );

  return res.json({ success: true });
});

// ============================================================
// ADMIN — SETTINGS (GET + PUT)
// ============================================================
// ADMIN — FACTUURGROEPEN (invoice groups)
// ============================================================

// Helper: genereer factuur-referentie FAC-YYYY-NNN
async function generateInvoiceReference(): Promise<string> {
  const year = new Date().getFullYear();
  const last = await query(
    `SELECT reference FROM invoice_groups WHERE reference LIKE $1 ORDER BY reference DESC LIMIT 1`,
    [`FAC-${year}-%`]
  );
  let seq = 1;
  if (last.rows.length > 0) {
    const parts = last.rows[0].reference.split('-');
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }
  return `FAC-${year}-${String(seq).padStart(3, '0')}`;
}

// GET /admin/invoice-groups — lijst met aantallen en totaalbedrag
router.get('/admin/invoice-groups', requireAuth, async (_req, res: Response) => {
  const result = await query(
    `SELECT ig.*,
            COUNT(r.id) AS reservation_count,
            COALESCE(SUM(r.total_price), 0) AS total_amount
     FROM invoice_groups ig
     LEFT JOIN reservations r ON r.invoice_group_id = ig.id
     GROUP BY ig.id
     ORDER BY ig.created_at DESC`
  );
  res.json(result.rows);
});

// POST /admin/invoice-groups — aanmaken
router.post('/admin/invoice-groups', requireAuth, async (req: Request, res: Response) => {
  const { billingName, billingCompany, billingAddress, billingPostalCode, billingCity, billingEmail, billingVatNumber, notes } = req.body;
  if (!billingName || !billingEmail) {
    return res.status(400).json({ error: 'Naam en e-mailadres zijn verplicht' });
  }
  const reference = await generateInvoiceReference();
  const result = await query(
    `INSERT INTO invoice_groups (reference, billing_name, billing_company, billing_address, billing_postal_code, billing_city, billing_email, billing_vat_number, notes, modification_token)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, encode(gen_random_bytes(32), 'hex')) RETURNING *`,
    [reference, billingName, billingCompany || null, billingAddress || '', billingPostalCode || '', billingCity || '', billingEmail, billingVatNumber || null, notes || null]
  );
  res.status(201).json(result.rows[0]);
});

// GET /admin/invoice-groups/:id — detail met reserveringen
router.get('/admin/invoice-groups/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const [ig, reservations] = await Promise.all([
    query('SELECT * FROM invoice_groups WHERE id = $1', [id]),
    query(
      `SELECT r.id, r.reference, r.arrival_date, r.departure_date, r.nights, r.total_price,
              r.payment_method, r.payment_status, r.status,
              r.ferry_outbound_time, r.ferry_return_time,
              COALESCE(r.guest_first_name, c.first_name) as first_name,
              COALESCE(r.guest_last_name, c.last_name) as last_name,
              c.email, c.phone,
              (SELECT string_agg(v.license_plate, ', ' ORDER BY v.sort_order) FROM vehicles v WHERE v.reservation_id = r.id) as plates
       FROM reservations r
       JOIN customers c ON c.id = r.customer_id
       WHERE r.invoice_group_id = $1
       ORDER BY r.arrival_date ASC`,
      [id]
    ),
  ]);
  if (ig.rows.length === 0) return res.status(404).json({ error: 'Factuurgroep niet gevonden' });
  res.json({ ...ig.rows[0], reservations: reservations.rows });
});

// PUT /admin/invoice-groups/:id — bijwerken
router.put('/admin/invoice-groups/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { billingName, billingCompany, billingAddress, billingPostalCode, billingCity, billingEmail, billingVatNumber, notes, status } = req.body;
  const result = await query(
    `UPDATE invoice_groups
     SET billing_name=$1, billing_company=$2, billing_address=$3, billing_postal_code=$4,
         billing_city=$5, billing_email=$6, billing_vat_number=$7, notes=$8,
         status=COALESCE($9, status), updated_at=NOW()
     WHERE id=$10 RETURNING *`,
    [billingName, billingCompany || null, billingAddress, billingPostalCode, billingCity, billingEmail, billingVatNumber || null, notes || null, status || null, id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Factuurgroep niet gevonden' });
  res.json(result.rows[0]);
});

// DELETE /admin/invoice-groups/:id — verwijderen (unlinking reserveringen)
router.delete('/admin/invoice-groups/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  // Unlink reserveringen eerst
  await query(`UPDATE reservations SET invoice_group_id = NULL WHERE invoice_group_id = $1`, [id]);
  await query(`DELETE FROM invoice_groups WHERE id = $1`, [id]);
  res.json({ success: true });
});

// DELETE /admin/invoice-groups/:id/reservations/:resId — reservering uit groep verwijderen
router.delete('/admin/invoice-groups/:id/reservations/:resId', requireAuth, async (req: Request, res: Response) => {
  const { id, resId } = req.params;
  await query(
    `UPDATE reservations SET invoice_group_id = NULL, payment_method = 'on_site', payment_status = 'pending'
     WHERE id = $1 AND invoice_group_id = $2`,
    [resId, id]
  );
  res.json({ success: true });
});

// POST /admin/invoice-groups/:id/send — factuur versturen per e-mail
router.post('/admin/invoice-groups/:id/send', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;

  const [igResult, resResult] = await Promise.all([
    query('SELECT * FROM invoice_groups WHERE id = $1', [id]),
    query(
      `SELECT r.reference, r.arrival_date, r.departure_date, r.nights, r.total_price,
              COALESCE(r.guest_first_name, c.first_name) as first_name,
              COALESCE(r.guest_last_name, c.last_name) as last_name,
              (SELECT string_agg(v.license_plate, ', ' ORDER BY v.sort_order) FROM vehicles v WHERE v.reservation_id = r.id) as plates
       FROM reservations r
       JOIN customers c ON c.id = r.customer_id
       WHERE r.invoice_group_id = $1
       ORDER BY r.arrival_date ASC`,
      [id]
    ),
  ]);

  if (igResult.rows.length === 0) return res.status(404).json({ error: 'Factuurgroep niet gevonden' });
  if (resResult.rows.length === 0) return res.status(400).json({ error: 'Geen reserveringen in deze factuurgroep' });

  const ig = igResult.rows[0];
  const rows = resResult.rows;
  const total = rows.reduce((s: number, r: any) => s + parseFloat(r.total_price), 0);

  const fmt = (d: string) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtEur = (n: number) => `€ ${n.toFixed(2).replace('.', ',')}`;

  const rowsHtml = rows.map((r: any) => `
    <tr style="border-bottom: 0.5px solid #e8edf3;">
      <td style="padding: 10px 12px; font-size: 13px; color: #1a2e48;">${r.first_name} ${r.last_name}</td>
      <td style="padding: 10px 12px; font-size: 13px; color: #1a2e48;">${r.plates || '—'}</td>
      <td style="padding: 10px 12px; font-size: 13px; color: #1a2e48;">${fmt(r.arrival_date)} – ${fmt(r.departure_date)}</td>
      <td style="padding: 10px 12px; font-size: 13px; color: #1a2e48; text-align: right;">${r.nights + 1} dag${(r.nights + 1) !== 1 ? 'en' : ''}</td>
      <td style="padding: 10px 12px; font-size: 13px; color: #1a2e48; text-align: right; font-weight: 700;">${fmtEur(parseFloat(r.total_price))}</td>
    </tr>`).join('');

  const html = `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 680px; margin: 0 auto; background: #f4f6f9; padding: 32px 16px;">
    <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(10,34,64,0.08);">
      <div style="background: #0a2240; padding: 24px 32px; display: flex; align-items: center; gap: 16px;">
        <div style="width: 44px; height: 44px; background: #e8a020; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; color: #0a2240;">AB</div>
        <div>
          <div style="color: white; font-size: 18px; font-weight: 800; margin: 0;">Autostalling De Bazuin</div>
          <div style="color: rgba(255,255,255,0.6); font-size: 13px;">Zeilmakersstraat 2 · 8861 SE Harlingen</div>
        </div>
      </div>
      <div style="padding: 28px 32px;">
        <h2 style="margin: 0 0 4px; font-size: 22px; font-weight: 800; color: #0a2240;">Factuur ${ig.reference}</h2>
        <p style="margin: 0 0 24px; font-size: 13px; color: #7090b0;">Aangemaakt op ${fmt(ig.created_at)}</p>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 0;">
          <thead>
            <tr style="background: #f4f6f9;">
              <th style="padding: 9px 12px; font-size: 11px; font-weight: 700; color: #7090b0; text-transform: uppercase; letter-spacing: 0.5px; text-align: left;">Naam</th>
              <th style="padding: 9px 12px; font-size: 11px; font-weight: 700; color: #7090b0; text-transform: uppercase; letter-spacing: 0.5px; text-align: left;">Kenteken</th>
              <th style="padding: 9px 12px; font-size: 11px; font-weight: 700; color: #7090b0; text-transform: uppercase; letter-spacing: 0.5px; text-align: left;">Periode</th>
              <th style="padding: 9px 12px; font-size: 11px; font-weight: 700; color: #7090b0; text-transform: uppercase; letter-spacing: 0.5px; text-align: right;">Dagen</th>
              <th style="padding: 9px 12px; font-size: 11px; font-weight: 700; color: #7090b0; text-transform: uppercase; letter-spacing: 0.5px; text-align: right;">Bedrag</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot>
            <tr style="background: #0a2240;">
              <td colspan="4" style="padding: 12px 16px; font-size: 14px; font-weight: 700; color: white;">Totaal (incl. BTW)</td>
              <td style="padding: 12px 16px; font-size: 16px; font-weight: 800; color: #e8a020; text-align: right;">${fmtEur(total)}</td>
            </tr>
          </tfoot>
        </table>

        ${ig.billing_vat_number ? `<p style="font-size: 12px; color: #7090b0; margin: 16px 0 0;">BTW-nummer: ${ig.billing_vat_number}</p>` : ''}

        <div style="margin-top: 28px; padding: 16px 20px; background: #f4f6f9; border-radius: 8px; font-size: 13px; color: #1a2e48;">
          <strong>Betaalinstructies</strong><br>
          Maak het totaalbedrag over op rekening NL00 INGB 0000 0000 00 t.n.v. Autostalling De Bazuin, onder vermelding van referentie <strong>${ig.reference}</strong>.
        </div>

        ${ig.notes ? `<div style="margin-top: 16px; font-size: 13px; color: #7090b0;"><strong>Opmerking:</strong> ${ig.notes}</div>` : ''}
      </div>
    </div>
  </div>`;

  const { sendSimpleEmail } = await import('../services/email.service');
  await sendSimpleEmail(ig.billing_email, `Factuur ${ig.reference} — Autostalling De Bazuin`, html);

  // Markeer als verstuurd
  await query(`UPDATE invoice_groups SET status='sent', updated_at=NOW() WHERE id=$1`, [id]);

  res.json({ success: true, sentTo: ig.billing_email });
});

// ============================================================
// PUBLIC — INVOICE GROUP MODIFICATION (token-based, no auth)
// ============================================================

// GET /invoice-group-modify/:token — factuurgroep + reserveringen + voertuigen + services
router.get('/invoice-group-modify/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  const igResult = await query('SELECT * FROM invoice_groups WHERE modification_token = $1', [token]);
  if (igResult.rows.length === 0) return res.status(404).json({ error: 'Link niet gevonden of verlopen' });
  const ig = igResult.rows[0];

  const reservations = await query(
    `SELECT r.id, r.reference, r.arrival_date, r.departure_date, r.nights, r.total_price,
            r.payment_status, r.status, r.ferry_outbound_time, r.ferry_return_time,
            r.ferry_outbound_destination, r.ferry_return_destination,
            COALESCE(r.guest_first_name, c.first_name) as first_name,
            COALESCE(r.guest_last_name, c.last_name) as last_name,
            COALESCE(r.guest_phone, c.phone) as phone
     FROM reservations r
     JOIN customers c ON c.id = r.customer_id
     WHERE r.invoice_group_id = $1
     ORDER BY r.arrival_date ASC`,
    [ig.id]
  );

  const vehicleResults = await Promise.all(
    reservations.rows.map((r: any) =>
      query(
        `SELECT id, license_plate, ev_service_id, ev_kwh, ev_price, sort_order,
                rdw_make, rdw_model, rdw_color, rdw_fuel_type, rdw_year
         FROM vehicles WHERE reservation_id = $1 ORDER BY sort_order`,
        [r.id]
      )
    )
  );

  const services = await query(
    `SELECT id, name, kwh, price FROM services WHERE is_active = true AND kwh IS NOT NULL ORDER BY kwh`
  );

  const reservationsWithVehicles = reservations.rows.map((r: any, i: number) => ({
    ...r,
    vehicles: vehicleResults[i].rows,
  }));

  // Don't return the token itself in the response
  const { modification_token: _mt, ...igSafe } = ig;
  res.json({ ...igSafe, reservations: reservationsWithVehicles, evServices: services.rows });
});

// POST /invoice-group-modify/:token/reservation/:resId/plate — kenteken(s) bijwerken
router.post('/invoice-group-modify/:token/reservation/:resId/plate', async (req: Request, res: Response) => {
  const { token, resId } = req.params;
  const { vehicles } = req.body;
  if (!vehicles || !Array.isArray(vehicles) || vehicles.length === 0) {
    return res.status(400).json({ error: 'Geen voertuiggegevens ontvangen' });
  }

  const igResult = await query('SELECT id FROM invoice_groups WHERE modification_token = $1', [token]);
  if (igResult.rows.length === 0) return res.status(404).json({ error: 'Link niet gevonden' });

  const resResult = await query(
    'SELECT * FROM reservations WHERE id = $1 AND invoice_group_id = $2',
    [resId, igResult.rows[0].id]
  );
  if (resResult.rows.length === 0) return res.status(404).json({ error: 'Reservering niet gevonden' });
  const r = resResult.rows[0];

  if (['cancelled', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet meer worden gewijzigd' });
  }

  for (const v of vehicles) {
    if (!v.vehicleId || !v.newPlate) continue;
    const vCheck = await query(
      'SELECT id FROM vehicles WHERE id = $1 AND reservation_id = $2',
      [v.vehicleId, r.id]
    );
    if (vCheck.rows.length === 0) continue;
    const normalized = normalizePlate(v.newPlate);
    await query('UPDATE vehicles SET license_plate = $1 WHERE id = $2', [normalized, v.vehicleId]);
    lookupRdw(normalized).then((rdwInfo: any) => {
      if (rdwInfo) {
        query(
          `UPDATE vehicles SET rdw_make=$1, rdw_model=$2, rdw_color=$3, rdw_fuel_type=$4, rdw_year=$5, rdw_fetched_at=NOW() WHERE id=$6`,
          [rdwInfo.make, rdwInfo.model, rdwInfo.color, rdwInfo.fuelType, rdwInfo.year, v.vehicleId]
        );
      }
    }).catch(() => {});
  }

  res.json({ success: true });
});

// POST /invoice-group-modify/:token/reservation/:resId/ferry — boottijden bijwerken
router.post('/invoice-group-modify/:token/reservation/:resId/ferry', async (req: Request, res: Response) => {
  const { token, resId } = req.params;
  const { outboundTime, returnTime, outboundDestination, returnDestination } = req.body;

  if (outboundTime === undefined && returnTime === undefined) {
    return res.status(400).json({ error: 'Geef ten minste één boottijd op' });
  }

  const igResult = await query('SELECT id FROM invoice_groups WHERE modification_token = $1', [token]);
  if (igResult.rows.length === 0) return res.status(404).json({ error: 'Link niet gevonden' });

  const resResult = await query(
    'SELECT * FROM reservations WHERE id = $1 AND invoice_group_id = $2',
    [resId, igResult.rows[0].id]
  );
  if (resResult.rows.length === 0) return res.status(404).json({ error: 'Reservering niet gevonden' });
  const r = resResult.rows[0];

  if (['cancelled', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet meer worden gewijzigd' });
  }

  const updates: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (outboundTime !== undefined) {
    updates.push(`ferry_outbound_time = $${idx++}`);
    params.push(outboundTime || null);
    if (outboundDestination) {
      updates.push(`ferry_outbound_destination = $${idx++}`);
      params.push(outboundDestination);
    }
  }
  if (returnTime !== undefined) {
    updates.push(`ferry_return_time = $${idx++}`);
    params.push(returnTime || null);
    if (returnDestination) {
      updates.push(`ferry_return_destination = $${idx++}`);
      params.push(returnDestination);
    }
  }
  updates.push(`updated_at = NOW()`);
  params.push(r.id);

  await query(`UPDATE reservations SET ${updates.join(', ')} WHERE id = $${idx}`, params);
  res.json({ success: true });
});

// POST /invoice-group-modify/:token/reservation/:resId/ev — laaddienst bijwerken
router.post('/invoice-group-modify/:token/reservation/:resId/ev', async (req: Request, res: Response) => {
  const { token, resId } = req.params;
  const { vehicleId, evServiceId, evKwh } = req.body;

  if (!vehicleId) return res.status(400).json({ error: 'vehicleId is verplicht' });

  const igResult = await query('SELECT id FROM invoice_groups WHERE modification_token = $1', [token]);
  if (igResult.rows.length === 0) return res.status(404).json({ error: 'Link niet gevonden' });

  const resResult = await query(
    'SELECT * FROM reservations WHERE id = $1 AND invoice_group_id = $2',
    [resId, igResult.rows[0].id]
  );
  if (resResult.rows.length === 0) return res.status(404).json({ error: 'Reservering niet gevonden' });
  const r = resResult.rows[0];

  if (['cancelled', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet meer worden gewijzigd' });
  }

  const vCheck = await query(
    'SELECT id FROM vehicles WHERE id = $1 AND reservation_id = $2',
    [vehicleId, r.id]
  );
  if (vCheck.rows.length === 0) return res.status(400).json({ error: 'Voertuig niet gevonden' });

  if (evServiceId) {
    const svc = await query('SELECT price FROM services WHERE id = $1', [evServiceId]);
    if (svc.rows.length === 0) return res.status(400).json({ error: 'Service niet gevonden' });
    const price = parseFloat(svc.rows[0].price);
    await query(
      'UPDATE vehicles SET ev_service_id=$1, ev_kwh=$2, ev_price=$3 WHERE id=$4',
      [evServiceId, evKwh || null, price, vehicleId]
    );
  } else {
    await query(
      'UPDATE vehicles SET ev_service_id=NULL, ev_kwh=NULL, ev_price=NULL WHERE id=$1',
      [vehicleId]
    );
  }

  // Herbereken totaalprijs reservering
  await query(
    `UPDATE reservations SET
       services_total = (SELECT COALESCE(SUM(ev_price), 0) FROM vehicles WHERE reservation_id = $1 AND ev_price IS NOT NULL),
       total_price = base_price + season_surcharge_amount + (SELECT COALESCE(SUM(ev_price), 0) FROM vehicles WHERE reservation_id = $1 AND ev_price IS NOT NULL),
       updated_at = NOW()
     WHERE id = $1`,
    [r.id]
  );

  res.json({ success: true });
});

// POST /invoice-group-modify/:token/reservation/:resId/details — naam + telefoon bijwerken
router.post('/invoice-group-modify/:token/reservation/:resId/details', async (req: Request, res: Response) => {
  const { token, resId } = req.params;
  const { firstName, lastName, phone, vehicles } = req.body;

  const igResult = await query('SELECT id FROM invoice_groups WHERE modification_token = $1', [token]);
  if (igResult.rows.length === 0) return res.status(404).json({ error: 'Link niet gevonden' });

  const resResult = await query(
    'SELECT * FROM reservations WHERE id = $1 AND invoice_group_id = $2',
    [resId, igResult.rows[0].id]
  );
  if (resResult.rows.length === 0) return res.status(404).json({ error: 'Reservering niet gevonden' });
  const r = resResult.rows[0];

  if (['cancelled', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet meer worden gewijzigd' });
  }

  // Update naam + telefoon op reservering
  await query(
    `UPDATE reservations SET
       guest_first_name = $1,
       guest_last_name  = $2,
       guest_phone      = $3,
       updated_at       = NOW()
     WHERE id = $4`,
    [firstName || null, lastName || null, phone || null, r.id]
  );

  // Update kentekens indien meegegeven
  if (vehicles && Array.isArray(vehicles)) {
    for (const v of vehicles) {
      if (!v.vehicleId || !v.newPlate) continue;
      const vCheck = await query(
        'SELECT id FROM vehicles WHERE id = $1 AND reservation_id = $2',
        [v.vehicleId, r.id]
      );
      if (vCheck.rows.length === 0) continue;
      await query(
        'UPDATE vehicles SET license_plate = $1 WHERE id = $2',
        [v.newPlate.trim().toUpperCase(), v.vehicleId]
      );
    }
  }

  res.json({ success: true });
});

// ============================================================
router.get('/admin/settings', requireAuth, async (_req, res: Response) => {
  const result = await query('SELECT key, value, description FROM settings ORDER BY key');
  const map: Record<string, string> = {};
  for (const row of result.rows) map[row.key] = row.value;
  return res.json(map);
});

router.put('/admin/settings', requireAuth, async (req: Request, res: Response) => {
  const { key, value } = req.body;
  if (!key || value === undefined) return res.status(400).json({ error: 'key en value zijn verplicht' });
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, String(value)]
  );
  return res.json({ success: true });
});

// ============================================================
// PUBLIC — MODIFICATION PREVIEW (via cancellation token)
// ============================================================
router.get('/reservations/token/:token/modification-preview', async (req: Request, res: Response) => {
  const { newArrival, newDeparture } = req.query as Record<string, string>;
  if (!newArrival || !newDeparture) return res.status(400).json({ error: 'newArrival en newDeparture zijn verplicht' });

  const result = await query('SELECT * FROM reservations WHERE cancellation_token = $1', [req.params.token]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Reservering niet gevonden' });
  const r = result.rows[0];

  if (['cancelled', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet worden gewijzigd' });
  }

  const settingsResult = await query("SELECT key, value FROM settings WHERE key IN ('modification_fee','modification_min_days_before','during_stay_daily_rate','overbooking_fee')");
  const cfg: Record<string, string> = {};
  for (const s of settingsResult.rows) cfg[s.key] = s.value;
  const modFee = parseFloat(cfg['modification_fee'] || '0');
  const minDays = parseInt(cfg['modification_min_days_before'] || '0');
  const duringStayDailyRate = parseFloat(cfg['during_stay_daily_rate'] || '20');
  const overbookingFeePerNight = parseFloat(cfg['overbooking_fee'] || '20');

  const { differenceInDays } = await import('date-fns');
  const isoDate = (d: any) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const arrivalDate = new Date(isoDate(r.arrival_date) + 'T12:00:00');
  const currentDepartureDate = new Date(isoDate(r.departure_date) + 'T12:00:00');
  const duringStay = today >= arrivalDate && today < currentDepartureDate;

  if (duringStay) {
    const currentArrivalStr = isoDate(r.arrival_date);
    if (newArrival !== currentArrivalStr) return res.status(400).json({ error: 'Tijdens uw verblijf kunt u alleen de vertrekdatum wijzigen.' });
    if (newDeparture <= isoDate(r.departure_date)) return res.status(400).json({ error: 'Tijdens uw verblijf kunt u de verblijfsduur niet verkorten.' });

    const newDepartureDateObj = new Date(newDeparture + 'T12:00:00');
    const extraDays = differenceInDays(newDepartureDateObj, currentDepartureDate);
    const extraCharge = Math.round(extraDays * duringStayDailyRate * 100) / 100;
    const newPrice = parseFloat(r.total_price) + extraCharge;

    return res.json({
      reservationId: r.id, reference: r.reference,
      currentArrival: r.arrival_date, currentDeparture: r.departure_date, currentPrice: parseFloat(r.total_price),
      newArrival, newDeparture, newPrice,
      priceDifference: extraCharge, modificationFee: 0,
      netAmountDue: extraCharge, netRefundAmount: 0,
      cancellationRefundPct: 0, policyDescription: 'Geen restitutie tijdens verblijf',
      duringStay: true, extraDays, duringStayDailyRate,
      available: true, pendingReview: true,
    });
  }

  if (minDays > 0) {
    const daysLeft = differenceInDays(arrivalDate, today);
    if (daysLeft < minDays) return res.status(400).json({ error: `Wijzigen is niet meer mogelijk — minder dan ${minDays} dag(en) voor aankomst` });
  }

  const vehicleCountResult = await query('SELECT COUNT(*) as cnt FROM vehicles WHERE reservation_id = $1', [r.id]);
  const vehicleCount = parseInt(vehicleCountResult.rows[0].cnt);
  const lotId = r.parking_lot_id;

  // Per-nacht beschikbaarheid (rekening met overrides), huidige reservering uitgesloten
  const { minAvailable } = await checkNightlyAvailability(lotId, newArrival, newDeparture, r.id);
  const available = minAvailable;

  const currentPrice = parseFloat(r.total_price);
  const servicesTotal = parseFloat(r.services_total || '0');
  let newPriceInfo: any;
  try {
    newPriceInfo = await calculatePrice(new Date(newArrival), new Date(newDeparture), lotId, vehicleCount);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }

  // Include services (e.g. EV charging) from original booking — these don't change with dates
  const newPrice = Math.round((newPriceInfo.totalPrice + servicesTotal) * 100) / 100;
  const priceDiff = Math.round((newPrice - currentPrice) * 100) / 100;

  // Annuleringsbeleid toepassen op restitutie — altijd gebaseerd op originele aankomstdatum
  const policyAnchor = new Date(isoDate(r.policy_anchor_date || r.arrival_date) + 'T12:00:00');
  let cancellationRefundPct = 100;
  let policyDescription = 'Volledige restitutie';
  let netRefund = 0;
  if (priceDiff < 0) {
    const refundInfo = await calculateRefund(policyAnchor, Math.abs(priceDiff));
    cancellationRefundPct = refundInfo.refundPct;
    policyDescription = refundInfo.policyDescription;
    netRefund = Math.max(0, Math.round((refundInfo.refundAmount - modFee) * 100) / 100);
  }
  const netDue = priceDiff > 0 ? Math.round((priceDiff + modFee) * 100) / 100 : 0;

  const anchorStr = isoDate(r.policy_anchor_date || r.arrival_date);
  const currentArrivalStr = isoDate(r.arrival_date);
  const isAvailable = available >= vehicleCount;

  // Overboeking: bereken toeslag als er geen plek vrij is
  const newNights = differenceInDays(new Date(newDeparture + 'T12:00:00'), new Date(newArrival + 'T12:00:00'));
  const overbookingTotal = !isAvailable ? Math.round(newNights * overbookingFeePerNight * 100) / 100 : 0;

  return res.json({
    reservationId: r.id, reference: r.reference,
    currentArrival: r.arrival_date, currentDeparture: r.departure_date, currentPrice,
    newArrival, newDeparture, newPrice,
    newPriceBreakdown: newPriceInfo.breakdown,
    priceDifference: priceDiff, modificationFee: modFee,
    netAmountDue: netDue, netRefundAmount: netRefund,
    cancellationRefundPct, policyDescription,
    duringStay: false, available: isAvailable, availableSpots: available,
    policyAnchorDate: anchorStr !== currentArrivalStr ? anchorStr : null,
    // Overboeking-optie: klant kan toch wijzigen met toeslag
    overbookingOption: !isAvailable,
    overbookingFeePerNight,
    overbookingTotal,
    overbookingNetDue: Math.round((netDue + overbookingTotal) * 100) / 100,
  });
});

// ============================================================
// PUBLIC — CONFIRM MODIFICATION (via cancellation token)
// ============================================================
router.post('/reservations/token/:token/modify', async (req: Request, res: Response) => {
  const { newArrivalDate, newDepartureDate, overbooked } = req.body;
  if (!newArrivalDate || !newDepartureDate) return res.status(400).json({ error: 'Nieuwe datums zijn verplicht' });

  const result = await query('SELECT * FROM reservations WHERE cancellation_token = $1', [req.params.token]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const r = result.rows[0];

  if (['cancelled', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet worden gewijzigd' });
  }

  const settingsResult = await query("SELECT key, value FROM settings WHERE key IN ('modification_fee','modification_min_days_before','during_stay_daily_rate','overbooking_fee')");
  const cfg: Record<string, string> = {};
  for (const s of settingsResult.rows) cfg[s.key] = s.value;
  const modFee = parseFloat(cfg['modification_fee'] || '0');
  const minDays = parseInt(cfg['modification_min_days_before'] || '0');
  const duringStayDailyRate = parseFloat(cfg['during_stay_daily_rate'] || '20');
  const overbookingFeePerNight = parseFloat(cfg['overbooking_fee'] || '20');

  const { differenceInDays } = await import('date-fns');
  const isoDate = (d: any) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const arrivalDate = new Date(isoDate(r.arrival_date) + 'T12:00:00');
  const currentDepartureDate = new Date(isoDate(r.departure_date) + 'T12:00:00');
  const duringStay = today >= arrivalDate && today < currentDepartureDate;

  const vehiclesResult = await query('SELECT license_plate FROM vehicles WHERE reservation_id = $1', [r.id]);
  const plates = vehiclesResult.rows.map((v: any) => v.license_plate).join(', ');

  // ── Wijziging TIJDENS verblijf ────────────────────────────
  if (duringStay) {
    const currentArrivalStr = isoDate(r.arrival_date);
    if (newArrivalDate !== currentArrivalStr) return res.status(400).json({ error: 'Tijdens uw verblijf kunt u alleen de vertrekdatum wijzigen.' });
    if (newDepartureDate <= isoDate(r.departure_date)) return res.status(400).json({ error: 'Tijdens uw verblijf kunt u de verblijfsduur niet verkorten.' });

    const newDepartureDateObj = new Date(newDepartureDate + 'T12:00:00');
    const extraDays = differenceInDays(newDepartureDateObj, currentDepartureDate);
    const extraCharge = Math.round(extraDays * duringStayDailyRate * 100) / 100;
    const newPrice = parseFloat(r.total_price) + extraCharge;

    // Sla op als PENDING — admin moet accepteren
    await query(
      `INSERT INTO reservation_modifications
       (reservation_id, modified_by, old_arrival_date, old_departure_date, new_arrival_date, new_departure_date,
        old_total_price, new_total_price, price_difference, modification_fee, status, modification_type, during_stay, change_details)
       VALUES ($1,'customer',$2,$3,$4,$5,$6,$7,$8,0,'pending_review','dates',true,$9)`,
      [r.id, r.arrival_date, r.departure_date, newArrivalDate, newDepartureDate,
       parseFloat(r.total_price), newPrice, extraCharge,
       JSON.stringify({ plates, extraDays, duringStayDailyRate, extraCharge })]
    );

    return res.json({ success: true, pending: true, message: 'Uw wijzigingsverzoek is ontvangen en wordt zo spoedig mogelijk door ons verwerkt.' });
  }

  // ── Wijziging VOOR verblijf ───────────────────────────────
  if (minDays > 0) {
    const daysLeft = differenceInDays(arrivalDate, today);
    if (daysLeft < minDays) return res.status(400).json({ error: `Wijzigen is niet meer mogelijk` });
  }

  const vehicleCountResult = await query('SELECT COUNT(*) as cnt FROM vehicles WHERE reservation_id = $1', [r.id]);
  const vehicleCount = parseInt(vehicleCountResult.rows[0].cnt);
  const lotId = r.parking_lot_id;

  // Per-nacht beschikbaarheid incl. overrides, eigen reservering uitgesloten
  const { minAvailable } = await checkNightlyAvailability(lotId, newArrivalDate, newDepartureDate, r.id);
  const available = minAvailable;
  // Bij overboeking: check overrulen toegestaan (klant heeft bewust gekozen voor overboeking)
  if (available < vehicleCount && !overbooked) return res.status(409).json({ error: `Onvoldoende plaatsen beschikbaar voor de gekozen periode`, overbookingOption: true });

  let newPriceInfo: any;
  try {
    newPriceInfo = await calculatePrice(new Date(newArrivalDate), new Date(newDepartureDate), lotId, vehicleCount);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }

  const currentPrice = parseFloat(r.total_price);
  const servicesTotal = parseFloat(r.services_total || '0');
  // Preserve services (EV charging etc.) from original booking — these don't change with dates
  const newPrice = Math.round((newPriceInfo.totalPrice + servicesTotal) * 100) / 100;
  const priceDiff = Math.round((newPrice - currentPrice) * 100) / 100;

  let stripeRefundId: string | null = null;
  let netRefund = 0;
  let cancellationRefundPct = 100;

  // Annuleringsbeleid altijd op originele aankomstdatum baseren (voorkomt misbruik via datumwijziging)
  const policyAnchor = new Date(isoDate(r.policy_anchor_date || r.arrival_date) + 'T12:00:00');

  if (priceDiff < 0) {
    const refundInfo = await calculateRefund(policyAnchor, Math.abs(priceDiff));
    cancellationRefundPct = refundInfo.refundPct;
    netRefund = Math.max(0, Math.round((refundInfo.refundAmount - modFee) * 100) / 100);

    if (netRefund > 0 && r.stripe_payment_intent_id && r.payment_status === 'paid') {
      const alreadyRefunded = parseFloat(r.refund_amount || '0');
      const maxRefund = Math.max(0, currentPrice - alreadyRefunded);
      const safeRefund = Math.min(netRefund, maxRefund);
      if (safeRefund > 0) {
        try {
          const refundResult = await processRefund(r.stripe_payment_intent_id, safeRefund, 'Wijziging datums klant');
          stripeRefundId = refundResult.refundId;
          await query(`UPDATE reservations SET refund_amount = COALESCE(refund_amount,0) + $1 WHERE id = $2`, [safeRefund, r.id]);
        } catch (e: any) { console.error('Stripe refund failed during modification:', e.message); }
      }
    }
  }

  await query(
    `UPDATE reservations SET arrival_date=$1, departure_date=$2,
     total_price=$3, base_price=$4, season_surcharge_amount=$5, updated_at=NOW() WHERE id=$6`,
    [newArrivalDate, newDepartureDate, newPrice, newPriceInfo.basePrice || newPriceInfo.totalPrice, newPriceInfo.seasonSurchargeAmount || 0, r.id]
  );

  await query(
    `INSERT INTO reservation_modifications
     (reservation_id, modified_by, old_arrival_date, old_departure_date, new_arrival_date, new_departure_date,
      old_total_price, new_total_price, price_difference, modification_fee, stripe_refund_id,
      status, modification_type, cancellation_refund_pct)
     VALUES ($1,'customer',$2,$3,$4,$5,$6,$7,$8,$9,$10,'completed','dates',$11)`,
    [r.id, r.arrival_date, r.departure_date, newArrivalDate, newDepartureDate,
     currentPrice, newPrice, priceDiff, modFee, stripeRefundId, cancellationRefundPct]
  );

  sendModificationMail(r.id, {
    oldArrival: r.arrival_date, oldDeparture: r.departure_date,
    oldPrice: currentPrice, newPrice, netRefund,
    netDue: priceDiff > 0 ? Math.round((priceDiff + modFee) * 100) / 100 : 0, modFee,
  }).catch(console.error);

  return res.json({ success: true, netRefundAmount: netRefund, newPrice, pending: false });
});

// ============================================================
// CUSTOMER — MODIFY CONTACT
// ============================================================
router.post('/reservations/token/:token/modify-contact', async (req: Request, res: Response) => {
  const { email, phone } = req.body;
  if (!email && !phone) return res.status(400).json({ error: 'E-mailadres of telefoonnummer is verplicht' });

  const result = await query(
    `SELECT r.*, c.email as old_email, c.phone as old_phone
     FROM reservations r JOIN customers c ON c.id = r.customer_id
     WHERE r.cancellation_token = $1`,
    [req.params.token]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const r = result.rows[0];

  if (['cancelled', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet worden gewijzigd' });
  }

  const changeDetails = JSON.stringify({
    oldEmail: r.old_email,
    newEmail: email || r.old_email,
    oldPhone: r.old_phone,
    newPhone: phone || r.old_phone,
  });

  await query(
    `INSERT INTO reservation_modifications
     (reservation_id, modified_by, old_arrival_date, old_departure_date, new_arrival_date, new_departure_date,
      old_total_price, new_total_price, price_difference, modification_fee, status, modification_type, change_details)
     VALUES ($1,'customer',$2,$2,$2,$2,$3,$3,0,0,'pending_review','contact',$4)`,
    [r.id, r.arrival_date, parseFloat(r.total_price), changeDetails]
  );

  return res.json({ success: true, pending: true });
});

// ============================================================
// CUSTOMER — MODIFY PLATE
// ============================================================
router.post('/reservations/token/:token/modify-plate', async (req: Request, res: Response) => {
  const { vehicles } = req.body;
  if (!vehicles || !Array.isArray(vehicles) || vehicles.length === 0) {
    return res.status(400).json({ error: 'Geen voertuiggegevens ontvangen' });
  }

  const result = await query('SELECT * FROM reservations WHERE cancellation_token = $1', [req.params.token]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const r = result.rows[0];

  if (['cancelled', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet worden gewijzigd' });
  }

  const { differenceInDays } = await import('date-fns');
  const isoDate = (d: any) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const arrivalDate = new Date(isoDate(r.arrival_date) + 'T12:00:00');
  const currentDepartureDate = new Date(isoDate(r.departure_date) + 'T12:00:00');
  const duringStay = today >= arrivalDate && today < currentDepartureDate;

  // Block plate change during stay
  if (duringStay) {
    return res.status(400).json({ error: 'Kentekenwijziging is niet mogelijk tijdens uw verblijf' });
  }

  // Enforce minimum 1 day before arrival
  const daysUntilArrival = differenceInDays(arrivalDate, today);
  if (daysUntilArrival < 1) {
    return res.status(400).json({ error: 'Kentekenwijziging moet minimaal 1 dag voor aankomst worden gedaan' });
  }

  // Validate that all vehicleIds belong to this reservation
  const vehicleIds = vehicles.map((v: any) => v.vehicleId);
  const vResult = await query(
    `SELECT id FROM vehicles WHERE reservation_id = $1 AND id = ANY($2::uuid[])`,
    [r.id, vehicleIds]
  );
  if (vResult.rows.length !== vehicleIds.length) {
    return res.status(400).json({ error: 'Een of meer voertuigen behoren niet tot deze reservering' });
  }

  // Auto-apply: directly update license plates
  for (const v of vehicles) {
    await query(
      `UPDATE vehicles SET license_plate = $1 WHERE id = $2 AND reservation_id = $3`,
      [v.newPlate, v.vehicleId, r.id]
    );
  }

  const changeDetails = JSON.stringify({ vehicles });

  await query(
    `INSERT INTO reservation_modifications
     (reservation_id, modified_by, old_arrival_date, old_departure_date, new_arrival_date, new_departure_date,
      old_total_price, new_total_price, price_difference, modification_fee, status, modification_type, change_details)
     VALUES ($1,'customer',$2,$2,$2,$2,$3,$3,0,0,'completed','plate',$4)`,
    [r.id, r.arrival_date, parseFloat(r.total_price), changeDetails]
  );

  return res.json({ success: true });
});

// ============================================================
// CUSTOMER — MODIFY FERRY
// ============================================================
router.post('/reservations/token/:token/modify-ferry', async (req: Request, res: Response) => {
  const { newOutboundTime, newReturnTime, notes, destination, outboundDestination, returnDestination } = req.body;
  // Support both new separate destinations and old single destination (backward compat)
  const effectiveOutboundDest = outboundDestination || destination || null;
  const effectiveReturnDest = returnDestination || destination || null;
  if (!newOutboundTime && !newReturnTime) {
    return res.status(400).json({ error: 'Geef ten minste één gewenste boottijd op' });
  }

  const result = await query('SELECT * FROM reservations WHERE cancellation_token = $1', [req.params.token]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const r = result.rows[0];

  if (['cancelled', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet worden gewijzigd' });
  }

  const isoDate = (d: any) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const arrivalDate = new Date(isoDate(r.arrival_date) + 'T00:00:00');
  // Auto-apply when submitted strictly before the arrival day; pending_review on/after arrival
  const autoApply = today < arrivalDate;

  // Look up schedule details (ship type + arrival time) for the requested times
  const calcArrival = (depTime: string, durationMin: number): string => {
    const [h, m] = depTime.slice(0, 5).split(':').map(Number);
    const total = h * 60 + m + durationMin;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  let outboundScheduleInfo: { isFast: boolean; arrivalTime: string | null } | null = null;
  let returnScheduleInfo: { isFast: boolean; arrivalTime: string | null } | null = null;

  if (newOutboundTime) {
    const outRes = await query(
      `SELECT f.is_fast, f.duration_min, fs.arrival_harlingen
       FROM ferry_schedules fs JOIN ferries f ON f.id = fs.ferry_id
       WHERE fs.schedule_date = $1 AND fs.direction = 'outbound'
         AND fs.departure_time::text LIKE $2 AND f.is_active = true LIMIT 1`,
      [isoDate(r.arrival_date), newOutboundTime.slice(0, 5) + '%']
    );
    if (outRes.rows.length > 0) {
      const row = outRes.rows[0];
      const arr = row.arrival_harlingen
        ? String(row.arrival_harlingen).slice(0, 5)
        : (row.duration_min ? calcArrival(newOutboundTime, row.duration_min) : null);
      outboundScheduleInfo = { isFast: row.is_fast, arrivalTime: arr };
    }
  }

  if (newReturnTime) {
    const retRes = await query(
      `SELECT f.is_fast, f.duration_min, fs.arrival_harlingen
       FROM ferry_schedules fs JOIN ferries f ON f.id = fs.ferry_id
       WHERE fs.schedule_date = $1 AND fs.direction = 'return'
         AND fs.departure_time::text LIKE $2 AND f.is_active = true LIMIT 1`,
      [isoDate(r.departure_date), newReturnTime.slice(0, 5) + '%']
    );
    if (retRes.rows.length > 0) {
      const row = retRes.rows[0];
      const arr = row.arrival_harlingen
        ? String(row.arrival_harlingen).slice(0, 5)
        : (row.duration_min ? calcArrival(newReturnTime, row.duration_min) : null);
      returnScheduleInfo = { isFast: row.is_fast, arrivalTime: arr };
    }
  }

  const changeDetails = JSON.stringify({
    currentOutboundDestination: r.ferry_outbound_destination || null,
    currentOutboundTime: r.ferry_outbound_time || null,
    newOutboundTime: newOutboundTime || null,
    newOutboundIsFast: outboundScheduleInfo?.isFast ?? null,
    newOutboundArrivalTime: outboundScheduleInfo?.arrivalTime ?? null,
    requestedOutboundDestination: effectiveOutboundDest,
    currentReturnDestination: r.ferry_return_destination || null,
    currentReturnTime: r.ferry_return_time || null,
    newReturnTime: newReturnTime || null,
    newReturnIsFast: returnScheduleInfo?.isFast ?? null,
    newReturnArrivalHarlingen: returnScheduleInfo?.arrivalTime ?? null,
    requestedReturnDestination: effectiveReturnDest,
    notes: notes || null,
  });

  if (autoApply) {
    // Directly update the reservation ferry times
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (newOutboundTime) {
      updates.push(`ferry_outbound_time = $${idx++}`);
      params.push(newOutboundTime);
      if (effectiveOutboundDest) { updates.push(`ferry_outbound_destination = $${idx++}`); params.push(effectiveOutboundDest); }
    }
    if (newReturnTime) {
      updates.push(`ferry_return_time = $${idx++}`);
      params.push(newReturnTime);
      if (effectiveReturnDest) { updates.push(`ferry_return_destination = $${idx++}`); params.push(effectiveReturnDest); }
    }
    updates.push(`updated_at = NOW()`);
    params.push(r.id);
    await query(`UPDATE reservations SET ${updates.join(', ')} WHERE id = $${idx}`, params);

    await query(
      `INSERT INTO reservation_modifications
       (reservation_id, modified_by, old_arrival_date, old_departure_date, new_arrival_date, new_departure_date,
        old_total_price, new_total_price, price_difference, modification_fee, status, modification_type, change_details)
       VALUES ($1,'customer',$2,$2,$2,$2,$3,$3,0,0,'completed','ferry',$4)`,
      [r.id, r.arrival_date, parseFloat(r.total_price), changeDetails]
    );

    return res.json({ success: true, autoApplied: true });
  } else {
    // On arrival day or during stay → pending review by admin
    await query(
      `INSERT INTO reservation_modifications
       (reservation_id, modified_by, old_arrival_date, old_departure_date, new_arrival_date, new_departure_date,
        old_total_price, new_total_price, price_difference, modification_fee, status, modification_type, change_details)
       VALUES ($1,'customer',$2,$2,$2,$2,$3,$3,0,0,'pending_review','ferry',$4)`,
      [r.id, r.arrival_date, parseFloat(r.total_price), changeDetails]
    );

    return res.json({ success: true, autoApplied: false });
  }
});

// ============================================================
// CUSTOMER — MODIFY PHONE (direct save, no approval)
// ============================================================
router.post('/reservations/token/:token/modify-phone', async (req: Request, res: Response) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Telefoonnummer is verplicht' });

  const result = await query(
    `SELECT r.*, c.id as customer_id FROM reservations r JOIN customers c ON c.id = r.customer_id
     WHERE r.cancellation_token = $1`,
    [req.params.token]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const r = result.rows[0];

  if (['cancelled', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet worden gewijzigd' });
  }

  await query('UPDATE customers SET phone = $1 WHERE id = $2', [phone, r.customer_id]);

  return res.json({ success: true });
});

// ============================================================
// CUSTOMER — REQUEST EMAIL CHANGE (sends verification email)
// ============================================================
router.post('/reservations/token/:token/request-email-change', async (req: Request, res: Response) => {
  const { newEmail } = req.body;
  if (!newEmail) return res.status(400).json({ error: 'Nieuw e-mailadres is verplicht' });

  const result = await query(
    `SELECT r.*, c.email as current_email, c.id as customer_id, c.first_name
     FROM reservations r JOIN customers c ON c.id = r.customer_id
     WHERE r.cancellation_token = $1`,
    [req.params.token]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const r = result.rows[0];

  if (['cancelled', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet worden gewijzigd' });
  }

  const { randomBytes } = await import('crypto');
  const verifyToken = randomBytes(32).toString('hex');

  const changeDetails = JSON.stringify({
    oldEmail: r.current_email,
    newEmail,
    verifyToken,
    customerId: r.customer_id,
  });

  // Remove any earlier pending email verifications for this reservation
  await query(
    `DELETE FROM reservation_modifications WHERE reservation_id = $1 AND status = 'pending_email_verify'`,
    [r.id]
  );

  await query(
    `INSERT INTO reservation_modifications
     (reservation_id, modified_by, old_arrival_date, old_departure_date, new_arrival_date, new_departure_date,
      old_total_price, new_total_price, price_difference, modification_fee, status, modification_type, change_details)
     VALUES ($1,'customer',$2,$2,$2,$2,$3,$3,0,0,'pending_email_verify','email',$4)`,
    [r.id, r.arrival_date, parseFloat(r.total_price), changeDetails]
  );

  const bookingUrl = process.env.BOOKING_URL || 'https://booking.parkeren-harlingen.nl';
  const verifyUrl = `${bookingUrl}/boeken/verify-email?t=${verifyToken}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0a2240">
      <div style="background:#0a2240;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <span style="color:#e8a020;font-weight:800;font-size:20px">Autostalling De Bazuin</span>
      </div>
      <div style="background:#f4f6f9;padding:28px 24px;border-radius:0 0 8px 8px">
        <h2 style="margin:0 0 16px">E-mailadres bevestigen</h2>
        <p style="color:#556070;line-height:1.6">Beste ${r.first_name},</p>
        <p style="color:#556070;line-height:1.6">
          U heeft gevraagd om uw e-mailadres te wijzigen naar <strong>${newEmail}</strong>.<br>
          Klik op de onderstaande knop om deze wijziging te bevestigen.
        </p>
        <div style="text-align:center;margin:28px 0">
          <a href="${verifyUrl}"
             style="background:#0a7c6e;color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block">
            E-mailadres bevestigen →
          </a>
        </div>
        <p style="color:#7090b0;font-size:12px;line-height:1.5">
          Als u dit niet heeft aangevraagd, kunt u deze e-mail negeren.<br>
          De link is 24 uur geldig.
        </p>
      </div>
    </div>`;

  try {
    await sendSimpleEmail(newEmail, 'Bevestig uw nieuwe e-mailadres — Autostalling De Bazuin', html);
  } catch (err: any) {
    console.error('Email verification send error:', err.message);
    return res.status(500).json({ error: 'Verificatiemail kon niet worden verstuurd. Probeer het opnieuw.' });
  }

  return res.json({ success: true });
});

// ============================================================
// CUSTOMER — VERIFY EMAIL CHANGE
// ============================================================
router.get('/verify-email', async (req: Request, res: Response) => {
  const { t } = req.query as Record<string, string>;
  if (!t) return res.status(400).json({ error: 'Verificatietoken ontbreekt' });

  const result = await query(
    `SELECT * FROM reservation_modifications
     WHERE status = 'pending_email_verify' AND modification_type = 'email'
     AND change_details::jsonb->>'verifyToken' = $1`,
    [t]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Verificatielink is ongeldig of verlopen' });
  }

  const mod = result.rows[0];
  const details = JSON.parse(mod.change_details);

  await query('UPDATE customers SET email = $1 WHERE id = $2', [details.newEmail, details.customerId]);
  await query(`UPDATE reservation_modifications SET status = 'completed' WHERE id = $1`, [mod.id]);

  return res.json({ success: true, newEmail: details.newEmail });
});

// ============================================================
// CUSTOMER — ALL RESERVATIONS FOR SAME EMAIL
// ============================================================
router.get('/reservations/token/:token/all-for-email', async (req: Request, res: Response) => {
  const result = await query(
    `SELECT r.id, r.reference, r.arrival_date, r.departure_date, r.status,
            r.total_price, r.cancellation_token, r.refund_amount, r.cancelled_at
     FROM reservations r
     JOIN customers c ON c.id = r.customer_id
     WHERE c.id = (
       SELECT r2.customer_id FROM reservations r2 WHERE r2.cancellation_token = $1
     )
     ORDER BY r.arrival_date DESC`,
    [req.params.token]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });

  return res.json({ reservations: result.rows });
});

// ============================================================
// ADMIN — MODIFICATION PREVIEW
// ============================================================
router.get('/admin/reservations/:id/modification-preview', requireAuth, async (req: Request, res: Response) => {
  const { newArrival, newDeparture, overrideAvailability } = req.query as Record<string, string>;
  if (!newArrival || !newDeparture) return res.status(400).json({ error: 'newArrival en newDeparture zijn verplicht' });

  const result = await query('SELECT * FROM reservations WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const r = result.rows[0];

  const vehicleCountResult = await query('SELECT COUNT(*) as cnt FROM vehicles WHERE reservation_id = $1', [r.id]);
  const vehicleCount = parseInt(vehicleCountResult.rows[0].cnt);
  const lotId = r.parking_lot_id;
  const settingsResult = await query("SELECT key, value FROM settings WHERE key = 'modification_fee'");
  const modFee = parseFloat(settingsResult.rows[0]?.value || '0');

  let available = 999;
  if (!overrideAvailability) {
    const { minAvailable } = await checkNightlyAvailability(lotId, newArrival, newDeparture, r.id);
    available = minAvailable;
  }

  // Strip on_site_surcharge uit currentPrice zodat we alleen de datumprijs vergelijken
  const onSiteSurcharge = parseFloat(r.on_site_surcharge || '0');
  const servicesTotal = parseFloat(r.services_total || '0');
  const currentBasePrice = Math.round((parseFloat(r.total_price) - onSiteSurcharge) * 100) / 100;
  let newPriceInfo: any;
  try {
    newPriceInfo = await calculatePrice(new Date(newArrival), new Date(newDeparture), lotId, vehicleCount);
  } catch (e: any) { return res.status(400).json({ error: e.message }); }

  // Include services (e.g. EV charging) from original booking — these don't change with dates
  const newBasePrice = Math.round((newPriceInfo.totalPrice + servicesTotal) * 100) / 100;
  // Totaalprijs na wijziging inclusief bestaande on_site_surcharge
  const newTotalWithSurcharge = Math.round((newBasePrice + onSiteSurcharge) * 100) / 100;
  const priceDiff = Math.round((newBasePrice - currentBasePrice) * 100) / 100;

  return res.json({
    currentArrival: r.arrival_date, currentDeparture: r.departure_date,
    currentPrice: parseFloat(r.total_price),
    newPrice: newBasePrice,
    newTotalWithSurcharge,
    onSiteSurcharge,
    newPriceBreakdown: newPriceInfo.breakdown,
    priceDifference: priceDiff, modificationFee: modFee,
    netAmountDue: priceDiff > 0 ? Math.round((priceDiff + modFee) * 100) / 100 : 0,
    netRefundAmount: priceDiff < 0 ? Math.max(0, Math.round((Math.abs(priceDiff) - modFee) * 100) / 100) : 0,
    available: available >= vehicleCount, availableSpots: available,
  });
});

// ============================================================
// ADMIN — CONFIRM MODIFICATION
// ============================================================
router.post('/admin/reservations/:id/modify', requireAuth, async (req: Request, res: Response) => {
  const { newArrivalDate, newDepartureDate, overrideAvailability, overrideTotalPrice, adminNotes } = req.body;
  if (!newArrivalDate || !newDepartureDate) return res.status(400).json({ error: 'Nieuwe datums zijn verplicht' });

  const result = await query('SELECT * FROM reservations WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const r = result.rows[0];

  if (['cancelled'].includes(r.status)) return res.status(400).json({ error: 'Geannuleerde reservering kan niet worden gewijzigd' });

  const vehicleCountResult = await query('SELECT COUNT(*) as cnt FROM vehicles WHERE reservation_id = $1', [r.id]);
  const vehicleCount = parseInt(vehicleCountResult.rows[0].cnt);
  const lotId = r.parking_lot_id;
  const settingsResult = await query("SELECT key, value FROM settings WHERE key = 'modification_fee'");
  const modFee = parseFloat(settingsResult.rows[0]?.value || '0');

  if (!overrideAvailability) {
    const { minAvailable } = await checkNightlyAvailability(lotId, newArrivalDate, newDepartureDate, r.id);
    if (minAvailable < vehicleCount) return res.status(409).json({ error: `Onvoldoende plaatsen beschikbaar` });
  }

  // Strip on_site_surcharge voor zuivere datumprijs-vergelijking; voeg hem daarna terug toe
  const onSiteSurcharge = parseFloat(r.on_site_surcharge || '0');
  const servicesTotal = parseFloat(r.services_total || '0');
  const currentBasePrice = Math.round((parseFloat(r.total_price) - onSiteSurcharge) * 100) / 100;
  let newBasePrice: number;
  let newPriceInfo: any;

  if (overrideTotalPrice !== undefined && overrideTotalPrice !== null && overrideTotalPrice !== '') {
    // Bij een override: beschouw het ingevoerde bedrag als het totaal (incl. surcharge)
    newBasePrice = Math.round((parseFloat(overrideTotalPrice) - onSiteSurcharge) * 100) / 100;
    newPriceInfo = { totalPrice: newBasePrice, seasonSurchargeAmount: 0, basePrice: newBasePrice, breakdown: 'Admin override' };
  } else {
    try {
      newPriceInfo = await calculatePrice(new Date(newArrivalDate), new Date(newDepartureDate), lotId, vehicleCount);
      // Include services (e.g. EV charging) from original booking — these don't change with dates
      newBasePrice = Math.round((newPriceInfo.totalPrice + servicesTotal) * 100) / 100;
    } catch (e: any) { return res.status(400).json({ error: e.message }); }
  }

  // Nieuw totaal = base datumprijs + bestaande on_site_surcharge (blijft behouden)
  const newPrice = Math.round((newBasePrice + onSiteSurcharge) * 100) / 100;
  const priceDiff = Math.round((newBasePrice - currentBasePrice) * 100) / 100;
  let stripeRefundId: string | null = null;
  let netRefund = 0;

  if (priceDiff < 0) {
    netRefund = Math.max(0, Math.round((Math.abs(priceDiff) - modFee) * 100) / 100);
    if (netRefund > 0 && r.stripe_payment_intent_id && r.payment_status === 'paid') {
      const alreadyRefunded = parseFloat(r.refund_amount || '0');
      const maxRefund = Math.max(0, parseFloat(r.total_price) - alreadyRefunded);
      const safeRefund = Math.min(netRefund, maxRefund);
      if (safeRefund > 0) {
        try {
          const refundResult = await processRefund(r.stripe_payment_intent_id, safeRefund, adminNotes || 'Admin wijziging datums');
          stripeRefundId = refundResult.refundId;
          await query(`UPDATE reservations SET refund_amount = COALESCE(refund_amount,0) + $1 WHERE id = $2`, [safeRefund, r.id]);
        } catch (e: any) { console.error('Stripe refund failed during admin modification:', e.message); }
      }
    }
  }

  // Bepaal of er bijbetaling nodig is (extra charge, geen override, geen terugbetaling)
  const hasPendingPayment = priceDiff > 0 && !overrideTotalPrice;
  const pendingPaymentStatus = hasPendingPayment ? 'pending_payment' : 'completed';

  await query(
    `UPDATE reservations SET arrival_date=$1, departure_date=$2,
     total_price=$3, base_price=$4, season_surcharge_amount=$5,
     updated_at=NOW()
     WHERE id=$6`,
    [newArrivalDate, newDepartureDate, newPrice, newPriceInfo.basePrice || newPriceInfo.totalPrice,
     newPriceInfo.seasonSurchargeAmount || 0, r.id]
  );

  const modInsert = await query(
    `INSERT INTO reservation_modifications
     (reservation_id, modified_by, admin_user_id, old_arrival_date, old_departure_date,
      new_arrival_date, new_departure_date, old_total_price, new_total_price,
      price_difference, modification_fee, stripe_refund_id, admin_override_price, admin_notes,
      status, modification_type)
     VALUES ($1,'admin',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'dates')
     RETURNING id`,
    [r.id, req.admin!.adminId, r.arrival_date, r.departure_date, newArrivalDate, newDepartureDate,
     r.total_price, newPrice, priceDiff, modFee, stripeRefundId,
     overrideTotalPrice ? newPrice : null, adminNotes || null,
     pendingPaymentStatus]
  );
  const modificationId = modInsert.rows[0]?.id;

  await query(
    `INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id, new_value)
     VALUES ($1,'modify','reservation',$2,$3)`,
    [req.admin!.adminId, r.id, JSON.stringify({ newArrivalDate, newDepartureDate, newPrice, adminNotes })]
  );

  sendModificationMail(r.id, {
    oldArrival: r.arrival_date, oldDeparture: r.departure_date,
    oldPrice: parseFloat(r.total_price), newPrice, netRefund,
    netDue: priceDiff > 0 ? Math.round((priceDiff + modFee) * 100) / 100 : 0,
    modFee,
  }).catch(console.error);

  return res.json({
    success: true,
    netRefundAmount: netRefund,
    newPrice,
    pendingPaymentAmount: hasPendingPayment ? Math.round((priceDiff + modFee) * 100) / 100 : 0,
    pendingModificationId: hasPendingPayment ? modificationId : null,
  });
});

// ============================================================
// ADMIN — SEND PAYMENT LINK FOR MODIFICATION
// ============================================================
router.post('/admin/modifications/:id/send-payment-link', requireAuth, async (req: Request, res: Response) => {
  const modResult = await query('SELECT * FROM reservation_modifications WHERE id = $1', [req.params.id]);
  if (modResult.rows.length === 0) return res.status(404).json({ error: 'Wijziging niet gevonden' });
  const mod = modResult.rows[0];

  if (mod.status !== 'pending_payment') return res.status(400).json({ error: 'Geen openstaande bijbetaling voor deze wijziging' });

  // Haal reservering + klantgegevens op
  const resResult = await query(
    `SELECT r.*, c.email, c.first_name, c.last_name
     FROM reservations r JOIN customers c ON c.id = r.customer_id
     WHERE r.id = $1`,
    [mod.reservation_id]
  );
  if (resResult.rows.length === 0) return res.status(404).json({ error: 'Reservering niet gevonden' });
  const r = resResult.rows[0];

  const extraAmount = Math.round((parseFloat(mod.price_difference) + parseFloat(mod.modification_fee || '0')) * 100) / 100;
  const description = `Bijbetaling wijziging ${r.reference} — autostalling De Bazuin`;

  const { url } = await createCheckoutSessionForExtraPayment(
    r.id, mod.id, extraAmount, r.email, description
  );

  // Stuur e-mail aan klant met betaallink
  const fmt = (d: string) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  await sendSimpleEmail(
    r.email,
    `Bijbetaling vereist voor uw reservering ${r.reference}`,
    `<p>Beste ${r.first_name},</p>
    <p>Uw reserveringsperiode bij Autostalling De Bazuin is gewijzigd:</p>
    <ul>
      <li>Nieuwe aankomst: <strong>${fmt(mod.new_arrival_date)}</strong></li>
      <li>Nieuw vertrek: <strong>${fmt(mod.new_departure_date)}</strong></li>
      <li>Nieuwe totaalprijs: <strong>€ ${Number(mod.new_total_price).toFixed(2).replace('.', ',')}</strong></li>
    </ul>
    <p>Als gevolg van deze wijziging is er een bijbetaling vereist van <strong>€ ${extraAmount.toFixed(2).replace('.', ',')}</strong>.</p>
    <p>Betaal eenvoudig via de onderstaande link:</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${url}" style="background:#0a2240;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">
        Bijbetaling voldoen →
      </a>
    </p>
    <p style="color:#888;font-size:13px;">Of kopieer deze link: <a href="${url}">${url}</a></p>
    <p>Heeft u vragen? Neem gerust contact met ons op.</p>
    <p>Met vriendelijke groet,<br>Autostalling De Bazuin</p>`
  );

  return res.json({ success: true, url });
});

// ============================================================
// ADMIN — MODIFICATION HISTORY
// ============================================================
router.get('/admin/reservations/:id/modifications', requireAuth, async (req: Request, res: Response) => {
  const result = await query(
    `SELECT m.*, a.email as admin_email FROM reservation_modifications m
     LEFT JOIN admin_users a ON a.id = m.admin_user_id
     WHERE m.reservation_id = $1 ORDER BY m.created_at DESC`,
    [req.params.id]
  );
  return res.json(result.rows);
});

// ============================================================
// ADMIN — PENDING MODIFICATIONS (klantwijzigingen ter beoordeling)
// ============================================================
router.get('/admin/modifications/pending', requireAuth, async (_req, res) => {
  const result = await query(
    `SELECT rm.*, r.reference, r.arrival_date, r.departure_date, r.status as reservation_status,
            c.first_name, c.last_name, c.email,
            (SELECT STRING_AGG(v.license_plate, ', ' ORDER BY v.sort_order) FROM vehicles v WHERE v.reservation_id = r.id) as plates
     FROM reservation_modifications rm
     JOIN reservations r ON r.id = rm.reservation_id
     JOIN customers c ON c.id = r.customer_id
     WHERE rm.status = 'pending_review'
     ORDER BY rm.created_at ASC`
  );
  return res.json(result.rows);
});

router.get('/admin/modifications/pending/count', requireAuth, async (_req, res) => {
  const result = await query(`SELECT COUNT(*) as cnt FROM reservation_modifications WHERE status = 'pending_review'`);
  return res.json({ count: parseInt(result.rows[0].cnt) });
});

router.post('/admin/modifications/:id/accept', requireAuth, async (req: Request, res: Response) => {
  const { notes, sendEmail } = req.body;
  const modResult = await query('SELECT * FROM reservation_modifications WHERE id = $1', [req.params.id]);
  if (modResult.rows.length === 0) return res.status(404).json({ error: 'Wijziging niet gevonden' });
  const mod = modResult.rows[0];
  if (mod.status !== 'pending_review') return res.status(400).json({ error: 'Wijziging is al verwerkt' });

  const rResult = await query(
    `SELECT r.*, c.first_name, c.last_name, c.email FROM reservations r
     JOIN customers c ON c.id = r.customer_id WHERE r.id = $1`,
    [mod.reservation_id]
  );
  const r = rResult.rows[0];
  const modType = mod.modification_type || 'dates';
  const details = mod.change_details
    ? (typeof mod.change_details === 'string' ? JSON.parse(mod.change_details) : mod.change_details)
    : {};

  if (modType === 'contact') {
    // Update customer contact info
    await query(
      `UPDATE customers SET email=$1, phone=$2 WHERE id=(SELECT customer_id FROM reservations WHERE id=$3)`,
      [details.newEmail || details.oldEmail, details.newPhone || details.oldPhone, mod.reservation_id]
    );
  } else if (modType === 'plate') {
    // Update each vehicle's license plate
    if (details.vehicles && Array.isArray(details.vehicles)) {
      for (const v of details.vehicles) {
        await query(
          `UPDATE vehicles SET license_plate=$1 WHERE id=$2 AND reservation_id=$3`,
          [v.newPlate, v.vehicleId, mod.reservation_id]
        );
      }
    }
  } else if (modType === 'ferry') {
    // Update ferry times on reservation
    await query(
      `UPDATE reservations SET ferry_outbound_time=$1, ferry_return_time=$2, updated_at=NOW() WHERE id=$3`,
      [details.newOutboundTime || details.currentOutboundTime, details.newReturnTime || details.currentReturnTime, mod.reservation_id]
    );
  } else if (modType === 'checkedin_departure') {
    // Vervroegd vertrek: only update departure_date, no price change
    const isoDateHelper = (d: any) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
    await query(
      `UPDATE reservations SET departure_date=$1, updated_at=NOW() WHERE id=$2`,
      [isoDateHelper(mod.new_departure_date), mod.reservation_id]
    );
  } else {
    // 'dates' modification: only update reservation if NOT already applied via during-stay payment
    if (mod.during_stay) {
      // Already applied by modify-during-stay-complete — skip date update, just acknowledge
    } else {
      await query(
        `UPDATE reservations SET arrival_date=$1, departure_date=$2, total_price=$3, updated_at=NOW() WHERE id=$4`,
        [mod.new_arrival_date, mod.new_departure_date, mod.new_total_price, mod.reservation_id]
      );
    }
  }

  // Wijziging markeren als geaccepteerd
  await query(
    `UPDATE reservation_modifications SET status='accepted', accepted_by=$1, accepted_at=NOW(), acceptance_notes=$2 WHERE id=$3`,
    [req.admin!.adminId, notes || null, req.params.id]
  );

  if (sendEmail) {
    const fmtD = (d: any) => new Date(String(d).slice(0,10) + 'T12:00:00').toLocaleDateString('nl-NL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const emailVars: Record<string, string> = {
      voornaam: r.first_name,
      reference: r.reference,
      admin_notitie: notes || '',
    };
    if (modType === 'dates') {
      emailVars.nieuwe_aankomst = fmtD(mod.new_arrival_date);
      emailVars.nieuw_vertrek = fmtD(mod.new_departure_date);
      emailVars.nieuw_bedrag = `€ ${parseFloat(mod.new_total_price).toFixed(2).replace('.', ',')}`;
    } else if (modType === 'contact') {
      emailVars.nieuwe_aankomst = fmtD(r.arrival_date);
      emailVars.nieuw_vertrek = fmtD(r.departure_date);
      emailVars.nieuw_bedrag = `€ ${parseFloat(r.total_price).toFixed(2).replace('.', ',')}`;
    } else if (modType === 'plate') {
      emailVars.nieuwe_aankomst = fmtD(r.arrival_date);
      emailVars.nieuw_vertrek = fmtD(r.departure_date);
      emailVars.nieuw_bedrag = `€ ${parseFloat(r.total_price).toFixed(2).replace('.', ',')}`;
    } else if (modType === 'ferry') {
      emailVars.nieuwe_aankomst = fmtD(r.arrival_date);
      emailVars.nieuw_vertrek = fmtD(r.departure_date);
      emailVars.nieuw_bedrag = `€ ${parseFloat(r.total_price).toFixed(2).replace('.', ',')}`;
    } else if (modType === 'checkedin_departure') {
      emailVars.nieuwe_aankomst = fmtD(r.arrival_date);
      emailVars.nieuw_vertrek = fmtD(mod.new_departure_date);
      emailVars.nieuw_bedrag = `€ ${parseFloat(r.total_price).toFixed(2).replace('.', ',')}`;
    }
    sendTemplatedEmail('modification_accepted', r.email, emailVars).catch(console.error);
  }

  return res.json({ success: true });
});

router.post('/admin/modifications/:id/reject', requireAuth, async (req: Request, res: Response) => {
  const { notes, sendEmail } = req.body;
  const modResult = await query('SELECT * FROM reservation_modifications WHERE id = $1', [req.params.id]);
  if (modResult.rows.length === 0) return res.status(404).json({ error: 'Wijziging niet gevonden' });
  const mod = modResult.rows[0];
  if (mod.status !== 'pending_review') return res.status(400).json({ error: 'Wijziging is al verwerkt' });

  await query(
    `UPDATE reservation_modifications SET status='rejected', accepted_by=$1, accepted_at=NOW(), acceptance_notes=$2 WHERE id=$3`,
    [req.admin!.adminId, notes || null, req.params.id]
  );

  if (sendEmail) {
    const rResult = await query(
      `SELECT r.*, c.first_name, c.last_name, c.email FROM reservations r
       JOIN customers c ON c.id = r.customer_id WHERE r.id = $1`,
      [mod.reservation_id]
    );
    const r = rResult.rows[0];
    sendTemplatedEmail('modification_rejected', r.email, {
      voornaam: r.first_name,
      reference: r.reference,
      admin_notitie: notes || 'Neem contact met ons op voor meer informatie.',
    }).catch(console.error);
  }

  return res.json({ success: true });
});

// ============================================================
// CUSTOMER — DURING-STAY: CREATE STRIPE PAYMENT INTENT FOR EXTENSION
// ============================================================
router.post('/reservations/token/:token/modify-during-stay-pay', async (req: Request, res: Response) => {
  const { newDepartureDate } = req.body;
  if (!newDepartureDate) return res.status(400).json({ error: 'newDepartureDate is verplicht' });

  const result = await query(
    `SELECT r.*, c.first_name, c.last_name, c.email
     FROM reservations r JOIN customers c ON c.id = r.customer_id
     WHERE r.cancellation_token = $1`,
    [req.params.token]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const r = result.rows[0];

  if (['cancelled', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet worden gewijzigd' });
  }

  const { differenceInDays } = await import('date-fns');
  const isoDate = (d: any) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const arrivalDate = new Date(isoDate(r.arrival_date) + 'T12:00:00');
  const currentDepartureDate = new Date(isoDate(r.departure_date) + 'T12:00:00');
  const duringStay = today >= arrivalDate && today < currentDepartureDate;

  if (!duringStay) {
    return res.status(400).json({ error: 'Deze route is alleen beschikbaar tijdens uw verblijf' });
  }

  const newDepStr = isoDate(newDepartureDate);
  if (newDepStr <= isoDate(r.departure_date)) {
    return res.status(400).json({ error: 'Tijdens uw verblijf kunt u de verblijfsduur niet verkorten' });
  }

  const settingsResult = await query("SELECT key, value FROM settings WHERE key = 'during_stay_daily_rate'");
  const duringStayDailyRate = parseFloat(settingsResult.rows[0]?.value || '20');

  const newDepartureDateObj = new Date(newDepStr + 'T12:00:00');
  const extraDays = differenceInDays(newDepartureDateObj, currentDepartureDate);
  const extraCharge = Math.round(extraDays * duringStayDailyRate * 100) / 100;
  const amountCents = Math.round(extraCharge * 100);

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'eur',
    metadata: {
      reservationId: r.id,
      newDepartureDate: newDepStr,
      type: 'during_stay_extension',
    },
    receipt_email: r.email,
  });

  return res.json({
    clientSecret: paymentIntent.client_secret,
    amount: extraCharge,
    extraDays,
    duringStayDailyRate,
  });
});

// ============================================================
// CUSTOMER — DURING-STAY: COMPLETE EXTENSION AFTER PAYMENT
// ============================================================
router.post('/reservations/token/:token/modify-during-stay-complete', async (req: Request, res: Response) => {
  const { paymentIntentId, newDepartureDate } = req.body;
  if (!paymentIntentId || !newDepartureDate) {
    return res.status(400).json({ error: 'paymentIntentId en newDepartureDate zijn verplicht' });
  }

  const result = await query('SELECT * FROM reservations WHERE cancellation_token = $1', [req.params.token]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const r = result.rows[0];

  if (['cancelled', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet worden gewijzigd' });
  }

  // Verify payment
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status !== 'succeeded') {
    return res.status(400).json({ error: 'Betaling niet succesvol afgerond' });
  }

  const { differenceInDays } = await import('date-fns');
  const isoDate = (d: any) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const currentDepartureDate = new Date(isoDate(r.departure_date) + 'T12:00:00');
  const newDepStr = isoDate(newDepartureDate);
  const newDepartureDateObj = new Date(newDepStr + 'T12:00:00');
  const extraDays = differenceInDays(newDepartureDateObj, currentDepartureDate);

  const settingsResult = await query("SELECT key, value FROM settings WHERE key = 'during_stay_daily_rate'");
  const duringStayDailyRate = parseFloat(settingsResult.rows[0]?.value || '20');
  const extraCharge = Math.round(extraDays * duringStayDailyRate * 100) / 100;
  const newPrice = parseFloat(r.total_price) + extraCharge;

  // Update reservation
  await query(
    `UPDATE reservations SET departure_date=$1, total_price=$2, updated_at=NOW() WHERE id=$3`,
    [newDepStr, newPrice, r.id]
  );

  // Get plates for details
  const vehiclesResult = await query('SELECT license_plate FROM vehicles WHERE reservation_id = $1', [r.id]);
  const plates = vehiclesResult.rows.map((v: any) => v.license_plate).join(', ');

  // Create modification record (pending_review + during_stay=true so admin sees as notification)
  await query(
    `INSERT INTO reservation_modifications
     (reservation_id, modified_by, old_arrival_date, old_departure_date, new_arrival_date, new_departure_date,
      old_total_price, new_total_price, price_difference, modification_fee, status, modification_type, during_stay, change_details)
     VALUES ($1,'customer',$2,$3,$2,$4,$5,$6,$7,0,'pending_review','dates',true,$8)`,
    [
      r.id, r.arrival_date, r.departure_date, newDepStr,
      parseFloat(r.total_price), newPrice, extraCharge,
      JSON.stringify({ plates, extraDays, duringStayDailyRate, extraCharge, paymentIntentId, autoApplied: true }),
    ]
  );

  return res.json({ success: true });
});

// ============================================================
// CUSTOMER — MODIFY CHECKEDIN DEPARTURE (vervroegd vertrek)
// ============================================================
router.post('/reservations/token/:token/modify-checkedin-departure', async (req: Request, res: Response) => {
  const { newDepartureDate } = req.body;
  if (!newDepartureDate) return res.status(400).json({ error: 'newDepartureDate is verplicht' });

  const result = await query(
    `SELECT r.*, c.first_name, c.last_name, c.email
     FROM reservations r JOIN customers c ON c.id = r.customer_id
     WHERE r.cancellation_token = $1`,
    [req.params.token]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const r = result.rows[0];

  if (r.status !== 'checked_in') {
    return res.status(400).json({ error: 'Deze route is alleen beschikbaar voor ingecheckte reserveringen' });
  }

  const isoDate = (d: any) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const currentDepStr = isoDate(r.departure_date);

  if (newDepartureDate >= currentDepStr) {
    return res.status(400).json({ error: 'U kunt de vertrekdatum alleen vervroegen. Voor verlenging, neem contact op.' });
  }

  const currentPrice = parseFloat(r.total_price);

  await query(
    `INSERT INTO reservation_modifications
     (reservation_id, modified_by, old_arrival_date, old_departure_date, new_arrival_date, new_departure_date,
      old_total_price, new_total_price, price_difference, modification_fee, status, modification_type, during_stay, change_details)
     VALUES ($1,'customer',$2,$3,$2,$4,$5,$5,0,0,'pending_review','checkedin_departure',false,$6)`,
    [
      r.id,
      r.arrival_date,
      r.departure_date,
      newDepartureDate,
      currentPrice,
      JSON.stringify({ reason: 'Vervroegd vertrek door klant' }),
    ]
  );

  return res.json({ success: true, pending: true });
});

// ============================================================
// CUSTOMER — PRE-STAY DATE CHANGE WITH STRIPE PAYMENT
// ============================================================
router.post('/reservations/token/:token/modify-dates-stripe-pay', async (req: Request, res: Response) => {
  const { newArrivalDate, newDepartureDate, overbooked } = req.body;
  if (!newArrivalDate || !newDepartureDate) return res.status(400).json({ error: 'newArrivalDate en newDepartureDate zijn verplicht' });

  const result = await query(
    `SELECT r.*, c.first_name, c.last_name, c.email
     FROM reservations r JOIN customers c ON c.id = r.customer_id
     WHERE r.cancellation_token = $1`,
    [req.params.token]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const r = result.rows[0];

  if (['cancelled', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet worden gewijzigd' });
  }

  const isoDate = (d: any) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const arrivalDate = new Date(isoDate(r.arrival_date) + 'T12:00:00');
  const currentDepartureDate = new Date(isoDate(r.departure_date) + 'T12:00:00');
  const duringStay = today >= arrivalDate && today < currentDepartureDate;

  if (duringStay) {
    return res.status(400).json({ error: 'Gebruik de during-stay route voor wijzigingen tijdens verblijf' });
  }

  const vehicleCountResult = await query('SELECT COUNT(*) as cnt FROM vehicles WHERE reservation_id = $1', [r.id]);
  const vehicleCount = parseInt(vehicleCountResult.rows[0].cnt);
  const lotId = r.parking_lot_id;

  const settingsResult = await query("SELECT key, value FROM settings WHERE key IN ('modification_fee', 'overbooking_fee')");
  const cfg: Record<string, string> = {};
  settingsResult.rows.forEach((row: any) => { cfg[row.key] = row.value; });
  const modFee = parseFloat(cfg['modification_fee'] || '0');
  const overbookingFeePerNight = parseFloat(cfg['overbooking_fee'] || '20');

  // Beschikbaarheidscheck per nacht incl. overrides
  if (!overbooked) {
    const { minAvailable } = await checkNightlyAvailability(lotId, newArrivalDate, newDepartureDate, r.id);
    if (minAvailable < vehicleCount) return res.status(409).json({ error: 'Onvoldoende plaatsen beschikbaar voor de gekozen periode', overbookingOption: true });
  }

  const currentPrice = parseFloat(r.total_price);
  const servicesTotal = parseFloat(r.services_total || '0');
  let newPriceInfo: any;
  try {
    newPriceInfo = await calculatePrice(new Date(newArrivalDate), new Date(newDepartureDate), lotId, vehicleCount);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }

  const newTotalPrice = Math.round((newPriceInfo.totalPrice + servicesTotal) * 100) / 100;
  const priceDiff = Math.round((newTotalPrice - currentPrice) * 100) / 100;

  const { differenceInDays } = await import('date-fns');
  const newNights = differenceInDays(new Date(newDepartureDate + 'T12:00:00'), new Date(newArrivalDate + 'T12:00:00'));
  const overbookingTotal = overbooked ? Math.round(newNights * overbookingFeePerNight * 100) / 100 : 0;

  if (priceDiff <= 0 && !overbooked) {
    return res.status(400).json({ error: 'Deze route is alleen voor bijbetalingen. Gebruik de reguliere wijzigingsroute.' });
  }

  const netDue = Math.round((priceDiff + modFee + overbookingTotal) * 100) / 100;
  if (netDue <= 0) {
    return res.status(400).json({ error: 'Geen bijbetaling vereist.' });
  }
  const amountCents = Math.round(netDue * 100);

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'eur',
    metadata: {
      reservationId: r.id,
      newArrivalDate,
      newDepartureDate,
      type: 'pre_stay_modification',
      overbooked: overbooked ? 'true' : 'false',
    },
    receipt_email: r.email,
  });

  const modResult = await query(
    `INSERT INTO reservation_modifications
     (reservation_id, modified_by, old_arrival_date, old_departure_date, new_arrival_date, new_departure_date,
      old_total_price, new_total_price, price_difference, modification_fee, status, modification_type, during_stay, change_details, stripe_payment_intent_id)
     VALUES ($1,'customer',$2,$3,$4,$5,$6,$7,$8,$9,'pending_payment','dates',false,$10,$11)
     RETURNING id`,
    [
      r.id,
      r.arrival_date, r.departure_date,
      newArrivalDate, newDepartureDate,
      currentPrice, newTotalPrice,
      priceDiff, modFee,
      JSON.stringify({ paymentMethod: 'stripe', stripePaymentIntentId: paymentIntent.id, overbooked: !!overbooked, overbookingTotal }),
      paymentIntent.id,
    ]
  );

  return res.json({
    clientSecret: paymentIntent.client_secret,
    amount: netDue,
    modificationId: modResult.rows[0].id,
  });
});

// ============================================================
// CUSTOMER — PRE-STAY DATE CHANGE STRIPE COMPLETE
// ============================================================
router.post('/reservations/token/:token/modify-dates-stripe-complete', async (req: Request, res: Response) => {
  const { paymentIntentId, newArrivalDate, newDepartureDate } = req.body;
  if (!paymentIntentId || !newArrivalDate || !newDepartureDate) {
    return res.status(400).json({ error: 'paymentIntentId, newArrivalDate en newDepartureDate zijn verplicht' });
  }

  const result = await query('SELECT * FROM reservations WHERE cancellation_token = $1', [req.params.token]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const r = result.rows[0];

  if (['cancelled', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet worden gewijzigd' });
  }

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status !== 'succeeded') {
    return res.status(400).json({ error: 'Betaling niet succesvol afgerond' });
  }

  const vehicleCountResult = await query('SELECT COUNT(*) as cnt FROM vehicles WHERE reservation_id = $1', [r.id]);
  const vehicleCount = parseInt(vehicleCountResult.rows[0].cnt);
  const lotId = r.parking_lot_id;

  const servicesTotal = parseFloat(r.services_total || '0');
  let newPriceInfo: any;
  try {
    newPriceInfo = await calculatePrice(new Date(newArrivalDate), new Date(newDepartureDate), lotId, vehicleCount);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }

  const newTotalPrice = Math.round((newPriceInfo.totalPrice + servicesTotal) * 100) / 100;
  await query(
    `UPDATE reservations SET arrival_date=$1, departure_date=$2, total_price=$3, updated_at=NOW() WHERE id=$4`,
    [newArrivalDate, newDepartureDate, newTotalPrice, r.id]
  );

  await query(
    `UPDATE reservation_modifications SET status='completed', accepted_at=NOW()
     WHERE reservation_id=$1 AND stripe_payment_intent_id=$2`,
    [r.id, paymentIntentId]
  );

  return res.json({ success: true });
});

// ============================================================
// CUSTOMER — PRE-STAY DATE CHANGE ON-SITE PAYMENT
// ============================================================
router.post('/reservations/token/:token/modify-dates-on-site', async (req: Request, res: Response) => {
  const { newArrivalDate, newDepartureDate, overbooked } = req.body;
  if (!newArrivalDate || !newDepartureDate) return res.status(400).json({ error: 'newArrivalDate en newDepartureDate zijn verplicht' });

  const result = await query(
    `SELECT r.*, c.first_name, c.last_name, c.email
     FROM reservations r JOIN customers c ON c.id = r.customer_id
     WHERE r.cancellation_token = $1`,
    [req.params.token]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const r = result.rows[0];

  if (['cancelled', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet worden gewijzigd' });
  }

  const isoDate = (d: any) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const arrivalDate = new Date(isoDate(r.arrival_date) + 'T12:00:00');
  const currentDepartureDate = new Date(isoDate(r.departure_date) + 'T12:00:00');
  const duringStay = today >= arrivalDate && today < currentDepartureDate;

  if (duringStay) {
    return res.status(400).json({ error: 'Gebruik de during-stay route voor wijzigingen tijdens verblijf' });
  }

  const vehicleCountResult = await query('SELECT COUNT(*) as cnt FROM vehicles WHERE reservation_id = $1', [r.id]);
  const vehicleCount = parseInt(vehicleCountResult.rows[0].cnt);
  const lotId = r.parking_lot_id;

  const settingsResult2 = await query("SELECT key, value FROM settings WHERE key IN ('modification_fee', 'overbooking_fee')");
  const cfg2: Record<string, string> = {};
  settingsResult2.rows.forEach((row: any) => { cfg2[row.key] = row.value; });
  const modFee2 = parseFloat(cfg2['modification_fee'] || '0');
  const overbookingFeePerNight2 = parseFloat(cfg2['overbooking_fee'] || '20');
  const onSiteSurcharge = 5;

  // Beschikbaarheidscheck per nacht incl. overrides
  if (!overbooked) {
    const { minAvailable } = await checkNightlyAvailability(lotId, newArrivalDate, newDepartureDate, r.id);
    if (minAvailable < vehicleCount) return res.status(409).json({ error: 'Onvoldoende plaatsen beschikbaar voor de gekozen periode', overbookingOption: true });
  }

  const currentPrice = parseFloat(r.total_price);
  const servicesTotal2 = parseFloat(r.services_total || '0');
  let newPriceInfo: any;
  try {
    newPriceInfo = await calculatePrice(new Date(newArrivalDate), new Date(newDepartureDate), lotId, vehicleCount);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }

  const newTotalPrice2 = Math.round((newPriceInfo.totalPrice + servicesTotal2) * 100) / 100;
  const priceDiff = Math.round((newTotalPrice2 - currentPrice) * 100) / 100;

  const { differenceInDays: diffDays2 } = await import('date-fns');
  const newNights2 = diffDays2(new Date(newDepartureDate + 'T12:00:00'), new Date(newArrivalDate + 'T12:00:00'));
  const overbookingTotal2 = overbooked ? Math.round(newNights2 * overbookingFeePerNight2 * 100) / 100 : 0;

  if (priceDiff <= 0 && !overbooked) {
    return res.status(400).json({ error: 'Deze route is alleen voor bijbetalingen.' });
  }

  const netDue = Math.round((priceDiff + onSiteSurcharge + overbookingTotal2) * 100) / 100;

  // Auto-accept: apply dates immediately, customer pays on arrival
  await query(
    `UPDATE reservations SET arrival_date=$1, departure_date=$2, total_price=$3, updated_at=NOW() WHERE id=$4`,
    [newArrivalDate, newDepartureDate, newTotalPrice2, r.id]
  );

  await query(
    `INSERT INTO reservation_modifications
     (reservation_id, modified_by, old_arrival_date, old_departure_date, new_arrival_date, new_departure_date,
      old_total_price, new_total_price, price_difference, modification_fee, status, modification_type, during_stay, change_details)
     VALUES ($1,'customer',$2,$3,$4,$5,$6,$7,$8,$9,'pending_payment','dates',false,$10)`,
    [
      r.id,
      r.arrival_date, r.departure_date,
      newArrivalDate, newDepartureDate,
      currentPrice, newTotalPrice2,
      priceDiff, onSiteSurcharge,
      JSON.stringify({ paymentMethod: 'on_site', onSiteSurcharge, netDue, newArrivalDate, newDepartureDate, overbooked: !!overbooked, overbookingTotal: overbookingTotal2, note: 'Betaling ter plekke bij aankomst' }),
    ]
  );

  return res.json({ success: true, amount: netDue });
});

// ============================================================
// ADMIN — APPLY ON-SITE PAYMENT FOR MODIFICATION
// ============================================================
router.post('/admin/modifications/:id/apply-on-site-payment', requireAuth, async (req: Request, res: Response) => {
  const modResult = await query('SELECT * FROM reservation_modifications WHERE id = $1', [req.params.id]);
  if (modResult.rows.length === 0) return res.status(404).json({ error: 'Wijziging niet gevonden' });
  const mod = modResult.rows[0];

  if (mod.status !== 'pending_payment') return res.status(400).json({ error: 'Wijziging heeft geen openstaande betaling' });

  // Mark the modification as completed (payment received on-site)
  await query(
    `UPDATE reservation_modifications SET status='completed', accepted_by=$1, accepted_at=NOW() WHERE id=$2`,
    [req.admin!.adminId, req.params.id]
  );

  // Check if all pending payments for this reservation are now resolved
  const pending = await query(
    `SELECT COUNT(*) as cnt FROM reservation_modifications WHERE reservation_id=$1 AND status='pending_payment'`,
    [mod.reservation_id]
  );
  if (parseInt(pending.rows[0].cnt) === 0) {
    await query(
      `UPDATE reservations SET payment_status='paid', updated_at=NOW() WHERE id=$1 AND payment_status='partial'`,
      [mod.reservation_id]
    );
  }

  return res.json({ success: true });
});

// ============================================================
// ADMIN — CUSTOMERS
// ============================================================

// GET /admin/customers/by-ref/:ref — klant opzoeken via reserveringsreferentie
router.get('/admin/customers/by-ref/:ref', requireAuth, async (req: Request, res: Response) => {
  const { ref } = req.params;
  const result = await query(
    `SELECT customer_id FROM reservations WHERE reference = $1 LIMIT 1`,
    [ref]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Reservering niet gevonden' });
  return res.json({ customerId: result.rows[0].customer_id });
});

router.get('/admin/customers', requireAuth, async (req: Request, res: Response) => {
  const { search } = req.query as Record<string, string>;
  let where = '';
  const params: unknown[] = [];

  if (search) {
    where = `WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1
              OR (first_name || ' ' || last_name) ILIKE $1
              OR (last_name || ' ' || first_name) ILIKE $1
              OR phone ILIKE $1`;
    params.push(`%${search}%`);
  }

  const result = await query(
    `SELECT c.*,
       (SELECT COUNT(*) FROM reservations r WHERE r.customer_id = c.id AND r.status != 'cancelled') as reservation_count,
       (SELECT MAX(arrival_date) FROM reservations r WHERE r.customer_id = c.id) as last_visit
     FROM customers c ${where} ORDER BY c.created_at DESC LIMIT 100`,
    params
  );

  return res.json(result.rows);
});

// GET /admin/customers/:id — klant + boekingshistorie + alle kentekens
router.get('/admin/customers/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;

  const [customerRes, reservationsRes, platesRes] = await Promise.all([
    query(`SELECT * FROM customers WHERE id = $1`, [id]),
    query(
      `SELECT r.id, r.reference, r.arrival_date, r.departure_date, r.status, r.payment_status,
              r.total_price, r.ferry_outbound_time, r.ferry_outbound_destination,
              r.ferry_return_time, r.ferry_return_custom_time, r.notes, r.admin_notes,
              r.created_at,
              (SELECT string_agg(v.license_plate, ', ' ORDER BY v.sort_order) FROM vehicles v WHERE v.reservation_id = r.id) as plates
       FROM reservations r
       WHERE r.customer_id = $1
       ORDER BY r.arrival_date DESC`,
      [id]
    ),
    query(
      `SELECT DISTINCT v.license_plate
       FROM vehicles v
       JOIN reservations r ON r.id = v.reservation_id
       WHERE r.customer_id = $1
       ORDER BY v.license_plate`,
      [id]
    ),
  ]);

  if (!customerRes.rows[0]) return res.status(404).json({ error: 'Niet gevonden' });

  return res.json({
    ...customerRes.rows[0],
    reservations: reservationsRes.rows,
    all_plates: platesRes.rows.map((r: any) => r.license_plate),
  });
});

// DELETE /admin/customers/:id — verwijder klant + alle data
router.delete('/admin/customers/:id', requireAuth, async (req: Request, res: Response) => {
  await query(`DELETE FROM customers WHERE id = $1`, [req.params.id]);
  return res.status(204).end();
});

// GET /admin/customers/:id/magic-link — genereer een verkorte magic link voor de boekingspagina
router.get('/admin/customers/:id/magic-link', requireAuth, async (req: Request, res: Response) => {
  try {
    const r = await query(`SELECT email, first_name, last_name FROM customers WHERE id = $1`, [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Klant niet gevonden' });
    const { email, first_name, last_name } = r.rows[0];
    const token = signGuestToken({ guestEmail: email });
    // Maak tabel aan als die nog niet bestaat
    await query(`CREATE TABLE IF NOT EXISTS magic_link_codes (
      code VARCHAR(16) PRIMARY KEY,
      token TEXT NOT NULL,
      email TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )`);
    // Genereer een unieke kortecode (12 tekens, alfanumeriek — 54^12 ≈ 200 biljard combinaties)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 12; i++) code += chars[Math.floor(Math.random() * chars.length)];
    await query(
      `INSERT INTO magic_link_codes (code, token, email, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')
       ON CONFLICT (code) DO UPDATE SET token = $2, email = $3, expires_at = NOW() + INTERVAL '30 days'`,
      [code, token, email]
    );
    const BOOKING_BASE = process.env.BOOKING_URL || 'https://booking.parkeren-harlingen.nl';
    const url = `${BOOKING_BASE}/boeken/l/${code}`;
    return res.json({ url, email, first_name, last_name });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Rate limiter: max 10 pogingen per IP per minuut op magic link endpoint
const magicLinkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Te veel pogingen, probeer het over een minuut opnieuw' },
});

// GET /api/v1/guest/ml/:code — los een magic link kortecode op (eenmalig)
router.get('/guest/ml/:code', magicLinkLimiter, async (req: Request, res: Response) => {
  try {
    const r = await query(
      `DELETE FROM magic_link_codes WHERE code = $1 AND expires_at > NOW() RETURNING token, email`,
      [req.params.code]
    );
    if (r.rows.length === 0) {
      // Vertraging bij fout: maakt brute-force aanmerkelijk trager
      await new Promise(resolve => setTimeout(resolve, 500));
      return res.status(404).json({ error: 'Link onbekend of verlopen' });
    }
    const { token, email } = r.rows[0];
    return res.json({ token, email });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ============================================================
// UMBRACO SYNC
// POST /admin/umbraco/sync
// Scant nieuwe Umbraco-reserveringen en importeert ze.
// Body: { umbracoToken?, fromId?, toId?, dryRun? }
// ============================================================
const UMBRACO_BASE = 'https://cms.autostallingdebazuin.nl/umbraco/management/api/v1';
const UMB_LOT_ID  = 'b0000000-0000-0000-0000-000000000001';
const UMB_RATE_ID = '00000000-0000-0000-0000-000000000001';

// Gedeelde kWh → service mapping (gebruikt in sync + compact import + ev-repair)
const UMB_KWH_MAP: Record<number, { id: string; price: number }> = {
  10: { id: 'e7a1bc23-4d56-4f89-ab12-0c3d5e6f7890', price: 10 },
  15: { id: '31ef28d9-49d9-42cf-bb42-7a113f60b592', price: 12 },
  20: { id: 'a3fdeddc-e296-45c4-91e6-085eb39c974c', price: 15 },
  30: { id: '932f1a6c-a50c-4c7f-bfba-4b7c8ac8d4b1', price: 20 },
  40: { id: '614e136c-5f06-4496-95f5-4391375b0475', price: 25 },
  60: { id: '0b0fb992-ee33-4f03-93f4-c3068c955409', price: 40 },
};
const UMB_EV_VOL = { id: 'c3b59118-f427-4e18-936d-4827d18e7dbe', price: 5 };

// typeId → kWh mapping (stabiele Umbraco-identifiers, betrouwbaarder dan tekst parsen)
const UMB_TYPEID_MAP: Record<number, number> = {
  1030: 10, // 10 kWh (~30-50 km)
  1031: 20,
  1032: 30,
  1033: 40,
  1034: 60,
};

/** Detecteer EV-dienst uit een Umbraco items-array of een vrije tekst (note). */
function umbDetectEv(items: any[], noteText = ''): { svcId: string; kwh: number | null; price: number } | null {
  // 1. Zoek op typeId — meest betrouwbaar, geen tekst parsen nodig
  const evItemByTypeId = items.find((i: any) => UMB_TYPEID_MAP[i.typeId] != null);
  if (evItemByTypeId) {
    const kwh = UMB_TYPEID_MAP[evItemByTypeId.typeId];
    const svc = UMB_KWH_MAP[kwh] ?? UMB_EV_VOL;
    const umbPrice = evItemByTypeId.price != null ? parseFloat(evItemByTypeId.price) : null;
    const price = (umbPrice != null && umbPrice > 0) ? umbPrice : svc.price;
    return { svcId: svc.id, kwh, price };
  }

  // 2. Fallback: zoek op reservationItemType=2 + naam, of naam alleen
  const evItem = items.find((i: any) => i.reservationItemType === 2 && /laden|opladen|k[whu]/i.test(i.name ?? i.Name ?? i.description ?? ''))
    ?? items.find((i: any) => /laden|opladen|\d+\s*k[whu]/i.test(i.name ?? i.Name ?? i.description ?? ''));

  const searchText = evItem ? (evItem.name ?? evItem.Name ?? evItem.description ?? '') : noteText;
  if (!evItem && !/oplad|laten laden|wil laden|charging|k[whu]/i.test(noteText)) return null;

  const kwhMatch = searchText.match(/(\d+)\s*k[whu]/i);
  const kwh = kwhMatch ? parseInt(kwhMatch[1]) : null;
  const svc = kwh ? (UMB_KWH_MAP[kwh] ?? UMB_EV_VOL) : UMB_EV_VOL;
  const umbPrice = evItem?.price != null ? parseFloat(evItem.price) : null;
  const price = (umbPrice != null && umbPrice > 0) ? umbPrice : svc.price;
  return { svcId: svc.id, kwh, price };
}

function umbToUuid(prefix: string, id: number): string {
  return `${prefix}0000000-0000-0000-0000-${String(id).padStart(12, '0')}`;
}

function umbSplitName(name: string): { first: string; last: string } {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] || '', last: '' };
  const last = parts.pop()!;
  return { first: parts.join(' '), last };
}

function umbMapMethod(m: string | null): string | null {
  if (!m) return null;
  const lm = m.toLowerCase();
  if (lm === 'ideal') return 'ideal';
  if (lm === 'paypal') return 'paypal';
  if (lm === 'sepa') return 'sepa';
  if (lm === 'bancontact') return 'bancontact';
  if (['mastercard','visa','amex','card','creditcard'].includes(lm)) return 'card';
  return null;
}

router.post('/admin/umbraco/sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const { umbracoToken: tokenFromReq, fromId, toId, dryRun } = req.body as {
      umbracoToken?: string; fromId?: number; toId?: number; dryRun?: boolean;
    };

    // 1. Resolve token (from request or settings)
    let token = tokenFromReq?.trim() || null;
    if (token) {
      await query(
        `INSERT INTO settings (key, value) VALUES ('umbraco_token', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
        [token]
      );
    } else {
      const s = await query(`SELECT value FROM settings WHERE key = 'umbraco_token'`);
      token = s.rows[0]?.value || null;
    }
    if (!token) return res.status(400).json({ error: 'Geen Umbraco-token opgegeven. Vul het in bij Instellingen.' });

    // 2. Determine scan range
    let startId: number = fromId ?? 0;
    if (!startId) {
      // Max Umbraco ID already in DB
      const r = await query(
        `SELECT MAX(CAST(SUBSTRING(reference FROM 'DB-2026-U(\\d+)$') AS integer)) AS max_id
         FROM reservations WHERE reference ~ '^DB-2026-U\\d+$'`
      );
      startId = (parseInt(r.rows[0]?.max_id) || 24000) + 1;
    }
    const endId: number = toId ?? (startId + 1000); // scan up to 1000 IDs ahead

    // 3. Scan
    const client = await getClient();
    let scanned = 0, imported = 0, cancelled = 0, skipped = 0, errors = 0;
    let lastFoundId = startId - 1;
    let consecutiveEmpty = 0;

    try {
      for (let id = startId; id <= endId; id++) {
        let data: any;
        try {
          const resp = await fetch(`${UMBRACO_BASE}/reservation/get?id=${id}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          });
          if (resp.status === 404 || resp.status === 204) {
            consecutiveEmpty++;
            if (consecutiveEmpty >= 100) break; // stop after 100 consecutive misses
            continue;
          }
          if (!resp.ok) { errors++; continue; }
          data = await resp.json();
          if (!data || !data.reservationId) { consecutiveEmpty++; continue; }
        } catch {
          errors++;
          continue;
        }

        consecutiveEmpty = 0;

        // Skip availability-check ghost bookings: hour=0, min=0, not paid
        const depH = data.ferryDepartureHour;
        const depM = data.ferryDepartureMinutes;
        const isGhost = (depH === 0 && depM === 0) && !data.isPaid;
        if (isGhost) { skipped++; continue; }

        scanned++;
        lastFoundId = id;

        const ref = `DB-2026-U${id}`;
        // reservationStatus 8 = cancelled (cancelledAt may be null even when cancelled)
        const isCancelled = data.reservationStatus === 8 || !!(data.cancelledAt || data.isDeleted);

        // Check existing reservation
        const existing = await client.query('SELECT id, status FROM reservations WHERE reference = $1', [ref]);
        if (existing.rows.length > 0) {
          if (isCancelled && existing.rows[0].status !== 'cancelled') {
            if (!dryRun) {
              await client.query(`UPDATE reservations SET status = 'cancelled', updated_at = NOW() WHERE reference = $1`, [ref]);
            }
            cancelled++;
          } else {
            skipped++;
          }
          continue;
        }

        // New reservation — import it
        if (!dryRun) {
          try {
            await client.query('BEGIN');

            const custName  = data.customer?.name || data.name || data.customerName || '';
            const custEmail = (data.customer?.emailAddress || '').toLowerCase().trim();
            const custPhone = data.customer?.telephone || '';
            const email     = custEmail || `umbraco-${id}@noemail.local`;
            const { first, last } = umbSplitName(custName);
            const custId = umbToUuid('c', id);

            await client.query(
              `INSERT INTO customers (id, first_name, last_name, email, phone, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
               ON CONFLICT (email) DO UPDATE SET
                 first_name = CASE WHEN customers.first_name='' THEN EXCLUDED.first_name ELSE customers.first_name END,
                 last_name  = CASE WHEN customers.last_name=''  THEN EXCLUDED.last_name  ELSE customers.last_name  END,
                 phone      = CASE WHEN customers.phone=''      THEN EXCLUDED.phone      ELSE customers.phone      END,
                 updated_at = NOW()`,
              [custId, first, last, email, custPhone]
            );
            const custRow = await client.query('SELECT id FROM customers WHERE email = $1', [email]);
            const actualCustId = custRow.rows[0]?.id ?? custId;

            const depH = data.ferryDepartureHour;
            const depM = data.ferryDepartureMinutes;
            const retH = data.ferryReturnHour;
            const retM = data.ferryReturnMinutes;
            const outTime = (depH != null && depM != null) ? `${String(depH).padStart(2,'0')}:${String(depM).padStart(2,'0')}` : null;
            const retTime = (retH != null && retM != null) ? `${String(retH).padStart(2,'0')}:${String(retM).padStart(2,'0')}` : null;
            const arrival   = data.startDate?.slice(0, 10) ?? null;
            const departure = data.endDate?.slice(0, 10) ?? null;

            let outDest: string | null = null;
            if (outTime && arrival) {
              const dr = await client.query(
                `SELECT destination FROM ferry_schedules
                 WHERE schedule_date=$1 AND direction='outbound'
                   AND ABS(EXTRACT(EPOCH FROM (departure_time - $2::time))/60) <= 20
                 ORDER BY ABS(EXTRACT(EPOCH FROM (departure_time - $2::time))) LIMIT 1`,
                [arrival, outTime]
              );
              outDest = dr.rows[0]?.destination ?? null;
            }

            const price     = parseFloat(data.price) || 0;
            const status    = isCancelled ? 'cancelled' : 'booked';
            const payStatus = data.isPaid ? 'paid' : 'pending';
            const payMethod = umbMapMethod(data.paymentMethod) || (data.isPaid ? 'ideal' : null);
            // Parse possibly multiple plates from a single field (e.g. "AB-123-C / DE-456-F")
            const rawPlates = (data.licensePlate || '')
              .split(/[,\/;\n\r|+&]+/)
              .map((s: string) => s.replace(/[-\s]/g, '').toUpperCase().trim())
              .filter((s: string) => s.length >= 4 && s.length <= 12);
            const plate      = rawPlates[0] ?? '';
            const extraPlates = rawPlates.slice(1);
            const resId     = umbToUuid('e', id);

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
               ) ON CONFLICT (id) DO NOTHING`,
              [
                resId, ref, actualCustId, UMB_LOT_ID, UMB_RATE_ID,
                status, payStatus, payMethod, data.paymentIntentId || null,
                arrival, departure,
                outTime, outDest, data.isFastFerry || false,
                retTime,
                price,
                (data.description || '').trim(),
                `Import Umbraco #${id}`,
              ]
            );

            const umbItems: any[] = data.items ?? data.Items ?? data.orderLines ?? [];
            const noteText = (data.description ?? data.note ?? data.customerNote ?? '').toLowerCase();

            // EV eerst detecteren zodat we de EV-prijs kunnen aftrekken bij prijsratio
            const ev = umbDetectEv(umbItems, noteText);
            const evPrice = ev && !isCancelled ? ev.price : 0;
            const parkingPrice = Math.max(0, price - evPrice);

            // Bepaal aantal voertuigen: direct veld → items-analyse → tekst-detectie → prijsratio
            let vehicleCount = parseInt(data.numberOfSpots ?? data.numberOfCars ?? data.spots ?? data.cars ?? 0) || 0;
            if (!vehicleCount) {
              for (const item of umbItems) {
                const iname = (item.name ?? item.Name ?? item.description ?? '').toLowerCase();
                if (/parkeer|stalling|overdekt|auto|voertuig|plaats/.test(iname)) {
                  const qty = parseInt(item.quantity ?? item.Quantity ?? item.count ?? 1) || 1;
                  vehicleCount = Math.max(vehicleCount, qty);
                }
              }
            }
            // Tekst-detectie: getal + "auto/kenteken/voertuig" in beschrijving of notitie
            if (vehicleCount <= 1) {
              const autoMatch = noteText.match(/(\d+)\s*(auto|voertuig|kenteken|car)/);
              if (autoMatch) vehicleCount = Math.max(vehicleCount, parseInt(autoMatch[1]));
            }
            // Prijsratio: netto parkeerbedrag (excl. EV) ÷ verwachte 1-auto prijs (op basis van geldig tarief)
            // Alleen als er nog geen extra voertuigen via tekst/items gedetecteerd zijn
            if (vehicleCount === 1 && arrival && departure && parkingPrice > 0) {
              const nights = Math.round((new Date(departure).getTime() - new Date(arrival).getTime()) / 86400000);
              if (nights > 0) {
                // Umbraco telde dagen incl. aankomstdag → day_number = nights + 1
                const umbDays = Math.min(nights + 1, 30);
                const rateRow = await client.query(
                  `SELECT dp.price FROM rates r
                   JOIN rate_day_prices dp ON dp.rate_id = r.id
                   WHERE r.is_active = true
                     AND r.valid_from <= $1 AND r.valid_until >= $1
                     AND dp.day_number = $2
                   ORDER BY r.valid_from DESC LIMIT 1`,
                  [arrival, umbDays]
                );
                const singleCarPrice = parseFloat(rateRow.rows[0]?.price) || 0;
                if (singleCarPrice > 0) {
                  const ratio = parkingPrice / singleCarPrice;
                  if (ratio >= 1.7) vehicleCount = Math.min(Math.round(ratio), 6);
                }
              }
            }
            // Extra plates in licensePlate field count as confirmed extra vehicles
            vehicleCount = Math.max(vehicleCount, 1 + extraPlates.length);
            vehicleCount = Math.max(vehicleCount, 1);

            // Haal bestaande sort_orders op zodat re-import idempotent is
            const existVeh = await client.query(
              `SELECT sort_order FROM vehicles WHERE reservation_id = $1`, [resId]
            );
            const existOrders = new Set<number>(existVeh.rows.map((r: any) => r.sort_order as number));

            if (!existOrders.has(0)) {
              await client.query(
                `INSERT INTO vehicles (reservation_id, license_plate, ev_service_id, sort_order)
                 VALUES ($1,$2,NULL,0)`,
                [resId, plate || '']
              );
            }
            // Extra voertuigen: gebruik bekende kentekens waar beschikbaar, anders leeg
            for (let vi = 1; vi < vehicleCount; vi++) {
              if (!existOrders.has(vi)) {
                await client.query(
                  `INSERT INTO vehicles (reservation_id, license_plate, sort_order)
                   VALUES ($1,$2,$3)`,
                  [resId, extraPlates[vi - 1] ?? '', vi]
                );
              }
            }

            // EV koppelen aan eerste voertuig
            if (ev && !isCancelled) {
              const vr = await client.query(
                `SELECT id FROM vehicles WHERE reservation_id=$1 ORDER BY sort_order LIMIT 1`, [resId]
              );
              const vehicleId = vr.rows[0]?.id ?? null;
              if (vehicleId) {
                await client.query(
                  `UPDATE vehicles SET ev_service_id=$2, ev_kwh=$3, ev_price=$4 WHERE id=$1`,
                  [vehicleId, ev.svcId, ev.kwh, ev.price]
                );
              }
              await client.query(
                `INSERT INTO reservation_services(reservation_id,service_id,vehicle_id,quantity,unit_price,total_price,notes)
                 VALUES($1,$2,$3,1,$4,$4,$5) ON CONFLICT DO NOTHING`,
                [resId, ev.svcId, vehicleId, ev.price,
                 `Auto-import Umbraco: ${ev.kwh ? ev.kwh + ' kWh' : 'vol laden'}`]
              );
              // EV zit al in Umbraco-prijs → splitsen van base_price
              await client.query(
                `UPDATE reservations SET base_price=base_price-$2, services_total=$2, updated_at=NOW() WHERE id=$1`,
                [resId, ev.price]
              );
            }

            await client.query('COMMIT');
            imported++;
          } catch (err: any) {
            await client.query('ROLLBACK');
            errors++;
          }
        } else {
          // Dry run — just count
          imported++;
        }
      }
    } finally {
      client.release();
    }

    // 4. Save state
    if (!dryRun && lastFoundId >= startId) {
      await query(
        `INSERT INTO settings (key, value) VALUES ('umbraco_last_sync_id', $1) ON CONFLICT (key) DO UPDATE SET value=$1`,
        [String(lastFoundId)]
      );
      await query(
        `INSERT INTO settings (key, value) VALUES ('umbraco_last_sync_at', $1) ON CONFLICT (key) DO UPDATE SET value=$1`,
        [new Date().toISOString()]
      );
    }

    return res.json({ scanned, imported, cancelled, skipped, errors, lastId: lastFoundId, dryRun: !!dryRun });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /admin/umbraco/status — haal sync status op
router.get('/admin/umbraco/status', requireAuth, async (_req: Request, res: Response) => {
  const rows = await query(
    `SELECT key, value FROM settings WHERE key IN ('umbraco_last_sync_id','umbraco_last_sync_at','umbraco_token')`
  );
  const map: Record<string, string> = {};
  for (const r of rows.rows) map[r.key] = r.value;
  return res.json({
    lastSyncId:  map['umbraco_last_sync_id'] || null,
    lastSyncAt:  map['umbraco_last_sync_at']  || null,
    hasToken:    !!map['umbraco_token'],
  });
});

// POST /admin/umbraco/save-token — sla Umbraco-token op in settings
router.post('/admin/umbraco/save-token', requireAuth, async (req: Request, res: Response) => {
  const { umbracoToken } = req.body as { umbracoToken?: string };
  const token = umbracoToken?.trim();
  if (!token) return res.status(400).json({ error: 'Geen token opgegeven.' });
  await query(
    `INSERT INTO settings (key, value) VALUES ('umbraco_token', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
    [token]
  );
  return res.json({ ok: true });
});

// GET /admin/umbraco/max-id — geeft het hoogste Umbraco ID in de DB
router.get('/admin/umbraco/max-id', requireAuth, async (_req: Request, res: Response) => {
  const r = await query(
    `SELECT MAX(CAST(SUBSTRING(reference FROM 'DB-2026-U(\\d+)$') AS integer)) AS max_id
     FROM reservations WHERE reference ~ '^DB-2026-U\\d+$'`
  );
  return res.json({ maxId: parseInt(r.rows[0]?.max_id) || 24000 });
});

// GET /admin/umbraco/pending-ids
// Geeft alle Umbraco-referentie-IDs waarvan de boeking nog 'booked' + 'pending' is.
// Bedoeld voor de verificatiescan: controleer of ze in Umbraco gecanceld zijn.
router.get('/admin/umbraco/pending-ids', requireAuth, async (_req: Request, res: Response) => {
  const r = await query(
    `SELECT CAST(SUBSTRING(reference FROM 'DB-2026-U(\\d+)$') AS integer) AS umbraco_id
     FROM reservations
     WHERE reference ~ '^DB-2026-U\\d+$'
       AND status = 'booked'
       AND payment_status = 'pending'
     ORDER BY 1`
  );
  const ids: number[] = r.rows.map((row: any) => parseInt(row.umbraco_id)).filter(Boolean);
  return res.json({ ids, count: ids.length });
});

// GET /admin/umbraco/gap-ids?from=24284&to=24515
// Geeft Umbraco-IDs die ontbreken in de DB binnen een bepaald bereik.
// Bedoeld om 'gaten' in de importhistorie te detecteren en alsnog te importeren.
router.get('/admin/umbraco/gap-ids', requireAuth, async (req: Request, res: Response) => {
  const fromId = parseInt(req.query.from as string) || 24000;
  const toId   = parseInt(req.query.to   as string) || 25000;
  if (toId - fromId > 5000) {
    return res.status(400).json({ error: 'Bereik te groot (max 5000)' });
  }
  const r = await query(
    `SELECT CAST(SUBSTRING(reference FROM 'DB-\\d+-U(\\d+)$') AS integer) AS umb_id
     FROM reservations
     WHERE reference ~ '^DB-\\d+-U\\d+$'
       AND CAST(SUBSTRING(reference FROM 'DB-\\d+-U(\\d+)$') AS integer) BETWEEN $1 AND $2`,
    [fromId, toId]
  );
  const presentIds = new Set<number>(r.rows.map((row: any) => parseInt(row.umb_id)));
  const missingIds: number[] = [];
  for (let id = fromId; id <= toId; id++) {
    if (!presentIds.has(id)) missingIds.push(id);
  }
  return res.json({ ids: missingIds, count: missingIds.length, from: fromId, to: toId, present: presentIds.size });
});

// GET /admin/umbraco/cancelled-paid-ids
// Geeft Umbraco-IDs van boekingen die geannuleerd zijn maar wél betaald — zonder restitutie.
// Bedoeld voor herstelverificatie: controleer in Umbraco of ze alsnog actief zijn.
router.get('/admin/umbraco/cancelled-paid-ids', requireAuth, async (_req: Request, res: Response) => {
  const r = await query(
    `SELECT
       CAST(SUBSTRING(reference FROM 'DB-2026-U(\\d+)$') AS integer) AS umbraco_id,
       c.first_name, c.last_name,
       r.arrival_date, r.departure_date,
       r.total_price
     FROM reservations r
     JOIN customers c ON c.id = r.customer_id
     WHERE r.reference ~ '^DB-2026-U\\d+$'
       AND r.status = 'cancelled'
       AND r.payment_status = 'paid'
       AND (r.refund_amount IS NULL OR r.refund_amount = 0)
       AND c.last_name NOT ILIKE '%test%'
     ORDER BY r.arrival_date`
  );
  const entries = r.rows.map((row: any) => ({
    id: parseInt(row.umbraco_id),
    name: `${row.first_name} ${row.last_name}`.trim(),
    arrival: row.arrival_date,
    departure: row.departure_date,
    total: parseFloat(row.total_price),
  })).filter(e => e.id);
  return res.json({ entries, count: entries.length });
});

// POST /admin/umbraco/reactivate
// Heractiveer een geannuleerde boeking die in Umbraco alsnog actief is.
// Body: { umbId: number }
router.post('/admin/umbraco/reactivate', requireAuth, async (req: Request, res: Response) => {
  const { umbId } = req.body as { umbId: number };
  if (!umbId) return res.status(400).json({ error: 'umbId vereist' });
  const ref = `DB-2026-U${umbId}`;
  const r = await query(
    `UPDATE reservations
     SET status='booked',
         admin_notes = COALESCE(admin_notes,'') || E'\\n[Hersteld via Umbraco-verificatie: was geannuleerd maar betaald zonder restitutie]',
         updated_at=NOW()
     WHERE reference=$1 AND status='cancelled' AND payment_status='paid'
     RETURNING id, reference`,
    [ref]
  );
  if (r.rows.length === 0) return res.status(404).json({ error: 'Boeking niet gevonden of al actief' });
  return res.json({ reactivated: true, reference: ref });
});

// GET /admin/umbraco/v1-no-ev-ids  (backwards compat — redirect to all-ev-ids v1 subset)
router.get('/admin/umbraco/v1-no-ev-ids', requireAuth, async (_req: Request, res: Response) => {
  const r = await query(
    `SELECT CAST(SUBSTRING(reference FROM 'DB-2026-U(\\d+)$') AS integer) AS umbraco_id
     FROM reservations res
     WHERE reference ~ '^DB-2026-U\\d+$' AND status != 'cancelled'
       AND notes ILIKE '%imported from v1%'
       AND (id NOT IN (SELECT reservation_id FROM reservation_services)
            OR EXISTS (SELECT 1 FROM vehicles v WHERE v.reservation_id=res.id AND v.ev_kwh IS NULL))
     ORDER BY 1`
  );
  const ids: number[] = r.rows.map((row: any) => parseInt(row.umbraco_id)).filter(Boolean);
  return res.json({ ids, count: ids.length });
});

// GET /admin/umbraco/new-no-ev-ids  (backwards compat)
router.get('/admin/umbraco/new-no-ev-ids', requireAuth, async (_req: Request, res: Response) => {
  const r = await query(
    `SELECT CAST(SUBSTRING(reference FROM 'DB-2026-U(\\d+)$') AS integer) AS umbraco_id
     FROM reservations res
     WHERE reference ~ '^DB-2026-U\\d+$' AND status != 'cancelled'
       AND notes NOT ILIKE '%imported from v1%'
       AND (NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.reservation_id=res.id AND v.ev_service_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM vehicles v WHERE v.reservation_id=res.id AND v.ev_kwh IS NULL))
     ORDER BY 1`
  );
  const ids: number[] = r.rows.map((row: any) => parseInt(row.umbraco_id)).filter(Boolean);
  return res.json({ ids, count: ids.length });
});

// GET /admin/umbraco/all-ev-ids
// Gecombineerde scan: ALLE Umbraco-boekingen (v1 + nieuw) waarbij EV nog niet volledig verwerkt is.
// Retourneert { id, isV1 } zodat het script includedInPrice correct instelt.
router.get('/admin/umbraco/all-ev-ids', requireAuth, async (_req: Request, res: Response) => {
  const r = await query(
    `SELECT
       CAST(SUBSTRING(reference FROM 'DB-2026-U(\\d+)$') AS integer) AS umbraco_id,
       (notes ILIKE '%imported from v1%') AS is_v1
     FROM reservations res
     WHERE reference ~ '^DB-2026-U\\d+$'
       AND status != 'cancelled'
       AND (
         -- Geen enkele laaddienst gekoppeld
         id NOT IN (SELECT reservation_id FROM reservation_services)
         OR
         -- Laaddienst bestaat maar voertuig heeft nog geen ev_kwh (vol of leeg)
         EXISTS (
           SELECT 1 FROM vehicles v
           WHERE v.reservation_id = res.id AND v.ev_kwh IS NULL
         )
       )
     ORDER BY 1`
  );
  const entries = r.rows.map((row: any) => ({
    id: parseInt(row.umbraco_id),
    isV1: row.is_v1 as boolean,
  })).filter(e => e.id);
  return res.json({ entries, count: entries.length });
});

// POST /admin/umbraco/add-ev-service
// Voegt de juiste laaddienst toe aan reserveringen op basis van kWh-detectie.
// Body: { records: Array<{ umbId: number; kwh: number | null; includedInPrice: boolean }> }
// kwh: 15/20/30/40/60 = specifieke dienst; null = "vol" (€5)
// includedInPrice: true = EV-kosten zitten al in base_price (splits af), false = voeg toe bovenop
router.post('/admin/umbraco/add-ev-service', requireAuth, async (req: Request, res: Response) => {
  try {
    const { records } = req.body as {
      records: Array<{ umbId: number; kwh: number | null; includedInPrice: boolean }>
    };
    if (!Array.isArray(records) || records.length === 0) {
      return res.json({ updated: 0 });
    }

    // kWh → service ID + prijs (gedeelde constanten hergebruiken)
    const KWH_MAP = UMB_KWH_MAP;
    const EV_VOL  = UMB_EV_VOL;

    let updated = 0;
    for (const rec of records) {
      const ref = `DB-2026-U${rec.umbId}`;
      const rr = await query(
        `SELECT id, base_price, services_total, total_price FROM reservations WHERE reference=$1 AND status!='cancelled'`,
        [ref]
      );
      if (!rr.rows[0]) continue;
      const { id: resId, base_price } = rr.rows[0];

      const existing = await query(
        `SELECT rs.id FROM reservation_services rs WHERE rs.reservation_id=$1`,
        [resId]
      );
      // isOldScan = heeft al een service maar ev_kwh ontbreekt op het voertuig
      // (ook als ev_service_id zelf nog NULL is op vehicle — oude auto-detect sloeg dat niet op)
      const isOldScan = existing.rows.length > 0
        && await query(
            `SELECT 1 FROM vehicles v
             WHERE v.reservation_id=$1
               AND v.ev_kwh IS NULL`,
            [resId]
           ).then(r => r.rows.length > 0);

      // Skip alleen als er al een correcte service + ev_kwh op het voertuig staat
      if (existing.rows.length > 0 && !isOldScan) continue;
      // Als oud record en scan geeft nog steeds geen kWh → skip (vol blijft vol)
      if (isOldScan && !rec.kwh) continue;

      const svc = rec.kwh ? (KWH_MAP[rec.kwh] ?? EV_VOL) : EV_VOL;
      const vr = await query(`SELECT id FROM vehicles WHERE reservation_id=$1 ORDER BY sort_order LIMIT 1`, [resId]);
      const vehicleId = vr.rows[0]?.id ?? null;

      if (isOldScan) {
        // Overschrijf de bestaande "vol" service met de correcte kWh-dienst
        await query(
          `UPDATE reservation_services SET service_id=$2, unit_price=$3, total_price=$3,
           notes=$4, updated_at=NOW()
           WHERE reservation_id=$1`,
          [resId, svc.id, svc.price, `EV-scan: ${rec.kwh} kWh`]
        );
      } else {
        await query(
          `INSERT INTO reservation_services(reservation_id,service_id,vehicle_id,quantity,unit_price,total_price,notes)
           VALUES($1,$2,$3,1,$4,$4,$5) ON CONFLICT DO NOTHING`,
          [resId, svc.id, vehicleId, svc.price, `EV-scan: ${rec.kwh ? rec.kwh + ' kWh' : 'vol'}`]
        );
      }

      // OOK vehicles bijwerken zodat aankomstenlijst + enveloppe het tonen
      if (vehicleId) {
        await query(
          `UPDATE vehicles SET ev_service_id=$2, ev_kwh=$3, ev_price=$4 WHERE id=$1`,
          [vehicleId, svc.id, rec.kwh ?? null, svc.price]
        );
      }

      if (rec.includedInPrice) {
        // EV zat al in de prijs: splits base_price af, total blijft gelijk
        await query(
          `UPDATE reservations SET base_price=base_price-$2, services_total=$2, updated_at=NOW() WHERE id=$1`,
          [resId, svc.price]
        );
      } else {
        // EV was nog niet verwerkt: voeg toe bovenop
        await query(
          `UPDATE reservations SET services_total=$2, total_price=base_price+$2, updated_at=NOW() WHERE id=$1`,
          [resId, svc.price]
        );
      }
      updated++;
    }
    return res.json({ updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /admin/umbraco/import-batch
// Accepteert een array compact Umbraco-records die de BROWSER al heeft opgehaald.
// Zo hoeft het token nooit de browser te verlaten.
// Body: { records: CompactRecord[], dryRun?: boolean }
router.post('/admin/umbraco/import-batch', requireAuth, async (req: Request, res: Response) => {
  try {
    const { records, dryRun, umbracoToken: umbTok } = req.body as {
      umbracoToken?: string;
      records: Array<{
        id: number; name: string; email: string; phone: string; plate: string;
        arrival: string; departure: string;
        depH: number; depM: number; retH: number | null; retM: number | null;
        fast: boolean; price: number; paid: boolean; stripe: string | null;
        method: string | null; note: string; cancelled: boolean;
        evKwh?: number | null;   // expliciet opgegeven kWh (overschrijft items-detectie)
        items?: any[];           // Umbraco orderlines voor automatische EV-detectie
      }>;
      dryRun?: boolean;
    };

    if (umbTok?.trim()) {
      await query(
        `INSERT INTO settings (key, value) VALUES ('umbraco_token', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
        [umbTok.trim()]
      );
    }

    if (!Array.isArray(records) || records.length === 0) {
      return res.json({ imported: 0, cancelled: 0, skipped: 0, errors: 0, lastId: 0 });
    }

    const client = await getClient();
    let imported = 0, cancelled = 0, skipped = 0, errors = 0, lastId = 0;

    try {
      for (const d of records) {
        const ref = `DB-2026-U${d.id}`;
        if (d.id > lastId) lastId = d.id;

        try {
          const existing = await client.query('SELECT id, status FROM reservations WHERE reference=$1', [ref]);
          if (existing.rows.length > 0) {
            if (d.cancelled && existing.rows[0].status !== 'cancelled') {
              if (!dryRun) await client.query(`UPDATE reservations SET status='cancelled',updated_at=NOW() WHERE reference=$1`, [ref]);
              cancelled++;
            } else { skipped++; }
            continue;
          }

          if (dryRun) { imported++; continue; }

          await client.query('BEGIN');

          const rawEmail = (d.email || '').toLowerCase().trim();
          const email = rawEmail || `umbraco-${d.id}@noemail.local`;
          const { first, last } = umbSplitName(d.name);
          const custId = umbToUuid('c', d.id);

          await client.query(
            `INSERT INTO customers (id,first_name,last_name,email,phone,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
             ON CONFLICT (email) DO UPDATE SET
               first_name=CASE WHEN customers.first_name='' THEN EXCLUDED.first_name ELSE customers.first_name END,
               last_name =CASE WHEN customers.last_name=''  THEN EXCLUDED.last_name  ELSE customers.last_name  END,
               phone     =CASE WHEN customers.phone=''      THEN EXCLUDED.phone      ELSE customers.phone      END,
               updated_at=NOW()`,
            [custId, first, last, email, d.phone || '']
          );
          const cr = await client.query('SELECT id FROM customers WHERE email=$1', [email]);
          const actualCustId = cr.rows[0]?.id ?? custId;

          const outTimeRaw = (d.depH != null && d.depM != null) ? `${String(d.depH).padStart(2,'0')}:${String(d.depM).padStart(2,'0')}` : null;
          const retTime = (d.retH != null && d.retM != null) ? `${String(d.retH).padStart(2,'0')}:${String(d.retM).padStart(2,'0')}` : null;

          // Koppel aan werkelijke veerboottijd (binnen 30 min) zodat we de échte vertrektijd opslaan,
          // niet de Umbraco-invoer die soms afwijkt van de dienstregeling.
          let outDest: string | null = null;
          let outTime: string | null = outTimeRaw;
          if (outTimeRaw && d.arrival) {
            const dr = await client.query(
              `SELECT destination, TO_CHAR(departure_time, 'HH24:MI') AS dep_time
               FROM ferry_schedules
               WHERE schedule_date=$1 AND direction='outbound'
                 AND ABS(EXTRACT(EPOCH FROM (departure_time-$2::time))/60)<=30
               ORDER BY ABS(EXTRACT(EPOCH FROM (departure_time-$2::time))) LIMIT 1`,
              [d.arrival, outTimeRaw]
            );
            if (dr.rows[0]) {
              outDest = dr.rows[0].destination;
              outTime = dr.rows[0].dep_time; // gebruik werkelijke veerboottijd
            }
          }

          const resId     = umbToUuid('e', d.id);
          const status    = d.cancelled ? 'cancelled' : 'booked';
          const payStatus = d.paid ? 'paid' : 'pending';
          const payMethod = umbMapMethod(d.method) || (d.paid ? 'ideal' : null);
          const plateRaw  = (d.plate || '').replace(/[-\s]/g,'').toUpperCase();
          const plate     = plateRaw.length <= 12 ? plateRaw : '';

          await client.query(
            `INSERT INTO reservations (
               id,reference,customer_id,parking_lot_id,rate_id,
               status,payment_status,payment_method,stripe_payment_intent_id,
               arrival_date,departure_date,
               ferry_outbound_time,ferry_outbound_destination,is_fast_ferry_outbound,
               ferry_return_time,ferry_return_custom_time,ferry_return_custom,
               base_price,services_total,total_price,
               notes,admin_notes,created_at,updated_at
             ) VALUES (
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NULL,false,$16,0,$16,$17,$18,NOW(),NOW()
             ) ON CONFLICT (id) DO NOTHING`,
            [resId,ref,actualCustId,UMB_LOT_ID,UMB_RATE_ID,
             status,payStatus,payMethod,d.stripe||null,
             d.arrival,d.departure,outTime,outDest,d.fast||false,retTime,
             d.price||0,(d.note||'').trim(),`Import Umbraco #${d.id}`]
          );

          if (plate) {
            await client.query(
              `INSERT INTO vehicles(reservation_id,license_plate,ev_service_id,sort_order) VALUES($1,$2,NULL,0) ON CONFLICT DO NOTHING`,
              [resId, plate]
            );
          }

          // Auto-detect EV: expliciet evKwh > items-array > notitie
          const noteText = (d.note || '').toLowerCase();
          const explicitKwh = (d.evKwh != null && d.evKwh > 0) ? d.evKwh : null;
          const evDetected = explicitKwh ? null : umbDetectEv(d.items ?? [], noteText);
          const wantsCharging = explicitKwh != null || evDetected != null;
          if (wantsCharging && !d.cancelled) {
            const kwh = explicitKwh ?? evDetected?.kwh ?? null;
            const svc = kwh ? (UMB_KWH_MAP[kwh] ?? UMB_EV_VOL) : UMB_EV_VOL;

            // Zoek eerste voertuig van deze reservering
            const vr = await client.query(
              `SELECT id FROM vehicles WHERE reservation_id=$1 ORDER BY sort_order LIMIT 1`, [resId]
            );
            const vehicleId = vr.rows[0]?.id ?? null;

            await client.query(
              `INSERT INTO reservation_services(reservation_id,service_id,vehicle_id,quantity,unit_price,total_price,notes)
               VALUES($1,$2,$3,1,$4,$4,$5) ON CONFLICT DO NOTHING`,
              [resId, svc.id, vehicleId, svc.price,
               `Auto-import: ${kwh ? kwh + ' kWh' : 'vol laden'}`]
            );
            // Bijwerken vehicles zodat aankomstenlijst + enveloppe het tonen
            if (vehicleId) {
              await client.query(
                `UPDATE vehicles SET ev_service_id=$2, ev_kwh=$3, ev_price=$4 WHERE id=$1`,
                [vehicleId, svc.id, kwh ?? null, svc.price]
              );
            }
            // EV zit voor nieuwe boekingen al in de Umbraco-prijs (includedInPrice=true)
            // → split af van base_price, services_total apart
            await client.query(
              `UPDATE reservations SET base_price=base_price-$2, services_total=$2, updated_at=NOW() WHERE id=$1`,
              [resId, svc.price]
            );
          }

          await client.query('COMMIT');
          imported++;
        } catch (err: any) {
          await client.query('ROLLBACK').catch(()=>{});
          errors++;
        }
      }
    } finally {
      client.release();
    }

    if (!dryRun && lastId > 0) {
      await query(`INSERT INTO settings(key,value) VALUES('umbraco_last_sync_id',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, [String(lastId)]);
      await query(`INSERT INTO settings(key,value) VALUES('umbraco_last_sync_at',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, [new Date().toISOString()]);
    }

    return res.json({ imported, cancelled, skipped, errors, lastId, dryRun: !!dryRun });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /admin/umbraco/ev-repair-candidates
// Geeft lijst van EV-reserveringen die gecontroleerd moeten worden (browser fetcht Umbraco zelf).
// Bevat ook de services-tabel zodat het script de juiste service-ID kan opzoeken.
router.get('/admin/umbraco/ev-repair-candidates', requireAuth, async (_req: Request, res: Response) => {
  const [resResult, svcResult] = await Promise.all([
    query(`
      SELECT r.id as reservation_id, r.reference, r.total_price,
             v.id as vehicle_id, v.ev_service_id, v.ev_kwh, v.ev_price
      FROM reservations r
      JOIN vehicles v ON v.reservation_id = r.id
      WHERE r.reference ~ '^DB-2026-U\\d+$' AND r.status != 'cancelled'
        AND v.ev_service_id IS NOT NULL
      ORDER BY r.reference
    `),
    query(`SELECT id, name, kwh, price FROM services WHERE is_active = true AND kwh IS NOT NULL ORDER BY kwh`),
  ]);
  const candidates = resResult.rows.map(r => ({
    umbId: parseInt(r.reference.replace('DB-2026-U', '')),
    reference: r.reference,
    reservationId: r.reservation_id,
    vehicleId: r.vehicle_id,
    totalPrice: parseFloat(r.total_price),
    currentKwh: r.ev_kwh,
    currentPrice: parseFloat(r.ev_price ?? 0),
    currentSvcId: r.ev_service_id,
  }));
  const services = svcResult.rows.map(s => ({ id: s.id, kwh: s.kwh, price: parseFloat(s.price) }));
  return res.json({ candidates, services, count: candidates.length });
});

// POST /admin/umbraco/ev-repair-apply
// Ontvangt array van correcties (opgebouwd door browser-script) en past ze toe.
router.post('/admin/umbraco/ev-repair-apply', requireAuth, async (req: Request, res: Response) => {
  try {
    const { fixes, dryRun = false } = req.body as {
      fixes: Array<{ vehicleId: string; reservationId: string; kwh: number | null; price: number; svcId: string; totalPrice: number }>;
      dryRun?: boolean;
    };
    if (!Array.isArray(fixes)) return res.status(400).json({ error: 'fixes array verplicht' });

    let applied = 0;
    for (const f of fixes) {
      if (!dryRun) {
        await query(`UPDATE vehicles SET ev_service_id=$1, ev_kwh=$2, ev_price=$3 WHERE id=$4`,
          [f.svcId, f.kwh, f.price, f.vehicleId]);
        await query(`UPDATE reservations SET base_price=$1, services_total=$2, updated_at=NOW() WHERE id=$3`,
          [Math.max(0, f.totalPrice - f.price), f.price, f.reservationId]);
        applied++;
      }
    }
    return res.json({ dryRun, applied: dryRun ? fixes.length : applied });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /admin/umbraco/vehicle-repair-scan
// Scant bestaande Umbraco-reserveringen op ontbrekende voertuigen
// via tekst-heuristieken en prijsratio. Voegt lege voertuigen toe
// waar nodig. dryRun=true geeft alleen een rapport zonder wijzigingen.
// ============================================================
router.post('/admin/umbraco/vehicle-repair-scan', requireAuth, async (req: Request, res: Response) => {
  try {
    const { dryRun = false } = req.body as { dryRun?: boolean };

    const result = await query(
      `SELECT r.id, r.reference, r.arrival_date, r.departure_date,
              r.base_price, r.total_price, r.notes, r.admin_notes,
              COUNT(DISTINCT v.id)::int AS vehicle_count,
              COALESCE(SUM(rs.total_price), 0) AS actual_services_total,
              BOOL_OR(v.ev_service_id IS NOT NULL) AS has_ev
       FROM reservations r
       LEFT JOIN vehicles v ON v.reservation_id = r.id
       LEFT JOIN reservation_services rs ON rs.reservation_id = r.id
       WHERE r.reference ~ '^DB-2026-U\\d+$'
         AND r.status != 'cancelled'
       GROUP BY r.id, r.reference, r.arrival_date, r.departure_date,
                r.base_price, r.total_price, r.notes, r.admin_notes
       ORDER BY r.arrival_date DESC`,
      []
    );

    // Laad alle tarieven met hun geldigheidsperiode + dagprijzen
    const ratesResult = await query(
      `SELECT r.id, r.valid_from, r.valid_until,
              json_object_agg(dp.day_number, dp.price::float) AS day_prices
       FROM rates r
       JOIN rate_day_prices dp ON dp.rate_id = r.id
       WHERE r.is_active = true
       GROUP BY r.id, r.valid_from, r.valid_until
       ORDER BY r.valid_from`,
      []
    );
    const allRates: { id: string; validFrom: Date; validUntil: Date; dayPrices: Record<number, number> }[] =
      ratesResult.rows.map((r: any) => ({
        id: r.id,
        validFrom: new Date(r.valid_from),
        validUntil: new Date(r.valid_until),
        dayPrices: r.day_prices,
      }));

    function getDayPrice(arrivalDate: string, nights: number): number {
      const arrival = new Date(arrivalDate);
      const rate = allRates.find(r => arrival >= r.validFrom && arrival <= r.validUntil)
        ?? allRates.find(r => r.id === UMB_RATE_ID); // fallback
      if (!rate) return 0;
      // Umbraco telde dagen incl. aankomstdag → day_number = nights + 1
      return parseFloat(String(rate.dayPrices[Math.min(nights + 1, 30)] ?? 0));
    }

    const client = await getClient();
    const flagged: any[] = [];
    let repairedCount = 0;

    try {
      for (const row of result.rows) {
        const currentCount: number = row.vehicle_count || 1;
        const noteText = ((row.notes || '') + ' ' + (row.admin_notes || '')).toLowerCase();
        const totalPrice = parseFloat(row.total_price) || 0;
        const servicesTotal = parseFloat(row.actual_services_total) || 0;
        const parkingPrice = Math.max(0, totalPrice - servicesTotal);

        let detectedCount = currentCount;
        let reason = '';

        // Tekst-detectie
        const autoMatch = noteText.match(/(\d+)\s*(auto|voertuig|car|plaats)/);
        if (autoMatch) {
          const n = parseInt(autoMatch[1]);
          if (n > detectedCount) { detectedCount = n; reason = `tekst: "${autoMatch[0].trim()}"`; }
        }

        // Prijsratio: alleen inzetten als er nu precies 1 voertuig is
        // Bij 2+ voertuigen vertrouwen we erop dat eerdere import al correct was
        // Skip ratio when EV service present: can't reliably split EV cost from parking
        if (currentCount === 1 && detectedCount <= 1 && !row.has_ev && parkingPrice > 0 && row.arrival_date && row.departure_date) {
          const nights = Math.round(
            (new Date(row.departure_date).getTime() - new Date(row.arrival_date).getTime()) / 86400000
          );
          const singlePrice = getDayPrice(row.arrival_date, nights);
          if (singlePrice > 0) {
            const ratio = parkingPrice / singlePrice;
            if (ratio >= 1.7) {
              const estimated = Math.min(Math.round(ratio), 6);
              if (estimated > detectedCount) {
                detectedCount = estimated;
                reason = `prijsratio ${ratio.toFixed(2)}× (€${parkingPrice.toFixed(0)} / €${singlePrice.toFixed(0)})`;
              }
            }
          }
        }

        if (detectedCount <= currentCount) continue;

        const toAdd = detectedCount - currentCount;
        flagged.push({
          reference: row.reference,
          arrival: row.arrival_date,
          currentVehicles: currentCount,
          detectedVehicles: detectedCount,
          toAdd,
          reason,
          totalPrice,
        });

        if (!dryRun) {
          for (let vi = currentCount; vi < detectedCount; vi++) {
            await client.query(
              `INSERT INTO vehicles (reservation_id, license_plate, sort_order) VALUES ($1, '', $2)`,
              [row.id, vi]
            );
          }
          repairedCount++;
        }
      }
    } finally {
      client.release();
    }

    return res.json({ dryRun, scanned: result.rows.length, flaggedCount: flagged.length, repairedCount, flagged });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Contract-klanten ────────────────────────────────────────────

// Idempotente kolom-migraties voor seizoenstarief
(async () => {
  try {
    await query(`ALTER TABLE contract_customers ADD COLUMN IF NOT EXISTS low_season_rate NUMERIC(10,2) DEFAULT 0`);
    await query(`ALTER TABLE contract_customers ADD COLUMN IF NOT EXISTS high_season_rate NUMERIC(10,2) DEFAULT 0`);
    await query(`ALTER TABLE contract_customers ADD COLUMN IF NOT EXISTS high_season_from VARCHAR(5) DEFAULT '04-01'`);
    await query(`ALTER TABLE contract_customers ADD COLUMN IF NOT EXISTS high_season_until VARCHAR(5) DEFAULT '09-30'`);
  } catch (_) { /* ignore */ }
})();

router.get('/admin/contract-customers', requireAuth, async (_req, res) => {
  const r = await query(
    `SELECT cc.*,
       (SELECT COUNT(*) FROM contract_invoices ci WHERE ci.contract_customer_id = cc.id) as invoice_count
     FROM contract_customers cc
     ORDER BY cc.is_active DESC, cc.name ASC`
  );
  return res.json(r.rows);
});

router.post('/admin/contract-customers', requireAuth, async (req: Request, res: Response) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Naam is verplicht' });
  const r = await query(
    `INSERT INTO contract_customers
     (name, company, email, phone, address, postal_code, city, btw_number,
      daily_rate, vat_percentage, notes, is_active,
      rate_type, fixed_period_days, fixed_period_rate, extra_day_rate,
      low_season_rate, high_season_rate, high_season_from, high_season_until)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12, true),$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [b.name, b.company || null, b.email || null, b.phone || null, b.address || null,
     b.postal_code || null, b.city || null, b.btw_number || null,
     b.daily_rate ?? 10, b.vat_percentage ?? 21, b.notes || null, b.is_active,
     b.rate_type || 'daily', b.fixed_period_days ?? 2, b.fixed_period_rate ?? 0, b.extra_day_rate ?? 0,
     b.low_season_rate ?? 0, b.high_season_rate ?? 0, b.high_season_from || '04-01', b.high_season_until || '09-30']
  );
  return res.json(r.rows[0]);
});

router.put('/admin/contract-customers/:id', requireAuth, async (req: Request, res: Response) => {
  const b = req.body || {};
  const r = await query(
    `UPDATE contract_customers SET
       name = COALESCE($2, name),
       company = $3,
       email = $4,
       phone = $5,
       address = $6,
       postal_code = $7,
       city = $8,
       btw_number = $9,
       daily_rate = COALESCE($10, daily_rate),
       vat_percentage = COALESCE($11, vat_percentage),
       notes = $12,
       is_active = COALESCE($13, is_active),
       rate_type = COALESCE($14, rate_type),
       fixed_period_days = COALESCE($15, fixed_period_days),
       fixed_period_rate = COALESCE($16, fixed_period_rate),
       extra_day_rate = COALESCE($17, extra_day_rate),
       low_season_rate = COALESCE($18, low_season_rate),
       high_season_rate = COALESCE($19, high_season_rate),
       high_season_from = COALESCE($20, high_season_from),
       high_season_until = COALESCE($21, high_season_until)
     WHERE id = $1 RETURNING *`,
    [req.params.id, b.name, b.company || null, b.email || null, b.phone || null,
     b.address || null, b.postal_code || null, b.city || null, b.btw_number || null,
     b.daily_rate, b.vat_percentage, b.notes || null, b.is_active,
     b.rate_type || null, b.fixed_period_days ?? null, b.fixed_period_rate ?? null, b.extra_day_rate ?? null,
     b.low_season_rate ?? null, b.high_season_rate ?? null, b.high_season_from || null, b.high_season_until || null]
  );
  if (r.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  return res.json(r.rows[0]);
});

router.delete('/admin/contract-customers/:id', requireAuth, async (req: Request, res: Response) => {
  const used = await query('SELECT COUNT(*)::int as n FROM contract_invoices WHERE contract_customer_id = $1', [req.params.id]);
  if (used.rows[0].n > 0) {
    await query('UPDATE contract_customers SET is_active = false WHERE id = $1', [req.params.id]);
    return res.json({ deactivated: true });
  }
  await query('DELETE FROM contract_customers WHERE id = $1', [req.params.id]);
  return res.json({ deleted: true });
});

// ── Day-entries (dagelijkse auto-telling, voor 'daily' klanten) ──

router.get('/admin/contract-customers/:id/entries', requireAuth, async (req: Request, res: Response) => {
  const { from, to } = req.query as Record<string, string>;
  if (!from || !to) return res.status(400).json({ error: 'from en to verplicht' });
  const r = await query(
    `SELECT to_char(entry_date, 'YYYY-MM-DD') AS entry_date, car_count, notes
     FROM contract_day_entries
     WHERE contract_customer_id = $1 AND entry_date BETWEEN $2 AND $3
     ORDER BY entry_date ASC`,
    [req.params.id, from, to]
  );
  return res.json(r.rows);
});

router.put('/admin/contract-customers/:id/entries', requireAuth, async (req: Request, res: Response) => {
  const entries = (req.body?.entries || []) as { date: string; car_count: number; notes?: string }[];
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries[] verwacht' });
  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const e of entries) {
      if (!e.date) continue;
      const cars = Math.max(0, Math.round(Number(e.car_count) || 0));
      if (cars === 0 && !e.notes) {
        await client.query(
          'DELETE FROM contract_day_entries WHERE contract_customer_id = $1 AND entry_date = $2',
          [req.params.id, e.date]
        );
      } else {
        await client.query(
          `INSERT INTO contract_day_entries (contract_customer_id, entry_date, car_count, notes)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (contract_customer_id, entry_date)
           DO UPDATE SET car_count = EXCLUDED.car_count, notes = EXCLUDED.notes`,
          [req.params.id, e.date, cars, e.notes || null]
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return res.json({ ok: true });
});

// ── Vehicle-stays (kenteken-verblijven, voor 'fixed_period' klanten) ──

router.get('/admin/contract-customers/:id/vehicle-stays', requireAuth, async (req: Request, res: Response) => {
  const { from, to } = req.query as Record<string, string>;
  if (!from || !to) return res.status(400).json({ error: 'from en to verplicht' });
  // Alle stays die overlappen met [from, to]
  const r = await query(
    `SELECT id,
       license_plate,
       to_char(arrival_date, 'YYYY-MM-DD') AS arrival_date,
       to_char(departure_date, 'YYYY-MM-DD') AS departure_date,
       notes
     FROM contract_vehicle_stays
     WHERE contract_customer_id = $1
       AND arrival_date <= $3 AND departure_date >= $2
     ORDER BY arrival_date ASC, license_plate ASC`,
    [req.params.id, from, to]
  );
  return res.json(r.rows);
});

router.post('/admin/contract-customers/:id/vehicle-stays', requireAuth, async (req: Request, res: Response) => {
  const b = req.body || {};
  if (!b.license_plate || !b.arrival_date || !b.departure_date) {
    return res.status(400).json({ error: 'license_plate, arrival_date en departure_date zijn verplicht' });
  }
  const r = await query(
    `INSERT INTO contract_vehicle_stays
       (contract_customer_id, license_plate, arrival_date, departure_date, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, license_plate,
       to_char(arrival_date, 'YYYY-MM-DD') AS arrival_date,
       to_char(departure_date, 'YYYY-MM-DD') AS departure_date,
       notes`,
    [req.params.id, (b.license_plate as string).toUpperCase().replace(/\s/g, '-'),
     b.arrival_date, b.departure_date, b.notes || null]
  );
  return res.status(201).json(r.rows[0]);
});

router.put('/admin/contract-vehicle-stays/:id', requireAuth, async (req: Request, res: Response) => {
  const b = req.body || {};
  const r = await query(
    `UPDATE contract_vehicle_stays SET
       license_plate = COALESCE($2, license_plate),
       arrival_date  = COALESCE($3, arrival_date),
       departure_date = COALESCE($4, departure_date),
       notes = $5
     WHERE id = $1
     RETURNING id, license_plate,
       to_char(arrival_date, 'YYYY-MM-DD') AS arrival_date,
       to_char(departure_date, 'YYYY-MM-DD') AS departure_date,
       notes`,
    [req.params.id,
     b.license_plate ? (b.license_plate as string).toUpperCase().replace(/\s/g, '-') : null,
     b.arrival_date || null, b.departure_date || null, b.notes ?? null]
  );
  if (r.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  return res.json(r.rows[0]);
});

router.delete('/admin/contract-vehicle-stays/:id', requireAuth, async (req: Request, res: Response) => {
  const r = await query('DELETE FROM contract_vehicle_stays WHERE id = $1 RETURNING id', [req.params.id]);
  if (r.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  return res.json({ deleted: true });
});

// ── Factuur preview + definitief (beide tarieftypes) ────────────

function calcVehicleStayPrice(
  stay: { arrival_date: string; departure_date: string },
  fixedPeriodDays: number, fixedPeriodRate: number, extraDayRate: number
): { days: number; price: number; calc: string } {
  const ms = new Date(stay.departure_date + 'T12:00:00').getTime()
           - new Date(stay.arrival_date   + 'T12:00:00').getTime();
  // Kalenderdagen = nachten + 1 (aankomst én vertrekdag tellen mee)
  const days = Math.max(1, Math.round(ms / 86400000) + 1);
  let price: number;
  let calc: string;
  if (days <= fixedPeriodDays) {
    price = fixedPeriodRate;
    calc = `${days} dag${days > 1 ? 'en' : ''} (basisperiode)`;
  } else {
    const extra = days - fixedPeriodDays;
    price = fixedPeriodRate + extra * extraDayRate;
    calc = `${fixedPeriodDays} dg. basis + ${extra} extra dg.`;
  }
  return { days, price, calc };
}

router.post('/admin/contract-customers/:id/invoice-preview', requireAuth, async (req: Request, res: Response) => {
  const { from, to, evLines } = req.body || {};
  if (!from || !to) return res.status(400).json({ error: 'from en to verplicht' });
  const c = await query('SELECT * FROM contract_customers WHERE id = $1', [req.params.id]);
  if (c.rows.length === 0) return res.status(404).json({ error: 'Klant niet gevonden' });
  const customer = c.rows[0];
  const rateType = customer.rate_type || 'daily';

  const parsedEvLines = Array.isArray(evLines)
    ? evLines.map((l: any) => ({ description: String(l.description || ''), kwh: Number(l.kwh) || 0, ratePerKwh: Number(l.ratePerKwh) || 0 }))
    : [];

  let pdf: Buffer;

  if (rateType === 'fixed_period') {
    const staysResult = await query(
      `SELECT license_plate,
         to_char(arrival_date, 'YYYY-MM-DD') AS arrival_date,
         to_char(departure_date, 'YYYY-MM-DD') AS departure_date,
         notes
       FROM contract_vehicle_stays
       WHERE contract_customer_id = $1
         AND arrival_date <= $3 AND departure_date >= $2
       ORDER BY arrival_date ASC, license_plate ASC`,
      [req.params.id, from, to]
    );
    pdf = await generateContractInvoicePdf({
      customer,
      periodFrom: from, periodTo: to,
      invoiceNumber: 'VOORBEELD',
      rateType: 'fixed_period',
      fixedPeriodDays: parseInt(customer.fixed_period_days) || 2,
      fixedPeriodRate: parseFloat(customer.fixed_period_rate) || 0,
      extraDayRate: parseFloat(customer.extra_day_rate) || 0,
      vehicleStays: staysResult.rows,
      rows: [],
      dailyRate: 0,
      vatPercentage: parseFloat(customer.vat_percentage),
      evLines: parsedEvLines,
      isPreview: true,
    });
  } else if (rateType === 'seasonal') {
    const e = await query(
      `SELECT to_char(entry_date, 'YYYY-MM-DD') AS entry_date, car_count
       FROM contract_day_entries
       WHERE contract_customer_id = $1 AND entry_date BETWEEN $2 AND $3 AND car_count > 0
       ORDER BY entry_date ASC`,
      [req.params.id, from, to]
    );
    const rows = e.rows.map((r: any) => ({ date: String(r.entry_date).slice(0, 10), car_count: Number(r.car_count) }));
    pdf = await generateContractInvoicePdf({
      customer, periodFrom: from, periodTo: to,
      invoiceNumber: 'VOORBEELD',
      rateType: 'seasonal',
      rows,
      dailyRate: 0,
      lowSeasonRate: parseFloat(customer.low_season_rate) || 0,
      highSeasonRate: parseFloat(customer.high_season_rate) || 0,
      highSeasonFrom: customer.high_season_from || '04-01',
      highSeasonUntil: customer.high_season_until || '09-30',
      vatPercentage: parseFloat(customer.vat_percentage),
      evLines: parsedEvLines,
      isPreview: true,
    });
  } else {
    const e = await query(
      `SELECT to_char(entry_date, 'YYYY-MM-DD') AS entry_date, car_count
       FROM contract_day_entries
       WHERE contract_customer_id = $1 AND entry_date BETWEEN $2 AND $3 AND car_count > 0
       ORDER BY entry_date ASC`,
      [req.params.id, from, to]
    );
    const rows = e.rows.map((r: any) => ({ date: String(r.entry_date).slice(0, 10), car_count: Number(r.car_count) }));
    pdf = await generateContractInvoicePdf({
      customer, periodFrom: from, periodTo: to,
      invoiceNumber: 'VOORBEELD',
      rows,
      dailyRate: parseFloat(customer.daily_rate),
      vatPercentage: parseFloat(customer.vat_percentage),
      evLines: parsedEvLines,
      isPreview: true,
    });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Voorbeeld-factuur.pdf"`);
  return res.send(pdf);
});

router.post('/admin/contract-customers/:id/invoice', requireAuth, async (req: Request, res: Response) => {
  const { from, to, evLines } = req.body || {};
  if (!from || !to) return res.status(400).json({ error: 'from en to verplicht' });
  const c = await query('SELECT * FROM contract_customers WHERE id = $1', [req.params.id]);
  if (c.rows.length === 0) return res.status(404).json({ error: 'Klant niet gevonden' });
  const customer = c.rows[0];
  const rateType = customer.rate_type || 'daily';
  const vatPct = parseFloat(customer.vat_percentage);
  const invoiceNumber = await generateNextContractInvoiceNumber();

  const parsedEvLines = Array.isArray(evLines)
    ? evLines.map((l: any) => ({ description: String(l.description || ''), kwh: Number(l.kwh) || 0, ratePerKwh: Number(l.ratePerKwh) || 0 }))
    : [];
  const evTotal = parsedEvLines.reduce((s: number, l: any) => s + l.kwh * l.ratePerKwh, 0);

  let totalCars: number, subtotalIncl: number, subtotalExcl: number, vatAmount: number;
  let snapshot: any;

  if (rateType === 'fixed_period') {
    const fixedPeriodDays = parseInt(customer.fixed_period_days) || 2;
    const fixedPeriodRate = parseFloat(customer.fixed_period_rate) || 0;
    const extraDayRate = parseFloat(customer.extra_day_rate) || 0;

    const staysResult = await query(
      `SELECT license_plate,
         to_char(arrival_date, 'YYYY-MM-DD') AS arrival_date,
         to_char(departure_date, 'YYYY-MM-DD') AS departure_date,
         notes
       FROM contract_vehicle_stays
       WHERE contract_customer_id = $1
         AND arrival_date <= $3 AND departure_date >= $2
       ORDER BY arrival_date ASC, license_plate ASC`,
      [req.params.id, from, to]
    );
    if (staysResult.rows.length === 0) return res.status(400).json({ error: 'Geen kentekens in deze periode' });

    totalCars = staysResult.rows.length;
    subtotalIncl = staysResult.rows.reduce((s: number, stay: any) => {
      return s + calcVehicleStayPrice(stay, fixedPeriodDays, fixedPeriodRate, extraDayRate).price;
    }, 0);
    subtotalIncl += evTotal;
    subtotalExcl = Math.round((subtotalIncl / (1 + vatPct / 100)) * 100) / 100;
    vatAmount = Math.round((subtotalIncl - subtotalExcl) * 100) / 100;

    snapshot = {
      customer: {
        name: customer.name, company: customer.company, email: customer.email,
        address: customer.address, postal_code: customer.postal_code, city: customer.city,
        btw_number: customer.btw_number,
      },
      rateType: 'fixed_period',
      fixed_period_days: fixedPeriodDays,
      fixed_period_rate: fixedPeriodRate,
      extra_day_rate: extraDayRate,
      vehicle_stays: staysResult.rows,
      vat_percentage: vatPct,
      rows: [],
      ev_lines: parsedEvLines,
    };
  } else if (rateType === 'seasonal') {
    const lowSeasonRate  = parseFloat(customer.low_season_rate)  || 0;
    const highSeasonRate = parseFloat(customer.high_season_rate) || 0;
    const highSeasonFrom  = customer.high_season_from  || '04-01';
    const highSeasonUntil = customer.high_season_until || '09-30';

    const e = await query(
      `SELECT to_char(entry_date, 'YYYY-MM-DD') AS entry_date, car_count
       FROM contract_day_entries
       WHERE contract_customer_id = $1 AND entry_date BETWEEN $2 AND $3 AND car_count > 0
       ORDER BY entry_date ASC`,
      [req.params.id, from, to]
    );
    const rows = e.rows.map((r: any) => ({ date: String(r.entry_date).slice(0, 10), car_count: Number(r.car_count) }));
    if (rows.length === 0 && parsedEvLines.length === 0) return res.status(400).json({ error: 'Geen auto\'s in deze periode' });

    totalCars = rows.reduce((s: number, r: any) => s + r.car_count, 0);

    // Bereken seizoenstotaal
    let highCars = 0, lowCars = 0;
    for (const r of rows) {
      const mmdd = r.date.slice(5, 10);
      const inHigh = highSeasonFrom <= highSeasonUntil
        ? mmdd >= highSeasonFrom && mmdd <= highSeasonUntil
        : mmdd >= highSeasonFrom || mmdd <= highSeasonUntil;
      if (inHigh) highCars += r.car_count; else lowCars += r.car_count;
    }
    subtotalIncl = highCars * highSeasonRate + lowCars * lowSeasonRate + evTotal;
    subtotalExcl = Math.round((subtotalIncl / (1 + vatPct / 100)) * 100) / 100;
    vatAmount = Math.round((subtotalIncl - subtotalExcl) * 100) / 100;

    snapshot = {
      customer: {
        name: customer.name, company: customer.company, email: customer.email,
        address: customer.address, postal_code: customer.postal_code, city: customer.city,
        btw_number: customer.btw_number,
      },
      rateType: 'seasonal',
      rows,
      low_season_rate: lowSeasonRate,
      high_season_rate: highSeasonRate,
      high_season_from: highSeasonFrom,
      high_season_until: highSeasonUntil,
      vat_percentage: vatPct,
      ev_lines: parsedEvLines,
    };
  } else {
    const dailyRate = parseFloat(customer.daily_rate);
    const e = await query(
      `SELECT to_char(entry_date, 'YYYY-MM-DD') AS entry_date, car_count
       FROM contract_day_entries
       WHERE contract_customer_id = $1 AND entry_date BETWEEN $2 AND $3 AND car_count > 0
       ORDER BY entry_date ASC`,
      [req.params.id, from, to]
    );
    const rows = e.rows.map((r: any) => ({ date: String(r.entry_date).slice(0, 10), car_count: Number(r.car_count) }));
    if (rows.length === 0 && parsedEvLines.length === 0) return res.status(400).json({ error: 'Geen auto\'s in deze periode' });

    totalCars = rows.reduce((s: number, r: any) => s + r.car_count, 0);
    subtotalIncl = rows.reduce((s: number, r: any) => s + r.car_count * dailyRate, 0) + evTotal;
    subtotalExcl = Math.round((subtotalIncl / (1 + vatPct / 100)) * 100) / 100;
    vatAmount = Math.round((subtotalIncl - subtotalExcl) * 100) / 100;

    snapshot = {
      customer: {
        name: customer.name, company: customer.company, email: customer.email,
        address: customer.address, postal_code: customer.postal_code, city: customer.city,
        btw_number: customer.btw_number,
      },
      rows, daily_rate: dailyRate, vat_percentage: vatPct, ev_lines: parsedEvLines,
    };
  }

  await query(
    `INSERT INTO contract_invoices
     (invoice_number, contract_customer_id, period_from, period_to,
      daily_rate, vat_percentage, total_cars,
      subtotal_excl_vat, vat_amount, total_incl_vat, snapshot)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [invoiceNumber, req.params.id, from, to,
     rateType === 'fixed_period' ? 0 : rateType === 'seasonal' ? 0 : parseFloat(customer.daily_rate),
     vatPct, totalCars, subtotalExcl, vatAmount, subtotalIncl, JSON.stringify(snapshot)]
  );

  return res.json({ invoice_number: invoiceNumber, total_cars: totalCars, total_incl_vat: subtotalIncl });
});

// ── Contract-facturen beheer ─────────────────────────────────────

router.get('/admin/contract-invoices', requireAuth, async (req: Request, res: Response) => {
  const { customer_id } = req.query as Record<string, string>;
  const params: unknown[] = [];
  let where = '';
  if (customer_id) {
    where = 'WHERE ci.contract_customer_id = $1';
    params.push(customer_id);
  }
  const r = await query(
    `SELECT ci.id, ci.invoice_number, ci.contract_customer_id, ci.period_from, ci.period_to,
            ci.total_cars, ci.subtotal_excl_vat, ci.vat_amount, ci.total_incl_vat, ci.created_at,
            cc.name as customer_name, cc.company as customer_company
     FROM contract_invoices ci
     JOIN contract_customers cc ON cc.id = ci.contract_customer_id
     ${where}
     ORDER BY ci.created_at DESC LIMIT 200`,
    params
  );
  return res.json(r.rows);
});

router.get('/admin/contract-invoices/:id/pdf', requireAuth, async (req: Request, res: Response) => {
  const r = await query('SELECT * FROM contract_invoices WHERE id = $1', [req.params.id]);
  if (r.rows.length === 0) return res.status(404).json({ error: 'Factuur niet gevonden' });
  const inv = r.rows[0];
  const snap = typeof inv.snapshot === 'string' ? JSON.parse(inv.snapshot) : inv.snapshot;

  const pdf = await generateContractInvoicePdf({
    customer: snap.customer,
    periodFrom: String(inv.period_from).slice(0, 10),
    periodTo: String(inv.period_to).slice(0, 10),
    invoiceNumber: inv.invoice_number,
    invoiceDate: String(inv.created_at).slice(0, 10),
    rateType: snap.rateType || 'daily',
    fixedPeriodDays: snap.fixed_period_days,
    fixedPeriodRate: snap.fixed_period_rate,
    extraDayRate: snap.extra_day_rate,
    vehicleStays: snap.vehicle_stays,
    rows: snap.rows || [],
    dailyRate: parseFloat(snap.daily_rate) || 0,
    vatPercentage: parseFloat(snap.vat_percentage),
    lowSeasonRate: parseFloat(snap.low_season_rate) || 0,
    highSeasonRate: parseFloat(snap.high_season_rate) || 0,
    highSeasonFrom: snap.high_season_from,
    highSeasonUntil: snap.high_season_until,
    evLines: snap.ev_lines,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Factuur-${inv.invoice_number}.pdf"`);
  return res.send(pdf);
});

router.delete('/admin/contract-invoices/:id', requireAuth, async (req: Request, res: Response) => {
  const r = await query('DELETE FROM contract_invoices WHERE id = $1 RETURNING id', [req.params.id]);
  if (r.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  return res.json({ deleted: true });
});
