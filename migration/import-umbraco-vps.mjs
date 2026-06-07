/**
 * import-umbraco.mjs
 * Bulk-import future Umbraco reservations into bazuin_pms DB.
 * Run: node migration/import-umbraco.mjs [--dry-run]
 */

import pg from 'pg';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRY_RUN = process.argv.includes('--dry-run');

const pool = new Pool({ connectionString: 'postgresql://bazuin:BKNq9PBh@localhost:5432/bazuin_pms' });

const PARKING_LOT_ID = 'b0000000-0000-0000-0000-000000000001';
const RATE_ID        = '00000000-0000-0000-0000-000000000001';

// Already imported Umbraco IDs (from manual SQL migrations)
const ALREADY_IMPORTED = new Set([]);

function toUuid(prefix, id) {
  // e.g. prefix='c' id=21114 → 'c0000000-0000-0000-0000-000000021114'
  const padded = String(id).padStart(12, '0');
  return `${prefix}0000000-0000-0000-0000-${padded}`;
}

function splitName(name) {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  const last = parts.pop();
  return { first: parts.join(' '), last };
}

function formatTime(h, m) {
  if (h == null || m == null) return null;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function referenceFromId(id) {
  return `DB-2026-U${id}`;
}

// Map Umbraco payment methods to DB allowed values
function mapPaymentMethod(method) {
  if (!method) return null;
  const m = method.toLowerCase();
  if (m === 'ideal') return 'ideal';
  if (m === 'paypal') return 'paypal';
  if (m === 'sepa') return 'sepa';
  if (m === 'bancontact') return 'bancontact';
  if (['mastercard','visa','amex','card','creditcard'].includes(m)) return 'card';
  return null; // unknown → null (no constraint violation)
}

async function run() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'umbraco-future-import.json'), 'utf8'));

  // Skip ghost bookings: ferry time 00:00 and not paid (availability checks only)
  // Note: reservationStatus=8 is cancelled (cancelledAt may be null)
  const toImport = data.filter(d => !ALREADY_IMPORTED.has(d.id) && !(d.depH === 0 && d.depM === 0 && !d.paid));
  console.log(`Total records: ${data.length}`);
  console.log(`Already imported: ${ALREADY_IMPORTED.size}`);
  console.log(`To process: ${toImport.length} (${toImport.filter(d=>d.cancelled).length} cancelled, ${toImport.filter(d=>!d.cancelled).length} active)`);

  if (DRY_RUN) {
    console.log('\n--- DRY RUN — no DB writes ---\n');
    // Show sample
    toImport.slice(0, 5).forEach(d => {
      const { first, last } = splitName(d.name);
      console.log(`  ${referenceFromId(d.id)} | ${first} ${last} | ${d.arrival}→${d.departure} | ${formatTime(d.depH,d.depM)} heen | €${d.price} | ${d.cancelled?'CANCELLED':'booked'} | ${d.plate}`);
    });
    console.log('  ...');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    let imported = 0, cancelled = 0, skipped = 0, errors = 0;

    for (const d of toImport) {
      const ref = referenceFromId(d.id);

      try {
        await client.query('BEGIN');

        // 1. Check if already exists by reference
        const existing = await client.query('SELECT id FROM reservations WHERE reference = $1', [ref]);
        if (existing.rows.length > 0) {
          // If it's now cancelled, update status
          if (d.cancelled) {
            await client.query(`UPDATE reservations SET status='cancelled', updated_at=NOW() WHERE reference=$1`, [ref]);
            cancelled++;
          } else {
            skipped++;
          }
          await client.query('COMMIT');
          continue;
        }

        // 2. Upsert customer
        const { first, last } = splitName(d.name);
        const custId = toUuid('c', d.id);
        // Use synthetic email for empty-email customers to avoid UNIQUE collision
        const rawEmail = (d.email || '').toLowerCase().trim();
        const email = rawEmail || `umbraco-${d.id}@noemail.local`;

        await client.query(`
          INSERT INTO customers (id, first_name, last_name, email, phone, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          ON CONFLICT (email) DO UPDATE SET
            first_name = CASE WHEN customers.first_name='' THEN EXCLUDED.first_name ELSE customers.first_name END,
            last_name  = CASE WHEN customers.last_name=''  THEN EXCLUDED.last_name  ELSE customers.last_name  END,
            phone      = CASE WHEN customers.phone=''      THEN EXCLUDED.phone      ELSE customers.phone      END,
            updated_at = NOW()
        `, [custId, first, last, email, d.phone || '']);

        // Get actual customer id (may differ if email conflict resolved to existing)
        let actualCustId = custId;
        const r = await client.query('SELECT id FROM customers WHERE email=$1', [email]);
        if (r.rows.length > 0) actualCustId = r.rows[0].id;

        // 3. Resolve outbound destination from ferry_schedules
        const outTime = formatTime(d.depH, d.depM);
        const retTime  = formatTime(d.retH, d.retM);

        let outDest = null;
        if (outTime && d.arrival) {
          const destRes = await client.query(`
            SELECT destination FROM ferry_schedules
            WHERE schedule_date = $1 AND direction = 'outbound'
              AND ABS(EXTRACT(EPOCH FROM (departure_time - $2::time)) / 60) <= 20
            ORDER BY ABS(EXTRACT(EPOCH FROM (departure_time - $2::time)))
            LIMIT 1
          `, [d.arrival, outTime]);
          if (destRes.rows.length > 0) outDest = destRes.rows[0].destination;
        }

        // 4. Insert reservation
        const resId = toUuid('e', d.id);
        const status = d.cancelled ? 'cancelled' : 'booked';
        const payStatus = d.paid ? 'paid' : 'pending';
        const payMethod = mapPaymentMethod(d.method) || (d.paid ? 'ideal' : null);

        await client.query(`
          INSERT INTO reservations (
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
          )
          ON CONFLICT (id) DO NOTHING
        `, [
          resId, ref, actualCustId, PARKING_LOT_ID, RATE_ID,
          status, payStatus, payMethod, d.stripe || null,
          d.arrival, d.departure,
          outTime, outDest, d.fast || false,
          retTime,
          d.price || 0,
          d.note || '',
          `Import Umbraco #${d.id}`,
        ]);

        // 5. Insert vehicle (truncate or skip oversized plates)
        const plateRaw = (d.plate || '').replace(/[-\s]/g, '').toUpperCase();
        const plate = plateRaw.length <= 12 ? plateRaw : '';
        if (plate) {
          await client.query(`
            INSERT INTO vehicles (reservation_id, license_plate, ev_service_id, sort_order)
            VALUES ($1, $2, NULL, 0)
            ON CONFLICT DO NOTHING
          `, [resId, plate]);
        }

        await client.query('COMMIT');
        imported++;

        if (imported % 50 === 0) {
          process.stdout.write(`  imported ${imported}...\n`);
        }

      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ERROR id=${d.id} ref=${ref}:`, err.message);
        errors++;
      }
    }

    console.log(`\n✅ Done!`);
    console.log(`  Imported:   ${imported}`);
    console.log(`  Cancelled:  ${cancelled}`);
    console.log(`  Skipped:    ${skipped}`);
    console.log(`  Errors:     ${errors}`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
