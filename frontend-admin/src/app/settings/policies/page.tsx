'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const rows = await api.cancellationPolicies.list();
      // Dedupliceer op sort_order — bewaar per sort_order maar 1 rij (meest recente)
      const seen = new Set<number>();
      const unique = rows
        .sort((a: any, b: any) => a.sort_order - b.sort_order || a.days_before_min - b.days_before_min)
        .filter((p: any) => {
          if (seen.has(p.sort_order)) return false;
          seen.add(p.sort_order);
          return true;
        });
      setPolicies(unique);
    } catch (e: any) { toastError(e.message); }
    finally { setLoading(false); }
  }

  function update(id: string, field: string, value: any) {
    setPolicies(prev => prev.map(p => p.id === id ? { ...p, [field]: value, _dirty: true } : p));
  }

  async function save(policy: any) {
    setSaving(policy.id);
    try {
      await api.cancellationPolicies.update(policy.id, {
        daysBeforeMin: policy.days_before_min,
        daysBeforeMax: policy.days_before_max ?? null,
        refundPercentage: policy.refund_percentage,
        description: policy.description,
      });
      setPolicies(prev => prev.map(p => p.id === policy.id ? { ...p, _dirty: false } : p));
      toast('Beleid opgeslagen ✓');
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(null); }
  }

  const pctColor = (pct: number) =>
    pct === 100 ? '#2a7a3a' : pct === 0 ? '#8a2020' : '#7a5010';

  // Controleer of de dag-vensters samen 0..∞ dekken zonder gaten of overlappingen
  function checkCoverage(list: any[]): string[] {
    const warnings: string[] = [];
    const ranges = list
      .map(p => ({ min: Number(p.days_before_min), max: p.days_before_max === null || p.days_before_max === undefined || p.days_before_max === '' ? null : Number(p.days_before_max) }))
      .sort((a, b) => a.min - b.min);
    if (ranges.length === 0) return ['Geen annuleringsregels ingesteld.'];

    if (ranges[0].min > 0) {
      warnings.push(`Gat: dag 0 t/m ${ranges[0].min - 1} heeft geen regel (annulering geeft daar 0%).`);
    }
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      if (r.max !== null && r.max < r.min) {
        warnings.push(`Ongeldig venster: "tot ${r.max}" ligt vóór "van ${r.min}".`);
        continue;
      }
      const next = ranges[i + 1];
      if (!next) {
        if (r.max !== null) {
          warnings.push(`Gat: vanaf dag ${r.max + 1} en verder heeft geen regel. Zet de laatste "tot" leeg (∞) voor onbeperkte dekking.`);
        }
        break;
      }
      if (r.max === null) {
        warnings.push(`Overlap: een venster met "tot ∞" mag niet vóór een ander venster staan.`);
        break;
      }
      if (next.min > r.max + 1) {
        warnings.push(`Gat: dag ${r.max + 1} t/m ${next.min - 1} heeft geen regel (annulering geeft daar 0%).`);
      } else if (next.min <= r.max) {
        warnings.push(`Overlap: dag ${next.min} t/m ${r.max} valt in twee vensters.`);
      }
    }
    return warnings;
  }
  const coverageWarnings = checkCoverage(policies);

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 800 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Annuleringsbeleid</h1>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#7090b0' }}>
          Stel per tijdvenster het restitutiepercentage in. Admins kunnen bij handmatige annulering altijd afwijken (0–100%).
        </p>

        {loading && <div style={{ color: '#7090b0', fontSize: 13 }}>Laden…</div>}

        {/* Dekkingscheck: waarschuw bij gaten of overlappingen */}
        {!loading && coverageWarnings.length > 0 && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fff8e6', border: '1.5px solid #e8a020', borderRadius: 10, fontSize: 13, color: '#7a5010' }}>
            <div style={{ fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15 }}>⚠</span> Let op — de dag-vensters dekken niet alles
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
              {coverageWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
        {!loading && coverageWarnings.length === 0 && policies.length > 0 && (
          <div style={{ marginBottom: 16, padding: '10px 16px', background: '#e6f7f5', border: '0.5px solid #0a7c6e', borderRadius: 10, fontSize: 13, color: '#0a6050', fontWeight: 600 }}>
            ✓ De dag-vensters dekken alle dagen aaneengesloten (0 t/m ∞), zonder gaten of overlappingen.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {policies.map(p => (
            <div key={p.id} className="card" style={{
              padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16,
              border: p._dirty ? '1.5px solid #3a80c0' : undefined,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#7090b0' }}>Van dag</span>
                  <input
                    type="number" value={p.days_before_min}
                    onChange={e => update(p.id, 'days_before_min', Number(e.target.value))}
                    min={0}
                    style={{ width: 60, padding: '5px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 14, fontWeight: 700 }}
                  />
                  <span style={{ fontSize: 13, color: '#7090b0' }}>tot</span>
                  <input
                    type="number" value={p.days_before_max ?? ''}
                    onChange={e => update(p.id, 'days_before_max', e.target.value ? Number(e.target.value) : null)}
                    placeholder="∞"
                    style={{ width: 60, padding: '5px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 14, fontWeight: 700 }}
                  />
                  <span style={{ fontSize: 13, color: '#7090b0' }}>dagen van tevoren</span>
                </div>
                <input
                  value={p.description}
                  onChange={e => update(p.id, 'description', e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 6, fontSize: 13, color: '#555' }}
                />
              </div>

              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 4 }}>Restitutie</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number" value={p.refund_percentage}
                    onChange={e => update(p.id, 'refund_percentage', Number(e.target.value))}
                    min={0} max={100}
                    style={{
                      width: 64, padding: '6px 8px',
                      border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6,
                      fontSize: 18, fontWeight: 800, textAlign: 'center',
                      color: pctColor(p.refund_percentage),
                    }}
                  />
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#7090b0' }}>%</span>
                </div>
              </div>

              <button
                className="btn btn-primary btn-sm"
                onClick={() => save(p)}
                disabled={saving === p.id}
              >
                {saving === p.id ? '…' : 'Opslaan'}
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
