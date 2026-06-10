'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, format, isToday } from 'date-fns';
import { nl } from 'date-fns/locale';
import { PencilSquareIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function CalendarPage() {
  const [startMonth, setStartMonth] = useState(new Date());
  const [monthCount, setMonthCount] = useState(3);
  const [avail, setAvail] = useState<any[]>([]);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [selDate, setSelDate] = useState('');
  const [selSpots, setSelSpots] = useState(50);
  const [selDaytime, setSelDaytime] = useState(70);
  const [selReason, setSelReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [selCurrent, setSelCurrent] = useState<any>(null);
  // Standaard capaciteit (locatie-breed)
  const [capNight, setCapNight] = useState<number | ''>('');
  const [capDay, setCapDay] = useState<number | ''>('');
  const [capSaving, setCapSaving] = useState(false);

  async function loadCapacity() {
    try { const c = await api.availability.capacity(); setCapNight(c.onlineSpots); setCapDay(c.daytimeSpots); } catch (e: any) { console.error(e); }
  }
  useEffect(() => { loadCapacity(); }, []);

  async function saveCapacity() {
    setCapSaving(true);
    try {
      await api.availability.setCapacity(capNight === '' ? null : Number(capNight), capDay === '' ? null : Number(capDay));
      toast('Standaard capaciteit opgeslagen');
      await loadMonths(startMonth, monthCount);
    } catch (e: any) { toastError(e.message); }
    finally { setCapSaving(false); }
  }

  async function loadMonths(start: Date, count: number) {
    const from = format(startOfMonth(start), 'yyyy-MM-dd');
    const lastMonth = addMonths(start, count - 1);
    const to = format(endOfMonth(lastMonth), 'yyyy-MM-dd');
    const d = await api.availability.overview(from, to).catch(console.error);
    if (d) setAvail(d);
  }

  useEffect(() => { loadMonths(startMonth, monthCount); }, [startMonth, monthCount]);

  const availMap: Record<string, any> = {};
  avail.forEach(a => { availMap[a.date] = a; });

  function dayColor(a: any) {
    if (!a) return 'transparent';
    const pct = a.available / a.max_available;
    if (pct === 0) return '#fdeaea';
    if (pct < 0.3) return '#fef3dc';
    return '#e8f5eb';
  }
  function dayTextColor(a: any) {
    if (!a) return '#0a2240';
    const pct = a.available / a.max_available;
    if (pct === 0) return '#8a2020';
    if (pct < 0.3) return '#7a5010';
    return '#2a7a3a';
  }

  function openOverride(dateStr: string) {
    setSelDate(dateStr);
    const a = availMap[dateStr];
    setSelCurrent(a || null);
    setSelSpots(a ? a.max_available : 50);
    setSelDaytime(a ? a.daytime_max : 70);
    setSelReason('');
    setOverrideOpen(true);
  }

  async function saveOverride() {
    setSaving(true);
    try {
      await api.availability.override(selDate, selSpots, selDaytime, selReason);
      toast('Beschikbaarheid opgeslagen');
      setOverrideOpen(false);
      await loadMonths(startMonth, monthCount);
    } catch(e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  async function removeOverride() {
    setSaving(true);
    try {
      await api.availability.removeOverride(selDate);
      toast('Override verwijderd');
      setOverrideOpen(false);
      await loadMonths(startMonth, monthCount);
    } catch(e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  // Genereer array van te tonen maanden
  const months = Array.from({ length: monthCount }, (_, i) => addMonths(startMonth, i));

  function MonthGrid({ month }: { month: Date }) {
    const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
    const firstDow = (startOfMonth(month).getDay() + 6) % 7;
    return (
      <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 12, padding: '16px 20px' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: '#0a2240', textTransform: 'capitalize' }}>
          {format(month, 'MMMM yyyy', { locale: nl })}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 3 }}>
          {['Ma','Di','Wo','Do','Vr','Za','Zo'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#7090b0', padding: '3px 0' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
          {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const a = availMap[dateStr];
            return (
              <div key={dateStr} onClick={() => openOverride(dateStr)}
                style={{
                  padding: '4px 2px 6px',
                  textAlign: 'center',
                  borderRadius: 7,
                  cursor: 'pointer',
                  background: dayColor(a),
                  border: isToday(day)
                    ? '2px solid #0a2240'
                    : a?.has_override
                      ? '1.5px dashed #7a5010'
                      : '0.5px solid rgba(10,34,64,0.1)',
                  minHeight: 58,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  transition: 'opacity 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                <div style={{ fontSize: 12, fontWeight: 600, color: isToday(day) ? '#0a2240' : '#333', marginBottom: 1 }}>{format(day, 'd')}</div>
                {a ? (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 800, color: dayTextColor(a), lineHeight: 1.2 }}>{a.available} vrij</div>
                    <div style={{ fontSize: 9, color: '#7090b0', lineHeight: 1.2 }}>{a.booked}/{a.max_available} nacht</div>
                    <div style={{ fontSize: 8, color: a.daytime_present >= a.daytime_max ? '#8a2020' : '#aab8cc', lineHeight: 1.2 }}>{a.daytime_present}/{a.daytime_max} dag</div>
                    {a.has_override && <PencilSquareIcon className="w-2 h-2" style={{ color: '#7a5010', marginTop: 1 }} />}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: monthCount === 1 ? 600 : monthCount === 2 ? 900 : 1200 }}>
        <h1 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Agenda & Beschikbaarheid</h1>

        {/* Standaard capaciteit (locatie-breed) */}
        <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0a2240', marginBottom: 2 }}>Standaard capaciteit</div>
            <div style={{ fontSize: 11, color: '#7090b0' }}>Geldt voor alle dagen zonder eigen instelling. Per dag aanpassen kan door op een dag te klikken.</div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>Nacht-max (blijven slapen)</label>
            <input type="number" min={0} max={1000} value={capNight} onChange={e => setCapNight(e.target.value === '' ? '' : Number(e.target.value))}
              style={{ width: 110, padding: '8px 10px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 16, fontWeight: 700 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>Dag-max (overdag / wissel)</label>
            <input type="number" min={0} max={1000} value={capDay} onChange={e => setCapDay(e.target.value === '' ? '' : Number(e.target.value))}
              style={{ width: 110, padding: '8px 10px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 16, fontWeight: 700 }} />
          </div>
          <button className="btn btn-primary" onClick={saveCapacity} disabled={capSaving || (capNight === '' && capDay === '')}>
            {capSaving ? 'Opslaan…' : 'Opslaan'}
          </button>
          {capDay !== '' && capNight !== '' && Number(capDay) < Number(capNight) && (
            <div style={{ fontSize: 11, color: '#7a5010', flexBasis: '100%' }}>
              <ExclamationTriangleIcon className="w-3 h-3" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              Let op: de dag-max is lager dan de nacht-max — meestal wil je 'm juist gelijk of hoger zetten.
            </div>
          )}
        </div>

        {/* Navigatie + maandselector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setStartMonth(m => subMonths(m, 1))}>← Vorige</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setStartMonth(new Date())} style={{ fontSize: 12, color: '#0a7c6e' }}>Vandaag</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setStartMonth(m => addMonths(m, 1))}>Volgende →</button>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#7090b0', fontWeight: 600 }}>Maanden:</span>
            {[1, 2, 3].map(n => (
              <button key={n} onClick={() => setMonthCount(n)}
                style={{ padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: monthCount === n ? '#0a2240' : 'rgba(10,34,64,0.08)',
                  color: monthCount === n ? 'white' : '#0a2240' }}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Maandgrids */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: monthCount === 1 ? '1fr' : monthCount === 2 ? '1fr 1fr' : 'repeat(3, 1fr)',
          gap: 20,
        }}>
          {months.map((m, i) => <MonthGrid key={i} month={m} />)}
        </div>

        {/* Legenda */}
        <div style={{ display: 'flex', gap: 16, marginTop: 16, fontSize: 11, color: '#7090b0', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#e8f5eb', display: 'inline-block' }} /> Ruim vrij</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#fef3dc', display: 'inline-block' }} /> Bijna vol</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#fdeaea', display: 'inline-block' }} /> Vol</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 12, borderRadius: 2, border: '1.5px dashed #7a5010', display: 'inline-block' }} /> Handmatig aangepast</span>
        </div>
      </div>

      <Modal open={overrideOpen} onClose={() => setOverrideOpen(false)} title={`Beschikbaarheid — ${selDate}`}>
        {selCurrent && (
          <div style={{ background: '#f8f9fb', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: dayTextColor(selCurrent) }}>{selCurrent.available}</div>
              <div style={{ fontSize: 10, color: '#7090b0' }}>vrij (nacht)</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0a2240' }}>{selCurrent.booked}/{selCurrent.max_available}</div>
              <div style={{ fontSize: 10, color: '#7090b0' }}>nacht-bezetting</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: selCurrent.daytime_present >= selCurrent.daytime_max ? '#8a2020' : '#0a2240' }}>{selCurrent.daytime_present}/{selCurrent.daytime_max}</div>
              <div style={{ fontSize: 10, color: '#7090b0' }}>overdag (wissel)</div>
            </div>
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Nacht-max — auto's die mogen blijven slapen</label>
          <input type="number" min={0} max={200} value={selSpots} onChange={e => setSelSpots(Number(e.target.value))}
            style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 18, fontWeight: 700 }} />
          {selCurrent && selSpots < selCurrent.booked && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#8a2020' }}>
              <ExclamationTriangleIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Er zijn al {selCurrent.booked} reserveringen die hier blijven slapen.
            </div>
          )}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Dag-max — auto's die gelijktijdig overdag aanwezig mogen zijn (wisselpiek)</label>
          <input type="number" min={0} max={200} value={selDaytime} onChange={e => setSelDaytime(Number(e.target.value))}
            style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 18, fontWeight: 700 }} />
          {selDaytime < selSpots && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#7a5010' }}>
              <ExclamationTriangleIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Let op: de dag-max is lager dan de nacht-max — meestal wil je 'm juist hoger zetten.
            </div>
          )}
          {selCurrent && selDaytime < selCurrent.daytime_present && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#8a2020' }}>
              <ExclamationTriangleIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Er zijn al {selCurrent.daytime_present} auto's die deze dag aanraken.
            </div>
          )}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Reden (optioneel)</label>
          <input value={selReason} onChange={e => setSelReason(e.target.value)} placeholder="Bijv. gereserveerd voor evenement"
            style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {selCurrent?.has_override && (
            <button className="btn btn-ghost btn-sm" onClick={removeOverride} disabled={saving} style={{ color: '#8a2020', marginRight: 'auto' }}>
              Override verwijderen
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setOverrideOpen(false)}>Annuleren</button>
          <button className="btn btn-primary" onClick={saveOverride} disabled={saving}>Opslaan</button>
        </div>
      </Modal>
    </AdminLayout>
  );
}
