'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { formatPlate } from '@/lib/plate';
import {
  ClipboardDocumentListIcon, XCircleIcon, BanknotesIcon,
  CurrencyEuroIcon, PencilSquareIcon,
} from '@heroicons/react/24/outline';

const eur = (v: any) => `€ ${parseFloat(v || 0).toFixed(2).replace('.', ',')}`;
const tijd = (v: any) => v ? new Date(v).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '';
const dag = (v: any) => v ? new Date(String(v).slice(0, 10) + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '';
const iso = (d: Date) => d.toISOString().slice(0, 10);

function verschuif(d: string, dagen: number) {
  const x = new Date(d + 'T12:00:00');
  x.setDate(x.getDate() + dagen);
  return iso(x);
}

const TYPE_LABELS: Record<string, string> = {
  dates: 'Datums', checkedin_departure: 'Vertrekdatum', ferry: 'Boottijden',
  plate: 'Kenteken', charging: 'Laden', contact: 'Contactgegevens', email: 'E-mailadres',
};
const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'wacht op betaling', pending_review: 'ter beoordeling',
  pending_email_verify: 'e-mail bevestigen', rejected: 'afgewezen', abandoned: 'afgebroken',
};

// Beschrijft per wijziging wát er veranderde — zelfde aanpak als de
// wijzigingshistorie op de reserveringspagina.
function omschrijfWijziging(m: any): string {
  let d: any = {};
  try {
    d = m.change_details
      ? (typeof m.change_details === 'string' ? JSON.parse(m.change_details) : m.change_details)
      : {};
  } catch { d = {}; }
  const t = m.modification_type || 'dates';
  const tijdje = (v: any) => v ? String(v).slice(0, 5) : '';

  if (t === 'ferry') {
    const rows: string[] = [];
    const o1 = tijdje(d.currentOutboundTime), o2 = tijdje(d.newOutboundTime);
    const r1 = tijdje(d.currentReturnTime), r2 = tijdje(d.newReturnTime);
    const h1 = tijdje(d.currentReturnArrivalHarlingen), h2 = tijdje(d.newReturnArrivalHarlingen);
    if (o2 && o2 !== o1) rows.push(`Heenreis ${o1 || '—'} → ${o2}`);
    if (r2 && r2 !== r1) rows.push(`Terugreis ${r1 || '—'} → ${r2}`);
    if (h2 && h2 !== h1) rows.push(`Aankomst Harlingen ${h1 || '—'} → ${h2}`);
    return rows.length ? rows.join(' · ') : 'Boottijden bijgewerkt';
  }
  if (t === 'plate') {
    const vs = Array.isArray(d.vehicles) ? d.vehicles : [];
    return vs.length
      ? vs.map((v: any) => `${String(v.oldPlate || '—').toUpperCase()} → ${String(v.newPlate || '').toUpperCase()}`).join(' · ')
      : 'Kenteken bijgewerkt';
  }
  if (t === 'contact' || t === 'email') {
    const rows: string[] = [];
    if (d.newEmail) rows.push(`${d.oldEmail || '—'} → ${d.newEmail}`);
    if (d.newPhone) rows.push(`${d.oldPhone || '—'} → ${d.newPhone}`);
    return rows.length ? rows.join(' · ') : 'Contactgegevens bijgewerkt';
  }
  if (t === 'charging') {
    const vs = Array.isArray(d.vehicles) ? d.vehicles : [];
    const kwh = vs.map((v: any) => v.evKwh).filter(Boolean);
    return kwh.length ? `Laden: ${kwh.join(', ')} kWh` : 'Laadpakket gewijzigd';
  }
  return `${dag(m.old_arrival_date)} – ${dag(m.old_departure_date)} → ${dag(m.new_arrival_date)} – ${dag(m.new_departure_date)}`;
}

const Plaat = ({ p }: { p: string }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'stretch', borderRadius: 3, border: '1.5px solid #999',
    overflow: 'hidden', background: '#f5c518', fontFamily: "'Arial Narrow',Arial,sans-serif",
    fontWeight: 800, fontSize: 12, letterSpacing: 1,
  }}>
    <span style={{ width: 6, background: '#003399', flexShrink: 0 }} />
    <span style={{ padding: '1px 5px', color: '#000', textTransform: 'uppercase' }}>{formatPlate(p)}</span>
  </span>
);

