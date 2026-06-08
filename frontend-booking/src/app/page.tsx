'use client';
export const dynamic = 'force-dynamic'; // Voorkomt dat Next.js new Date() bevriest in statische HTML
import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  CheckIcon, XMarkIcon, ArrowRightIcon, ArrowLeftIcon, ArrowPathIcon,
  ExclamationTriangleIcon, BoltIcon, TruckIcon, KeyIcon, Battery50Icon, NoSymbolIcon,
  CreditCardIcon, BuildingLibraryIcon, GlobeEuropeAfricaIcon, CurrencyEuroIcon, MapPinIcon,
} from '@heroicons/react/24/outline';
import { bookingApi } from '@/lib/api';
import { formatPlate } from '@/lib/plate';
import SiteHeader from '@/components/SiteHeader';

// Lazy-load Stripe to avoid loading it on every page
const StripeCheckout = lazy(() => import('@/components/StripeCheckout'));

// ── DateRangePicker ──────────────────────────────────────────
function DateRangePicker({ arrival, departure, onArrival, onDeparture, vehicleCount }: {
  arrival: string; departure: string;
  onArrival: (d: string) => void; onDeparture: (d: string) => void;
  vehicleCount: number;
}) {
  // "Vandaag" wordt pas in de browser (na mount) bepaald. Zo kan de datum nooit
  // bevriezen op de builddatum in statisch gegenereerde HTML.
  const [todayStr, setTodayStr] = useState('');
  const [viewMonth, setViewMonth] = useState<Date>(() => { const d = new Date(); d.setDate(1); return d; });
  const [hovered, setHovered] = useState<string | null>(null);
  const [picking, setPicking] = useState<'start' | 'end'>('start');
  const [isMobile, setIsMobile] = useState(false);
  const [calAvail, setCalAvail] = useState<Record<string, number>>({}); // date → available spots

  // Echte huidige datum + maand vaststellen zodra de component in de browser laadt.
  useEffect(() => {
    const d = new Date();
    setTodayStr(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 600);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Laad beschikbaarheid voor de twee zichtbare maanden
  useEffect(() => {
    const m1 = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const m2end = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 2, 0);
    // Lokale datum (niet UTC) — anders verschuift het opgevraagde venster een dag in NL-tijd.
    const from = toStr(m1);
    const to = toStr(m2end);
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}/availability/calendar?from=${from}&to=${to}`)
      .then(r => r.json())
      .then((rows: any[]) => {
        const map: Record<string, number> = {};
        rows.forEach(r => { map[r.date] = parseInt(r.available) || 0; });
        setCalAvail(prev => ({ ...prev, ...map }));
      })
      .catch(() => {});
  }, [viewMonth]);

  function toStr(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function parseStr(s: string) { const [y, m, day] = s.split('-').map(Number); return new Date(y, m - 1, day); }

  function isDayBlocked(dateStr: string): boolean {
    // Geblokt als de dag al vol is (minder vrije plekken dan gevraagd voertuigen)
    if (dateStr in calAvail) return calAvail[dateStr] < vehicleCount;
    return false;
  }

  function handleDay(dateStr: string) {
    if (dateStr < todayStr) return;
    if (isDayBlocked(dateStr)) return;
    if (picking === 'start' || !arrival) {
      onArrival(dateStr); onDeparture(''); setPicking('end');
    } else {
      if (dateStr <= arrival) { onArrival(dateStr); onDeparture(''); setPicking('end'); }
      else { onDeparture(dateStr); setPicking('start'); }
    }
  }

  function prevMonth() { setViewMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)); }
  function nextMonth() { setViewMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)); }

  const m1 = { year: viewMonth.getFullYear(), month: viewMonth.getMonth() };
  const m2d = new Date(m1.year, m1.month + 1, 1);
  const m2 = { year: m2d.getFullYear(), month: m2d.getMonth() };

  const days = arrival && departure
    ? Math.round((parseStr(departure).getTime() - parseStr(arrival).getTime()) / 86400000) + 1
    : 0;

  function renderMonth(year: number, month: number) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startDow = firstDay.getDay() - 1; if (startDow < 0) startDow = 6;
    const cells: (string | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(toStr(new Date(year, month, d)));
    const monthLabel = firstDay.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });

    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#142440', marginBottom: 10, textTransform: 'capitalize' }}>{monthLabel}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {['Ma','Di','Wo','Do','Vr','Za','Zo'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#7090b0', paddingBottom: 6 }}>{d}</div>
          ))}
          {cells.map((ds, i) => {
            if (!ds) return <div key={`e${i}`} style={{ padding: '2px 1px', aspectRatio: '1' }} />;
            const isPast = ds < todayStr;
            const isBlocked = !isPast && isDayBlocked(ds);
            const isStart = ds === arrival;
            const isEnd = ds === departure;
            const rangeEnd = departure || (picking === 'end' && hovered) || null;
            const inRange = !!(arrival && rangeEnd && ds > arrival && ds < rangeEnd);
            const isToday = ds === todayStr;
            const isUnavailable = isPast || isBlocked;
            const cellBg = inRange && !isBlocked ? '#eaf1fb' : 'transparent';
            const dayBg = (isStart || isEnd) ? '#19499e' : isBlocked ? '#fdeaea' : 'transparent';
            const dayColor = (isStart || isEnd) ? 'white' : isUnavailable ? '#c8d4df' : isToday ? '#19499e' : '#142440';
            const dayWeight = (isStart || isEnd || isToday) ? 800 : 400;
            return (
              <div key={ds}
                onClick={() => handleDay(ds)}
                onMouseEnter={() => picking === 'end' && !isUnavailable && setHovered(ds)}
                onMouseLeave={() => setHovered(null)}
                title={isBlocked ? 'Geen plaatsen beschikbaar' : undefined}
                style={{ background: cellBg, padding: '2px 1px', cursor: isUnavailable ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <div style={{ width: '100%', aspectRatio: '1', borderRadius: '50%', background: dayBg, color: dayColor, fontWeight: dayWeight, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', maxWidth: 38, position: 'relative' }}>
                  {new Date(ds + 'T12:00:00').getDate()}
                  {isBlocked && <div style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#e24b4a' }} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.15)', borderRadius: 12, padding: '14px 14px 12px', userSelect: 'none' }}>
      {/* Header: aankomst / dagen / vertrek */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, marginBottom: 14 }}>
        <div onClick={() => { setPicking('start'); onDeparture(''); }}
          style={{ background: picking === 'start' ? '#eaf1fb' : '#f4f6f9', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', border: picking === 'start' ? '1.5px solid #19499e' : '1.5px solid transparent' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Aankomst</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#142440', marginTop: 2, whiteSpace: 'nowrap' }}>
            {arrival ? parseStr(arrival).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 48 }}>
          {days > 0
            ? <span style={{ fontSize: 11, fontWeight: 700, color: '#19499e', background: '#eaf1fb', padding: '4px 6px', borderRadius: 20, whiteSpace: 'nowrap', textAlign: 'center' }}>{days}<br/>dag{days !== 1 ? 'en' : ''}</span>
            : <ArrowRightIcon className="w-5 h-5" style={{ color: '#c0ccd8' }} />}
        </div>
        <div style={{ background: picking === 'end' && arrival ? '#eaf1fb' : '#f4f6f9', borderRadius: 8, padding: '10px 12px', border: picking === 'end' && arrival ? '1.5px solid #19499e' : '1.5px solid transparent' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vertrek</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#142440', marginTop: 2, whiteSpace: 'nowrap' }}>
            {departure ? parseStr(departure).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
          </div>
        </div>
      </div>

      {/* Kalender */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <button onClick={prevMonth} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#142440', padding: '4px 4px', lineHeight: 1, flexShrink: 0, marginTop: 0, display: 'flex', alignItems: 'center' }}><ArrowLeftIcon className="w-5 h-5" /></button>
        <div style={{ flex: 1, display: 'flex', gap: isMobile ? 0 : 16, minWidth: 0 }}>
          {renderMonth(m1.year, m1.month)}
          {!isMobile && renderMonth(m2.year, m2.month)}
        </div>
        <button onClick={nextMonth} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#142440', padding: '4px 4px', lineHeight: 1, flexShrink: 0, marginTop: 0, display: 'flex', alignItems: 'center' }}><ArrowRightIcon className="w-5 h-5" /></button>
      </div>

      {picking === 'end' && arrival && !departure && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#7090b0', textAlign: 'center' }}>
          Selecteer uw vertrekdatum
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: { background: '#142440', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: { width: 32, height: 32, background: '#19499e', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: '#ffffff', flexShrink: 0 },
  main: { maxWidth: 700, margin: '0 auto', padding: '28px 16px' },
  card: { background: 'white', borderRadius: 12, border: '0.5px solid rgba(10,34,64,0.1)', padding: '22px 24px', marginBottom: 16, boxShadow: '0 1px 4px rgba(10,34,64,0.06)' },
  label: { fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block', marginBottom: 7 },
  input: { width: '100%', padding: '10px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 14, color: '#142440', background: 'white', boxSizing: 'border-box' as const },
  btnPrimary: { background: '#19499e', color: 'white', border: 'none', padding: '11px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 },
  btnGhost: { background: 'white', color: '#142440', border: '0.5px solid rgba(10,34,64,0.2)', padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  btnGold: { background: '#19499e', color: '#ffffff', border: 'none', padding: '13px 28px', borderRadius: 9, fontSize: 15, fontWeight: 800, cursor: 'pointer', width: '100%', marginTop: 8 },
};

type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface Vehicle { plate: string; evServiceId?: string; evKwh?: number; rdw?: any; }

interface BookingState {
  arrival: string;
  departure: string;
  ferryOutBoatType: 'snelboot' | 'veerboot' | '';
  ferryRetBoatType: 'snelboot' | 'veerboot' | '';
  destination: 'terschelling' | 'vlieland' | 'anders' | '';
  vehicleCount: number;
  ferryOutId: string;
  ferryOutTime: string;
  ferryOutCustom: boolean;
  isFastOut: boolean;
  ferryRetId: string;
  ferryRetTime: string;
  ferryRetDest: string;
  ferryRetCustom: boolean;
  ferryRetCustomTime: string;
  vehicles: Vehicle[];
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  payMethod: string;
  note: string;
  companyInvoice: boolean;
  billingCompany: string;
}

const INIT: BookingState = {
  arrival: '', departure: '', destination: '', vehicleCount: 1,
  ferryOutId: '', ferryOutTime: '', ferryOutCustom: false, isFastOut: false,
  ferryOutBoatType: '', ferryRetBoatType: '',
  ferryRetId: '', ferryRetTime: '', ferryRetDest: '',
  ferryRetCustom: false, ferryRetCustomTime: '',
  vehicles: [{ plate: '' }],
  firstName: '', lastName: '', email: '', phone: '',
  payMethod: 'ideal',
  note: '',
  companyInvoice: false, billingCompany: '',
};

// ── Officiële betaallogo's ────────────────────────────────────
const IdealWeroLogo = () => (
  <img src="/boeken/ideal-wero.svg" alt="iDEAL / Wero" style={{ height: 28, width: 'auto', display: 'block', margin: '0 auto' }} />
);
const PaypalLogo = () => (
  <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.3px', lineHeight: 1 }}>
    <span style={{ color: '#003087' }}>Pay</span><span style={{ color: '#009CDE' }}>Pal</span>
  </span>
);
const BancontactLogo = () => (
  <span style={{ display: 'inline-flex', borderRadius: 5, overflow: 'hidden', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>
    <span style={{ background: '#005498', color: 'white', padding: '3px 6px' }}>ban</span>
    <span style={{ background: '#FF6200', color: 'white', padding: '3px 6px' }}>contact</span>
  </span>
);
const MastercardLogo = () => (
  <svg viewBox="0 0 50 32" width="44" height="28" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', margin: '0 auto' }}>
    <circle cx="19" cy="16" r="12" fill="#EB001B"/>
    <circle cx="31" cy="16" r="12" fill="#F79E1B"/>
    <path d="M25 5.61 A12 12 0 0 1 25 26.39 A12 12 0 0 1 25 5.61 Z" fill="#FF5F00"/>
  </svg>
);

const PAY_METHODS: { id: string; label: string; icon: React.ReactNode; sub: string; hasLogo?: boolean }[] = [
  { id: 'ideal',      label: 'iDEAL / Wero', icon: <IdealWeroLogo />,                         sub: 'Meest gekozen', hasLogo: true },
  { id: 'card',       label: 'Creditcard',    icon: <MastercardLogo />,                        sub: 'Visa / Mastercard', hasLogo: true },
  { id: 'bancontact', label: 'Bancontact',    icon: <BancontactLogo />,                        sub: 'Belgisch', hasLogo: true },
  { id: 'paypal',     label: 'PayPal',        icon: <PaypalLogo />,                            sub: '+3,4% toeslag', hasLogo: true },
  { id: 'on_site',    label: 'Ter plekke',    icon: <MapPinIcon className="w-6 h-6" />,        sub: '+€5 toeslag' },
];

const EV_OPTIONS = [10, 20, 30, 40, 60];

function addMinutes(time: string, mins: number): string {
  if (!time || !mins) return '';
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function boatDuration(destination: string, boatType: string): number {
  if (boatType === 'snelboot') return 50;
  if (destination === 'vlieland') return 100;
  return 120; // terschelling veerboot
}

function CustomTimeEntry({ label, time, boatType, destination, arrivalLabel, onTimeChange, onBoatTypeChange }: {
  label: string;
  time: string;
  boatType: string;
  destination: string;
  arrivalLabel: string;
  onTimeChange: (t: string) => void;
  onBoatTypeChange: (bt: string) => void;
}) {
  const duration = boatType ? boatDuration(destination, boatType) : 0;
  const arrivalTime = time && boatType ? addMinutes(time, duration) : '';

  return (
    <div style={{ background: '#f8fafc', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</label>
        <input
          type="time"
          value={time}
          onChange={e => onTimeChange(e.target.value)}
          style={{ border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, padding: '9px 14px', fontSize: 20, fontWeight: 800, color: '#142440', outline: 'none', width: 140, background: 'white' }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Boottype</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['snelboot', 'veerboot'] as const).map(bt => {
            const selected = boatType === bt;
            const mins = bt === 'snelboot' ? 50 : destination === 'vlieland' ? 100 : 120;
            return (
              <button
                key={bt}
                onClick={() => onBoatTypeChange(bt)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: selected ? '2px solid #19499e' : '0.5px solid rgba(10,34,64,0.2)',
                  background: selected ? '#eaf1fb' : 'white',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 700,
                  color: selected ? '#19499e' : '#142440',
                  display: 'flex',
                  flexDirection: 'column' as const,
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <span style={{ textTransform: 'capitalize' }}>{bt}</span>
                <span style={{ fontSize: 10, fontWeight: 500, color: selected ? '#19499e' : '#7090b0' }}>{mins} min</span>
              </button>
            );
          })}
        </div>
      </div>

      {arrivalTime && (
        <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.1)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.5 }}>{arrivalLabel}</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#19499e' }}>{arrivalTime}</span>
        </div>
      )}
    </div>
  );
}

// ── Lokaal opgeslagen klantprofiel ────────────────────────────
interface SavedProfile {
  firstName: string; lastName: string; email: string; phone: string;
  plates: string[]; // tot 5 meest recente kentekens
}
const PROFILE_KEY = 'bazuin_profile';
function loadProfile(): SavedProfile | null {
  try { const raw = localStorage.getItem(PROFILE_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function persistProfile(s: BookingState) {
  try {
    const existing = loadProfile();
    const newPlates = s.vehicles.map(v => v.plate).filter(Boolean).map(p => p.toUpperCase());
    const seen = new Set<string>();
    const merged = [...newPlates, ...(existing?.plates || [])].filter(p => { if (seen.has(p)) return false; seen.add(p); return true; }).slice(0, 5);
    const profile: SavedProfile = { firstName: s.firstName, lastName: s.lastName, email: s.email, phone: s.phone, plates: merged };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {}
}

export default function BookingPage() {
  const [step, setStep] = useState<Step>(1);
  const [state, setState] = useState<BookingState>(INIT);
  const [savedProfile, setSavedProfile] = useState<SavedProfile | null>(null);

  // Pre-fill from URL params en/of localStorage na mount
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const email = p.get('email') || '';
    const phone = p.get('telefoon') || '';
    const naam = p.get('naam') || '';
    const kenteken = p.get('kenteken') || '';

    // Deeplink vanaf de tarieven-/website-prijschecker: datums + aantal auto's
    const arrival = p.get('arrival') || '';
    const departure = p.get('departure') || '';
    const autosRaw = parseInt(p.get('autos') || p.get('vehicles') || '', 10);
    const autos = Number.isFinite(autosRaw) ? Math.max(1, Math.min(5, autosRaw)) : 0;
    const dateDeepLink = /^\d{4}-\d{2}-\d{2}$/.test(arrival) && /^\d{4}-\d{2}-\d{2}$/.test(departure) && departure > arrival;

    // Lees opgeslagen profiel
    const profile = loadProfile();
    if (profile) setSavedProfile(profile);

    setState(prev => {
      const urlOverride = !!(email || phone || naam || kenteken);
      const spaceIdx = naam.indexOf(' ');
      const firstName = urlOverride ? (spaceIdx > 0 ? naam.slice(0, spaceIdx) : naam) : (profile?.firstName || '');
      const lastName  = urlOverride ? (spaceIdx > 0 ? naam.slice(spaceIdx + 1) : '') : (profile?.lastName || '');
      const count = dateDeepLink && autos ? autos : prev.vehicleCount;
      return {
        ...prev,
        email:     email     || profile?.email     || '',
        phone:     phone     || profile?.phone     || '',
        firstName, lastName,
        arrival:   dateDeepLink ? arrival : prev.arrival,
        departure: dateDeepLink ? departure : prev.departure,
        vehicleCount: count,
        vehicles: kenteken
          ? [{ plate: kenteken.toUpperCase() }]
          : (dateDeepLink && autos ? Array.from({ length: autos }, (_, i) => prev.vehicles[i] || { plate: '' }) : prev.vehicles),
      };
    });

    // Datums vooraf ingevuld én gevraagd om door te gaan (stap=2): spring naar veerbootselectie
    if (dateDeepLink && (p.get('stap') === '2' || p.get('step') === '2')) {
      setStep(2);
    }
  }, []);

  const [avail, setAvail] = useState<any>(null);
  const [price, setPrice] = useState<any>(null);
  const [feriesOut, setFerriesOut] = useState<any[]>([]);
  const [ferriesRet, setFerriesRet] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [baseRate, setBaseRate] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [syncingDoeksen, setSyncingDoeksen] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentDeadline, setPaymentDeadline] = useState<number | null>(null); // unix ms
  const [payCountdown, setPayCountdown] = useState<number>(30 * 60); // seconden
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedKeyHandover, setAcceptedKeyHandover] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [termsHtml, setTermsHtml] = useState('');

  // Voorwaarden lazy laden zodra de modal voor het eerst opent
  useEffect(() => {
    if (!showTerms || termsHtml) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}/public/terms`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setTermsHtml(d.text || '<p>De voorwaarden zijn momenteel niet beschikbaar.</p>'))
      .catch(() => setTermsHtml('<p>De voorwaarden konden niet worden geladen. Probeer het later opnieuw.</p>'));
  }, [showTerms, termsHtml]);

  // Sluiten met Escape-toets
  useEffect(() => {
    if (!showTerms) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowTerms(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showTerms]);

  function upd(field: keyof BookingState, val: any) {
    setState(prev => ({ ...prev, [field]: val }));
  }

  async function syncAndReloadFerries() {
    if (!state.arrival || !state.departure) return;
    setSyncingDoeksen(true);
    try {
      await bookingApi.syncDoeksenDates([state.arrival, state.departure]);
      // Herlaad veerboten na sync
      if (state.destination && state.destination !== 'anders') {
        const [out, ret] = await Promise.all([
          bookingApi.getFerries(state.arrival, state.destination, 'outbound'),
          bookingApi.getFerries(state.departure, state.ferryRetDest || state.destination, 'return'),
        ]);
        setFerriesOut(out.schedules || []);
        setFerriesRet(ret.schedules || []);
      }
    } catch (e: any) {
      setError('Doeksen tijden laden mislukt: ' + e.message);
    } finally {
      setSyncingDoeksen(false);
    }
  }

  // Step 1: check availability + price as soon as dates are known (destination doesn't affect price)
  useEffect(() => {
    if (!state.arrival || !state.departure) return;
    if (state.departure <= state.arrival) return;
    setAvail(null); setPrice(null);
    // Run both independently so a pricing error doesn't block the availability result
    bookingApi.checkAvailability(state.arrival, state.departure)
      .then(a => setAvail(a))
      .catch(err => setError(err.message));
    bookingApi.calculatePrice(state.arrival, state.departure, state.vehicleCount)
      .then(p => setPrice(p))
      .catch(() => { /* pricing error is non-fatal; user can still proceed */ });
  }, [state.arrival, state.departure, state.vehicleCount]);

  // Load ferries when destination + dates known
  useEffect(() => {
    if (!state.destination || !state.arrival) return;
    bookingApi.getFerries(state.arrival, state.destination, 'outbound').then(d => setFerriesOut(d.schedules || []));
  }, [state.destination, state.arrival]);

  useEffect(() => {
    if (!state.ferryRetDest || !state.departure) return;
    bookingApi.getFerries(state.departure, state.ferryRetDest, 'return').then(d => setFerriesRet(d.schedules || []));
  }, [state.ferryRetDest, state.departure]);

  // Load services
  useEffect(() => { bookingApi.getServices().then(setServices).catch(() => {}); }, []);

  // Load base rate (gebruik morgen+overmorgen als referentie)
  useEffect(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    const fmt = (dt: Date) => dt.toISOString().split('T')[0];
    const d2 = new Date(d); d2.setDate(d2.getDate() + 1);
    bookingApi.calculatePrice(fmt(d), fmt(d2), 1).then(setBaseRate).catch(() => {});
  }, []);

  // RDW lookup
  async function lookupPlate(idx: number, plate: string) {
    if (plate.length < 5) return;
    const rdw = await bookingApi.lookupPlate(plate).catch(() => null);
    // Gebruik functionele update om stale closure te vermijden:
    // de async call duurt even, ondertussen kan state.vehicles al gewijzigd zijn
    setState(prev => {
      const v = [...prev.vehicles];
      v[idx] = { ...v[idx], rdw };
      return { ...prev, vehicles: v };
    });
  }

  function updateVehicle(idx: number, field: string, val: any) {
    const v = [...state.vehicles];
    v[idx] = { ...v[idx], [field]: val };
    upd('vehicles', v);
  }

  function setVehicleCount(n: number) {
    const count = Math.max(1, Math.min(5, n));
    const v = Array.from({ length: count }, (_, i) => state.vehicles[i] || { plate: '' });
    setState(prev => ({ ...prev, vehicleCount: count, vehicles: v }));
  }

  async function submit() {
    setLoading(true); setError('');
    try {
      const evServices = services.filter(s => s.kwh);
      const body = {
        arrivalDate: state.arrival,
        departureDate: state.departure,
        ferryOutboundId: state.ferryOutId || undefined,
        ferryOutboundTime: state.ferryOutTime || undefined,
        ferryOutboundDestination: state.destination,
        isFastFerryOutbound: state.isFastOut,
        ferryReturnId: state.ferryRetId || undefined,
        ferryReturnTime: state.ferryRetTime || undefined,
        ferryReturnDestination: state.ferryRetDest || undefined,
        ferryReturnCustom: state.ferryRetCustom,
        ferryReturnCustomTime: state.ferryRetCustomTime || undefined,
        paymentMethod: state.payMethod,
        customerNote: state.note || undefined,
        customer: { firstName: state.firstName, lastName: state.lastName, email: state.email, phone: state.phone, company: state.companyInvoice && state.billingCompany.trim() ? state.billingCompany.trim() : undefined },
        vehicles: state.vehicles.map(v => {
          const evSvc = evServices.find(s => s.kwh === v.evKwh);
          return { licensePlate: v.plate, evServiceId: evSvc?.id, evKwh: v.evKwh };
        }),
      };

      // 1. Reservering aanmaken
      const res = await bookingApi.createReservation(body);
      setResult(res);
      persistProfile(state); // sla klantgegevens + kentekens op voor volgende keer

      // 2. Ter plekke betalen → direct naar bevestiging
      if (state.payMethod === 'on_site') {
        setStep(6);
        return;
      }

      // 3. Stripe Payment Intent aanmaken
      const intentRes = await bookingApi.createPaymentIntent(res.id);

      if (intentRes.onSite) {
        setStep(6);
        return;
      }

      // 4. Toon Stripe checkout
      setClientSecret(intentRes.clientSecret ?? null);
      setPaymentDeadline(Date.now() + 30 * 60 * 1000); // 30 min vanaf nu
      setPayCountdown(30 * 60);
      setStep(6); // stap 6 = stripe betaalscherm, stap 7 = succes

    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  function handleStripeSuccess() {
    setClientSecret(null);
    setPaymentDeadline(null);
    setStep(7 as any);
  }

  // Countdown timer voor betalingsvenster
  useEffect(() => {
    if (!paymentDeadline) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((paymentDeadline - Date.now()) / 1000));
      setPayCountdown(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [paymentDeadline]);

  const totalEv = state.vehicles.reduce((acc, v) => {
    if (!v.evKwh) return acc;
    const s = services.find(s => s.kwh === v.evKwh);
    return acc + (s ? parseFloat(s.price) : 0);
  }, 0);
  const onSiteFee = state.payMethod === 'on_site' ? 5 * state.vehicleCount : 0;
  // PayPal-toeslag: 3,40% + €0,35 over subtotaal (parkeren + laden)
  const paypalFee = state.payMethod === 'paypal'
    ? Math.round((((price?.totalPrice || 0) + totalEv) * 0.034 + 0.35) * 100) / 100
    : 0;
  const grandTotal = (price?.totalPrice || 0) + totalEv + onSiteFee + paypalFee;

  const availPct = avail ? Math.round(avail.available / avail.total * 100) : 0;

  // ── Step indicators ──────────────────────────────────────
  const STEPS = ['Datums', 'Veerboot', 'Voertuigen', 'Extra\'s', 'Betaling'];

  return (
    <div style={S.page}>
      {/* Header — zelfde stijl als de website */}
      <SiteHeader />

      <div style={S.main}>
        {/* Step bar */}
        {step < 6 && (
          <div style={{ display: 'flex', marginBottom: 24, borderRadius: 10, overflow: 'hidden', border: '0.5px solid rgba(10,34,64,0.1)' }}>
            {STEPS.map((s, i) => {
              const n = (i + 1) as Step;
              const done = step > n;
              const active = step === n;
              return (
                <div key={s} style={{ flex: 1, padding: '10px 6px', textAlign: 'center', fontSize: 11, fontWeight: 600, background: done ? '#eaf1fb' : active ? '#142440' : 'white', color: done ? '#19499e' : active ? 'white' : '#7090b0', borderRight: i < 4 ? '0.5px solid rgba(10,34,64,0.1)' : 'none' }}>
                  <div style={{ fontSize: 13, marginBottom: 2, display: 'flex', justifyContent: 'center' }}>{done ? <CheckIcon className="w-4 h-4" /> : n}</div>
                  <div>{s}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── STEP 1: Dates ── */}
        {step === 1 && (
          <>
            <div style={S.card}>
              <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800, color: '#142440' }}>Wanneer komt u?</h2>

              {/* Date range */}
              <div style={{ marginBottom: 20 }}>
                <label style={S.label}>Periode</label>
                <DateRangePicker
                  arrival={state.arrival}
                  departure={state.departure}
                  onArrival={v => upd('arrival', v)}
                  onDeparture={v => upd('departure', v)}
                  vehicleCount={state.vehicleCount}
                />
              </div>

              {/* Vehicle count */}
              <div>
                <label style={S.label}>Aantal auto's</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => setVehicleCount(state.vehicleCount - 1)}
                    style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(10,34,64,0.2)', background: 'white', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#142440' }}>−</button>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#142440', minWidth: 20, textAlign: 'center' }}>{state.vehicleCount}</span>
                  <button onClick={() => setVehicleCount(state.vehicleCount + 1)}
                    style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(10,34,64,0.2)', background: 'white', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#142440' }}>+</button>
                  <span style={{ fontSize: 12, color: '#7090b0' }}>max. 5</span>
                </div>
              </div>
            </div>

            {/* Basistarief — alleen tonen als datums zijn gekozen maar prijs nog laadt */}
            {!avail && baseRate && state.arrival && state.departure && (
              <div style={{ ...S.card, background: '#f4f6f9', border: 'none' }}>
                <div style={{ fontSize: 12, color: '#7090b0', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: 600 }}>
                  Tarief {baseRate.rateName}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 26, fontWeight: 900, color: '#142440' }}>€ {baseRate.pricePerCar.toFixed(0)},–</span>
                  <span style={{ fontSize: 13, color: '#7090b0' }}>per auto · totaal</span>
                </div>
                <div style={{ fontSize: 12, color: '#aab0bc', marginTop: 4 }}>Dit is de totaalprijs voor de hele periode. Selecteer datums voor de exacte berekening.</div>
              </div>
            )}

            {/* Availability + price */}
            {avail && (
              avail.available < state.vehicleCount ? (
                /* VOL — prominente melding */
                <div style={{ ...S.card, background: '#fdeaea', border: '1.5px solid #e24b4a', padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <NoSymbolIcon className="w-7 h-7" style={{ color: '#e24b4a', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#8a2020', marginBottom: 2 }}>
                        {avail.available === 0 ? 'Geen plaatsen beschikbaar' : `Niet genoeg plaatsen beschikbaar`}
                      </div>
                      <div style={{ fontSize: 13, color: '#8a2020' }}>
                        {avail.available === 0
                          ? 'De stalling is vol voor de gekozen periode. Kies andere datums.'
                          : `Er ${avail.available === 1 ? 'is' : 'zijn'} nog ${avail.available} ${avail.available === 1 ? 'plek' : 'plekken'} vrij, maar u heeft ${state.vehicleCount} auto's. Kies andere datums of minder auto's.`}
                      </div>
                    </div>
                  </div>
                </div>
              ) : price ? (
                <div style={S.card}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: avail.available <= 5 ? '#ef9f27' : '#7090b0', fontWeight: avail.available <= 5 ? 700 : 400 }}>
                      {avail.available} {avail.available === 1 ? 'plek' : 'plaatsen'} vrij
                    </span>
                    {price.seasonSurchargePct > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#7a5010', background: '#fef3dc', padding: '3px 8px', borderRadius: 20 }}>
                        {price.rateName}
                      </span>
                    )}
                  </div>
                  <div style={{ height: 5, background: '#f4f6f9', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
                    <div style={{ height: '100%', width: `${availPct}%`, background: availPct < 20 ? '#e24b4a' : availPct < 50 ? '#ef9f27' : '#19499e', borderRadius: 4, transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 28, fontWeight: 900, color: '#142440' }}>€ {price.totalPrice.toFixed(0)}</span>
                    <span style={{ fontSize: 13, color: '#7090b0' }}>totaal · {price.nights + 1} dag{price.nights + 1 !== 1 ? 'en' : ''}</span>
                    {state.vehicleCount > 1 && (
                      <span style={{ fontSize: 12, color: '#7090b0' }}>(€ {price.pricePerCar.toFixed(0)} p/auto)</span>
                    )}
                  </div>
                  {price.segments?.length > 1 && (
                    <div style={{ marginTop: 10, padding: '8px 10px', background: '#f4f6f9', borderRadius: 7, fontSize: 12, color: '#556070' }}>
                      {price.segments.map((seg: any, i: number) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: i < price.segments.length - 1 ? 3 : 0 }}>
                          <span>{seg.rateName} <span style={{ color: '#9ab0c8' }}>({seg.daysInRate} van {price.days} dag{price.days !== 1 ? 'en' : ''})</span></span>
                          <span style={{ fontWeight: 600 }}>€ {seg.weightedPrice.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null
            )}

            {/* Legenda geblokte dagen */}
            {state.arrival && state.departure && (
              <div style={{ fontSize: 11, color: '#9ab0c8', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e24b4a', display: 'inline-block' }} />
                  = vol / niet beschikbaar
                </span>
              </div>
            )}

            {/* Knop + validatiemeldingen */}
            {(() => {
              const isFull = avail && avail.available < state.vehicleCount;
              const missingDates = !state.arrival || !state.departure;
              const canProceed = avail && !isFull && state.arrival && state.departure;
              return (
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
                  {missingDates && avail === null && <span style={{ fontSize: 12, color: '#7090b0' }}>Kies aankomst- en vertrekdatum</span>}
                  <button
                    onClick={() => { if (canProceed) setStep(2); }}
                    style={{
                      ...S.btnPrimary,
                      opacity: canProceed ? 1 : 0.4,
                      cursor: canProceed ? 'pointer' : 'not-allowed',
                      background: canProceed ? '#19499e' : '#7090b0',
                    }}>
                    Verder: Veerboot kiezen <ArrowRightIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle' }} />
                  </button>
                </div>
              );
            })()}
          </>
        )}

        {/* ── STEP 2: Ferry ── */}
        {step === 2 && (
          <>
            {/* Bestemmingskeuze bovenaan stap 2 */}
            <div style={S.card}>
              <h2 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 800, color: '#142440' }}>Waarheen?</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['terschelling', 'vlieland', 'anders'] as const).map(d => {
                  const selected = state.destination === d;
                  return (
                    <button key={d}
                      onClick={() => {
                        upd('destination', d);
                        // Reset veerbootkeuzes bij wisselen bestemming
                        upd('ferryOutId', ''); upd('ferryOutTime', ''); upd('ferryOutCustom', false);
                        upd('ferryRetId', ''); upd('ferryRetTime', ''); upd('ferryRetCustom', false);
                        // Terugreis bestemming automatisch meenemen (tenzij "anders")
                        if (d !== 'anders') upd('ferryRetDest', d);
                        else upd('ferryRetDest', '');
                      }}
                      style={{ flex: 1, padding: '11px 8px', borderRadius: 8,
                        border: selected ? '2px solid #19499e' : '0.5px solid rgba(10,34,64,0.2)',
                        background: selected ? '#eaf1fb' : 'white',
                        cursor: 'pointer', fontSize: 14, fontWeight: 700,
                        color: selected ? '#19499e' : '#142440',
                        textAlign: 'center' as const }}>
                      {d === 'anders' ? 'Anders' : d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  );
                })}
              </div>
              {state.destination === 'anders' && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#7090b0', padding: '8px 12px', background: '#f8f9fb', borderRadius: 8 }}>
                  U rijdt zelf en neemt geen veerboot — vul hieronder uw aankomst- en ophaaltijd in.
                </div>
              )}
              {!state.destination && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#e24b4a', fontWeight: 600 }}>
                  <ExclamationTriangleIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Kies een bestemming om verder te gaan.
                </div>
              )}
            </div>

            {state.destination === 'anders' ? (
              /* ── Geen veerboot: eigen tijden ── */
              <div style={S.card}>
                <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#142440' }}>Aankomst & ophaalttijd</h2>
                <p style={{ margin: '0 0 20px', fontSize: 13, color: '#7090b0' }}>U rijdt zelf. Geef aan wanneer u aankomt en wanneer wij uw auto klaar moeten zetten.</p>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ ...S.label, marginBottom: 6 }}>
                    Aankomstdatum & -tijd · {new Date(state.arrival).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </label>
                  <input type="time" value={state.ferryOutTime} onChange={e => upd('ferryOutTime', e.target.value)}
                    style={{ border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, padding: '9px 14px', fontSize: 22, fontWeight: 800, color: '#142440', outline: 'none', width: 150, background: 'white' }} />
                </div>

                <div style={{ borderTop: '0.5px solid rgba(10,34,64,0.08)', paddingTop: 18, marginBottom: 8 }}>
                  <label style={{ ...S.label, marginBottom: 6 }}>
                    Ophaalttijd · {new Date(state.departure).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </label>
                  <input type="time" value={state.ferryRetCustomTime} onChange={e => upd('ferryRetCustomTime', e.target.value)}
                    style={{ border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, padding: '9px 14px', fontSize: 22, fontWeight: 800, color: '#142440', outline: 'none', width: 150, background: 'white' }} />
                  <div style={{ fontSize: 11, color: '#7090b0', marginTop: 8 }}>Wij zetten uw auto 30 minuten voor deze tijd klaar.</div>
                </div>
              </div>
            ) : state.destination ? (
            <div style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#142440' }}>Veerbootkeuze</h2>
                <button onClick={syncAndReloadFerries} disabled={syncingDoeksen}
                  style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #19499e', background: syncingDoeksen ? '#eaf1fb' : 'white', color: '#19499e', fontSize: 12, fontWeight: 700, cursor: syncingDoeksen ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {syncingDoeksen ? <><ArrowPathIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Laden…</> : <><ArrowPathIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Laad actuele tijden</>}
                </button>
              </div>
              <p style={{ margin: '0 0 18px', fontSize: 13, color: '#7090b0' }}>Uw auto wordt 30 minuten na aankomst van de boot klaargezet.</p>

              {/* ── Heenreis ── */}
              <div style={{ fontSize: 16, fontWeight: 800, color: '#142440', marginBottom: 10, textTransform: 'capitalize' as const }}>
                Heenreis · {new Date(state.arrival).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>

              {feriesOut.length > 0 ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6, marginBottom: 10 }}>
                    {feriesOut
                      .filter((s, idx, arr) => arr.findIndex(x => x.departureTime === s.departureTime && x.isFast === s.isFast) === idx)
                      .map((s, i) => {
                      const sel = state.ferryOutTime === s.departureTime && !state.ferryOutCustom;
                      return (
                        <button key={i} onClick={() => { upd('ferryOutId', s.ferryId); upd('ferryOutTime', s.departureTime); upd('isFastOut', s.isFast); upd('ferryOutCustom', false); }}
                          style={{ padding: '8px 6px', borderRadius: 8, border: sel ? '2px solid #19499e' : '0.5px solid rgba(10,34,64,0.15)', background: sel ? '#eaf1fb' : 'white', cursor: 'pointer', textAlign: 'center' as const }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: sel ? '#19499e' : '#142440' }}>{s.departureTime}</div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: sel ? '#19499e' : '#7090b0', marginTop: 2 }}>{s.isFast ? 'snelboot' : 'veerboot'}</div>
                        </button>
                      );
                    })}
                    {/* Eigen tijd knop */}
                    <button onClick={() => { upd('ferryOutCustom', true); upd('ferryOutId', ''); upd('ferryOutTime', ''); }}
                      style={{ padding: '8px 6px', borderRadius: 8, border: state.ferryOutCustom ? '2px solid #e8a020' : '0.5px solid rgba(10,34,64,0.15)', background: state.ferryOutCustom ? '#fff8e6' : 'white', cursor: 'pointer', textAlign: 'center' as const }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: state.ferryOutCustom ? '#b07a10' : '#556070' }}>Eigen</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: state.ferryOutCustom ? '#b07a10' : '#556070' }}>tijd</div>
                    </button>
                  </div>
                  {state.ferryOutCustom && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ ...S.label, marginBottom: 4 }}>Eigen vertrektijd vanuit Harlingen</label>
                      <input type="time" value={state.ferryOutTime}
                        onChange={e => upd('ferryOutTime', e.target.value)}
                        style={{ border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 20, fontWeight: 800, color: '#142440', outline: 'none', width: 150, background: 'white' }} />
                    </div>
                  )}
                </>
              ) : (
                /* Geen Doeksen-data beschikbaar */
                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 13, color: '#7090b0', marginBottom: 10 }}>Geen veerboottijden beschikbaar voor deze datum.</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                    <button onClick={syncAndReloadFerries} disabled={syncingDoeksen}
                      style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #19499e', background: 'white', color: '#19499e', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {syncingDoeksen ? <><ArrowPathIcon className="w-4 h-4" />Laden…</> : <><ArrowPathIcon className="w-4 h-4" />Laad actuele tijden van Doeksen</>}
                    </button>
                    <button onClick={() => { upd('ferryOutCustom', true); upd('ferryOutId', ''); upd('ferryOutTime', ''); }}
                      style={{ padding: '8px 14px', borderRadius: 8, border: state.ferryOutCustom ? '2px solid #e8a020' : '0.5px solid rgba(10,34,64,0.2)', background: state.ferryOutCustom ? '#fff8e6' : 'white', color: state.ferryOutCustom ? '#b07a10' : '#142440', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      Eigen tijd invoeren
                    </button>
                  </div>
                  {state.ferryOutCustom && (
                    <div style={{ marginTop: 14 }}>
                      <label style={{ ...S.label, marginBottom: 4 }}>Eigen vertrektijd vanuit Harlingen</label>
                      <input type="time" value={state.ferryOutTime}
                        onChange={e => upd('ferryOutTime', e.target.value)}
                        style={{ border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 20, fontWeight: 800, color: '#142440', outline: 'none', width: 150, background: 'white' }} />
                    </div>
                  )}
                </div>
              )}
              {false && (
                /* Bewaard als fallback voor eigen tijdinvoer */
                <CustomTimeEntry
                  label="Vertrektijd vanuit Harlingen"
                  time={state.ferryOutTime}
                  boatType={state.ferryOutBoatType}
                  destination={state.destination}
                  arrivalLabel="Aankomst op het eiland"
                  onTimeChange={t => { upd('ferryOutTime', t); upd('ferryOutId', ''); }}
                  onBoatTypeChange={bt => upd('ferryOutBoatType', bt as any)}
                />
              )}

              {/* ── Terugreis ── */}
              <div style={{ borderTop: '0.5px solid rgba(10,34,64,0.08)', paddingTop: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#142440', marginBottom: 12, textTransform: 'capitalize' as const }}>
                  Terugreis · {new Date(state.departure).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>

                {/* Eilandkeuze terugreis — zonder "Eigen tijd" (die staat bij de tijden) */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' as const }}>
                  {state.destination && (
                    <button
                      onClick={() => { upd('ferryRetDest', state.destination); upd('ferryRetCustom', false); }}
                      style={{ padding: '6px 14px', borderRadius: 6,
                        border: state.ferryRetDest === state.destination && !state.ferryRetCustom ? '2px solid #19499e' : '0.5px solid rgba(10,34,64,0.2)',
                        background: state.ferryRetDest === state.destination && !state.ferryRetCustom ? '#eaf1fb' : 'white',
                        cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#142440', textTransform: 'capitalize' as const }}>
                      Ook terug vanaf {state.destination.charAt(0).toUpperCase() + state.destination.slice(1)}
                    </button>
                  )}
                  {['terschelling', 'vlieland'].filter(d => d !== state.destination).map(d => (
                    <button key={d} onClick={() => { upd('ferryRetDest', d); upd('ferryRetCustom', false); }}
                      style={{ padding: '6px 14px', borderRadius: 6, border: state.ferryRetDest === d && !state.ferryRetCustom ? '2px solid #19499e' : '0.5px solid rgba(10,34,64,0.2)', background: state.ferryRetDest === d && !state.ferryRetCustom ? '#eaf1fb' : 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#142440', textTransform: 'capitalize' as const }}>
                      {d}
                    </button>
                  ))}
                </div>

                {state.ferryRetCustom ? (
                  <CustomTimeEntry
                    label="Vertrektijd vanaf het eiland"
                    time={state.ferryRetCustomTime}
                    boatType={state.ferryRetBoatType}
                    destination={state.ferryRetDest || state.destination}
                    arrivalLabel="Aankomst in Harlingen"
                    onTimeChange={t => upd('ferryRetCustomTime', t)}
                    onBoatTypeChange={bt => upd('ferryRetBoatType', bt as any)}
                  />
                ) : ferriesRet.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6 }}>
                    {ferriesRet
                      .filter((s, idx, arr) => arr.findIndex(x => x.departureTime === s.departureTime && x.isFast === s.isFast) === idx)
                      .map((s, i) => {
                      const sel = state.ferryRetTime === s.departureTime;
                      return (
                        <button key={i} onClick={() => { upd('ferryRetId', s.ferryId); upd('ferryRetTime', s.departureTime); }}
                          style={{ padding: '8px 6px', borderRadius: 8, border: sel ? '2px solid #19499e' : '0.5px solid rgba(10,34,64,0.15)', background: sel ? '#eaf1fb' : 'white', cursor: 'pointer', textAlign: 'center' as const }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: '#7090b0', marginBottom: 2 }}>vertrek eiland</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: sel ? '#19499e' : '#142440' }}>{s.departureTime}</div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: sel ? '#19499e' : '#7090b0', marginTop: 2 }}>{s.isFast ? 'snelboot' : 'veerboot'}</div>
                          {s.arrivalHarlingen && <><div style={{ fontSize: 9, fontWeight: 700, color: '#7090b0', marginTop: 4, marginBottom: 2 }}>aankomst Hlg</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: sel ? '#19499e' : '#556070' }}>{s.arrivalHarlingen}</div></>}
                        </button>
                      );
                    })}
                    {/* Eigen tijd knop naast de bootvakjes */}
                    <button onClick={() => { upd('ferryRetCustom', true); upd('ferryRetId', ''); upd('ferryRetTime', ''); }}
                      style={{ padding: '8px 6px', borderRadius: 8, border: state.ferryRetCustom ? '2px solid #e8a020' : '0.5px solid rgba(10,34,64,0.15)', background: state.ferryRetCustom ? '#fff8e6' : 'white', cursor: 'pointer', textAlign: 'center' as const }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#556070' }}>Eigen</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#556070' }}>tijd</div>
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: '16px', background: '#f8fafc', borderRadius: 10 }}>
                    <div style={{ fontSize: 13, color: '#7090b0', marginBottom: 10 }}>Geen veerboottijden beschikbaar voor deze datum.</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                      <button onClick={syncAndReloadFerries} disabled={syncingDoeksen}
                        style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #19499e', background: 'white', color: '#19499e', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {syncingDoeksen ? <><ArrowPathIcon className="w-4 h-4" />Laden…</> : <><ArrowPathIcon className="w-4 h-4" />Laad actuele tijden van Doeksen</>}
                      </button>
                      <button onClick={() => { upd('ferryRetCustom', true); upd('ferryRetId', ''); upd('ferryRetTime', ''); }}
                        style={{ padding: '8px 14px', borderRadius: 8, border: '0.5px solid rgba(10,34,64,0.2)', background: 'white', color: '#142440', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        Eigen tijd invoeren
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            ) : null} {/* end else (non-anders) */}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button style={S.btnGhost} onClick={() => setStep(1)}><ArrowLeftIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Terug</button>
              <button style={S.btnPrimary}
                disabled={!state.destination || !state.ferryOutTime}
                onClick={() => setStep(3)}>Verder: Voertuigen <ArrowRightIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle' }} /></button>
            </div>
          </>
        )}

        {/* ── STEP 3: Vehicles ── */}
        {step === 3 && (
          <>
            {/* Valet notice */}
            <div style={{ background: '#fff8e6', border: '1px solid #e8a020', borderRadius: 10, padding: '14px 16px', marginBottom: 16, fontSize: 13, color: '#7a5010' }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}><KeyIcon className="w-4 h-4" style={{ flexShrink: 0 }} />Verplichte sleutelafgifte</strong>
              Bij aankomst parkeert u uw auto op de <strong>geel gemarkeerde vakken</strong> op het buitenterrein en werpt u uw autosleutel in de beveiligde afgiftekluis. Gooi alleen de <strong>kale sleutel</strong> in de kluis — geen hoesjes of enveloppen.
            </div>

            {state.vehicles.map((v, i) => (
              <div key={i} style={S.card}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#142440', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}><TruckIcon className="w-4 h-4" />Auto {i + 1}</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={S.label}>Kenteken</label>
                  <input value={v.plate} onChange={e => updateVehicle(i, 'plate', e.target.value.toUpperCase())}
                    onBlur={e => lookupPlate(i, e.target.value)}
                    placeholder="AB-12-CD"
                    style={{ ...S.input, fontFamily: 'monospace', fontWeight: 700, fontSize: 18, letterSpacing: 1, textTransform: 'uppercase' }} />
                  {/* Eerder gebruikte kentekens */}
                  {savedProfile && savedProfile.plates.length > 0 && !v.plate && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: '#7090b0', marginBottom: 5 }}>Eerder gebruikt:</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {savedProfile.plates.map(pl => (
                          <button key={pl} type="button"
                            onClick={() => { updateVehicle(i, 'plate', pl); lookupPlate(i, pl); }}
                            style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, padding: '4px 10px', background: '#f5c842', color: '#142440', border: '1.5px solid #d4a800', borderRadius: 5, cursor: 'pointer', letterSpacing: 1 }}>
                            {pl}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {v.rdw?.found && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: '#eaf1fb', borderRadius: 7, fontSize: 12, color: '#19499e', fontWeight: 600 }}>
                      <CheckIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{v.rdw.make} {v.rdw.model} · {v.rdw.color} · {v.rdw.fuelType}
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button style={S.btnGhost} onClick={() => setStep(2)}><ArrowLeftIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Terug</button>
              <button style={S.btnPrimary} disabled={state.vehicles.some(v => !v.plate || v.plate.length < 2)}
                onClick={() => setStep(4)}>Verder: Extra's <ArrowRightIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle' }} /></button>
            </div>
          </>
        )}

        {/* ── STEP 4: Extras ── */}
        {step === 4 && (
          <>
            <div style={S.card}>
              <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#142440' }}>Extra diensten</h2>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: '#7090b0' }}>Optioneel — voeg auto opladen toe per auto.</p>

              {state.vehicles.map((v, i) => {
                const evSvcs = services
                  .filter(s => s.kwh && !s.admin_only)
                  .filter((s, idx, arr) => arr.findIndex(x => x.kwh === s.kwh) === idx);
                const fuelType = v.rdw?.fuelType?.toLowerCase() || '';
                const isCombustion = fuelType.includes('benzine') || fuelType.includes('diesel') || fuelType.includes('lpg');
                return (
                  <div key={i} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: i < state.vehicles.length - 1 ? '0.5px solid rgba(10,34,64,0.08)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span className="nl-plate">{formatPlate(v.plate)}</span>
                      {v.rdw?.found && <span style={{ fontSize: 12, color: '#7090b0' }}>{v.rdw.make} {v.rdw.model}</span>}
                    </div>
                    {isCombustion ? (
                      <div style={{ fontSize: 13, color: '#7090b0', padding: '10px 14px', background: '#f4f6f9', borderRadius: 8 }}>
                        Auto opladen niet beschikbaar voor {v.rdw.fuelType.toLowerCase()} voertuigen.
                      </div>
                    ) : (() => {
                      const ev = v.rdw?.ev;
                      const isBev = ev?.isBev ?? false;
                      const suggestedKwh = ev ? ev.suggestedKwh : null;
                      // Aanbevolen tier = kleinste optie >= suggestedKwh
                      // BEV: ~50% accucap, PHEV: volledige accucap (incl. laadverlies)
                      const suggestedTier = suggestedKwh !== null
                        ? (evSvcs.filter(o => o.kwh >= suggestedKwh).sort((a, b) => a.kwh - b.kwh)[0]
                           ?? evSvcs[evSvcs.length - 1])
                        : null;
                      // "Zeker vol" = de hoogste tier die past bij de accucapaciteit
                      // BEV: toon t/m het tier dat de accu vult (max 105% van capaciteit)
                      // PHEV / onbekend: toon één tier boven aanbevolen
                      const fullChargeTier = isBev && ev
                        ? (evSvcs.filter(s => s.kwh <= ev.batteryCapacityKwh * 1.05)
                            .sort((a, b) => b.kwh - a.kwh)[0]
                           ?? evSvcs[evSvcs.length - 1])
                        : (() => {
                            const sugIdx = suggestedTier ? evSvcs.findIndex(s => s.kwh === suggestedTier.kwh) : -1;
                            return sugIdx >= 0 ? (evSvcs[sugIdx + 1] ?? suggestedTier) : suggestedTier;
                          })();
                      const availableSvcs = ev && fullChargeTier
                        ? evSvcs.filter(s => s.kwh <= fullChargeTier.kwh)
                        : evSvcs;
                      return (
                      <>
                        <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600, color: '#142440', display: 'flex', alignItems: 'center', gap: 6 }}><BoltIcon className="w-4 h-4" />Auto opladen (type 2 kabel)</div>

                        {ev && (
                          <div style={{ marginBottom: 12, padding: '10px 12px', background: '#f0f7ff', borderRadius: 8, fontSize: 12 }}>
                            <div style={{ fontWeight: 700, color: '#142440', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Battery50Icon className="w-4 h-4" />Geschatte accucapaciteit: ~{ev.batteryCapacityKwh} kWh
                            </div>
                            <div style={{ color: '#556070' }}>
                              WLTP bereik: {ev.wltpRangeKm} km · Realistisch: ~{Math.round(ev.realisticKmPerKwh * ev.batteryCapacityKwh)} km
                            </div>
                            <div style={{ color: '#556070', marginTop: 2 }}>
                              Ca. {ev.realisticKmPerKwh} km extra per geladen kWh
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                          <button onClick={() => updateVehicle(i, 'evKwh', undefined)}
                            style={{ padding: '8px 14px', borderRadius: 8, border: !v.evKwh ? '2px solid #142440' : '0.5px solid rgba(10,34,64,0.2)', background: !v.evKwh ? '#142440' : 'white', color: !v.evKwh ? 'white' : '#142440', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                            Geen laden
                          </button>
                          {availableSvcs.map(s => {
                            // Kleinste optie die >= benodigde kWh (volledig opladen), anders de grootste beschikbare
                            const suggestedOpt = suggestedKwh !== null
                              ? (availableSvcs.filter(o => o.kwh >= suggestedKwh).sort((a, b) => a.kwh - b.kwh)[0]
                                 ?? availableSvcs[availableSvcs.length - 1])
                              : null;
                            const isSuggested = suggestedOpt !== null && s.kwh === suggestedOpt.kwh;
                            // "Zeker vol" label op de tier die de accu vult
                            const isExtraTier = fullChargeTier !== null && fullChargeTier.kwh !== suggestedTier?.kwh && s.kwh === fullChargeTier.kwh;
                            // km cappen op accucapaciteit (meer gaat er niet in)
                            const extraKm = ev ? Math.round(Math.min(s.kwh, ev.batteryCapacityKwh) * ev.realisticKmPerKwh) : null;
                            const sel = v.evKwh === s.kwh;
                            return (
                              <button key={s.id} onClick={() => updateVehicle(i, 'evKwh', s.kwh)}
                                style={{ padding: '8px 14px', borderRadius: 8, border: sel ? '2px solid #19499e' : '0.5px solid rgba(10,34,64,0.18)', background: sel ? '#eaf1fb' : 'white', cursor: 'pointer', textAlign: 'center' as const, position: 'relative' as const }}>
                                {isSuggested && !sel && (
                                  <div style={{ position: 'absolute' as const, top: -8, left: '50%', transform: 'translateX(-50%)', background: '#3a80c0', color: 'white', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, whiteSpace: 'nowrap' as const }}>aanbevolen</div>
                                )}
                                {isExtraTier && !sel && (
                                  <div style={{ position: 'absolute' as const, top: -8, left: '50%', transform: 'translateX(-50%)', background: '#8a6020', color: 'white', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, whiteSpace: 'nowrap' as const }}>zeker vol</div>
                                )}
                                <div style={{ fontSize: 13, fontWeight: 700, color: sel ? '#19499e' : '#142440' }}>{s.kwh} kWh</div>
                                <div style={{ fontSize: 11, color: '#7090b0' }}>€ {parseFloat(s.price).toFixed(0)}</div>
                                {extraKm && <div style={{ fontSize: 10, color: sel ? '#19499e' : '#7090b0', marginTop: 1 }}>+{extraKm} km</div>}
                              </button>
                            );
                          })}
                        </div>

                        {ev && availableSvcs.length === 0 && (
                          <div style={{ marginTop: 8, fontSize: 12, color: '#7090b0', fontStyle: 'italic' }}>
                            Geen laadopties beschikbaar voor de accucapaciteit van dit voertuig.
                          </div>
                        )}

                        {v.evKwh && ev && (() => {
                          const isExtra = fullChargeTier !== null && fullChargeTier.kwh !== suggestedTier?.kwh && v.evKwh === fullChargeTier.kwh;
                          const realisticKm = Math.round(Math.min(v.evKwh, ev.batteryCapacityKwh) * ev.realisticKmPerKwh);
                          return isExtra && !isBev ? (
                            <div style={{ marginTop: 10, padding: '10px 12px', background: '#fff8e6', border: '0.5px solid #e8a020', borderRadius: 8, fontSize: 12, color: '#7a5010' }}>
                              <div style={{ fontWeight: 700, marginBottom: 3 }}>Vrijwel zeker volledig geladen (~100%)</div>
                              <div>De geselecteerde hoeveelheid is groter dan de accucapaciteit. Wij laden wat er in past — doorgaans tot 100%. Het extra bereik bedraagt ca. +{realisticKm} km. Mocht er onverhoopt minder ingaan dan besteld, vindt er geen restitutie plaats.</div>
                            </div>
                          ) : (
                            <div style={{ marginTop: 10, padding: '8px 12px', background: '#eaf1fb', borderRadius: 8, fontSize: 12, color: '#123a80', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <CheckIcon className="w-4 h-4" style={{ flexShrink: 0 }} />{v.evKwh} kWh laden · +{realisticKm} km realistisch extra bereik
                            </div>
                          );
                        })()}
                        {v.evKwh && !ev && (
                          <div style={{ marginTop: 8, fontSize: 12, color: '#19499e' }}>
                            ≈ {Math.round(v.evKwh * 4.5)}–{Math.round(v.evKwh * 7)} km extra bereik
                          </div>
                        )}
                      </>);
                    })()}
                  </div>
                );
              })}

              <div style={{ fontSize: 12, color: '#7090b0', marginTop: 8, padding: '10px 12px', background: '#f8f9fb', borderRadius: 8 }}>
                Het laden vindt buiten de stalling plaats (verzekeringseis). Wij sluiten de kabel aan bij aankomst en halen hem los zodra de auto vol is.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button style={S.btnGhost} onClick={() => setStep(3)}><ArrowLeftIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Terug</button>
              <button style={S.btnPrimary} onClick={() => setStep(5)}>Verder: Gegevens & Betaling <ArrowRightIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle' }} /></button>
            </div>
          </>
        )}

        {/* ── STEP 5: Personal + Payment ── */}
        {step === 5 && (
          <>
            <div style={S.card}>
              <h2 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 800, color: '#142440' }}>Uw gegevens</h2>
              {savedProfile && (state.firstName || state.email) && (
                <div style={{ marginBottom: 14, padding: '8px 12px', background: '#eaf1fb', borderRadius: 8, fontSize: 12, color: '#123a80', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CheckIcon className="w-4 h-4" />Ingevuld met uw opgeslagen gegevens</span>
                  <button type="button"
                    onClick={() => {
                      try { localStorage.removeItem(PROFILE_KEY); } catch {}
                      setSavedProfile(null);
                      setState(prev => ({ ...prev, firstName: '', lastName: '', email: '', phone: '' }));
                    }}
                    style={{ background: 'none', border: 'none', color: '#19499e', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '2px 6px' }}>
                    Wissen <XMarkIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle' }} />
                  </button>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={S.label}>Voornaam</label>
                  <input value={state.firstName} onChange={e => upd('firstName', e.target.value)} placeholder="Jan" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>Achternaam</label>
                  <input value={state.lastName} onChange={e => upd('lastName', e.target.value)} placeholder="de Vries" style={S.input} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={S.label}>E-mailadres</label>
                <input type="email" value={state.email} onChange={e => upd('email', e.target.value)} placeholder="jan@email.nl" style={S.input} />
                <div style={{ fontSize: 11, color: '#7090b0', marginTop: 4 }}>U ontvangt de bevestiging op dit adres.</div>
              </div>
              <div>
                <label style={S.label}>Telefoonnummer</label>
                <input type="tel" value={state.phone} onChange={e => upd('phone', e.target.value)} placeholder="+31 6 12345678" style={S.input} />
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#142440', fontWeight: 600 }}>
                  <input type="checkbox" checked={state.companyInvoice}
                    onChange={e => { upd('companyInvoice', e.target.checked); if (!e.target.checked) upd('billingCompany', ''); }}
                    style={{ width: 16, height: 16, accentColor: '#19499e', cursor: 'pointer' }} />
                  Factuur op bedrijfsnaam
                </label>
                {state.companyInvoice && (
                  <div style={{ marginTop: 8 }}>
                    <label style={S.label}>Bedrijfsnaam</label>
                    <input value={state.billingCompany} onChange={e => upd('billingCompany', e.target.value)} placeholder="Bedrijfsnaam B.V." style={S.input} />
                  </div>
                )}
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={S.label}>Opmerking <span style={{ fontWeight: 400, color: '#7090b0' }}>(optioneel)</span></label>
                <textarea
                  value={state.note}
                  onChange={e => upd('note', e.target.value)}
                  placeholder="Bijv. grote auto, verwacht laat aan te komen, speciale instructies..."
                  rows={3}
                  style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5 }}
                />
                <div style={{ fontSize: 11, color: '#7090b0', marginTop: 4 }}>Let op: uw opmerking wordt pas op de dag van afgifte gelezen.</div>
              </div>
            </div>

            {/* Overzicht */}
            <div style={S.card}>
              <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#142440' }}>Overzicht</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#7090b0' }}>Parkeren · {state.vehicleCount} auto{state.vehicleCount > 1 ? "'s" : ''} · {price ? price.nights + 1 : 0} dag{price && price.nights + 1 !== 1 ? 'en' : ''}</span>
                  <span style={{ fontWeight: 600 }}>€ {(price?.totalPrice || 0).toFixed(2)}</span>
                </div>
                {totalEv > 0 && state.vehicles.filter(v => v.evKwh).map((v, i) => {
                  const svc = services.find(s => s.kwh === v.evKwh);
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#7090b0', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <BoltIcon className="w-4 h-4" />Auto{state.vehicles.filter(v2 => v2.evKwh).length > 1 ? ` ${i + 1}` : ''} opladen · {v.evKwh} kWh
                      </span>
                      <span style={{ fontWeight: 600 }}>€ {svc ? parseFloat(svc.price).toFixed(2) : '0.00'}</span>
                    </div>
                  );
                })}
                {onSiteFee > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#7090b0' }}>Toeslag ter plekke betalen</span>
                    <span style={{ fontWeight: 600 }}>€ {onSiteFee.toFixed(2)}</span>
                  </div>
                )}
                {paypalFee > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#7090b0' }}>Toeslag PayPal (3,4% + € 0,35)</span>
                    <span style={{ fontWeight: 600 }}>€ {paypalFee.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1.5px solid #142440', marginTop: 4 }}>
                  <span style={{ fontWeight: 800, fontSize: 16 }}>Totaal incl. BTW</span>
                  <span style={{ fontWeight: 900, fontSize: 20, color: '#142440' }}>€ {grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Payment method */}
            <div style={S.card}>
              <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#142440' }}>Betaalmethode</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                {PAY_METHODS.map(m => (
                  <button key={m.id} onClick={() => upd('payMethod', m.id)}
                    style={{ padding: '12px 8px', borderRadius: 9, border: state.payMethod === m.id ? '2px solid #19499e' : '0.5px solid rgba(10,34,64,0.18)', background: state.payMethod === m.id ? '#eaf1fb' : 'white', cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ marginBottom: 3, display: 'flex', justifyContent: 'center', color: state.payMethod === m.id ? '#19499e' : '#556070' }}>{m.icon}</div>
                    {!m.hasLogo && <div style={{ fontSize: 12, fontWeight: 700, color: state.payMethod === m.id ? '#19499e' : '#142440' }}>{m.label}</div>}
                    {m.sub && <div style={{ fontSize: 10, color: '#7090b0', marginTop: 1 }}>{m.sub}</div>}
                  </button>
                ))}
              </div>

              {state.payMethod === 'on_site' && (
                <div style={{ background: '#fef3dc', border: '0.5px solid #e8a020', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#7a5010' }}>
                  <strong>Ter plekke betalen:</strong> Pin of contant bij aankomst. Er geldt een toeslag van €5 per auto. Uw parkeerplaats staat gegarandeerd gereserveerd.
                </div>
              )}

              <div style={{ fontSize: 11, color: '#7090b0', marginTop: 12 }}>
                Betaling verloopt beveiligd via Stripe. U ontvangt direct een bevestigingsmail met annuleringslink.
              </div>
            </div>

            {error && (
              <div style={{ background: '#fdeaea', border: '0.5px solid rgba(139,32,32,0.3)', borderRadius: 8, padding: '12px 16px', color: '#8a2020', fontSize: 13, marginBottom: 14 }}>
                {error}
              </div>
            )}

            {/* Akkoordverklaringen */}
            <div style={{ background: 'white', borderRadius: 12, border: '0.5px solid rgba(10,34,64,0.1)', padding: '16px 20px', boxShadow: '0 1px 4px rgba(10,34,64,0.06)' }}>
              <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#142440' }}>Akkoordverklaring</h2>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
                <input type="checkbox" checked={acceptedKeyHandover} onChange={e => setAcceptedKeyHandover(e.target.checked)}
                  style={{ marginTop: 2, width: 18, height: 18, accentColor: '#19499e', flexShrink: 0, cursor: 'pointer' }} />
                <span style={{ fontSize: 13, color: '#142440', lineHeight: 1.5 }}>
                  <strong>Ik ben bekend met de verplichte sleutelafgifte.</strong> Bij aankomst parkeer ik mijn auto op de geel gemarkeerde vakken en werp ik de <strong>kale autosleutel</strong> (geen hoesje, geen envelop) in de beveiligde afgiftekluis.
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={acceptedTerms} onChange={e => setAcceptedTerms(e.target.checked)}
                  style={{ marginTop: 2, width: 18, height: 18, accentColor: '#19499e', flexShrink: 0, cursor: 'pointer' }} />
                <span style={{ fontSize: 13, color: '#142440', lineHeight: 1.5 }}>
                  Ik ga akkoord met de{' '}
                  <button type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowTerms(true); }}
                    style={{ color: '#19499e', fontWeight: 600, background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>algemene voorwaarden</button>{' '}
                  van Autostalling De Bazuin.
                </span>
              </label>
            </div>

            {showTerms && (
              <div onClick={() => setShowTerms(false)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,35,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Algemene voorwaarden"
                  style={{ background: 'white', borderRadius: 14, maxWidth: 720, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 48px rgba(0,0,0,0.3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e3e8ef' }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#142440' }}>Algemene voorwaarden</h2>
                    <button type="button" onClick={() => setShowTerms(false)} aria-label="Sluiten"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#142440', padding: 4, lineHeight: 0 }}>
                      <XMarkIcon className="w-6 h-6" />
                    </button>
                  </div>
                  <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
                    {termsHtml
                      ? <div className="terms-modal-content" style={{ fontSize: 14, lineHeight: 1.7, color: '#33445c' }} dangerouslySetInnerHTML={{ __html: termsHtml }} />
                      : <div style={{ color: '#7090b0', fontSize: 14 }}>Laden…</div>}
                  </div>
                  <div style={{ padding: '14px 24px', borderTop: '1px solid #e3e8ef', textAlign: 'right' }}>
                    <button type="button" onClick={() => setShowTerms(false)}
                      style={{ background: '#19499e', color: 'white', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, cursor: 'pointer' }}>Sluiten</button>
                  </div>
                </div>
                <style>{`
                  .terms-modal-content h3 { color: #142440; font-size: 16px; font-weight: 700; margin: 22px 0 10px; }
                  .terms-modal-content h3:first-child { margin-top: 0; }
                  .terms-modal-content p { margin: 0 0 12px; }
                  .terms-modal-content ul { margin: 0 0 14px; padding-left: 20px; }
                  .terms-modal-content li { margin-bottom: 7px; }
                  .terms-modal-content strong { color: #142440; }
                `}</style>
              </div>
            )}

            {(() => {
              const missing: string[] = [];
              if (!state.firstName) missing.push('voornaam');
              if (!state.lastName) missing.push('achternaam');
              if (!state.email) missing.push('e-mailadres');
              if (!acceptedKeyHandover) missing.push('sleutelafgifte akkoord');
              if (!acceptedTerms) missing.push('voorwaarden akkoord');
              const isDisabled = loading || missing.length > 0;
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                  <button style={S.btnGhost} onClick={() => setStep(4)}><ArrowLeftIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Terug</button>
                  <div style={{ textAlign: 'right' }}>
                    {missing.length > 0 && (
                      <div style={{ fontSize: 12, color: '#8a2020', marginBottom: 6, fontWeight: 600 }}>
                        {missing.filter(m => ['voornaam','achternaam','e-mailadres'].includes(m)).length > 0 && (
                          <div>Vul nog in: {missing.filter(m => ['voornaam','achternaam','e-mailadres'].includes(m)).join(', ')}</div>
                        )}
                        {!acceptedKeyHandover && <div>✗ Bevestig de sleutelafgifte</div>}
                        {!acceptedTerms && <div>✗ Ga akkoord met de voorwaarden</div>}
                      </div>
                    )}
                    <button
                      style={{ ...S.btnGold, width: 'auto', marginTop: 0, ...(isDisabled ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }}
                      disabled={isDisabled}
                      onClick={submit}>
                      {loading ? 'Verwerken...' : <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>Bevestigen & Betalen — € {grandTotal.toFixed(2)} <ArrowRightIcon className="w-4 h-4" /></span>}
                    </button>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ── STEP 6: Stripe betaalscherm OF direct succes (ter plekke) ── */}
        {step === 6 && result && (
          <>
            {clientSecret ? (
              // Online betaling via Stripe Elements
              <div style={S.card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#142440' }}>Betaling voltooien</h2>
                  {paymentDeadline && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: payCountdown < 300 ? (payCountdown === 0 ? '#fdeaea' : '#fff3e0') : '#f0f4f8',
                      border: `1px solid ${payCountdown < 300 ? (payCountdown === 0 ? '#e53935' : '#ff9800') : 'rgba(10,34,64,0.12)'}`,
                      borderRadius: 8, padding: '5px 10px', fontSize: 13, fontWeight: 700,
                      color: payCountdown < 300 ? (payCountdown === 0 ? '#c62828' : '#e65100') : '#142440',
                    }}>
                      <span>⏱</span>
                      <span>
                        {payCountdown > 0
                          ? `${String(Math.floor(payCountdown / 60)).padStart(2, '0')}:${String(payCountdown % 60).padStart(2, '0')} resterend`
                          : 'Betalingstermijn verlopen'}
                      </span>
                    </div>
                  )}
                </div>
                <p style={{ margin: '0 0 20px', fontSize: 13, color: '#7090b0' }}>Reservering {result.reference} — beveiligd via Stripe</p>
                <Suspense fallback={<div style={{ color: '#7090b0', padding: 20, textAlign: 'center' }}>Betaalformulier laden...</div>}>
                  <StripeCheckout
                    reservationId={result.id}
                    clientSecret={clientSecret}
                    totalAmount={grandTotal}
                    customerName={`${state.firstName} ${state.lastName}`.trim()}
                    payMethod={state.payMethod}
                    onSuccess={handleStripeSuccess}
                    onError={msg => setError(msg)}
                  />
                </Suspense>
                {error && (
                  <div style={{ marginTop: 12, background: '#fdeaea', borderRadius: 8, padding: '10px 14px', color: '#8a2020', fontSize: 13 }}>{error}</div>
                )}
              </div>
            ) : (
              // Ter plekke betalen — direct succes
              <SuccessScreen result={result} email={state.email} state={state} grandTotal={grandTotal} onNew={() => { setState(INIT); setStep(1); setResult(null); setClientSecret(null); }} />
            )}
          </>
        )}

        {/* ── STEP 7: Na Stripe betaling ── */}
        {(step as any) === 7 && result && (
          <SuccessScreen result={result} email={state.email} state={state} grandTotal={grandTotal} onNew={() => { setState(INIT); setStep(1); setResult(null); setClientSecret(null); }} />
        )}
      </div>
    </div>
  );
}

// ── Reusable success screen ───────────────────────────────────
function SuccessScreen({ result, email, state, grandTotal, onNew }: { result: any; email: string; state: any; grandTotal: number; onNew: () => void }) {
  const ADDRESS = 'Zeilmakersstraat 2, 8861 SE Harlingen';
  const fmtDate = (iso: string) => {
    if (!iso) return '';
    try { return new Date(iso + 'T00:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { return iso; }
  };
  const ymd = (iso: string) => (iso || '').replace(/-/g, '');
  const ymdPlus1 = (iso: string) => {
    const d = new Date((iso || '') + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  };
  const plates: string = (state?.vehicles || []).map((v: any) => v.plate).filter(Boolean).join(', ');
  const vehicleCount: number = state?.vehicleCount || (state?.vehicles?.length ?? 1);
  const modifyPath = `/boeken/wijzigen/${result.cancellationToken}`;
  const modifyAbs = typeof window !== 'undefined' ? `${window.location.origin}${modifyPath}` : modifyPath;
  const calDetails = `Reserveringsnummer: ${result.reference}`
    + (plates ? `\nVoertuig(en): ${plates}` : '')
    + `\n\nWijzig je reservering: ${modifyAbs}`
    + `\nLocatie: ${ADDRESS}, Nederland`;
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE`
    + `&text=${encodeURIComponent('Parkeren — Autostalling De Bazuin')}`
    + `&dates=${ymd(state?.arrival)}/${ymdPlus1(state?.departure)}`
    + `&details=${encodeURIComponent(calDetails)}`
    + `&location=${encodeURIComponent(ADDRESS + ', Nederland')}`;
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(ADDRESS)}`;

  const actionBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 14px', borderRadius: 9, fontSize: 13.5, fontWeight: 700, textDecoration: 'none', border: '0.5px solid rgba(10,34,64,0.15)', background: 'white', color: '#142440', cursor: 'pointer' };

  return (
    <div style={{ background: 'white', borderRadius: 12, border: '0.5px solid rgba(10,34,64,0.1)', padding: '36px 28px', textAlign: 'center', boxShadow: '0 1px 4px rgba(10,34,64,0.06)' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#eaf1fb', color: '#19499e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}><CheckIcon className="w-8 h-8" /></div>
      <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 900, color: '#142440' }}>Boeking bevestigd!</h2>
      <p style={{ margin: '0 0 20px', color: '#7090b0', fontSize: 14 }}>
        Bevestiging verstuurd naar <strong>{email}</strong>
      </p>
      <div style={{ fontFamily: 'monospace', fontSize: 26, fontWeight: 900, color: '#142440', background: '#f5c842', padding: '12px 28px', borderRadius: 8, display: 'inline-block', letterSpacing: 3, marginBottom: 24 }}>
        {result.reference}
      </div>

      {/* Overzicht van de reservering */}
      <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '16px 20px', textAlign: 'left', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Uw reservering</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5, color: '#142440' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ color: '#7090b0' }}>Aankomst</span><span style={{ fontWeight: 700, textAlign: 'right' }}>{fmtDate(state?.arrival)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ color: '#7090b0' }}>Vertrek</span><span style={{ fontWeight: 700, textAlign: 'right' }}>{fmtDate(state?.departure)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ color: '#7090b0' }}>Voertuig{vehicleCount > 1 ? 'en' : ''}</span><span style={{ fontWeight: 700, textAlign: 'right' }}>{vehicleCount}{plates ? ` · ${plates}` : ''}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 8, borderTop: '1px solid #e3e8ef' }}><span style={{ fontWeight: 800 }}>Totaal</span><span style={{ fontWeight: 900, color: '#142440' }}>€ {Number(grandTotal || 0).toFixed(2)}</span></div>
        </div>
      </div>

      {/* Snelkoppelingen: agenda, wijzigen, route */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <a href={gcalUrl} target="_blank" rel="noopener noreferrer" style={actionBtn}>📅 Zet in agenda</a>
        <a href={modifyPath} style={actionBtn}>✏️ Wijzig reservering</a>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ ...actionBtn, gridColumn: '1 / -1', fontWeight: 600 }}>📍 Route — {ADDRESS}</a>
      </div>

      <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '16px 20px', textAlign: 'left', fontSize: 13, color: '#142440', lineHeight: 2, marginBottom: 24 }}>
        <strong>Wat nu?</strong><br />
        · Check uw e-mail voor alle details en de annuleringslink<br />
        · Parkeer bij aankomst op de <strong>geel gemarkeerde vakken</strong> op het buitenterrein<br />
        · Werp de <strong>kale autosleutel</strong> in de beveiligde afgiftekluis — geen hoesje of envelop<br />
        · Bij vertrek staat uw auto klaar — bel aan bij de intercom als de deur gesloten is
      </div>
      <button
        onClick={onNew}
        style={{ background: '#19499e', color: 'white', border: 'none', padding: '11px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
      >
        Nieuwe boeking maken
      </button>
    </div>
  );
}
