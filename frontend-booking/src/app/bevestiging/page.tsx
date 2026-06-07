'use client';
import { useEffect, useState, Suspense } from 'react';
import {
  CheckCircleIcon, XCircleIcon, ClipboardDocumentListIcon, MapPinIcon,
  PhoneIcon, EnvelopeIcon, DocumentTextIcon, ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { useSearchParams } from 'next/navigation';
import { formatPlate } from '@/lib/plate';

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
  ferry_return_arrival_harlingen?: string;
  on_site_surcharge?: string;
  payment_surcharge?: string;
  vehicles: { license_plate: string }[];
  services: { name: string; quantity: number; unit_price: string; total_price: string }[];
}

function fmtDate(iso: string) {
  return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function fmtMoney(n: number) {
  return `€ ${n.toFixed(2).replace('.', ',')}`;
}
function fmtTime(t?: string) {
  return t ? String(t).slice(0, 5) : null;
}
function daysBetween(a: string, b: string) {
  // Tel aankomst- én vertrekdag mee (kalenderdag-model, niet nachten)
  return Math.max(2, Math.round(
    (new Date(String(b).slice(0,10)+'T12:00:00').getTime() -
     new Date(String(a).slice(0,10)+'T12:00:00').getTime()) / 86400000
  ) + 1);
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
        <div style={{ marginBottom: 16, color: '#c83232', display: 'flex', justifyContent: 'center' }}><XCircleIcon className="w-14 h-14" /></div>
        <h1 style={{ color: '#c83232', fontSize: 24, fontWeight: 800, marginBottom: 12 }}>Betaling mislukt</h1>
        <p style={{ color: '#556070', fontSize: 15, marginBottom: 28 }}>
          Er is iets misgegaan bij de betaling. Probeer het opnieuw of neem contact met ons op.
        </p>
        <a href="/boeken" style={{ display: 'inline-block', padding: '12px 28px', background: '#19499e', color: 'white', borderRadius: 9, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
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
    ? reservation.services.reduce((s, sv) => s + (parseFloat(sv.total_price) || 0), 0)
    : 0;
  const paymentSurcharge = reservation ? (parseFloat(reservation.payment_surcharge || '0') || 0) : 0;
  const onSiteSurcharge = reservation ? (parseFloat(reservation.on_site_surcharge || '0') || 0) : 0;
  const parkTotal = reservation
    ? parseFloat(reservation.total_price) - servicesTotal - paymentSurcharge - onSiteSurcharge
    : 0;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 20px 60px' }}>
      {/* Succes header */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ marginBottom: 10, color: '#19499e', display: 'flex', justifyContent: 'center' }}><CheckCircleIcon className="w-16 h-16" /></div>
        <h1 style={{ color: '#142440', fontSize: 26, fontWeight: 800, marginBottom: 8 }}>
          {reservation ? `Bedankt, ${reservation.first_name}!` : 'Betaling geslaagd!'}
        </h1>
        <p style={{ color: '#556070', fontSize: 15, lineHeight: 1.6, margin: 0 }}>
          Je reservering is bevestigd. Je ontvangt een bevestigingsmail
          {reservation ? <> op<br /><strong style={{ color: '#142440', fontSize: 17 }}>{reservation.email}</strong></> : ''}.
        </p>
      </div>

      {/* Reserveringsoverzicht */}
      {reservation && (
        <div style={{ background: 'white', border: '1px solid rgba(10,34,64,0.1)', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ background: '#142440', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'white', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}><ClipboardDocumentListIcon className="w-4 h-4" />Jouw reservering</span>
            <span style={{ color: '#aab8cc', fontSize: 13 }}>Ref: {reservation.reference}</span>
          </div>

          <div style={{ padding: '18px 20px' }}>
            {/* Datums + boottijden */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#f0faf8', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#7090b0', fontWeight: 600, marginBottom: 3 }}>AANKOMST</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#142440' }}>{fmtDate(reservation.arrival_date)}</div>
                {fmtTime(reservation.ferry_outbound_time) && (
                  <div style={{ fontSize: 12, color: '#0a6050', fontWeight: 700, marginTop: 4 }}>
                    Boot vertrekt {fmtTime(reservation.ferry_outbound_time)}
                  </div>
                )}
              </div>
              <div style={{ background: '#f0faf8', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#7090b0', fontWeight: 600, marginBottom: 3 }}>VERTREK</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#142440' }}>{fmtDate(reservation.departure_date)}</div>
                {(fmtTime(reservation.ferry_return_arrival_harlingen) || fmtTime(reservation.ferry_return_time)) && (
                  <div style={{ fontSize: 12, color: '#0a6050', fontWeight: 700, marginTop: 4 }}>
                    {fmtTime(reservation.ferry_return_arrival_harlingen)
                      ? `Aankomst Harlingen ${fmtTime(reservation.ferry_return_arrival_harlingen)}`
                      : `Boot vertrekt ${fmtTime(reservation.ferry_return_time)}`}
                  </div>
                )}
              </div>
            </div>

            {/* Voertuigen — EU-kentekenstijl */}
            {reservation.vehicles.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#7090b0', fontWeight: 600, marginBottom: 4 }}>VOERTUIG{reservation.vehicles.length > 1 ? 'EN' : ''}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {reservation.vehicles.map((v, i) => (
                    <div key={i} style={{ display: 'inline-flex', alignItems: 'stretch', borderRadius: 5, border: '2px solid #111', overflow: 'hidden', background: '#f5c518', fontFamily: "'Arial Narrow', Arial, sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: 2 }}>
                      <div style={{ width: 14, background: '#003399', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 7, fontWeight: 700, letterSpacing: 0, paddingTop: 2 }}>
                        <span style={{ fontSize: 8 }}>★</span>
                        <span>NL</span>
                      </div>
                      <span style={{ padding: '4px 10px', color: '#111', textTransform: 'uppercase' }}>{formatPlate(v.license_plate)}</span>
                    </div>
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
                    <span>{fmtMoney(parseFloat(sv.total_price) || 0)}</span>
                  </div>
                ))}
                {onSiteSurcharge > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#444' }}>
                    <span>Toeslag ter plekke betalen</span>
                    <span>{fmtMoney(onSiteSurcharge)}</span>
                  </div>
                )}
                {paymentSurcharge > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#444' }}>
                    <span>Toeslag PayPal</span>
                    <span>{fmtMoney(paymentSurcharge)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: '#142440', borderTop: '1px solid rgba(10,34,64,0.12)', marginTop: 6, paddingTop: 6 }}>
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
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', background: '#f0faf8', border: '1.5px solid #19499e', borderRadius: 10, color: '#19499e', fontWeight: 700, fontSize: 14, textDecoration: 'none', marginBottom: 16 }}>
          <DocumentTextIcon className="w-4 h-4" />Factuur downloaden (PDF)
        </a>
      )}

      {/* Contact */}
      <div style={{ background: '#f8fafc', border: '1px solid rgba(10,34,64,0.08)', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#142440', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><MapPinIcon className="w-4 h-4" />Autostalling De Bazuin</div>
        <div style={{ fontSize: 13, color: '#556070', lineHeight: 1.7 }}>
          Zeilmakersstraat 2, 8861SE Harlingen<br />
          <PhoneIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle' }} /> <a href="tel:0517412986" style={{ color: '#19499e' }}>0517-412986</a>&nbsp;&nbsp;
          <EnvelopeIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle' }} /> <a href="mailto:info@parkeren-harlingen.nl" style={{ color: '#19499e' }}>info@parkeren-harlingen.nl</a>
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <a href="/" style={{ display: 'inline-block', padding: '12px 28px', background: '#142440', color: 'white', borderRadius: 9, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
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
