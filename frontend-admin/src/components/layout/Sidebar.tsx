'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, clearToken } from '@/lib/api';
import {
  Squares2X2Icon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ListBulletIcon,
  PencilSquareIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  UsersIcon,
  WrenchScrewdriverIcon,
  Cog6ToothIcon,
  CurrencyEuroIcon,
  MapIcon,
  BoltIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  PowerIcon,
  XMarkIcon,
  BuildingOfficeIcon,
  BanknotesIcon,
  ClipboardDocumentListIcon,
  UserGroupIcon,
  KeyIcon,
} from '@heroicons/react/24/outline';

const nav = [
  { href: '/dashboard', icon: Squares2X2Icon, label: 'Dashboard' },
  { href: '/arrivals', icon: ArrowDownTrayIcon, label: 'Reserveringen' },
  { href: '/modifications', icon: PencilSquareIcon, label: 'Wijzigingsverzoeken' },
  { href: '/calendar', icon: CalendarDaysIcon, label: 'Agenda' },
  { href: '/kas', icon: BanknotesIcon, label: 'Kas' },
  { href: '/reports', icon: ChartBarIcon, label: 'Financieel rapport' },
  { href: '/customers', icon: UsersIcon, label: 'Klanten' },
  { href: '/tools', icon: WrenchScrewdriverIcon, label: 'Importtools' },
  { href: '/facturen', icon: BuildingOfficeIcon, label: 'Facturen' },
  { href: '/contract-invoices', icon: ClipboardDocumentListIcon, label: 'Contractfacturatie' },
  { href: '/facturen-goedkeuren', icon: DocumentTextIcon, label: 'Facturen goedkeuren' },
];
const settings = [
  { href: '/settings/algemeen', icon: Cog6ToothIcon, label: 'Algemeen' },
  { href: '/settings/rates', icon: CurrencyEuroIcon, label: 'Tarieven' },
  { href: '/settings/ferries', icon: MapIcon, label: 'Veerboten' },
  { href: '/settings/services', icon: BoltIcon, label: 'Diensten' },
  { href: '/settings/policies', icon: DocumentTextIcon, label: 'Annulering' },
  { href: '/settings/emails', icon: EnvelopeIcon, label: 'E-mailsjablonen' },
  { href: '/settings/voorwaarden', icon: DocumentTextIcon, label: 'Voorwaarden' },
  { href: '/settings/contract-customers', icon: UserGroupIcon, label: 'Contractklanten' },
  { href: '/settings/wachtwoord', icon: KeyIcon, label: 'Wachtwoord' },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const path = usePathname();
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    api.modifications.count().then(r => setPendingCount(r.count)).catch(() => {});
    const interval = setInterval(() => {
      api.modifications.count().then(r => setPendingCount(r.count)).catch(() => {});
    }, 60000); // elke minuut verversen
    return () => clearInterval(interval);
  }, []);

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
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '2px 6px', lineHeight: 1, display: 'flex', alignItems: 'center' }}
            title="Menu sluiten"
          ><XMarkIcon className="w-5 h-5" /></button>
        </div>

        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          <div style={{ marginBottom: 20 }}>
            {nav.map(i => (
              <Link key={i.href} href={i.href} onClick={onClose}
                className={`sidebar-item${path.startsWith(i.href) ? ' active' : ''}`}>
                <span style={{ width: 18, textAlign: 'center', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i.icon className="w-5 h-5" /></span>
                <span style={{ flex: 1 }}>{i.label}</span>
                {i.href === '/modifications' && pendingCount > 0 && (
                  <span style={{ background: '#e8a020', color: '#0a2240', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 800, marginLeft: 4 }}>
                    {pendingCount}
                  </span>
                )}
              </Link>
            ))}
          </div>
          <div style={{ padding: '8px 14px 6px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Instellingen</div>
          {settings.map(i => (
            <Link key={i.href} href={i.href} onClick={onClose}
              className={`sidebar-item${path.startsWith(i.href) ? ' active' : ''}`}>
              <span style={{ width: 18, textAlign: 'center', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i.icon className="w-5 h-5" /></span>
              <span>{i.label}</span>
            </Link>
          ))}
        </nav>

        <div style={{ padding: '12px 8px', borderTop: '0.5px solid rgba(255,255,255,0.1)' }}>
          <button onClick={logout} className="sidebar-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}>
            <span style={{ width: 18, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PowerIcon className="w-5 h-5" /></span><span>Uitloggen</span>
          </button>
        </div>
      </aside>
    </>
  );
}
