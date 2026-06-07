'use client';
import { useState, useRef } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
);

interface Props {
  reservationId: string;
  clientSecret: string;
  totalAmount: number;
  customerName?: string;
  payMethod?: string;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

// Label per betaalmethode voor de "doorsturen"-tekst
const METHOD_LABEL: Record<string, string> = {
  ideal: 'iDEAL',
  paypal: 'PayPal',
  bancontact: 'Bancontact',
  sepa: 'SEPA-incasso',
};

function CheckoutForm({ totalAmount, customerName, payMethod, onSuccess, onError }: Omit<Props, 'reservationId' | 'clientSecret'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [status, setStatus] = useState<'loading' | 'confirming' | 'error'>('loading');
  const submitted = useRef(false);

  async function confirm() {
    if (!stripe || !elements || submitted.current) return;
    submitted.current = true;
    setStatus('confirming');
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/boeken/bevestiging`,
          payment_method_data: customerName
            ? { billing_details: { name: customerName } }
            : undefined,
        },
        redirect: 'if_required',
      });
      if (error) {
        setStatus('error');
        onError(error.message || 'Betaling mislukt');
      } else if (paymentIntent?.status === 'succeeded') {
        onSuccess();
      } else if (paymentIntent?.status === 'processing') {
        // Betaling wordt nog verwerkt; de webhook bevestigt definitief. Door naar bevestiging.
        onSuccess();
      } else {
        // Onverwachte/niet-afgeronde status (bv. requires_payment_method) — niet blijven hangen.
        setStatus('error');
        onError('Betaling kon niet worden afgerond. Probeer het opnieuw.');
      }
    } catch {
      setStatus('error');
      onError('Er is een fout opgetreden bij de betaling.');
    }
  }

  return (
    <div>
      {/* PaymentElement verborgen maar nodig voor Stripe internals */}
      <div style={{ display: 'none' }}>
        <PaymentElement
          options={{ fields: { billingDetails: { name: 'never' } } } as any}
          onReady={confirm}
        />
      </div>
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        {status === 'loading' && (
          <>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: '#7090b0' }}><ArrowPathIcon className="w-7 h-7" /></div>
            <div style={{ fontSize: 14, color: '#7090b0' }}>Betaling voorbereiden…</div>
          </>
        )}
        {status === 'confirming' && (
          <>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: '#0a7c6e' }}><ArrowPathIcon className="w-7 h-7" /></div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0a2240', marginBottom: 6 }}>
              {payMethod && METHOD_LABEL[payMethod]
                ? `U wordt doorgestuurd naar ${METHOD_LABEL[payMethod]}…`
                : 'Betaling wordt verwerkt…'}
            </div>
            <div style={{ fontSize: 13, color: '#7090b0' }}>Even geduld, u hoeft niets te doen.</div>
          </>
        )}
        {status === 'error' && (
          <button
            onClick={() => { submitted.current = false; confirm(); }}
            style={{ padding: '12px 28px', background: '#e8a020', color: '#0a2240', border: 'none', borderRadius: 9, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
            Opnieuw proberen
          </button>
        )}
      </div>
    </div>
  );
}

export default function StripeCheckout({ clientSecret, totalAmount, customerName, payMethod, onSuccess, onError }: Props) {
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#0a7c6e',
            colorBackground: '#ffffff',
            colorText: '#0a2240',
            fontFamily: 'Inter, system-ui, sans-serif',
            borderRadius: '8px',
          },
        },
        locale: 'nl',
      }}
    >
      <CheckoutForm totalAmount={totalAmount} customerName={customerName} payMethod={payMethod} onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
}
