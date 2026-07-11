import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import { query } from '../db/pool';

// Nederlandse kenteken-formatter volgens de officiële zijcodes ("26XSJZ" → "26-XS-JZ")
const NL_SIDECODE_GROUPS: Record<string, number[]> = {
  LLDDDD: [2,2,2], DDDDLL: [2,2,2], DDLLDD: [2,2,2], LLDDLL: [2,2,2], LLLLDD: [2,2,2], DDLLLL: [2,2,2],
  DDLLLD: [2,3,1], DLLLDD: [1,3,2], LLDDDL: [2,3,1], LDDDLL: [1,3,2], LLLDDL: [3,2,1], DLLDDD: [1,2,3], DDDLLD: [3,2,1],
  LDDLLL: [1,2,3],
};
function formatPlate(raw: string): string {
  if (!raw) return '';
  const s = String(raw).replace(/[-\s]/g, '').toUpperCase();
  if (s.length === 6) {
    const sig = s.replace(/[A-Z]/g, 'L').replace(/[0-9]/g, 'D');
    const groups = NL_SIDECODE_GROUPS[sig] || [2, 2, 2];
    const parts: string[] = [];
    let i = 0;
    for (const g of groups) { parts.push(s.slice(i, i + g)); i += g; }
    return parts.join('-');
  }
  return s.replace(/([A-Z]+)(\d)/g, '$1-$2').replace(/(\d+)([A-Z])/g, '$1-$2');
}

// ── Land-detectie voor kentekens (zodat alleen NL de gele plaat krijgt) ──
const DUTCH_PATTERNS = [
  /^[A-Z]{2}\d{2}[A-Z]{2}$/, /^[A-Z]{2}[A-Z]{2}\d{2}$/, /^\d{2}[A-Z]{2}[A-Z]{2}$/,
  /^[A-Z]{2}\d{3}[A-Z]$/, /^[A-Z]\d{3}[A-Z]{2}$/, /^\d{2}[A-Z]{3}\d$/, /^\d[A-Z]{3}\d{2}$/,
  /^[A-Z][A-Z]{3}\d{2}$/, /^[A-Z]{3}\d{2}[A-Z]$/, /^[A-Z]\d{2}[A-Z]{3}$/, /^\d\d[A-Z]{2}\d{3}$/,
];
type PlateStyleEmail = { bg: string; border: string; text: string; euBg: string | null; code: string };
const NL_STYLE_EMAIL: PlateStyleEmail = { bg: '#f5c518', border: '#c8a010', text: '#0a2240', euBg: '#003399', code: 'NL' };
const UNIVERSAL_STYLE_EMAIL: PlateStyleEmail = { bg: '#ffffff', border: '#aaaaaa', text: '#333333', euBg: null, code: '' };

// Herkent op patroon een buitenlands formaat (voor de landcode op een witte plaat).
function foreignPlateStyle(s: string): PlateStyleEmail | null {
  if (/^[A-Z]{1,3}[A-Z]{1,2}\d{1,4}$/.test(s) && s.length >= 4 && s.length <= 8 && s.length !== 6) return { bg: '#ffffff', border: '#333333', text: '#000000', euBg: '#003399', code: 'D' };
  if (/^\d[A-Z]{3}\d{3}$/.test(s)) return { bg: '#ffffff', border: '#cc0000', text: '#000000', euBg: '#003399', code: 'B' };
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(s)) return { bg: '#ffffff', border: '#555555', text: '#000000', euBg: '#003399', code: 'F' };
  if (/^[A-Z]{2}\d{2}[A-Z]{3}$/.test(s)) return { bg: '#f0f0f0', border: '#003399', text: '#000000', euBg: null, code: 'GB' };
  return null;
}

