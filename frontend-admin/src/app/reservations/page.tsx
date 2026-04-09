'use client';
import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import ReservationCard from '@/components/reservations/ReservationCard';
import Toaster from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function ReservationsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (status) params.status = status;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const d = await api.reservations.list(params);
      setData(d);
    } finally { setLoading(false); }
  }, [search, status, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const rows = data?.data || [];

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 1000 }}>
        <h1 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Alle reserveringen</h1>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoek naam, kenteken, referentie..." onKeyDown={e => e.key === 'Enter' && load()}
            style={{ flex: 1, minWidth: 200, padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 13 }} />
          <select value={status} onChange={e => setStatus(e.target.value)}
            style={{ padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 13, background: 'white' }}>
            <option value="">Alle statussen</option>
            <option value="booked">Geboekt</option>
            <option value="checked_in">Ingecheckt</option>
            <option value="completed">Voltooid</option>
            <option value="cancelled">Geannuleerd</option>
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 13 }} />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 13 }} />
          <button className="btn btn-primary btn-sm" onClick={load}>Zoeken</button>
        </div>

        {data && <div style={{ fontSize: 12, color: '#7090b0', marginBottom: 14 }}>{data.total} reserveringen gevonden</div>}
        {loading && <div style={{ color: '#7090b0', padding: 20 }}>Laden...</div>}
        {rows.map((res: any) => (
          <ReservationCard key={res.id} res={res} onUpdate={load} showCheckin showCheckout />
        ))}
      </div>
    </AdminLayout>
  );
}
