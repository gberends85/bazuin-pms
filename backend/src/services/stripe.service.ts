import Stripe from 'stripe';
import { query } from '../db/pool';

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY niet geconfigureerd in .env');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  }
  return _stripe;
}

// ── Payment Intent aanmaken ──────────────────────────────────
export async function createPaymentIntent(
  reservationId: string,
  amountEuros: number,
  paymentMethod: string,
  customerEmail: string,
  customerName: string
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const stripe = getStripe();

  // Map onze betaalmethoden naar Stripe payment_method_types
  const methodMap: Record<string, string[]> = {
    ideal: ['ideal'],
    card: ['card'],
    bancontact: ['bancontact'],
    sepa: ['sepa_debit'],
    paypal: ['paypal'],
  };
  const methods = methodMap[paymentMethod] || ['card'];

  // Zoek of maak Stripe customer
  let stripeCustomerId: string | undefined;
  const resResult = await query(
    'SELECT stripe_customer_id FROM reservations WHERE id = $1',
    [reservationId]
  );
  if (resResult.rows[0]?.stripe_customer_id) {
    stripeCustomerId = resResult.rows[0].stripe_customer_id;
  } else {
    const customers = await stripe.customers.list({ email: customerEmail, limit: 1 });
    if (customers.data.length > 0) {
      stripeCustomerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: customerEmail,
        name: customerName,
        metadata: { reservation_id: reservationId },
      });
      stripeCustomerId = customer.id;
    }
    await query(
      'UPDATE reservations SET stripe_customer_id = $1 WHERE id = $2',
      [stripeCustomerId, reservationId]
    );
  }

  const intent = await stripe.paymentIntents.create({
    amount: Math.round(amountEuros * 100), // eurocenten
    currency: 'eur',
    customer: stripeCustomerId,
    payment_method_types: methods,
    receipt_email: customerEmail,
    metadata: {
      reservation_id: reservationId,
      system: 'bazuin_pms',
    },
    description: `Autostalling De Bazuin — reservering ${reservationId}`,
  });

  // Sla Payment Intent ID op
  await query(
    'UPDATE reservations SET stripe_payment_intent_id = $1 WHERE id = $2',
    [intent.id, reservationId]
  );

  return { clientSecret: intent.client_secret!, paymentIntentId: intent.id };
}

// ── Restitutie verwerken ──────────────────────────────────────
export async function processRefund(
  paymentIntentId: string,
  amountEuros: number,
  reason?: string
): Promise<{ refundId: string; status: string }> {
  const stripe = getStripe();

  // Haal charge op vanuit payment intent
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const chargeId = typeof intent.latest_charge === 'string'
    ? intent.latest_charge
    : intent.latest_charge?.id;

  if (!chargeId) {
    throw new Error('Geen betaling gevonden voor deze reservering — mogelijk nog niet betaald');
  }

  const refund = await stripe.refunds.create({
    charge: chargeId,
    amount: Math.round(amountEuros * 100),
    reason: 'requested_by_customer',
    metadata: { reason: reason || 'Annulering via systeem' },
  });

  return { refundId: refund.id, status: refund.status ?? 'unknown' };
}

// ── Webhook event verwerken ────────────────────────────────────
export function constructWebhookEvent(
  rawBody: Buffer,
  signature: string
): Stripe.Event {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
}

// ── Payment Intent ophalen ────────────────────────────────────
export async function getPaymentIntent(
  intentId: string
): Promise<Stripe.PaymentIntent> {
  return getStripe().paymentIntents.retrieve(intentId);
}
