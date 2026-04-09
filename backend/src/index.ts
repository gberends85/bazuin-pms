import 'dotenv/config';
import 'express-async-errors';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { router } from './routes/api';
import { constructWebhookEvent } from './services/stripe.service';
import { query } from './db/pool';
import { sendBookingConfirmation } from './services/email.service';
import { syncDoeksenScheduleDays } from './services/doeksen.service';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

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
          if (reservationId) {
            await query(
              `UPDATE reservations
               SET payment_status = 'paid', stripe_payment_intent_id = $1
               WHERE id = $2 AND payment_status = 'pending'`,
              [intent.id, reservationId]
            );
            // Stuur bevestigingsmail (opnieuw als nog niet verzonden)
            sendBookingConfirmation(reservationId).catch(err =>
              console.error('Bevestigingsmail na betaling mislukt:', err)
            );
            console.log(`Betaling bevestigd voor reservering ${reservationId}`);
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

        case 'charge.refunded': {
          const charge = event.data.object as any;
          // Match via payment_intent ID
          if (charge.payment_intent) {
            await query(
              `UPDATE reservations
               SET payment_status = CASE
                 WHEN refund_amount >= total_price THEN 'refunded'
                 ELSE 'partial_refund'
               END
               WHERE stripe_payment_intent_id = $1`,
              [charge.payment_intent]
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
  windowMs: 15 * 60 * 1000, max: 500,
  standardHeaders: true, legacyHeaders: false,
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

// ── Doeksen dagelijkse sync ───────────────────────────────────
function scheduleDailyDoeksenSync() {
  // Direct bij opstarten: sync vandaag + 14 dagen vooruit
  syncDoeksenScheduleDays(14).catch(err =>
    console.error('Doeksen startsync mislukt:', err)
  );

  // Elke dag om 05:00 opnieuw syncen
  function scheduleNext() {
    const now = new Date();
    const next = new Date();
    next.setHours(5, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const msUntil = next.getTime() - now.getTime();
    setTimeout(() => {
      syncDoeksenScheduleDays(14).catch(err =>
        console.error('Doeksen dagsync mislukt:', err)
      );
      scheduleNext();
    }, msUntil);
    console.log(`Volgende Doeksen sync gepland om ${next.toLocaleTimeString('nl-NL')}`);
  }
  scheduleNext();
}

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
  scheduleDailyDoeksenSync();
});

export default app;
