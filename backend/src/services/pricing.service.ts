import { query } from '../db/pool';
import { addDays, differenceInDays, isWithinInterval, parseISO } from 'date-fns';

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
}

/**
 * Calculate parking price for a given date range and number of vehicles.
 * Days = (departure - arrival) + 1 (both days count, per De Bazuin policy).
 */
export async function calculatePrice(
  arrivalDate: Date,
  departureDate: Date,
  lotId: string,
  vehicleCount: number = 1
): Promise<PriceCalculation> {
  const nights = differenceInDays(departureDate, arrivalDate);
  const days = nights + 1; // De Bazuin counts both arrival AND departure day

  if (nights <= 0) {
    throw new Error('Vertrekdatum moet na aankomstdatum liggen');
  }

  // Find the active rate for the arrival date
  const rateResult = await query(
    `SELECT r.*, rdp.price as day_price
     FROM rates r
     LEFT JOIN rate_day_prices rdp ON rdp.rate_id = r.id AND rdp.day_number = $1
     WHERE r.parking_lot_id = $2
       AND r.is_active = true
       AND r.valid_from <= $3
       AND r.valid_until >= $3
     ORDER BY r.sort_order ASC
     LIMIT 1`,
    [Math.min(days, 100), lotId, arrivalDate.toISOString().split('T')[0]]
  );

  if (rateResult.rows.length === 0) {
    throw new Error('Geen tarief beschikbaar voor deze periode');
  }

  const rate = rateResult.rows[0];
  let basePricePerCar: number;

  if (rate.day_price !== null) {
    // Use the manual override price for this specific day count
    basePricePerCar = parseFloat(rate.day_price);
  } else if (days > 14) {
    // Beyond table: use 14-day price + extra days at base_day_price
    const day14Result = await query(
      'SELECT price FROM rate_day_prices WHERE rate_id = $1 AND day_number = 14',
      [rate.id]
    );
    const day14Price = day14Result.rows[0]
      ? parseFloat(day14Result.rows[0].price)
      : 140.00;
    basePricePerCar = day14Price + (days - 14) * parseFloat(rate.base_day_price);
  } else {
    // Fall back to base_day_price * days
    basePricePerCar = parseFloat(rate.base_day_price) * days;
  }

  // Check for season surcharge
  const seasonResult = await query(
    `SELECT * FROM season_surcharges
     WHERE is_active = true
       AND valid_from <= $1
       AND valid_until >= $1
     ORDER BY surcharge_pct DESC
     LIMIT 1`,
    [arrivalDate.toISOString().split('T')[0]]
  );

  let seasonSurchargePct = 0;
  let seasonSurchargeAmount = 0;

  if (seasonResult.rows.length > 0) {
    seasonSurchargePct = parseFloat(seasonResult.rows[0].surcharge_pct);
    seasonSurchargeAmount =
      Math.round(basePricePerCar * (seasonSurchargePct / 100) * 100) / 100;
  }

  const pricePerCar =
    Math.round((basePricePerCar + seasonSurchargeAmount) * 100) / 100;
  const totalPrice = Math.round(pricePerCar * vehicleCount * 100) / 100;

  return {
    days,
    nights,
    rateId: rate.id,
    rateName: rate.name,
    basePricePerCar,
    seasonSurchargePct,
    seasonSurchargeAmount,
    pricePerCar,
    totalPrice,
    breakdown: `${days} dag${days !== 1 ? 'en' : ''} × ${vehicleCount} auto${vehicleCount !== 1 ? "'s" : ''}` +
      (seasonSurchargePct > 0 ? ` + ${seasonSurchargePct}% seizoenstoeslag` : ''),
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
      refundPct: adminOverridePct,
      refundAmount: Math.round(totalPaid * (adminOverridePct / 100) * 100) / 100,
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

  const policy = policyResult.rows[0];
  const refundPct = policy.refund_percentage;
  const refundAmount = Math.round(totalPaid * (refundPct / 100) * 100) / 100;

  return {
    refundPct,
    refundAmount,
    policyDescription: policy.description,
  };
}

/**
 * Generate a unique booking reference like PP-2026-8471
 */
export async function generateReference(): Promise<string> {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  const ref = `PP-${year}-${rand}`;
  
  // Check uniqueness
  const existing = await query(
    'SELECT id FROM reservations WHERE reference = $1',
    [ref]
  );
  
  if (existing.rows.length > 0) {
    return generateReference(); // recurse
  }
  
  return ref;
}
