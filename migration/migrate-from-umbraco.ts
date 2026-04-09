/**
 * ================================================================
 * Umbraco → Nieuw PMS Migratiescript
 * ================================================================
 * Gebruik:
 *   1. Exporteer reserveringen uit Umbraco als CSV
 *      (Financieel Rapport → Tabel → selecteer alles → kopieer naar umbraco_export.csv)
 *   2. Sla het bestand op als migration/umbraco_export.csv
 *   3. Voer uit: npx tsx migrate-from-umbraco.ts
 * ================================================================
 */

import 'dotenv/config';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// CSV parser (geen externe dependency nodig)
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  // Detect separator
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));

  return lines.slice(1).map(line => {
    const values = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));
  });
}

// Kenteken normaliseren
function normalizePlate(plate: string): string {
  return plate.replace(/[-\s]/g, '').toUpperCase();
}

// Datum omzetten
function parseDate(str: string): string | null {
  if (!str) return null;
  // Formaten: "Apr 02, 2026" of "02-04-2026" of "2026-04-02"
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  } catch {}
  return null;
}

// Vertrektijd extraheren (bijv. "07:55 → 09:55" → ["07:55", "09:55"])
function parseTimes(str: string): [string | null, string | null] {
  if (!str) return [null, null];
  const match = str.match(/(\d{2}:\d{2})\s*→\s*(\d{2}:\d{2})/);
  if (match) return [match[1], match[2]];
  const single = str.match(/(\d{2}:\d{2})/);
  if (single) return [single[1], null];
  return [null, null];
}

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const csvPath = path.join(__dirname, 'umbraco_export.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('❌  Bestand niet gevonden: migration/umbraco_export.csv');
    console.error('   Exporteer de reserveringen uit Umbraco en sla op als umbraco_export.csv');
    process.exit(1);
  }

  const rows = parseCSV(fs.readFileSync(csvPath, 'utf-8'));
  console.log(`📋 ${rows.length} rijen gevonden in CSV`);

  // Haal parkeerterrein op
  const lotResult = await pool.query('SELECT id FROM parking_lots LIMIT 1');
  const lotId = lotResult.rows[0]?.id;
  if (!lotId) throw new Error('Geen parkeerterrein gevonden in database — voer eerst de seed uit');

  // Haal standaard tariefid op
  const rateResult = await pool.query('SELECT id FROM rates ORDER BY valid_from LIMIT 1');
  const defaultRateId = rateResult.rows[0]?.id;

  let created = 0, skipped = 0, errors = 0;

  for (const row of rows) {
    try {
      // Velden mappen vanuit Umbraco CSV structuur
      // Kolommen: REF, Plaatsen, Naam, Aankomstdatum, Vertrekdatum, Totale Kosten, Status
      const reference = row['REF'] || row['Ref'] || row['reference'];
      const customerName = row['Naam'] || row['Name'] || row['Klant'];
      const arrivalRaw = row['Aankomstdatum'] || row['Arrival'];
      const departureRaw = row['Vertrekdatum'] || row['Departure'];
      const totalPrice = parseFloat(row['Totale Kosten'] || row['Total'] || '0');
      const statusRaw = (row['Status'] || 'Bevestigd').toLowerCase();

      if (!reference || !customerName) {
        skipped++;
        continue;
      }

      // Check of al bestaat
      const existing = await pool.query(
        'SELECT id FROM reservations WHERE reference = $1', [reference]
      );
      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }

      // Aankomst/vertrektijden
      const [arrivalTime, departureTimeFromArrival] = parseTimes(arrivalRaw);
      const [departureTime] = parseTimes(departureRaw);

      // Datum extraheren (los van tijd)
      const arrivalDate = parseDate(arrivalRaw.split(' ')[0] + ' ' + (arrivalRaw.split(' ').slice(-2).join(' ')));
      const departureDate = parseDate(departureRaw.split(' ')[0] + ' ' + (departureRaw.split(' ').slice(-2).join(' ')));

      if (!arrivalDate || !departureDate) {
        console.warn(`⚠️  Datum niet te parsen voor ${reference}: ${arrivalRaw} / ${departureRaw}`);
        errors++;
        continue;
      }

      // Status mappen
      let status: string;
      if (statusRaw.includes('geannul') || statusRaw.includes('cancel')) status = 'cancelled';
      else if (statusRaw.includes('ingecheckt') || statusRaw.includes('checked')) status = 'checked_in';
      else if (statusRaw.includes('voltooid') || statusRaw.includes('complet')) status = 'completed';
      else status = 'booked';

      // Betaalstatus
      const paid = row['Betaald'] || '';
      const paymentStatus = paid.toLowerCase().includes('niet') ? 'pending' : 'paid';

      // Naam splitsen
      const nameParts = customerName.trim().split(/\s+/);
      const firstName = nameParts[0] || 'Onbekend';
      const lastName = nameParts.slice(1).join(' ') || 'Onbekend';

      // Placeholder email (niet beschikbaar in CSV)
      const email = `migratie+${reference.toLowerCase().replace(/[^a-z0-9]/g, '')}@autostallingdebazuin.nl`;

      // Klant aanmaken of ophalen
      const customerResult = await pool.query(
        `INSERT INTO customers (first_name, last_name, email, phone)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name
         RETURNING id`,
        [firstName, lastName, email, row['Telefoon'] || row['Phone'] || null]
      );
      const customerId = customerResult.rows[0].id;

      // Reservering aanmaken
      await pool.query(
        `INSERT INTO reservations (
          reference, customer_id, parking_lot_id, rate_id,
          status, payment_status, payment_method,
          arrival_date, departure_date,
          ferry_outbound_time, ferry_return_time,
          base_price, total_price, vat_amount,
          admin_notes, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())`,
        [
          reference, customerId, lotId, defaultRateId,
          status, paymentStatus, 'on_site', // betaalmethode onbekend
          arrivalDate, departureDate,
          arrivalTime, departureTime,
          totalPrice, totalPrice, Math.round(totalPrice * 0.21 * 100) / 100,
          `Gemigreerd vanuit Umbraco op ${new Date().toLocaleDateString('nl-NL')}`,
        ]
      );

      // Voertuig aanmaken als kenteken beschikbaar
      const plate = row['Kenteken'] || row['Plate'] || row['REF'];
      if (plate && plate !== reference) {
        await pool.query(
          `INSERT INTO vehicles (reservation_id, license_plate, sort_order)
           SELECT id, $1, 0 FROM reservations WHERE reference = $2`,
          [normalizePlate(plate), reference]
        );
      }

      created++;
      if (created % 50 === 0) console.log(`  ✓ ${created} reserveringen gemigreerd...`);

    } catch (err: any) {
      console.error(`❌  Fout bij rij ${row['REF'] || '?'}: ${err.message}`);
      errors++;
    }
  }

  await pool.end();

  console.log('\n════════════════════════════════════');
  console.log(`✅  Migratie voltooid`);
  console.log(`   Aangemaakt: ${created}`);
  console.log(`   Overgeslagen (al bestaat): ${skipped}`);
  console.log(`   Fouten: ${errors}`);
  console.log('════════════════════════════════════');

  if (errors > 0) {
    console.log('\n⚠️  Controleer de fouten hierboven en voer eventueel handmatig in.');
  }

  console.log('\n📧 Let op: e-mailadressen zijn tijdelijke placeholders.');
  console.log('   Update deze handmatig via het admin klantenbeheer als u de echte adressen heeft.');
}

migrate().catch(err => {
  console.error('Migratie mislukt:', err);
  process.exit(1);
});
