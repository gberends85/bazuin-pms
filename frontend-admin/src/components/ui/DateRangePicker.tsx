'use client';
import { useState, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface Props {
  arrival: string;
  departure: string;
  onArrival: (d: string) => void;
  onDeparture: (d: string) => void;
  /** Als true, worden verleden datums niet geblokkeerd (voor admin-gebruik) */
  allowPast?: boolean;
}

function toStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseStr(s: string) {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y, m - 1, day);
}

export default function DateRangePicker({ arrival, departure, onArrival, onDeparture, allowPast = false }: Props) {
  const todayStr = toStr(new Date());
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    if (arrival) { const [y, m] = arrival.split('-').map(Number); return new Date(y, m - 1, 1); }
    const d = new Date(); d.setDate(1); return d;
  });
  const [hovered, setHovered] = useState<string | null>(null);
  const [picking, setPicking] = useState<'start' | 'end'>('start');

  const m1 = { year: viewMonth.getFullYear(), month: viewMonth.getMonth() };
  const m2d = new Date(m1.year, m1.month + 1, 1);
  const m2 = { year: m2d.getFullYear(), month: m2d.getMonth() };

  const nights = arrival && departure
    ? Math.round((parseStr(departure).getTime() - parseStr(arrival).getTime()) / 86400000)
    : 0;

  function handleDay(dateStr: string) {
    if (!allowPast && dateStr < todayStr) return;
    if (picking === 'start' || !arrival) {
      onArrival(dateStr); onDeparture(''); setPicking('end');
    } else {
      if (dateStr <= arrival) { onArrival(dateStr); onDeparture(''); setPicking('end'); }
      else { onDeparture(dateStr); setPicking('start'); }
    }
  }

  function renderMonth(year: number, month: number) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;
    const cells: (string | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(toStr(new Date(year, month, d)));
    const monthLabel = firstDay.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });

    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#0a2240', marginBottom: 8, textTransform: 'capitalize' }}>{monthLabel}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#aab8c8', paddingBottom: 5 }}>{d}</div>
          ))}
          {cells.map((ds, i) => {
            if (!ds) return <div key={`e${i}`} style={{ padding: '2px 1px', aspectRatio: '1' }} />;
            const isPast = !allowPast && ds < todayStr;
            const isStart = ds === arrival;
            const isEnd = ds === departure;
            const rangeEnd = departure || (picking === 'end' && hovered) || null;
            const inRange = !!(arrival && rangeEnd && ds > arrival && ds < rangeEnd);
            const isToday = ds === todayStr;
            const cellBg = inRange ? '#e6f7f5' : 'transparent';
            const dayBg = isStart ? '#0a7c6e' : isEnd ? '#0a2240' : 'transparent';
            const dayColor = (isStart || isEnd) ? 'white' : isPast ? '#d0dce8' : isToday ? '#0a7c6e' : '#0a2240';
            const dayWeight = (isStart || isEnd || isToday) ? 800 : 400;
            return (
              <div key={ds}
                onClick={() => handleDay(ds)}
                onMouseEnter={() => picking === 'end' && !isPast && setHovered(ds)}
                onMouseLeave={() => setHovered(null)}
                style={{ background: cellBg, padding: '2px 1px', cursor: isPast ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{
                  width: '100%', aspectRatio: '1', borderRadius: '50%', background: dayBg,
                  color: dayColor, fontWeight: dayWeight, fontSize: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', maxWidth: 34,
                }}>
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
    <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.15)', borderRadius: 10, padding: '12px 14px', userSelect: 'none' }}>
      {/* Aankomst / vertrek header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, marginBottom: 12 }}>
        <div
          onClick={() => { setPicking('start'); onDeparture(''); }}
          style={{ background: picking === 'start' ? '#e6f7f5' : '#f4f6f9', borderRadius: 7, padding: '8px 10px', cursor: 'pointer', border: picking === 'start' ? '1.5px solid #0a7c6e' : '1.5px solid transparent' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Aankomst</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0a2240', marginTop: 2, whiteSpace: 'nowrap' }}>
            {arrival ? parseStr(arrival).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 44 }}>
          {nights > 0
            ? <span style={{ fontSize: 11, fontWeight: 700, color: '#0a7c6e', background: '#e6f7f5', padding: '3px 6px', borderRadius: 20, whiteSpace: 'nowrap', textAlign: 'center' }}>{nights + 1}<br />dag{(nights + 1) !== 1 ? 'en' : ''}</span>
            : <span style={{ fontSize: 18, color: '#c0ccd8' }}>→</span>}
        </div>
        <div
          style={{ background: picking === 'end' && arrival ? '#e6f7f5' : '#f4f6f9', borderRadius: 7, padding: '8px 10px', border: picking === 'end' && arrival ? '1.5px solid #0a7c6e' : '1.5px solid transparent' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vertrek</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0a2240', marginTop: 2, whiteSpace: 'nowrap' }}>
            {departure ? parseStr(departure).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
          </div>
        </div>
      </div>

      {/* Kalender navigatie + grid */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <button onClick={() => setViewMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#0a2240', padding: '4px', lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <ChevronLeftIcon style={{ width: 18, height: 18 }} />
        </button>
        <div style={{ flex: 1, display: 'flex', gap: 16, minWidth: 0 }}>
          {renderMonth(m1.year, m1.month)}
          {renderMonth(m2.year, m2.month)}
        </div>
        <button onClick={() => setViewMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#0a2240', padding: '4px', lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <ChevronRightIcon style={{ width: 18, height: 18 }} />
        </button>
      </div>

      {picking === 'end' && arrival && !departure && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#7090b0', textAlign: 'center' }}>
          Selecteer de vertrekdatum
        </div>
      )}
    </div>
  );
}
