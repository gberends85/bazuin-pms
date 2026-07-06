'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatPlate } from '@/lib/plate';
import { PrinterIcon } from '@heroicons/react/24/outline';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateOnly(iso: string) { return String(iso).slice(0, 10); }
function fmtDayNum(iso: string)  { return new Date(toDateOnly(iso) + 'T12:00:00').getDate(); }
function fmtMonth(iso: string)   { return new Date(toDateOnly(iso) + 'T12:00:00').getMonth() + 1; }
function fmtDayName(iso: string) { return new Date(toDateOnly(iso) + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long' }); }
function fmtShort(iso: string)   { return new Date(toDateOnly(iso) + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }); }
function eur(n: number)          { return '€ ' + n.toFixed(2).replace('.', ','); }

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

// ─── Envelope ────────────────────────────────────────────────────────────────

function C6Envelope({ res, mods }: { res: any; mods: any[] }) {
  const vehicles: any[] = res.vehicles || (res.plates || '').split(', ').filter(Boolean).map((p: string) => ({ license_plate: p }));
  const evVehicles = vehicles.filter((v: any) => v.ev_kwh || v.ev_service_id);

  // Openstaande bijbetaling
  const pendingMod = mods.find(m => m.status === 'pending_payment');
  const pendingAmt = pendingMod
    ? Math.round((parseFloat(pendingMod.price_difference || '0') + parseFloat(pendingMod.modification_fee || '0')) * 100) / 100
    : 0;

  // ── History (alleen als er modificaties zijn) ──
  // Sorteer chronologisch — eerste mod bevat de ORIGINELE datums en prijs
  const hasMods = mods.length > 0;
  const sortedMods = [...mods].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const firstMod = sortedMods[0];

  // Originele aankomst-/vertrekdatum = de 'old' datums vóór de eerste wijziging
  const origArrival   = firstMod?.old_arrival_date   || res.arrival_date;
  const origDeparture = firstMod?.old_departure_date || res.departure_date;

  // Originele prijs = huidige prijs min de som van ALLE price_differences.
  // De backend werkt total_price direct bij bij het aanmaken van een mod
  // (ook pending_payment), dus we moeten alle mods meenemen om terug te rekenen.
  const allDelta = mods.reduce((s, m) => s + parseFloat(m.price_difference || '0'), 0);
  const origPrice = Number(res.total_price) - allDelta;

  // Eindbalans: als de originele boeking nog niet betaald is → volledig totaal tonen.
  // Alleen bij al-betaalde boekingen met een openstaande bijbetaling → delta tonen.
  const originalUnpaid = res.payment_status === 'pending' || res.payment_status === 'on_site';
  let balanceDue = 0;
  for (const mod of mods) {
    if (mod.status !== 'pending_payment') continue;
    const diff = parseFloat(mod.price_difference || '0');
    const fee  = parseFloat(mod.modification_fee  || '0');
    if (diff > 0) balanceDue += diff + fee;
  }
  const netBalance = originalUnpaid ? Number(res.total_price) : balanceDue;

  // Beschrijving van eventuele toeslagen, zodat op de envelop herleidbaar is
  // waarom het bedrag hoger is (overboeking + ter plekke betalen).
  const surchargeParts: string[] = [];
  if (Number(res.overbooking_surcharge) > 0) surchargeParts.push(`${eur(Number(res.overbooking_surcharge))} overboeking`);
  if (Number(res.on_site_surcharge) > 0) surchargeParts.push(`${eur(Number(res.on_site_surcharge))} ter plekke`);
  const surchargeNote = surchargeParts.length ? `incl. ${surchargeParts.join(' + ')}` : '';

  return (
    <div className="envelope">
      {/* ═══ HOOFD-RIJEN (3 kolommen) ═══ */}
      <div className="envelope-top">

        {/* LINKER KOLOM */}
        <div className="col col-left">
          <div className="plates">
            {vehicles.map((v: any, idx: number) => (
              <div key={v.license_plate || `empty-${idx}`}>
                <div className="plate">
                  <span className="plate-eu" />
                  <span className="plate-text">{v.license_plate ? formatPlate(v.license_plate) : ''}</span>
                </div>
                {carInfoLine(v) && <div className="car-info">{carInfoLine(v)}</div>}
              </div>
            ))}
          </div>
          {res.ferry_outbound_time && (
            <div className="outbound-time">
              <span className="ot-label">{fmtDayNum(res.arrival_date)}-{fmtMonth(res.arrival_date)}</span>
              <span className="ot-time">{res.ferry_outbound_time}</span>
            </div>
          )}
          <div className="name">{res.first_name} {res.last_name}</div>
          {res.notes && <div className="notes">{res.notes}</div>}
          {res.admin_notes && <div className="admin-notes">📋 {res.admin_notes}</div>}
        </div>

        {/* MIDDEN KOLOM */}
        <div className="col col-mid">
          <div className="return-times">
            {res.ferry_return_time && <span className="return-dep">{res.ferry_return_time}</span>}
            {res.ferry_return_time && res.ferry_return_arrival_harlingen && <span className="arrow"> → </span>}
            {res.ferry_return_arrival_harlingen && <span className="return-arr">{res.ferry_return_arrival_harlingen}</span>}
            {!res.ferry_return_time && !res.ferry_return_arrival_harlingen && res.ferry_return_custom_time &&
              <span className="return-arr">{res.ferry_return_custom_time}</span>}
          </div>
          <div className="destination">
            {res.ferry_outbound_destination === 'terschelling' ? 'Terschelling' :
             res.ferry_outbound_destination === 'vlieland'     ? 'Vlieland' :
             res.ferry_outbound_destination === 'anders'       ? 'Anders' :
             res.ferry_outbound_destination || '—'}
          </div>

          {/* Betaalstatus / balans */}
          {(res.payment_status === 'on_site' || res.payment_status === 'pending') ? (
            // Nog niet betaald (ter plekke of open): toon volledig openstaand bedrag prominent
            <div className="balance-block">
              <div className="balance-label">nog te betalen</div>
              <div className="balance-amount">{eur(Number(res.total_price))}</div>
              {surchargeNote && <div className="balance-note">{surchargeNote}</div>}
            </div>
          ) : pendingMod && pendingAmt > 0 ? (
            <div className="balance-block">
              <div className="balance-label">⚠ bijbetalen</div>
              <div className="balance-amount">{eur(pendingAmt)}</div>
              {surchargeNote && <div className="balance-note">{surchargeNote}</div>}
            </div>
          ) : (() => {
            // partial_refund = wél betaald (alleen deels terug volgens beleid) → toon "Betaald".
            const paidLike = res.payment_status === 'paid' || res.payment_status === 'partial_refund';
            return (
              <div className={`payment-status payment-${paidLike ? 'paid' : res.payment_status}`}>
                {paidLike                               ? 'Betaald' :
                 res.payment_status === 'invoiced'      ? 'Op factuur' :
                 res.payment_status === 'pending'       ? 'Nog te betalen' :
                 res.payment_status === 'refunded'      ? 'Terugbetaald' :
                 res.payment_status || '—'}
                {!paidLike && res.payment_status !== 'invoiced' && res.total_price != null && (
                  <span className="payment-amount"> · {eur(Number(res.total_price))}</span>
                )}
              </div>
            );
          })()}
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

      {/* ═══ HISTORY STRIP (alleen bij wijzigingen) ═══ */}
      {hasMods && (
        <div className="hist-strip">
          {/* Titelbalk */}
          <div className="hs-title">Betaalhistorie</div>

          {/* Originele boeking */}
          <div className="hs-row hs-origin">
            <span className="hs-type">Boeking</span>
            <span className="hs-detail">{fmtShort(origArrival)} – {fmtShort(origDeparture)}</span>
            <span className="hs-amt">{eur(origPrice)}</span>
            <span className={`hs-badge hs-badge-${res.payment_status}`}>
              {res.payment_status === 'paid'          ? 'betaald' :
               res.payment_status === 'on_site'       ? 'ter plekke' :
               res.payment_status === 'invoiced'      ? 'factuur' :
               res.payment_status === 'refunded'      ? 'terugbetaald' :
               res.payment_status === 'partial_refund'? 'deels terug' :
               'open'}
            </span>
          </div>

          {/* Wijzigingsrijen */}
          {sortedMods.map((mod: any) => {
            const diff = parseFloat(mod.price_difference || '0');
            const fee  = parseFloat(mod.modification_fee  || '0');
            const extraAmt = Math.round((Math.abs(diff) + (diff > 0 ? fee : 0)) * 100) / 100;
            // Werkelijke restitutie = prijsverschil × restitutie% (annuleringsbeleid).
            // Zonder vastgelegd percentage tonen we het volledige verschil.
            const refundPct = (mod.cancellation_refund_pct !== null && mod.cancellation_refund_pct !== undefined && mod.cancellation_refund_pct !== '')
              ? parseFloat(mod.cancellation_refund_pct) : null;
            const refundShown = refundPct !== null
              ? Math.round(Math.abs(diff) * (refundPct / 100) * 100) / 100
              : Math.abs(diff);
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
                  {diff < 0 && mod.status === 'completed'       && <span className="hs-refunded">−{eur(refundShown)}</span>}
                  {diff < 0 && mod.status !== 'completed'       && <span className="hs-back">−{eur(Math.max(0, refundShown - fee))}</span>}
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

          {/* Eindbalans */}
          <div className="hs-balance">
            <span className="hs-bal-label">Eindbalans</span>
            <span className={`hs-bal-amt ${res.payment_status === 'on_site' || netBalance > 0 ? 'hba-due' : netBalance < 0 ? 'hba-back' : 'hba-ok'}`}>
              {res.payment_status === 'on_site'
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PrintEnvelopePage({ params }: { params: { id: string } }) {
  const [res, setRes]   = useState<any>(null);
  const [mods, setMods] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.reservations.get(params.id),
      api.reservations.modifications(params.id),
    ])
      .then(([resData, modsData]) => {
        setRes(resData);
        setMods(modsData || []);
        const isAutoClose = new URLSearchParams(window.location.search).get('autoclose') === '1';
        if (isAutoClose) {
          window.addEventListener('afterprint', () => window.close(), { once: true });
        }
        setTimeout(() => window.print(), 600);
      })
      .catch(e => setError(e.message));
  }, [params.id]);

  return (
    <>
      <style suppressHydrationWarning>{`
        /* ── Pagina-formaat: C6 landscape, alles op 1 vel ── */
        @page { size: 162mm 114mm landscape; margin: 0; }
        @media print {
          @page { size: 162mm 114mm landscape; margin: 0; }
          html, body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; background: white; }

        /* ── Outer wrapper ── */
        .print-wrap {
          width: 162mm;
          height: 114mm;
          display: flex;
          align-items: center;
          justify-content: center;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* ── Envelope box: column-flex zodat history-strip onderaan past ── */
        .envelope {
          width: 154mm;
          height: 106mm;
          display: flex;
          flex-direction: column;
          border: 0.3mm solid #ccc;
          background: white;
          overflow: hidden;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @media print { .envelope { border: none; } }

        /* Top: de drie kolommen */
        .envelope-top {
          display: flex;
          flex-direction: row;
          flex: 1;
          min-height: 0;
        }

        .col { padding: 4mm 5mm; display: flex; flex-direction: column; }
        .col-left  { flex: 0 0 62mm; }
        .col-mid   { flex: 1; }
        .col-right { flex: 0 0 44mm; align-items: center; justify-content: flex-start; text-align: center; }

        /* Linker kolom */
        .plates { margin-bottom: 2mm; }
        .plate {
          display: inline-flex; align-items: stretch;
          background: #e8e8e8; border: 2px solid #999; border-radius: 4px;
          font-family: 'Arial Narrow', Arial, sans-serif;
          font-size: 15pt; font-weight: 700; letter-spacing: 2px; color: #111;
          margin-bottom: 1mm; overflow: hidden;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .plate-eu { display: block; width: 7pt; background: #555; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .plate-text { padding: 1mm 3mm 1mm 2mm; display: flex; align-items: center; text-transform: uppercase; min-width: 35mm; min-height: 6.5mm; }
        .car-info { font-size: 6pt; color: #555; margin-top: 0.5mm; margin-bottom: 1mm; line-height: 1.2; }
        .name { font-size: 8.5pt; font-weight: 700; color: #000; margin-top: 1mm; }
        .outbound-time { display: flex; align-items: baseline; gap: 2mm; margin-top: 1.5mm; }
        .ot-label { font-size: 7pt; color: #555; text-transform: uppercase; }
        .ot-time  { font-size: 13pt; font-weight: 900; color: #000; }
        .notes { font-size: 6.5pt; color: #333; margin-top: 2mm; line-height: 1.4; border-top: 0.3mm solid #ddd; padding-top: 1.5mm; }
        .admin-notes { font-size: 6.5pt; color: #000; font-weight: 700; margin-top: 1.5mm; line-height: 1.4; border-top: 0.3mm solid #000; padding-top: 1.5mm; }

        /* Midden kolom */
        .return-times { display: flex; align-items: baseline; flex-wrap: wrap; gap: 1mm; margin-bottom: 1mm; }
        .return-dep { font-size: 8.5pt; color: #555; }
        .arrow      { font-size: 8.5pt; color: #555; }
        .return-arr { font-size: 13pt; font-weight: 900; color: #000; }
        .destination { font-size: 9.5pt; font-weight: 700; color: #555; margin-bottom: 1.5mm; margin-top: 0.5mm; }
        .payment-status { font-size: 7.5pt; font-weight: 700; border-radius: 3px; padding: 0.8mm 2mm; margin-top: 1.5mm; display: inline-block; border: 1px solid #000; background: white; color: #000; }
        .payment-amount { font-weight: 400; }
        .balance-block {
          margin-top: 1.5mm; display: inline-block;
          border: 1.5px solid #000; border-radius: 3px; padding: 1mm 2.5mm;
          background: white;
        }
        .balance-label  { font-size: 6pt; font-weight: 900; color: #000; text-transform: uppercase; letter-spacing: 0.5px; }
        .balance-amount { font-size: 14pt; font-weight: 900; color: #000; line-height: 1.15; }
        .balance-note   { font-size: 6pt; font-weight: 700; color: #000; margin-top: 0.5mm; }

        /* Rechter kolom */
        .option { font-size: 7.5pt; font-weight: 700; color: #000; background: #eee; border-radius: 3px; padding: 0.8mm 2mm; margin-bottom: 1mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .pickup-day     { font-size: 14pt; font-weight: 900; color: #000; line-height: 1; }
        .pickup-dayname { font-size: 8.5pt; font-weight: 700; color: #333; text-transform: capitalize; margin-top: 1mm; }

        /* ── History strip (onderin de envelop) — zwart/wit ── */
        .hist-strip {
          flex-shrink: 0;
          border-top: 0.5mm solid #000;
          font-size: 6.5pt;
        }
        .hs-title {
          font-size: 6pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px;
          color: #000; padding: 0.8mm 4mm;
          border-bottom: 0.3mm solid #000;
        }
        .hs-row {
          display: grid;
          grid-template-columns: 22mm 1fr 18mm 14mm;
          gap: 1.5mm;
          padding: 0.8mm 4mm;
          border-bottom: 0.15mm solid #ccc;
          align-items: baseline;
        }
        .hs-row:last-of-type { border-bottom: none; }
        .hs-type   { font-weight: 700; color: #000; white-space: nowrap; font-size: 6.5pt; }
        .hs-detail { color: #333; font-size: 6pt; line-height: 1.3; }
        .hs-amt    { font-weight: 700; text-align: right; white-space: nowrap; font-size: 6.5pt; color: #000; }
        .hs-badge  { font-size: 5.5pt; font-weight: 700; border-radius: 2px; padding: 0.2mm 1.5mm; text-align: center;
                     border: 0.3mm solid #555; color: #000; background: white; }
        .hs-due      { font-weight: 900; }
        .hs-paid     { color: #000; }
        .hs-back     { font-weight: 900; }
        .hs-refunded { color: #888; font-style: italic; }
        .hs-zero     { color: #999; }

        /* Eindbalans — zwart/wit */
        .hs-balance {
          display: flex; justify-content: space-between; align-items: center;
          padding: 1.5mm 4mm;
          border-top: 0.5mm solid #000;
        }
        .hs-bal-label { font-size: 6pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4px; color: #000; }
        .hs-bal-amt   { font-size: 9.5pt; font-weight: 900; color: #000; }
        .hba-due  { font-weight: 900; }
        .hba-back { }
        .hba-ok   { }

        /* Screen only */
        @media screen {
          body { background: #ddd; padding: 8mm; }
          .envelope { box-shadow: 0 2px 16px rgba(0,0,0,0.18); }
          .no-print { margin-bottom: 5mm; }
        }
      `}</style>

      {error   && <div style={{ padding: 20, color: 'red' }}>{error}</div>}
      {!res && !error && <div style={{ padding: 20, color: '#999' }}>Laden…</div>}
      {res && (
        <>
          <div className="no-print" style={{ fontFamily: 'sans-serif', fontSize: 12, color: '#555' }}>
            C6 envelop — {res.first_name} {res.last_name} ·{' '}
            <button onClick={() => window.print()} style={{ cursor: 'pointer', background: '#0a2240', color: 'white', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <PrinterIcon className="w-4 h-4" />Afdrukken
            </button>
          </div>
          <div className="print-wrap">
            <C6Envelope res={res} mods={mods} />
          </div>
        </>
      )}
    </>
  );
}
