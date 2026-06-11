'use client';
import { useState, useEffect } from 'react';
import { useAuthGuard } from '@/lib/auth';
import Sidebar from './Sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const ready = useAuthGuard();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    // Mobiel: dicht. Desktop: onthouden voorkeur (standaard open).
    const isMobile = window.innerWidth < 768;
    if (isMobile) setSidebarOpen(false);
    else setSidebarOpen(localStorage.getItem('adminSidebarCollapsed') !== '1');
  }, []);

  // Op desktop onthouden we de in-/uitklap-voorkeur; op mobiel niet (overlay).
  function openSidebar() {
    setSidebarOpen(true);
    if (typeof window !== 'undefined' && window.innerWidth >= 768) localStorage.setItem('adminSidebarCollapsed', '0');
  }
  function closeSidebar() {
    setSidebarOpen(false);
    if (typeof window !== 'undefined' && window.innerWidth >= 768) localStorage.setItem('adminSidebarCollapsed', '1');
  }

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a2240', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Laden...</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative' }}>
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      {/* Desktop: knop om het ingeklapte menu weer te openen */}
      {!sidebarOpen && (
        <button
          className="desktop-open-btn"
          onClick={openSidebar}
          title="Menu openen"
        >☰</button>
      )}
      <main style={{ flex: 1, overflowY: 'auto', maxHeight: '100vh', minWidth: 0 }}>
        {/* Mobile top bar with hamburger */}
        <div className="mobile-topbar" style={{
          display: 'none',
          alignItems: 'center',
          padding: '0 16px',
          height: 48,
          background: '#0a2240',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          gap: 12,
        }}>
          <button
            onClick={openSidebar}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', fontSize: 22, color: 'white', lineHeight: 1 }}
            title="Menu openen"
          >☰</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, background: '#e8a020', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, color: '#0a2240' }}>AB</div>
            <span style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>De Bazuin</span>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
