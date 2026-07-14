'use client';
import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { formatPlate } from '@/lib/plate';

function toDateOnly(iso: string) { return String(iso).slice(0, 10); }
function fmtDayNum(iso: string)  { return new Date(toDateOnly(iso) + 'T12:00:00').getDate(); }
function fmtMonth(iso: string)   { return new Date(toDateOnly(iso) + 'T12:00:00').getMonth() + 1; }
function fmtDayName(iso: string) { return new Date(toDateOnly(iso) + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long' }); }
function fmtShort(iso: string)   { return new Date(toDateOnly(iso) + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }); }
function eur(n: number)          { return '€ ' + n.toFixed(2).replace('.', ','); }

function carInfoLine(v: any): string {
  return [
    v.rdw_make && v.rdw_model ? `${v.rdw_make} ${v.rdw_model}` : v.rdw_make || v.rdw_model,
    v.rdw_color,
    v.rdw_year,
  ].filter(Boolean).join(' · ');
}

function modTypeLabel(type: string) {
  switch (type) {
    case 'dates': case 'dates_admin': return 'Datumwijziging';
    case 'cancel':      return 'Annulering';
    case 'extra_items': return 'Extra diensten';
    default:            return type || 'Wijziging';
  }
}

function C6Envelope({ res, mods }: { res: any; mods: any[] }) {
  const vehicles: any[] = res.vehicles || (res.plates || '').split(', ').filter(Boolean).map((p: string) => ({ license_plate: p }));
  const evVehicles = vehicles.filter((v: any) => v.ev_kwh || v.ev_service_id);

  const pendingMod = mods.find(m => m.status === 'pending_payment');
  const pendingAmt = pendingMod
    ? Math.round((parseFloat(pendingMod.price_difference || '0') + parseFloat(pendingMod.modification_fee || '0')) * 100) / 100
    : 0;

  const hasMods = mods.length > 0;
  const sortedMods = [...mods].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const firstMod = sortedMods[0];

  const origArrival   = firstMod?.old_arrival_date   || res.arrival_date;
  const origDeparture = firstMod?.old_departure_date || res.departure_date;
  const allDelta = mods.reduce((s, m) => s + parseFloat(m.price_difference || '0'), 0);
  const origPrice = Number(res.total_price) - allDelta;

  let balanceDue = 0;
  for (const mod of mods) {
    if (mod.status !== 'pending_payment') continue;
    const diff = parseFloat(mod.price_difference || '0');
    const fee  = parseFloat(mod.modification_fee  || '0');
    if (diff > 0) balanceDue += diff + fee;
  }
  const originalUnpaid = res.payment_status === 'pending' || res.payment_status === 'on_site';
  const netBalance = originalUnpaid ? Number(res.total_price) : balanceDue;

  return (
    <div className="envelope">
      <div className="envelope-top">
        {/* LINKER KOLOM */}
        <div className="col col-left">
          <div className="plates">
            {vehicles.map((v: any, idx: number) => (
              <div key={v.license_plate || `empty-${idx}`}>
                <div className="plate">
                  <span className="plate-text">{v.license_plate ? formatPlate(v.license_plate) : ''}</span>
                </div>
                {carInfoLine(v) && <div className="car-info">{carInfoLine(v)}</div>}
              </div>
            ))}
          </div>
          {res.ferry_outbound_time && (
            <div className="outbound-time">
              <span className="ot-label">{fmtDayNum(res.arrival_date)}-{fmtMonth(res.arrival_date)}</span>
              <span className="ot-time">{String(res.ferry_outbound_time).slice(0, 5)}</span>
            </div>
          )}
          <div className="name">{res.first_name} {res.last_name}</div>
          {res.notes && <div className="notes">{res.notes}</div>}
          {res.admin_notes && <div className="admin-notes">📋 {res.admin_notes}</div>}
        </div>

        {/* MIDDEN KOLOM */}
        <div className="col col-mid">
          <div className="return-times">
            {res.ferry_return_time && <span className="return-dep">{String(res.ferry_return_time).slice(0, 5)}</span>}
            {res.ferry_return_time && res.ferry_return_arrival_harlingen && <span className="arrow"> → </span>}
            {res.ferry_return_arrival_harlingen && <span className="return-arr">{res.ferry_return_arrival_harlingen}</span>}
            {!res.ferry_return_time && !res.ferry_return_arrival_harlingen && res.ferry_return_custom_time &&
              <span className="return-arr">{String(res.ferry_return_custom_time).slice(0, 5)}</span>}
          </div>
          <div className="destination">
            {res.ferry_outbound_destination === 'terschelling' ? 'Terschelling' :
             res.ferry_outbound_destination === 'vlieland'     ? 'Vlieland' :
             res.ferry_outbound_destination === 'anders'       ? 'Anders' :
             res.ferry_outbound_destination || '—'}
          </div>
          {(res.payment_status === 'on_site' || res.payment_status === 'pending') ? (
            <div className="balance-block">
              <div className="balance-label">nog te betalen</div>
              <div className="balance-amount">{eur(Number(res.total_price))}</div>
            </div>
          ) : pendingMod && pendingAmt > 0 ? (
            <div className="balance-block">
              <div className="balance-label">⚠ bijbetalen</div>
              <div className="balance-amount">{eur(pendingAmt)}</div>
            </div>
          ) : (
            <div className={`payment-status payment-${(res.payment_status === 'paid' || res.payment_status === 'partial_refund') ? 'paid' : res.payment_status}`}>
              {(res.payment_status === 'paid' || res.payment_status === 'partial_refund') ? 'Betaald' :
               res.payment_status === 'invoiced'      ? 'Op factuur' :
               res.payment_status === 'pending'       ? 'Nog te betalen' :
               res.payment_status === 'refunded'      ? 'Terugbetaald' :
               res.payment_status || '—'}
              {res.payment_status === 'partial_refund' && (
                <span className="payment-amount"> · deels terug</span>
              )}
              {res.payment_status !== 'paid' && res.payment_status !== 'partial_refund' && res.payment_status !== 'invoiced' && res.total_price != null && (
                <span className="payment-amount"> · {eur(Number(res.total_price))}</span>
              )}
            </div>
          )}
        </div>

        {/* RECHTER KOLOM */}
        <div className="col col-right">
          {evVehicles.length > 0 && (
            <div className="options">
              {evVehicles.map((v: any) => (
                <div key={v.license_plate} className="option">⚡ {v.license_plate} · {v.ev_kwh ? v.ev_kwh + ' kWh' : 'vol'}</div>
              ))}
            </div>
          )}
          <div className="pickup-day">{fmtDayNum(res.departure_date)}-{fmtMonth(res.departure_date)}</div>
          <div className="pickup-dayname">{fmtDayName(res.departure_date)}</div>
        </div>
      </div>

      {/* HISTORY STRIP */}
      {hasMods && (
        <div className="hist-strip">
          <div className="hs-title">Betaalhistorie</div>
          <div className="hs-row hs-origin">
            <span className="hs-type">Boeking</span>
            <span className="hs-detail">{fmtShort(origArrival)} – {fmtShort(origDeparture)}</span>
            <span className="hs-amt">{eur(origPrice)}</span>
            <span className={`hs-badge hs-badge-${res.payment_status}`}>
              {res.payment_status === 'paid'          ? 'betaald' :
               res.payment_status === 'on_site'       ? 'ter plekke' :
               res.payment_status === 'invoiced'      ? 'factuur' :
               res.payment_status === 'refunded'      ? 'terugbetaald' :
               res.payment_status === 'partial_refund'? 'betaald' :
               'open'}
            </span>
          </div>
          {sortedMods.map((mod: any) => {
            const diff = parseFloat(mod.price_difference || '0');
            const fee  = parseFloat(mod.modification_fee  || '0');
            const extraAmt = Math.round((Math.abs(diff) + (diff > 0 ? fee : 0)) * 100) / 100;
            return (
              <div key={mod.id} className={`hs-row hs-mod-${mod.status}`}>
                <span className="hs-type">{modTypeLabel(mod.modification_type)}</span>
                <span className="hs-detail">
                  {mod.old_arrival_date && mod.new_arrival_date
                    ? <>{fmtShort(mod.old_arrival_date)}–{fmtShort(mod.old_departure_date)} → <strong>{fmtShort(mod.new_arrival_date)}–{fmtShort(mod.new_departure_date)}</strong></>
                    : mod.admin_notes || '—'}
                  {fee > 0 && <> · kosten {eur(fee)}</>}
                </span>
                <span className="hs-amt">
                  {diff > 0 && mod.status === 'pending_payment' && <span className="hs-due">+{eur(extraAmt)}</span>}
                  {diff > 0 && mod.status === 'completed'       && <span className="hs-paid">+{eur(extraAmt)}</span>}
                  {diff < 0 && mod.status === 'completed'       && <span className="hs-refunded">−{eur(Math.max(0, Math.abs(diff)))}</span>}
                  {diff < 0 && mod.status !== 'completed'       && <span className="hs-back">−{eur(Math.max(0, Math.abs(diff) - fee))}</span>}
                  {diff === 0 && <span className="hs-zero">—</span>}
                </span>
                <span className={`hs-badge hs-badge-mod-${mod.status}`}>
                  {mod.status === 'pending_payment' ? 'open' :
                   mod.status === 'completed'       ? 'voldaan' :
                   mod.status === 'rejected'        ? 'afgewezen' : mod.status}
                </span>
              </div>
            );
          })}
          <div className="hs-balance">
            <span className="hs-bal-label">Eindbalans</span>
            <span className={`hs-bal-amt ${originalUnpaid || netBalance > 0 ? 'hba-due' : netBalance < 0 ? 'hba-back' : 'hba-ok'}`}>
              {originalUnpaid
                ? `Nog te betalen ${eur(Number(res.total_price))}`
                : netBalance > 0
                ? `Nog te betalen ${eur(netBalance)}`
                : netBalance < 0
                ? `Terug te ontvangen ${eur(Math.abs(netBalance))}`
                : `Voldaan ✓`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function EnvelopesContent() {
  const searchParams = useSearchParams();
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const ids = searchParams.get('ids');
  const [reservations, setReservations] = useState<any[]>([]);
  const [modsMap, setModsMap] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        let list: any[] = [];
        if (ids) {
          list = await Promise.all(ids.split(',').map((id: string) => api.reservations.get(id)));
        } else {
          const data = await api.reservations.today(date);
          const arrivals = data?.arrivals || [];
          list = await Promise.all(arrivals.map((r: any) => api.reservations.get(r.id).catch(() => r)));
        }
        setReservations(list);

        // Laad modificaties voor elke reservering
        const modsEntries = await Promise.all(
          list.map(async (r: any) => {
            try {
              const mods = await api.reservations.modifications(r.id);
              return [r.id, mods || []];
            } catch {
              return [r.id, []];
            }
          })
        );
        setModsMap(Object.fromEntries(modsEntries));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [date, ids]);

  const printedRef = useRef(false);
  useEffect(() => {
    if (!loading && reservations.length > 0 && !printedRef.current) {
      printedRef.current = true;
      setTimeout(() => window.print(), 800);
    }
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
      {reservations.map(r => (
        <div key={r.id} className="print-page">
          <C6Envelope res={r} mods={modsMap[r.id] || []} />
        </div>
      ))}
    </>
  );
}

export default function PrintEnvelopesPage() {
  return (
    <>
      <style suppressHydrationWarning>{`
        @page { size: 162mm 114mm landscape; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; background: white; }

        .print-page {
          width: 162mm; height: 114mm; overflow: hidden;
          display: flex; align-items: center; justify-content: center;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }

        .envelope {
          width: 154mm; height: 106mm;
          display: flex; flex-direction: column;
          border: 0.3mm solid #ccc; background: white; overflow: hidden;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }

        .envelope-top {
          display: flex; flex-direction: row;
          flex: 1; min-height: 0;
        }

        .col { padding: 4mm 5mm; display: flex; flex-direction: column; }
        .col-left  { flex: 0 0 62mm; }
        .col-mid   { flex: 1; }
        .col-right { flex: 0 0 44mm; align-items: center; justify-content: flex-start; text-align: center; }

        .plates { margin-bottom: 2mm; }
        .plate {
          display: inline-flex; align-items: stretch;
          background: #ffffff; border: 2px solid #000; border-radius: 4px;
          font-family: 'Arial Narrow', Arial, sans-serif;
          font-size: 15pt; font-weight: 700; letter-spacing: 2px; color: #000;
          margin-bottom: 1mm; overflow: hidden;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .plate-text { padding: 1mm 3mm 1mm 2mm; display: flex; align-items: center; text-transform: uppercase; min-width: 35mm; min-height: 6.5mm; }
        .car-info { font-size: 6pt; color: #555; margin-top: 0.5mm; margin-bottom: 1mm; line-height: 1.2; }
        .name { font-size: 8.5pt; font-weight: 700; color: #000; margin-top: 1mm; }
        .outbound-time { display: flex; align-items: baseline; gap: 2mm; margin-top: 1.5mm; }
        .ot-label { font-size: 7pt; color: #555; text-transform: uppercase; }
        .ot-time  { font-size: 13pt; font-weight: 900; color: #000; }
        .notes { font-size: 6.5pt; color: #333; margin-top: 2mm; line-height: 1.4; border-top: 0.3mm solid #ddd; padding-top: 1.5mm; }
        .admin-notes { font-size: 6.5pt; color: #000; font-weight: 700; margin-top: 1.5mm; line-height: 1.4; border-top: 0.3mm solid #000; padding-top: 1.5mm; }

        .return-times { display: flex; align-items: baseline; flex-wrap: wrap; gap: 1mm; margin-bottom: 1mm; }
        .return-dep { font-size: 8.5pt; color: #555; }
        .arrow      { font-size: 8.5pt; color: #555; }
        .return-arr { font-size: 13pt; font-weight: 900; color: #000; }
        .destination { font-size: 9.5pt; font-weight: 700; color: #555; margin-bottom: 1.5mm; margin-top: 0.5mm; }
        .payment-status { font-size: 7.5pt; font-weight: 700; border-radius: 3px; padding: 0.8mm 2mm; margin-top: 1.5mm; display: inline-block; border: 1px solid #000; background: white; color: #000; }
        .payment-amount { font-weight: 400; }
        .balance-block { margin-top: 1.5mm; display: inline-block; border: 1.5px solid #000; border-radius: 3px; padding: 1mm 2.5mm; background: white; }
        .balance-label  { font-size: 6pt; font-weight: 900; color: #000; text-transform: uppercase; letter-spacing: 0.5px; }
        .balance-amount { font-size: 14pt; font-weight: 900; color: #000; line-height: 1.15; }

        .option { font-size: 7.5pt; font-weight: 700; color: #000; background: #eee; border-radius: 3px; padding: 0.8mm 2mm; margin-bottom: 1mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .pickup-day     { font-size: 14pt; font-weight: 900; color: #000; line-height: 1; }
        .pickup-dayname { font-size: 8.5pt; font-weight: 700; color: #333; text-transform: capitalize; margin-top: 1mm; }

        .hist-strip {
          flex-shrink: 0;
          border-top: 0.5mm solid #000;
          font-size: 6.5pt;
        }
        .hs-title { font-size: 6pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: #000; padding: 0.8mm 4mm; border-bottom: 0.3mm solid #000; }
        .hs-row { display: grid; grid-template-columns: 22mm 1fr 18mm 14mm; gap: 1.5mm; padding: 0.8mm 4mm; border-bottom: 0.15mm solid #ccc; align-items: baseline; }
        .hs-row:last-of-type { border-bottom: none; }
        .hs-type   { font-weight: 700; color: #000; white-space: nowrap; font-size: 6.5pt; }
        .hs-detail { color: #333; font-size: 6pt; line-height: 1.3; }
        .hs-amt    { font-weight: 700; text-align: right; white-space: nowrap; font-size: 6.5pt; color: #000; }
        .hs-badge  { font-size: 5.5pt; font-weight: 700; border-radius: 2px; padding: 0.2mm 1.5mm; text-align: center; border: 0.3mm solid #555; color: #000; background: white; }
        .hs-due      { font-weight: 900; }
        .hs-paid     { color: #000; }
        .hs-back     { font-weight: 900; }
        .hs-refunded { color: #888; font-style: italic; }
        .hs-zero     { color: #999; }
        .hs-balance { display: flex; justify-content: space-between; align-items: center; padding: 1.5mm 4mm; border-top: 0.5mm solid #000; }
        .hs-bal-label { font-size: 6pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4px; color: #000; }
        .hs-bal-amt   { font-size: 9.5pt; font-weight: 900; color: #000; }

        @media print {
          html, body, #__next { margin: 0; }
          .no-print { display: none !important; }
          .envelope { border: none; }
          .print-page { page-break-after: always; }
          .print-page:last-child { page-break-after: avoid; }
        }
        @media screen {
          body { background: #eee; padding: 10mm; }
          .envelope { box-shadow: 0 2px 12px rgba(0,0,0,0.15); margin-bottom: 8mm; }
          .no-print { margin-bottom: 4mm; }
        }
      `}</style>
      <Suspense fallback={<div style={{ padding: 20 }}>Laden...</div>}>
        <EnvelopesContent />
      </Suspense>
    </>
  );
}
