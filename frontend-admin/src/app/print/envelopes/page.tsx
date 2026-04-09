'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

function fmtDayNum(iso: string) { return new Date(iso + 'T12:00:00').getDate(); }
function fmtDayName(iso: string) { return new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long' }); }
function fmtMonth(iso: string) { return new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { month: 'long' }); }

function C6Envelope({ res }: { res: any }) {
  const plates = res.vehicles?.map((v: any) => v.license_plate) || (res.plates || '').split(', ').filter(Boolean);
  const evVehicles = res.vehicles?.filter((v: any) => v.ev_kwh) || [];
  return (
    <div className="envelope">
      <div className="col col-left">
        <div className="plates">{plates.map((p: string) => <div key={p} className="plate">{p}</div>)}</div>
        <div className="name">{res.first_name} {res.last_name}</div>
        {res.ferry_outbound_time && (
          <div className="outbound-time">
            <span className="label">Boot</span>
            <span className="time">{String(res.ferry_outbound_time).slice(0, 5)}</span>
          </div>
        )}
      </div>
      <div className="col col-mid">
        <div className="destination">
          {res.ferry_outbound_destination === 'terschelling' ? 'Terschelling' :
           res.ferry_outbound_destination === 'vlieland' ? 'Vlieland' :
           res.ferry_outbound_destination || '\u2014'}
        </div>
        <div className="return-times">
          {res.ferry_return_time && <span className="return-dep">{String(res.ferry_return_time).slice(0, 5)}</span>}
          {res.ferry_return_time && res.ferry_return_arrival_harlingen && <span className="arrow"> &rarr; </span>}
          {res.ferry_return_arrival_harlingen && <span className="return-arr">{res.ferry_return_arrival_harlingen}</span>}
        </div>
        <div className={`payment-status payment-${res.payment_status}`}>
          {res.payment_status === 'paid' ? 'Betaald' :
           res.payment_status === 'pending' ? 'Nog te betalen' :
           res.payment_status === 'partial' ? 'Gedeeltelijk betaald' :
           res.payment_status || '\u2014'}
          {res.payment_status !== 'paid' && res.total_price != null && (
            <span className="payment-amount"> &middot; &euro; {Number(res.total_price).toFixed(2).replace('.', ',')}</span>
          )}
        </div>
      </div>
      <div className="col col-right">
        {evVehicles.length > 0 && (
          <div className="options">
            {evVehicles.map((v: any) => <div key={v.license_plate} className="option">&zwnj;⚡ {v.license_plate} &middot; {v.ev_kwh} kWh</div>)}
          </div>
        )}
        <div className="pickup-label">Afhalen</div>
        <div className="pickup-day">{fmtDayNum(res.departure_date)}</div>
        <div className="pickup-month">{fmtDayName(res.departure_date)}</div>
        <div className="pickup-monthname">{fmtMonth(res.departure_date)}</div>
      </div>
    </div>
  );
}

function EnvelopesContent() {
  const searchParams = useSearchParams();
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const ids = searchParams.get('ids');
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        if (ids) {
          const list = await Promise.all(ids.split(',').map((id: string) => api.reservations.get(id)));
          setReservations(list);
        } else {
          const data = await api.reservations.today(date);
          const arrivals = data?.arrivals || [];
          const full = await Promise.all(arrivals.map((r: any) => api.reservations.get(r.id).catch(() => r)));
          setReservations(full);
        }
      } finally { setLoading(false); }
    }
    load();
  }, [date, ids]);

  useEffect(() => {
    if (!loading && reservations.length > 0) setTimeout(() => window.print(), 800);
  }, [loading, reservations]);

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (loading) return <div style={{ padding: 20, color: '#999' }}>Laden...</div>;
  if (reservations.length === 0) return <div style={{ padding: 20, color: '#666' }}>Geen aankomsten op {dateLabel}</div>;
  return (
    <>
      <div className="no-print" style={{ fontFamily: 'sans-serif', fontSize: 12, color: '#666', marginBottom: 8 }}>
        {reservations.length} envelop{reservations.length !== 1 ? 'pen' : ''} &middot; {dateLabel} &middot;{' '}
        <button onClick={() => window.print()} style={{ cursor: 'pointer', background: '#0a2240', color: 'white', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12 }}>Afdrukken</button>
      </div>
      {reservations.map(r => <C6Envelope key={r.id} res={r} />)}
    </>
  );
}

export default function PrintEnvelopesPage() {
  return (
    <>
      <style>{`
        @page { size: 162mm 114mm landscape; margin: 4mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; background: white; }
        .envelope { width: 154mm; height: 106mm; display: flex; flex-direction: row; border: 0.3mm solid #ccc; overflow: hidden; }
        .col { padding: 5mm; display: flex; flex-direction: column; }
        .col-left { flex: 0 0 52mm; border-right: 0.3mm solid #e0e0e0; }
        .col-mid { flex: 1; border-right: 0.3mm solid #e0e0e0; }
        .col-right { flex: 0 0 46mm; align-items: center; justify-content: flex-start; text-align: center; }
        .plates { margin-bottom: 3mm; }
        .plate { display: block; background: white; border: 1.5px solid #000; border-radius: 3px; font-family: monospace; font-size: 11pt; font-weight: 900; letter-spacing: 1px; padding: 1mm 2mm; margin-bottom: 1.5mm; color: #000; }
        .name { font-size: 9pt; font-weight: 700; color: #000; margin-bottom: 2mm; }
        .outbound-time { display: flex; align-items: baseline; gap: 2mm; margin-top: 2mm; }
        .outbound-time .label { font-size: 7pt; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
        .outbound-time .time { font-size: 14pt; font-weight: 900; color: #000; }
        .destination { font-size: 13pt; font-weight: 900; color: #000; margin-bottom: 3mm; }
        .return-times { display: flex; align-items: baseline; flex-wrap: wrap; gap: 1mm; margin-bottom: 3mm; }
        .return-dep { font-size: 9pt; color: #555; }
        .arrow { font-size: 9pt; color: #555; }
        .return-arr { font-size: 20pt; font-weight: 900; color: #000; }
        .payment-status { font-size: 8pt; font-weight: 700; border-radius: 3px; padding: 1mm 2mm; margin-top: 2mm; display: inline-block; border: 1px solid #000; background: white; color: #000; }
        .payment-amount { font-weight: 400; }
        .options { margin-top: 0; }
        .option { font-size: 8pt; font-weight: 700; color: #000; background: #eee; border-radius: 3px; padding: 1mm 2mm; margin-bottom: 1mm; }
        .pickup-label { font-size: 7pt; color: #555; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1mm; }
        .pickup-day { font-size: 34pt; font-weight: 900; color: #000; line-height: 1; }
        .pickup-month { font-size: 9pt; font-weight: 700; color: #333; margin-top: 1mm; text-transform: capitalize; }
        .pickup-monthname { font-size: 9pt; color: #555; text-transform: capitalize; }
        @media print { body { margin: 0; } .no-print { display: none !important; } .envelope { border: none; } .envelope + .envelope { page-break-before: always; } }
        @media screen { body { background: #eee; padding: 10mm; } .envelope { box-shadow: 0 2px 12px rgba(0,0,0,0.15); margin-bottom: 8mm; } .no-print { margin-bottom: 4mm; } }
      `}</style>
      <Suspense fallback={<div style={{ padding: 20 }}>Laden...</div>}>
        <EnvelopesContent />
      </Suspense>
    </>
  );
}
