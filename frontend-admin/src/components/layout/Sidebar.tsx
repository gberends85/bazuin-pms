'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, clearToken } from '@/lib/api';

const nav = [
  { href: '/dashboard', icon: '◉', label: 'Dashboard' },
  { href: '/arrivals', icon: '↓', label: 'Aankomsten vandaag' },
  { href: '/departures', icon: '↑', label: 'Vertrekken vandaag' },
  { href: '/reservations', icon: '≡', label: 'Alle reserveringen' },
  { href: '/calendar', icon: '▦', label: 'Agenda' },
  { href: '/reports', icon: '⌁', label: 'Financieel rapport' },
  { href: '/customers', icon: '♟', label: 'Klanten' },
];
const settings = [
  { href: '/settings/algemeen', icon: '⚙', label: 'Algemeen' },
  { href: '/settings/rates', icon: '€', label: 'Tarieven' },
  { href: '/settings/ferries', icon: '⛴', label: 'Veerboten' },
  { href: '/settings/services', icon: '⚡', label: 'Diensten' },
  { href: '/settings/policies', icon: '✕', label: 'Annulering' },
  { href: '/settings/emails', icon: '✉', label: 'E-mailsjablonen' },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const path = usePathname();
  const router = useRouter();

  async function logout() {
    await api.auth.logout().catch(() => {});
    clearToken();
    router.push('/login');
  }

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 98,
            display: 'none',
          }}
          className="mobile-backdrop"
        />
      )}

      <aside style={{
        width: 220,
        background: '#0a2240',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        // Mobile: fixed overlay
        position: undefined,
        zIndex: 99,
        transition: 'transform 0.25s ease',
      }}
        className={`sidebar ${open ? 'sidebar-open' : 'sidebar-closed'}`}
      >
        {/* Logo + close button */}
        <div style={{ padding: '16px 12px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: '#e8a020', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#0a2240', flexShrink: 0 }}>AB</div>
            <div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>De Bazuin</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>Beheerportaal</div>
            </div>
          </div>
          {/* Close button (visible on mobile) */}
          <button
            onClick={onClose}
            className="sidebar-close-btn"
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 20, padding: '2px 6px', lineHeight: 1 }}
            title="Menu sluiten"
          >✕</button>
        </div>

        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          <div style={{ marginBottom: 20 }}>
            {nav.map(i => (
              <Link key={i.href} href={i.href} onClick={onClose}
                className={`sidebar-item${path.startsWith(i.href) ? ' active' : ''}`}>
                <span style={{ width: 18, textAlign: 'center', fontSize: 14, flexShrink: 0 }}>{i.icon}</span>
                <span>{i.label}</span>
              </Link>
            ))}
          </div>
          <div style={{ padding: '8px 14px 6px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Instellingen</div>
          {settings.map(i => (
            <Link key={i.href} href={i.href} onClick={onClose}
              className={`sidebar-item${path.startsWith(i.href) ? ' active' : ''}`}>
              <span style={{ width: 18, textAlign: 'center', fontSize: 14, flexShrink: 0 }}>{i.icon}</span>
              <span>{i.label}</span>
            </Link>
          ))}
        </nav>

        <div style={{ padding: '12px 8px', borderTop: '0.5px solid rgba(255,255,255,0.1)' }}>
          <button onClick={logout} className="sidebar-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}>
            <span style={{ width: 18, textAlign: 'center' }}>⏻</span><span>Uitloggen</span>
          </button>
        </div>
      </aside>
    </>
  );
}
