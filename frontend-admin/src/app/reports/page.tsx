'use client';
import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { api } from '@/lib/api';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const MONTHS_FULL = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];

// ─── Vergelijkingstabel ───────────────────────────────────────────────────────
function OccupancyComparison() {
  const curYear = new Date().getFullYear();
  const [groupBy, setGroupBy] = useState<'month'|'week'|'day'>('month');
  const [fromYear, setFromYear] = useState(curYear - 2);
  const [toYear, setToYear] = useState(curYear);
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [metric, setMetric] = useState<'revenue'|'occ'|'avg'>('revenue');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { groupBy, fromYear, toYear };
      if (groupBy === 'day') params.filterMonth = filterMonth;
      const d = await api.reports.occupancy(params);
      setRows(d.rows || []);
    } catch {}
    finally { setLoading(false); }
  }, [groupBy, fromYear, toYear, filterMonth]);

  useEffect(() => { load(); }, [load]);

  // ── Structureer data ────────────────────────────────────────────────────────
  const years = Array.from(new Set(rows.map((r: any) => r.year))).sort() as number[];
  const periodsWithData = new Set(rows.map((r: any) => r.period));

  let allPeriods: number[];
  if (groupBy === 'month') allPeriods = [1,2,3,4,5,6,7,8,9,10,11,12];
  else if (groupBy === 'week') allPeriods = Array.from({length: 53}, (_, i) => i + 1);
  else allPeriods = Array.from({length: 31}, (_, i) => i + 1);
  const periods = allPeriods.filter(p => periodsWithData.has(p));

  const idx: Record<string, any> = {};
  for (const r of rows) idx[r.year + '_' + r.period] = r;

  // Aantal kalenderdagen in een periode (voor bezettingsgemiddelde)
  const getDaysInPeriod = (year: number, period: number): number => {
    if (groupBy === 'day')  return 1;
    if (groupBy === 'week') return 7;
    return new Date(year, period, 0).getDate(); // maand: exacte dagentelling
  };

  const getValue = (year: number, period: number): number | null => {
    const r = idx[year + '_' + period];
    if (!r) return null;
    if (metric === 'revenue') return Number(r.revenue);
    if (metric === 'avg')     return Number(r.avg_daily_price);
    // occ: gem. geparkeerde auto's per nacht = car_days / kalenderdagen in periode
    return Number(r.car_days) / getDaysInPeriod(year, period);
  };

  const fmt = (v: number | null): string => {
    if (v === null) return '—';
    if (metric === 'revenue') return '€ ' + v.toLocaleString('nl-NL', {minimumFractionDigits:0, maximumFractionDigits:0});
    if (metric === 'avg')     return '€ ' + v.toFixed(2);
    // occ
    return v.toFixed(1) + ' /nacht';
  };

  // Jaarlijkse gem. dagprijs (gewogen: SUM(revenue) / SUM(car_days))
  const yearAvgPrice: Record<number, number> = {};
  for (const y of years) {
    const yr = rows.filter((r: any) => r.year === y);
    const rev = yr.reduce((s: number, r: any) => s + Number(r.revenue), 0);
    const cd  = yr.reduce((s: number, r: any) => s + Number(r.car_days), 0);
    yearAvgPrice[y] = cd > 0 ? rev / cd : 0;
  }

  // Gem. bezetting per jaar (SUM(car_days) / SUM(kalenderdagen))
  const yearAvgOcc = (y: number): number => {
    const yr = rows.filter((r: any) => r.year === y);
    const totalCd   = yr.reduce((s: number, r: any) => s + Number(r.car_days), 0);
    const totalDays = yr.reduce((s: number, r: any) => s + getDaysInPeriod(y, Number(r.period)), 0);
    return totalDays > 0 ? totalCd / totalDays : 0;
  };

  const yearTotal = (y: number): number => {
    const yr = rows.filter((r: any) => r.year === y);
    if (metric === 'revenue') return yr.reduce((s: number, r: any) => s + Number(r.revenue), 0);
    if (metric === 'avg')     return yearAvgPrice[y] || 0;
    return yearAvgOcc(y);
  };

  const pct = (a: number | null, b: number | null) => {
    if (a === null || b === null || a === 0) return null;
    return ((b - a) / a) * 100;
  };
  const fmtPct = (p: number | null) => {
    if (p === null) return '';
    return (p >= 0 ? '+' : '') + p.toFixed(1) + '%';
  };
  const pctColor = (p: number | null) => p === null ? '#7090b0' : p >= 0 ? '#1a6b30' : '#8a2020';
  const pctBg    = (p: number | null) => p === null ? 'transparent' : p >= 0 ? 'rgba(26,107,48,0.08)' : 'rgba(138,32,32,0.08)';

  const periodLabel = (p: number) => {
    if (groupBy === 'month') return MONTHS_FULL[p-1] || ('Maand ' + p);
    if (groupBy === 'week')  return 'Week ' + p;
    return p + ' ' + MONTHS_SHORT[filterMonth-1];
  };

  const lastPair = years.length >= 2 ? [years[years.length-2], years[years.length-1]] : null;
  const yearOptions = [2022,2023,2024,2025,2026,2027];

  const metricButtons: { key: 'revenue'|'occ'|'avg'; label: string }[] = [
    { key: 'revenue', label: 'Omzet' },
    { key: 'occ',     label: 'Bezetting' },
    { key: 'avg',     label: 'Gem. dagprijs' },
  ];

  return (
    <div className="card" style={{ padding: '18px 20px', marginTop: 28 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:800, color:'#0a2240', marginBottom:2 }}>Omzet- en bezettingsvergelijk</div>
          <div style={{ fontSize:11, color:'#7090b0' }}>
            Omzet verdeeld per parkeerdag (totaalprijs ÷ nachten) · Bezetting = gem. auto&apos;s per nacht
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {/* Groepering */}
          <div style={{ display:'flex', borderRadius:6, overflow:'hidden', border:'0.5px solid rgba(10,34,64,0.2)' }}>
            {(['month','week','day'] as const).map(g => (
              <button key={g} onClick={() => setGroupBy(g)}
                style={{ padding:'4px 10px', fontSize:11, fontWeight:700, border:'none', cursor:'pointer',
                  background: groupBy===g ? '#0a2240' : 'white',
                  color: groupBy===g ? 'white' : '#556070' }}>
                {g==='month' ? 'Per maand' : g==='week' ? 'Per week' : 'Per dag'}
              </button>
            ))}
          </div>
          {/* Metriek */}
          <div style={{ display:'flex', borderRadius:6, overflow:'hidden', border:'0.5px solid rgba(10,34,64,0.2)' }}>
            {metricButtons.map(({ key, label }) => (
              <button key={key} onClick={() => setMetric(key)}
                style={{ padding:'4px 10px', fontSize:11, fontWeight:700, border:'none', cursor:'pointer',
                  background: metric===key ? '#0a7c6e' : 'white',
                  color: metric===key ? 'white' : '#556070' }}>
                {label}
              </button>
            ))}
          </div>
          {/* Jaren */}
          <select value={fromYear} onChange={e => setFromYear(parseInt(e.target.value))}
            style={{ fontSize:12, padding:'4px 8px', border:'0.5px solid rgba(10,34,64,0.2)', borderRadius:6, color:'#0a2240' }}>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span style={{ fontSize:12, color:'#7090b0' }}>t/m</span>
          <select value={toYear} onChange={e => setToYear(parseInt(e.target.value))}
            style={{ fontSize:12, padding:'4px 8px', border:'0.5px solid rgba(10,34,64,0.2)', borderRadius:6, color:'#0a2240' }}>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {/* Maand filter bij 'per dag' */}
          {groupBy === 'day' && (
            <select value={filterMonth} onChange={e => setFilterMonth(parseInt(e.target.value))}
              style={{ fontSize:12, padding:'4px 8px', border:'0.5px solid rgba(10,34,64,0.2)', borderRadius:6, color:'#0a2240' }}>
              {MONTHS_FULL.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          )}
          <button onClick={load} disabled={loading}
            style={{ padding:'4px 10px', borderRadius:6, border:'0.5px solid rgba(10,34,64,0.2)', background:'white', cursor:'pointer',
              display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, color:'#0a2240' }}>
            <ArrowPathIcon className="w-3 h-3" />{loading ? 'Laden…' : 'Vernieuwen'}
          </button>
        </div>
      </div>

      {loading && <div style={{ textAlign:'center', padding:'32px 0', color:'#7090b0', fontSize:13 }}>Laden…</div>}

      {!loading && periods.length === 0 && (
        <div style={{ textAlign:'center', padding:'32px 0', color:'#7090b0', fontSize:13 }}>
          Geen gegevens gevonden voor dit bereik
        </div>
      )}

      {!loading && periods.length > 0 && (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'2px solid rgba(10,34,64,0.12)' }}>
                <th style={{ padding:'8px 12px', textAlign:'left', fontSize:11, fontWeight:700, color:'#7090b0', minWidth:110 }}>
                  {groupBy==='month' ? 'Maand' : groupBy==='week' ? 'Week' : 'Dag'}
                </th>
                {years.map(y => (
                  <th key={y} style={{ padding:'8px 12px', textAlign:'right', fontSize:12, fontWeight:800, color:'#0a2240', minWidth:120 }}>{y}</th>
                ))}
                {lastPair && (
                  <th style={{ padding:'8px 12px', textAlign:'right', fontSize:11, fontWeight:700, color:'#7090b0', minWidth:90 }}>
                    {'Δ ' + lastPair[0] + '→' + lastPair[1]}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {periods.map((p, pi) => {
                const vals = years.map(y => getValue(y, p));
                const delta = lastPair ? pct(vals[years.length-2], vals[years.length-1]) : null;
                return (
                  <tr key={p} style={{ borderBottom:'0.5px solid rgba(10,34,64,0.06)', background: pi%2===0 ? 'white' : '#f8f9fb' }}>
                    <td style={{ padding:'7px 12px', color:'#0a2240', fontWeight:600 }}>{periodLabel(p)}</td>
                    {vals.map((v, yi) => (
                      <td key={yi} style={{ padding:'7px 12px', textAlign:'right', color: v === null ? '#c0cad8' : '#0a2240', fontFamily:'monospace' }}>
                        {fmt(v)}
                      </td>
                    ))}
                    {lastPair && (
                      <td style={{ padding:'7px 12px', textAlign:'right', fontWeight:700, fontSize:12,
                        color: pctColor(delta), background: pctBg(delta), borderRadius:4 }}>
                        {fmtPct(delta)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {/* Totaalrij */}
              <tr style={{ borderTop:'2px solid rgba(10,34,64,0.15)', background:'#f0f3f7' }}>
                <td style={{ padding:'9px 12px', fontWeight:800, color:'#0a2240', fontSize:12 }}>
                  {metric==='avg' ? 'Gem. dagprijs' : metric==='occ' ? 'Gem. bezetting' : 'Totaal'}
                </td>
                {years.map(y => {
                  const v = yearTotal(y);
                  return (
                    <td key={y} style={{ padding:'9px 12px', textAlign:'right', fontWeight:800, color:'#0a2240', fontFamily:'monospace' }}>
                      {fmt(v)}
                    </td>
                  );
                })}
                {lastPair && (() => {
                  const a = yearTotal(lastPair[0]);
                  const b = yearTotal(lastPair[1]);
                  const d = pct(a, b);
                  return (
                    <td style={{ padding:'9px 12px', textAlign:'right', fontWeight:800, fontSize:12,
                      color: pctColor(d), background: pctBg(d) }}>
                      {fmtPct(d)}
                    </td>
                  );
                })()}
              </tr>
              {/* Altijd: gem. dagprijs én gem. bezetting tonen als extra context */}
              {metric !== 'avg' && (
                <tr style={{ background:'#e6f0ed' }}>
                  <td style={{ padding:'7px 12px', fontWeight:700, color:'#0a5c50', fontSize:11 }}>Gem. dagprijs / auto</td>
                  {years.map(y => (
                    <td key={y} style={{ padding:'7px 12px', textAlign:'right', fontWeight:700, color:'#0a7c6e', fontSize:12, fontFamily:'monospace' }}>
                      {'€ ' + (yearAvgPrice[y]||0).toFixed(2)}
                    </td>
                  ))}
                  {lastPair && (() => {
                    const a = yearAvgPrice[lastPair[0]] || 0;
                    const b = yearAvgPrice[lastPair[1]] || 0;
                    const d = pct(a, b);
                    return <td style={{ padding:'7px 12px', textAlign:'right', fontWeight:700, fontSize:12, color: pctColor(d) }}>{fmtPct(d)}</td>;
                  })()}
                </tr>
              )}
              {metric !== 'occ' && (
                <tr style={{ background:'#e8eef5' }}>
                  <td style={{ padding:'7px 12px', fontWeight:700, color:'#0a3060', fontSize:11 }}>Gem. bezetting / nacht</td>
                  {years.map(y => (
                    <td key={y} style={{ padding:'7px 12px', textAlign:'right', fontWeight:700, color:'#0a2240', fontSize:12, fontFamily:'monospace' }}>
                      {yearAvgOcc(y).toFixed(1) + ' /nacht'}
                    </td>
                  ))}
                  {lastPair && (() => {
                    const a = yearAvgOcc(lastPair[0]);
                    const b = yearAvgOcc(lastPair[1]);
                    const d = pct(a, b);
                    return <td style={{ padding:'7px 12px', textAlign:'right', fontWeight:700, fontSize:12, color: pctColor(d) }}>{fmtPct(d)}</td>;
                  })()}
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().split('T')[0]; });
  const [to, setTo] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState('');

  async function load() {
    setLoading(true);
    try { const d = await api.reports.financial({ from, to, ...(status ? { status } : {}) }); setData(d); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const totals = data?.totals;
  const rows = data?.rows || [];

  return (
    <AdminLayout>
      <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
        <h1 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Financieel rapport</h1>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 13 }} />
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 13 }} />
          <select value={status} onChange={e => setStatus(e.target.value)}
            style={{ padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 13, background: 'white' }}>
            <option value="">Alle statussen</option>
            <option value="booked">Geboekt</option>
            <option value="checked_in">Ingecheckt</option>
            <option value="completed">Voltooid</option>
            <option value="cancelled">Geannuleerd</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={load}>Rapport laden</button>
        </div>

        {/* Totals */}
        {totals && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'Totale omzet', value: '€ ' + Number(totals.total_revenue).toFixed(2), color: '#2a7a3a' },
              { label: 'Totaal terugbetaald', value: '€ ' + Number(totals.total_refunded).toFixed(2), color: '#7a5010' },
              { label: 'Geannuleerd', value: '€ ' + Number(totals.total_cancelled).toFixed(2), color: '#8a2020' },
            ].map((m, i) => (
              <div key={i} className="card" style={{ padding: '16px 18px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{m.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        {loading && <div style={{ color: '#7090b0', padding: 20 }}>Laden...</div>}
        {!loading && rows.length > 0 && (
          <div className="card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0a2240', color: 'white' }}>
                  {['Referentie','Klant','Kenteken','Aankomst','Vertrek','Dagen','Bedrag','Status','Betaling'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.4px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '0.5px solid rgba(10,34,64,0.08)', background: i % 2 === 0 ? 'white' : '#f8f9fb' }}>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{r.reference}</td>
                    <td style={{ padding: '9px 12px' }}>{r.customer_name}</td>
                    <td style={{ padding: '9px 12px' }}><span className="nl-plate" style={{ fontSize: 10 }}>{r.plates}</span></td>
                    <td style={{ padding: '9px 12px' }}>{new Date(r.arrival_date).toLocaleDateString('nl-NL',{day:'numeric',month:'short'})}</td>
                    <td style={{ padding: '9px 12px' }}>{new Date(r.departure_date).toLocaleDateString('nl-NL',{day:'numeric',month:'short'})}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>{Number(r.nights) + 1}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700 }}>{'€ ' + Number(r.total_price).toFixed(2)}</td>
                    <td style={{ padding: '9px 12px' }}><span className={'status-badge badge-' + r.status}>{r.status}</span></td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                        background: r.payment_status === 'paid' ? '#d4edda' : r.payment_status === 'on_site' ? '#d1ecf1' : r.payment_status === 'refunded' ? '#fff3cd' : r.payment_status === 'failed' ? '#f8d7da' : '#e9ecef',
                        color: r.payment_status === 'paid' ? '#155724' : r.payment_status === 'on_site' ? '#0c5460' : r.payment_status === 'refunded' ? '#856404' : r.payment_status === 'failed' ? '#721c24' : '#495057',
                      }}>{r.payment_status || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && rows.length === 0 && <div className="card" style={{ padding: 32, textAlign: 'center', color: '#7090b0' }}>Geen resultaten</div>}

        {/* Vergelijkingstabel */}
        <OccupancyComparison />
      </div>
    </AdminLayout>
  );
}
