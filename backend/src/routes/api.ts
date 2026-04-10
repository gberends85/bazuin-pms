import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { query, getClient } from '../db/pool';
import {
  calculatePrice, calculateRefund, generateReference,
} from '../services/pricing.service';
import { lookupRdw, normalizePlate } from '../services/rdw.service';
import {
  sendBookingConfirmation, sendCheckinMail, sendCancellationMail, sendModificationMail,
} from '../services/email.service';
import {
  createPaymentIntent, processRefund,
} from '../services/stripe.service';
import {
  requireAuth, requireAdminRole,
  signAccessToken, signRefreshToken, verifyRefreshToken,
} from '../middleware/auth';
import { syncDoeksenSchedule, syncDoeksenScheduleDays } from '../services/doeksen.service';

export const router = Router();

// ============================================================
// HEALTH
// ============================================================
router.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

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

  // Count overlapping reservations (night-based overlap)
  const bookedResult = await query(
    `SELECT COUNT(DISTINCT v.id) as booked_vehicles
     FROM reservations r
     JOIN vehicles v ON v.reservation_id = r.id
     WHERE r.parking_lot_id = $1
       AND r.status NOT IN ('cancelled')
       AND r.arrival_date < $3
       AND r.departure_date > $2`,
    [lot.id, arrival, departure]
  );

  const booked = parseInt(bookedResult.rows[0].booked_vehicles) || 0;

  // Check manual override for arrival date
  const overrideResult = await query(
    'SELECT available_spots FROM availability_overrides WHERE parking_lot_id = $1 AND override_date = $2',
    [lot.id, arrival]
  );

  const maxAvailable = overrideResult.rows.length > 0
    ? overrideResult.rows[0].available_spots
    : lot.online_spots;

  const available = Math.max(0, maxAvailable - booked);

  return res.json({
    available,
    total: lot.online_spots,
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
    const bookedResult = await client.query(
      `SELECT COUNT(DISTINCT v.id) as booked
       FROM reservations r
       JOIN vehicles v ON v.reservation_id = r.id
       WHERE r.parking_lot_id = $1
         AND r.status NOT IN ('cancelled')
         AND r.arrival_date < $3
         AND r.departure_date > $2`,
      [lotId, data.arrivalDate, data.departureDate]
    );

    const lotResult = await client.query(
      `SELECT l.online_spots FROM parking_lots pl JOIN locations l ON l.id = pl.location_id WHERE pl.id = $1`, [lotId]
    );

    const available = lotResult.rows[0].online_spots - parseInt(bookedResult.rows[0].booked);
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
        'booked',$5,$6,
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

    // Send confirmation email (async)
    sendBookingConfirmation(reservation.id).catch(err =>
      console.error('Booking email failed:', err)
    );

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

  const refundInfo = await calculateRefund(
    new Date(res2.arrival_date), parseFloat(res2.total_price)
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

  const [arrivalsResult, departuresResult, occupancyResult, revenueResult] = await Promise.all([
    query(`SELECT COUNT(*) as count FROM reservations WHERE arrival_date = $1 AND status NOT IN ('cancelled')`, [today]),
    query(`SELECT COUNT(*) as count FROM reservations WHERE departure_date = $1 AND status = 'checked_in'`, [today]),
    query(`SELECT COUNT(DISTINCT v.id) as count FROM reservations r JOIN vehicles v ON v.reservation_id = r.id WHERE r.status = 'checked_in'`, []),
    query(`SELECT COALESCE(SUM(total_price),0) as total FROM reservations WHERE DATE(created_at) = $1 AND payment_status IN ('paid','on_site')`, [today]),
  ]);

  return res.json({
    arrivalsToday: parseInt(arrivalsResult.rows[0].count),
    departuresToday: parseInt(departuresResult.rows[0].count),
    currentOccupancy: parseInt(occupancyResult.rows[0].count),
    totalCapacity: 55,
    revenueToday: parseFloat(revenueResult.rows[0].total),
  });
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
    where += ` AND (c.first_name ILIKE $${i} OR c.last_name ILIKE $${i} OR r.reference ILIKE $${i} OR EXISTS (SELECT 1 FROM vehicles v WHERE v.reservation_id = r.id AND v.license_plate ILIKE $${i}))`;
    params.push(`%${search}%`); i++;
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT r.*, c.first_name, c.last_name, c.email, c.phone,
              (SELECT string_agg(v.license_plate, ', ') FROM vehicles v WHERE v.reservation_id = r.id) as plates,
              (SELECT COUNT(*) FROM vehicles v WHERE v.reservation_id = r.id) as vehicle_count
       FROM reservations r
       JOIN customers c ON c.id = r.customer_id
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

  const [arrivals, departures] = await Promise.all([
    query(
      `SELECT r.*, c.first_name, c.last_name, c.email, c.phone,
              (SELECT string_agg(v.license_plate, ', ') FROM vehicles v WHERE v.reservation_id = r.id) as plates,
              (SELECT COUNT(*) FROM vehicles v WHERE v.reservation_id = r.id) as vehicle_count,
              (SELECT bool_or(ev_kwh IS NOT NULL) FROM vehicles v WHERE v.reservation_id = r.id) as has_ev,
              (SELECT COALESCE(SUM(ev_kwh), 0) FROM vehicles v WHERE v.reservation_id = r.id) as ev_kwh_total,
              (SELECT rdw_color FROM vehicles v WHERE v.reservation_id = r.id ORDER BY sort_order LIMIT 1) as rdw_color,
              (SELECT rdw_make FROM vehicles v WHERE v.reservation_id = r.id ORDER BY sort_order LIMIT 1) as rdw_make,
              (SELECT rdw_model FROM vehicles v WHERE v.reservation_id = r.id ORDER BY sort_order LIMIT 1) as rdw_model,
              f_out.name as ferry_outbound_name,
              f_out.duration_min as ferry_outbound_duration,
              f_ret.name as ferry_return_name,
              f_ret.duration_min as ferry_return_duration
       FROM reservations r
       JOIN customers c ON c.id = r.customer_id
       LEFT JOIN ferries f_out ON f_out.id = r.ferry_outbound_id
       LEFT JOIN ferries f_ret ON f_ret.id = r.ferry_return_id
       WHERE r.arrival_date = $1 AND r.status NOT IN ('cancelled')
       ORDER BY r.ferry_outbound_time ASC NULLS LAST, r.created_at ASC`,
      [date]
    ),
    query(
      `SELECT r.*, c.first_name, c.last_name, c.email, c.phone,
              (SELECT string_agg(v.license_plate, ', ') FROM vehicles v WHERE v.reservation_id = r.id) as plates,
              f.name as ferry_return_name,
              f.duration_min as ferry_return_duration
       FROM reservations r
       JOIN customers c ON c.id = r.customer_id
       LEFT JOIN ferries f ON f.id = r.ferry_return_id
       WHERE r.departure_date = $1 AND r.status = 'checked_in'
       ORDER BY r.ferry_return_time ASC NULLS LAST`,
      [date]
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
      ? addMinutes(r.ferry_return_time.slice(0, 5), r.ferry_return_duration)
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
      `SELECT r.*, c.first_name, c.last_name, c.email, c.phone, c.btw_number,
              f_out.name as ferry_outbound_name, f_out.duration_min as ferry_outbound_duration,
              f_ret.name as ferry_return_name,  f_ret.duration_min as ferry_return_duration
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
    ferry_return_arrival_harlingen: r.ferry_return_time ? addMin(r.ferry_return_time, r.ferry_return_duration) : null,
  };

  return res.json({ ...row, vehicles: vehiclesResult.rows });
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

  const phone = result.rows[0].phone?.replace(/[\s+\-()]/g, '') || '';
  const encodedMsg = encodeURIComponent(message || '');
  const waLink = `https://wa.me/${phone}?text=${encodedMsg}`;

  return res.json({ waLink, phone });
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
     SELECT ds.d as date,
            db.booked,
            COALESCE(o.available_spots, l.online_spots) as max_available,
            GREATEST(0, COALESCE(o.available_spots, l.online_spots) - db.booked) as available
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
  const { date, availableSpots, reason, lotId } = req.body;

  await query(
    `INSERT INTO availability_overrides (parking_lot_id, override_date, available_spots, reason, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (parking_lot_id, override_date) DO UPDATE
       SET available_spots = EXCLUDED.available_spots,
           reason = EXCLUDED.reason`,
    [lotId || 'b0000000-0000-0000-0000-000000000001', date, availableSpots, reason || null, req.admin!.adminId]
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
              r.total_price, r.payment_status, r.status,
              (SELECT string_agg(v.license_plate,', ') FROM vehicles v WHERE v.reservation_id = r.id) as plates
       FROM reservations r JOIN customers c ON c.id = r.customer_id
       ${where} ORDER BY ${dateCol} ASC`,
      params
    ),
    query(
      `SELECT
         COALESCE(SUM(CASE WHEN payment_status IN ('paid','on_site') THEN total_price END), 0) as total_revenue,
         COALESCE(SUM(refund_amount), 0) as total_refunded,
         COALESCE(SUM(CASE WHEN status = 'cancelled' THEN total_price END), 0) as total_cancelled
       FROM reservations r ${where}`,
      params
    ),
  ]);

  return res.json({ rows: rows.rows, totals: totals.rows[0] });
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
  const { dayPrices } = req.body; // Array of {dayNumber, price}
  const client = await getClient();

  try {
    await client.query('BEGIN');
    for (const dp of dayPrices) {
      await client.query(
        `INSERT INTO rate_day_prices (rate_id, day_number, price, is_manual_override)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (rate_id, day_number) DO UPDATE SET price = EXCLUDED.price`,
        [req.params.id, dp.dayNumber, dp.price]
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
      'INSERT INTO rate_day_prices (rate_id, day_number, price) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
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
  const { days = 7 } = req.body;
  try {
    await syncDoeksenScheduleDays(Math.min(Number(days), 30));
    return res.json({ success: true, message: `Doeksen schema gesynchroniseerd voor ${days} dagen` });
  } catch (err: any) {
    return res.status(500).json({ error: `Sync mislukt: ${err.message}` });
  }
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
  const result = await query('SELECT * FROM services ORDER BY sort_order');
  return res.json(result.rows);
});

router.put('/admin/services/:id', requireAuth, async (req: Request, res: Response) => {
  const { name, description, customerInfo, price, adminOnly, isActive } = req.body;
  await query(
    `UPDATE services SET name=$1, description=$2, customer_info=$3, price=$4,
     admin_only=$5, is_active=$6, updated_at=NOW() WHERE id=$7`,
    [name, description, customerInfo, price, adminOnly, isActive, req.params.id]
  );
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
          ferryOutboundTime, ferryReturnTime, vehicles } = req.body;

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

  if (updates.length > 0) {
    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);
    await query(`UPDATE reservations SET ${updates.join(', ')} WHERE id = $${i}`, params);
  }

  // Update vehicle license plates + clear stale RDW data, then re-fetch async
  if (Array.isArray(vehicles) && vehicles.length > 0) {
    for (const v of vehicles) {
      if (v.license_plate) {
        const plate = normalizePlate(v.license_plate);
        await query(
          `UPDATE vehicles SET license_plate = $1,
            rdw_make = NULL, rdw_model = NULL, rdw_color = NULL,
            rdw_fuel_type = NULL, rdw_year = NULL, rdw_fetched_at = NULL
           WHERE reservation_id = $2 AND sort_order = $3`,
          [plate, req.params.id, v.sort_order ?? 0]
        );
        // Async RDW re-fetch
        lookupRdw(plate).then(info => {
          if (info) {
            query(
              `UPDATE vehicles SET rdw_make=$1, rdw_model=$2, rdw_color=$3, rdw_fuel_type=$4, rdw_year=$5, rdw_fetched_at=NOW()
               WHERE reservation_id=$6 AND sort_order=$7`,
              [info.make, info.model, info.color, info.fuelType, info.year, req.params.id, v.sort_order ?? 0]
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
// ADMIN — SETTINGS (GET + PUT)
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

  if (['cancelled', 'checked_in', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet worden gewijzigd' });
  }

  const settingsResult = await query("SELECT key, value FROM settings WHERE key IN ('modification_fee','modification_min_days_before')");
  const cfg: Record<string, string> = {};
  for (const s of settingsResult.rows) cfg[s.key] = s.value;
  const modFee = parseFloat(cfg['modification_fee'] || '0');
  const minDays = parseInt(cfg['modification_min_days_before'] || '0');

  if (minDays > 0) {
    const { differenceInDays } = await import('date-fns');
    const daysLeft = differenceInDays(new Date(r.arrival_date), new Date());
    if (daysLeft < minDays) return res.status(400).json({ error: `Wijzigen is niet meer mogelijk — minder dan ${minDays} dag(en) voor aankomst` });
  }

  // Availability check (exclude current reservation)
  const vehicleCountResult = await query('SELECT COUNT(*) as cnt FROM vehicles WHERE reservation_id = $1', [r.id]);
  const vehicleCount = parseInt(vehicleCountResult.rows[0].cnt);
  const lotId = r.parking_lot_id;

  const bookedResult = await query(
    `SELECT COUNT(DISTINCT v.id) as booked FROM reservations res
     JOIN vehicles v ON v.reservation_id = res.id
     WHERE res.parking_lot_id = $1 AND res.status NOT IN ('cancelled')
       AND res.id != $2 AND res.arrival_date < $4 AND res.departure_date > $3`,
    [lotId, r.id, newArrival, newDeparture]
  );
  const lotResult = await query(
    `SELECT l.online_spots FROM parking_lots pl JOIN locations l ON l.id = pl.location_id WHERE pl.id = $1`, [lotId]
  );
  const available = lotResult.rows[0].online_spots - parseInt(bookedResult.rows[0].booked);

  const currentPrice = parseFloat(r.total_price);
  let newPriceInfo: any;
  try {
    newPriceInfo = await calculatePrice(new Date(newArrival), new Date(newDeparture), lotId, vehicleCount);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }

  const newPrice = newPriceInfo.totalPrice;
  const priceDiff = Math.round((newPrice - currentPrice) * 100) / 100;
  const netDue = priceDiff > 0 ? Math.round((priceDiff + modFee) * 100) / 100 : modFee > 0 ? modFee : 0;
  const netRefund = priceDiff < 0 ? Math.max(0, Math.round((Math.abs(priceDiff) - modFee) * 100) / 100) : 0;

  return res.json({
    reservationId: r.id,
    reference: r.reference,
    currentArrival: r.arrival_date,
    currentDeparture: r.departure_date,
    currentPrice,
    newArrival,
    newDeparture,
    newPrice,
    newPriceBreakdown: newPriceInfo.breakdown,
    priceDifference: priceDiff,
    modificationFee: modFee,
    netAmountDue: netDue,
    netRefundAmount: netRefund,
    available: available >= vehicleCount,
    availableSpots: available,
  });
});

// ============================================================
// PUBLIC — CONFIRM MODIFICATION (via cancellation token)
// ============================================================
router.post('/reservations/token/:token/modify', async (req: Request, res: Response) => {
  const { newArrivalDate, newDepartureDate } = req.body;
  if (!newArrivalDate || !newDepartureDate) return res.status(400).json({ error: 'Nieuwe datums zijn verplicht' });

  const result = await query('SELECT * FROM reservations WHERE cancellation_token = $1', [req.params.token]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Niet gevonden' });
  const r = result.rows[0];

  if (['cancelled', 'checked_in', 'completed'].includes(r.status)) {
    return res.status(400).json({ error: 'Deze reservering kan niet worden gewijzigd' });
  }

  const settingsResult = await query("SELECT key, value FROM settings WHERE key IN ('modification_fee','modification_min_days_before')");
  const cfg: Record<string, string> = {};
  for (const s of settingsResult.rows) cfg[s.key] = s.value;
  const modFee = parseFloat(cfg['modification_fee'] || '0');
  const minDays = parseInt(cfg['modification_min_days_before'] || '0');

  if (minDays > 0) {
    const { differenceInDays } = await import('date-fns');
    const daysLeft = differenceInDays(new Date(r.arrival_date), new Date());
    if (daysLeft < minDays) return res.status(400).json({ error: `Wijzigen is niet meer mogelijk` });
  }

  const vehicleCountResult = await query('SELECT COUNT(*) as cnt FROM vehicles WHERE reservation_id = $1', [r.id]);
  const vehicleCount = parseInt(vehicleCountResult.rows[0].cnt);
  const lotId = r.parking_lot_id;

  // Availability check (exclude self)
  const bookedResult = await query(
    `SELECT COUNT(DISTINCT v.id) as booked FROM reservations res
     JOIN vehicles v ON v.reservation_id = res.id
     WHERE res.parking_lot_id = $1 AND res.status NOT IN ('cancelled')
       AND res.id != $2 AND res.arrival_date < $4 AND res.departure_date > $3`,
    [lotId, r.id, newArrivalDate, newDepartureDate]
  );
  const lotResult = await query(
    `SELECT l.online_spots FROM parking_lots pl JOIN locations l ON l.id = pl.location_id WHERE pl.id = $1`, [lotId]
  );
  const available = lotResult.rows[0].online_spots - parseInt(bookedResult.rows[0].booked);
  if (available < vehicleCount) return res.status(409).json({ error: `Onvoldoende plaatsen beschikbaar voor de gekozen periode` });

  let newPriceInfo: any;
  try {
    newPriceInfo = await calculatePrice(new Date(newArrivalDate), new Date(newDepartureDate), lotId, vehicleCount);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }

  const currentPrice = parseFloat(r.total_price);
  const newPrice = newPriceInfo.totalPrice;
  const priceDiff = Math.round((newPrice - currentPrice) * 100) / 100;

  let stripeRefundId: string | null = null;
  let netRefund = 0;

  if (priceDiff < 0) {
    netRefund = Math.max(0, Math.round((Math.abs(priceDiff) - modFee) * 100) / 100);
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

  // Update reservation dates and price
  await query(
    `UPDATE reservations SET arrival_date=$1, departure_date=$2,
     total_price=$3, base_price=$4, season_surcharge_amount=$5, updated_at=NOW()
     WHERE id=$6`,
    [newArrivalDate, newDepartureDate, newPrice, newPriceInfo.totalPrice, newPriceInfo.seasonSurchargeAmount, r.id]
  );

  // Log modification history
  await query(
    `INSERT INTO reservation_modifications
     (reservation_id, modified_by, old_arrival_date, old_departure_date, new_arrival_date, new_departure_date,
      old_total_price, new_total_price, price_difference, modification_fee, stripe_refund_id)
     VALUES ($1,'customer',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [r.id, r.arrival_date, r.departure_date, newArrivalDate, newDepartureDate, currentPrice, newPrice, priceDiff, modFee, stripeRefundId]
  );

  sendModificationMail(r.id, {
    oldArrival: r.arrival_date, oldDeparture: r.departure_date,
    oldPrice: currentPrice, newPrice, netRefund,
    netDue: priceDiff > 0 ? Math.round((priceDiff + modFee) * 100) / 100 : 0,
    modFee,
  }).catch(console.error);

  return res.json({ success: true, netRefundAmount: netRefund, newPrice });
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
    const bookedResult = await query(
      `SELECT COUNT(DISTINCT v.id) as booked FROM reservations res
       JOIN vehicles v ON v.reservation_id = res.id
       WHERE res.parking_lot_id = $1 AND res.status NOT IN ('cancelled')
         AND res.id != $2 AND res.arrival_date < $4 AND res.departure_date > $3`,
      [lotId, r.id, newArrival, newDeparture]
    );
    const lotResult = await query(
      `SELECT l.online_spots FROM parking_lots pl JOIN locations l ON l.id = pl.location_id WHERE pl.id = $1`, [lotId]
    );
    available = lotResult.rows[0].online_spots - parseInt(bookedResult.rows[0].booked);
  }

  const currentPrice = parseFloat(r.total_price);
  let newPriceInfo: any;
  try {
    newPriceInfo = await calculatePrice(new Date(newArrival), new Date(newDeparture), lotId, vehicleCount);
  } catch (e: any) { return res.status(400).json({ error: e.message }); }

  const newPrice = newPriceInfo.totalPrice;
  const priceDiff = Math.round((newPrice - currentPrice) * 100) / 100;

  return res.json({
    currentArrival: r.arrival_date, currentDeparture: r.departure_date, currentPrice,
    newPrice, newPriceBreakdown: newPriceInfo.breakdown,
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
    const bookedResult = await query(
      `SELECT COUNT(DISTINCT v.id) as booked FROM reservations res
       JOIN vehicles v ON v.reservation_id = res.id
       WHERE res.parking_lot_id = $1 AND res.status NOT IN ('cancelled')
         AND res.id != $2 AND res.arrival_date < $4 AND res.departure_date > $3`,
      [lotId, r.id, newArrivalDate, newDepartureDate]
    );
    const lotResult = await query(
      `SELECT l.online_spots FROM parking_lots pl JOIN locations l ON l.id = pl.location_id WHERE pl.id = $1`, [lotId]
    );
    const available = lotResult.rows[0].online_spots - parseInt(bookedResult.rows[0].booked);
    if (available < vehicleCount) return res.status(409).json({ error: `Onvoldoende plaatsen beschikbaar` });
  }

  const currentPrice = parseFloat(r.total_price);
  let newPrice: number;
  let newPriceInfo: any;

  if (overrideTotalPrice !== undefined && overrideTotalPrice !== null && overrideTotalPrice !== '') {
    newPrice = parseFloat(overrideTotalPrice);
    newPriceInfo = { totalPrice: newPrice, seasonSurchargeAmount: 0, breakdown: 'Admin override' };
  } else {
    try {
      newPriceInfo = await calculatePrice(new Date(newArrivalDate), new Date(newDepartureDate), lotId, vehicleCount);
      newPrice = newPriceInfo.totalPrice;
    } catch (e: any) { return res.status(400).json({ error: e.message }); }
  }

  const priceDiff = Math.round((newPrice - currentPrice) * 100) / 100;
  let stripeRefundId: string | null = null;
  let netRefund = 0;

  if (priceDiff < 0) {
    netRefund = Math.max(0, Math.round((Math.abs(priceDiff) - modFee) * 100) / 100);
    if (netRefund > 0 && r.stripe_payment_intent_id && r.payment_status === 'paid') {
      const alreadyRefunded = parseFloat(r.refund_amount || '0');
      const maxRefund = Math.max(0, currentPrice - alreadyRefunded);
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

  await query(
    `UPDATE reservations SET arrival_date=$1, departure_date=$2,
     total_price=$3, base_price=$4, season_surcharge_amount=$5, updated_at=NOW()
     WHERE id=$6`,
    [newArrivalDate, newDepartureDate, newPrice, newPrice, newPriceInfo.seasonSurchargeAmount, r.id]
  );

  await query(
    `INSERT INTO reservation_modifications
     (reservation_id, modified_by, admin_user_id, old_arrival_date, old_departure_date,
      new_arrival_date, new_departure_date, old_total_price, new_total_price,
      price_difference, modification_fee, stripe_refund_id, admin_override_price, admin_notes)
     VALUES ($1,'admin',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [r.id, req.admin!.adminId, r.arrival_date, r.departure_date, newArrivalDate, newDepartureDate,
     currentPrice, newPrice, priceDiff, modFee, stripeRefundId,
     overrideTotalPrice ? newPrice : null, adminNotes || null]
  );

  await query(
    `INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id, new_value)
     VALUES ($1,'modify','reservation',$2,$3)`,
    [req.admin!.adminId, r.id, JSON.stringify({ newArrivalDate, newDepartureDate, newPrice, adminNotes })]
  );

  sendModificationMail(r.id, {
    oldArrival: r.arrival_date, oldDeparture: r.departure_date,
    oldPrice: currentPrice, newPrice, netRefund,
    netDue: priceDiff > 0 ? Math.round((priceDiff + modFee) * 100) / 100 : 0,
    modFee,
  }).catch(console.error);

  return res.json({ success: true, netRefundAmount: netRefund, newPrice });
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
// ADMIN — CUSTOMERS
// ============================================================
router.get('/admin/customers', requireAuth, async (req: Request, res: Response) => {
  const { search } = req.query as Record<string, string>;
  let where = '';
  const params: unknown[] = [];

  if (search) {
    where = `WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1`;
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
