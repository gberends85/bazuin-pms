'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { guestAuth } from '@/lib/api';

export default function MagicLinkRedirect() {
  const router = useRouter();
  const params = useParams();
  const code = params?.code as string;
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) return;
    async function resolve() {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
        const r = await fetch(`${apiUrl}/guest/ml/${code}`);
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          setError(j.error || 'Link onbekend of verlopen');
          return;
        }
        const { token, email } = await r.json();
        guestAuth.save(token, email);
        router.replace('/mijn-reserveringen');
      } catch (e: any) {
        setError(e.message || 'Er is een fout opgetreden');
      }
    }
    resolve();
  }, [code, router]);

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a2240 0%, #1a4080 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Arial, sans-serif',
      }}>
        <div style={{
          background: 'white', borderRadius: 16, padding: '40px 32px',
          maxWidth: 380, textAlign: 'center',
          boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 800, color: '#0a2240', fontSize: 18, marginBottom: 8 }}>Link verlopen</div>
          <div style={{ color: '#556070', fontSize: 14, marginBottom: 20 }}>{error}</div>
          <button
            onClick={() => router.push('/login')}
            style={{
              background: '#0a2240', color: 'white', border: 'none',
              borderRadius: 8, padding: '12px 24px', fontSize: 14,
              fontWeight: 700, cursor: 'pointer',
            }}
          >
            Naar inlogpagina
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a2240 0%, #1a4080 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{ color: 'white', fontSize: 16, opacity: 0.8 }}>Inloggen…</div>
    </div>
  );
}
