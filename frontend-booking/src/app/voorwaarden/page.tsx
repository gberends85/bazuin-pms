'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function VoorwaardenPage() {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/public/terms`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setHtml(d.text || ''))
      .catch(() => setHtml(''))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6f9', padding: '32px 16px' }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
            <div style={{ width: 40, height: 40, background: '#0a2240', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#e8a020', flexShrink: 0 }}>AB</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.5 }}>Autostalling De Bazuin</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0a2240', lineHeight: 1.1 }}>Algemene Voorwaarden</div>
            </div>
          </div>
          <div style={{ borderBottom: '1.5px solid rgba(10,34,64,0.08)', marginTop: 16 }} />
        </div>

        {/* Content */}
        <div style={{ background: 'white', borderRadius: 14, border: '0.5px solid rgba(10,34,64,0.1)', padding: '28px 32px', boxShadow: '0 1px 6px rgba(10,34,64,0.06)' }}>
          {loading ? (
            <div style={{ color: '#7090b0', fontSize: 14 }}>Laden…</div>
          ) : html ? (
            <div
              style={{ fontSize: 14, lineHeight: 1.75, color: '#1a2e48' }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <div style={{ color: '#7090b0', fontSize: 14 }}>
              De algemene voorwaarden zijn nog niet beschikbaar. Neem contact op via{' '}
              <a href="mailto:info@parkeren-harlingen.nl" style={{ color: '#0a7c6e' }}>info@parkeren-harlingen.nl</a>.
            </div>
          )}
        </div>

        {/* Back link */}
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <a href="/boeken" style={{ fontSize: 13, color: '#7090b0', textDecoration: 'none' }}>
            ← Terug naar reserveren
          </a>
        </div>

      </div>
    </div>
  );
}
