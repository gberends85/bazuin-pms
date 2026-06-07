'use client';
import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster from '@/components/ui/Toast';
import { toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PrinterIcon,
  BanknotesIcon,
  CreditCardIcon,
  DevicePhoneMobileIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toIso(d: Date) {
  return d.toISOString().split('T')[0];
}
function addDays(iso: string, n: number) {
  const d = new Date(iso); d.setDate(d.getDate() + n); return toIso(d);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtDateTime(ts: string) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}
function eur(v: number | string) {
  return '€ ' + Number(v).toFixed(2).replace('.', ',');
}
function isToday(iso: string) {
  return iso === toIso(new Date());
}

// ─── Method config ────────────────────────────────────────────────────────────

const METHOD_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  contant: { label: 'Contant',  color: '#1a7a3a', bg: '#f0fdf4', icon: BanknotesIcon },
  pin:     { label: 'PIN',      color: '#0a4a8a', bg: '#eff6ff', icon: CreditCardIcon },
  tikkie:  { label: 'Tikkie',   color: '#6b21a8', bg: '#faf5ff', icon: DevicePhoneMobileIcon },
  ideal:   { label: 'iDEAL',    color: '#0a4a8a', bg: '#eff6ff', icon: GlobeAltIcon },
  card:    { label: 'Kaart',    color: '#0a4a8a', bg: '#eff6ff', icon: CreditCardIcon },
  bancontact: { label: 'Bancontact', color: '#0a4a8a', bg: '#eff6ff', icon: CreditCardIcon },
  sepa:    { label: 'SEPA',     color: '#0a4a8a', bg: '#eff6ff', icon: GlobeAltIcon },
  paypal:  { label: 'PayPal',   color: '#003087', bg: '#eff6ff', icon: GlobeAltIcon },
};

