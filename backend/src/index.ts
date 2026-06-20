import 'dotenv/config';
import 'express-async-errors';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { router } from './routes/api';
// partner.routes niet aanwezig op deze server — uitgeschakeld
import { constructWebhookEvent, createCheckoutSessionForExtraPayment } from './services/stripe.service';
import { query } from './db/pool';
import { sendBookingConfirmation, sendSimpleEmail } from './services/email.service';
import { syncDoeksenScheduleDays } from './services/doeksen.service';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

/** Escape door de klant ingevoerde tekst voordat die in HTML-e-mail wordt geïnterpoleerd. */
function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Is er (weer) plek om deze reservering te plaatsen? Telt zowel de nacht- als de
 * dagcapaciteit (wisselpiek), exclusief geannuleerde reserveringen en deze
 * reservering zelf. Gebruikt bij een late betaling op een verlopen reservering:
 * is er plek → gewoon heractiveren; zitten we vol → klant moet contact opnemen.
 */
async function hasSpaceForReservation(reservationId: string): Promise<boolean> {
  const r = await query(
    `SELECT r.parking_lot_id,
            r.arrival_date::text   AS arrival_date,
            r.departure_date::text AS departure_date,
            (SELECT COUNT(*) FROM vehicles v WHERE v.reservation_id = r.id) AS vc
     FROM reservations r WHERE r.id = $1`,
    [reservationId]
  );
  if (r.rows.length === 0) return false;
  const lotId = r.rows[0].parking_lot_id;
  const arr = String(r.rows[0].arrival_date).slice(0, 10);
  const dep = String(r.rows[0].departure_date).slice(0, 10);
  const vc = parseInt(r.rows[0].vc) || 1;

  const lot = await query(
    `SELECT l.online_spots, COALESCE(l.daytime_spots, l.online_spots) AS daytime_spots
     FROM parking_lots pl JOIN locations l ON l.id = pl.location_id WHERE pl.id = $1`,
    [lotId]
  );
  const onlineSpots = lot.rows[0]?.online_spots ?? 50;
  const daytimeSpots = lot.rows[0]?.daytime_spots ?? onlineSpots;

  const cap = await query(
    `WITH nights AS (
       SELECT generate_series($2::date, $3::date - '1 day'::interval, '1 day'::interval)::date AS night
     ),
     night_cap AS (
       SELECT n.night, COALESCE(ao.available_spots, $4) AS maxs,
              (SELECT COUNT(DISTINCT v.id) FROM reservations res2 JOIN vehicles v ON v.reservation_id = res2.id
               WHERE res2.parking_lot_id = $1 AND res2.status NOT IN ('cancelled') AND res2.id <> $5
                 AND res2.arrival_date <= n.night AND res2.departure_date > n.night) AS booked
       FROM nights n LEFT JOIN availability_overrides ao ON ao.parking_lot_id = $1 AND ao.override_date = n.night
     ),
     days AS (
       SELECT generate_series($2::date, $3::date, '1 day'::interval)::date AS day
     ),
     day_cap AS (
       SELECT d.day, COALESCE(ao.daytime_spots, $6) AS maxd,
              (SELECT COUNT(DISTINCT v.id) FROM reservations res3 JOIN vehicles v ON v.reservation_id = res3.id
               WHERE res3.parking_lot_id = $1 AND res3.status NOT IN ('cancelled') AND res3.id <> $5
                 AND res3.arrival_date <= d.day AND res3.departure_date >= d.day) AS present
       FROM days d LEFT JOIN availability_overrides ao ON ao.parking_lot_id = $1 AND ao.override_date = d.day
     )
     SELECT COALESCE((SELECT MIN(maxs - booked) FROM night_cap), $4) AS night_av,
            COALESCE((SELECT MIN(maxd - present) FROM day_cap), $6) AS day_av`,
    [lotId, arr, dep, onlineSpots, reservationId, daytimeSpots]
  );
  const nightAv = parseInt(cap.rows[0].night_av) || 0;
  const dayAv = parseInt(cap.rows[0].day_av) || 0;
  return Math.min(nightAv, dayAv) >= vc;
}

