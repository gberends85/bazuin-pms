'use client';
import { useState } from 'react';

// Header in dezelfde stijl als de marketingwebsite (Montserrat, navy→blauw gradient,
// zelfde logo en navigatie). Links wijzen naar de website-pagina's op hetzelfde domein.
const SITE = 'https://www.parkeren-harlingen.nl';
const NAV = [
  { href: `${SITE}/`, label: 'Home' },
  { href: `${SITE}/tarieven`, label: 'Tarieven' },
  { href: `${SITE}/openingstijden`, label: 'Openingstijden & werkwijze' },
  { href: `${SITE}/route`, label: 'Route' },
];
const FONT = "'Montserrat', sans-serif";

export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'linear-gradient(135deg, #142440, #19499e)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto', padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72,
      }}>
        {/* Logo */}
        <a href={`${SITE}/`} style={{ display: 'flex', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/boeken/logo-full-white.png" alt="De Bazuin – Autostalling Harlingen" width={170} height={49} style={{ objectFit: 'contain', display: 'block' }} />
        </a>

        {/* Desktop nav */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }} className="site-desktop-nav">
          {NAV.map(item => (
            <a key={item.href} href={item.href}
              style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, fontWeight: 600, fontFamily: FONT, transition: 'color 0.2s', textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.88)')}
            >{item.label}</a>
          ))}
          <a href={`${SITE}/boeken`}
            style={{ background: '#19499e', color: '#fff', fontFamily: FONT, fontSize: 14, fontWeight: 700, padding: '10px 22px', borderRadius: 8, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.25)' }}>
            Reserveer nu
          </a>
        </nav>

        {/* Mobile hamburger */}
        <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu"
          className="site-hamburger"
          style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'white', fontSize: 26, padding: 4, lineHeight: 1 }}>
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{ background: 'linear-gradient(135deg, #142440, #19499e)', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '8px 24px 24px' }} className="site-mobile-menu">
          {NAV.map(item => (
            <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
              style={{ display: 'block', color: 'rgba(255,255,255,0.9)', padding: '13px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', fontFamily: FONT, fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
              {item.label}
            </a>
          ))}
          <a href={`${SITE}/boeken`}
            style={{ display: 'block', textAlign: 'center', background: '#19499e', color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 15, padding: '13px 0', borderRadius: 8, marginTop: 18, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.25)' }}>
            Reserveer nu
          </a>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .site-desktop-nav { display: none !important; }
          .site-hamburger { display: block !important; }
        }
      `}</style>
    </header>
  );
}
