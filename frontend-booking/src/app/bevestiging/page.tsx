'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function BevestigingContent() {
  const params = useSearchParams();
  const status = params.get('redirect_status');
  const paymentIntent = params.get('payment_intent');
  const [state, setState] = useState<'loading' | 'success' | 'failed'>('loading');

  useEffect(() => {
    if (status === 'succeeded' || !status) {
      setState('success');
    } else {
      setState('failed');
    }
  }, [status]);

  if (state === 'loading') {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: '#7090b0' }}>
        Betaling verifiëren...
      </div>
    );
  }

  if (state === 'failed') {
    return (
      <div style={{ maxWidth: 540, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>❌</div>
        <h1 style={{ color: '#c83232', fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
          Betaling mislukt
        </h1>
        <p style={{ color: '#556070', fontSize: 15, marginBottom: 28 }}>
          Er is iets misgegaan bij de betaling. Probeer het opnieuw of neem contact met ons op.
        </p>
        <a href="/boeken"
          style={{ display: 'inline-block', padding: '12px 28px', background: '#0a7c6e', color: 'white', borderRadius: 9, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
          Opnieuw proberen
        </a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 580, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
      <h1 style={{ color: '#0a2240', fontSize: 26, fontWeight: 800, marginBottom: 12 }}>
        Betaling geslaagd!
      </h1>
      <p style={{ color: '#556070', fontSize: 16, marginBottom: 8, lineHeight: 1.6 }}>
        Je reservering is bevestigd. Je ontvangt zo een bevestigingsmail met alle details.
      </p>
      <p style={{ color: '#7090b0', fontSize: 13, marginBottom: 32 }}>
        Heb je geen e-mail ontvangen? Controleer dan je spammap of neem contact met ons op.
      </p>

      <div style={{ background: '#f0faf8', border: '1.5px solid #0a7c6e', borderRadius: 12, padding: '20px 24px', marginBottom: 32, textAlign: 'left' }}>
        <h2 style={{ color: '#0a7c6e', fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>
          📍 Autostalling De Bazuin
        </h2>
        <p style={{ color: '#556070', fontSize: 13, margin: 0, lineHeight: 1.7 }}>
          Franekereind 38, 8801 KM Franeker<br />
          📞 <a href="tel:+31517395252" style={{ color: '#0a7c6e' }}>0517 – 39 52 52</a><br />
          ✉️ <a href="mailto:info@autostallingdebazuin.nl" style={{ color: '#0a7c6e' }}>info@autostallingdebazuin.nl</a>
        </p>
      </div>

      <a href="/"
        style={{ display: 'inline-block', padding: '12px 28px', background: '#0a2240', color: 'white', borderRadius: 9, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
        Terug naar home
      </a>
    </div>
  );
}

export default function BevestigingPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingTop: 40 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <img src="/logo.png" alt="Autostalling De Bazuin" style={{ height: 48, objectFit: 'contain' }} onError={e => (e.currentTarget.style.display = 'none')} />
      </div>
      <Suspense fallback={<div style={{ textAlign: 'center', color: '#7090b0' }}>Laden...</div>}>
        <BevestigingContent />
      </Suspense>
    </div>
  );
}
