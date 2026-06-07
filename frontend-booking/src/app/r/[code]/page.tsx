'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function ShortLinkRedirect() {
  const router = useRouter();
  const params = useParams();
  const code = params?.code as string;
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
    fetch(`${apiUrl}/public/short-link/${code}`)
      .then(r => r.ok ? r.json() : Promise.reject('Niet gevonden'))
      .then(({ url }) => {
        // Strip origin AND basePath so Next.js doesn't double-prepend /boeken
        try {
          const u = new URL(url);
          const basePath = '/boeken';
          const path = u.pathname.startsWith(basePath)
            ? u.pathname.slice(basePath.length) || '/'
            : u.pathname;
          router.replace(path + u.search + u.hash);
        } catch {
          router.replace(url);
        }
      })
      .catch(() => setError('Deze link bestaat niet of is verlopen.'));
  }, [code, router]);

  if (error) return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <div style={{ background: 'white', borderRadius: 14, padding: '32px 28px', maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(10,34,64,0.10)' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontWeight: 800, color: '#0a2240', fontSize: 17, marginBottom: 8 }}>Link niet gevonden</div>
        <div style={{ color: '#7090b0', fontSize: 14 }}>{error}</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ color: '#7090b0', fontSize: 15 }}>Doorsturen…</div>
    </div>
  );
}
