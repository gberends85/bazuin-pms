'use client';
import { useState, useEffect } from 'react';
import { useAuthGuard } from '@/lib/auth';
import Sidebar from './Sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const ready = useAuthGuard();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    // On mobile: start closed. On desktop: start open.
    const isMobile = window.innerWidth < 768;
    setSidebarOpen(!isMobile);

    const handleResize = () => {
      if (window.innerWidth >= 768) setSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a2240', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Laden...</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
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
            onClick={() => setSidebarOpen(true)}
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