// isDutch: true = door RDW als NL herkend (geel); false = niet als NL herkend (universeel/land);
// undefined = onbekend → val terug op patroonherkenning.
function detectPlateStyle(raw: string, isDutch?: boolean): PlateStyleEmail {
  const s = String(raw || '').replace(/[-\s]/g, '').toUpperCase();
  const foreign = foreignPlateStyle(s);
  if (isDutch === true) return NL_STYLE_EMAIL;
  if (isDutch === false) return foreign || UNIVERSAL_STYLE_EMAIL;
  if (DUTCH_PATTERNS.some(p => p.test(s))) return NL_STYLE_EMAIL;
  return foreign || UNIVERSAL_STYLE_EMAIL;
}
function escHtml(s: any): string { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Kentekenplaat-HTML voor e-mails: NL = gele plaat met NL-strip; buitenlands = witte
// plaat met landcode; onbekend = neutrale witte plaat zonder strip.
function renderPlateHtmlEmail(raw: string, isDutch?: boolean): string {
  if (!raw) return '';
  const st = detectPlateStyle(raw, isDutch);
  const strip = st.euBg
    ? `<td style="background:${st.euBg};padding:5px 4px;text-align:center;vertical-align:middle;line-height:1;">`
      + `<div style="color:#ffd700;font-size:8px;line-height:1;font-family:Arial,sans-serif;">&#9733;</div>`
      + `<div style="color:#ffffff;font-size:7px;font-weight:bold;font-family:Arial,sans-serif;line-height:1;margin-top:2px;letter-spacing:0.5px;">${escHtml(st.code)}</div></td>`
    : st.code
    ? `<td style="background:#003399;padding:5px 6px;text-align:center;vertical-align:middle;line-height:1;color:#ffffff;font-size:9px;font-weight:bold;font-family:Arial,sans-serif;letter-spacing:0.5px;">${escHtml(st.code)}</td>`
    : '';
  return `<table style="border-collapse:separate;border:2px solid ${st.border};border-radius:5px;background:${st.bg};display:inline-table;overflow:hidden;margin:0 4px 8px;" cellspacing="0" cellpadding="0"><tbody><tr>${strip}`
    + `<td style="padding:5px 12px 6px;font-family:'Arial Narrow','Helvetica Neue Condensed Bold',Impact,'Arial Black',sans-serif;font-weight:bold;font-size:22px;color:${st.text};letter-spacing:1.5px;line-height:1;white-space:nowrap;">${escHtml(formatPlate(raw))}</td>`
    + `</tr></tbody></table>`;
}

// Handlebars-helper: rendert een lijst kentekens als land-bewuste platen.
// Items mogen strings zijn (patroonherkenning) of {raw, isDutch} (RDW-herkenning).
// Templates gebruiken {{{kentekenplaatjes kentekens}}} i.p.v. een hardcoded gele plaat.
Handlebars.registerHelper('kentekenplaatjes', (arr: any) =>
  new Handlebars.SafeString(Array.isArray(arr)
    ? arr.map((it: any) => typeof it === 'string'
        ? renderPlateHtmlEmail(it)
        : renderPlateHtmlEmail(it?.raw ?? it?.plate ?? '', it?.isDutch)
      ).join('')
    : '')
);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
}, {
  // Default voor álle uitgaande mails: antwoorden komen bij info@parkeren-harlingen.nl.
  replyTo: process.env.EMAIL_REPLY_TO || 'info@parkeren-harlingen.nl',
});

// Whitelist: als EMAIL_WHITELIST is ingesteld, worden mails alleen naar deze adressen verstuurd.
// Meerdere adressen scheiden met komma. Leeg = iedereen mag ontvangen.
function isWhitelisted(to: string): boolean {
  const raw = process.env.EMAIL_WHITELIST || '';
  if (!raw.trim()) return true; // geen whitelist → alles doorlaten
  const whitelist = raw.split(',').map(e => e.trim().toLowerCase());
  return whitelist.includes(to.trim().toLowerCase());
}

