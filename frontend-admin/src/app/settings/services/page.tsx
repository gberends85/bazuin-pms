'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function ServicesPage() {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => { api.services.list().then(setServices).finally(() => setLoading(false)); }, []);

  function update(id: string, field: string, value: any) {
    setServices(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }

  async function save(service: any) {
    setSaving(service.id);
    try {
      await api.services.update(service.id, {
        name: service.name, description: service.description,
        customerInfo: service.customer_info, price: parseFloat(service.price),
        adminOnly: service.admin_only, isActive: service.is_active,
      });
      toast(`${service.name} opgeslagen ✓`);
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(null); }
  }

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 800 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Diensten & Extra's</h1>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#7090b0' }}>Beheer beschikbare extra diensten zoals EV-laden en de toeslag ter plekke betalen.</p>
        {loading && <div style={{ color: '#7090b0' }}>Laden...</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {services.map(s => (
            <div key={s.id} className="card" style={{ padding: '18px 20px', opacity: s.is_active ? 1 : 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <input value={s.name} onChange={e => update(s.id, 'name', e.target.value)}
                      style={{ fontSize: 15, fontWeight: 700, border: 'none', borderBottom: '0.5px solid rgba(10,34,64,0.2)', padding: '2px 4px', color: '#0a2240', background: 'transparent', width: 250 }} />
                    {s.kwh && <span style={{ fontSize: 11, fontWeight: 700, color: '#0a7c6e', background: '#e6f7f5', padding: '2px 8px', borderRadius: 20 }}>⚡ {s.kwh} kWh</span>}
                    {s.admin_only && <span style={{ fontSize: 11, fontWeight: 700, color: '#7a5010', background: '#fef3dc', padding: '2px 8px', borderRadius: 20 }}>Admin only</span>}
                  </div>
                  <textarea value={s.customer_info || s.description || ''} onChange={e => update(s.id, 'customer_info', e.target.value)} rows={2}
                    style={{ width: '100%', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 6, padding: '6px 8px', fontSize: 12, color: '#555', resize: 'vertical' }} />
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginBottom: 8 }}>
                    <span style={{ color: '#7090b0', fontSize: 14 }}>€</span>
                    <input type="number" value={s.price} onChange={e => update(s.id, 'price', e.target.value)} step="0.01"
                      style={{ width: 80, padding: '6px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 16, fontWeight: 700, textAlign: 'right' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <label style={{ fontSize: 11, color: '#7090b0', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                      <input type="checkbox" checked={s.is_active} onChange={e => update(s.id, 'is_active', e.target.checked)} />
                      Actief
                    </label>
                    <button className="btn btn-primary btn-sm" onClick={() => save(s)} disabled={saving === s.id}>
                      {saving === s.id ? '...' : 'Opslaan'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
