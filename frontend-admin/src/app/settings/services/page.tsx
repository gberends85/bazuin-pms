'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';

const UNITS = [
  { value: 'per_vehicle', label: 'Per voertuig' },
  { value: 'per_booking', label: 'Per boeking' },
  { value: 'fixed',       label: 'Vast bedrag' },
];

function unitLabel(unit: string) {
  return UNITS.find(u => u.value === unit)?.label ?? unit;
}

export default function ServicesPage() {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setServices(await api.services.list()); }
    finally { setLoading(false); }
  }

  function update(id: string, field: string, value: any) {
    setServices(prev => prev.map(s => s.id === id ? { ...s, [field]: value, _dirty: true } : s));
  }

  async function save(s: any) {
    setSaving(s.id);
    try {
      await api.services.update(s.id, {
        name: s.name, description: s.description,
        customerInfo: s.customer_info, price: parseFloat(s.price),
        unit: s.unit, kwh: s.kwh || null,
        adminOnly: s.admin_only, isActive: s.is_active,
        sortOrder: s.sort_order,
      });
      setServices(prev => prev.map(x => x.id === s.id ? { ...x, _dirty: false } : x));
      toast(`${s.name} opgeslagen ✓`);
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(null); }
  }

  async function create() {
    try {
      const created = await api.services.create({ name: 'Nieuwe dienst', price: 0, unit: 'per_booking', isActive: true });
      setServices(prev => [...prev, created]);
      toast('Dienst aangemaakt ✓');
    } catch (e: any) { toastError(e.message); }
  }

  async function remove(id: string) {
    setDeleting(id);
    try {
      await api.services.remove(id);
      setServices(prev => prev.filter(s => s.id !== id));
      toast('Dienst verwijderd');
    } catch (e: any) { toastError(e.message); }
    finally { setDeleting(null); setConfirmDel(null); }
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = services.findIndex(s => s.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= services.length) return;

    const reordered = [...services];
    const a = { ...reordered[idx], sort_order: reordered[next].sort_order };
    const b = { ...reordered[next], sort_order: reordered[idx].sort_order };
    reordered[idx] = b; reordered[next] = a;
    setServices(reordered);

    try {
      await Promise.all([
        api.services.update(a.id, { name: a.name, description: a.description, customerInfo: a.customer_info, price: parseFloat(a.price), unit: a.unit, kwh: a.kwh || null, adminOnly: a.admin_only, isActive: a.is_active, sortOrder: a.sort_order }),
        api.services.update(b.id, { name: b.name, description: b.description, customerInfo: b.customer_info, price: parseFloat(b.price), unit: b.unit, kwh: b.kwh || null, adminOnly: b.admin_only, isActive: b.is_active, sortOrder: b.sort_order }),
      ]);
    } catch (e: any) { toastError(e.message); load(); }
  }

  const tag: React.CSSProperties = { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, display: 'inline-block' };

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 860 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Diensten & Extra's</h1>
          <button className="btn btn-primary btn-sm" onClick={create}>+ Nieuwe dienst</button>
        </div>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#7090b0' }}>
          Beheer extra diensten. <strong>Per voertuig</strong> = prijs × aantal auto's. <strong>Per boeking</strong> = vaste prijs voor de hele reservering.
        </p>

        {loading && <div style={{ color: '#7090b0' }}>Laden...</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {services.map((s, idx) => (
            <div key={s.id} className="card" style={{ padding: '16px 18px', opacity: s.is_active ? 1 : 0.55, border: s._dirty ? '1.5px solid #3a80c0' : undefined }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>

                {/* Sorteer-knoppen */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 2, flexShrink: 0 }}>
                  <button onClick={() => move(s.id, -1)} disabled={idx === 0}
                    style={{ border: '0.5px solid rgba(10,34,64,0.15)', background: 'white', borderRadius: 4, cursor: idx === 0 ? 'default' : 'pointer', fontSize: 11, color: idx === 0 ? '#ccc' : '#556070', padding: '2px 6px', lineHeight: 1.2 }}>▲</button>
                  <button onClick={() => move(s.id, 1)} disabled={idx === services.length - 1}
                    style={{ border: '0.5px solid rgba(10,34,64,0.15)', background: 'white', borderRadius: 4, cursor: idx === services.length - 1 ? 'default' : 'pointer', fontSize: 11, color: idx === services.length - 1 ? '#ccc' : '#556070', padding: '2px 6px', lineHeight: 1.2 }}>▼</button>
                </div>

                {/* Naam + info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <input value={s.name} onChange={e => update(s.id, 'name', e.target.value)}
                      style={{ fontSize: 14, fontWeight: 700, border: 'none', borderBottom: '0.5px solid rgba(10,34,64,0.2)', padding: '2px 4px', color: '#0a2240', background: 'transparent', minWidth: 160 }} />
                    {s.kwh && <span style={{ ...tag, color: '#0a7c6e', background: '#e6f7f5' }}>⚡ {s.kwh} kWh</span>}
                    {!s.kwh && <span style={{ ...tag, color: '#aab8cc', background: '#f4f6f9' }}>geen kWh</span>}
                    {s.admin_only && <span style={{ ...tag, color: '#7a5010', background: '#fef3dc' }}>Admin only</span>}
                    <span style={{ ...tag, color: '#185fa5', background: '#e6f1fb' }}>{unitLabel(s.unit || 'per_booking')}</span>
                  </div>
                  <textarea value={s.customer_info || s.description || ''} onChange={e => update(s.id, 'customer_info', e.target.value)}
                    placeholder="Omschrijving voor de klant (optioneel)" rows={2}
                    style={{ width: '100%', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: '#555', resize: 'vertical', boxSizing: 'border-box' }} />
                </div>

                {/* Instellingen rechts */}
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', minWidth: 180 }}>
                  {/* Prijs */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: '#7090b0', fontSize: 13 }}>€</span>
                    <input type="number" value={s.price} onChange={e => update(s.id, 'price', e.target.value)} step="0.01" min="0"
                      style={{ width: 75, padding: '5px 7px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 15, fontWeight: 700, textAlign: 'right' }} />
                  </div>

                  {/* kWh (optioneel, voor laaddiensten) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: '#7090b0', fontSize: 12 }}>⚡ kWh</span>
                    <input type="number" value={s.kwh || ''} onChange={e => update(s.id, 'kwh', e.target.value ? parseFloat(e.target.value) : null)} step="1" min="0"
                      placeholder="—"
                      style={{ width: 55, padding: '4px 7px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 13, textAlign: 'right' }} />
                  </div>

                  {/* Eenheid */}
                  <select value={s.unit || 'per_booking'} onChange={e => update(s.id, 'unit', e.target.value)}
                    style={{ width: '100%', padding: '5px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 12, background: 'white', color: '#0a2240' }}>
                    {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>

                  {/* Toggles */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <label style={{ fontSize: 11, color: '#7090b0', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!s.admin_only} onChange={e => update(s.id, 'admin_only', e.target.checked)} />
                      Admin only
                    </label>
                    <label style={{ fontSize: 11, color: '#7090b0', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!s.is_active} onChange={e => update(s.id, 'is_active', e.target.checked)} />
                      Actief
                    </label>
                  </div>

                  {/* Acties */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {confirmDel === s.id ? (
                      <>
                        <button className="btn btn-sm" onClick={() => setConfirmDel(null)}
                          style={{ background: '#f4f6f9', border: '0.5px solid rgba(10,34,64,0.15)', color: '#556070', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>Annuleer</button>
                        <button className="btn btn-sm" onClick={() => remove(s.id)} disabled={deleting === s.id}
                          style={{ background: '#e24b4a', border: 'none', color: 'white', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
                          {deleting === s.id ? '...' : 'Verwijder'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setConfirmDel(s.id)}
                          style={{ background: 'none', border: '0.5px solid rgba(200,50,50,0.3)', color: '#c83232', borderRadius: 6, padding: '4px 9px', fontSize: 12, cursor: 'pointer' }}>🗑</button>
                        <button className="btn btn-primary btn-sm" onClick={() => save(s)} disabled={saving === s.id}>
                          {saving === s.id ? '...' : 'Opslaan'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {!loading && services.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#7090b0', fontSize: 13 }}>
            Nog geen diensten. Klik "+ Nieuwe dienst" om te beginnen.
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
