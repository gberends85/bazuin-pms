import PDFDocument from 'pdfkit';
import { query } from '../db/pool';

export async function generateInvoicePdf(token: string): Promise<{ pdf: Buffer; filename: string } | null> {
  // Ophalen via cancellation_token (veilige publieke toegang)
  const result = await query(
    `SELECT r.*, c.first_name, c.last_name, c.email, c.phone
     FROM reservations r
     JOIN customers c ON c.id = r.customer_id
     WHERE r.cancellation_token = $1`,
    [token]
  );

  if (result.rows.length === 0) return null;
  const r = result.rows[0];

  const vehiclesResult = await query(
    'SELECT license_plate FROM vehicles WHERE reservation_id = $1 ORDER BY sort_order',
    [r.id]
  );
  const plates = vehiclesResult.rows.map((v: any) => v.license_plate).join(', ');

  const servicesResult = await query(
    `SELECT s.name, rs.quantity, rs.price_at_booking, s.unit
     FROM reservation_services rs
     JOIN services s ON s.id = rs.service_id
     WHERE rs.reservation_id = $1`,
    [r.id]
  );

  const fmtDate = (d: any) => {
    const iso = String(d).slice(0, 10);
    return new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  };

  const fmtMoney = (n: number) => `€ ${n.toFixed(2).replace('.', ',')}`;

  const invoiceNr = `BZN-${r.reference}`;
  const today = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve({ pdf: Buffer.concat(chunks), filename: `Factuur-${invoiceNr}.pdf` }));
    doc.on('error', reject);

    const DARK = '#0a2240';
    const TEAL = '#0a7c6e';
    const GREY = '#7090b0';
    const LGREY = '#f0f4f8';

    // ── Header ──────────────────────────────────────────────
    doc.rect(0, 0, 595, 120).fill(DARK);
    doc.fillColor('white').fontSize(22).font('Helvetica-Bold')
      .text('Autostalling De Bazuin', 50, 35);
    doc.fillColor('#aab8cc').fontSize(10).font('Helvetica')
      .text('Zeilmakersstraat 2  •  8861SE Harlingen', 50, 65)
      .text('Tel: 0517-412986  •  info@autostallingdebazuin.nl', 50, 80);

    doc.fillColor('white').fontSize(10).font('Helvetica-Bold')
      .text(`FACTUUR ${invoiceNr}`, 400, 40, { width: 145, align: 'right' });
    doc.fillColor('#aab8cc').fontSize(9).font('Helvetica')
      .text(`Datum: ${today}`, 400, 58, { width: 145, align: 'right' });

    // ── Klantgegevens ────────────────────────────────────────
    doc.moveDown(4);
    doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold').text('Aan:', 50, 140);
    doc.fillColor('#333').fontSize(10).font('Helvetica')
      .text(`${r.first_name} ${r.last_name}`, 50, 155)
      .text(r.email, 50, 169);
    if (r.phone) doc.text(r.phone, 50, 183);

    // ── Reserveringsinfo ─────────────────────────────────────
    doc.rect(50, 205, 495, 70).fill(LGREY);
    doc.fillColor(DARK).fontSize(10).font('Helvetica-Bold')
      .text('Reservering', 65, 215)
      .text('Referentie:', 65, 232).text(r.reference, 160, 232, { continued: false })
      .text('Aankomst:', 65, 247).fillColor('#333').font('Helvetica').text(fmtDate(r.arrival_date), 160, 247)
      .fillColor(DARK).font('Helvetica-Bold')
      .text('Vertrek:', 65, 262).fillColor('#333').font('Helvetica').text(fmtDate(r.departure_date), 160, 262);

    if (plates) {
      doc.fillColor(DARK).font('Helvetica-Bold').text('Kenteken(s):', 65, 277)
        .fillColor('#333').font('Helvetica').text(plates, 160, 277);
    }

    // ── Tabel header ─────────────────────────────────────────
    let y = plates ? 305 : 290;
    doc.rect(50, y, 495, 20).fill(TEAL);
    doc.fillColor('white').fontSize(9).font('Helvetica-Bold')
      .text('Omschrijving', 60, y + 5)
      .text('Aantal', 350, y + 5, { width: 60, align: 'right' })
      .text('Bedrag', 430, y + 5, { width: 105, align: 'right' });

    y += 20;

    // Parkeertarief
    const parkDays = Math.max(1, Math.round(
      (new Date(String(r.departure_date).slice(0,10)+'T12:00:00').getTime() -
       new Date(String(r.arrival_date).slice(0,10)+'T12:00:00').getTime()) / 86400000
    ));
    const parkPrice = parseFloat(r.total_price || '0') - servicesResult.rows.reduce((s: number, sv: any) => s + parseFloat(sv.price_at_booking) * (sv.quantity || 1), 0);

    const drawRow = (desc: string, qty: string, amount: string, shade: boolean) => {
      if (shade) doc.rect(50, y, 495, 18).fill('#f8fafc');
      doc.fillColor('#333').fontSize(9).font('Helvetica')
        .text(desc, 60, y + 4)
        .text(qty, 350, y + 4, { width: 60, align: 'right' })
        .text(amount, 430, y + 4, { width: 105, align: 'right' });
      y += 18;
    };

    drawRow(`Parkeerplaats (${parkDays} dag${parkDays !== 1 ? 'en' : ''})`, `${parkDays}`, fmtMoney(parkPrice), false);

    servicesResult.rows.forEach((sv: any, i: number) => {
      const lineTotal = parseFloat(sv.price_at_booking) * (sv.quantity || 1);
      drawRow(sv.name, `${sv.quantity || 1}`, fmtMoney(lineTotal), i % 2 === 0);
    });

    // ── Totaal ───────────────────────────────────────────────
    y += 8;
    doc.rect(350, y, 195, 1).fill(DARK);
    y += 6;
    doc.rect(350, y, 195, 26).fill(DARK);
    doc.fillColor('white').fontSize(11).font('Helvetica-Bold')
      .text('Totaal', 360, y + 7)
      .text(fmtMoney(parseFloat(r.total_price || '0')), 430, y + 7, { width: 105, align: 'right' });
    y += 36;

    // Betaalstatus
    const betaald = r.payment_status === 'paid';
    doc.rect(350, y, 195, 20).fill(betaald ? '#e6f7f5' : '#fff3cd');
    doc.fillColor(betaald ? TEAL : '#856404').fontSize(9).font('Helvetica-Bold')
      .text(betaald ? '✓ Betaald' : 'Openstaand', 360, y + 5, { width: 175, align: 'center' });

    // ── Footer ───────────────────────────────────────────────
    doc.rect(0, 770, 595, 72).fill(LGREY);
    doc.fillColor(GREY).fontSize(8).font('Helvetica')
      .text('Autostalling De Bazuin  |  Zeilmakersstraat 2, 8861SE Harlingen  |  0517-412986  |  info@autostallingdebazuin.nl',
        50, 782, { align: 'center', width: 495 })
      .text('BTW: NL863463319B01  |  KvK: 85003190  |  IBAN: NL81ABNA01087948', 50, 796, { align: 'center', width: 495 })
      .text('Bedankt voor uw vertrouwen in Autostalling De Bazuin!', 50, 812, { align: 'center', width: 495 });

    doc.end();
  });
}
