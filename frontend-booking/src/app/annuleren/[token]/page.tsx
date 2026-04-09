'use client';
import { useState, useEffect } from 'react';
import { bookingApi } from '@/lib/api';

export default function CancellationPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    bookingApi.getByToken(params.token)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.token]);

  async function cancel() {
    if (!confirm('Weet u zeker dat u wilt annuleren?')) return;
    setCancelling(true);
    try {
      const r = await bookingApi.cancelByToken(params.token);
      setDone(true);
    } catch (e: any) { setError(e.message); }
    finally { setCancelling(false); }
  }

  const S = {
    page: { minHeight: '100vh', background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } as const,
    card: { background: 'white', borderRadius: 14, padding: '32px 28px', maxWidth: 500, width: '100%', border: '0.5px solid rgba(10,34,64,0.1)', boxShadow: '0 4px 24px rgba(10,34,64,0.08)' } as const,
  };

  if (loading) return <div style={S.page}><div style={S.card}><p style={{ color: '#7090b0', textAlign: 'center' }}>Laden...</p></div></div>;
  if (error) return <div style={S.page}><div style={S.card}><p style={{ color: '#8a2020', textAlign: 'center' }}>{error}</p></div></div>;

  if (done) return (
    <div style={S.page}>
      <div style={{ ...S.card, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#e6f7f5', color: '#0a7c6e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 26 }}>✓</div>
        <h2 style={{ margin: '0 0 8px', color: '#0a2240' }}>Reservering geannuleerd</h2>
        <p style={{ color: '#7090b0', fontSize: 14 }}>U ontvangt een bevestiging per e-mail met informatie over de restitutie.</p>
        {data?.refundInfo && data.refundInfo.refundAmount > 0 && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: '#f4f6f9', borderRadius: 8, fontSize: 13 }}>
            Restitutie: <strong>€ {data.refundInfo.refundAmount.toFixed(2)}</strong> ({data.refundInfo.refundPct}%) — binnen 5–10 werkdagen
          </div>
        )}
      </div>
    </div>
  );

  const res = data;
  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, background: '#e8a020', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#0a2240', margin: '0 auto 12px' }}>AB</div>
          <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#0a2240' }}>Reservering annuleren</h2>
          <p style={{ margin: 0, color: '#7090b0', fontSize: 13 }}>Autostalling De Bazuin</p>
        </div>

        <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 16, color: '#0a2240', marginBottom: 10 }}>{res.reference}</div>
          {[
            ['Naam', `${res.first_name} ${res.last_name}`],
            ['Aankomst', new Date(res.arrival_date).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })],
            ['Vertrek', new Date(res.departure_date).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })],
            ['Totaal betaald', `€ ${parseFloat(res.total_price).toFixed(2)}`],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: '0.5px solid rgba(10,34,64,0.07)' }}>
              <span style={{ color: '#7090b0' }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>

        {res.refundInfo && (
          <div style={{ background: res.refundInfo.refundPct > 0 ? '#e6f7f5' : '#fdeaea', border: `0.5px solid ${res.refundInfo.refundPct > 0 ? '#0a7c6e' : '#8a2020'}`, borderRadius: 8, padding: '12px 14px', marginBottom: 20, fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: res.refundInfo.refundPct > 0 ? '#0a7c6e' : '#8a2020' }}>
              {res.refundInfo.refundPct > 0 ? `Restitutie: € ${res.refundInfo.refundAmount.toFixed(2)} (${res.refundInfo.refundPct}%)` : 'Geen restitutie van toepassing'}
            </div>
            <div style={{ color: '#7090b0', fontSize: 12 }}>{res.refundInfo.policyDescription}</div>
          </div>
        )}

        <button onClick={cancel} disabled={cancelling}
          style={{ width: '100%', padding: '13px', borderRadius: 9, background: '#8a2020', color: 'white', border: 'none', fontSize: 15, fontWeight: 700, cursor: cancelling ? 'not-allowed' : 'pointer', opacity: cancelling ? 0.7 : 1 }}>
          {cancelling ? 'Annuleren...' : 'Bevestig annulering'}
        </button>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#7090b0', marginTop: 12 }}>
          Vragen? WhatsApp ons via de bevestigingsmail.
        </p>
      </div>
    </div>
  );
}
