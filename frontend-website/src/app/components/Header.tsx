'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

const BOOKING_URL = 'https://www.parkeren-harlingen.nl/boeken';

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header style={{
      position: 'fixed', top: 'var(--tsr-h, 0px)', left: 0, right: 0, zIndex: 100,
      background: scrolled
        ? 'linear-gradient(135deg, rgba(20,36,64,0.98), rgba(25,73,158,0.98))'
        : 'linear-gradient(180deg, rgba(10,18,36,0.55) 0%, transparent 100%)',
      backdropFilter: scrolled ? 'blur(10px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,0.08)' : 'none',
      transition: 'all 0.3s ease',
    }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 }}>

        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
          <Image
            src="/Logo.png"
            alt="De Bazuin – Autostalling Harlingen"
            width={180}
            height={52}
            style={{ objectFit: 'contain' }}
            priority
          />
        </Link>

        {/* Desktop Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }} className="desktop-nav">
          {[
            { href: '/', label: 'Home' },
            { href: '/tarieven', label: 'Tarieven' },
            { href: '/openingstijden', label: 'Openingstijden & werkwijze' },
            { href: '/route', label: 'Route' },
          ].map(item => (
            <Link key={item.href} href={item.href} style={{
              color: 'rgba(255,255,255,0.88)', fontSize: 14, fontWeight: 600,
              fontFamily: 'var(--font-heading)', transition: 'color 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.88)')}
            >{item.label}</Link>
          ))}
          <a href={BOOKING_URL} className="btn btn-blue" style={{ padding: '10px 22px', fontSize: 14 }}>
            Reserveer nu
          </a>
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            display: 'none', background: 'none', border: 'none', cursor: 'pointer',
            color: 'white', fontSize: 26, padding: 4, lineHeight: 1,
          }}
          className="hamburger"
          aria-label="Menu"
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div style={{
          background: 'linear-gradient(135deg, #142440, #19499e)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          padding: '16px 20px 28px',
        }}>
          {[
            { href: '/', label: 'Home' },
            { href: '/tarieven', label: 'Tarieven' },
            { href: '/openingstijden', label: 'Openingstijden & werkwijze' },
            { href: '/route', label: 'Route' },
          ].map(item => (
            <Link key={item.href} href={item.href}
              onClick={() => setMenuOpen(false)}
              style={{
                display: 'block', color: 'rgba(255,255,255,0.9)', padding: '13px 0',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15,
              }}>{item.label}</Link>
          ))}
          <a href={BOOKING_URL} className="btn btn-blue" style={{ marginTop: 20, width: '100%', justifyContent: 'center' }}>
            Reserveer nu
          </a>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .hamburger { display: block !important; }
        }
      `}</style>
    </header>
  );
}
