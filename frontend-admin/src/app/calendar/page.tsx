'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, format, isSameMonth, isToday } from 'date-fns';
import { nl } from 'date-fns/locale';

export default function CalendarPage() {
  const [month, setMonth] = useState(new Date());
  const [avail, setAvail] = useState<any[]>([]);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [selDate, setSelDate] = useState('');
  const [selSpots, setSelSpots] = useState(50);
  const [selReason, setSelReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const from = format(startOfMonth(month), 'yyyy-MM-dd');
    const to = format(endOfMonth(month), 'yyyy-MM-dd');
    api.availability.overview(from, to).then(setAvail).catch(console.error);
  }, [month]);

  const availMap: Record<string, any> = {};
  avail.forEach(a => { availMap[a.date] = a; });

  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const firstDow = (startOfMonth(month).getDay() + 6) % 7; // Mon-first

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
    setSelSpots(a ? a.max_available : 50);
    setSelReason('');
    setOverrideOpen(true);
  }

  async function saveOverride() {
    setSaving(true);
    try {
      await api.availability.override(selDate, selSpots, selReason);
      toast('Beschikbaarheid opgeslagen');
      setOverrideOpen(false);
      const from = format(startOfMonth(month), 'yyyy-MM-dd');
      const to = format(endOfMonth(month), 'yyyy-MM-dd');
      const d = await api.availability.overview(from, to);
      setAvail(d);
    } catch(e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 900 }}>
        <h1 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Agenda & Beschikbaarheid</h1>

        {/* Month nav */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setMonth(subMonths(month, 1))}>← Vorige</button>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0a2240', textTransform: 'capitalize' }}>
              {format(month, 'MMMM yyyy', { locale: nl })}
            </h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setMonth(addMonths(month, 1))}>Volgende →</button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
            {['Ma','Di','Wo','Do','Vr','Za','Zo'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#7090b0', padding: '4px 0' }}>{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
            {days.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const a = availMap[dateStr];
              return (
                <div key={dateStr} onClick={() => openOverride(dateStr)}
                  style={{ padding: '8px 4px', textAlign: 'center', borderRadius: 8, cursor: 'pointer', background: dayColor(a), border: isToday(day) ? '2px solid #0a2240' : '0.5px solid rgba(10,34,64,0.1)', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isToday(day) ? '#0a2240' : '#333' }}>{format(day, 'd')}</div>
                  {a && <div style={{ fontSize: 10, fontWeight: 700, color: dayTextColor(a), marginTop: 2 }}>{a.available}</div>}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 11, color: '#7090b0' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#e8f5eb', display: 'inline-block' }} /> Ruim vrij</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#fef3dc', display: 'inline-block' }} /> Bijna vol</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#fdeaea', display: 'inline-block' }} /> Vol</span>
          </div>
        </div>

        <div style={{ fontSize: 12, color: '#7090b0', marginTop: 10 }}>Klik op een dag om de beschikbaarheid handmatig aan te passen.</div>

        <Modal open={overrideOpen} onClose={() => setOverrideOpen(false)} title={`Beschikbaarheid — ${selDate}`}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Beschikbare plaatsen</label>
            <input type="number" min={0} max={55} value={selSpots} onChange={e => setSelSpots(Number(e.target.value))}
              style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 18, fontWeight: 700 }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Reden (optioneel)</label>
            <input value={selReason} onChange={e => setSelReason(e.target.value)} placeholder="Bijv. gereserveerd voor evenement"
              style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setOverrideOpen(false)}>Annuleren</button>
            <button className="btn btn-primary" onClick={saveOverride} disabled={saving}>Opslaan</button>
          </div>
        </Modal>
      </div>
    </AdminLayout>
  );
}
