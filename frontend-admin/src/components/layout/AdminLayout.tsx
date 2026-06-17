'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthGuard } from '@/lib/auth';
import { api } from '@/lib/api';
import Sidebar from './Sidebar';

// Altijd zichtbare snelknoppen in het topmenu
const TOP_LINKS = [
  { href: '/arrivals', label: 'Reserveringen' },
  { href: '/calendar', label: 'Agenda' },
  { href: '/modifications', label: 'Wijzigingsverzoeken' },
  { href: '/contract-invoices', label: 'Contractfacturatie' },
];

const MOD_LABELS: Record<string, string> = {
  dates: 'Datumwijziging',
  ferry: 'Boottijden',
  contact: 'Contactgegevens',
  plate: 'Kenteken',
};

function fmtShort(d: any): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const ready = useAuthGuard();
  const router = useRouter();
  const path = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Openstaande wijzigingsverzoeken (pending_review) — voor badge + popup
  const [pendingMods, setPendingMods] = useState<any[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Mobiel: dicht. Desktop: onthouden voorkeur (standaard open).
    const isMobile = window.innerWidth < 768;
    if (isMobile) setSidebarOpen(false);
    else setSidebarOpen(localStorage.getItem('adminSidebarCollapsed') !== '1');

    // Eerder (tijdelijk) weggeklikte meldingen herstellen — geldt voor deze sessie.
    try {
      const raw = sessionStorage.getItem('dismissedModAlerts');
      if (raw) setDismissed(new Set(JSON.parse(raw)));
    } catch { /* negeer */ }
  }, []);

  // Pollen van openstaande verzoeken (alleen als ingelogd)
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const load = () => api.modifications.pending()
      .then(list => { if (active) setPendingMods(Array.isArray(list) ? list : []); })
      .catch(() => { /* stil */ });
    load();
    const iv = setInterval(load, 30000); // elke 30s verversen
    return () => { active = false; clearInterval(iv); };
  }, [ready]);

  // Op desktop onthouden we de in-/uitklap-voorkeur; op mobiel niet (overlay).
  function openSidebar() {
    setSidebarOpen(true);
    if (typeof window !== 'undefined' && window.innerWidth >= 768) localStorage.setItem('adminSidebarCollapsed', '0');
  }
  function closeSidebar() {
    setSidebarOpen(false);
    if (typeof window !== 'undefined' && window.innerWidth >= 768) localStorage.setItem('adminSidebarCollapsed', '1');
  }
  function toggleSidebar() { sidebarOpen ? closeSidebar() : openSidebar(); }

  const pendingCount = pendingMods.length;
  const visibleMods = pendingMods.filter(m => !dismissed.has(m.id));

  // "Tijdelijk wegklikken": verberg de huidige verzoeken voor deze sessie.
  // Een NIEUW verzoek (ander id) laat de popup opnieuw verschijnen; na accepteren
  // verdwijnt het verzoek uit de lijst en komt het sowieso niet terug.
  function snoozeAll() {
    const next = new Set(dismissed);
    pendingMods.forEach(m => next.add(m.id));
    setDismissed(next);
    try { sessionStorage.setItem('dismissedModAlerts', JSON.stringify(Array.from(next))); } catch { /* negeer */ }
  }
  function goToModifications() {
    snoozeAll();
    router.push('/modifications');
  }

  // Badge-bubbel op het hamburger-menu
  const Badge = ({ navy }: { navy?: boolean }) => pendingCount > 0 ? (
    <span style={{
      position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 5px',
      background: '#e8a020', color: '#0a2240', borderRadius: 9, fontSize: 11, fontWeight: 800,
      display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
      border: `2px solid ${navy ? '#0a2240' : '#fff'}`,
    }}>{pendingCount}</span>
  ) : null;

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
      <main style={{ flex: 1, overflowY: 'auto', maxHeight: '100vh', minWidth: 0 }}>
        {/* Altijd zichtbaar topmenu: logo + snelknoppen + menu-toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '8px 16px', minHeight: 56, background: '#fff',
          borderBottom: '1px solid rgba(10,34,64,0.1)',
          position: 'sticky', top: 0, zIndex: 40,
        }}>
          <button
            onClick={toggleSidebar}
            style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', fontSize: 22, color: '#0a2240', lineHeight: 1 }}
            title="Menu in-/uitklappen"
          >☰<Badge navy /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Autostalling De Bazuin" style={{ height: 34, width: 'auto', display: 'block' }} />
          <nav style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {TOP_LINKS.map(l => {
              const active = path.startsWith(l.href);
              const showBadge = l.href === '/modifications' && pendingCount > 0;
              return (
                <Link key={l.href} href={l.href} style={{
                  position: 'relative',
                  textDecoration: 'none', padding: '7px 12px', borderRadius: 8,
                  fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                  color: active ? '#fff' : '#0a2240',
                  background: active ? '#0a2240' : 'transparent',
                  border: active ? 'none' : '0.5px solid rgba(10,34,64,0.15)',
                }}>{l.label}{showBadge && <Badge navy={!active} />}</Link>
              );
            })}
          </nav>
        </div>
        {children}
      </main>

      {/* Popup bij openstaande wijzigingsverzoeken */}
      {visibleMods.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 16, right: 16, left: 'auto', zIndex: 200,
          width: 'min(360px, calc(100vw - 32px))',
          background: '#fff', borderRadius: 12, border: '1px solid rgba(10,34,64,0.12)',
          boxShadow: '0 8px 32px rgba(10,34,64,0.25)', overflow: 'hidden',
        }}>
          <div style={{ background: '#0a2240', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🔔</span>
            <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>
              {visibleMods.length === 1 ? 'Nieuw wijzigingsverzoek' : `${visibleMods.length} openstaande wijzigingsverzoeken`}
            </span>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', padding: '8px 0' }}>
            {visibleMods.slice(0, 6).map(m => (
              <div key={m.id} style={{ padding: '8px 16px', borderBottom: '0.5px solid rgba(10,34,64,0.07)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#0a2240' }}>{m.first_name} {m.last_name}</span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#7090b0' }}>{m.reference}</span>
                </div>
                <div style={{ fontSize: 12, color: '#556070', marginTop: 2 }}>
                  {MOD_LABELS[m.modification_type] || 'Wijziging'}
                  {m.modification_type === 'dates' && m.new_arrival_date && (
                    <> · {fmtShort(m.new_arrival_date)} – {fmtShort(m.new_departure_date)}</>
                  )}
                </div>
              </div>
            ))}
            {visibleMods.length > 6 && (
              <div style={{ padding: '6px 16px', fontSize: 12, color: '#7090b0' }}>+ {visibleMods.length - 6} meer…</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '0.5px solid rgba(10,34,64,0.1)' }}>
            <button
              onClick={goToModifications}
              style={{ flex: 1, padding: '9px', borderRadius: 8, background: '#e8a020', color: '#0a2240', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >Bekijken</button>
            <button
              onClick={snoozeAll}
              style={{ padding: '9px 12px', borderRadius: 8, background: '#fff', color: '#556070', border: '0.5px solid rgba(10,34,64,0.2)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >Tijdelijk wegklikken</button>
          </div>
        </div>
      )}
    </div>
  );
}
