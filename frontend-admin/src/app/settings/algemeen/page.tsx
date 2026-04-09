'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { toast, toastError } from '@/components/ui/Toast';
import Toaster from '@/components/ui/Toast';
import { api } from '@/lib/api';

interface SettingField {
  key: string;
  label: string;
  description: string;
  type: 'number' | 'text' | 'euro';
  unit?: string;
}

const FIELDS: SettingField[] = [
  {
    key: 'modification_fee',
    label: 'Wijzigingstoeslag',
    description: 'Vaste toeslag per wijziging, ongeacht de prijsverandering. Bij restitutie wordt dit bedrag eerst afgetrokken.',
    type: 'euro',
    unit: '€',
  },
  {
    key: 'modification_min_days_before',
    label: 'Minimale wijzigingstermijn',
    description: 'Aantal dagen voor aankomst dat een klant nog zelf kan wijzigen (0 = altijd toegestaan). De admin kan altijd wijzigen.',
    type: 'number',
    unit: 'dagen',
  },
];

export default function AlgemeenSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.settings.get()
      .then(data => { setValues(data); setOriginal(data); })
      .catch(e => toastError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const changed = FIELDS.filter(f => values[f.key] !== original[f.key]);
      await Promise.all(changed.map(f => api.settings.set(f.key, values[f.key] ?? '')));
      setOriginal({ ...values });
      toast('Instellingen opgeslagen ✓');
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  const hasChanges = FIELDS.some(f => values[f.key] !== original[f.key]);

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#0a2240', display: 'block', marginBottom: 4 };
  const desc: React.CSSProperties = { fontSize: 12, color: '#7090b0', marginBottom: 10, lineHeight: 1.5 };
  const inp: React.CSSProperties = { border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, padding: '9px 12px', fontSize: 15, fontWeight: 700, color: '#0a2240', outline: 'none', width: 140 };

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '28px 32px', maxWidth: 700 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Algemene instellingen</h1>
        <p style={{ margin: '0 0 28px', fontSize: 13, color: '#7090b0' }}>Wijzigingsbeleid en overige systeeminstellingen.</p>

        {loading ? (
          <div style={{ color: '#7090b0', fontSize: 14 }}>Laden...</div>
        ) : (
          <>
            {/* Wijzigingsbeleid */}
            <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 12, padding: '24px 28px', marginBottom: 20 }}>
              <h2 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 800, color: '#0a2240' }}>✏️ Wijzigingsbeleid</h2>

              {FIELDS.map(f => (
                <div key={f.key} style={{ marginBottom: 22, paddingBottom: 22, borderBottom: '0.5px solid rgba(10,34,64,0.06)' }}>
                  <label style={lbl}>{f.label}</label>
                  <p style={desc}>{f.description}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {f.unit === '€' && <span style={{ fontSize: 16, fontWeight: 700, color: '#0a2240' }}>€</span>}
                    <input
                      type={f.type === 'text' ? 'text' : 'number'}
                      min={0}
                      step={f.type === 'euro' ? '0.01' : '1'}
                      value={values[f.key] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                      style={inp}
                    />
                    {f.unit && f.unit !== '€' && <span style={{ fontSize: 13, color: '#7090b0' }}>{f.unit}</span>}
                  </div>
                </div>
              ))}

              {/* Info box */}
              <div style={{ background: '#f4f6f9', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#7090b0', lineHeight: 1.6 }}>
                <strong style={{ color: '#0a2240' }}>Annuleringsbeleid bij wijzigingen:</strong><br />
                Wanneer een klant een reservering wijzigt naar een later tijdstip en vervolgens annuleert,
                geldt altijd het annuleringsbeleid van de <em>originele</em> aankomstdatum.
                Dit voorkomt dat klanten een gunstiger annuleringsregeling krijgen door eerst te verplaatsen.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={save}
                disabled={saving || !hasChanges}
                className="btn btn-primary"
                style={{ opacity: !hasChanges ? 0.5 : 1 }}
              >
                {saving ? 'Opslaan...' : 'Wijzigingen opslaan'}
              </button>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
