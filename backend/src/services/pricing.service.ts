import { query } from '../db/pool';
import { addDays, differenceInDays } from 'date-fns';

export interface PriceSegment {
  rateId: string;
  rateName: string;
  daysInRate: number;
  fullRatePrice: number;   // what this rate would charge for the FULL stay
  weightedPrice: number;   // pro-rata share: (daysInRate / totalDays) × fullRatePrice
}

export interface PriceCalculation {
  days: number;
  nights: number;
  rateId: string;
  rateName: string;
  basePricePerCar: number;
  seasonSurchargePct: number;
  seasonSurchargeAmount: number;
  pricePerCar: number;
  totalPrice: number;
  breakdown: string;
  segments: PriceSegment[];   // one entry per rate period that overlaps the booking
}

/** Convert a Date to a YYYY-MM-DD string using LOCAL date parts (avoids UTC offset shift) */
function toDateStr(d: Date): string {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Look up the price for `n` days from a specific rate's day-price table.
 * Falls back to base_day_price × n when no explicit entry exists.
 */
async function getRatePriceForDays(
  rateId: string,
  baseDayPrice: number,
  n: number
): Promise<number> {
  const capped = Math.min(n, 30); // table goes up to 30
  const dpResult = await query(
    'SELECT price FROM rate_day_prices WHERE rate_id = $1 AND day_number = $2',
    [rateId, capped]
  );

  if (dpResult.rows.length > 0) {
    return parseFloat(dpResult.rows[0].price);
  }

  // Beyond table: use 14-day price + extra days at base rate
  if (n > 14) {
    const dp14 = await query(
      'SELECT price FROM rate_day_prices WHERE rate_id = $1 AND day_number = 14',
      [rateId]
    );
    const p14 = dp14.rows.length > 0
      ? parseFloat(dp14.rows[0].price)
      : baseDayPrice * 14;
    return p14 + (n - 14) * baseDayPrice;
  }

  return baseDayPrice * n;
}

/**
 * Calculate parking price for a given date range and number of vehicles.
 *
 * Days = (departure − arrival) + 1  (both days count, per De Bazuin policy).
 *
 * When the booking spans multiple rate periods the cost is a weighted average:
 *   price = Σ ( rate_i.priceForFullStay × daysInRate_i / totalDays )
 *
 * Example – 8 days, voorjaar (€89) covers 2 days, zomer (€100) covers 6:
 *   price = 89 × (2/8) + 100 × (6/8) = 22.25 + 75.00 = €97.25
 */
export async function calculatePrice(
  arrivalDate: Date,
  departureDate: Date,
  lotId: string,
  vehicleCount: number = 1
): Promise<PriceCalculation> {
  const nights = differenceInDays(departureDate, arrivalDate);
  const days   = nights + 1; // both arrival AND departure day

  if (nights <= 0) {
    throw new Error('Vertrekdatum moet na aankomstdatum liggen');
  }

  // Build the list of every calendar day in the booking as YYYY-MM-DD strings
  const bookingDays: string[] = Array.from({ length: days }, (_, i) =>
    toDateStr(addDays(arrivalDate, i))
  );

  const arrStr = bookingDays[0];
  const depStr = bookingDays[days - 1];

  // ── Find ALL active rates that overlap the booking window ──────────────────
  console.log(`[pricing] lot=${lotId} arr=${arrStr} dep=${depStr} days=${days}`);

  const ratesResult = await query(
    `SELECT * FROM rates
     WHERE parking_lot_id = $1
       AND is_active = true
       AND valid_from  <= $2::date
       AND valid_until >= $3::date
     ORDER BY valid_from ASC`,
    [lotId, depStr, arrStr]
  );

  console.log(`[pricing] rates found: ${ratesResult.rows.length}`, ratesResult.rows.map((r: any) => `${r.name} (${r.valid_from}→${r.valid_until})`));

  if (ratesResult.rows.length === 0) {
    throw new Error(`Geen tarief beschikbaar voor periode ${arrStr}–${depStr} (lot ${lotId})`);
  }

  // ── Count booking days that fall within each rate period ───────────────────
  const segments: PriceSegment[] = [];

  for (const rate of ratesResult.rows) {
    const fromStr  = String(rate.valid_from).slice(0, 10);
    const untilStr = String(rate.valid_until).slice(0, 10);

    const daysInRate = bookingDays.filter(d => d >= fromStr && d <= untilStr).length;
    if (daysInRate === 0) continue;

    const fullRatePrice = await getRatePriceForDays(
      rate.id,
      parseFloat(rate.base_day_price),
      days
    );

    const weightedPrice = (daysInRate / days) * fullRatePrice;

    segments.push({
      rateId:       rate.id,
      rateName:     rate.name,
      daysInRate,
      fullRatePrice,
      weightedPrice,
    });
  }

  // Edge case: some days may fall outside all rate periods (gap between periods).
  // Assign uncovered days to the segment with the most days as a safety fallback.
  const coveredDays = segments.reduce((s, seg) => s + seg.daysInRate, 0);
  if (coveredDays < days && segments.length > 0) {
    const largest = segments.reduce((a, b) => a.daysInRate >= b.daysInRate ? a : b);
    const extra   = days - coveredDays;
    largest.daysInRate    += extra;
    largest.weightedPrice  = (largest.daysInRate / days) * largest.fullRatePrice;
  }

  console.log(`[pricing] segments built: ${segments.length}`, segments.map(s => `${s.rateName}:${s.daysInRate}d`));

  if (segments.length === 0) {
    throw new Error(`Geen tarief beschikbaar voor periode ${arrStr}–${depStr}`);
  }

  // ── Weighted base price ────────────────────────────────────────────────────
  const basePricePerCar = Math.round(
    segments.reduce((sum, seg) => sum + seg.weightedPrice, 0) * 100
  ) / 100;

  // Primary rate = the one covering the most days (used for rateId / rateName)
  const primary = segments.reduce((a, b) => a.daysInRate >= b.daysInRate ? a : b);

  // ── Season surcharge (based on arrival date) ───────────────────────────────
  const seasonResult = await query(
    `SELECT * FROM season_surcharges
     WHERE is_active = true
       AND valid_from  <= $1
       AND valid_until >= $1
     ORDER BY surcharge_pct DESC
     LIMIT 1`,
    [arrStr]
  );

  let seasonSurchargePct    = 0;
  let seasonSurchargeAmount = 0;

  if (seasonResult.rows.length > 0) {
    seasonSurchargePct    = parseFloat(seasonResult.rows[0].surcharge_pct);
    seasonSurchargeAmount = Math.round(basePricePerCar * (seasonSurchargePct / 100) * 100) / 100;
  }

  const pricePerCar = Math.round((basePricePerCar + seasonSurchargeAmount) * 100) / 100;
  const totalPrice  = Math.round(pricePerCar * vehicleCount * 100) / 100;

  // ── Breakdown string ───────────────────────────────────────────────────────
  let breakdown: string;
  if (segments.length === 1) {
    breakdown = `${days} dag${days !== 1 ? 'en' : ''} × ${vehicleCount} auto${vehicleCount !== 1 ? "'s" : ''}`;
  } else {
    const parts = segments.map(
      s => `${s.rateName} ${s.daysInRate}/${days} × €${s.fullRatePrice.toFixed(2)}`
    );
    breakdown = parts.join(' + ');
  }
  if (seasonSurchargePct > 0) {
    breakdown += ` + ${seasonSurchargePct}% seizoenstoeslag`;
  }

  const rateName = segments.length > 1
    ? segments.map(s => `${s.rateName} (${s.daysInRate}d)`).join(' + ')
    : primary.rateName;

  return {
    days,
    nights,
    rateId:               primary.rateId,
    rateName,
    basePricePerCar,
    seasonSurchargePct,
    seasonSurchargeAmount,
    pricePerCar,
    totalPrice,
    breakdown,
    segments,
  };
}

/**
 * Calculate the refund amount based on the cancellation policy.
 */
export async function calculateRefund(
  arrivalDate: Date,
  totalPaid: number,
  adminOverridePct?: number
): Promise<{ refundPct: number; refundAmount: number; policyDescription: string }> {
  if (adminOverridePct !== undefined) {
    return {
      refundPct:         adminOverridePct,
      refundAmount:      Math.round(totalPaid * (adminOverridePct / 100) * 100) / 100,
      policyDescription: `Admin override: ${adminOverridePct}%`,
    };
  }

  const daysUntilArrival = differenceInDays(arrivalDate, new Date());

  const policyResult = await query(
    `SELECT * FROM cancellation_policies
     WHERE is_active = true
       AND days_before_min <= $1
       AND (days_before_max IS NULL OR days_before_max >= $1)
     ORDER BY days_before_min DESC
     LIMIT 1`,
    [daysUntilArrival]
  );

  if (policyResult.rows.length === 0) {
    return { refundPct: 0, refundAmount: 0, policyDescription: 'Geen restitutie' };
  }

  const policy      = policyResult.rows[0];
  const refundPct   = policy.refund_percentage;
  const refundAmount = Math.round(totalPaid * (refundPct / 100) * 100) / 100;

  return { refundPct, refundAmount, policyDescription: policy.description };
}

/**
 * Generate a unique booking reference like PP-2026-8471
 */
export async function generateReference(): Promise<string> {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  const ref  = `PP-${year}-${rand}`;

  const existing = await query(
    'SELECT id FROM reservations WHERE reference = $1',
    [ref]
  );

  if (existing.rows.length > 0) return generateReference();
  return ref;
}
