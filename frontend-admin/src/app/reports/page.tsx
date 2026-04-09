'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { api } from '@/lib/api';

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
              { label: 'Totale omzet', value: `€ ${Number(totals.total_revenue).toFixed(2)}`, color: '#2a7a3a' },
              { label: 'Totaal terugbetaald', value: `€ ${Number(totals.total_refunded).toFixed(2)}`, color: '#7a5010' },
              { label: 'Geannuleerd', value: `€ ${Number(totals.total_cancelled).toFixed(2)}`, color: '#8a2020' },
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
                  {['Referentie','Klant','Kenteken','Aankomst','Vertrek','Nachten','Bedrag','Status'].map(h => (
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
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>{r.nights}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700 }}>€ {Number(r.total_price).toFixed(2)}</td>
                    <td style={{ padding: '9px 12px' }}><span className={`status-badge badge-${r.status}`}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && rows.length === 0 && <div className="card" style={{ padding: 32, textAlign: 'center', color: '#7090b0' }}>Geen resultaten</div>}
      </div>
    </AdminLayout>
  );
}
