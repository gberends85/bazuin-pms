'use client';
import { useEffect, useState } from 'react';
import { WebsiteContent, whatsappUrl } from '../lib/content';
import { IconWhatsApp } from './icons';

const BOOKING_URL = 'https://booking.parkeren-harlingen.nl/boeken';
const WATERTAXI_URL = 'https://www.harlingen-watertaxi.nl';

interface Review {
  author_name: string; rating: number;
  relative_time_description: string; text: string; profile_photo_url: string;
}
interface ReviewData { rating: number; totalRatings: number; reviews: Review[]; }

function FactIcon({ name, size = 30 }: { name: string; size?: number }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'calendar':
      return (<svg {...common}><path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>);
    case 'car':
      return (<svg {...common}><path d="M3.5 13.5l1.2-4.2A2.5 2.5 0 0 1 7.1 7.5h9.8a2.5 2.5 0 0 1 2.4 1.8l1.2 4.2M3.5 13.5h17M3.5 13.5v4.25c0 .41.34.75.75.75h1.5a.75.75 0 0 0 .75-.75V16.5m14-3v4.25a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75V16.5M6.5 16.5h11" /><circle cx="7.25" cy="16.5" r="0.6" fill="currentColor" stroke="none" /><circle cx="16.75" cy="16.5" r="0.6" fill="currentColor" stroke="none" /></svg>);
    case 'pin':
      return (<svg {...common}><path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0z" /><circle cx="12" cy="10.5" r="2.6" /></svg>);
    case 'bolt':
      return (<svg {...common}><path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>);
    default:
      return null;
  }
}