export default function DagoverzichtPage() {
  const [datum, setDatum] = useState(iso(new Date()));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string>('reserveringen');

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try { setData(await api.reports.daily(d)); }
    catch (e: any) { toastError(e?.message || 'Laden mislukt'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(datum); }, [datum, load]);

  const isVandaag = datum === iso(new Date());

  const tegels = data ? [
    {
      key: 'reserveringen', label: 'Nieuwe reserveringen', icon: <ClipboardDocumentListIcon className="w-5 h-5" />,
      waarde: String(data.reserveringen.aantal), sub: eur(data.reserveringen.omzet) + ' aan boekingen', kleur: '#19499e',
    },
    {
      key: 'annuleringen', label: 'Annuleringen', icon: <XCircleIcon className="w-5 h-5" />,
      waarde: String(data.annuleringen.aantal),
      sub: data.annuleringen.aantal ? `${eur(data.annuleringen.waarde)} · ${eur(data.annuleringen.terugbetaald)} terug` : '—',
      kleur: '#c83232',
    },
    {
      key: 'boekomzet', label: 'Omzet nieuwe boekingen', icon: <ClipboardDocumentListIcon className="w-5 h-5" />,
      waarde: eur(data.reserveringen.omzet), sub: `${data.reserveringen.aantal} reservering(en)`, kleur: '#0a7c6e',
    },
    {
      key: 'omzet', label: 'Ontvangen op deze dag', icon: <BanknotesIcon className="w-5 h-5" />,
      waarde: eur(data.omzet.totaal), sub: `${data.omzet.rows.length} betaling(en)`, kleur: '#0a7c6e',
    },
    {
      key: 'wijzigingen', label: 'Wijzigingen', icon: <PencilSquareIcon className="w-5 h-5" />,
      waarde: String(data.wijzigingen.aantal),
      sub: data.wijzigingen.afgebroken ? `+ ${data.wijzigingen.afgebroken} afgebroken` : '—', kleur: '#a06010',
    },
  ] : [];

  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid rgba(10,34,64,0.1)', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '9px 10px', fontSize: 13, color: '#0a2240', borderBottom: '0.5px solid rgba(10,34,64,0.06)', verticalAlign: 'middle' };
  const ref: React.CSSProperties = { ...td, fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' };
  const leeg = (t: string) => <div style={{ padding: '22px 4px', color: '#9ab0c8', fontSize: 13 }}>{t}</div>;

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 1150 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Dagoverzicht</h1>
        <p style={{ margin: '0 0 18px', fontSize: 12.5, color: '#7090b0' }}>
          Wat er op één dag is gebeurd. Klik op een tegel voor de details.
        </p>

        {/* Datumkiezer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setDatum(d => verschuif(d, -1))}>← Vorige</button>
          <input type="date" value={datum} onChange={e => e.target.value && setDatum(e.target.value)}
            style={{ padding: '8px 11px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#0a2240' }} />
          <button className="btn btn-ghost btn-sm" onClick={() => setDatum(d => verschuif(d, 1))}>Volgende →</button>
          {!isVandaag && (
            <button className="btn btn-ghost btn-sm" style={{ color: '#0a7c6e' }} onClick={() => setDatum(iso(new Date()))}>Vandaag</button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 13, color: '#7090b0', textTransform: 'capitalize' }}>
            {new Date(datum + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>

        {loading && <div style={{ color: '#7090b0', padding: 20 }}>Laden…</div>}

        {!loading && data && (
          <>
            {/* Tegels */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 22 }}>
              {tegels.map(t => {
                const actief = open === t.key;
                return (
                  <button key={t.key} onClick={() => setOpen(t.key)}
                    style={{
                      textAlign: 'left', background: 'white', cursor: 'pointer',
                      border: actief ? `1.5px solid ${t.kleur}` : '0.5px solid rgba(10,34,64,0.12)',
                      borderRadius: 11, padding: '13px 15px',
                      boxShadow: actief ? `0 2px 10px ${t.kleur}22` : 'none',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.kleur, marginBottom: 7 }}>
                      {t.icon}
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t.label}</span>
                    </div>
                    <div style={{ fontSize: 25, fontWeight: 900, color: '#0a2240', lineHeight: 1.1 }}>{t.waarde}</div>
                    <div style={{ fontSize: 11.5, color: '#7090b0', marginTop: 3 }}>{t.sub}</div>
                  </button>
                );
              })}
            </div>

            {/* Details */}
            <div className="card" style={{ padding: '16px 20px' }}>
              {/* Nieuwe reserveringen + omzet nieuwe boekingen delen dezelfde lijst */}
              {(open === 'reserveringen' || open === 'boekomzet') && (
                <>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', marginBottom: 12 }}>
                    Nieuwe reserveringen ({data.reserveringen.aantal}) — samen {eur(data.reserveringen.omzet)}
                  </div>
                  {data.reserveringen.rows.length === 0 ? leeg('Deze dag zijn er geen reserveringen gemaakt.') : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                        <thead><tr>
                          <th style={th}>Tijd</th><th style={th}>Referentie</th><th style={th}>Klant</th>
                          <th style={th}>Kenteken</th><th style={th}>Verblijf</th><th style={th}>Betaling</th>
                          <th style={{ ...th, textAlign: 'right' }}>Bedrag</th>
                        </tr></thead>
                        <tbody>
                          {data.reserveringen.rows.map((r: any) => (
                            <tr key={r.id}>
                              <td style={td}>{tijd(r.created_at)}</td>
                              <td style={ref}>
                                <Link href={`/reservations/${r.id}?from=/dagoverzicht`} style={{ color: '#19499e', textDecoration: 'none' }}>{r.reference}</Link>
                              </td>
                              <td style={td}>{r.klant}</td>
                              <td style={td}>{r.kentekens ? r.kentekens.split(',').map((p: string) => <Plaat key={p} p={p.trim()} />) : '—'}</td>
                              <td style={{ ...td, whiteSpace: 'nowrap', color: '#5a6b80' }}>{dag(r.arrival_date)} – {dag(r.departure_date)}</td>
                              <td style={{ ...td, color: '#5a6b80' }}>
                                {r.payment_method || '—'}
                                {r.payment_status !== 'paid' && <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, color: '#a06010', background: '#fff4e5', padding: '1px 5px', borderRadius: 4 }}>open</span>}
                              </td>
                              <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{eur(r.total_price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {open === 'annuleringen' && (
                <>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', marginBottom: 12 }}>
                    Annuleringen ({data.annuleringen.aantal})
                    {data.annuleringen.aantal > 0 && <> — {eur(data.annuleringen.waarde)} geannuleerd, {eur(data.annuleringen.terugbetaald)} terugbetaald</>}
                  </div>
                  {data.annuleringen.rows.length === 0 ? leeg('Deze dag zijn er geen annuleringen.') : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                        <thead><tr>
                          <th style={th}>Tijd</th><th style={th}>Referentie</th><th style={th}>Klant</th>
                          <th style={th}>Kenteken</th><th style={th}>Verblijf</th>
                          <th style={{ ...th, textAlign: 'right' }}>Bedrag</th>
                          <th style={{ ...th, textAlign: 'right' }}>Terugbetaald</th>
                        </tr></thead>
                        <tbody>
                          {data.annuleringen.rows.map((r: any) => (
                            <tr key={r.id}>
                              <td style={td}>{tijd(r.cancelled_at)}</td>
                              <td style={ref}>
                                <Link href={`/reservations/${r.id}?from=/dagoverzicht`} style={{ color: '#19499e', textDecoration: 'none' }}>{r.reference}</Link>
                              </td>
                              <td style={td}>{r.klant}</td>
                              <td style={td}>{r.kentekens ? r.kentekens.split(',').map((p: string) => <Plaat key={p} p={p.trim()} />) : '—'}</td>
                              <td style={{ ...td, whiteSpace: 'nowrap', color: '#5a6b80' }}>{dag(r.arrival_date)} – {dag(r.departure_date)}</td>
                              <td style={{ ...td, textAlign: 'right' }}>{eur(r.total_price)}</td>
                              <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: parseFloat(r.refund_amount) > 0 ? '#c83232' : '#9ab0c8' }}>{eur(r.refund_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {open === 'omzet' && (
                <>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', marginBottom: 4 }}>
                    Ontvangen op deze dag — {eur(data.omzet.totaal)}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#7090b0', marginBottom: 12 }}>
                    Pin, contant en tikkie op het moment van afrekenen; online betalingen op het moment van boeken.
                  </div>
                  {data.omzet.perMethode.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                      {data.omzet.perMethode.map((m: any) => (
                        <div key={m.payment_method || 'onbekend'} style={{ background: '#f4f6f9', borderRadius: 8, padding: '7px 11px' }}>
                          <div style={{ fontSize: 10.5, color: '#7090b0', fontWeight: 700, textTransform: 'uppercase' }}>{m.payment_method || 'onbekend'}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#0a2240' }}>{eur(m.bedrag)}</div>
                          <div style={{ fontSize: 10.5, color: '#7090b0' }}>{m.aantal}×</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {data.omzet.rows.length === 0 ? leeg('Deze dag is er geen omzet ontvangen.') : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                        <thead><tr>
                          <th style={th}>Tijd</th><th style={th}>Referentie</th><th style={th}>Klant</th>
                          <th style={th}>Methode</th><th style={th}>Verblijf</th>
                          <th style={{ ...th, textAlign: 'right' }}>Bedrag</th>
                        </tr></thead>
                        <tbody>
                          {data.omzet.rows.map((r: any) => (
                            <tr key={r.id}>
                              <td style={td}>{tijd(r.betaald_op)}</td>
                              <td style={ref}>
                                <Link href={`/reservations/${r.id}?from=/dagoverzicht`} style={{ color: '#19499e', textDecoration: 'none' }}>{r.reference}</Link>
                              </td>
                              <td style={td}>{r.klant}</td>
                              <td style={{ ...td, color: '#5a6b80' }}>{r.payment_method || '—'}</td>
                              <td style={{ ...td, whiteSpace: 'nowrap', color: '#5a6b80' }}>{dag(r.arrival_date)} – {dag(r.departure_date)}</td>
                              <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{eur(r.total_price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {open === 'wijzigingen' && (
                <>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', marginBottom: 12 }}>
                    Wijzigingen ({data.wijzigingen.aantal})
                    {data.wijzigingen.afgebroken > 0 && <span style={{ fontWeight: 400, color: '#7090b0' }}> · {data.wijzigingen.afgebroken} afgebroken betaalpoging(en)</span>}
                  </div>
                  {data.wijzigingen.rows.length === 0 ? leeg('Deze dag zijn er geen wijzigingen.') : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                        <thead><tr>
                          <th style={th}>Tijd</th><th style={th}>Referentie</th><th style={th}>Klant</th>
                          <th style={th}>Soort</th><th style={th}>Wat is gewijzigd</th><th style={th}>Door</th>
                          <th style={{ ...th, textAlign: 'right' }}>Verschil</th>
                        </tr></thead>
                        <tbody>
                          {data.wijzigingen.rows.map((m: any) => {
                            const diff = parseFloat(m.price_difference || 0);
                            return (
                              <tr key={m.id} style={{ opacity: m.status === 'abandoned' ? 0.5 : 1 }}>
                                <td style={td}>{tijd(m.created_at)}</td>
                                <td style={ref}>
                                  <Link href={`/reservations/${m.reservation_id}?from=/dagoverzicht`} style={{ color: '#19499e', textDecoration: 'none' }}>{m.reference}</Link>
                                </td>
                                <td style={td}>{m.klant}</td>
                                <td style={td}>
                                  <span style={{ background: '#eef3ff', color: '#19499e', fontWeight: 700, fontSize: 10.5, padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                                    {TYPE_LABELS[m.modification_type] || m.modification_type}
                                  </span>
                                  {STATUS_LABELS[m.status] && (
                                    <span style={{ marginLeft: 5, background: '#fff4e5', color: '#a06010', fontWeight: 700, fontSize: 10, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                                      {STATUS_LABELS[m.status]}
                                    </span>
                                  )}
                                </td>
                                <td style={{ ...td, color: '#33415c' }}>{omschrijfWijziging(m)}</td>
                                <td style={{ ...td, color: '#5a6b80', whiteSpace: 'nowrap' }}>
                                  {m.modified_by === 'admin' ? (m.admin_email ? `Admin (${m.admin_email})` : 'Admin') : 'Klant'}
                                </td>
                                <td style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: diff > 0 ? '#8a2020' : diff < 0 ? '#0a7c6e' : '#9ab0c8' }}>
                                  {diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${eur(diff)}`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