// Vertel Express dat hij achter een reverse proxy (nginx) draait.
// Nodig voor express-rate-limit zodat X-Forwarded-For correct wordt verwerkt.
app.set('trust proxy', 1);

// ── Stripe webhook MUST come before body parser ───────────────
app.post(
  '/api/v1/payments/webhook',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;
    if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(400).json({ error: 'Webhook niet geconfigureerd' });
    }

    let event;
    try {
      event = constructWebhookEvent(req.body as Buffer, sig);
    } catch (err: any) {
      console.error('Stripe webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook fout: ${err.message}` });
    }

    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const intent = event.data.object as any;
          const reservationId = intent.metadata?.reservation_id;
          console.log(`[Webhook] payment_intent.succeeded — intent=${intent.id}, reservationId=${reservationId}`);
          if (reservationId) {
            // Haal huidige status op om onderscheid te maken
            const currentRes = await query(
              `SELECT status, payment_status FROM reservations WHERE id = $1`,
              [reservationId]
            );
            const currentStatus = currentRes.rows[0]?.status;

            if (currentStatus === 'cancelled') {
              // ── Betaling ontvangen voor VERLOPEN/GEANNULEERDE reservering ─────
              // Is er nog plek? Dan heractiveren we de reservering gewoon en is een
              // "neem contact op"-mail overbodig. Zitten we inmiddels vol, dan
              // markeren we voor handmatige controle en mailen we de klant.
              const spaceLeft = await hasSpaceForReservation(reservationId).catch(() => false);

              if (spaceLeft) {
                const reactivate = await query(
                  `UPDATE reservations
                   SET payment_status = 'paid', status = 'booked',
                       stripe_payment_intent_id = $1,
                       admin_notes = COALESCE(admin_notes, '') || E'\n[Heractiveerd na late betaling — er was nog plek beschikbaar]',
                       updated_at = NOW()
                   WHERE id = $2
                     AND payment_status NOT IN ('paid', 'refunded', 'partial_refund')`,
                  [intent.id, reservationId]
                );
                if ((reactivate.rowCount ?? 0) > 0) {
                  console.log(`[Webhook] Verlopen reservering ${reservationId} heractiveerd na betaling (plek beschikbaar)`);
                  sendBookingConfirmation(reservationId).catch(err =>
                    console.error('Bevestigingsmail na heractivering mislukt:', err)
                  );
                }
              } else {
                // Geen plek meer → markeer voor handmatige controle en mail de klant.
                const flagResult = await query(
                  `UPDATE reservations
                   SET payment_status = 'paid',
                       stripe_payment_intent_id = $1,
                       admin_notes = COALESCE(admin_notes, '') || E'\n[⚠️ BETALING ONTVANGEN NA ANNULERING — geen plek meer, handmatige controle vereist]',
                       updated_at = NOW()
                   WHERE id = $2
                     AND payment_status NOT IN ('paid', 'refunded', 'partial_refund')`,
                  [intent.id, reservationId]
                );
                if ((flagResult.rowCount ?? 0) > 0) {
                  console.warn(`[Webhook] ⚠️ Betaling ontvangen voor GEANNULEERDE reservering ${reservationId} terwijl vol — handmatige controle vereist`);
                  const resData = await query(
                    `SELECT r.reference, c.first_name, c.email, r.arrival_date, r.departure_date, r.total_price
                     FROM reservations r JOIN customers c ON c.id = r.customer_id WHERE r.id = $1`,
                    [reservationId]
                  );
                  if (resData.rows.length > 0) {
                    const { first_name, email, reference, arrival_date, departure_date, total_price } = resData.rows[0];
                    const fmt = (d: string) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
                    sendSimpleEmail(
                      email,
                      `Uw betaling is ontvangen — neem contact met ons op (${reference})`,
                      `<p>Beste ${escapeHtml(first_name)},</p>
                      <p>Wij hebben uw betaling van <strong>€ ${Number(total_price).toFixed(2).replace('.', ',')}</strong> ontvangen voor reservering <strong>${reference}</strong> (${fmt(arrival_date)} – ${fmt(departure_date)}).</p>
                      <p>Helaas was uw reservering op het moment van betaling al verlopen omdat de betalingstermijn was overschreden, en is de stalling inmiddels vol.</p>
                      <p><strong>Neem zo spoedig mogelijk contact met ons op via WhatsApp op 0517-412986</strong>, dan bespreken we hoe we dit voor u kunnen oplossen — of storten we uw betaling terug als er geen plek meer beschikbaar is.</p>
                      <p>Met vriendelijke groet,<br>Autostalling De Bazuin</p>`
                    ).catch(err => console.error('[Webhook] Klant-email na geannuleerde betaling mislukt:', err));
                  }
                }
              }
            } else {
              // ── Normale flow: reservering heractiveren na betaling ─────────────
              // Tolerate 'failed' status (cleanup job may have run before payment arrived)
              // but don't override already-paid or refunded reservations
              const updateResult = await query(
                `UPDATE reservations
                 SET payment_status = 'paid',
                     status = 'booked',
                     stripe_payment_intent_id = $1,
                     updated_at = NOW()
                 WHERE id = $2
                   AND payment_status NOT IN ('paid', 'refunded', 'partial_refund')`,
                [intent.id, reservationId]
              );
              console.log(`[Webhook] UPDATE rows affected: ${updateResult.rowCount} (reservation=${reservationId})`);
              if ((updateResult.rowCount ?? 0) > 0) {
                // Stuur bevestigingsmail na succesvolle betaling
                sendBookingConfirmation(reservationId).catch(err =>
                  console.error('Bevestigingsmail na betaling mislukt:', err)
                );
                console.log(`[Webhook] Betaling bevestigd voor reservering ${reservationId}`);
              } else {
                // Controleer of reservering al betaald was
                const check = await query(
                  `SELECT payment_status, status FROM reservations WHERE id = $1`,
                  [reservationId]
                );
                console.warn(`[Webhook] Geen update — huidige status:`, check.rows[0] ?? 'niet gevonden');
              }
            }
          } else {
            console.warn(`[Webhook] payment_intent.succeeded zonder reservation_id in metadata — intent=${intent.id}`);
          }
          break;
        }

        case 'payment_intent.payment_failed': {
          const intent = event.data.object as any;
          const reservationId = intent.metadata?.reservation_id;
          if (reservationId) {
            await query(
              `UPDATE reservations SET payment_status = 'failed' WHERE id = $1`,
              [reservationId]
            );
            console.warn(`Betaling mislukt voor reservering ${reservationId}`);
          }
          break;
        }

        case 'checkout.session.completed': {
          const session = event.data.object as any;
          if (session.metadata?.type === 'contract_invoice' && session.metadata?.contract_invoice_id) {
            await query(`UPDATE contract_invoices SET paid_at = NOW() WHERE id = $1 AND paid_at IS NULL`, [session.metadata.contract_invoice_id]);
            console.log(`[Webhook] contractfactuur betaald — invoice=${session.metadata.contract_invoice_id}`);
          }
          if (session.metadata?.type === 'extra_payment') {
            const reservationId = session.metadata.reservation_id;
            const modificationId = session.metadata.modification_id;
            console.log(`[Webhook] checkout.session.completed extra_payment — reservation=${reservationId}, modification=${modificationId}`);
            if (reservationId && modificationId) {
              // Mark modification as completed (paid online)
              await query(
                `UPDATE reservation_modifications SET status='completed', accepted_at=NOW() WHERE id=$1 AND status='pending_payment'`,
                [modificationId]
              );
              // Check if all pending payments for this reservation are resolved
              const pending = await query(
                `SELECT COUNT(*) as cnt FROM reservation_modifications WHERE reservation_id=$1 AND status='pending_payment'`,
                [reservationId]
              );
              if (parseInt(pending.rows[0].cnt) === 0) {
                await query(
                  `UPDATE reservations SET payment_status='paid', updated_at=NOW() WHERE id=$1`,
                  [reservationId]
                );
              }
            }
          }
          break;
        }

        case 'charge.refunded': {
          const charge = event.data.object as any;
          // Match via payment_intent ID
          if (charge.payment_intent) {
            // Neem het werkelijk gerestitueerde bedrag van Stripe over (cumulatief, in centen).
            // Anders blijft refund_amount NULL en wordt een VOLLEDIGE refund (bv. vanuit het
            // Stripe-dashboard) ten onrechte als 'partial_refund' geregistreerd.
            const refundedEuros = (charge.amount_refunded ?? 0) / 100;
            await query(
              `UPDATE reservations
               SET refund_amount = $2,
                   payment_status = CASE
                     WHEN $2 >= total_price THEN 'refunded'
                     ELSE 'partial_refund'
                   END,
                   updated_at = NOW()
               WHERE stripe_payment_intent_id = $1`,
              [charge.payment_intent, refundedEuros]
            );
          }
          break;
        }

        default:
          // Overige events negeren
          break;
      }
    } catch (err) {
      console.error('Webhook verwerking mislukt:', err);
      // Geef 200 terug zodat Stripe niet opnieuw probeert
    }

    res.json({ received: true });
  }
);