function StarRating({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={i <= Math.round(rating) ? '#f5c518' : '#ddd'}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </span>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const [expanded, setExpanded] = useState(false);
  const long = review.text.length > 160;
  const displayed = !expanded && long ? review.text.slice(0, 160) + '…' : review.text;
  const initials = review.author_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['#142440', '#0a7c6e', '#1565c0', '#6a1b9a', '#bf360c'];
  const bg = colors[review.author_name.charCodeAt(0) % colors.length];

  return (
    <div style={{
      background: 'white', borderRadius: 12, padding: 24,
      boxShadow: '0 2px 12px rgba(20,36,64,0.08)', display: 'flex',
      flexDirection: 'column', gap: 12, border: '1px solid #edf0f5',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {review.profile_photo_url ? (
          <img src={review.profile_photo_url} alt={review.author_name}
            style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: 42, height: 42, borderRadius: '50%', background: bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 700, fontSize: 16,
          }}>{initials}</div>
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{review.author_name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{review.relative_time_description}</div>
        </div>
        <div style={{ marginLeft: 'auto' }}><StarRating rating={review.rating} /></div>
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)', margin: 0 }}>
        {displayed}
        {long && (
          <button onClick={() => setExpanded(!expanded)}
            style={{ background: 'none', border: 'none', color: 'var(--cyan-dark)', cursor: 'pointer', fontSize: 13, padding: '0 0 0 4px', fontWeight: 600 }}>
            {expanded ? 'minder' : 'meer'}
          </button>
        )}
      </p>
    </div>
  );
}

export default function HomePage({ content }: { content: WebsiteContent }) {
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);

  useEffect(() => {
    fetch('/api/reviews').then(r => r.json()).then(setReviewData).catch(() => {});
  }, []);

  const { contact } = content;
  const waLink = whatsappUrl(contact.whatsapp);

  // Kerncijfers — exact zoals op de oude homepage
  const facts = [
    { icon: 'calendar', value: '1995', label: 'Actief sinds' },
    { icon: 'car', value: "55 auto's", label: 'Plaats voor' },
    { icon: 'pin', value: '300m', label: 'Lopen naar de veerboten' },
    { icon: 'bolt', value: 'Auto opladen', label: 'Mogelijk' },
  ];

  return (
    <>
      {/* ── HERO ── */}
      <section style={{
        minHeight: '78vh', display: 'flex', alignItems: 'center',
        position: 'relative', overflow: 'hidden', paddingTop: 72,
        backgroundImage: 'url(/hero-harlingen.jpg)',
        backgroundSize: 'cover', backgroundPosition: 'center',
      }}>
        {/* Donkere overlay zodat witte tekst leesbaar blijft */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(13,28,51,0.55) 0%, rgba(13,28,51,0.35) 45%, rgba(13,28,51,0.70) 100%)' }} />

        <div className="container" style={{ position: 'relative', zIndex: 1, padding: '72px 20px', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', color: 'white', fontSize: 'clamp(32px, 5.5vw, 60px)', lineHeight: 1.12, marginBottom: 28, maxWidth: 900, marginLeft: 'auto', marginRight: 'auto', textShadow: '0 2px 16px rgba(0,0,0,0.45)' }}>
            Veilig parkeren in Harlingen op maar 300m lopen naar de veerboten.
          </h1>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={BOOKING_URL} className="btn btn-primary btn-lg">
              RESERVEER <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </a>
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-lg" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.4)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <IconWhatsApp /> WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* ── VALET PARKEERWIJZE ── */}
      <section style={{ background: 'white', padding: '56px 0' }}>
        <div className="container" style={{ textAlign: 'center', maxWidth: 760 }}>
          <h2 style={{ fontSize: 'clamp(22px,3.2vw,32px)', marginBottom: 16 }}>Valet parkeerwijze</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 18, lineHeight: 1.7 }}>
            Uw auto blijft op de locatie waar u deze afgeeft, er wordt maximaal 300m mee gereden.
          </p>
        </div>
      </section>

      {/* ── KERNCIJFERS ── */}
      <section style={{ background: 'var(--gray)', padding: '48px 0' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20 }}>
            {facts.map(f => (
              <div key={f.value} style={{ background: 'white', borderRadius: 14, padding: '28px 20px', textAlign: 'center', boxShadow: '0 1px 6px rgba(20,36,64,0.06)' }}>
                <div style={{ width: 56, height: 56, margin: '0 auto 14px', borderRadius: 14, background: 'var(--blue-light, #eaf1fb)', color: 'var(--blue, #19499e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FactIcon name={f.icon} />
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--navy)', lineHeight: 1.2 }}>{f.value}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>{f.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── REVIEWS: Ervaringen van onze gasten ── */}
      <section style={{ background: 'white' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 style={{ fontSize: 'clamp(24px,3.5vw,38px)', marginBottom: 16 }}>Ervaringen van onze gasten</h2>
            {reviewData && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                <StarRating rating={reviewData.rating} size={24} />
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--navy)' }}>{reviewData.rating.toFixed(1)}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 15 }}>op basis van {reviewData.totalRatings}+ Google reviews</span>
              </div>
            )}
          </div>
          {reviewData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
              {reviewData.reviews.map((review, i) => <ReviewCard key={i} review={review} />)}
            </div>
          )}
          <div style={{ textAlign: 'center', marginTop: 36 }}>
            <a href="https://maps.google.com/?q=Autostalling+De+Bazuin+Harlingen" target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--cyan-dark)', fontWeight: 600, fontSize: 15 }}>
              Bekijk alle reviews op Google →
            </a>
          </div>
        </div>
      </section>

      {/* ── WATERTAXI ── */}
      <section style={{ position: 'relative', overflow: 'hidden', padding: '90px 0', background: '#142440' }}>
        {/* Achtergrond: YouTube-video (zoals op de oorspronkelijke pagina) */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden="true">
          <iframe
            src="https://www.youtube.com/embed/NNvSQW2AJnE?autoplay=1&mute=1&loop=1&playlist=NNvSQW2AJnE&controls=0&showinfo=0&modestbranding=1&rel=0&playsinline=1&disablekb=1"
            title="Watertaxi Harlingen" allow="autoplay; encrypted-media" frameBorder={0}
            style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '177.78vh', height: '56.25vw', minWidth: '100%', minHeight: '100%', border: 0 }}
          />
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(20,36,64,0.72), rgba(25,73,158,0.60))' }} aria-hidden="true" />
        <div className="container" style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14, color: 'var(--cyan, #4ac8ed)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17.5c1.2 1 2 1 3.2 0 1.2-1 2-1 3.2 0 1.2 1 2 1 3.2 0 1.2-1 2-1 3.2 0" />
              <path d="M4.5 14.5L6 9.5h12l1.5 5M9 9.5V6.5h4l3 3M9 6.5L7.5 9.5" />
            </svg>
          </div>
          <h2 style={{ color: 'white', fontSize: 'clamp(24px,3.5vw,36px)', marginBottom: 24 }}>Tevens watertaxi service!</h2>
          <a href={WATERTAXI_URL} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-lg">
            Meer informatie →
          </a>
        </div>
      </section>

      {/* ── RESERVEER CTA ── */}
      <section style={{ background: 'var(--gray)', padding: '64px 0' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(24px,3.5vw,36px)', marginBottom: 24 }}>Klaar om te reserveren?</h2>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={BOOKING_URL} className="btn btn-primary btn-lg">RESERVEER →</a>
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-lg" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><IconWhatsApp /> WhatsApp</a>
          </div>
        </div>
      </section>
    </>
  );
}