function methodCfg(method: string) {
  return METHOD_CONFIG[method] ?? { label: method, color: '#0a2240', bg: '#f4f6f9', icon: BanknotesIcon };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KasPage() {
  const [date, setDate] = useState(toIso(new Date()));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      setData(await api.reports.cash(d));
    } catch (e: any) {
      toastError(e?.message || 'Kon kasoverzicht niet laden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  function prev() { setDate(d => addDays(d, -1)); }
  function next() { setDate(d => addDays(d, +1)); }
  function goToday() { setDate(toIso(new Date())); }

  const transactions: any[] = data?.transactions ?? [];
  const totals: any[]       = data?.totals ?? [];
  const grandTotal: number  = data?.grandTotal ?? 0;

  // Groepeer totalen per methode voor de kaartjes
  const totByMethod: Record<string, { count: number; total: number }> = {};
  for (const t of totals) {
    totByMethod[t.payment_method] = { count: t.count, total: parseFloat(t.total) };
  }

  // Cashgroep en pingroep apart voor de hoofdkaartjes
  const contant = totByMethod['contant'] ?? { count: 0, total: 0 };
  const pin      = totByMethod['pin']     ?? { count: 0, total: 0 };
  const overig   = totals.filter(t => !['contant','pin'].includes(t.payment_method));
  const overigTotal = overig.reduce((s: number, t: any) => s + parseFloat(t.total), 0);
  const overigCount = overig.reduce((s: number, t: any) => s + t.count, 0);

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0a2240', margin: 0 }}>Kasoverzicht</h1>
            <div style={{ fontSize: 13, color: '#7090b0', marginTop: 2 }}>Dagelijks overzicht van ontvangen betalingen</div>
          </div>
          <button onClick={() => window.print()} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8, border: '0.5px solid rgba(10,34,64,0.2)',
            background: 'white', color: '#0a2240', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>
            <PrinterIcon className="w-4 h-4" />Afdrukken
          </button>
        </div>

        {/* Datum navigator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 10, padding: '10px 14px' }}>
          <button onClick={prev} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0a2240', padding: 4, borderRadius: 6, display: 'flex' }}>
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#0a2240' }}>{fmtDate(date)}</div>
            {isToday(date) && <div style={{ fontSize: 11, color: '#0a7c6e', fontWeight: 700, marginTop: 1 }}>Vandaag</div>}
          </div>
          <button onClick={next} disabled={isToday(date)} style={{ background: 'none', border: 'none', cursor: isToday(date) ? 'default' : 'pointer', color: isToday(date) ? '#ccc' : '#0a2240', padding: 4, borderRadius: 6, display: 'flex' }}>
            <ChevronRightIcon className="w-5 h-5" />
          </button>
          {!isToday(date) && (
            <button onClick={goToday} style={{ fontSize: 12, fontWeight: 700, color: '#0a7c6e', background: '#e6f7f5', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
              Vandaag
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#7090b0', fontSize: 14 }}>Laden…</div>
        ) : (
          <>
            {/* Totaalkaartjes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
              <SummaryCard
                label="Contant"
                amount={contant.total}
                count={contant.count}
                color="#1a7a3a" bg="#f0fdf4"
                Icon={BanknotesIcon}
              />
              <SummaryCard
                label="PIN"
                amount={pin.total}
                count={pin.count}
                color="#0a4a8a" bg="#eff6ff"
                Icon={CreditCardIcon}
              />
              {overigCount > 0 && (
                <SummaryCard
                  label="Overig"
                  amount={overigTotal}
                  count={overigCount}
                  color="#6b21a8" bg="#faf5ff"
                  Icon={GlobeAltIcon}
                />
              )}
              <SummaryCard
                label="Totaal"
                amount={grandTotal}
                count={transactions.length}
                color="#0a2240" bg="#f0f4f8"
                Icon={BanknotesIcon}
                isTotal
              />
            </div>

            {/* Transactielijst */}
            {transactions.length === 0 ? (
              <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.1)', borderRadius: 10, padding: '40px 20px', textAlign: 'center', color: '#7090b0', fontSize: 14 }}>
                Geen betalingen geregistreerd op {fmtDate(date).toLowerCase()}
              </div>
            ) : (
              <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.1)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '0.5px solid rgba(10,34,64,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {transactions.length} betaling{transactions.length !== 1 ? 'en' : ''}
                  </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={th}>Tijd</th>
                      <th style={th}>Referentie</th>
                      <th style={th}>Naam</th>
                      <th style={th}>Kenteken</th>
                      <th style={th}>Periode</th>
                      <th style={{ ...th, textAlign: 'center' }}>Wijze</th>
                      <th style={{ ...th, textAlign: 'right' }}>Bedrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t: any, idx: number) => {
                      const cfg = methodCfg(t.payment_method);
                      const Icon = cfg.icon;
                      return (
                        <tr key={t.id} style={{ borderTop: idx > 0 ? '0.5px solid rgba(10,34,64,0.06)' : undefined }}>
                          <td style={td}>{fmtDateTime(t.paid_at)}</td>
                          <td style={td}>
                            <a href={`/reservations/${t.id}`} style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0a7c6e', textDecoration: 'none', fontSize: 12 }}>
                              {t.reference}
                            </a>
                          </td>
                          <td style={td}>{t.customer_name}</td>
                          <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{t.plates || '—'}</td>
                          <td style={{ ...td, color: '#7090b0', fontSize: 12 }}>
                            {new Date(t.arrival_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – {new Date(t.departure_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                            <span style={{ marginLeft: 4, opacity: 0.7 }}>({t.nights}n)</span>
                          </td>
                          <td style={{ ...td, textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                              background: cfg.bg, color: cfg.color,
                            }}>
                              <Icon className="w-3 h-3" />{cfg.label}
                            </span>
                          </td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#0a2240' }}>
                            {eur(t.total_price)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '1.5px solid rgba(10,34,64,0.12)', background: '#f8fafc' }}>
                      <td colSpan={6} style={{ ...td, fontWeight: 700, color: '#0a2240', textAlign: 'right' }}>Totaal</td>
                      <td style={{ ...td, fontWeight: 800, color: '#0a2240', textAlign: 'right', fontSize: 15 }}>{eur(grandTotal)}</td>
                    </tr>
                    {/* Per methode subtotalen */}
                    {totals.map((t: any) => (
                      <tr key={t.payment_method} style={{ borderTop: '0.5px solid rgba(10,34,64,0.06)', background: '#f8fafc' }}>
                        <td colSpan={6} style={{ ...td, color: '#7090b0', textAlign: 'right', fontSize: 12 }}>
                          w.v. {methodCfg(t.payment_method).label} ({t.count}×)
                        </td>
                        <td style={{ ...td, color: '#7090b0', textAlign: 'right', fontSize: 12 }}>{eur(t.total)}</td>
                      </tr>
                    ))}
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @media print {
          aside, nav, button, .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </AdminLayout>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({ label, amount, count, color, bg, Icon, isTotal }: {
  label: string; amount: number; count: number;
  color: string; bg: string; Icon: any; isTotal?: boolean;
}) {
  return (
    <div style={{
      background: isTotal ? '#0a2240' : bg,
      border: isTotal ? 'none' : `1px solid ${color}22`,
      borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Icon className="w-4 h-4" style={{ color: isTotal ? 'rgba(255,255,255,0.7)' : color }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: isTotal ? 'rgba(255,255,255,0.7)' : color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: isTotal ? 'white' : color, lineHeight: 1 }}>
        {'€ '}{amount.toFixed(2).replace('.', ',')}
      </div>
      <div style={{ fontSize: 11, color: isTotal ? 'rgba(255,255,255,0.5)' : `${color}99`, marginTop: 4 }}>
        {count} betaling{count !== 1 ? 'en' : ''}
      </div>
    </div>
  );
}

// ─── Table styles ─────────────────────────────────────────────────────────────

const th: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontWeight: 700,
  fontSize: 11, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.4px',
  borderBottom: '0.5px solid rgba(10,34,64,0.1)',
};
const td: React.CSSProperties = {
  padding: '10px 12px', color: '#0a2240', verticalAlign: 'middle',
};
