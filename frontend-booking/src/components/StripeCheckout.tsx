'use client';
import { useState, useEffect } from 'react';
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
  onSuccess: () => void;
  onError: (msg: string) => void;
}

function CheckoutForm({ totalAmount, onSuccess, onError }: Omit<Props, 'reservationId' | 'clientSecret'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/bevestiging`,
        },
        redirect: 'if_required',
      });

      if (error) {
        onError(error.message || 'Betaling mislukt');
      } else if (paymentIntent?.status === 'succeeded') {
        onSuccess();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement options={{ layout: 'tabs' }} />
      <button
        type="submit"
        disabled={!stripe || loading}
        style={{
          width: '100%',
          marginTop: 20,
          padding: '13px',
          borderRadius: 9,
          background: loading ? '#7090b0' : '#e8a020',
          color: '#0a2240',
          border: 'none',
          fontSize: 15,
          fontWeight: 800,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Verwerken...' : `Betalen — € ${totalAmount.toFixed(2)}`}
      </button>
    </form>
  );
}

export default function StripeCheckout({ clientSecret, totalAmount, onSuccess, onError }: Props) {
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
      <CheckoutForm totalAmount={totalAmount} onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
}
