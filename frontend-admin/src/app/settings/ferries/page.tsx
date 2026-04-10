'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { format, addDays } from 'date-fns';

export default function FerriesPage() {
  const [ferries, setFerries] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ferryId: '', departureTime: '09:00', direction: 'outbound', destination: 'terschelling', notes: '' });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncDays, setSyncDays] = useState(14);

  useEffect(() => { api.ferries.list().then(setFerries); }, []);
  useEffect(() => { loadSchedules(); }, [date]);

  async function loadSchedules() {
    const d = await api.ferries.schedules(date).catch(() => ({ schedules: [] }));
    setSchedules(d.schedules || []);
  }

  async function doeksenSync() {
    setSyncing(true);
    try {
      const res = await api.ferries.syncDoeksen(syncDays);
      toast(`Doeksen gesynchroniseerd voor ${syncDays} dagen ✓`);
      loadSchedules();
    } catch (e: any) { toastError(e.message); }
    finally { setSyncing(false); }
  }

  async function addSchedule() {
    setSaving(true);
    try {
      await api.ferries.addSchedule({ ...form, date });
      toast('Boottijd toegevoegd ✓');
      setAddOpen(false);
      loadSchedules();
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  const outbound = schedules.filter(s => s.direction === 'outbound');
  const returnSchedules = schedules.filter(s => s.direction === 'return');

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 800 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Veerboten & Dienstregeling</h1>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#7090b0' }}>Beheer de dagelijkse boottijden. Klik op een dag om de tijden te bekijken en aan te passen.</p>

        {/* Configured ferries */}
        <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', marginBottom: 14 }}>Geconfigureerde veerboten</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ferries.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8f9fb', borderRadius: 8 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>⛴ {f.name}</span>
                  {f.is_fast && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#0a7c6e', background: '#e6f7f5', padding: '2px 8px', borderRadius: 20 }}>SNEL</span>}
                </div>
                <div style={{ fontSize: 12, color: '#7090b0' }}>{f.duration_min} minuten vaart · {f.destination}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Date selector + schedule */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '0.5px solid rgba(10,34,64,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setDate(format(addDays(new Date(date), -1), 'yyyy-MM-dd'))}>←</button>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                style={{ padding: '7px 10px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 13, fontWeight: 600 }} />
              <button className="btn btn-ghost btn-sm" onClick={() => setDate(format(addDays(new Date(date), 1), 'yyyy-MM-dd'))}>→</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f6f9', borderRadius: 7, padding: '4px 8px' }}>
                <span style={{ fontSize: 12, color: '#7090b0', whiteSpace: 'nowrap' }}>Sync</span>
                <select value={syncDays} onChange={e => setSyncDays(Number(e.target.value))}
                  style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, color: '#0a2240', cursor: 'pointer' }}>
                  {[7, 14, 21, 30].map(d => <option key={d} value={d}>{d} dagen</option>)}
                </select>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={doeksenSync} disabled={syncing}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {syncing ? '⏳' : '↻'} {syncing ? 'Laden…' : 'Laad Doeksen'}
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => { setForm({ ferryId: ferries[0]?.id || '', departureTime: '09:00', direction: 'outbound', destination: 'terschelling', notes: '' }); setAddOpen(true); }}>
                + Boottijd toevoegen
              </button>
            </div>
          </div>

          <div style={{ padding: 20 }}>
            {schedules.length === 0 && (
              <div style={{ textAlign: 'center', color: '#7090b0', padding: '24px 0', fontSize: 13 }}>
                Geen dienstregeling voor deze datum.<br />
                Klik <strong>↻ Laad Doeksen</strong> om actuele tijden op te halen, of voeg handmatig een boottijd toe.
              </div>
            )}

            {outbound.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Heenreizen</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                  {outbound.map((s, i) => (
                    <div key={i} style={{ background: '#e6f1fb', borderRadius: 8, padding: '10px 14px', minWidth: 120 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#185fa5', textTransform: 'uppercase', marginBottom: 2 }}>→ {s.destination}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#0a2240' }}>{s.departureTime}</div>
                      <div style={{ fontSize: 10, color: '#7090b0', marginTop: 2 }}>{s.ferryName}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {returnSchedules.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Terugreizen — aankomst Harlingen</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {returnSchedules.map((s, i) => (
                    <div key={i} style={{ background: '#e6f7f5', borderRadius: 8, padding: '10px 14px', minWidth: 120, borderLeft: '3px solid #0a7c6e' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#0a7c6e', textTransform: 'uppercase', marginBottom: 2 }}>← {s.destination}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#0a2240' }}>{s.arrivalHarlingen || s.departureTime}</div>
                      <div style={{ fontSize: 10, color: '#7090b0', marginTop: 2 }}>{s.ferryName}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Add schedule modal */}
        <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Boottijd toevoegen">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Veerboot', el: (
                <select value={form.ferryId} onChange={e => setForm(f => ({ ...f, ferryId: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 13, background: 'white' }}>
                  {ferries.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              )},
              { label: 'Richting', el: (
                <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 13, background: 'white' }}>
                  <option value="outbound">→ Heenreis (vertrekt Harlingen)</option>
                  <option value="return">← Terugreis (aankomst Harlingen)</option>
                </select>
              )},
              { label: 'Bestemming', el: (
                <select value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 13, background: 'white' }}>
                  <option value="terschelling">Terschelling</option>
                  <option value="vlieland">Vlieland</option>
                </select>
              )},
              { label: 'Vertrektijd', el: (
                <input type="time" value={form.departureTime} onChange={e => setForm(f => ({ ...f, departureTime: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 18, fontWeight: 700 }} />
              )},
              { label: 'Notities (optioneel)', el: (
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Bijv. extra rit vakantieperiode"
                  style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 13 }} />
              )},
            ].map(({ label, el }) => (
              <div key={label}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>{label}</label>
                {el}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setAddOpen(false)}>Annuleren</button>
            <button className="btn btn-primary" onClick={addSchedule} disabled={saving}>Toevoegen</button>
          </div>
        </Modal>
      </div>
    </AdminLayout>
  );
}
