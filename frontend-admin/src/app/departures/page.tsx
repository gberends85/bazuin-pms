'use client';
import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import ReservationCard from '@/components/reservations/ReservationCard';
import Toaster from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function DeparturesPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const todayFmt = new Date().toLocaleDateString('nl-NL', { weekday:'long', day:'numeric', month:'long' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api.reservations.today(); setData(d); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const departures = data?.departures || [];

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 900 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Vertrekken vandaag</h1>
            <p style={{ margin: 0, fontSize: 13, color: '#7090b0', textTransform: 'capitalize' }}>{todayFmt} · {departures.length} verwacht</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={load}>↻ Verversen</button>
        </div>
        {loading && <div style={{ color: '#7090b0', padding: 20 }}>Laden...</div>}
        {!loading && departures.length === 0 && (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: '#7090b0' }}>
            Geen vertrekken gepland voor vandaag
          </div>
        )}
        {departures.map((res: any) => (
          <ReservationCard key={res.id} res={res} onUpdate={load} showCheckin={false} showCheckout />
        ))}
      </div>
    </AdminLayout>
  );
}
