'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface Reservation {
  reference: string;
  arrival_date: string;
  departure_date: string;
  total_price: string;
  payment_status: string;
  payment_method: string;
  first_name: string;
  last_name: string;
  email: string;
  cancellation_token: string;
  ferry_outbound_time?: string;
  ferry_return_time?: string;
  ferry_return_custom_time?: string;
  vehicles: { license_plate: string }[];
  services: { name: string; quantity: number; price_at_booking: string }[];
}

function fmtDate(iso: string) {
  return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function fmtMoney(n: number) {
  return `€ ${n.toFixed(2).replace('.', ',')}`;
}
function daysBetween(a: string, b: string) {
  return Math.max(1, Math.round(
    (new Date(String(b).slice(0,10)+'T12:00:00').getTime() -
     new Date(String(a).slice(0,10)+'T12:00:00').getTime()) / 86400000
  ));
}

function BevestigingContent() {
  const params = useSearchParams();
  const redirectStatus = params.get('redirect_status');
  const paymentIntent = params.get('payment_intent');
  const [state, setState] = useState<'loading' | 'success' | 'failed'>('loading');
  const [reservation, setReservation] = useState<Reservation | null>(null);

  useEffect(() => {
    if (redirectStatus === 'failed') { setState('failed'); return; }

    if (paymentIntent) {
      fetch(`${API}/reservations/by-payment-intent/${paymentIntent}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) setReservation(data);
          setState('success');
        })
        .catch(() => setState('success'));
    } else {
      setState('success');
    }
  }, [paymentIntent, redirectStatus]);

  if (state === 'loading') {
    return <div style={{ textAlign: 'center', padding: '80px 20px', color: '#7090b0' }}>Betaling verifiëren...</div>;
  }

  if (state === 'failed') {
    return (
      <div style={{ maxWidth: 540, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>❌</div>
        <h1 style={{ color: '#c83232', fontSize: 24, fontWeight: 800, marginBottom: 12 }}>Betaling mislukt</h1>
        <p style={{ color: '#556070', fontSize: 15, marginBottom: 28 }}>
          Er is iets misgegaan bij de betaling. Probeer het opnieuw of neem contact met ons op.
        </p>
        <a href="/boeken" style={{ display: 'inline-block', padding: '12px 28px', background: '#0a7c6e', color: 'white', borderRadius: 9, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
          Opnieuw proberen
        </a>
      </div>
    );
  }

  const invoiceUrl = reservation
    ? `${API}/invoice/${reservation.cancellation_token}`
    : null;

  const days = reservation ? daysBetween(reservation.arrival_date, reservation.departure_date) : 0;
  const servicesTotal = reservation
    ? reservation.services.reduce((s, sv) => s + parseFloat(sv.price_at_booking) * (sv.quantity || 1), 0)
    : 0;
  const parkTotal = reservation ? parseFloat(reservation.total_price) - servicesTotal : 0;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 20px 60px' }}>
      {/* Succes header */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 64, marginBottom: 10 }}>✅</div>
        <h1 style={{ color: '#0a2240', fontSize: 26, fontWeight: 800, marginBottom: 8 }}>
          {reservation ? `Bedankt, ${reservation.first_name}!` : 'Betaling geslaagd!'}
        </h1>
        <p style={{ color: '#556070', fontSize: 15, lineHeight: 1.6, margin: 0 }}>
          Je reservering is bevestigd. Je ontvangt een bevestigingsmail{reservation ? ` op ${reservation.email}` : ''}.
        </p>
      </div>

      {/* Reserveringsoverzicht */}
      {reservation && (
        <div style={{ background: 'white', border: '1px solid rgba(10,34,64,0.1)', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ background: '#0a2240', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>📋 Jouw reservering</span>
            <span style={{ color: '#aab8cc', fontSize: 13 }}>Ref: {reservation.reference}</span>
          </div>

          <div style={{ padding: '18px 20px' }}>
            {/* Datums */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#f0faf8', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#7090b0', fontWeight: 600, marginBottom: 3 }}>AANKOMST</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0a2240' }}>{fmtDate(reservation.arrival_date)}</div>
              </div>
              <div style={{ background: '#f0faf8', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#7090b0', fontWeight: 600, marginBottom: 3 }}>VERTREK</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0a2240' }}>{fmtDate(reservation.departure_date)}</div>
              </div>
            </div>

            {/* Voertuigen */}
            {reservation.vehicles.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#7090b0', fontWeight: 600, marginBottom: 4 }}>VOERTUIG{reservation.vehicles.length > 1 ? 'EN' : ''}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {reservation.vehicles.map((v, i) => (
                    <span key={i} style={{ background: '#0a2240', color: 'white', padding: '3px 10px', borderRadius: 4, fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
                      {v.license_plate}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Kostenspecificatie */}
            <div style={{ borderTop: '1px solid rgba(10,34,64,0.08)', paddingTop: 12, marginTop: 4 }}>
              <div style={{ fontSize: 11, color: '#7090b0', fontWeight: 600, marginBottom: 8 }}>KOSTEN</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#444' }}>
                  <span>Parkeren ({days} dag{days !== 1 ? 'en' : ''})</span>
                  <span>{fmtMoney(parkTotal)}</span>
                </div>
                {reservation.services.map((sv, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#444' }}>
                    <span>{sv.name}{sv.quantity > 1 ? ` ×${sv.quantity}` : ''}</span>
                    <span>{fmtMoney(parseFloat(sv.price_at_booking) * (sv.quantity || 1))}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: '#0a2240', borderTop: '1px solid rgba(10,34,64,0.12)', marginTop: 6, paddingTop: 6 }}>
                  <span>Totaal</span>
                  <span>{fmtMoney(parseFloat(reservation.total_price))}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Factuur downloaden */}
      {invoiceUrl && (
        <a href={invoiceUrl} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', background: '#f0faf8', border: '1.5px solid #0a7c6e', borderRadius: 10, color: '#0a7c6e', fontWeight: 700, fontSize: 14, textDecoration: 'none', marginBottom: 16 }}>
          📄 Factuur downloaden (PDF)
        </a>
      )}

      {/* Contact */}
      <div style={{ background: '#f8fafc', border: '1px solid rgba(10,34,64,0.08)', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0a2240', marginBottom: 6 }}>📍 Autostalling De Bazuin</div>
        <div style={{ fontSize: 13, color: '#556070', lineHeight: 1.7 }}>
          Zeilmakersstraat 2, 8861SE Harlingen<br />
          📞 <a href="tel:0517412986" style={{ color: '#0a7c6e' }}>0517-412986</a>&nbsp;&nbsp;
          ✉️ <a href="mailto:info@autostallingdebazuin.nl" style={{ color: '#0a7c6e' }}>info@autostallingdebazuin.nl</a>
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <a href="/" style={{ display: 'inline-block', padding: '12px 28px', background: '#0a2240', color: 'white', borderRadius: 9, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
          Terug naar home
        </a>
      </div>
    </div>
  );
}

export default function BevestigingPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingTop: 40 }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <img src="/logo.png" alt="Autostalling De Bazuin" style={{ height: 48, objectFit: 'contain' }}
          onError={e => (e.currentTarget.style.display = 'none')} />
      </div>
      <Suspense fallback={<div style={{ textAlign: 'center', color: '#7090b0' }}>Laden...</div>}>
        <BevestigingContent />
      </Suspense>
    </div>
  );
}
