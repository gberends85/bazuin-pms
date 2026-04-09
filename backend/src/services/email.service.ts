import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import { query } from '../db/pool';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendTemplatedEmail(
  slug: string,
  to: string,
  variables: Record<string, string | number | boolean | undefined>
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

  await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || 'Autostalling De Bazuin'}" <${process.env.EMAIL_FROM_ADDRESS}>`,
    to,
    subject,
    html,
  });

  console.log(`Email '${slug}' sent to ${to}`);
}

export async function sendBookingConfirmation(
  reservationId: string
): Promise<void> {
  const result = await query(
    `SELECT r.*, c.first_name, c.last_name, c.email,
            f_out.name as ferry_out_name,
            f_ret.name as ferry_ret_name
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
    'SELECT license_plate FROM vehicles WHERE reservation_id = $1 ORDER BY sort_order',
    [reservationId]
  );

  const settingsResult = await query(
    "SELECT key, value FROM settings WHERE key IN ('company_whatsapp','booking_url')"
  );
  const settings = Object.fromEntries(
    settingsResult.rows.map((r: { key: string; value: string }) => [r.key, r.value])
  );

  const plates = vehiclesResult.rows.map((v: { license_plate: string }) => v.license_plate).join(', ');
  const baseUrl = settings['booking_url'] || 'https://parkeren-harlingen.nl';

  await sendTemplatedEmail('booking_confirmed', res.email, {
    voornaam: res.first_name,
    reference: res.reference,
    aankomst_datum: new Date(res.arrival_date).toLocaleDateString('nl-NL', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
    vertrek_datum: new Date(res.departure_date).toLocaleDateString('nl-NL', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
    kentekenlijst: plates,
    veerboot_heen: res.ferry_out_name || '—',
    vertrektijd_heen: res.ferry_outbound_time
      ? res.ferry_outbound_time.slice(0, 5)
      : '—',
    veerboot_terug: res.ferry_ret_name || (res.ferry_return_custom ? 'Eigen tijd' : '—'),
    vertrektijd_terug: res.ferry_return_time
      ? res.ferry_return_time.slice(0, 5)
      : (res.ferry_return_custom_time ? res.ferry_return_custom_time.slice(0, 5) : '—'),
    totaal_bedrag: `€ ${parseFloat(res.total_price).toFixed(2).replace('.', ',')}`,
    annuleringslink: `${baseUrl}/annuleren/${res.cancellation_token}`,
    wijzigingslink: `${baseUrl}/wijzigen/${res.cancellation_token}`,
    whatsapp_nummer: settings['company_whatsapp'] || '31612345678',
  });
}

export async function sendCheckinMail(
  reservationId: string,
  parkingSpot?: string,
  extraMessage?: string
): Promise<void> {
  const result = await query(
    `SELECT r.*, c.first_name, c.email FROM reservations r
     JOIN customers c ON c.id = r.customer_id WHERE r.id = $1`,
    [reservationId]
  );
  if (result.rows.length === 0) throw new Error('Reservation not found');
  const res = result.rows[0];

  const vehicleResult = await query(
    'SELECT license_plate FROM vehicles WHERE reservation_id = $1 ORDER BY sort_order LIMIT 1',
    [reservationId]
  );

  const settings = await query(
    "SELECT value FROM settings WHERE key = 'company_whatsapp'"
  );

  const now = new Date();
  const inchecktijd = now.toLocaleTimeString('nl-NL', {
    hour: '2-digit', minute: '2-digit',
  });

  await sendTemplatedEmail('checkin_confirmation', res.email, {
    voornaam: res.first_name,
    kenteken: vehicleResult.rows[0]?.license_plate || res.reference,
    reference: res.reference,
    inchecktijd,
    vaknummer: parkingSpot || '',
    extra_bericht: extraMessage || '',
    whatsapp_nummer: settings.rows[0]?.value || '31612345678',
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
  refundPct: number
): Promise<void> {
  const result = await query(
    `SELECT r.*, c.first_name, c.email FROM reservations r
     JOIN customers c ON c.id = r.customer_id WHERE r.id = $1`,
    [reservationId]
  );
  if (result.rows.length === 0) return;
  const res = result.rows[0];

  const settings = await query(
    "SELECT value FROM settings WHERE key = 'company_whatsapp'"
  );

  await sendTemplatedEmail('cancellation_confirmed', res.email, {
    voornaam: res.first_name,
    reference: res.reference,
    restitutie_bedrag: `€ ${refundAmount.toFixed(2).replace('.', ',')}`,
    restitutie_pct: refundPct,
    whatsapp_nummer: settings.rows[0]?.value || '31612345678',
  });
}

export async function sendModificationMail(
  reservationId: string,
  diff: {
    oldArrival: string; oldDeparture: string;
    oldPrice: number; newPrice: number;
    netRefund: number; netDue: number; modFee: number;
  }
): Promise<void> {
  const result = await query(
    `SELECT r.*, c.first_name, c.email FROM reservations r
     JOIN customers c ON c.id = r.customer_id WHERE r.id = $1`,
    [reservationId]
  );
  if (result.rows.length === 0) return;
  const res = result.rows[0];

  const settingsResult = await query(
    "SELECT key, value FROM settings WHERE key IN ('company_whatsapp','booking_url')"
  );
  const settings = Object.fromEntries(settingsResult.rows.map((r: any) => [r.key, r.value]));
  const baseUrl = settings['booking_url'] || 'https://parkeren-harlingen.nl';

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('nl-NL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  let verschilType = 'geen';
  let verschilBedrag = '€ 0,00';
  if (diff.netDue > 0) { verschilType = 'bijbetaling'; verschilBedrag = `€ ${diff.netDue.toFixed(2).replace('.', ',')}` ; }
  else if (diff.netRefund > 0) { verschilType = 'restitutie'; verschilBedrag = `€ ${diff.netRefund.toFixed(2).replace('.', ',')}`; }

  await sendTemplatedEmail('reservation_modified', res.email, {
    voornaam: res.first_name,
    reference: res.reference,
    oude_aankomst: fmtDate(diff.oldArrival),
    oude_vertrek: fmtDate(diff.oldDeparture),
    nieuwe_aankomst: fmtDate(res.arrival_date),
    nieuwe_vertrek: fmtDate(res.departure_date),
    oud_bedrag: `€ ${diff.oldPrice.toFixed(2).replace('.', ',')}`,
    nieuw_bedrag: `€ ${diff.newPrice.toFixed(2).replace('.', ',')}`,
    verschil_type: verschilType,
    verschil_bedrag: verschilBedrag,
    wijzigingstoeslag: diff.modFee > 0 ? `€ ${diff.modFee.toFixed(2).replace('.', ',')}` : 'geen',
    annuleringslink: `${baseUrl}/annuleren/${res.cancellation_token}`,
    wijzigingslink: `${baseUrl}/wijzigen/${res.cancellation_token}`,
    whatsapp_nummer: settings['company_whatsapp'] || '31612345678',
  });
}
