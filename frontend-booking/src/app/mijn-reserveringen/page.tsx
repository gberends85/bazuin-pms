'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { guestApi, guestAuth } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

function toIsoDate(d: any): string {
  if (!d) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(String(d))) return String(d).slice(0, 10);
  const p = new Date(d);
  return isNaN(p.getTime()) ? '' : p.toISOString().slice(0, 10);
}

function fmtDate(d: any) {
  const iso = toIsoDate(d);
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function nightsBetween(arrival: any, departure: any) {
  const a = toIsoDate(arrival);
  const b = toIsoDate(departure);
  if (!a || !b) return 0;
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
}

function statusLabel(s: string) {
  switch (s) {
    case 'confirmed': return { label: 'Bevestigd', color: '#2a7a3a', bg: '#e8f5eb' };
    case 'pending':   return { label: 'In behandeling', color: '#8a5f00', bg: '#fff0cc' };
    case 'checked_in': return { label: 'Ingecheckt', color: '#1a6fb0', bg: '#dbeafe' };
    case 'checked_out': return { label: 'Uitgecheckt', color: '#555', bg: '#f3f4f6' };
    default:          return { label: s, color: '#555', bg: '#f3f4f6' };
  }
}

export default function MijnReserveringenPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    const token = guestAuth.getToken();
    const savedEmail = guestAuth.getEmail();
    if (!token) {
      router.replace('/login');
      return;
    }
    setEmail(savedEmail || '');
    guestApi.getReservations(token)
      .then(data => {
        setReservations(data.reservations);
        setLoading(false);
      })
      .catch(err => {
        // Token verlopen of ongeldig
        if (err.message?.includes('401') || err.message?.includes('Ongeldige') || err.message?.includes('verlopen')) {
          guestAuth.clear();
          router.replace('/login');
        } else {
          setError(err.message || 'Kon reserveringen niet laden');
          setLoading(false);
        }
      });
  }, [router]);

  function handleLogout() {
    guestAuth.clear();
    router.replace('/login');
  }

  // ── Loading ──
  if (loading) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', padding: '48px', color: '#555' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
          Reserveringen laden…
        </div>
      </PageShell>
    );
  }

  // ── Fout ──
  if (error) {
    return (
      <PageShell email={email} onLogout={handleLogout}>
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px',
          padding: '16px', color: '#dc2626', fontSize: '14px',
        }}>
          {error}
        </div>
      </PageShell>
    );
  }

  // ── Geen reserveringen ──
  if (reservations.length === 0) {
    return (
      <PageShell email={email} onLogout={handleLogout}>
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔍</div>
          <div style={{ fontWeight: '700', color: '#374151', marginBottom: '8px' }}>Geen reserveringen gevonden</div>
          <div style={{ fontSize: '13px' }}>Er zijn geen actieve reserveringen voor {email}.</div>
        </div>
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <a
            href="/boeken"
            style={{ display: 'inline-block', background: '#0a2240', color: 'white', padding: '12px 24px', borderRadius: '8px', textDecoration: 'none', fontWeight: '700', fontSize: '14px' }}
          >
            ➕ Nieuwe reservering maken
          </a>
        </div>
      </PageShell>
    );
  }

  // ── Lijst ──
  return (
    <PageShell email={email} onLogout={handleLogout}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {reservations.map((r: any) => {
          const nights = nightsBetween(r.arrival_date, r.departure_date);
          const days = nights + 1;
          const dest = r.ferry_outbound_destination;
          const destLabel = dest ? ` — ${dest.charAt(0).toUpperCase() + dest.slice(1)}` : '';
          const st = statusLabel(r.status);
          const plates: string[] = r.plates || [];

          return (
            <div key={r.id} style={{
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
            }}>
              {/* Topbalk met referentie + status */}
              <div style={{
                background: '#f8fafc',
                borderBottom: '1px solid #e5e7eb',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <span style={{ fontSize: '12px', color: '#888', marginRight: '8px' }}>Ref.</span>
                  <span style={{ fontWeight: '800', color: '#0a2240', fontSize: '15px' }}>{r.reference}</span>
                </div>
                <span style={{
                  fontSize: '11px', fontWeight: '700', padding: '3px 9px', borderRadius: '99px',
                  background: st.bg, color: st.color,
                }}>
                  {st.label}
                </span>
              </div>

              {/* Body */}
              <div style={{ padding: '16px' }}>
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '13px', color: '#888', marginBottom: '2px' }}>Periode</div>
                  <div style={{ fontWeight: '700', color: '#111', fontSize: '14px' }}>
                    {fmtDate(r.arrival_date)} → {fmtDate(r.departure_date)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>
                    {days} dag{days !== 1 ? 'en' : ''}{destLabel}
                  </div>
                </div>

                {plates.length > 0 && (
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>Kenteken{plates.length > 1 ? 's' : ''}</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {plates.map((p: string) => (
                        <span key={p} style={{
                          background: '#fef9c3', border: '1.5px solid #ca8a04', borderRadius: '4px',
                          padding: '2px 10px', fontSize: '13px', fontWeight: '700', fontFamily: 'monospace', letterSpacing: '1px',
                        }}>
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <div style={{ fontSize: '13px', color: '#555' }}>
                    Totaal:{' '}
                    <strong style={{ color: '#111' }}>
                      € {parseFloat(r.billed_total ?? r.total_price ?? 0).toFixed(2).replace('.', ',')}
                    </strong>
                    {(() => {
                      // partial_refund is wél betaald (alleen deels terug volgens beleid)
                      const paidLike = r.payment_status === 'paid' || r.payment_status === 'partial_refund';
                      const refund = parseFloat(r.refund_amount || 0);
                      if (paidLike) {
                        return (
                          <span style={{ marginLeft: '6px', fontSize: '11px', color: '#2a7a3a', fontWeight: '700' }}>
                            ✓ betaald{r.payment_status === 'partial_refund' && refund > 0 ? ` · € ${refund.toFixed(2).replace('.', ',')} terug` : ''}
                          </span>
                        );
                      }
                      if (r.status === 'cancelled') return null; // geannuleerd → niet "openstaand"
                      return <span style={{ marginLeft: '6px', fontSize: '11px', color: '#8a5f00', fontWeight: '700' }}>openstaand</span>;
                    })()}
                  </div>
                </div>
              </div>

              {/* Acties */}
              <div style={{
                borderTop: '1px solid #e5e7eb',
                padding: '10px 16px',
                display: 'flex',
                gap: '10px',
                flexWrap: 'wrap',
              }}>
                {r.cancellation_token && (
                  <>
                    {!['cancelled', 'completed', 'checked_out'].includes(r.status) && (
                      <ActionLink href={`/boeken/wijzigen/${r.cancellation_token}`}>
                        ✏️ Wijzigen
                      </ActionLink>
                    )}
                    <ActionLink href={`${API_BASE}/invoice-html/${r.cancellation_token}`} target="_blank">
                      📄 Factuur
                    </ActionLink>
                    {r.status === 'cancelled' && parseFloat(r.refund_amount || 0) > 0 && (
                      <ActionLink href={`${API_BASE}/creditnota-html/${r.cancellation_token}`} target="_blank" danger>
                        📋 Creditnota
                      </ActionLink>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: 'center', marginTop: '24px' }}>
        <a
          href="/boeken"
          style={{ display: 'inline-block', background: '#0a2240', color: 'white', padding: '11px 22px', borderRadius: '8px', textDecoration: 'none', fontWeight: '700', fontSize: '14px' }}
        >
          ➕ Nieuwe reservering maken
        </a>
      </div>
    </PageShell>
  );
}

// ── Layout shell ─────────────────────────────────────────────────────────────

function PageShell({
  children,
  email,
  onLogout,
}: {
  children: React.ReactNode;
  email?: string;
  onLogout?: () => void;
}) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#f3f6fb',
      fontFamily: 'Arial, sans-serif',
    }}>
      {/* Top-navigatie */}
      <div style={{ background: '#0a2240', padding: '0 24px' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '56px' }}>
          <div>
            <span style={{ color: 'white', fontWeight: '800', fontSize: '16px' }}>Autostalling De Bazuin</span>
            <span style={{ color: '#7090b0', fontSize: '12px', marginLeft: '10px' }}>Mijn reserveringen</span>
          </div>
          {email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#7090b0', fontSize: '12px', display: 'none' }}>{email}</span>
              <button
                onClick={onLogout}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', color: 'white', fontSize: '12px', padding: '6px 12px', cursor: 'pointer', fontWeight: '600' }}
              >
                Uitloggen
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 16px 48px' }}>
        {email && (
          <div style={{ fontSize: '13px', color: '#888', marginBottom: '20px' }}>
            Ingelogd als <strong style={{ color: '#374151' }}>{email}</strong>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function ActionLink({
  children, href, target, danger,
}: { children: React.ReactNode; href: string; target?: string; danger?: boolean }) {
  return (
    <a
      href={href}
      target={target}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      style={{
        display: 'inline-block',
        background: danger ? '#fef2f2' : '#f3f6fb',
        border: `1px solid ${danger ? '#fca5a5' : '#d1d5db'}`,
        borderRadius: '6px',
        padding: '6px 14px',
        fontSize: '13px',
        fontWeight: '600',
        color: danger ? '#dc2626' : '#0a2240',
        textDecoration: 'none',
      }}
    >
      {children}
    </a>
  );
}
