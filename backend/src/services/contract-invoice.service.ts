import QRCode from 'qrcode';
import { query } from '../db/pool';
import { LOGO_B64 } from './invoice.service';
import { htmlToPdfA4 } from './pdf.service';

// ── Helpers ────────────────────────────────────────────────
function toIsoDate(d: any): string {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
}
function fmtDateShort(d: any): string {
  const iso = toIsoDate(d);
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}
function fmtMoney(v: any): string {
  return `€ ${parseFloat(v || 0).toFixed(2).replace('.', ',')}`;
}

// ISO 8601 weeknummer
function isoWeekNumber(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // donderdag van deze week bepaalt het weeknummer
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Maandag (lokaal middag) van de week waarin date valt
function mondayOf(date: Date): Date {
  const r = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  const dow = r.getDay(); // 0=zo, 1=ma..6=za
  const diff = dow === 0 ? -6 : 1 - dow;
  r.setDate(r.getDate() + diff);
  return r;
}

const DAY_SHORT_NL = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

// Logo wordt geïmporteerd uit invoice.service om duplicatie te voorkomen

// ── Types ──────────────────────────────────────────────────
export interface VehicleStay {
  license_plate: string;
  arrival_date: string;
  departure_date: string;
  notes?: string | null;
}

export interface ContractInvoiceInput {
  customer: any;
  periodFrom: string;
  periodTo: string;
  invoiceNumber: string;
  invoiceDate?: string;
  paymentTermDays?: number;         // standaard 30
  // Tarieftype
  rateType?: 'daily' | 'fixed_period' | 'seasonal';   // standaard 'daily'
  // Vaste periode
  fixedPeriodDays?: number;         // basisperiode in dagen (bv. 2)
  fixedPeriodRate?: number;         // prijs voor basisperiode incl. BTW
  extraDayRate?: number;            // prijs per extra dag boven basisperiode incl. BTW
  vehicleStays?: VehicleStay[];     // kentekens (fixed_period)
  // Dagelijks tarief
  rows: { date: string; car_count: number }[];
  dailyRate: number;
  vatPercentage: number;
  // Seizoenstarief
  lowSeasonRate?: number;           // incl. BTW per auto/dag
  highSeasonRate?: number;          // incl. BTW per auto/dag
  highSeasonFrom?: string;          // MM-DD bijv. "04-01"
  highSeasonUntil?: string;         // MM-DD bijv. "09-30"
  nextYearLowSeasonRate?: number;   // tarieven volgend jaar
  nextYearHighSeasonRate?: number;
  // EV opladen
  evLines?: { description: string; kwh: number; ratePerKwh: number; startFee?: number }[];
  isPreview?: boolean;
  paymentUrl?: string;          // iDEAL-betaallink (Stripe) — toont een QR in het betaalblok
  paymentQrDataUrl?: string;    // intern: gegenereerde QR als data-URL
}

interface WeekGroup {
  year: number;
  week: number;
  weekStart: Date;
  weekEnd: Date;
  days: { dow: number; count: number }[]; // dow 0=ma..6=zo
  totalCars: number;
}

function groupByWeek(rows: { date: string; car_count: number }[]): WeekGroup[] {
  const map = new Map<string, WeekGroup>();
  for (const r of rows) {
    const iso = toIsoDate(r.date);
    if (!iso) continue;
    const dt = new Date(iso + 'T12:00:00');
    const week = isoWeekNumber(dt);
    const monday = mondayOf(dt);
    const year = monday.getFullYear();
    const key = `${year}-${String(week).padStart(2, '0')}`;
    let g = map.get(key);
    if (!g) {
      const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
      g = { year, week, weekStart: monday, weekEnd: sunday, days: [], totalCars: 0 };
      map.set(key, g);
    }
    const dowJs = dt.getDay(); // 0=zo..6=za
    const dow = dowJs === 0 ? 6 : dowJs - 1; // ma=0..zo=6
    g.days.push({ dow, count: r.car_count });
    g.totalCars += r.car_count;
  }
  return Array.from(map.values()).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.week - b.week);
}

