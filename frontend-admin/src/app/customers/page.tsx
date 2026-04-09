'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { api } from '@/lib/api';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(q?: string) {
    setLoading(true);
    try { const d = await api.customers.list(q); setCustomers(d); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <AdminLayout>
      <div style={{ padding: '24px 28px', maxWidth: 900 }}>
        <h1 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Klanten</h1>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoek naam of e-mail..." onKeyDown={e => e.key === 'Enter' && load(search)}
            style={{ flex: 1, padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 13 }} />
          <button className="btn btn-primary btn-sm" onClick={() => load(search)}>Zoeken</button>
        </div>
        {loading && <div style={{ color: '#7090b0', padding: 20 }}>Laden...</div>}
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a2240', color: 'white' }}>
                {['Naam', 'E-mail', 'Telefoon', 'Reserveringen', 'Laatste bezoek'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.4px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: '0.5px solid rgba(10,34,64,0.08)', background: i % 2 === 0 ? 'white' : '#f8f9fb' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{c.first_name} {c.last_name}</td>
                  <td style={{ padding: '10px 14px', color: '#0a7c6e' }}>{c.email}</td>
                  <td style={{ padding: '10px 14px', color: '#7090b0' }}>{c.phone || '—'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>{c.reservation_count}</td>
                  <td style={{ padding: '10px 14px', color: '#7090b0', fontSize: 12 }}>
                    {c.last_visit ? new Date(c.last_visit).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))}
              {!loading && customers.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#7090b0' }}>Geen klanten gevonden</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
