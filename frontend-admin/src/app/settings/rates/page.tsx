'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function RatesPage() {
  const [rates, setRates] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [dayPrices, setDayPrices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.rates.list().then(r => { setRates(r); if (r.length > 0) selectRate(r[0]); }).finally(() => setLoading(false));
  }, []);

  async function selectRate(rate: any) {
    setSelected(rate);
    const dp = await api.rates.dayPrices(rate.id);
    setDayPrices(dp);
  }

  function updatePrice(dayNumber: number, price: string) {
    setDayPrices(prev => prev.map(dp => dp.day_number === dayNumber ? { ...dp, price } : dp));
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await api.rates.updateDayPrices(selected.id, dayPrices.map(dp => ({ dayNumber: dp.day_number, price: parseFloat(dp.price) })));
      toast('Tarieven opgeslagen ✓');
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  const showDays = dayPrices.slice(0, 20); // Show first 20 days in detail

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 900 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Tarieven</h1>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#7090b0' }}>Beheer dagprijzen per seizoen. Prijzen zijn inclusief 21% BTW.</p>

        {/* Rate selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {rates.map(r => (
            <button key={r.id} onClick={() => selectRate(r)}
              className={`btn ${selected?.id === r.id ? 'btn-navy' : 'btn-ghost'} btn-sm`}>
              {r.name}
            </button>
          ))}
        </div>

        {selected && (
          <>
            {/* Rate meta info */}
            <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, fontSize: 13 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 4 }}>Periode</div>
                  <div style={{ fontWeight: 600 }}>
                    {new Date(selected.valid_from).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })} →{' '}
                    {new Date(selected.valid_until).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 4 }}>Basis dagprijs</div>
                  <div style={{ fontWeight: 600 }}>€ {selected.base_day_price}/dag</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 4 }}>Min. dagen</div>
                  <div style={{ fontWeight: 600 }}>{selected.min_days}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 4 }}>Max. dagen</div>
                  <div style={{ fontWeight: 600 }}>{selected.max_days}</div>
                </div>
              </div>
            </div>

            {/* Day prices table */}
            <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '14px 20px', borderBottom: '0.5px solid rgba(10,34,64,0.08)', fontWeight: 700, fontSize: 14, color: '#0a2240' }}>
                Dagprijstabel
              </div>
              <div style={{ padding: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                  {showDays.map(dp => (
                    <div key={dp.day_number} style={{ background: '#f8f9fb', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 6 }}>
                        {dp.day_number === 1 ? '1 dag' : `${dp.day_number} dagen`}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: '#7090b0', fontSize: 13 }}>€</span>
                        <input
                          type="number"
                          value={dp.price}
                          onChange={e => updatePrice(dp.day_number, e.target.value)}
                          step="0.01"
                          style={{ width: '100%', padding: '5px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 14, fontWeight: 700, color: '#0a2240' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {dayPrices.length > 20 && (
                  <div style={{ marginTop: 12, fontSize: 12, color: '#7090b0' }}>
                    + {dayPrices.length - 20} meer dagen. Pas de basis dagprijs aan voor dag {selected.base_day_price} p/dag voor dagen daarna.
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Opslaan...' : 'Tarieven opslaan'}
              </button>
            </div>
          </>
        )}
        {loading && <div style={{ color: '#7090b0', padding: 20 }}>Laden...</div>}
      </div>
    </AdminLayout>
  );
}
