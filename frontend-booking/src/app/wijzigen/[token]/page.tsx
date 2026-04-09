'use client';
import { useState, useEffect } from 'react';
import { bookingApi } from '@/lib/api';

type Step = 'loading' | 'form' | 'preview' | 'confirming' | 'done' | 'error';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function WijzigenPage({ params }: { params: { token: string } }) {
  const [step, setStep] = useState<Step>('loading');
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState('');

  // Form state
  const [newArrival, setNewArrival] = useState('');
  const [newDeparture, setNewDeparture] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [done, setDone] = useState<any>(null);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    bookingApi.getByToken(params.token)
      .then(data => {
        setRes(data);
        setNewArrival(data.arrival_date?.slice(0, 10) || '');
        setNewDeparture(data.departure_date?.slice(0, 10) || '');
        setStep('form');
      })
      .catch(e => { setError(e.message); setStep('error'); });
  }, [params.token]);

  async function calcPreview() {
    if (!newArrival || !newDeparture || newDeparture <= newArrival) {
      setError('Kies een geldige aankomst- en vertrekdatum.'); return;
    }
    if (newArrival === res.arrival_date?.slice(0, 10) && newDeparture === res.departure_date?.slice(0, 10)) {
      setError('De nieuwe datums zijn gelijk aan de huidige datums.'); return;
    }
    setError(''); setPreviewLoading(true);
    try {
      const p = await bookingApi.modificationPreview(params.token, newArrival, newDeparture);
      setPreview(p); setStep('preview');
    } catch (e: any) { setError(e.message); }
    finally { setPreviewLoading(false); }
  }

  async function confirm() {
    setStep('confirming');
    try {
      const result = await bookingApi.confirmModification(params.token, newArrival, newDeparture);
      setDone(result); setStep('done');
    } catch (e: any) { setError(e.message); setStep('preview'); }
  }

  const S = {
    page: { minHeight: '100vh', background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } as const,
    card: { background: 'white', borderRadius: 14, padding: '32px 28px', maxWidth: 520, width: '100%', border: '0.5px solid rgba(10,34,64,0.1)', boxShadow: '0 4px 24px rgba(10,34,64,0.08)' } as const,
    label: { fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block', marginBottom: 6 },
    input: { width: '100%', padding: '10px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 14, color: '#0a2240', boxSizing: 'border-box' as const },
    btnPrimary: { width: '100%', padding: '13px', borderRadius: 9, background: '#0a7c6e', color: 'white', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' } as const,
    btnGhost: { width: '100%', padding: '11px', borderRadius: 9, background: 'white', color: '#0a2240', border: '0.5px solid rgba(10,34,64,0.2)', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 10 } as const,
  };

  const Logo = () => (
    <div style={{ textAlign: 'center', marginBottom: 24 }}>
      <div style={{ width: 44, height: 44, background: '#e8a020', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#0a2240', margin: '0 auto 12px' }}>AB</div>
      <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#0a2240' }}>Reservering wijzigen</h2>
      <p style={{ margin: 0, color: '#7090b0', fontSize: 13 }}>Autostalling De Bazuin</p>
    </div>
  );

  if (step === 'loading') return (
    <div style={S.page}><div style={S.card}><p style={{ color: '#7090b0', textAlign: 'center' }}>Laden...</p></div></div>
  );

  if (step === 'error') return (
    <div style={S.page}><div style={S.card}>
      <Logo />
      <div style={{ background: '#fdeaea', borderRadius: 8, padding: '12px 14px', color: '#8a2020', fontSize: 13, textAlign: 'center' }}>{error}</div>
    </div></div>
  );

  if (step === 'done') return (
    <div style={S.page}><div style={{ ...S.card, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#e6f7f5', color: '#0a7c6e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 26 }}>✓</div>
      <h2 style={{ margin: '0 0 8px', color: '#0a2240' }}>Wijziging bevestigd!</h2>
      <p style={{ color: '#7090b0', fontSize: 14, marginBottom: 20 }}>U ontvangt een bevestiging per e-mail.</p>
      <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '16px', fontSize: 13, textAlign: 'left', marginBottom: 20 }}>
        <div style={{ marginBottom: 6 }}>
          <span style={{ color: '#7090b0' }}>Nieuwe aankomst: </span>
          <strong>{fmtDate(newArrival)}</strong>
        </div>
        <div>
          <span style={{ color: '#7090b0' }}>Nieuw vertrek: </span>
          <strong>{fmtDate(newDeparture)}</strong>
        </div>
      </div>
      {done?.netRefundAmount > 0 && (
        <div style={{ background: '#e6f7f5', border: '0.5px solid #0a7c6e', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#0a7c6e', marginBottom: 16 }}>
          U ontvangt <strong>€ {done.netRefundAmount.toFixed(2)}</strong> restitutie binnen 5–10 werkdagen.
        </div>
      )}
    </div></div>
  );

  if (step === 'preview' || step === 'confirming') return (
    <div style={S.page}><div style={S.card}>
      <Logo />

      {/* Current vs New */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Huidige boeking</div>
          <div style={{ fontSize: 12, color: '#0a2240', marginBottom: 4 }}><strong>Aankomst:</strong><br />{fmtDate(preview.currentArrival)}</div>
          <div style={{ fontSize: 12, color: '#0a2240', marginBottom: 8 }}><strong>Vertrek:</strong><br />{fmtDate(preview.currentDeparture)}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0a2240' }}>€ {parseFloat(preview.currentPrice).toFixed(2)}</div>
        </div>
        <div style={{ background: '#e6f7f5', border: '1.5px solid #0a7c6e', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0a7c6e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Nieuwe boeking</div>
          <div style={{ fontSize: 12, color: '#0a2240', marginBottom: 4 }}><strong>Aankomst:</strong><br />{fmtDate(newArrival)}</div>
          <div style={{ fontSize: 12, color: '#0a2240', marginBottom: 8 }}><strong>Vertrek:</strong><br />{fmtDate(newDeparture)}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0a7c6e' }}>€ {parseFloat(preview.newPrice).toFixed(2)}</div>
        </div>
      </div>

      {/* Price summary */}
      <div style={{ background: '#f8f9fb', borderRadius: 10, padding: '16px', marginBottom: 20 }}>
        {[
          ['Huidig bedrag', `€ ${parseFloat(preview.currentPrice).toFixed(2)}`],
          ['Nieuw bedrag', `€ ${parseFloat(preview.newPrice).toFixed(2)}`],
          ...(preview.modificationFee > 0 ? [['Wijzigingstoeslag', `€ ${preview.modificationFee.toFixed(2)}`]] : []),
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: '0.5px solid rgba(10,34,64,0.06)' }}>
            <span style={{ color: '#7090b0' }}>{k}</span>
            <span style={{ fontWeight: 600 }}>{v}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, marginTop: 4, fontSize: 14, fontWeight: 800 }}>
          {preview.netAmountDue > 0 ? (
            <>
              <span style={{ color: '#8a2020' }}>Bij te betalen</span>
              <span style={{ color: '#8a2020' }}>€ {preview.netAmountDue.toFixed(2)}</span>
            </>
          ) : preview.netRefundAmount > 0 ? (
            <>
              <span style={{ color: '#0a7c6e' }}>Restitutie</span>
              <span style={{ color: '#0a7c6e' }}>€ {preview.netRefundAmount.toFixed(2)}</span>
            </>
          ) : (
            <>
              <span style={{ color: '#7090b0' }}>Geen bijbetaling of restitutie</span>
              <span>—</span>
            </>
          )}
        </div>
      </div>

      {preview.netAmountDue > 0 && (
        <div style={{ background: '#fff8e6', border: '0.5px solid #e8a020', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#7a5010', marginBottom: 16 }}>
          U betaalt <strong>€ {preview.netAmountDue.toFixed(2)}</strong> bij. Neem contact op via WhatsApp om de bijbetaling te regelen.
        </div>
      )}

      {!preview.available && (
        <div style={{ background: '#fdeaea', border: '0.5px solid #8a2020', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#8a2020', marginBottom: 16 }}>
          Helaas zijn er onvoldoende plaatsen beschikbaar in de gekozen periode.
        </div>
      )}

      {error && (
        <div style={{ background: '#fdeaea', borderRadius: 8, padding: '10px 14px', color: '#8a2020', fontSize: 13, marginBottom: 14 }}>{error}</div>
      )}

      <button onClick={confirm}
        disabled={step === 'confirming' || !preview.available}
        style={{ ...S.btnPrimary, opacity: (!preview.available || step === 'confirming') ? 0.6 : 1 }}>
        {step === 'confirming' ? 'Bezig...' : 'Wijziging bevestigen →'}
      </button>
      <button onClick={() => { setStep('form'); setPreview(null); setError(''); }} style={S.btnGhost}>← Terug aanpassen</button>
    </div></div>
  );

  // step === 'form'
  return (
    <div style={S.page}><div style={S.card}>
      <Logo />

      <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 16, color: '#0a2240', marginBottom: 8 }}>{res?.reference}</div>
        {[
          ['Naam', `${res?.first_name} ${res?.last_name}`],
          ['Huidige aankomst', res?.arrival_date ? fmtDate(res.arrival_date) : '—'],
          ['Huidig vertrek', res?.departure_date ? fmtDate(res.departure_date) : '—'],
          ['Totaalbedrag', `€ ${parseFloat(res?.total_price || 0).toFixed(2)}`],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: '0.5px solid rgba(10,34,64,0.07)' }}>
            <span style={{ color: '#7090b0' }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={S.label}>Nieuwe aankomstdatum</label>
        <input type="date" min={today} value={newArrival} onChange={e => setNewArrival(e.target.value)} style={S.input} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={S.label}>Nieuwe vertrekdatum</label>
        <input type="date" min={newArrival || today} value={newDeparture} onChange={e => setNewDeparture(e.target.value)} style={S.input} />
      </div>

      {error && (
        <div style={{ background: '#fdeaea', borderRadius: 8, padding: '10px 14px', color: '#8a2020', fontSize: 13, marginBottom: 14 }}>{error}</div>
      )}

      <button onClick={calcPreview} disabled={previewLoading || !newArrival || !newDeparture} style={S.btnPrimary}>
        {previewLoading ? 'Berekenen...' : 'Prijsverschil berekenen →'}
      </button>

      <p style={{ textAlign: 'center', fontSize: 12, color: '#7090b0', marginTop: 14 }}>
        Let op: bij annulering blijft het annuleringsbeleid van uw originele aankomstdatum van toepassing.
      </p>
    </div></div>
  );
}
