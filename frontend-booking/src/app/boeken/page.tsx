'use client';
import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { bookingApi } from '@/lib/api';

// Lazy-load Stripe to avoid loading it on every page
const StripeCheckout = lazy(() => import('@/components/StripeCheckout'));

// ── DateRangePicker ──────────────────────────────────────────
function DateRangePicker({ arrival, departure, onArrival, onDeparture }: {
  arrival: string; departure: string;
  onArrival: (d: string) => void; onDeparture: (d: string) => void;
}) {
  const todayStr = new Date().toISOString().split('T')[0];
  const [viewMonth, setViewMonth] = useState<Date>(() => { const d = new Date(); d.setDate(1); return d; });
  const [hovered, setHovered] = useState<string | null>(null);
  const [picking, setPicking] = useState<'start' | 'end'>('start');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 600);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  function toStr(d: Date) { return d.toISOString().split('T')[0]; }
  function parseStr(s: string) { const [y, m, day] = s.split('-').map(Number); return new Date(y, m - 1, day); }

  function handleDay(dateStr: string) {
    if (dateStr < todayStr) return;
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
        <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#0a2240', marginBottom: 10, textTransform: 'capitalize' }}>{monthLabel}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {['Ma','Di','Wo','Do','Vr','Za','Zo'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#7090b0', paddingBottom: 6 }}>{d}</div>
          ))}
          {cells.map((ds, i) => {
            if (!ds) return <div key={`e${i}`} style={{ padding: '2px 1px', aspectRatio: '1' }} />;
            const isPast = ds < todayStr;
            const isStart = ds === arrival;
            const isEnd = ds === departure;
            const rangeEnd = departure || (picking === 'end' && hovered) || null;
            const inRange = !!(arrival && rangeEnd && ds > arrival && ds < rangeEnd);
            const isToday = ds === todayStr;
            const cellBg = inRange ? '#e6f7f5' : 'transparent';
            const dayBg = (isStart || isEnd) ? '#0a7c6e' : 'transparent';
            const dayColor = (isStart || isEnd) ? 'white' : isPast ? '#c8d4df' : isToday ? '#0a7c6e' : '#0a2240';
            const dayWeight = (isStart || isEnd || isToday) ? 800 : 400;
            return (
              <div key={ds}
                onClick={() => handleDay(ds)}
                onMouseEnter={() => picking === 'end' && setHovered(ds)}
                onMouseLeave={() => setHovered(null)}
                style={{ background: cellBg, padding: '2px 1px', cursor: isPast ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '100%', aspectRatio: '1', borderRadius: '50%', background: dayBg, color: dayColor, fontWeight: dayWeight, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', maxWidth: 38 }}>
                  {new Date(ds + 'T12:00:00').getDate()}
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
          style={{ background: picking === 'start' ? '#e6f7f5' : '#f4f6f9', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', border: picking === 'start' ? '1.5px solid #0a7c6e' : '1.5px solid transparent' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Aankomst</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0a2240', marginTop: 2, whiteSpace: 'nowrap' }}>
            {arrival ? parseStr(arrival).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 48 }}>
          {days > 0
            ? <span style={{ fontSize: 11, fontWeight: 700, color: '#0a7c6e', background: '#e6f7f5', padding: '4px 6px', borderRadius: 20, whiteSpace: 'nowrap', textAlign: 'center' }}>{days}<br/>dag{days !== 1 ? 'en' : ''}</span>
            : <span style={{ color: '#c0ccd8', fontSize: 18 }}>→</span>}
        </div>
        <div style={{ background: picking === 'end' && arrival ? '#e6f7f5' : '#f4f6f9', borderRadius: 8, padding: '10px 12px', border: picking === 'end' && arrival ? '1.5px solid #0a7c6e' : '1.5px solid transparent' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vertrek</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0a2240', marginTop: 2, whiteSpace: 'nowrap' }}>
            {departure ? parseStr(departure).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
          </div>
        </div>
      </div>

      {/* Kalender */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <button onClick={prevMonth} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, color: '#0a2240', padding: '4px 4px', lineHeight: 1, flexShrink: 0, marginTop: 0 }}>‹</button>
        <div style={{ flex: 1, display: 'flex', gap: isMobile ? 0 : 16, minWidth: 0 }}>
          {renderMonth(m1.year, m1.month)}
          {!isMobile && renderMonth(m2.year, m2.month)}
        </div>
        <button onClick={nextMonth} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, color: '#0a2240', padding: '4px 4px', lineHeight: 1, flexShrink: 0, marginTop: 0 }}>›</button>
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
  header: { background: '#0a2240', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: { width: 32, height: 32, background: '#e8a020', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: '#0a2240', flexShrink: 0 },
  main: { maxWidth: 700, margin: '0 auto', padding: '28px 16px' },
  card: { background: 'white', borderRadius: 12, border: '0.5px solid rgba(10,34,64,0.1)', padding: '22px 24px', marginBottom: 16, boxShadow: '0 1px 4px rgba(10,34,64,0.06)' },
  label: { fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block', marginBottom: 7 },
  input: { width: '100%', padding: '10px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 14, color: '#0a2240', background: 'white', boxSizing: 'border-box' as const },
  btnPrimary: { background: '#0a7c6e', color: 'white', border: 'none', padding: '11px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 },
  btnGhost: { background: 'white', color: '#0a2240', border: '0.5px solid rgba(10,34,64,0.2)', padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  btnGold: { background: '#e8a020', color: '#0a2240', border: 'none', padding: '13px 28px', borderRadius: 9, fontSize: 15, fontWeight: 800, cursor: 'pointer', width: '100%', marginTop: 8 },
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
}

const INIT: BookingState = {
  arrival: '', departure: '', destination: '', vehicleCount: 1,
  ferryOutId: '', ferryOutTime: '', isFastOut: false,
  ferryOutBoatType: '', ferryRetBoatType: '',
  ferryRetId: '', ferryRetTime: '', ferryRetDest: '',
  ferryRetCustom: false, ferryRetCustomTime: '',
  vehicles: [{ plate: '' }],
  firstName: '', lastName: '', email: '', phone: '',
  payMethod: 'ideal',
  note: '',
};

const PAY_METHODS = [
  { id: 'ideal', label: 'iDEAL', icon: '🇳🇱', sub: 'Meest gekozen' },
  { id: 'card', label: 'Creditcard', icon: '💳', sub: 'Visa / Mastercard' },
  { id: 'bancontact', label: 'Bancontact', icon: '🏦', sub: 'Belgisch' },
  { id: 'paypal', label: 'PayPal', icon: '🅿', sub: '' },
  { id: 'sepa', label: 'SEPA Incasso', icon: '🔄', sub: '' },
  { id: 'on_site', label: 'Ter plekke', icon: '📍', sub: '+€5 toeslag' },
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
          style={{ border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, padding: '9px 14px', fontSize: 20, fontWeight: 800, color: '#0a2240', outline: 'none', width: 140, background: 'white' }}
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
                  border: selected ? '2px solid #0a7c6e' : '0.5px solid rgba(10,34,64,0.2)',
                  background: selected ? '#e6f7f5' : 'white',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 700,
                  color: selected ? '#0a7c6e' : '#0a2240',
                  display: 'flex',
                  flexDirection: 'column' as const,
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <span style={{ textTransform: 'capitalize' }}>{bt}</span>
                <span style={{ fontSize: 10, fontWeight: 500, color: selected ? '#0a7c6e' : '#7090b0' }}>{mins} min</span>
              </button>
            );
          })}
        </div>
      </div>

      {arrivalTime && (
        <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.1)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.5 }}>{arrivalLabel}</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#0a7c6e' }}>{arrivalTime}</span>
        </div>
      )}
    </div>
  );
}

export default function BookingPage() {
  const [step, setStep] = useState<Step>(1);
  const [state, setState] = useState<BookingState>(INIT);
  const [avail, setAvail] = useState<any>(null);
  const [price, setPrice] = useState<any>(null);
  const [feriesOut, setFerriesOut] = useState<any[]>([]);
  const [ferriesRet, setFerriesRet] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [baseRate, setBaseRate] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  function upd(field: keyof BookingState, val: any) {
    setState(prev => ({ ...prev, [field]: val }));
  }

  // Step 1: check availability + price as soon as dates are known (destination doesn't affect price)
  useEffect(() => {
    if (!state.arrival || !state.departure) return;
    if (state.departure <= state.arrival) return;
    setAvail(null); setPrice(null);
    Promise.all([
      bookingApi.checkAvailability(state.arrival, state.departure),
      bookingApi.calculatePrice(state.arrival, state.departure, state.vehicleCount),
    ]).then(([a, p]) => { setAvail(a); setPrice(p); }).catch(err => setError(err.message));
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
    const v = [...state.vehicles];
    v[idx] = { ...v[idx], rdw };
    upd('vehicles', v);
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
        customer: { firstName: state.firstName, lastName: state.lastName, email: state.email, phone: state.phone },
        vehicles: state.vehicles.map(v => {
          const evSvc = evServices.find(s => s.kwh === v.evKwh);
          return { licensePlate: v.plate, evServiceId: evSvc?.id, evKwh: v.evKwh };
        }),
      };

      // 1. Reservering aanmaken
      const res = await bookingApi.createReservation(body);
      setResult(res);

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
      setStep(6); // stap 6 = stripe betaalscherm, stap 7 = succes

    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  function handleStripeSuccess() {
    setClientSecret(null);
    setStep(7 as any);
  }

  const totalEv = state.vehicles.reduce((acc, v) => {
    if (!v.evKwh) return acc;
    const s = services.find(s => s.kwh === v.evKwh);
    return acc + (s ? parseFloat(s.price) : 0);
  }, 0);
  const onSiteFee = state.payMethod === 'on_site' ? 5 * state.vehicleCount : 0;
  const grandTotal = (price?.totalPrice || 0) + totalEv + onSiteFee;

  const availPct = avail ? Math.round(avail.available / avail.total * 100) : 0;

  // ── Step indicators ──────────────────────────────────────
  const STEPS = ['Datums', 'Veerboot', 'Voertuigen', 'Extra\'s', 'Betaling'];

  return (
    <div style={S.page}>
      {/* Header */}
      <header style={S.header}>
        <div style={S.brand}>
          <div style={S.logo}>AB</div>
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>Autostalling De Bazuin</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>Harlingen · Op loopafstand van de veerboten</div>
          </div>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Reserveren</div>
      </header>

      <div style={S.main}>
        {/* Step bar */}
        {step < 6 && (
          <div style={{ display: 'flex', marginBottom: 24, borderRadius: 10, overflow: 'hidden', border: '0.5px solid rgba(10,34,64,0.1)' }}>
            {STEPS.map((s, i) => {
              const n = (i + 1) as Step;
              const done = step > n;
              const active = step === n;
              return (
                <div key={s} style={{ flex: 1, padding: '10px 6px', textAlign: 'center', fontSize: 11, fontWeight: 600, background: done ? '#e6f7f5' : active ? '#0a2240' : 'white', color: done ? '#0a7c6e' : active ? 'white' : '#7090b0', borderRight: i < 4 ? '0.5px solid rgba(10,34,64,0.1)' : 'none' }}>
                  <div style={{ fontSize: 13, marginBottom: 2 }}>{done ? '✓' : n}</div>
                  <div>{s}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── STEP 1: Dates & Destination ── */}
        {step === 1 && (
          <>
            <div style={S.card}>
              <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800, color: '#0a2240' }}>Wanneer en waarheen?</h2>

              {/* Date range */}
              <div style={{ marginBottom: 20 }}>
                <label style={S.label}>Periode</label>
                <DateRangePicker
                  arrival={state.arrival}
                  departure={state.departure}
                  onArrival={v => upd('arrival', v)}
                  onDeparture={v => upd('departure', v)}
                />
              </div>

              {/* Destination */}
              <div style={{ marginBottom: 20 }}>
                <label style={S.label}>Bestemming</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['terschelling', 'vlieland', 'anders'] as const).map(d => {
                    const selected = state.destination === d;
                    return (
                      <button key={d} onClick={() => upd('destination', d)}
                        style={{ flex: 1, padding: '11px 8px', borderRadius: 8,
                          border: selected ? '2px solid #0a7c6e' : '0.5px solid rgba(10,34,64,0.2)',
                          background: selected ? '#e6f7f5' : 'white',
                          cursor: 'pointer', fontSize: 14, fontWeight: 700,
                          color: selected ? '#0a7c6e' : '#0a2240',
                          textAlign: 'center' as const }}>
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </button>
                    );
                  })}
                </div>
                {state.destination === 'anders' && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#7090b0', padding: '8px 12px', background: '#f8f9fb', borderRadius: 8 }}>
                    U rijdt zelf en neemt geen veerboot — vul op de volgende stap uw aankomst- en ophaaltijd in.
                  </div>
                )}
              </div>

              {/* Vehicle count */}
              <div>
                <label style={S.label}>Aantal auto's</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => setVehicleCount(state.vehicleCount - 1)}
                    style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(10,34,64,0.2)', background: 'white', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a2240' }}>−</button>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#0a2240', minWidth: 20, textAlign: 'center' }}>{state.vehicleCount}</span>
                  <button onClick={() => setVehicleCount(state.vehicleCount + 1)}
                    style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(10,34,64,0.2)', background: 'white', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a2240' }}>+</button>
                  <span style={{ fontSize: 12, color: '#7090b0' }}>max. 5</span>
                </div>
              </div>
            </div>

            {/* Basistarief (vóór datumselectie) */}
            {!avail && baseRate && (
              <div style={{ ...S.card, background: '#f4f6f9', border: 'none' }}>
                <div style={{ fontSize: 12, color: '#7090b0', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: 600 }}>
                  Tarief {baseRate.rateName}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 26, fontWeight: 900, color: '#0a2240' }}>€ {baseRate.pricePerCar.toFixed(0)},–</span>
                  <span style={{ fontSize: 13, color: '#7090b0' }}>per auto · totaal</span>
                </div>
                <div style={{ fontSize: 12, color: '#aab0bc', marginTop: 4 }}>Dit is de totaalprijs voor de hele periode. Selecteer datums voor de exacte berekening.</div>
              </div>
            )}

            {/* Availability + price */}
            {avail && price && (
              <div style={S.card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: '#7090b0' }}>{avail.available} van {avail.total} plaatsen vrij</span>
                  {price.seasonSurchargePct > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#7a5010', background: '#fef3dc', padding: '3px 8px', borderRadius: 20 }}>
                      {price.rateName}
                    </span>
                  )}
                </div>
                <div style={{ height: 5, background: '#f4f6f9', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
                  <div style={{ height: '100%', width: `${availPct}%`, background: availPct < 20 ? '#e24b4a' : availPct < 50 ? '#ef9f27' : '#0a7c6e', borderRadius: 4, transition: 'width 0.4s' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 28, fontWeight: 900, color: '#0a2240' }}>€ {price.totalPrice.toFixed(0)}</span>
                  <span style={{ fontSize: 13, color: '#7090b0' }}>totaal · {price.nights + 1} dag{price.nights + 1 !== 1 ? 'en' : ''}</span>
                  {state.vehicleCount > 1 && (
                    <span style={{ fontSize: 12, color: '#7090b0' }}>(€ {price.pricePerCar.toFixed(0)} p/auto)</span>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button style={S.btnPrimary} disabled={!avail || avail.available < state.vehicleCount || !state.destination}
                onClick={() => { if (state.destination !== 'anders') upd('ferryRetDest', state.destination); setStep(2); }}>
                {state.destination === 'anders' ? 'Verder: Tijden invullen →' : 'Verder: Veerboot kiezen →'}
              </button>
            </div>
          </>
        )}

        {/* ── STEP 2: Ferry ── */}
        {step === 2 && (
          <>
            {state.destination === 'anders' ? (
              /* ── Geen veerboot: eigen tijden ── */
              <div style={S.card}>
                <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#0a2240' }}>Aankomst & ophaalttijd</h2>
                <p style={{ margin: '0 0 20px', fontSize: 13, color: '#7090b0' }}>U rijdt zelf. Geef aan wanneer u aankomt en wanneer wij uw auto klaar moeten zetten.</p>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ ...S.label, marginBottom: 6 }}>
                    Aankomstdatum & -tijd · {new Date(state.arrival).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </label>
                  <input type="time" value={state.ferryOutTime} onChange={e => upd('ferryOutTime', e.target.value)}
                    style={{ border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, padding: '9px 14px', fontSize: 22, fontWeight: 800, color: '#0a2240', outline: 'none', width: 150, background: 'white' }} />
                </div>

                <div style={{ borderTop: '0.5px solid rgba(10,34,64,0.08)', paddingTop: 18, marginBottom: 8 }}>
                  <label style={{ ...S.label, marginBottom: 6 }}>
                    Ophaalttijd · {new Date(state.departure).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </label>
                  <input type="time" value={state.ferryRetCustomTime} onChange={e => upd('ferryRetCustomTime', e.target.value)}
                    style={{ border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, padding: '9px 14px', fontSize: 22, fontWeight: 800, color: '#0a2240', outline: 'none', width: 150, background: 'white' }} />
                  <div style={{ fontSize: 11, color: '#7090b0', marginTop: 8 }}>Wij zetten uw auto 30 minuten voor deze tijd klaar.</div>
                </div>
              </div>
            ) : (
            <div style={S.card}>
              <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#0a2240' }}>Veerbootkeuze</h2>
              <p style={{ margin: '0 0 18px', fontSize: 13, color: '#7090b0' }}>Uw auto wordt 30 minuten na aankomst van de boot klaargezet.</p>

              {/* ── Heenreis ── */}
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0a2240', marginBottom: 10, textTransform: 'capitalize' as const }}>
                Heenreis · {new Date(state.arrival).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>

              {feriesOut.length > 0 ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6, marginBottom: 12 }}>
                    {feriesOut.map((s, i) => {
                      const sel = state.ferryOutTime === s.departureTime;
                      return (
                        <button key={i} onClick={() => { upd('ferryOutId', s.ferryId); upd('ferryOutTime', s.departureTime); upd('isFastOut', s.isFast); upd('ferryOutBoatType', ''); }}
                          style={{ padding: '8px 6px', borderRadius: 8, border: sel ? '2px solid #0a7c6e' : '0.5px solid rgba(10,34,64,0.15)', background: sel ? '#e6f7f5' : 'white', cursor: 'pointer', textAlign: 'center' as const }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: sel ? '#0a7c6e' : '#0a2240' }}>{s.departureTime}</div>
                          {s.isFast && <div style={{ fontSize: 9, fontWeight: 700, color: '#0a7c6e', marginTop: 1 }}>snel</div>}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ ...S.label, marginBottom: 4 }}>Eigen vertrektijd</label>
                    <input type="time" value={state.ferryOutId ? '' : state.ferryOutTime}
                      onChange={e => { upd('ferryOutTime', e.target.value); upd('ferryOutId', ''); }}
                      style={{ border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 15, fontWeight: 700, color: '#0a2240', outline: 'none', width: 130 }} />
                  </div>
                </>
              ) : (
                /* Geen Doeksen-data: eigen invulveld met boottype + aankomstberekening */
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
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0a2240', marginBottom: 12, textTransform: 'capitalize' as const }}>
                  Terugreis · {new Date(state.departure).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>

                <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' as const }}>
                  {['terschelling', 'vlieland'].map(d => (
                    <button key={d} onClick={() => { upd('ferryRetDest', d); upd('ferryRetCustom', false); }}
                      style={{ padding: '6px 14px', borderRadius: 6, border: state.ferryRetDest === d && !state.ferryRetCustom ? '2px solid #0a7c6e' : '0.5px solid rgba(10,34,64,0.2)', background: state.ferryRetDest === d && !state.ferryRetCustom ? '#e6f7f5' : 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#0a2240', textTransform: 'capitalize' as const }}>
                      {d}
                    </button>
                  ))}
                  <button onClick={() => upd('ferryRetCustom', true)}
                    style={{ padding: '6px 14px', borderRadius: 6, border: state.ferryRetCustom ? '2px solid #e8a020' : '0.5px solid rgba(10,34,64,0.2)', background: state.ferryRetCustom ? '#fff8e6' : 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#0a2240' }}>
                    Eigen tijd
                  </button>
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
                    {ferriesRet.map((s, i) => {
                      const sel = state.ferryRetTime === s.departureTime;
                      return (
                        <button key={i} onClick={() => { upd('ferryRetId', s.ferryId); upd('ferryRetTime', s.departureTime); }}
                          style={{ padding: '8px 6px', borderRadius: 8, border: sel ? '2px solid #0a7c6e' : '0.5px solid rgba(10,34,64,0.15)', background: sel ? '#e6f7f5' : 'white', cursor: 'pointer', textAlign: 'center' as const }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: '#7090b0', marginBottom: 2 }}>vertrek eiland</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: sel ? '#0a7c6e' : '#0a2240' }}>{s.departureTime}</div>
                          {s.arrivalHarlingen && <><div style={{ fontSize: 9, fontWeight: 700, color: '#7090b0', marginTop: 4, marginBottom: 2 }}>aankomst Hlg</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: sel ? '#0a7c6e' : '#556070' }}>{s.arrivalHarlingen}</div></>}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <CustomTimeEntry
                    label="Vertrektijd vanaf het eiland"
                    time={state.ferryRetTime}
                    boatType={state.ferryRetBoatType}
                    destination={state.ferryRetDest || state.destination}
                    arrivalLabel="Aankomst in Harlingen"
                    onTimeChange={t => upd('ferryRetTime', t)}
                    onBoatTypeChange={bt => upd('ferryRetBoatType', bt as any)}
                  />
                )}
              </div>
            </div>
            )} {/* end else (non-anders) */}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button style={S.btnGhost} onClick={() => setStep(1)}>← Terug</button>
              <button style={S.btnPrimary}
                disabled={state.destination === 'anders' ? !state.ferryOutTime : !state.ferryOutTime}
                onClick={() => setStep(3)}>Verder: Voertuigen →</button>
            </div>
          </>
        )}

        {/* ── STEP 3: Vehicles ── */}
        {step === 3 && (
          <>
            {/* Valet notice */}
            <div style={{ background: '#fff8e6', border: '1px solid #e8a020', borderRadius: 10, padding: '14px 16px', marginBottom: 16, fontSize: 13, color: '#7a5010' }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>🔑 Verplichte sleutelafgifte</strong>
              Bij aankomst parkeert u uw auto op de <strong>geel gemarkeerde vakken</strong> op het buitenterrein en werpt u uw autosleutel in de beveiligde afgiftekluis. Gooi alleen de <strong>kale sleutel</strong> in de kluis — geen hoesjes of enveloppen.
            </div>

            {state.vehicles.map((v, i) => (
              <div key={i} style={S.card}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', marginBottom: 14 }}>🚗 Auto {i + 1}</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={S.label}>Kenteken</label>
                  <input value={v.plate} onChange={e => updateVehicle(i, 'plate', e.target.value.toUpperCase())}
                    onBlur={e => lookupPlate(i, e.target.value)}
                    placeholder="AB-12-CD"
                    style={{ ...S.input, fontFamily: 'monospace', fontWeight: 700, fontSize: 18, letterSpacing: 1, textTransform: 'uppercase' }} />
                  {v.rdw?.found && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: '#e6f7f5', borderRadius: 7, fontSize: 12, color: '#0a7c6e', fontWeight: 600 }}>
                      ✓ {v.rdw.make} {v.rdw.model} · {v.rdw.color} · {v.rdw.fuelType}
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button style={S.btnGhost} onClick={() => setStep(2)}>← Terug</button>
              <button style={S.btnPrimary} disabled={state.vehicles.some(v => !v.plate)}
                onClick={() => setStep(4)}>Verder: Extra's →</button>
            </div>
          </>
        )}

        {/* ── STEP 4: Extras ── */}
        {step === 4 && (
          <>
            <div style={S.card}>
              <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#0a2240' }}>Extra diensten</h2>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: '#7090b0' }}>Optioneel — voeg elektrisch laden toe per auto.</p>

              {state.vehicles.map((v, i) => {
                const evSvcs = services.filter(s => s.kwh && !s.admin_only);
                const fuelType = v.rdw?.fuelType?.toLowerCase() || '';
                const isCombustion = fuelType.includes('benzine') || fuelType.includes('diesel') || fuelType.includes('lpg');
                return (
                  <div key={i} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: i < state.vehicles.length - 1 ? '0.5px solid rgba(10,34,64,0.08)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span className="nl-plate">{v.plate}</span>
                      {v.rdw?.found && <span style={{ fontSize: 12, color: '#7090b0' }}>{v.rdw.make} {v.rdw.model}</span>}
                    </div>
                    {isCombustion ? (
                      <div style={{ fontSize: 13, color: '#7090b0', padding: '10px 14px', background: '#f4f6f9', borderRadius: 8 }}>
                        Elektrisch laden niet beschikbaar voor {v.rdw.fuelType.toLowerCase()} voertuigen.
                      </div>
                    ) : (() => {
                      const ev = v.rdw?.ev;
                      // Filter kWh-opties op accucapaciteit (als bekend)
                      const availableSvcs = ev
                        ? evSvcs.filter(s => s.kwh <= ev.maxKwh)
                        : evSvcs;
                      const suggestedKwh = ev ? ev.suggestedKwh : null;
                      return (
                      <>
                        <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600, color: '#0a2240' }}>⚡ Elektrisch opladen (type 2 kabel)</div>

                        {ev && (
                          <div style={{ marginBottom: 12, padding: '10px 12px', background: '#f0f7ff', borderRadius: 8, fontSize: 12 }}>
                            <div style={{ fontWeight: 700, color: '#0a2240', marginBottom: 4 }}>
                              🔋 Geschatte accucapaciteit: ~{ev.batteryCapacityKwh} kWh
                            </div>
                            <div style={{ color: '#556070' }}>
                              WLTP bereik: {ev.wltpRangeKm} km · Realistisch: ~{Math.round(ev.wltpRangeKm * 0.7)} km
                            </div>
                            <div style={{ color: '#556070', marginTop: 2 }}>
                              Ca. {ev.realisticKmPerKwh} km extra per geladen kWh
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                          <button onClick={() => updateVehicle(i, 'evKwh', undefined)}
                            style={{ padding: '8px 14px', borderRadius: 8, border: !v.evKwh ? '2px solid #0a2240' : '0.5px solid rgba(10,34,64,0.2)', background: !v.evKwh ? '#0a2240' : 'white', color: !v.evKwh ? 'white' : '#0a2240', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                            Geen laden
                          </button>
                          {availableSvcs.map(s => {
                            const isSuggested = suggestedKwh !== null && s.kwh === availableSvcs.reduce((best, opt) =>
                              Math.abs(opt.kwh - suggestedKwh) < Math.abs(best.kwh - suggestedKwh) ? opt : best
                            ).kwh;
                            const extraKm = ev ? Math.round(s.kwh * ev.realisticKmPerKwh) : null;
                            const sel = v.evKwh === s.kwh;
                            return (
                              <button key={s.id} onClick={() => updateVehicle(i, 'evKwh', s.kwh)}
                                style={{ padding: '8px 14px', borderRadius: 8, border: sel ? '2px solid #0a7c6e' : isSuggested ? '2px solid #3a80c0' : '0.5px solid rgba(10,34,64,0.18)', background: sel ? '#e6f7f5' : isSuggested ? '#eef5ff' : 'white', cursor: 'pointer', textAlign: 'center' as const, position: 'relative' as const }}>
                                {isSuggested && !sel && (
                                  <div style={{ position: 'absolute' as const, top: -8, left: '50%', transform: 'translateX(-50%)', background: '#3a80c0', color: 'white', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, whiteSpace: 'nowrap' as const }}>aanbevolen</div>
                                )}
                                <div style={{ fontSize: 13, fontWeight: 700, color: sel ? '#0a7c6e' : '#0a2240' }}>{s.kwh} kWh</div>
                                <div style={{ fontSize: 11, color: '#7090b0' }}>€ {parseFloat(s.price).toFixed(0)}</div>
                                {extraKm && <div style={{ fontSize: 10, color: sel ? '#0a7c6e' : '#7090b0', marginTop: 1 }}>+{extraKm} km</div>}
                              </button>
                            );
                          })}
                        </div>

                        {ev && availableSvcs.length === 0 && (
                          <div style={{ marginTop: 8, fontSize: 12, color: '#7090b0', fontStyle: 'italic' }}>
                            Geen laadopties beschikbaar voor de accucapaciteit van dit voertuig.
                          </div>
                        )}

                        {v.evKwh && ev && (
                          <div style={{ marginTop: 10, padding: '8px 12px', background: '#e6f7f5', borderRadius: 8, fontSize: 12, color: '#0a5040' }}>
                            ✓ {v.evKwh} kWh laden · +{Math.round(v.evKwh * ev.realisticKmPerKwh)} km realistisch extra bereik
                          </div>
                        )}
                        {v.evKwh && !ev && (
                          <div style={{ marginTop: 8, fontSize: 12, color: '#0a7c6e' }}>
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

            {/* Opmerking */}
            <div style={S.card}>
              <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#0a2240' }}>Opmerking</h2>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#7090b0' }}>Heeft u een bijzonder verzoek of wil u iets doorgeven aan de stalling?</p>
              <textarea
                value={state.note}
                onChange={e => upd('note', e.target.value)}
                placeholder="Bijv. grote auto, verwacht laat aan te komen, speciale instructies..."
                rows={3}
                style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button style={S.btnGhost} onClick={() => setStep(3)}>← Terug</button>
              <button style={S.btnPrimary} onClick={() => setStep(5)}>Verder: Gegevens & Betaling →</button>
            </div>
          </>
        )}

        {/* ── STEP 5: Personal + Payment ── */}
        {step === 5 && (
          <>
            <div style={S.card}>
              <h2 style={{ margin: '0 0 18px', fontSize: 18, fontWeight: 800, color: '#0a2240' }}>Uw gegevens</h2>
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
            </div>

            {/* Overzicht */}
            <div style={S.card}>
              <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0a2240' }}>Overzicht</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#7090b0' }}>Parkeren · {state.vehicleCount} auto{state.vehicleCount > 1 ? "'s" : ''} · {price ? price.nights + 1 : 0} dag{price && price.nights + 1 !== 1 ? 'en' : ''}</span>
                  <span style={{ fontWeight: 600 }}>€ {(price?.totalPrice || 0).toFixed(2)}</span>
                </div>
                {totalEv > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#7090b0' }}>⚡ Elektrisch laden</span>
                    <span style={{ fontWeight: 600 }}>€ {totalEv.toFixed(2)}</span>
                  </div>
                )}
                {onSiteFee > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#7090b0' }}>Toeslag ter plekke betalen</span>
                    <span style={{ fontWeight: 600 }}>€ {onSiteFee.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1.5px solid #0a2240', marginTop: 4 }}>
                  <span style={{ fontWeight: 800, fontSize: 16 }}>Totaal incl. BTW</span>
                  <span style={{ fontWeight: 900, fontSize: 20, color: '#0a2240' }}>€ {grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Payment method */}
            <div style={S.card}>
              <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0a2240' }}>Betaalmethode</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                {PAY_METHODS.map(m => (
                  <button key={m.id} onClick={() => upd('payMethod', m.id)}
                    style={{ padding: '12px 8px', borderRadius: 9, border: state.payMethod === m.id ? '2px solid #0a7c6e' : '0.5px solid rgba(10,34,64,0.18)', background: state.payMethod === m.id ? '#e6f7f5' : 'white', cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, marginBottom: 3 }}>{m.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: state.payMethod === m.id ? '#0a7c6e' : '#0a2240' }}>{m.label}</div>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button style={S.btnGhost} onClick={() => setStep(4)}>← Terug</button>
              <button style={{ ...S.btnGold, width: 'auto', marginTop: 0 }}
                disabled={loading || !state.firstName || !state.lastName || !state.email}
                onClick={submit}>
                {loading ? 'Verwerken...' : `Bevestigen & Betalen — € ${grandTotal.toFixed(2)} →`}
              </button>
            </div>
          </>
        )}

        {/* ── STEP 6: Stripe betaalscherm OF direct succes (ter plekke) ── */}
        {step === 6 && result && (
          <>
            {clientSecret ? (
              // Online betaling via Stripe Elements
              <div style={S.card}>
                <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#0a2240' }}>Betaling voltooien</h2>
                <p style={{ margin: '0 0 20px', fontSize: 13, color: '#7090b0' }}>Reservering {result.reference} — beveiligd via Stripe</p>
                <Suspense fallback={<div style={{ color: '#7090b0', padding: 20, textAlign: 'center' }}>Betaalformulier laden...</div>}>
                  <StripeCheckout
                    reservationId={result.id}
                    clientSecret={clientSecret}
                    totalAmount={grandTotal}
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
              <SuccessScreen result={result} email={state.email} onNew={() => { setState(INIT); setStep(1); setResult(null); setClientSecret(null); }} />
            )}
          </>
        )}

        {/* ── STEP 7: Na Stripe betaling ── */}
        {(step as any) === 7 && result && (
          <SuccessScreen result={result} email={state.email} onNew={() => { setState(INIT); setStep(1); setResult(null); setClientSecret(null); }} />
        )}
      </div>
    </div>
  );
}

// ── Reusable success screen ───────────────────────────────────
function SuccessScreen({ result, email, onNew }: { result: any; email: string; onNew: () => void }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, border: '0.5px solid rgba(10,34,64,0.1)', padding: '36px 28px', textAlign: 'center', boxShadow: '0 1px 4px rgba(10,34,64,0.06)' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#e6f7f5', color: '#0a7c6e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 30 }}>✓</div>
      <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 900, color: '#0a2240' }}>Boeking bevestigd!</h2>
      <p style={{ margin: '0 0 20px', color: '#7090b0', fontSize: 14 }}>
        Bevestiging verstuurd naar <strong>{email}</strong>
      </p>
      <div style={{ fontFamily: 'monospace', fontSize: 26, fontWeight: 900, color: '#0a2240', background: '#f5c842', padding: '12px 28px', borderRadius: 8, display: 'inline-block', letterSpacing: 3, marginBottom: 24 }}>
        {result.reference}
      </div>
      <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '16px 20px', textAlign: 'left', fontSize: 13, color: '#0a2240', lineHeight: 2, marginBottom: 24 }}>
        <strong>Wat nu?</strong><br />
        · Check uw e-mail voor alle details en de annuleringslink<br />
        · Parkeer bij aankomst op de <strong>geel gemarkeerde vakken</strong> op het buitenterrein<br />
        · Werp de <strong>kale autosleutel</strong> in de beveiligde afgiftekluis — geen hoesje of envelop<br />
        · Bij vertrek staat uw auto klaar — bel aan bij de intercom als de deur gesloten is
      </div>
      <button
        onClick={onNew}
        style={{ background: '#0a7c6e', color: 'white', border: 'none', padding: '11px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
      >
        Nieuwe boeking maken
      </button>
    </div>
  );
}
