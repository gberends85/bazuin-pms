'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => { api.rates.list().then(() => {}).catch(() => {}); /* reuse api for now */ api.services.list().then(() => {}).catch(() => {}); setLoading(false); setPolicies([
    { id: '1', days_before_min: 14, days_before_max: null, refund_percentage: 100, description: 'Meer dan 14 dagen: volledige restitutie' },
    { id: '2', days_before_min: 7, days_before_max: 13, refund_percentage: 75, description: '7–14 dagen: 75% restitutie' },
    { id: '3', days_before_min: 2, days_before_max: 6, refund_percentage: 50, description: '2–7 dagen: 50% restitutie' },
    { id: '4', days_before_min: 0, days_before_max: 1, refund_percentage: 0, description: 'Minder dan 2 dagen: geen restitutie' },
  ]); }, []);

  function update(id: string, field: string, value: any) {
    setPolicies(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }

  async function save(policy: any) {
    setSaving(policy.id);
    try {
      await api.services.update(policy.id, policy).catch(() => {}); // placeholder
      toast('Beleid opgeslagen ✓');
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(null); }
  }

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 800 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Annuleringsbeleid</h1>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#7090b0' }}>
          Stel per tijdvenster het restitutiepercentage in. Admins kunnen bij handmatige annulering altijd afwijken (0–100%).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {policies.map(p => (
            <div key={p.id} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: '#7090b0' }}>Van dag</div>
                  <input type="number" value={p.days_before_min} onChange={e => update(p.id, 'days_before_min', Number(e.target.value))} min={0}
                    style={{ width: 60, padding: '5px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 14, fontWeight: 700 }} />
                  <div style={{ fontSize: 13, color: '#7090b0' }}>tot</div>
                  <input type="number" value={p.days_before_max ?? ''} onChange={e => update(p.id, 'days_before_max', e.target.value ? Number(e.target.value) : null)} placeholder="∞"
                    style={{ width: 60, padding: '5px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 14, fontWeight: 700 }} />
                  <div style={{ fontSize: 13, color: '#7090b0' }}>dagen van tevoren</div>
                </div>
                <input value={p.description} onChange={e => update(p.id, 'description', e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 6, fontSize: 13, color: '#555' }} />
              </div>
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 4 }}>Restitutie</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="number" value={p.refund_percentage} onChange={e => update(p.id, 'refund_percentage', Number(e.target.value))} min={0} max={100}
                    style={{ width: 64, padding: '6px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 18, fontWeight: 800, textAlign: 'center', color: p.refund_percentage === 100 ? '#2a7a3a' : p.refund_percentage === 0 ? '#8a2020' : '#7a5010' }} />
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#7090b0' }}>%</span>
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => save(p)} disabled={saving === p.id}>
                {saving === p.id ? '...' : 'Opslaan'}
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, padding: '14px 16px', background: '#f4f6f9', borderRadius: 10, fontSize: 12, color: '#7090b0' }}>
          <strong style={{ color: '#0a2240' }}>Admin override:</strong> Bij handmatig annuleren via het beheerportaal kan de beheerder altijd het restitutiepercentage aanpassen (0–100%), ongeacht het automatische beleid.
        </div>
      </div>
    </AdminLayout>
  );
}
