'use client';
import { useEffect, useState } from 'react';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [newEmail, setNewEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('t');
    if (!t) {
      setErrorMsg('Verificatielink is ongeldig (token ontbreekt).');
      setStatus('error');
      return;
    }
    fetch(`${BASE}/verify-email?t=${encodeURIComponent(t)}`)
      .then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `Fout ${r.status}`);
        setNewEmail(body.newEmail || '');
        setStatus('success');
      })
      .catch(e => {
        setErrorMsg(e.message || 'Verificatie mislukt');
        setStatus('error');
      });
  }, []);

  const S = {
    page: { minHeight: '100vh', background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } as const,
    card: { background: 'white', borderRadius: 14, padding: '40px 32px', maxWidth: 440, width: '100%', border: '0.5px solid rgba(10,34,64,0.1)', boxShadow: '0 4px 24px rgba(10,34,64,0.08)', textAlign: 'center' as const } as const,
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* Logo */}
        <div style={{ width: 44, height: 44, background: '#e8a020', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#0a2240', margin: '0 auto 20px' }}>AB</div>
        <p style={{ margin: '0 0 24px', color: '#7090b0', fontSize: 13 }}>Autostalling De Bazuin</p>

        {status === 'loading' && (
          <>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
            <h2 style={{ margin: '0 0 8px', color: '#0a2240' }}>Verificatie bezig...</h2>
            <p style={{ color: '#7090b0', fontSize: 14 }}>Even geduld a.u.b.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#e6f7f5', color: '#0a7c6e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 26 }}>
              ✓
            </div>
            <h2 style={{ margin: '0 0 8px', color: '#0a2240' }}>E-mailadres bevestigd!</h2>
            <p style={{ color: '#7090b0', fontSize: 14, marginBottom: 12 }}>
              Uw e-mailadres is succesvol gewijzigd naar:
            </p>
            <div style={{ background: '#e6f7f5', borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 700, color: '#0a7c6e', marginBottom: 24 }}>
              {newEmail}
            </div>
            <p style={{ color: '#7090b0', fontSize: 13 }}>U kunt dit venster sluiten.</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fdeaea', color: '#c83232', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 26 }}>
              ✗
            </div>
            <h2 style={{ margin: '0 0 8px', color: '#0a2240' }}>Verificatie mislukt</h2>
            <p style={{ color: '#8a2020', fontSize: 14, marginBottom: 20 }}>{errorMsg}</p>
            <p style={{ color: '#7090b0', fontSize: 12 }}>
              De link is mogelijk verlopen of al eerder gebruikt.<br />
              Vraag een nieuwe verificatiemail aan via de reserveringspagina.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