// ── Security middleware ───────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_BOOKING_URL || 'http://localhost:3000',
      process.env.FRONTEND_ADMIN_URL || 'http://localhost:3002',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3002',
      'https://cms.autostallingdebazuin.nl',
      'https://www.parkeren-harlingen.nl',
      'https://parkeren-harlingen.nl',
      'https://booking.parkeren-harlingen.nl',
    ];
    // Allow no-origin requests (mobile apps, Postman, curl)
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS geblokkeerd: ${origin}`));
    }
  },
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 3000,
  standardHeaders: true, legacyHeaders: false,
  // Interne/localhost-verzoeken (sync, backfill, health) niet meetellen,
  // zodat ze het admin-/klantverkeer nooit kunnen blokkeren.
  skip: (req) => {
    const ip = req.ip || '';
    return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('::ffff:127.');
  },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { error: 'Te veel inlogpogingen. Probeer het over 15 minuten opnieuw.' },
});
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 30,
  message: { error: 'Te veel boekingspogingen. Probeer het later opnieuw.' },
});

app.use('/api/v1', generalLimiter);
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/reservations', bookingLimiter);

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Routes ────────────────────────────────────────────────────
// Partner-API (X-API-Key) — o.a. Harlingen Watertaxi, mag in de buffer boeken
// app.use('/api/v1/partner', partnerRouter); // partner.routes niet aanwezig
app.use('/api/v1', router);

// ── Health check (no auth) ────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', ts: new Date().toISOString() });
});

// ── 404 handler ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint niet gevonden' });
});

// ── Error handler ─────────────────────────────────────────────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;

  if (process.env.NODE_ENV !== 'production') {
    console.error(`[${status}] ${err.message}`, err.stack?.split('\n')[1] || '');
  }

  // Zend nooit interne details naar de client in productie
  const message = process.env.NODE_ENV === 'production' && status >= 500
    ? 'Er is een interne fout opgetreden'
    : err.message || 'Onbekende fout';

  res.status(status).json({ error: message });
});

// ── Doeksen sync ─────────────────────────────────────────────
// Dagelijkse achtergrond-sync: haal de komende 14 dagen op bij Doeksen
// en sla ze op in ferry_schedules (ON CONFLICT DO NOTHING = bestaande data blijft).
// Draait direct bij opstart en daarna elke 24 uur.
async function runDoeksenSync() {
  try {
    console.log('[Doeksen] Dagelijkse sync gestart (14 dagen vooruit)...');
    await syncDoeksenScheduleDays(14);
    console.log('[Doeksen] Dagelijkse sync voltooid');
  } catch (err: any) {
    console.error('[Doeksen] Dagelijkse sync mislukt:', err.message);
  }
}
// Direct bij opstart (na korte vertraging zodat de DB-verbinding klaar is)
setTimeout(runDoeksenSync, 5000);
// Elke 24 uur herhalen
setInterval(runDoeksenSync, 24 * 60 * 60 * 1000);

// ── Cleanup verlaten betalingen (elke minuut) ─────────────────
// Reserveringen met status 'pending_payment' ouder dan 30 minuten
// worden geannuleerd zodat de plekken weer vrijkomen.
// De klant ontvangt een e-mail zodat hij weet wat er is misgegaan.
setInterval(async () => {
  try {
    const result = await query(
      `UPDATE reservations
       SET status = 'cancelled', payment_status = 'failed',
           admin_notes = COALESCE(admin_notes, '') || E'\n[Automatisch geannuleerd: betaling niet voltooid binnen 30 minuten]',
           updated_at = NOW()
       WHERE status = 'pending_payment'
         AND created_at < NOW() - INTERVAL '30 minutes'
       RETURNING id, reference`
    );
    if (result.rows.length > 0) {
      console.log(`[Cleanup] ${result.rows.length} verlaten reservering(en) geannuleerd:`,
        result.rows.map((r: any) => r.reference).join(', '));

      // Stuur elke geannuleerde klant een e-mail
      for (const row of result.rows as any[]) {
        try {
          const resData = await query(
            `SELECT r.reference, r.arrival_date, r.departure_date, r.total_price,
                    c.first_name, c.email
             FROM reservations r JOIN customers c ON c.id = r.customer_id
             WHERE r.id = $1`,
            [row.id]
          );
          if (resData.rows.length === 0) continue;
          const { first_name, email, reference, arrival_date, departure_date, total_price } = resData.rows[0];
          const fmt = (d: string) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
          await sendSimpleEmail(
            email,
            `Uw reservering is verlopen — ${reference}`,
            `<p>Beste ${first_name},</p>
            <p>Uw reservering <strong>${reference}</strong> (${fmt(arrival_date)} – ${fmt(departure_date)}, € ${Number(total_price).toFixed(2).replace('.', ',')}) is helaas verlopen omdat de betaling niet binnen 30 minuten is ontvangen.</p>
            <p>Uw parkeerplek is daardoor vrijgegeven. Als u nog wilt parkeren, kunt u een <a href="${process.env.FRONTEND_BOOKING_URL || 'https://parkeren-harlingen.nl'}">nieuwe reservering</a> plaatsen.</p>
            <p>Heeft u al wél betaald maar dit bericht ontvangen? Neem dan direct contact met ons op — dan lossen we dit samen op.</p>
            <p>Met vriendelijke groet,<br>Autostalling De Bazuin</p>`
          );
        } catch (mailErr: any) {
          console.error(`[Cleanup] E-mail aan klant mislukt voor ${row.reference}:`, mailErr.message);
        }
      }
    }
  } catch (err: any) {
    console.error('[Cleanup] Fout bij opruimen verlaten reserveringen:', err.message);
  }
}, 60 * 1000);

// ── Auto-checkout: checked_in met verstreken vertrekdatum (elke nacht) ────────
// Reserveringen die checked_in zijn maar waarvan de vertrekdatum al gepasseerd is
// worden automatisch op 'completed' gezet zodat de bezetting klopt.
setInterval(async () => {
  try {
    const result = await query(
      `UPDATE reservations
       SET status = 'completed',
           admin_notes = COALESCE(admin_notes, '') || E'\n[Automatisch uitgecheckt: vertrekdatum verstreken]',
           updated_at = NOW()
       WHERE status = 'checked_in'
         AND departure_date < CURRENT_DATE
       RETURNING id, reference`
    );
    if (result.rows.length > 0) {
      console.log(`[AutoCheckout] ${result.rows.length} reservering(en) automatisch uitgecheckt:`,
        result.rows.map((r: any) => r.reference).join(', '));
    }
  } catch (err: any) {
    console.error('[AutoCheckout] Fout bij automatisch uitchecken:', err.message);
  }
}, 60 * 60 * 1000); // elk uur

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const env = process.env.NODE_ENV || 'development';
  console.log(`
╔═══════════════════════════════════════════════╗
║   Autostalling De Bazuin — API Server         ║
║   http://localhost:${PORT}  [${env.padEnd(11)}]       ║
║   ${new Date().toLocaleString('nl-NL').padEnd(43)}║
╚═══════════════════════════════════════════════╝
  `);
  // Geen automatische Doeksen-sync bij opstart
});

export default app;
