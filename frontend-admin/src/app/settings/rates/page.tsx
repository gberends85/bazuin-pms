'use client';
import { useState, useEffect, useRef } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { PencilSquareIcon, CheckIcon, ArrowUturnLeftIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';

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

  // customPrices: only days with an explicit custom price (Record<dayNumber, priceString>)
  const [customPrices, setCustomPrices] = useState<Record<number, string>>({});
  // numDays: how many day-rows to show
  const [numDays, setNumDays] = useState(14);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'new'>('view');
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Tracks the effective price at the moment a user starts editing a day input.
  // Used on blur to compute the delta and cascade it to all following days.
  const editStartRef = useRef<Record<number, number>>({});

  useEffect(() => { load(); }, []);

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

    // Laad opgeslagen dagprijzen en herstel de custom-state
    const dayPrices = await api.rates.dayPrices(rate.id);
    const base = parseFloat(rate.base_day_price) || 0;
    const customMap: Record<number, string> = {};

    for (const dp of dayPrices) {
      const day = dp.day_number;
      const stored = Math.round(parseFloat(dp.price) * 100) / 100;
      // Gebruik is_manual_override als primaire bron; fallback: vergelijk met auto-formule
      const isExplicitlyManual = dp.is_manual_override === true;
      const autoVal = Math.round(base * day * 100) / 100;
      const differsFromAuto = Math.abs(stored - autoVal) >= 0.005;
      if (isExplicitlyManual || differsFromAuto) {
        customMap[day] = stored.toFixed(2);
      }
    }

    setCustomPrices(customMap);

    // Toon genoeg rijen voor de opgeslagen dagprijzen
    const rateMax = parseInt(rate.max_days) || 14;
    const maxCustomDay = Object.keys(customMap).length > 0
      ? Math.max(...Object.keys(customMap).map(Number))
      : 0;
    setNumDays(Math.min(30, Math.max(
      Math.min(Math.max(Math.min(rateMax, 14), 7), 21),
      maxCustomDay,
    )));
  }

  // Compute effective price for a given day:
  // custom value if set, otherwise previous day + base_day_price (cascading)
  function getEffectivePrice(day: number, base: number): number {
    if (day <= 0) return 0;
    const custom = customPrices[day];
    if (custom !== undefined && custom !== '') {
      const v = parseFloat(custom);
      if (!isNaN(v)) return v;
    }
    return getEffectivePrice(day - 1, base) + base;
  }

  // When the user starts editing a price: remember the current effective value.
  function handleDayFocus(day: number) {
    const base = parseFloat(selected?.base_day_price || '0');
    editStartRef.current[day] = getEffectivePrice(day, base);
  }

  // When the user leaves a price input: cascade the delta to ALL following days.
  // This works for both auto and custom days, so changing day 2 also shifts
  // days 3, 4, 5 … that were loaded from the database as custom values.
  function handleDayBlur(day: number, newValue: string) {
    const base = parseFloat(selected?.base_day_price || '0');
    const startVal = editStartRef.current[day] ?? getEffectivePrice(day, base);
    const newVal = parseFloat(newValue);
    delete editStartRef.current[day];

    if (isNaN(newVal) || Math.abs(newVal - startVal) < 0.005) return;

    const delta = newVal - startVal;
    setCustomPrices(prev => {
      const updated = { ...prev };
      for (let d = day + 1; d <= numDays; d++) {
        const cur = prev[d];
        if (cur !== undefined && cur !== '') {
          // Shift existing custom day by the same delta
          const shifted = (parseFloat(cur) || 0) + delta;
          updated[d] = Math.max(0, shifted).toFixed(2);
        }
        // Auto days (no entry in prev) recalculate automatically via getEffectivePrice on re-render
      }
      return updated;
    });
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
    setCustomPrices({});
    setNumDays(14);
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
      const base = parseFloat(selected.base_day_price);
      // Sla alle dagen op met exact de berekende waarde.
      // isManualOverride=true alleen voor dagen die de gebruiker handmatig heeft ingesteld.
      const rows = Array.from({ length: numDays }, (_, i) => i + 1).map(day => ({
        dayNumber: day,
        price: Math.round(getEffectivePrice(day, base) * 100) / 100,
        isManualOverride: customPrices[day] !== undefined && customPrices[day] !== '',
      }));
      await api.rates.updateDayPrices(selected.id, rows);
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
      setSelected(null); setCustomPrices({}); setMode('view'); setConfirmDelete(false);
      await load();
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
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
              {mode === 'new' ? '+ Nieuw tarief aanmaken' : <><PencilSquareIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:5}} />{selected?.name} bewerken</>}
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
                {saving ? 'Opslaan...' : mode === 'new' ? '+ Aanmaken' : <><CheckIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Bijwerken</>}
              </button>
            </div>
          </div>
        )}

        {/* ── View modus ── */}
        {selected && mode === 'view' && (
          <>
            {/* Meta info */}
            <div className="card" style={{ padding: '14px 20px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, flex: 1, fontSize: 13 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 4 }}>Periode</div>
                    <div style={{ fontWeight: 700, color: '#0a2240' }}>{fmtDate(selected.valid_from)}</div>
                    <div style={{ fontWeight: 700, color: '#0a2240' }}>→ {fmtDate(selected.valid_until)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 4 }}>Basis dagprijs</div>
                    <div style={{ fontWeight: 700, color: '#0a2240', fontSize: 16 }}>€ {parseFloat(selected.base_day_price).toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: '#7090b0' }}>per extra dag (auto-ophoging)</div>
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
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(selected)} style={{ flexShrink: 0, display:'flex', alignItems:'center', gap:5 }}>
                  <PencilSquareIcon className="w-4 h-4" />Bewerken
                </button>
              </div>
            </div>

            {/* ── Dagprijzen ── */}
            <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
              {/* Card header met numDays-selector */}
              <div style={{ padding: '14px 20px', borderBottom: '0.5px solid rgba(10,34,64,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240' }}>Dagprijzen</div>
                  <div style={{ fontSize: 11, color: '#7090b0', marginTop: 2, maxWidth: 420 }}>
                    Totaalprijs per auto. Niet aangepaste dagen worden automatisch berekend:
                    vorige dag + basis dagprijs (€{parseFloat(selected.base_day_price).toFixed(2)}).
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, color: '#7090b0' }}>Toon t/m dag</span>
                  <input
                    type="number"
                    value={numDays}
                    min={1} max={30}
                    onChange={e => setNumDays(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))}
                    style={{ width: 54, padding: '5px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 13, textAlign: 'center', color: '#0a2240' }}
                  />
                </div>
              </div>

              {/* Tabel header */}
              <div style={{ padding: '0 20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '90px 160px 100px 1fr 60px', gap: 8, padding: '10px 0 6px', fontSize: 10, fontWeight: 700, color: '#9ab0c8', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '0.5px solid rgba(10,34,64,0.07)' }}>
                  <div>Dagen</div>
                  <div>Totaalprijs</div>
                  <div>Gem./dag</div>
                  <div>Ophoging</div>
                  <div></div>
                </div>

                {/* Dagprijzen rijen */}
                {Array.from({ length: numDays }, (_, i) => i + 1).map(day => {
                  const base = parseFloat(selected.base_day_price);
                  const isCustom = customPrices[day] !== undefined && customPrices[day] !== '';
                  const effective = getEffectivePrice(day, base);
                  const prev = getEffectivePrice(day - 1, base);
                  const increment = effective - prev;

                  return (
                    <div
                      key={day}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '90px 160px 100px 1fr 60px',
                        gap: 8,
                        padding: '7px 0',
                        borderBottom: '0.5px solid rgba(10,34,64,0.04)',
                        alignItems: 'center',
                        background: isCustom ? 'transparent' : undefined,
                      }}
                    >
                      {/* Dagen label */}
                      <div style={{ fontSize: 13, fontWeight: isCustom ? 700 : 500, color: isCustom ? '#0a2240' : '#7090b0' }}>
                        {day === 1 ? '1 dag' : `${day} dagen`}
                      </div>

                      {/* Prijs input (custom) of auto-waarde */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {isCustom ? (
                          <>
                            <span style={{ fontSize: 13, color: '#0a2240', fontWeight: 600 }}>€</span>
                            <input
                              type="number"
                              value={customPrices[day]}
                              onChange={e => setCustomPrices(prev => ({ ...prev, [day]: e.target.value }))}
                              onFocus={() => handleDayFocus(day)}
                              onBlur={e => handleDayBlur(day, e.target.value)}
                              step="0.01"
                              min={0}
                              style={{
                                width: 90, padding: '5px 8px',
                                border: '1.5px solid rgba(10,34,64,0.25)',
                                borderRadius: 6, fontSize: 14, fontWeight: 700,
                                color: '#0a2240', background: 'white',
                              }}
                            />
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: 13, color: '#b0c4d8' }}>€</span>
                            <span style={{
                              fontSize: 14, fontWeight: 600, color: '#b0c4d8',
                              background: '#f4f6f9', padding: '5px 10px',
                              borderRadius: 6, minWidth: 90, display: 'inline-block',
                              border: '0.5px solid rgba(10,34,64,0.06)',
                            }}>
                              {effective.toFixed(2)}
                            </span>
                            <span style={{ fontSize: 10, color: '#c8d8e8', fontStyle: 'italic', marginLeft: 4 }}>auto</span>
                          </>
                        )}
                      </div>

                      {/* Gem. per dag */}
                      <div style={{ fontSize: 12, color: isCustom ? '#7090b0' : '#b0c4d8' }}>
                        ≈ €{day > 0 ? (effective / day).toFixed(2) : '—'}/dag
                      </div>

                      {/* Ophoging t.o.v. vorige dag */}
                      <div style={{ fontSize: 12, color: isCustom ? '#0a7c6e' : '#c8d8e8' }}>
                        {day === 1 ? (
                          <span style={{ color: isCustom ? '#0a7c6e' : '#c8d8e8' }}>1e dag</span>
                        ) : (
                          <span>
                            {increment >= 0 ? '+' : ''}€{increment.toFixed(2)}{' '}
                            {!isCustom && <span style={{ fontSize: 10, opacity: 0.7 }}>(basis)</span>}
                          </span>
                        )}
                      </div>

                      {/* Aanpassen / auto-knop */}
                      <div style={{ textAlign: 'right' }}>
                        {isCustom ? (
                          <button
                            onClick={() => setCustomPrices(prev => { const n = { ...prev }; delete n[day]; return n; })}
                            title="Terugzetten op automatisch"
                            style={{ fontSize: 11, color: '#9ab0c8', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: 4 }}
                          >
                            <ArrowUturnLeftIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle',marginRight:3}} />auto
                          </button>
                        ) : (
                          <button
                            onClick={() => setCustomPrices(prev => ({ ...prev, [day]: effective.toFixed(2) }))}
                            title="Prijs handmatig aanpassen"
                            style={{ fontSize: 11, color: '#0a7c6e', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: 4 }}
                          >
                            <PencilSquareIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle'}} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Extra dagen toelichting */}
                <div style={{ padding: '12px 0', fontSize: 12, color: '#b0c4d8', fontStyle: 'italic', borderTop: '0.5px solid rgba(10,34,64,0.06)' }}>
                  Dag {numDays + 1} en verder: elk +€{parseFloat(selected.base_day_price).toFixed(2)} per extra dag (automatisch via basis dagprijs)
                </div>
              </div>

              {/* Footer: opslaan */}
              <div style={{ padding: '0 20px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: '#9ab0c8' }}>
                  {Object.keys(customPrices).length > 0
                    ? `${Object.keys(customPrices).length} dag${Object.keys(customPrices).length !== 1 ? 'en' : ''} handmatig ingesteld`
                    : 'Alle dagen worden automatisch berekend'}
                </div>
                <button className="btn btn-primary" onClick={saveDayPrices} disabled={saving}>
                  {saving ? 'Opslaan...' : <><CheckIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Dagprijzen opslaan</>}
                </button>
              </div>
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
            <ClipboardDocumentListIcon className="w-8 h-8" style={{ marginBottom: 12, color: '#9ab0c8' }} />
            <div style={{ fontWeight: 700, color: '#0a2240', marginBottom: 8 }}>Nog geen tarieven aangemaakt</div>
            <div style={{ fontSize: 13, color: '#7090b0', marginBottom: 20 }}>Maak een tarief aan per seizoen of periode.</div>
            <button className="btn btn-primary" onClick={openNew}>+ Eerste tarief aanmaken</button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
