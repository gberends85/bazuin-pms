'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function GuestNaamPage({ params }: { params: { id: string } }) {
  const [data, setData]     = useState<any>(null);
  const [error, setError]   = useState('');
  const [first, setFirst]   = useState('');
  const [last, setLast]     = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    fetch(`${API}/public/reservation-name/${params.id}`)
      .then(r => r.ok ? r.json() : Promise.reject('Boeking niet gevonden'))
      .then(d => { setData(d); setFirst(d.first_name || ''); setLast(d.last_name || ''); })
      .catch(() => setError('Boeking niet gevonden of de link is verlopen.'));
  }, [params.id]);

  async function handleSave() {
    if (!first.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/public/reservation-name/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: first.trim(), lastName: last.trim() }),
      });
      if (!r.ok) throw new Error('Opslaan mislukt');
      setSaved(true);
    } catch {
      alert('Er is iets misgegaan. Probeer het opnieuw.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f7fb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 4px 24px rgba(10,34,64,0.10)', padding: '36px 32px', maxWidth: 420, width: '100%' }}>
        {/* Logo / koptekst */}
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#0a2240', letterSpacing: '-0.5px' }}>Autostalling De Bazuin</div>
          <div style={{ fontSize: 13, color: '#7090b0', marginTop: 3 }}>Naam aanpassen</div>
        </div>

        {error && (
          <div style={{ background: '#fdeaea', color: '#8a2020', borderRadius: 8, padding: '12px 16px', fontSize: 13, textAlign: 'center' }}>
            {error}
          </div>
        )}

        {!error && !data && (
          <div style={{ textAlign: 'center', color: '#7090b0', fontSize: 13 }}>Laden…</div>
        )}

        {data && !saved && (
          <>
            {/* Boekinginfo */}
            <div style={{ background: '#f4f7fb', borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#7090b0' }}>Referentie</span>
                <strong style={{ color: '#0a2240', fontFamily: 'monospace' }}>{data.reference}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#7090b0' }}>Aankomst</span>
                <span style={{ color: '#0a2240' }}>{fmtDate(data.arrival_date)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#7090b0' }}>Vertrek</span>
                <span style={{ color: '#0a2240' }}>{fmtDate(data.departure_date)}</span>
              </div>
            </div>

            {/* Naam formulier */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 5 }}>Voornaam</label>
                <input
                  value={first} onChange={e => setFirst(e.target.value)}
                  autoFocus
                  style={{ width: '100%', padding: '10px 13px', border: '1.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 16, fontWeight: 700, color: '#0a2240', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 5 }}>Achternaam</label>
                <input
                  value={last} onChange={e => setLast(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                  style={{ width: '100%', padding: '10px 13px', border: '1.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 16, fontWeight: 700, color: '#0a2240', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
              <button
                onClick={handleSave}
                disabled={saving || !first.trim()}
                style={{ marginTop: 4, padding: '12px', background: first.trim() ? '#0a2240' : '#b0bcc8', color: 'white', border: 'none', borderRadius: 9, fontSize: 15, fontWeight: 700, cursor: first.trim() ? 'pointer' : 'not-allowed', transition: 'background 0.15s' }}
              >
                {saving ? 'Opslaan…' : 'Naam opslaan'}
              </button>
            </div>
          </>
        )}

        {saved && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0a7c6e', marginBottom: 8 }}>Naam opgeslagen!</div>
            <div style={{ fontSize: 13, color: '#7090b0', marginBottom: 20 }}>
              {first} {last} is bijgewerkt voor boeking {data?.reference}.
            </div>
            <button onClick={() => setSaved(false)} style={{ fontSize: 12, color: '#7090b0', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Nog een keer wijzigen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
