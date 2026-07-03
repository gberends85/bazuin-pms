'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Printer } from 'lucide-react';

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}
function fmtDateShort(d: string) {
  if (!d) return '—';
  return new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'short',
  });
}
function fmtMoney(v: number) {
  return `€ ${v.toFixed(2).replace('.', ',')}`;
}

export default function PrintFactuurGroepPage({ params }: { params: { id: string } }) {
  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.invoiceGroups.get(params.id)
      .then(setGroup)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    if (group) {
      setTimeout(() => document.title = `Factuur ${group.reference} — Autostalling De Bazuin`, 100);
    }
  }, [group]);

  if (loading) return (
    <div style={{ padding: 40, fontFamily: 'Arial, sans-serif', color: '#555', textAlign: 'center' }}>
      Factuur laden…
    </div>
  );
  if (error) return (
    <div style={{ padding: 40, fontFamily: 'Arial, sans-serif', color: 'red' }}>
      Fout: {error}
    </div>
  );
  if (!group) return (
    <div style={{ padding: 40, fontFamily: 'Arial, sans-serif', color: '#555' }}>
      Factuurgroep niet gevonden
    </div>
  );

  const reservations: any[] = group.reservations || [];
  const total = reservations.reduce((s: number, r: any) => s + parseFloat(r.total_price || 0), 0);
  const totalExcl = Math.round((total / 1.21) * 100) / 100;
  const btwBedrag = Math.round((total - totalExcl) * 100) / 100;
  const today = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  const statusBadge = group.status === 'paid'
    ? <span style={{ display: 'inline-block', padding: '1mm 3mm', borderRadius: 3, fontSize: 9, fontWeight: 700, background: '#e8f5eb', color: '#2a7a3a' }}>Betaald</span>
    : group.status === 'sent'
    ? <span style={{ display: 'inline-block', padding: '1mm 3mm', borderRadius: 3, fontSize: 9, fontWeight: 700, background: '#e8f0fe', color: '#1a4fa0' }}>Verstuurd</span>
    : <span style={{ display: 'inline-block', padding: '1mm 3mm', borderRadius: 3, fontSize: 9, fontWeight: 700, background: '#fff0cc', color: '#8a5f00' }}>Te betalen</span>;

  return (
    <>
      <style>{`
        @page { size: A4; margin: 20mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; background: #eee; }
        @media screen { body { padding: 20mm; } }
        @media print { .no-print { display: none !important; } body { background: white; padding: 0; } }
        .page { background: white; padding: 20mm; max-width: 170mm; margin: 0 auto; box-shadow: 0 2px 16px rgba(0,0,0,0.15); }
        @media print { .page { box-shadow: none; max-width: none; padding: 0; } }
        h1 { font-size: 22pt; font-weight: 900; color: #0a2240; margin-bottom: 2mm; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10mm; }
        .company { font-size: 9pt; color: #555; line-height: 1.6; text-align: right; }
        .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; font-size: 10pt; }
        .meta-table td { padding: 2mm 0; vertical-align: top; }
        .meta-table td:first-child { font-weight: 700; width: 50mm; color: #555; }
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; font-size: 9.5pt; }
        .items-table th { background: #0a2240; color: white; padding: 3mm 4mm; text-align: left; font-size: 9pt; font-weight: 700; }
        .items-table th.num { text-align: right; }
        .items-table td { padding: 3mm 4mm; border-bottom: 0.3mm solid #ddd; vertical-align: middle; }
        .items-table tr:last-child td { border-bottom: none; }
        .items-table .num { text-align: right; white-space: nowrap; }
        .totals { width: 100%; border-collapse: collapse; margin-bottom: 8mm; font-size: 10pt; }
        .totals td { padding: 2mm 0; }
        .totals td:first-child { color: #555; }
        .totals td:last-child { text-align: right; font-weight: 600; }
        .totals .total-row td { font-weight: 900; font-size: 13pt; padding-top: 3mm; border-top: 0.5mm solid #0a2240; }
        .footer { margin-top: 12mm; font-size: 8.5pt; color: #777; border-top: 0.3mm solid #ddd; padding-top: 4mm; line-height: 1.6; }
        .dl-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; padding: 10px 14px; background: #f4f7fb; border-radius: 8px; border: 1px solid #dde4ef; }
        .dl-btn { background: #0a2240; color: white; border: none; border-radius: 6px; padding: 9px 20px; cursor: pointer; font-size: 13px; font-weight: 700; }
        .dl-btn:hover { background: #1a3a60; }
      `}</style>

      <div className="page">
        {/* Actiebalk — niet afgedrukt */}
        <div className="no-print dl-bar">
          <button className="dl-btn" onClick={() => window.print()}><><Printer size={15} style={{ display:'inline', verticalAlign:'middle', marginRight:6 }} />Afdrukken / Opslaan als PDF</></button>
          <span style={{ fontSize: 12, color: '#7090b0' }}>Kies "Opslaan als PDF" in het afdrukdialoog om te downloaden.</span>
        </div>

        {/* Header */}
        <div className="header">
          <div>
            <img src="/logo.png" style={{ height: 56, width: 'auto', marginBottom: 4 }} alt="Autostalling De Bazuin" />
            <h1>Factuur</h1>
            <div style={{ fontSize: 12, color: '#7090b0', marginTop: 1 }}>{group.reference}</div>
          </div>
          <div className="company">
            <strong style={{ fontSize: 11, color: '#0a2240' }}>Autostalling De Bazuin</strong><br />
            Zeilmakersstraat 2<br />
            8861SE Harlingen<br />
            info@parkeren-harlingen.nl
          </div>
        </div>

        {/* Factuurgegevens */}
        <table className="meta-table">
          <tbody>
            <tr>
              <td>Factureren aan</td>
              <td>
                {group.billing_company && <strong>{group.billing_company}<br /></strong>}
                <strong>{group.billing_name}</strong>
                {group.billing_address && <><br />{group.billing_address}</>}
                {group.billing_postal_code && <><br />{group.billing_postal_code} {group.billing_city}</>}
                {group.billing_email && <><br /><span style={{ color: '#0a7c6e' }}>{group.billing_email}</span></>}
                {group.billing_vat_number && <><br /><span style={{ color: '#7090b0', fontSize: 9 }}>BTW: {group.billing_vat_number}</span></>}
              </td>
            </tr>
            <tr><td style={{ paddingTop: '4mm' }}>Factuurdatum</td><td style={{ paddingTop: '4mm' }}>{today}</td></tr>
            <tr><td>Factuurnummer</td><td>{group.reference}</td></tr>
            <tr><td>Status</td><td>{statusBadge}</td></tr>
            {group.notes && <tr><td>Omschrijving</td><td style={{ fontStyle: 'italic', color: '#555' }}>{group.notes}</td></tr>}
          </tbody>
        </table>

        {/* Boekingsregels */}
        <table className="items-table">
          <thead>
            <tr>
              <th>Naam</th>
              <th>Kenteken</th>
              <th>Periode</th>
              <th className="num">Dagen</th>
              <th className="num">Bedrag</th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((r: any, i: number) => {
              const nights = r.nights ?? 0;
              const days = nights + 1;
              const ferryOut = r.ferry_outbound_time ? r.ferry_outbound_time.slice(0, 5) : null;
              const ferryRet = r.ferry_return_time ? r.ferry_return_time.slice(0, 5) : null;
              const ferryLine = ferryOut || ferryRet
                ? [
                    ferryOut ? `↗ heen ${ferryOut}` : null,
                    ferryRet ? `↙ terug ${ferryRet}` : null,
                  ].filter(Boolean).join('  ·  ')
                : null;
              const evKwh = parseFloat(r.ev_kwh_total || 0);
              const evCost = parseFloat(r.ev_price_total || 0);
              return (
                <tr key={r.id || i}>
                  <td style={{ fontWeight: 600 }}>
                    {r.first_name} {r.last_name}
                    {ferryLine && <div style={{ fontWeight: 400, fontSize: '7.5pt', color: '#7090b0', marginTop: 1 }}>{ferryLine}</div>}
                    {evKwh > 0 && (
                      <div style={{ fontWeight: 400, fontSize: '7.5pt', color: '#0a7c6e', marginTop: 1 }}>
                        ⚡ Laden: {String(evKwh).replace('.', ',')} kWh · {fmtMoney(evCost)}
                        <span style={{ color: '#9aa8b8' }}> (incl. in bedrag)</span>
                      </div>
                    )}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '9pt', color: '#556070' }}>
                    {r.plates || 'Onbekend'}
                  </td>
                  <td style={{ color: '#556070', whiteSpace: 'nowrap' }}>
                    {fmtDateShort(r.arrival_date)} – {fmtDateShort(r.departure_date)}
                  </td>
                  <td className="num">{days}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(parseFloat(r.total_price))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totalen */}
        <table className="totals" style={{ minWidth: 260, maxWidth: 320, marginLeft: 'auto' }}>
          <tbody>
            <tr>
              <td>Subtotaal (excl. BTW)</td>
              <td>{fmtMoney(totalExcl)}</td>
            </tr>
            <tr>
              <td>BTW 21%</td>
              <td>{fmtMoney(btwBedrag)}</td>
            </tr>
            <tr className="total-row">
              <td>Totaal incl. BTW</td>
              <td>{fmtMoney(total)}</td>
            </tr>
          </tbody>
        </table>

        {/* Betaalinstructies */}
        {group.status !== 'paid' && (
          <div style={{ background: '#f4f7fb', border: '0.3mm solid #cdd8e8', borderRadius: 4, padding: '4mm 5mm', marginTop: '4mm', fontSize: '9.5pt' }}>
            <strong style={{ color: '#0a2240' }}>Betalingsinstructies</strong><br />
            Gelieve het bedrag van <strong>{fmtMoney(total)}</strong> over te maken naar:<br />
            IBAN: NL81 ABNA 0108 0879 48 · t.n.v. Autostalling De Bazuin · o.v.v. <strong>{group.reference}</strong>
          </div>
        )}

        {/* Footer */}
        <div className="footer">
          Autostalling De Bazuin · Zeilmakersstraat 2 · 8861SE Harlingen · info@parkeren-harlingen.nl · KVK: 51258692 · BTW: NL863463319B01 · IBAN: NL81 ABNA 0108 0879 48
        </div>
      </div>
    </>
  );
}