export async function sendSimpleEmail(to: string, subject: string, html: string): Promise<void> {
  if (!isWhitelisted(to)) {
    console.log(`[EMAIL WHITELIST] Geblokkeerd: ${to} | ${subject}`);
    return;
  }
  await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || 'Autostalling De Bazuin'}" <${process.env.EMAIL_FROM_ADDRESS}>`,
    to,
    subject,
    html,
  });
  console.log(`Simple email sent to ${to}: ${subject}`);
}

// Contractfactuur per e-mail met PDF-bijlage
export async function sendContractInvoiceEmail(to: string, name: string, invoiceNumber: string, pdf: Buffer, payUrl?: string | null): Promise<void> {
  if (!isWhitelisted(to)) {
    console.log(`[EMAIL WHITELIST] Geblokkeerd: ${to} | factuur ${invoiceNumber}`);
    return;
  }
  const payBlock = payUrl
    ? `<p style="margin:18px 0">
         <a href="${payUrl}" style="display:inline-block;background:#19499e;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;font-family:Arial,sans-serif">Betaal direct met iDEAL</a>
       </p>
       <p style="font-size:13px;color:#555">Of maak het bedrag over op IBAN <strong>NL81 ABNA 0108 0879 48</strong> t.n.v. Autostalling De Bazuin, o.v.v. ${invoiceNumber}.</p>`
    : `<p style="font-size:13px;color:#555">Maak het bedrag over op IBAN <strong>NL81 ABNA 0108 0879 48</strong> t.n.v. Autostalling De Bazuin, o.v.v. ${invoiceNumber}.</p>`;
  await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || 'Autostalling De Bazuin'}" <${process.env.EMAIL_FROM_ADDRESS}>`,
    to,
    subject: `Factuur ${invoiceNumber} — Autostalling De Bazuin`,
    html: `<p>Beste ${name || 'klant'},</p>
      <p>In de bijlage vindt u factuur <strong>${invoiceNumber}</strong> van Autostalling De Bazuin.</p>
      ${payBlock}
      <p>Met vriendelijke groet,<br>Autostalling De Bazuin</p>`,
    attachments: [{ filename: `Factuur-${invoiceNumber}.pdf`, content: pdf, contentType: 'application/pdf' }],
  });
  console.log(`Contractfactuur ${invoiceNumber} gemaild naar ${to}${payUrl ? ' (incl. iDEAL-link)' : ''}`);
}

export async function sendTemplatedEmail(
  slug: string,
  to: string,
  variables: Record<string, any>
): Promise<void> {
  const templateResult = await query(
    'SELECT * FROM email_templates WHERE slug = $1 AND is_active = true',
    [slug]
  );

  if (templateResult.rows.length === 0) {
    throw new Error(`Email template '${slug}' not found`);
  }

  const template = templateResult.rows[0];

  // Compile Handlebars templates
  const subjectTemplate = Handlebars.compile(template.subject);
  const bodyTemplate = Handlebars.compile(template.body_html);

  const subject = subjectTemplate(variables);
  const html = bodyTemplate(variables);

  if (!isWhitelisted(to)) {
    console.log(`[EMAIL WHITELIST] Geblokkeerd: ${to} | template: ${slug}`);
    return;
  }

  await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || 'Autostalling De Bazuin'}" <${process.env.EMAIL_FROM_ADDRESS}>`,
    to,
    subject,
    html,
  });

  console.log(`Email '${slug}' sent to ${to}`);
}

// Betaalstatus → klantvriendelijke tekst (voor check-in / bevestigingsmails)
function paymentStatusText(method: string | null, status: string | null): string {
  const m = (method || '').toLowerCase();
  const s = (status || '').toLowerCase();
  if (s === 'paid' || s === 'refunded') {
    if (m === 'contant') return 'Reeds voldaan — contant bij afgeven.';
    if (m === 'pin') return 'Reeds voldaan — gepind bij afgeven.';
    return 'Reeds online voldaan.';
  }
  if (s === 'invoiced' || m === 'invoice') return 'Wordt per factuur afgehandeld.';
  if (m === 'contant') return 'Nog te voldoen — contant bij afhalen.';
  if (m === 'pin') return 'Nog te voldoen — pinnen bij afhalen.';
  if (m === 'on_site' || s === 'on_site') return 'Nog te betalen bij afhalen (ter plekke).';
  return 'Moet nog betaald worden.';
}

