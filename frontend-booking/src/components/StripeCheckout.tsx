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
  // Creditcard vereist dat de klant de kaartgegevens invoert → formulier tonen
  // en pas bevestigen na een klik. Redirect-methodes (iDEAL/PayPal/Bancontact)
  // worden direct doorgestuurd, zonder invoer op de pagina.
  const isCardInput = payMethod === 'card';
  const [status, setStatus] = useState<'loading' | 'ready' | 'confirming' | 'error'>('loading');
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
        // Bij creditcard: formulier laten staan zodat de klant kan corrigeren.
        submitted.current = false;
        setStatus(isCardInput ? 'ready' : 'error');
        onError(error.message || 'Betaling mislukt');
      } else if (paymentIntent?.status === 'succeeded') {
        onSuccess();
      } else if (paymentIntent?.status === 'processing') {
        // Betaling wordt nog verwerkt; de webhook bevestigt definitief. Door naar bevestiging.
        onSuccess();
      } else {
        // Onverwachte/niet-afgeronde status (bv. requires_payment_method) — niet blijven hangen.
        submitted.current = false;
        setStatus(isCardInput ? 'ready' : 'error');
        onError('Betaling kon niet worden afgerond. Probeer het opnieuw.');
      }
    } catch {
      submitted.current = false;
      setStatus(isCardInput ? 'ready' : 'error');
      onError('Er is een fout opgetreden bij de betaling.');
    }
  }

  return (
    <div>
      {/* Bij creditcard zichtbaar (kaartinvoer); bij redirect-methodes verborgen. */}
      <div style={{ display: isCardInput ? 'block' : 'none' }}>
        <PaymentElement
          options={{ fields: { billingDetails: { name: 'never' } } } as any}
          onReady={() => { if (isCardInput) setStatus('ready'); else confirm(); }}
        />
      </div>

      {isCardInput ? (
        <div style={{ marginTop: 16 }}>
          {status === 'loading' && (
            <div style={{ textAlign: 'center', padding: '16px 0', color: '#7090b0', fontSize: 14 }}>
              <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><ArrowPathIcon className="w-6 h-6" /></div>
              Betaalformulier laden…
            </div>
          )}
          {(status === 'ready' || status === 'confirming') && (
            <button
              onClick={confirm}
              disabled={status === 'confirming'}
              style={{
                width: '100%', padding: '14px', borderRadius: 9, border: 'none',
                background: status === 'confirming' ? '#9ab0c8' : '#19499e',
                color: 'white', fontSize: 15, fontWeight: 800,
                cursor: status === 'confirming' ? 'default' : 'pointer',
              }}>
              {status === 'confirming' ? 'Betaling verwerken…' : `Betalen € ${totalAmount.toFixed(2).replace('.', ',')}`}
            </button>
          )}
        </div>
      ) : (
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
      )}
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
