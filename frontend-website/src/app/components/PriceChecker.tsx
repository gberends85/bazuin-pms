'use client';
import { useState, useMemo, useEffect } from 'react';
import { formatPrice } from '../lib/content';

const BOOKING_URL = 'https://www.parkeren-harlingen.nl/boeken';

interface Props { pricing?: unknown; } // pricing niet meer gebruikt — tarieven komen live uit het systeem

interface PriceResult {
  days: number; nights: number; pricePerCar: number; totalPrice: number;
  rateName: string; seasonSurchargePct?: number; breakdown?: string;
}
interface AvailResult { available: number; total: number; lotId?: string; }

// ── Helpers ──────────────────────────────────────────────────
function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseKey(k: string): Date {
  const [y,m,d] = k.split('-').map(Number);
  return new Date(y, m-1, d);
}
function diffDays(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86400000);
}
function formatDutch(k: string): string {
  return parseKey(k).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
}

const NAVY = '#142440';
const BLUE = '#19499e';
const MUTED = '#6b7a90';
const BORDER = '#e3e8ef';
const LIGHT = '#f6f8fb';

// ── DateRangePicker (overgenomen van reserveringspagina stap 1) ─
function DateRangePicker({ arrival, departure, onArrival, onDeparture, vehicles }: {
  arrival: string; departure: string;
  onArrival: (d: string) => void; onDeparture: (d: string) => void;
  vehicles: number;
}) {
  // "Vandaag" pas in de browser bepalen — voorkomt dat de datum bevriest op de
  // builddatum in de statisch gegenereerde HTML van de website.
  const [todayStr, setTodayStr] = useState('');
  const [viewMonth, setViewMonth] = useState<Date>(() => { const d = new Date(); d.setDate(1); return d; });
  const [hovered, setHovered] = useState<string | null>(null);
  const [picking, setPicking] = useState<'start' | 'end'>('start');
  const [isMobile, setIsMobile] = useState(false);
  const [calAvail, setCalAvail] = useState<Record<string, number>>({});

  useEffect(() => {
    const d = new Date();
    setTodayStr(toKey(d));
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
    const from = toKey(m1);
    const to = toKey(m2end);
    fetch(`/api/availability?from=${from}&to=${to}`)
      .then(r => r.json())
      .then((rows: any[]) => {
        if (!Array.isArray(rows)) return;
        const map: Record<string, number> = {};
        rows.forEach(r => { map[r.date] = parseInt(r.available) || 0; });
        setCalAvail(prev => ({ ...prev, ...map }));
      })
      .catch(() => {});
  }, [viewMonth]);

  function isDayBlocked(dateStr: string): boolean {
    if (dateStr in calAvail) return calAvail[dateStr] < vehicles;
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

  const days = arrival && departure ? diffDays(arrival, departure) : 0;

  function renderMonth(year: number, month: number) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startDow = firstDay.getDay() - 1; if (startDow < 0) startDow = 6;
    const cells: (string | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(toKey(new Date(year, month, d)));
    const monthLabel = firstDay.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });

    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 10, textTransform: 'capitalize' }}>{monthLabel}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {['Ma','Di','Wo','Do','Vr','Za','Zo'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: '#9aa7b8', paddingBottom: 6 }}>{d}</div>
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
            const dayBg = (isStart || isEnd) ? BLUE : isBlocked ? '#fdeaea' : 'transparent';
            const dayColor = (isStart || isEnd) ? 'white' : isUnavailable ? '#c8d4df' : isToday ? BLUE : NAVY;
            const dayWeight = (isStart || isEnd || isToday) ? 700 : 400;
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
    <div style={{ background: 'white', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 14px 12px', userSelect: 'none' }}>
      {/* Header: aankomst / dagen / vertrek */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, marginBottom: 14 }}>
        <div onClick={() => { setPicking('start'); onDeparture(''); }}
          style={{ background: picking === 'start' ? '#eaf1fb' : LIGHT, borderRadius: 8, padding: '10px 12px', cursor: 'pointer', border: picking === 'start' ? `1.5px solid ${BLUE}` : '1.5px solid transparent' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Aankomst</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: NAVY, marginTop: 2, whiteSpace: 'nowrap' }}>
            {arrival ? formatDutch(arrival) : '—'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 48 }}>
          {days > 0
            ? <span style={{ fontSize: 11, fontWeight: 600, color: BLUE, background: '#eaf1fb', padding: '4px 8px', borderRadius: 20, whiteSpace: 'nowrap', textAlign: 'center' }}>{days} dag{days !== 1 ? 'en' : ''}</span>
            : <span style={{ color: '#c0ccd8', fontSize: 18 }}>→</span>}
        </div>
        <div style={{ background: picking === 'end' && arrival ? '#eaf1fb' : LIGHT, borderRadius: 8, padding: '10px 12px', border: picking === 'end' && arrival ? `1.5px solid ${BLUE}` : '1.5px solid transparent' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vertrek</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: NAVY, marginTop: 2, whiteSpace: 'nowrap' }}>
            {departure ? formatDutch(departure) : '—'}
          </div>
        </div>
      </div>

      {/* Kalender */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <button onClick={prevMonth} aria-label="Vorige maand" style={{ border: 'none', background: 'none', cursor: 'pointer', color: NAVY, padding: '4px 6px', fontSize: 18, lineHeight: 1, flexShrink: 0 }}>‹</button>
        <div style={{ flex: 1, display: 'flex', gap: isMobile ? 0 : 16, minWidth: 0 }}>
          {renderMonth(m1.year, m1.month)}
          {!isMobile && renderMonth(m2.year, m2.month)}
        </div>
        <button onClick={nextMonth} aria-label="Volgende maand" style={{ border: 'none', background: 'none', cursor: 'pointer', color: NAVY, padding: '4px 6px', fontSize: 18, lineHeight: 1, flexShrink: 0 }}>›</button>
      </div>

      {picking === 'end' && arrival && !departure && (
        <div style={{ marginTop: 10, fontSize: 12, color: MUTED, textAlign: 'center' }}>
          Selecteer uw vertrekdatum
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function PriceChecker(_props: Props) {
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [vehicles, setVehicles] = useState(1);
  const [price, setPrice] = useState<PriceResult | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState('');
  const [avail, setAvail] = useState<AvailResult | null>(null);

  const days = useMemo(() => (arrival && departure ? diffDays(arrival, departure) : 0), [arrival, departure]);

  // Tarief + beschikbaarheid ophalen zodra een geldige periode gekozen is
  useEffect(() => {
    if (!arrival || !departure || departure <= arrival) { setPrice(null); setAvail(null); setPriceError(''); return; }
    let cancelled = false;
    setPriceLoading(true); setPriceError(''); setAvail(null);

    fetch(`/api/price?arrival=${arrival}&departure=${departure}&vehicles=${vehicles}`)
      .then(async r => {
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok) { setPrice(null); setPriceError(data.error || 'Berekening mislukt'); }
        else setPrice(data);
      })
      .catch(() => { if (!cancelled) setPriceError('Tarief kon niet worden geladen'); })
      .finally(() => { if (!cancelled) setPriceLoading(false); });

    fetch(`/api/availability?arrival=${arrival}&departure=${departure}`)
      .then(async r => { const d = await r.json(); if (!cancelled && r.ok) setAvail(d); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [arrival, departure, vehicles]);

  const grandTotal = price?.totalPrice ?? 0;
  const isFull = !!avail && avail.available < vehicles;
  const canProceed = !!arrival && !!departure && !!avail && !isFull && !!price;

  const bookingUrl = arrival && departure
    ? `${BOOKING_URL}?arrival=${arrival}&departure=${departure}&autos=${vehicles}&stap=2`
    : BOOKING_URL;

  return (
    <div style={{
      background: 'white',
      borderRadius: 14,
      boxShadow: '0 1px 4px rgba(20,36,64,0.07)',
      border: `1px solid ${BORDER}`,
      maxWidth: 780,
      margin: '0 auto',
      overflow: 'hidden',
    }}>
      {/* Header — vlak, licht */}
      <div style={{ padding: '20px 28px', borderBottom: `1px solid ${BORDER}`, background: LIGHT }}>
        <h3 style={{ color: NAVY, fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 700, margin: 0 }}>
          Bereken uw parkeertarief
        </h3>
        <p style={{ color: MUTED, fontSize: 14, margin: '4px 0 0', fontWeight: 400 }}>
          Kies uw aankomst- en vertrekdatum en zie direct de actuele prijs en beschikbaarheid.
        </p>
      </div>

      {/* Body */}
      <div style={{ padding: '22px 28px' }}>
        <DateRangePicker
          arrival={arrival} departure={departure}
          onArrival={setArrival} onDeparture={setDeparture}
          vehicles={vehicles}
        />

        {/* Aantal auto's */}
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Aantal auto's</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setVehicles(v => Math.max(1, v - 1))}
              style={{ width: 32, height: 32, borderRadius: '50%', border: `1px solid ${BORDER}`, background: 'white', fontSize: 18, cursor: 'pointer', color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
            <span style={{ fontSize: 18, fontWeight: 700, color: NAVY, minWidth: 18, textAlign: 'center' }}>{vehicles}</span>
            <button onClick={() => setVehicles(v => Math.min(5, v + 1))}
              style={{ width: 32, height: 32, borderRadius: '50%', border: `1px solid ${BORDER}`, background: 'white', fontSize: 18, cursor: 'pointer', color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
            <span style={{ fontSize: 12, color: '#9aa7b8' }}>max. 5</span>
          </div>
        </div>

        {/* Resultaat */}
        {days > 0 && (
          <div style={{ marginTop: 20 }}>
            {priceLoading && !price && (
              <div style={{ textAlign: 'center', padding: '18px 0', color: MUTED, fontSize: 14 }}>Tarief berekenen…</div>
            )}

            {priceError && (
              <div style={{ textAlign: 'center', padding: '16px 0', color: '#8a2020', fontSize: 14 }}>{priceError}</div>
            )}

            {/* Vol */}
            {isFull && (
              <div style={{ background: '#fdeaea', border: '1px solid #e24b4a', borderRadius: 10, padding: '14px 18px', marginBottom: 4 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#8a2020', marginBottom: 2 }}>
                  {avail!.available === 0 ? 'Geen plaatsen beschikbaar' : 'Niet genoeg plaatsen beschikbaar'}
                </div>
                <div style={{ fontSize: 13, color: '#8a2020' }}>
                  {avail!.available === 0
                    ? 'De stalling is vol voor de gekozen periode. Kies andere datums.'
                    : `Er ${avail!.available === 1 ? 'is' : 'zijn'} nog ${avail!.available} ${avail!.available === 1 ? 'plek' : 'plekken'} vrij, maar u vroeg om ${vehicles} auto's. Kies andere datums of minder auto's.`}
                </div>
              </div>
            )}

            {/* Prijs + beschikbaarheid */}
            {price && !isFull && (
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '18px 20px', background: 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 13, color: MUTED }}>
                    {price.rateName} · {price.days} dag{price.days !== 1 ? 'en' : ''} · {vehicles} auto{vehicles !== 1 ? '’s' : ''}
                  </span>
                  {avail && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: avail.available <= 5 ? '#b8791a' : '#2e7d4f' }}>
                      {avail.available} {avail.available === 1 ? 'plek' : 'plaatsen'} vrij
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 34, fontWeight: 700, color: NAVY, lineHeight: 1 }}>
                    {formatPrice(grandTotal.toFixed(2))}
                  </span>
                  <span style={{ fontSize: 13, color: MUTED }}>totaal · incl. 21% btw</span>
                  {vehicles > 1 && (
                    <span style={{ fontSize: 13, color: MUTED }}>({formatPrice(price.pricePerCar.toFixed(2))} per auto)</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#9aa7b8', marginTop: 6 }}>
                  EV-laden wordt apart berekend op basis van het werkelijke verbruik.
                </div>
              </div>
            )}

            {/* CTA */}
            {!isFull && (
              <a
                href={canProceed ? bookingUrl : undefined}
                aria-disabled={!canProceed}
                className="btn btn-primary btn-lg"
                style={{
                  width: '100%', justifyContent: 'center', fontSize: 15, marginTop: 16,
                  opacity: canProceed ? 1 : 0.5,
                  pointerEvents: canProceed ? 'auto' : 'none',
                }}>
                Verder: veerboot kiezen →
              </a>
            )}
          </div>
        )}

        {days === 0 && (
          <div style={{ textAlign: 'center', padding: '18px 0 4px', color: '#9aa7b8', fontSize: 13 }}>
            Selecteer hierboven uw aankomst- en vertrekdatum.
          </div>
        )}
      </div>
    </div>
  );
}