function addMinutesToTime(time: string, mins: number): string {
  if (!time) return '';
  const [h, m] = time.slice(0, 5).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  const total = (h * 60 + m + mins + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Bouwt alle template-variabelen voor de volledige bevestigingslayout.
// Gedeeld door boekingsbevestiging, wijzigingsbevestiging en check-in.
export async function buildConfirmationVars(
  reservationId: string
): Promise<{ email: string; vars: Record<string, any> }> {
  const result = await query(
    `SELECT r.*, c.first_name, c.last_name, c.email, c.phone,
            f_out.name as ferry_out_name,
            f_ret.name as ferry_ret_name,
            (SELECT TO_CHAR(fs.arrival_harlingen, 'HH24:MI')
             FROM ferry_schedules fs
             WHERE fs.schedule_date = r.departure_date AND fs.direction = 'return'
               AND r.ferry_return_time IS NOT NULL
               AND ABS(EXTRACT(EPOCH FROM (fs.departure_time - r.ferry_return_time)) / 60) <= 20
               AND (COALESCE(r.ferry_return_destination, f_ret.destination) IS NULL
                    OR fs.destination = COALESCE(r.ferry_return_destination, f_ret.destination))
             ORDER BY ABS(EXTRACT(EPOCH FROM (fs.departure_time - r.ferry_return_time)))
             LIMIT 1) as ferry_return_arrival_harlingen
     FROM reservations r
     JOIN customers c ON c.id = r.customer_id
     LEFT JOIN ferries f_out ON f_out.id = r.ferry_outbound_id
     LEFT JOIN ferries f_ret ON f_ret.id = r.ferry_return_id
     WHERE r.id = $1`,
    [reservationId]
  );

  if (result.rows.length === 0) throw new Error('Reservation not found');
  const res = result.rows[0];

  const vehiclesResult = await query(
    'SELECT license_plate, ev_kwh, ev_price, rdw_make, rdw_fetched_at FROM vehicles WHERE reservation_id = $1 ORDER BY sort_order',
    [reservationId]
  );

  const settingsResult = await query(
    "SELECT key, value FROM settings WHERE key IN ('company_whatsapp','booking_url')"
  );
  const settings = Object.fromEntries(
    settingsResult.rows.map((r: { key: string; value: string }) => [r.key, r.value])
  );

  const servicesResult = await query(
    `SELECT s.name, rs.quantity, rs.unit_price, rs.total_price, rs.notes, v.license_plate
     FROM reservation_services rs
     JOIN services s ON s.id = rs.service_id
     LEFT JOIN vehicles v ON v.id = rs.vehicle_id
     WHERE rs.reservation_id = $1
     ORDER BY s.name`,
    [reservationId]
  );

  const platesArr = vehiclesResult.rows
    .map((v: { license_plate: string }) => formatPlate(v.license_plate))
    .filter(Boolean);
  const plates = platesArr.join(', ');
  // Kentekens met RDW-herkenning: rdw_make gevuld → NL (geel); wél opgezocht maar
  // geen make → buitenlands (universeel); nog niet opgezocht → patroonherkenning.
  const kentekenObjs = vehiclesResult.rows
    .filter((v: any) => v.license_plate)
    .map((v: any) => ({
      raw: v.license_plate,
      isDutch: v.rdw_make ? true : (v.rdw_fetched_at ? false : undefined),
    }));
  const baseUrl = settings['booking_url'] || 'https://parkeren-harlingen.nl';

  // Bouw prijsoverzicht op: eerst parkeerkosten, dan toeslag, dan extra diensten
  const nights = res.nights || Math.round(
    (new Date(res.departure_date).getTime() - new Date(res.arrival_date).getTime()) / 86400000
  );
  const basePrice = parseFloat(res.base_price || '0');
  const onSiteSurcharge = parseFloat(res.on_site_surcharge || '0');
  const vehicleCount = vehiclesResult.rows.length || 1;

  const paymentSurcharge = parseFloat(res.payment_surcharge || '0');
  const overbookingSurcharge = parseFloat(res.overbooking_surcharge || '0');
  const totalPrice = parseFloat(res.total_price || '0');

  // Eerst de losse diensten (EV-laden e.d.) opbouwen én sommeren
  const serviceLines: any[] = [];
  let servicesSum = 0;
  for (const s of servicesResult.rows as any[]) {
    const bedrag = parseFloat(s.total_price || '0');
    servicesSum += bedrag;
    serviceLines.push({
      naam: s.name,
      aantal: s.quantity > 1 ? `${s.quantity}×` : '',
      bedrag: bedrag === 0 ? 'Inbegrepen' : `€ ${bedrag.toFixed(2).replace('.', ',')}`,
      notitie: s.notes || '',
      kenteken: s.license_plate || '',
    });
  }
  // Fallback: EV-laaddiensten die direct op het voertuig staan maar niet in
  // reservation_services (kan voorkomen bij oudere/geïmporteerde boekingen)
  for (const v of vehiclesResult.rows as any[]) {
    if (v.ev_kwh && v.ev_price && parseFloat(v.ev_price) > 0) {
      const already = serviceLines.some(
        d => d.kenteken === v.license_plate && d.naam.toLowerCase().includes('laden')
      );
      if (!already) {
        const bedrag = parseFloat(v.ev_price);
        servicesSum += bedrag;
        serviceLines.push({
          naam: `Auto laden — ${v.ev_kwh} kWh`,
          aantal: '',
          bedrag: `€ ${bedrag.toFixed(2).replace('.', ',')}`,
          notitie: '',
          kenteken: v.license_plate,
        });
      }
    }
  }

  // Parkeerkosten = totaal − toeslagen − diensten. Zo telt de uitsplitsing
  // ALTIJD op tot het totaalbedrag, ook na een wijziging die de prijs
  // veranderde (anders zou een verouderde base_price een gat achterlaten).
  let parkingPrice = Math.round((totalPrice - onSiteSurcharge - paymentSurcharge - overbookingSurcharge - servicesSum) * 100) / 100;
  if (parkingPrice <= 0 && basePrice > 0) parkingPrice = basePrice; // veiligheidsnet

  const extraDiensten: any[] = [];

  // Regel 1: Parkeerkosten (X auto('s) × Y dagen) — kalenderdagen = nachten + 1
  if (parkingPrice > 0) {
    const dagen = nights + 1;
    const dagLabel = dagen === 1 ? '1 dag' : `${dagen} dagen`;
    const autoLabel = vehicleCount === 1 ? '1 auto' : `${vehicleCount} auto's`;
    extraDiensten.push({
      naam: `Auto parkeren — ${autoLabel}, ${dagLabel}`,
      aantal: '',
      bedrag: `€ ${parkingPrice.toFixed(2).replace('.', ',')}`,
      notitie: '',
      kenteken: '',
    });
  }

  // Regel 1b: Overboekingstoeslag (indien van toepassing) — eerder aangekomen
  // terwijl de stalling vol was.
  if (overbookingSurcharge > 0) {
    extraDiensten.push({
      naam: 'Overboekingstoeslag (eerder aangekomen bij volle stalling)',
      aantal: '',
      bedrag: `€ ${overbookingSurcharge.toFixed(2).replace('.', ',')}`,
      notitie: '',
      kenteken: '',
    });
  }

  // Regel 2: Toeslag ter plekke betalen (indien van toepassing)
  if (onSiteSurcharge > 0) {
    extraDiensten.push({
      naam: 'Toeslag ter plekke betalen',
      aantal: '',
      bedrag: `€ ${onSiteSurcharge.toFixed(2).replace('.', ',')}`,
      notitie: '',
      kenteken: '',
    });
  }

  // Regel 2b: PayPal-toeslag (indien van toepassing)
  if (paymentSurcharge > 0) {
    extraDiensten.push({
      naam: 'Toeslag PayPal',
      aantal: '',
      bedrag: `€ ${paymentSurcharge.toFixed(2).replace('.', ',')}`,
      notitie: '',
      kenteken: '',
    });
  }

  // Regel 3: Overige diensten (EV-laden, etc.)
  extraDiensten.push(...serviceLines);

  // Eigen (custom) terugtijd = de aankomst-/ophaaltijd in Harlingen zelf (geen boot).
  const hasCustomReturn = !res.ferry_return_time && !!res.ferry_return_custom_time;
  const vertrektijd_terug = res.ferry_return_time ? res.ferry_return_time.slice(0, 5) : '';
  const aankomsttijd_harlingen = res.ferry_return_arrival_harlingen
    || (hasCustomReturn ? res.ferry_return_custom_time.slice(0, 5) : '');
  // "Afhalen tot" = aankomst veerboot in Harlingen + 15 min marge
  const afhaal_tot = aankomsttijd_harlingen ? addMinutesToTime(aankomsttijd_harlingen, 15) : '';

  // Google Calendar-link (all-day, aankomst t/m vertrek) — inclusief locatie en wijzig-link
  const ymdCal = (v: any) => { const d = new Date(v); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
  const calEnd = new Date(res.departure_date); calEnd.setDate(calEnd.getDate() + 1);
  const calAddress = 'Zeilmakersstraat 2, 8861 SE Harlingen, Nederland';
  const calDetails = `Reserveringsnummer: ${res.reference}\n\nWijzig je reservering: ${baseUrl}/wijzigen/${res.cancellation_token}\nLocatie: ${calAddress}`;
  const agendalink = `https://calendar.google.com/calendar/render?action=TEMPLATE`
    + `&text=${encodeURIComponent('Parkeren — Autostalling De Bazuin')}`
    + `&dates=${ymdCal(res.arrival_date)}/${ymdCal(calEnd)}`
    + `&details=${encodeURIComponent(calDetails)}`
    + `&location=${encodeURIComponent(calAddress)}`;

  return {
    email: res.email,
    vars: {
      voornaam: res.first_name,
      achternaam: res.last_name,
      naam_volledig: `${res.first_name} ${res.last_name}`.trim(),
      reference: res.reference,
      aankomst_datum: new Date(res.arrival_date).toLocaleDateString('nl-NL', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      }),
      vertrek_datum: new Date(res.departure_date).toLocaleDateString('nl-NL', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      }),
      kentekenlijst: plates,
      kentekens: kentekenObjs,
      veerboot_heen: res.ferry_out_name || '—',
      vertrektijd_heen: res.ferry_outbound_time
        ? res.ferry_outbound_time.slice(0, 5)
        : '—',
      veerboot_terug: res.ferry_ret_name || (hasCustomReturn ? 'Eigen tijd' : '—'),
      vertrektijd_terug,
      aankomsttijd_harlingen,
      afhaal_tot,
      totaal_bedrag: `€ ${parseFloat(res.total_price).toFixed(2).replace('.', ',')}`,
      betaalstatus_tekst: paymentStatusText(res.payment_method, res.payment_status),
      telefoon: res.phone || '',
      klant_email: res.email || '',
      reserveer_datum: res.created_at
        ? new Date(res.created_at).toLocaleDateString('nl-NL', { year: 'numeric', month: 'long', day: 'numeric' })
        : '',
      bericht: res.notes || '',
      annuleringslink: `${baseUrl}/annuleren/${res.cancellation_token}`,
      wijzigingslink: `${baseUrl}/wijzigen/${res.cancellation_token}`,
      agendalink,
      factuurlink: `${process.env.PUBLIC_API_URL || 'https://api.booking.parkeren-harlingen.nl/api/v1'}/invoice/${res.cancellation_token}`,
      whatsapp_nummer: settings['company_whatsapp'] || '31612345678',
      heeft_extra_diensten: extraDiensten.length > 0,
      extra_diensten: extraDiensten,
    },
  };
}

export async function sendBookingConfirmation(reservationId: string): Promise<void> {
  const { email, vars } = await buildConfirmationVars(reservationId);
  await sendTemplatedEmail('booking_confirmed', email, vars);
}

// Wijzigingsbevestiging — identieke layout als de boekingsbevestiging,
// alleen de kop/titel geeft aan dat het om een wijziging gaat.
export async function sendModificationConfirmation(reservationId: string): Promise<void> {
  const { email, vars } = await buildConfirmationVars(reservationId);
  await sendTemplatedEmail('modification_confirmed', email, vars);
}

export async function sendCheckinMail(
  reservationId: string,
  parkingSpot?: string,
  extraMessage?: string
): Promise<void> {
  // Hergebruik de volledige bevestigingslayout-variabelen (kenteken, afhaalinfo,
  // prijsoverzicht, betaalstatus, reserveringsinformatie).
  const { email, vars } = await buildConfirmationVars(reservationId);

  await sendTemplatedEmail('checkin_confirmation', email, {
    ...vars,
    vaknummer: parkingSpot || '',
    extra_bericht: extraMessage || '',
  });

  // Update record
  await query(
    'UPDATE reservations SET checkin_mail_sent_at = NOW() WHERE id = $1',
    [reservationId]
  );
}

export async function sendCancellationMail(
  reservationId: string,
  refundAmount: number,
  refundPct: number,
  refundReference?: string
): Promise<void> {
  // Gedeelde layout-variabelen (naam, kenteken, datums, boottijden, totaal)
  const { email, vars } = await buildConfirmationVars(reservationId);

  // Extra annulering-specifieke gegevens
  const extra = await query(
    `SELECT r.total_price, r.cancelled_at, r.arrival_date, r.reference,
            c.first_name, c.last_name
     FROM reservations r JOIN customers c ON c.id = r.customer_id
     WHERE r.id = $1`,
    [reservationId]
  );
  const e = extra.rows[0] || {};

  const verwerktOp = e.cancelled_at
    ? new Date(e.cancelled_at).toLocaleString('nl-NL', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : '';
  // Dagen tot aankomst op het moment van annuleren
  let dagenTotAankomst = '';
  if (e.cancelled_at && e.arrival_date) {
    const diff = Math.round(
      (new Date(e.arrival_date).getTime() - new Date(e.cancelled_at).getTime()) / 86400000
    );
    dagenTotAankomst = String(Math.max(0, diff));
  }

  await sendTemplatedEmail('cancellation_confirmed', email, {
    ...vars,
    restitutie_bedrag: `€ ${refundAmount.toFixed(2).replace('.', ',')}`,
    restitutie_pct: refundPct,
    originele_boeking: `€ ${parseFloat(e.total_price || '0').toFixed(2).replace('.', ',')}`,
    heeft_restitutie: refundAmount > 0,
    verwerkt_op: verwerktOp,
    restitutie_referentie: refundReference || '',
    dagen_tot_aankomst: dagenTotAankomst,
  });
}

// Behouden voor bestaande call-sites: stuurt nu de volledige wijzigingsbevestiging
// (identieke layout als de boekingsbevestiging, met gewijzigde titel).
export async function sendModificationMail(
  reservationId: string,
  _diff?: {
    oldArrival: string; oldDeparture: string;
    oldPrice: number; newPrice: number;
    netRefund: number; netDue: number; modFee: number;
  }
): Promise<void> {
  await sendModificationConfirmation(reservationId);
}
