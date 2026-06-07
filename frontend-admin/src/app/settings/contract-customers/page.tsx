'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { Zap, Trash2 } from 'lucide-react';

export default function ContractCustomersPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setItems(await api.contractCustomers.list()); }
    catch (e: any) { toastError(e.message); }
    finally { setLoading(false); }
  }

  function update(id: string, field: string, value: any) {
    setItems(prev => prev.map(c => c.id === id ? { ...c, [field]: value, _dirty: true } : c));
  }

  async function save(c: any) {
    if (!c.name) { toastError('Naam is verplicht'); return; }
    setSaving(c.id);
    try {
      const updated = await api.contractCustomers.update(c.id, {
        name: c.name, company: c.company, email: c.email, phone: c.phone,
        address: c.address, postal_code: c.postal_code, city: c.city,
        btw_number: c.btw_number,
        daily_rate: parseFloat(c.daily_rate),
        vat_percentage: parseFloat(c.vat_percentage),
        notes: c.notes, is_active: !!c.is_active,
        rate_type: c.rate_type || 'daily',
        fixed_period_days: parseInt(c.fixed_period_days) || 2,
        fixed_period_rate: parseFloat(c.fixed_period_rate) || 0,
        extra_day_rate: parseFloat(c.extra_day_rate) || 0,
        low_season_rate: parseFloat(c.low_season_rate) || 0,
        high_season_rate: parseFloat(c.high_season_rate) || 0,
        high_season_from: c.high_season_from || '04-01',
        high_season_until: c.high_season_until || '09-30',
        license_plate: c.license_plate || null,
        ev_enabled: !!c.ev_enabled,
        ev_rate_per_kwh: parseFloat(c.ev_rate_per_kwh) || 0.35,
        ev_start_fee: parseFloat(c.ev_start_fee) || 0,
        next_year_low_season_rate: parseFloat(c.next_year_low_season_rate) || 0,
        next_year_high_season_rate: parseFloat(c.next_year_high_season_rate) || 0,
        season_start_date: c.season_start_date || null,
      });
      setItems(prev => prev.map(x => x.id === c.id ? { ...updated, invoice_count: c.invoice_count } : x));
      toast(`${c.name} opgeslagen ✓`);
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(null); }
  }

  async function create() {
    try {
      const created = await api.contractCustomers.create({ name: 'Nieuwe contractklant', daily_rate: 10, vat_percentage: 21 });
      setItems(prev => [{ ...created, invoice_count: 0 }, ...prev]);
      toast('Contractklant aangemaakt ✓');
    } catch (e: any) { toastError(e.message); }
  }

  async function remove(id: string) {
    try {
      const r = await api.contractCustomers.remove(id);
      if (r.deactivated) {
        toast('Heeft facturen — gedeactiveerd i.p.v. verwijderd');
        load();
      } else {
        setItems(prev => prev.filter(c => c.id !== id));
        toast('Verwijderd');
      }
    } catch (e: any) { toastError(e.message); }
    finally { setConfirmDel(null); }
  }

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 980 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Contractklanten</h1>
          <button className="btn btn-primary btn-sm" onClick={create}>+ Nieuwe contractklant</button>
        </div>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#7090b0' }}>
          Klanten met een vast dagtarief per auto. Dagregistratie en facturatie loopt via <strong>Contractfacturatie</strong> in het hoofdmenu.
        </p>

        {loading && <div style={{ color: '#7090b0' }}>Laden...</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map(c => (
            <div key={c.id} className="card" style={{ padding: '16px 18px', opacity: c.is_active ? 1 : 0.55, border: c._dirty ? '1.5px solid #3a80c0' : undefined }}>

              {/* Bovenste rij: naam + tarief + acties */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <input value={c.name || ''} onChange={e => update(c.id, 'name', e.target.value)}
                  placeholder="Naam contractklant"
                  style={{ flex: '1 1 220px', minWidth: 180, fontSize: 14, fontWeight: 700, border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, padding: '6px 10px', color: '#0a2240' }} />
                <input value={c.company || ''} onChange={e => update(c.id, 'company', e.target.value)}
                  placeholder="Bedrijfsnaam"
                  style={{ flex: '1 1 200px', minWidth: 160, fontSize: 13, border: '0.5px solid rgba(10,34,64,0.15)', borderRadius: 6, padding: '6px 10px', color: '#0a2240' }} />
                {c.invoice_count > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: '#e6f1fb', color: '#185fa5' }}>
                    {c.invoice_count} factuur{c.invoice_count !== 1 ? 'en' : ''}
                  </span>
                )}
              </div>

              {/* Adres + contactgegevens */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 10 }}>
                <input value={c.address || ''} onChange={e => update(c.id, 'address', e.target.value)} placeholder="Adres" style={inputSt} />
                <input value={c.postal_code || ''} onChange={e => update(c.id, 'postal_code', e.target.value)} placeholder="Postcode" style={inputSt} />
                <input value={c.city || ''} onChange={e => update(c.id, 'city', e.target.value)} placeholder="Plaats" style={inputSt} />
                <input value={c.email || ''} onChange={e => update(c.id, 'email', e.target.value)} placeholder="E-mail" style={inputSt} />
                <input value={c.phone || ''} onChange={e => update(c.id, 'phone', e.target.value)} placeholder="Telefoon" style={inputSt} />
                <input value={c.btw_number || ''} onChange={e => update(c.id, 'btw_number', e.target.value)} placeholder="BTW-nummer" style={inputSt} />
              </div>

              {/* Tarieftype + BTW */}
              <div style={{ paddingTop: 10, borderTop: '0.5px solid rgba(10,34,64,0.08)' }}>
                {/* Tarieftype selector */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#556070', marginRight: 4 }}>Tarieftype:</span>
                  {[
                    { value: 'daily', label: 'Per dag (auto-telling)' },
                    { value: 'fixed_period', label: 'Vast tarief per kenteken' },
                    { value: 'seasonal', label: 'Seizoenstarief (doorlopend)' },
                  ].map(opt => (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer',
                      padding: '4px 10px', borderRadius: 20,
                      background: (c.rate_type || 'daily') === opt.value ? '#e6f1fb' : '#f4f6f9',
                      border: (c.rate_type || 'daily') === opt.value ? '1.5px solid #3a80c0' : '1px solid rgba(10,34,64,0.12)',
                      color: (c.rate_type || 'daily') === opt.value ? '#185fa5' : '#556070', fontWeight: (c.rate_type || 'daily') === opt.value ? 700 : 400,
                    }}>
                      <input type="radio" name={`rate_type_${c.id}`} value={opt.value}
                        checked={(c.rate_type || 'daily') === opt.value}
                        onChange={() => update(c.id, 'rate_type', opt.value)}
                        style={{ accentColor: '#3a80c0' }} />
                      {opt.label}
                    </label>
                  ))}
                </div>

                {/* Velden per tarieftype */}
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  {(c.rate_type || 'daily') === 'daily' ? (
                    <label style={lblSt}>
                      Dagtarief €
                      <input type="number" step="0.01" min="0" value={c.daily_rate}
                        onChange={e => update(c.id, 'daily_rate', e.target.value)}
                        style={{ ...inputSt, width: 80, fontWeight: 700, textAlign: 'right' }} />
                      <span style={{ fontSize: 11, color: '#7090b0' }}>per auto/dag (incl. BTW)</span>
                    </label>
                  ) : (c.rate_type || 'daily') === 'fixed_period' ? (
                    <>
                      <label style={lblSt}>
                        Basistarief €
                        <input type="number" step="0.01" min="0" value={c.fixed_period_rate ?? 0}
                          onChange={e => update(c.id, 'fixed_period_rate', e.target.value)}
                          style={{ ...inputSt, width: 80, fontWeight: 700, textAlign: 'right' }} />
                        <span style={{ fontSize: 11, color: '#7090b0' }}>voor eerste</span>
                        <input type="number" step="1" min="1" value={c.fixed_period_days ?? 2}
                          onChange={e => update(c.id, 'fixed_period_days', e.target.value)}
                          style={{ ...inputSt, width: 48, textAlign: 'center' }} />
                        <span style={{ fontSize: 11, color: '#7090b0' }}>dag(en) (incl. BTW)</span>
                      </label>
                      <label style={lblSt}>
                        Extra dag €
                        <input type="number" step="0.01" min="0" value={c.extra_day_rate ?? 0}
                          onChange={e => update(c.id, 'extra_day_rate', e.target.value)}
                          style={{ ...inputSt, width: 80, textAlign: 'right' }} />
                        <span style={{ fontSize: 11, color: '#7090b0' }}>/dag (incl. BTW)</span>
                      </label>
                    </>
                  ) : (
                    /* seasonal */
                    <>
                      <label style={lblSt}>
                        Kenteken
                        <input type="text" value={c.license_plate ?? ''}
                          onChange={e => update(c.id, 'license_plate', e.target.value.toUpperCase())}
                          placeholder="AB-123-C"
                          style={{ ...inputSt, width: 110, fontWeight: 700, letterSpacing: '1px' }} />
                      </label>
                      <div style={{ width: '100%', height: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', width: '100%', marginTop: 4 }}>
                        Tarieven {new Date().getFullYear()}
                      </span>
                      <label style={lblSt}>
                        Laagseizoen €
                        <input type="number" step="0.01" min="0" value={c.low_season_rate ?? 0}
                          onChange={e => update(c.id, 'low_season_rate', e.target.value)}
                          style={{ ...inputSt, width: 80, fontWeight: 700, textAlign: 'right' }} />
                        <span style={{ fontSize: 11, color: '#7090b0' }}>/dag (incl. BTW)</span>
                      </label>
                      <label style={lblSt}>
                        Hoogseizoen €
                        <input type="number" step="0.01" min="0" value={c.high_season_rate ?? 0}
                          onChange={e => update(c.id, 'high_season_rate', e.target.value)}
                          style={{ ...inputSt, width: 80, fontWeight: 700, textAlign: 'right' }} />
                        <span style={{ fontSize: 11, color: '#7090b0' }}>/dag (incl. BTW)</span>
                      </label>
                      <label style={lblSt}>
                        Hoogseizoen van
                        <input type="text" value={c.high_season_from ?? '04-01'}
                          onChange={e => update(c.id, 'high_season_from', e.target.value)}
                          placeholder="04-01"
                          style={{ ...inputSt, width: 70, textAlign: 'center' }} />
                        t/m
                        <input type="text" value={c.high_season_until ?? '09-30'}
                          onChange={e => update(c.id, 'high_season_until', e.target.value)}
                          placeholder="09-30"
                          style={{ ...inputSt, width: 70, textAlign: 'center' }} />
                        <span style={{ fontSize: 11, color: '#7090b0' }}>(MM-DD)</span>
                      </label>
                      <div style={{ width: '100%', height: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', width: '100%', marginTop: 4 }}>
                        Tarieven {new Date().getFullYear() + 1}
                      </span>
                      <label style={lblSt}>
                        Laagseizoen €
                        <input type="number" step="0.01" min="0" value={c.next_year_low_season_rate ?? 0}
                          onChange={e => update(c.id, 'next_year_low_season_rate', e.target.value)}
                          style={{ ...inputSt, width: 80, textAlign: 'right' }} />
                        <span style={{ fontSize: 11, color: '#7090b0' }}>/dag (incl. BTW)</span>
                      </label>
                      <label style={lblSt}>
                        Hoogseizoen €
                        <input type="number" step="0.01" min="0" value={c.next_year_high_season_rate ?? 0}
                          onChange={e => update(c.id, 'next_year_high_season_rate', e.target.value)}
                          style={{ ...inputSt, width: 80, textAlign: 'right' }} />
                        <span style={{ fontSize: 11, color: '#7090b0' }}>/dag (incl. BTW)</span>
                      </label>
                      <div style={{ width: '100%', height: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', width: '100%', marginTop: 4 }}>
                        Startdatum seizoen
                      </span>
                      <label style={lblSt}>
                        Startdatum
                        <input type="date" value={c.season_start_date ? String(c.season_start_date).slice(0, 10) : ''}
                          onChange={e => update(c.id, 'season_start_date', e.target.value || null)}
                          style={{ ...inputSt, width: 140 }} />
                        <span style={{ fontSize: 11, color: '#7090b0' }}>Vanaf deze dag tellen de dagen mee voor facturatie</span>
                      </label>
                    </>
                  )}
                  <label style={lblSt}>
                    BTW %
                    <input type="number" step="0.01" min="0" value={c.vat_percentage}
                      onChange={e => update(c.id, 'vat_percentage', e.target.value)}
                      style={{ ...inputSt, width: 60, textAlign: 'right' }} />
                  </label>
                  <label style={{ fontSize: 12, color: '#7090b0', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!c.is_active} onChange={e => update(c.id, 'is_active', e.target.checked)} />
                    Actief
                  </label>
                </div>

                {/* EV opladen sectie */}
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid rgba(10,34,64,0.06)', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 12, color: '#0a2240', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600 }}>
                    <input type="checkbox" checked={!!c.ev_enabled} onChange={e => update(c.id, 'ev_enabled', e.target.checked)}
                      style={{ accentColor: '#f59e0b' }} />
                    <><Zap size={13} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />EV opladen inschakelen</>
                  </label>
                  {!!c.ev_enabled && (
                    <>
                      <label style={lblSt}>
                        Tarief per kWh €
                        <input type="number" step="0.01" min="0" value={c.ev_rate_per_kwh ?? 0.35}
                          onChange={e => update(c.id, 'ev_rate_per_kwh', e.target.value)}
                          style={{ ...inputSt, width: 80, textAlign: 'right' }} />
                      </label>
                      <label style={lblSt}>
                        Starttarief per sessie €
                        <input type="number" step="0.01" min="0" value={c.ev_start_fee ?? 0}
                          onChange={e => update(c.id, 'ev_start_fee', e.target.value)}
                          style={{ ...inputSt, width: 80, textAlign: 'right' }} />
                      </label>
                    </>
                  )}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    {confirmDel === c.id ? (
                      <>
                        <button onClick={() => setConfirmDel(null)}
                          style={{ background: '#f4f6f9', border: '0.5px solid rgba(10,34,64,0.15)', color: '#556070', borderRadius: 6, padding: '5px 11px', fontSize: 12, cursor: 'pointer' }}>Annuleer</button>
                        <button onClick={() => remove(c.id)}
                          style={{ background: '#e24b4a', border: 'none', color: 'white', borderRadius: 6, padding: '5px 11px', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>Verwijder</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setConfirmDel(c.id)}
                          style={{ background: 'none', border: '0.5px solid rgba(200,50,50,0.3)', color: '#c83232', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}><Trash2 size={13} /></button>
                        <button className="btn btn-primary btn-sm" onClick={() => save(c)} disabled={saving === c.id}>
                          {saving === c.id ? '...' : 'Opslaan'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {!loading && items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#7090b0', fontSize: 13 }}>
            Nog geen contractklanten. Klik "+ Nieuwe contractklant" om te beginnen.
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

const inputSt: React.CSSProperties = {
  border: '0.5px solid rgba(10,34,64,0.15)', borderRadius: 6, padding: '6px 9px',
  fontSize: 12, color: '#0a2240', minWidth: 0,
};
const lblSt: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#0a2240', fontWeight: 600,
};
