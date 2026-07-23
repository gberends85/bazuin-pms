import Stripe from 'stripe';
import { query } from '../db/pool';

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY niet geconfigureerd in .env');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' as any });
  }
  return _stripe;
}

// Nette NL-datum (bv. "3 juli 2026") voor in betaalomschrijvingen.
function fmtNL(d: any): string {
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Eenduidige betaalomschrijving: parkeerperiode + echt boekingsnummer.
// Verschijnt in het Stripe-dashboard én op de betaalpagina/bon die de klant ziet.
export function bookingPaymentDescription(reference: string, arrival: any, departure: any): string {
  return `Parkeren De Bazuin ${fmtNL(arrival)} t/m ${fmtNL(departure)} (boeking ${reference})`;
}

// ── Payment Intent aanmaken ──────────────────────────────────
export async function createPaymentIntent(
  reservationId: string,
  amountEuros: number,
  paymentMethod: string,
  customerEmail: string,
  customerName: string,
  reference?: string,
  arrivalDate?: any,
  departureDate?: any
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
    // Geen receipt_email: Stripe stuurt dan geen eigen betaalbewijs/receipt naar
    // de klant. Wij versturen zelf de bevestigingsmail.
    metadata: {
      reservation_id: reservationId,
      system: 'bazuin_pms',
    },
    description: reference
      ? bookingPaymentDescription(reference, arrivalDate, departureDate)
      : `Autostalling De Bazuin — reservering ${reservationId}`,
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

  // Valideer het restitutiebedrag tegen wat er daadwerkelijk is geïnd en al is terugbetaald.
  // Voorkomt over-restitutie (>100%, negatief, of dubbele restitutie bij herhaalde aanroep).
  const charge = await stripe.charges.retrieve(chargeId);
  const refundableCents = (charge.amount_captured ?? charge.amount ?? 0) - (charge.amount_refunded ?? 0);
  const requestedCents = Math.round(amountEuros * 100);
  if (!Number.isFinite(requestedCents) || requestedCents <= 0) {
    throw new Error('Ongeldig restitutiebedrag');
  }
  if (requestedCents > refundableCents) {
    throw new Error(
      `Restitutiebedrag (€${(requestedCents / 100).toFixed(2)}) overschrijdt het nog beschikbare bedrag (€${(refundableCents / 100).toFixed(2)})`
    );
  }

  const refund = await stripe.refunds.create({
    charge: chargeId,
    amount: requestedCents,
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

// ── Checkout Session voor bijbetaling (datum-wijziging) ───────
export async function createCheckoutSessionForExtraPayment(
  reservationId: string,
  modificationId: string,
  amountEuros: number,
  customerEmail: string,
  description: string,
): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  const bookingUrl = process.env.FRONTEND_BOOKING_URL || 'https://parkeren-harlingen.nl';

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['ideal', 'card'],
    mode: 'payment',
    customer_email: customerEmail,
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: { name: description },
        unit_amount: Math.round(amountEuros * 100),
      },
      quantity: 1,
    }],
    payment_intent_data: {
      description,
      metadata: {
        reservation_id: reservationId,
        modification_id: modificationId,
        type: 'extra_payment',
        system: 'bazuin_pms',
      },
    },
    metadata: {
      reservation_id: reservationId,
      modification_id: modificationId,
      type: 'extra_payment',
    },
    success_url: `${bookingUrl}/boeken/betaling-bevestigd?type=extra`,
    cancel_url: `${bookingUrl}`,
  });

  return { url: session.url!, sessionId: session.id };
}

// ── iDEAL-betaallink voor een contractfactuur (verloopt niet, max 1 betaling) ──
export async function createContractInvoicePaymentLink(opts: {
  amountCents: number; invoiceNumber: string; contractInvoiceId: string;
}): Promise<{ url: string; paymentLinkId: string }> {
  const stripe = getStripe();
  const meta = { type: 'contract_invoice', contract_invoice_id: opts.contractInvoiceId, invoice_number: opts.invoiceNumber, system: 'bazuin_pms' };
  const price = await stripe.prices.create({
    unit_amount: opts.amountCents,
    currency: 'eur',
    product_data: { name: `Factuur ${opts.invoiceNumber} — Autostalling De Bazuin` },
  });
  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    payment_method_types: ['ideal'],
    restrictions: { completed_sessions: { limit: 1 } },
    metadata: meta,
    payment_intent_data: { metadata: meta, description: `Factuur ${opts.invoiceNumber}` },
  });
  return { url: link.url, paymentLinkId: link.id };
}