// ── Seizoenscheck ────────────────────────────────────────────
function isHighSeason(dateIso: string, from: string, until: string): boolean {
  // from/until zijn "MM-DD" bijv. "04-01" / "09-30"
  const mmdd = dateIso.slice(5, 10); // "MM-DD" uit "YYYY-MM-DD"
  if (from <= until) {
    // Normaal geval: voorjaar t/m najaar (geen jaargrens)
    return mmdd >= from && mmdd <= until;
  } else {
    // Winterseizoen: bijv. "10-01" t/m "03-31" → omgekeerd
    return mmdd >= from || mmdd <= until;
  }
}

// ── Helpers voor vaste-periode-berekening ───────────────────
function calcStayPrice(
  stay: VehicleStay,
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
    calc = `${fixedPeriodDays} dg. basis + ${extra}× extra`;
  }
  return { days, price, calc };
}

// ── HTML factuur (zelfde stijl als generateInvoiceHtml) ──
export function buildContractInvoiceHtml(input: ContractInvoiceInput): string {
  const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rateType = input.rateType ?? 'daily';

  // ── Berekeningen ──
  const vatPct = input.vatPercentage;
  let totalIncl: number;
  let rowsHtml = '';
  let tableHeader: string;

  if (rateType === 'fixed_period') {
    const fixedPeriodDays = input.fixedPeriodDays ?? 2;
    const fixedPeriodRate = input.fixedPeriodRate ?? 0;
    const extraDayRate    = input.extraDayRate ?? 0;
    const stays = input.vehicleStays ?? [];

    totalIncl = stays.reduce((s, stay) => s + calcStayPrice(stay, fixedPeriodDays, fixedPeriodRate, extraDayRate).price, 0);

    tableHeader = `<tr>
      <th>Kenteken</th>
      <th>Aankomst</th>
      <th>Vertrek</th>
      <th class="num">Dagen</th>
      <th class="num">Bedrag</th>
    </tr>`;

    if (stays.length === 0) {
      rowsHtml = `<tr><td colspan="5" style="text-align:center;color:#777;padding:6mm 0">Geen kentekens geregistreerd in deze periode</td></tr>`;
    } else {
      for (const stay of stays) {
        const { days, price, calc } = calcStayPrice(stay, fixedPeriodDays, fixedPeriodRate, extraDayRate);
        rowsHtml += `<tr>
          <td><strong>${esc(stay.license_plate)}</strong></td>
          <td>${fmtDateShort(stay.arrival_date)}</td>
          <td>${fmtDateShort(stay.departure_date)}</td>
          <td class="num"><span title="${esc(calc)}">${days}</span></td>
          <td class="num">${fmtMoney(price)}</td>
        </tr>`;
      }
    }
  } else if (rateType === 'seasonal') {
    // Seizoenstarief — gesplitst in hoog/laagseizoen, evt. apart voor volgend jaar
    const lowRate  = input.lowSeasonRate  ?? 0;
    const highRate = input.highSeasonRate ?? 0;
    const hsFrom   = input.highSeasonFrom  ?? '04-01';
    const hsUntil  = input.highSeasonUntil ?? '09-30';
    const nyLowRate  = input.nextYearLowSeasonRate  ?? 0;
    const nyHighRate = input.nextYearHighSeasonRate ?? 0;
    const currentYear = new Date().getFullYear();

    let highCars = 0, lowCars = 0, nyHighCars = 0, nyLowCars = 0;
    for (const r of input.rows) {
      const iso = toIsoDate(r.date);
      if (!iso) continue;
      const rowYear = parseInt(iso.slice(0, 4));
      const inHigh = isHighSeason(iso, hsFrom, hsUntil);
      if (rowYear > currentYear && (nyLowRate > 0 || nyHighRate > 0)) {
        if (inHigh) nyHighCars += r.car_count; else nyLowCars += r.car_count;
      } else {
        if (inHigh) highCars += r.car_count; else lowCars += r.car_count;
      }
    }

    const effNyHigh = nyHighRate > 0 ? nyHighRate : highRate;
    const effNyLow  = nyLowRate  > 0 ? nyLowRate  : lowRate;
    totalIncl = highCars * highRate + lowCars * lowRate
              + nyHighCars * effNyHigh + nyLowCars * effNyLow;

    tableHeader = `<tr>
      <th>Omschrijving</th>
      <th class="num">Auto-dagen</th>
      <th class="num">Tarief</th>
      <th class="num">Bedrag</th>
    </tr>`;

    const totalDays = highCars + lowCars + nyHighCars + nyLowCars;
    const licensePlate = input.customer?.license_plate ? ` · kenteken <strong style="font-family:monospace;letter-spacing:1px">${esc(input.customer.license_plate)}</strong>` : '';
    if (totalDays === 0) {
      rowsHtml = `<tr><td colspan="4" style="text-align:center;color:#777;padding:6mm 0">Geen auto-dagen geregistreerd in deze periode</td></tr>`;
    } else {
      const periodStr = `${fmtDateShort(input.periodFrom)} t/m ${fmtDateShort(input.periodTo)}`;
      if (highCars > 0) {
        rowsHtml += `<tr>
          <td>Parkeren hoogseizoen ${currentYear} · ${esc(periodStr)}${licensePlate}</td>
          <td class="num">${highCars}×</td>
          <td class="num">${fmtMoney(highRate)}/dag</td>
          <td class="num">${fmtMoney(highCars * highRate)}</td>
        </tr>`;
      }
      if (lowCars > 0) {
        rowsHtml += `<tr>
          <td>Parkeren laagseizoen ${currentYear} · ${esc(periodStr)}${licensePlate}</td>
          <td class="num">${lowCars}×</td>
          <td class="num">${fmtMoney(lowRate)}/dag</td>
          <td class="num">${fmtMoney(lowCars * lowRate)}</td>
        </tr>`;
      }
      if (nyHighCars > 0) {
        rowsHtml += `<tr>
          <td>Parkeren hoogseizoen ${currentYear + 1} · ${esc(periodStr)}${licensePlate}</td>
          <td class="num">${nyHighCars}×</td>
          <td class="num">${fmtMoney(effNyHigh)}/dag</td>
          <td class="num">${fmtMoney(nyHighCars * effNyHigh)}</td>
        </tr>`;
      }
      if (nyLowCars > 0) {
        rowsHtml += `<tr>
          <td>Parkeren laagseizoen ${currentYear + 1} · ${esc(periodStr)}${licensePlate}</td>
          <td class="num">${nyLowCars}×</td>
          <td class="num">${fmtMoney(effNyLow)}/dag</td>
          <td class="num">${fmtMoney(nyLowCars * effNyLow)}</td>
        </tr>`;
      }
    }
  } else {
    // daily tarief — per week groeperen
    const weeks = groupByWeek(input.rows);
    const totalCars = weeks.reduce((s, w) => s + w.totalCars, 0);
    totalIncl = totalCars * input.dailyRate;

    tableHeader = `<tr>
      <th>Omschrijving</th>
      <th class="num">Auto-dagen</th>
      <th class="num">Bedrag</th>
    </tr>`;

    if (weeks.length === 0) {
      rowsHtml = `<tr><td colspan="3" style="text-align:center;color:#777;padding:6mm 0">Geen auto's geregistreerd in deze periode</td></tr>`;
    } else {
      for (const w of weeks) {
        const dayParts = w.days
          .sort((a, b) => a.dow - b.dow)
          .map(d => `${DAY_SHORT_NL[d.dow]} ${d.count}`)
          .join(' · ');
        const weekLabel = `W${w.week}`;
        const dateRange = `${w.weekStart.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – ${w.weekEnd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        const lineTotal = w.totalCars * input.dailyRate;
        // Compacte regel: week, datumbereik en dagverdeling op één regel.
        rowsHtml += `<tr>
          <td style="padding-top:2mm;padding-bottom:2mm"><strong>${weekLabel}</strong> · <span style="color:#555">${esc(dateRange)}</span> &nbsp;<span style="font-size:8.5pt;color:#7090b0">${esc(dayParts)}</span></td>
          <td class="num" style="padding-top:2mm;padding-bottom:2mm">${w.totalCars}×</td>
          <td class="num" style="padding-top:2mm;padding-bottom:2mm">${fmtMoney(lineTotal)}</td>
        </tr>`;
      }
    }
  }

  // EV charging extra lines
  const evLines = input.evLines ?? [];
  let evTotal = 0;
  let evSectionHtml = '';
  if (evLines.length > 0) {
    evTotal = evLines.reduce((s, l) => s + l.kwh * l.ratePerKwh + (l.startFee ?? 0), 0);
    totalIncl += evTotal;

    if (rateType === 'seasonal') {
      // Seasonal: merge EV rows directly into main table (per date, incl. 21% BTW)
      for (const l of evLines) {
        const lineTotal = l.kwh * l.ratePerKwh + (l.startFee ?? 0);
        const kwhStr = l.kwh.toFixed(2).replace('.', ',');
        const tarief = (l.startFee ?? 0) > 0
          ? `${fmtMoney(l.ratePerKwh)}/kWh + ${fmtMoney(l.startFee)} start`
          : `${fmtMoney(l.ratePerKwh)}/kWh`;
        rowsHtml += `<tr style="border-top:0.3mm solid #ffe0a0">
          <td style="color:#92400e">⚡ EV opladen · ${esc(l.description || '')}</td>
          <td class="num" style="color:#7c6020">${kwhStr}&thinsp;kWh</td>
          <td class="num" style="color:#7c6020">${esc(tarief)}</td>
          <td class="num" style="font-weight:700">${fmtMoney(lineTotal)}</td>
        </tr>`;
      }
    } else {
      // Daily / fixed_period: separate EV section after main table
      evSectionHtml = `
    <h3 style="font-size:11pt;font-weight:700;color:#0a2240;margin:6mm 0 3mm">Extra diensten — Elektrisch opladen</h3>
    <table class="items-table" style="margin-bottom:8mm">
      <thead>
        <tr>
          <th>Omschrijving</th>
          <th class="num">kWh</th>
          <th class="num">Tarief/kWh</th>
          <th class="num">Starttarief</th>
          <th class="num">Bedrag</th>
        </tr>
      </thead>
      <tbody>
        ${evLines.map(l => {
          const lineTotal = l.kwh * l.ratePerKwh + (l.startFee ?? 0);
          return `<tr>
          <td>${esc(l.description)}</td>
          <td class="num">${l.kwh.toFixed(2).replace('.',',')}</td>
          <td class="num">${fmtMoney(l.ratePerKwh)}</td>
          <td class="num">${(l.startFee ?? 0) > 0 ? fmtMoney(l.startFee) : '—'}</td>
          <td class="num">${fmtMoney(lineTotal)}</td>
        </tr>`;
        }).join('')}
      </tbody>
    </table>`;
    }
  }

  const totalExcl = Math.round((totalIncl / (1 + vatPct / 100)) * 100) / 100;
  const btw = Math.round((totalIncl - totalExcl) * 100) / 100;
  const colspan = rateType === 'fixed_period' ? 4 : rateType === 'seasonal' ? 3 : 2;
  // EV table uses 4 columns (desc, kwh, rate, startfee) + amount = 5 cols; handled inline above

  const invoiceDate = input.invoiceDate
    ? fmtDateShort(input.invoiceDate)
    : new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  const paymentTermDays = input.paymentTermDays ?? 30;
  const invoiceDateIso = input.invoiceDate ? toIsoDate(input.invoiceDate) : toIsoDate(new Date().toISOString());
  const dueDateObj = new Date(invoiceDateIso + 'T12:00:00');
  dueDateObj.setDate(dueDateObj.getDate() + paymentTermDays);
  const dueDate = dueDateObj.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  const customer = input.customer || {};

  const watermark = input.isPreview
    ? `<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:120pt;color:rgba(232,160,32,0.18);font-weight:900;letter-spacing:4mm;pointer-events:none;z-index:1000">VOORBEELD</div>`
    : '';

  const customerAddr: string[] = [];
  if (customer.company) customerAddr.push(esc(customer.company));
  if (customer.name) customerAddr.push(`<strong>${esc(customer.name)}</strong>`);
  if (customer.address) customerAddr.push(esc(customer.address));
  if (customer.postal_code || customer.city) customerAddr.push(esc(`${customer.postal_code || ''} ${customer.city || ''}`.trim()));

  // Tarief-rij in de meta-tabel verwijderd op verzoek (stond dubbel met de regelomschrijving).

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Factuur ${esc(input.invoiceNumber)} — Autostalling De Bazuin</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; background: white; }
  @media screen { body { background: #eee; padding: 20mm; } .page { background: white; padding: 20mm; max-width: 170mm; margin: 0 auto; box-shadow: 0 2px 16px rgba(0,0,0,0.15); position: relative; } }
  @media print { .no-print { display: none !important; } }
  h1 { font-size: 22pt; font-weight: 900; color: #0a2240; margin-bottom: 2mm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10mm; }
  .company { font-size: 9pt; color: #555; line-height: 1.6; }
  .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; font-size: 10pt; }
  .meta-table td { padding: 2mm 0; vertical-align: top; }
  .meta-table td:first-child { font-weight: 700; width: 50mm; color: #555; }
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; font-size: 10pt; }
  .items-table th { background: #0a2240; color: white; padding: 3mm 4mm; text-align: left; font-size: 9pt; font-weight: 700; }
  .items-table td { padding: 3mm 4mm; border-bottom: 0.3mm solid #ddd; vertical-align: top; }
  .items-table tr:last-child td { border-bottom: none; }
  .items-table .num { text-align: right; white-space: nowrap; }
  .total-row { font-weight: 900; font-size: 12pt; }
  .footer { margin-top: 8mm; font-size: 8.5pt; color: #777; border-top: 0.3mm solid #ddd; padding-top: 4mm; line-height: 1.6; }
  .paybox { margin-top: 10mm; border: 0.3mm solid #dde3ec; border-radius: 1.5mm; padding: 4mm 5mm; background: #fafbfd; }
  .paybox-label { font-size: 8pt; font-weight: 700; letter-spacing: 1.2px; color: #8895a7; margin-bottom: 2.5mm; }
  .paybox-table { border-collapse: collapse; }
  .paybox-table td { padding: 0.8mm 0; font-size: 9.5pt; vertical-align: middle; color: #1a2e48; }
  .paybox-table td:first-child { width: 20mm; color: #8895a7; font-weight: 400; }
  .paybox .iban { font-weight: 700; letter-spacing: 0.6px; }
  .paybox-note { font-size: 9pt; color: #8895a7; margin-top: 3mm; }
  .paybox-row { display: flex; align-items: center; justify-content: space-between; gap: 8mm; }
  .paybox-main { flex: 1; }
  .paybox-qr { text-align: center; flex-shrink: 0; }
  .paybox-qr img { width: 26mm; height: 26mm; display: block; }
  .paybox-qr-label { font-size: 7.5pt; color: #8895a7; margin-top: 1.5mm; max-width: 26mm; line-height: 1.3; }
  .logo { height: 56px; width: auto; }
</style>
</head>
<body>
<div class="page">
  ${watermark}

  <div class="header">
    <div>
      <img src="${LOGO_B64}" class="logo" alt="Autostalling De Bazuin" style="margin-bottom:4mm">
      <h1>Factuur</h1>
      <div style="font-size:12px;color:#7090b0;margin-top:1px">${esc(input.invoiceNumber)}</div>
    </div>
    <div class="company" style="text-align:right">
      <strong style="font-size:11pt;color:#0a2240">Autostalling De Bazuin</strong><br>
      Zeilmakersstraat 2<br>
      8861SE Harlingen<br>
      info@parkeren-harlingen.nl
    </div>
  </div>

  <table class="meta-table">
    <tbody>
      <tr><td>Klant</td><td>${customerAddr.join('<br>')}</td></tr>
      ${customer.email ? `<tr><td>E-mail</td><td>${esc(customer.email)}</td></tr>` : ''}
      ${customer.btw_number ? `<tr><td>BTW-nummer</td><td>${esc(customer.btw_number)}</td></tr>` : ''}
      <tr><td style="padding-top:4mm">Factuurnummer</td><td style="padding-top:4mm"><strong>${esc(input.invoiceNumber)}</strong></td></tr>
      <tr><td>Periode</td><td>${fmtDateShort(input.periodFrom)} t/m ${fmtDateShort(input.periodTo)}</td></tr>
      <tr><td>Factuurdatum</td><td>${invoiceDate}</td></tr>
      <tr><td>Betaaltermijn</td><td>${paymentTermDays} dagen &mdash; uiterlijk <strong>${dueDate}</strong></td></tr>
    </tbody>
  </table>

  <table class="items-table">
    <thead>
      ${tableHeader}
    </thead>
    <tbody>
      ${rowsHtml}
      <tr style="border-top:0.3mm solid #ddd">
        <td colspan="${colspan}" style="padding-top:3mm;font-size:9px;color:#777">Subtotaal excl. BTW</td>
        <td class="num" style="padding-top:3mm;font-size:9px;color:#777">${fmtMoney(totalExcl)}</td>
      </tr>
      <tr>
        <td colspan="${colspan}" style="font-size:9px;color:#777">BTW ${vatPct.toFixed(0)}%</td>
        <td class="num" style="font-size:9px;color:#777">${fmtMoney(btw)}</td>
      </tr>
      <tr class="total-row" style="border-top:0.5mm solid #0a2240">
        <td colspan="${colspan}" style="padding-top:4mm">Totaal incl. BTW</td>
        <td class="num" style="padding-top:4mm">${fmtMoney(totalIncl)}</td>
      </tr>
    </tbody>
  </table>

  ${evSectionHtml}

  <div class="paybox">
    <div class="paybox-row">
      <div class="paybox-main">
        <div class="paybox-label">BETAALGEGEVENS</div>
        <table class="paybox-table">
          <tr><td>IBAN</td><td class="iban">NL81 ABNA 0108 0879 48</td></tr>
          <tr><td>T.n.v.</td><td>Autostalling De Bazuin</td></tr>
          <tr><td>Kenmerk</td><td><strong>${esc(input.invoiceNumber)}</strong></td></tr>
        </table>
        <div class="paybox-note">Gelieve het bedrag uiterlijk <strong>${dueDate}</strong> over te maken onder vermelding van het factuurnummer.</div>
      </div>
      ${input.paymentQrDataUrl ? `<div class="paybox-qr">
        <img src="${input.paymentQrDataUrl}" alt="iDEAL betaal-QR" />
        <div class="paybox-qr-label">Scan om met iDEAL te betalen</div>
      </div>` : ''}
    </div>
  </div>

  <div class="footer">
    Autostalling De Bazuin · Zeilmakersstraat 2, 8861SE Harlingen · KVK: 51258692 · BTW: NL863463319B01 · info@parkeren-harlingen.nl
  </div>
</div>
</body>
</html>`;
}

// ── PDF via puppeteer (identiek aan hoofdfactuur-aanpak) ──
export async function generateContractInvoicePdf(input: ContractInvoiceInput): Promise<Buffer> {
  if (input.paymentUrl && !input.paymentQrDataUrl) {
    try { input.paymentQrDataUrl = await QRCode.toDataURL(input.paymentUrl, { margin: 1, width: 220, errorCorrectionLevel: 'M' }); }
    catch { /* QR is optioneel — bij een fout simpelweg geen QR tonen */ }
  }
  return htmlToPdfA4(buildContractInvoiceHtml(input));
}

export async function generateNextContractInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CON-${year}-`;
  const result = await query(
    `SELECT invoice_number FROM contract_invoices
     WHERE invoice_number LIKE $1
     ORDER BY invoice_number DESC LIMIT 1`,
    [`${prefix}%`]
  );
  let next = 1;
  if (result.rows.length > 0) {
    const last = result.rows[0].invoice_number as string;
    const tail = last.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (!isNaN(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}
