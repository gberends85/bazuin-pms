'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';

const EMPTY_FORM = {
  name: '', validFrom: '', validUntil: '',
  baseDayPrice: '8.00', minDays: '1', maxDays: '100',
  customerInfo: '', sortOrder: '0',
};

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function totalDays(from: string, until: string) {
  if (!from || !until) return null;
  const d = Math.round((new Date(until).getTime() - new Date(from).getTime()) / 86400000);
  return d > 0 ? d : null;
}

export default function RatesPage() {
  const [rates, setRates] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [dayPrices, setDayPrices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'new'>('view');
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await api.rates.list();
      setRates(r);
      if (r.length > 0 && !selected) await pickRate(r[0]);
    } finally { setLoading(false); }
  }

  async function pickRate(rate: any) {
    setSelected(rate);
    setMode('view');
    setConfirmDelete(false);
    const dp = await api.rates.dayPrices(rate.id);
    setDayPrices(dp);
  }

  function openEdit(rate: any) {
    setForm({
      name: rate.name,
      validFrom: rate.valid_from?.slice(0, 10) || '',
      validUntil: rate.valid_until?.slice(0, 10) || '',
      baseDayPrice: String(rate.base_day_price),
      minDays: String(rate.min_days),
      maxDays: String(rate.max_days),
      customerInfo: rate.customer_info || '',
      sortOrder: String(rate.sort_order ?? 0),
    });
    setMode('edit');
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setSelected(null);
    setDayPrices([]);
    setMode('new');
    setConfirmDelete(false);
  }

  function upd(k: keyof typeof EMPTY_FORM, v: string) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function saveNew() {
    if (!form.name || !form.validFrom || !form.validUntil) {
      toastError('Vul naam en datums in'); return;
    }
    setSaving(true);
    try {
      const rate = await api.rates.create({
        name: form.name, validFrom: form.validFrom, validUntil: form.validUntil,
        baseDayPrice: parseFloat(form.baseDayPrice),
        minDays: parseInt(form.minDays), maxDays: parseInt(form.maxDays),
        customerInfo: form.customerInfo || null, sortOrder: parseInt(form.sortOrder),
      });
      toast('Tarief aangemaakt ✓');
      await load();
      const fresh = await api.rates.list();
      const r = fresh.find((x: any) => x.id === rate.id) || fresh[0];
      if (r) await pickRate(r);
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  async function saveMeta() {
    if (!selected) return;
    setSaving(true);
    try {
      await api.rates.update(selected.id, {
        name: form.name, validFrom: form.validFrom, validUntil: form.validUntil,
        baseDayPrice: parseFloat(form.baseDayPrice),
        minDays: parseInt(form.minDays), maxDays: parseInt(form.maxDays),
        customerInfo: form.customerInfo || null, sortOrder: parseInt(form.sortOrder),
      });
      toast('Tarief bijgewerkt ✓');
      const fresh = await api.rates.list();
      setRates(fresh);
      const r = fresh.find((x: any) => x.id === selected.id);
      if (r) { setSelected(r); setMode('view'); }
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  async function saveDayPrices() {
    if (!selected) return;
    setSaving(true);
    try {
      await api.rates.updateDayPrices(selected.id, dayPrices.map(dp => ({ dayNumber: dp.day_number, price: parseFloat(dp.price) })));
      toast('Dagprijzen opgeslagen ✓');
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  async function doDelete() {
    if (!selected) return;
    setSaving(true);
    try {
      await api.rates.remove(selected.id);
      toast('Tarief verwijderd');
      setSelected(null); setDayPrices([]); setMode('view'); setConfirmDelete(false);
      await load();
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  function updateDayPrice(dayNumber: number, price: string) {
    setDayPrices(prev => prev.map(dp => dp.day_number === dayNumber ? { ...dp, price } : dp));
  }

  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 };
  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 14, color: '#0a2240', boxSizing: 'border-box' as const, background: 'white' };

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 1000 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Tarieven</h1>
            <p style={{ margin: 0, fontSize: 13, color: '#7090b0' }}>Beheer seizoenstarieven per periode. Prijzen zijn inclusief BTW.</p>
          </div>
          <button className="btn btn-primary" onClick={openNew}>+ Nieuw tarief</button>
        </div>

        {/* Rate tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {rates.map(r => (
            <button key={r.id}
              onClick={() => pickRate(r)}
              style={{
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                border: selected?.id === r.id ? '2px solid #0a2240' : '0.5px solid rgba(10,34,64,0.2)',
                background: selected?.id === r.id ? '#0a2240' : 'white',
                color: selected?.id === r.id ? 'white' : '#0a2240',
              }}>
              <div>{r.name}</div>
              <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.7, marginTop: 1 }}>
                {fmtDate(r.valid_from)} – {fmtDate(r.valid_until)}
              </div>
            </button>
          ))}
          {mode === 'new' && (
            <button style={{ padding: '8px 14px', borderRadius: 8, border: '2px solid #0a7c6e', background: '#e6f7f5', color: '#0a7c6e', fontSize: 13, fontWeight: 600 }}>
              + Nieuw tarief
            </button>
          )}
        </div>

        {/* ── Nieuw / Bewerk formulier ── */}
        {(mode === 'new' || mode === 'edit') && (
          <div className="card" style={{ padding: '20px 24px', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0a2240', marginBottom: 16 }}>
              {mode === 'new' ? '+ Nieuw tarief aanmaken' : `✎ ${selected?.name} bewerken`}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Naam *</label>
                <input style={inp} value={form.name} onChange={e => upd('name', e.target.value)} placeholder="bijv. Zomertarief 2026" />
              </div>
              <div>
                <label style={lbl}>Geldig van *</label>
                <input type="date" style={inp} value={form.validFrom} onChange={e => upd('validFrom', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Geldig tot en met *</label>
                <input type="date" style={inp} value={form.validUntil} onChange={e => upd('validUntil', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Basis dagprijs (€)</label>
                <input type="number" step="0.01" style={inp} value={form.baseDayPrice} onChange={e => upd('baseDayPrice', e.target.value)} placeholder="8.00" />
                {form.validFrom && form.validUntil && totalDays(form.validFrom, form.validUntil) && (
                  <div style={{ fontSize: 11, color: '#7090b0', marginTop: 4 }}>
                    Periode: {totalDays(form.validFrom, form.validUntil)} dagen
                  </div>
                )}
              </div>
              <div>
                <label style={lbl}>Min. dagen</label>
                <input type="number" style={inp} value={form.minDays} onChange={e => upd('minDays', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Max. dagen</label>
                <input type="number" style={inp} value={form.maxDays} onChange={e => upd('maxDays', e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Klantinfo (zichtbaar bij boeking, optioneel)</label>
              <input style={inp} value={form.customerInfo} onChange={e => upd('customerInfo', e.target.value)} placeholder="bijv. Zomertarief — geldig in het hoogseizoen" />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setMode(selected ? 'view' : 'view'); if (!selected && rates.length > 0) pickRate(rates[0]); }}>
                Annuleren
              </button>
              <button className="btn btn-primary" onClick={mode === 'new' ? saveNew : saveMeta} disabled={saving}>
                {saving ? 'Opslaan...' : mode === 'new' ? '+ Aanmaken' : '✓ Bijwerken'}
              </button>
            </div>
          </div>
        )}

        {/* ── View modus: meta info ── */}
        {selected && mode === 'view' && (
          <>
            <div className="card" style={{ padding: '14px 20px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, flex: 1, fontSize: 13 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 4 }}>Periode</div>
                    <div style={{ fontWeight: 700, color: '#0a2240' }}>
                      {fmtDate(selected.valid_from)}
                    </div>
                    <div style={{ fontWeight: 700, color: '#0a2240' }}>
                      → {fmtDate(selected.valid_until)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 4 }}>Basis dagprijs</div>
                    <div style={{ fontWeight: 700, color: '#0a2240', fontSize: 16 }}>€ {parseFloat(selected.base_day_price).toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: '#7090b0' }}>per dag</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 4 }}>Duur</div>
                    <div style={{ fontWeight: 600 }}>{selected.min_days}–{selected.max_days} dagen</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 4 }}>Status</div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: selected.is_active ? '#e6f7f5' : '#f4f6f9', color: selected.is_active ? '#0a7c6e' : '#7090b0' }}>
                      {selected.is_active ? '● Actief' : '○ Inactief'}
                    </span>
                  </div>
                  {selected.customer_info && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 4 }}>Klantinfo</div>
                      <div style={{ fontSize: 13, color: '#0a2240' }}>{selected.customer_info}</div>
                    </div>
                  )}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(selected)} style={{ flexShrink: 0 }}>
                  ✎ Bewerken
                </button>
              </div>
            </div>

            {/* Day prices table */}
            <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '14px 20px', borderBottom: '0.5px solid rgba(10,34,64,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240' }}>Dagprijzen</div>
                <div style={{ fontSize: 12, color: '#7090b0' }}>Prijs per auto voor het totale verblijf</div>
              </div>
              <div style={{ padding: 20 }}>
                {dayPrices.length === 0 ? (
                  <div style={{ color: '#7090b0', fontSize: 13 }}>Geen dagprijzen ingesteld.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                    {dayPrices.slice(0, 30).map(dp => (
                      <div key={dp.day_number} style={{ background: '#f8f9fb', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 6 }}>
                          {dp.day_number === 1 ? '1 dag' : `${dp.day_number} dagen`}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ color: '#7090b0', fontSize: 13 }}>€</span>
                          <input
                            type="number"
                            value={dp.price}
                            onChange={e => updateDayPrice(dp.day_number, e.target.value)}
                            step="0.01"
                            style={{ width: '100%', padding: '5px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 14, fontWeight: 700, color: '#0a2240', background: 'white' }}
                          />
                        </div>
                        <div style={{ fontSize: 10, color: '#9ab0c8', marginTop: 4 }}>
                          ≈ €{dp.day_number > 0 ? (parseFloat(dp.price) / dp.day_number).toFixed(2) : '—'}/dag
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {dayPrices.length > 0 && (
                <div style={{ padding: '0 20px 20px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" onClick={saveDayPrices} disabled={saving}>
                    {saving ? 'Opslaan...' : '✓ Dagprijzen opslaan'}
                  </button>
                </div>
              )}
            </div>

            {/* Delete */}
            <div className="card" style={{ padding: '14px 20px', borderLeft: '3px solid #e24b4a' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0a2240', marginBottom: 6 }}>Tarief verwijderen</div>
              <div style={{ fontSize: 12, color: '#7090b0', marginBottom: 12 }}>
                Let op: verwijdering verwijdert ook alle gekoppelde dagprijzen. Reserveringen die dit tarief gebruiken blijven bestaan.
              </div>
              {!confirmDelete ? (
                <button className="btn btn-sm" onClick={() => setConfirmDelete(true)}
                  style={{ background: 'none', border: '1px solid #e24b4a', color: '#e24b4a', borderRadius: 7, padding: '6px 16px', cursor: 'pointer', fontSize: 13 }}>
                  Verwijderen…
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#e24b4a', fontWeight: 600 }}>Zeker weten?</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Annuleren</button>
                  <button className="btn btn-danger btn-sm" onClick={doDelete} disabled={saving}>Ja, verwijderen</button>
                </div>
              )}
            </div>
          </>
        )}

        {loading && <div style={{ color: '#7090b0', padding: 20 }}>Laden...</div>}
        {!loading && rates.length === 0 && mode !== 'new' && (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 700, color: '#0a2240', marginBottom: 8 }}>Nog geen tarieven aangemaakt</div>
            <div style={{ fontSize: 13, color: '#7090b0', marginBottom: 20 }}>Maak een tarief aan per seizoen of periode.</div>
            <button className="btn btn-primary" onClick={openNew}>+ Eerste tarief aanmaken</button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
