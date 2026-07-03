import { LOGO_B64 } from './invoice.service';
import { htmlToPdfA4 } from './pdf.service';

// ── Helpers ────────────────────────────────────────────────
function toIso(d: any): string {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}
function fmtLong(d: any): string {
  const iso = toIso(d);
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtShort(d: any): string {
  const iso = toIso(d);
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}
function fmtMoney(v: any): string {
  return `€ ${parseFloat(v || 0).toFixed(2).replace('.', ',')}`;
}
const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── HTML factuur (zelfde stijl/CSS als de contractfactuur) ──
export function buildInvoiceGroupHtml(group: any): string {
  const reservations: any[] = group.reservations || [];
  const total = reservations.reduce((s: number, r: any) => s + parseFloat(r.total_price || 0), 0);
  const totalExcl = Math.round((total / 1.21) * 100) / 100;
  const btw = Math.round((total - totalExcl) * 100) / 100;
  const invoiceDate = group.created_at ? fmtLong(group.created_at) : fmtLong(new Date().toISOString());

  const statusBadge = group.status === 'paid'
    ? `<span style="display:inline-block;padding:1mm 3mm;border-radius:1mm;font-size:8.5pt;font-weight:700;background:#e8f5eb;color:#2a7a3a">Betaald</span>`
    : group.status === 'sent'
    ? `<span style="display:inline-block;padding:1mm 3mm;border-radius:1mm;font-size:8.5pt;font-weight:700;background:#e8f0fe;color:#1a4fa0">Verstuurd</span>`
    : `<span style="display:inline-block;padding:1mm 3mm;border-radius:1mm;font-size:8.5pt;font-weight:700;background:#fff0cc;color:#8a5f00">Te betalen</span>`;

  const rowsHtml = reservations.map((r: any) => {
    const days = (r.nights ?? 0) + 1;
    const ferryOut = r.ferry_outbound_time ? String(r.ferry_outbound_time).slice(0, 5) : null;
    const ferryRet = r.ferry_return_time ? String(r.ferry_return_time).slice(0, 5) : null;
    const ferryLine = (ferryOut || ferryRet)
      ? [ferryOut ? `↗ heen ${ferryOut}` : null, ferryRet ? `↙ terug ${ferryRet}` : null].filter(Boolean).join('  ·  ')
      : null;
    const evKwh = parseFloat(r.ev_kwh_total || 0);
    const evCost = parseFloat(r.ev_price_total || 0);
    const subLines =
      (ferryLine ? `<div style="font-weight:400;font-size:7.5pt;color:#7090b0;margin-top:0.5mm">${esc(ferryLine)}</div>` : '') +
      (evKwh > 0 ? `<div style="font-weight:400;font-size:7.5pt;color:#0a7c6e;margin-top:0.5mm">⚡ Laden: ${String(evKwh).replace('.', ',')} kWh · ${fmtMoney(evCost)} <span style="color:#9aa8b8">(incl. in bedrag)</span></div>` : '');
    return `<tr>
      <td><strong>${esc(`${r.first_name || ''} ${r.last_name || ''}`.trim())}</strong>${subLines}</td>
      <td style="font-family:monospace;font-size:9pt;color:#556070">${esc(r.plates || 'Onbekend')}</td>
      <td style="color:#556070;white-space:nowrap">${fmtShort(r.arrival_date)} – ${fmtShort(r.departure_date)}</td>
      <td class="num">${days}</td>
      <td class="num" style="font-weight:700">${fmtMoney(r.total_price)}</td>
    </tr>`;
  }).join('');

  const customerBlock = [
    group.billing_company ? `<strong>${esc(group.billing_company)}</strong>` : '',
    group.billing_name ? `<strong>${esc(group.billing_name)}</strong>` : '',
    group.billing_address ? esc(group.billing_address) : '',
    (group.billing_postal_code || group.billing_city) ? esc(`${group.billing_postal_code || ''} ${group.billing_city || ''}`.trim()) : '',
    group.billing_email ? `<span style="color:#0a7c6e">${esc(group.billing_email)}</span>` : '',
    group.billing_vat_number ? `<span style="color:#7090b0;font-size:9pt">BTW: ${esc(group.billing_vat_number)}</span>` : '',
  ].filter(Boolean).join('<br>');

  const paybox = group.status !== 'paid' ? `
  <div class="paybox">
    <div class="paybox-label">BETAALGEGEVENS</div>
    <table class="paybox-table">
      <tr><td>IBAN</td><td class="iban">NL81 ABNA 0108 0879 48</td></tr>
      <tr><td>T.n.v.</td><td>Autostalling De Bazuin</td></tr>
      <tr><td>Kenmerk</td><td><strong>${esc(group.reference)}</strong></td></tr>
    </table>
    <div class="paybox-note">Gelieve <strong>${fmtMoney(total)}</strong> over te maken onder vermelding van het factuurnummer.</div>
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<title>Factuur ${esc(group.reference)} — Autostalling De Bazuin</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; background: white; }
  h1 { font-size: 22pt; font-weight: 900; color: #0a2240; margin-bottom: 2mm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10mm; }
  .company { font-size: 9pt; color: #555; line-height: 1.6; text-align: right; }
  .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; font-size: 10pt; }
  .meta-table td { padding: 2mm 0; vertical-align: top; }
  .meta-table td:first-child { font-weight: 700; width: 50mm; color: #555; }
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; font-size: 9.5pt; }
  .items-table th { background: #0a2240; color: white; padding: 3mm 4mm; text-align: left; font-size: 9pt; font-weight: 700; }
  .items-table th.num { text-align: right; }
  .items-table td { padding: 3mm 4mm; border-bottom: 0.3mm solid #ddd; vertical-align: top; }
  .items-table tr:last-child td { border-bottom: none; }
  .items-table .num { text-align: right; white-space: nowrap; }
  .totals { border-collapse: collapse; margin-left: auto; margin-bottom: 8mm; font-size: 10pt; min-width: 70mm; }
  .totals td { padding: 1.5mm 0; }
  .totals td:first-child { color: #555; padding-right: 12mm; }
  .totals td:last-child { text-align: right; font-weight: 600; }
  .totals .total-row td { font-weight: 900; font-size: 13pt; padding-top: 3mm; border-top: 0.5mm solid #0a2240; }
  .paybox { margin-top: 4mm; border: 0.3mm solid #dde3ec; border-radius: 1.5mm; padding: 4mm 5mm; background: #fafbfd; }
  .paybox-label { font-size: 8pt; font-weight: 700; letter-spacing: 1.2px; color: #8895a7; margin-bottom: 2.5mm; }
  .paybox-table { border-collapse: collapse; }
  .paybox-table td { padding: 0.8mm 0; font-size: 9.5pt; vertical-align: middle; color: #1a2e48; }
  .paybox-table td:first-child { width: 20mm; color: #8895a7; font-weight: 400; }
  .paybox .iban { font-weight: 700; letter-spacing: 0.6px; }
  .paybox-note { font-size: 9pt; color: #8895a7; margin-top: 3mm; }
  .footer { margin-top: 10mm; font-size: 8.5pt; color: #777; border-top: 0.3mm solid #ddd; padding-top: 4mm; line-height: 1.6; }
  .logo { height: 56px; width: auto; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <img src="${LOGO_B64}" class="logo" alt="Autostalling De Bazuin" style="margin-bottom:4mm">
      <h1>Factuur</h1>
      <div style="font-size:12px;color:#7090b0;margin-top:1px">${esc(group.reference)}</div>
    </div>
    <div class="company">
      <strong style="font-size:11pt;color:#0a2240">Autostalling De Bazuin</strong><br>
      Zeilmakersstraat 2<br>
      8861SE Harlingen<br>
      info@parkeren-harlingen.nl
    </div>
  </div>

  <table class="meta-table">
    <tbody>
      <tr><td>Factureren aan</td><td>${customerBlock}</td></tr>
      <tr><td style="padding-top:4mm">Factuurdatum</td><td style="padding-top:4mm">${invoiceDate}</td></tr>
      <tr><td>Factuurnummer</td><td><strong>${esc(group.reference)}</strong></td></tr>
      <tr><td>Status</td><td>${statusBadge}</td></tr>
      ${group.notes ? `<tr><td>Omschrijving</td><td style="font-style:italic;color:#555">${esc(group.notes)}</td></tr>` : ''}
    </tbody>
  </table>

  <table class="items-table">
    <thead>
      <tr>
        <th>Naam</th>
        <th>Kenteken</th>
        <th>Periode</th>
        <th class="num">Dagen</th>
        <th class="num">Bedrag</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || `<tr><td colspan="5" style="text-align:center;color:#777;padding:6mm 0">Geen reserveringen</td></tr>`}
    </tbody>
  </table>

  <table class="totals">
    <tbody>
      <tr><td>Subtotaal (excl. BTW)</td><td>${fmtMoney(totalExcl)}</td></tr>
      <tr><td>BTW 21%</td><td>${fmtMoney(btw)}</td></tr>
      <tr class="total-row"><td>Totaal incl. BTW</td><td>${fmtMoney(total)}</td></tr>
    </tbody>
  </table>

  ${paybox}

  <div class="footer">
    Autostalling De Bazuin · Zeilmakersstraat 2, 8861SE Harlingen · KVK: 51258692 · BTW: NL863463319B01 · info@parkeren-harlingen.nl · IBAN: NL81 ABNA 0108 0879 48
  </div>
</body>
</html>`;
}

export async function generateInvoiceGroupPdf(group: any): Promise<Buffer> {
  return htmlToPdfA4(buildInvoiceGroupHtml(group));
}
