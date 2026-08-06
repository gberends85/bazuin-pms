'use client';
import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { BanknotesIcon, CheckCircleIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline';

const eur = (v: any) => `€ ${parseFloat(v || 0).toFixed(2).replace('.', ',')}`;
const dat = (v: any) => v ? new Date(v).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const isoVandaag = () => new Date().toISOString().slice(0, 10);

const METHODEN = [
  { v: 'overboeking', l: 'Overboeking' },
  { v: 'ideal', l: 'iDEAL' },
  { v: 'stripe', l: 'Betaallink (Stripe)' },
  { v: 'pin', l: 'Pin' },
  { v: 'contant', l: 'Contant' },
  { v: 'tikkie', l: 'Tikkie' },
  { v: 'anders', l: 'Anders' },
];
const methodeLabel = (v: string) => METHODEN.find(m => m.v === v)?.l || v || '—';

export default function FacturenOverzichtPage() {
  const [filter, setFilter] = useState<'open' | 'paid' | 'all'>('open');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bezig, setBezig] = useState<string | null>(null);
  const [markeer, setMarkeer] = useState<any | null>(null);
  const [betaalDatum, setBetaalDatum] = useState(isoVandaag());
  const [betaalWijze, setBetaalWijze] = useState('overboeking');

  const load = useCallback(async (f: string) => {
    setLoading(true);
    try { setData(await api.reports.invoicesOverview(f)); }
    catch (e: any) { toastError(e?.message || 'Laden mislukt'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  function openMarkeer(r: any) {
    setBetaalDatum(isoVandaag());
    setBetaalWijze(r.soort === 'contract' ? 'stripe' : 'overboeking');
    setMarkeer(r);
  }

  async function bevestigBetaald() {
    if (!markeer) return;
    setBezig(markeer.id);
    try {
      await api.reports.invoicePayment(markeer.soort, markeer.id, {
        paid: true, paidAt: betaalDatum, paymentMethod: betaalWijze,
      });
      toast(`${markeer.nummer} gemarkeerd als betaald`);
      setMarkeer(null);
      load(filter);
    } catch (e: any) { toastError(e?.message || 'Opslaan mislukt'); }
    finally { setBezig(null); }
  }

  async function draaiTerug(r: any) {
    setBezig(r.id);
    try {
      await api.reports.invoicePayment(r.soort, r.id, { paid: false });
      toast(`${r.nummer} weer op openstaand`);
      load(filter);
    } catch (e: any) { toastError(e?.message || 'Opslaan mislukt'); }
    finally { setBezig(null); }
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '9px 10px', fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid rgba(10,34,64,0.1)', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px', fontSize: 13, color: '#0a2240', borderBottom: '0.5px solid rgba(10,34,64,0.06)', verticalAlign: 'middle' };

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 1150 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Facturenoverzicht</h1>
        <p style={{ margin: '0 0 18px', fontSize: 12.5, color: '#7090b0' }}>
          Facturen van factuurklanten en contractklanten bij elkaar. Markeer hier wat er betaald is, wanneer en hoe.
        </p>

        {data && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
            <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 11, padding: '13px 18px', minWidth: 170 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Openstaand</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#a06010', lineHeight: 1.1 }}>{eur(data.totalen.openBedrag)}</div>
              <div style={{ fontSize: 11.5, color: '#7090b0', marginTop: 3 }}>{data.totalen.openAantal} factuur/facturen</div>
            </div>
            <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 11, padding: '13px 18px', minWidth: 170 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Betaald</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0a7c6e', lineHeight: 1.1 }}>{eur(data.totalen.betaaldBedrag)}</div>
              <div style={{ fontSize: 11.5, color: '#7090b0', marginTop: 3 }}>{data.totalen.betaaldAantal} factuur/facturen</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {([['open', 'Openstaand'], ['paid', 'Betaald'], ['all', 'Alles']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: filter === v ? '1.5px solid #19499e' : '0.5px solid rgba(10,34,64,0.2)',
                background: filter === v ? '#eaf1fb' : 'white',
                color: filter === v ? '#19499e' : '#7090b0',
              }}>{l}</button>
          ))}
        </div>

        {loading && <div style={{ color: '#7090b0', padding: 20 }}>Laden…</div>}

        {!loading && data && (
          <div className="card" style={{ padding: '4px 14px 10px' }}>
            {data.rows.length === 0 ? (
              <div style={{ padding: '26px 6px', color: '#9ab0c8', fontSize: 13 }}>Geen facturen in deze weergave.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                  <thead><tr>
                    <th style={th}>Factuur</th><th style={th}>Soort</th><th style={th}>Klant</th>
                    <th style={th}>Verstuurd</th><th style={{ ...th, textAlign: 'right' }}>Bedrag</th>
                    <th style={th}>Betaald op</th><th style={th}>Wijze</th><th style={th}></th>
                  </tr></thead>
                  <tbody>
                    {data.rows.map((r: any) => (
                      <tr key={`${r.soort}-${r.id}`} style={{ opacity: r.isConcept ? 0.6 : 1 }}>
                        <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{r.nummer || '—'}</td>
                        <td style={td}>
                          <span style={{
                            background: r.soort === 'contract' ? '#eef3ff' : '#f0f7f4',
                            color: r.soort === 'contract' ? '#19499e' : '#0a7c6e',
                            fontWeight: 700, fontSize: 10.5, padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap',
                          }}>{r.soort === 'contract' ? 'Contract' : 'Factuurgroep'}</span>
                          {r.isConcept && <span style={{ marginLeft: 5, fontSize: 10.5, fontWeight: 700, color: '#7090b0' }}>concept</span>}
                        </td>
                        <td style={td}>{r.klant || '—'}</td>
                        <td style={{ ...td, color: '#5a6b80', whiteSpace: 'nowrap' }}>{dat(r.sent_at) || (r.isConcept ? '—' : dat(r.created_at))}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{eur(r.bedrag)}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap', color: r.isBetaald ? '#0a7c6e' : '#9ab0c8', fontWeight: r.isBetaald ? 700 : 400 }}>
                          {r.isBetaald ? dat(r.paid_at) : '—'}
                        </td>
                        <td style={{ ...td, color: '#5a6b80', whiteSpace: 'nowrap' }}>{r.isBetaald ? methodeLabel(r.payment_method) : '—'}</td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {r.isConcept ? (
                            <span style={{ fontSize: 11.5, color: '#9ab0c8' }}>nog niet verstuurd</span>
                          ) : r.isBetaald ? (
                            <button onClick={() => draaiTerug(r)} disabled={bezig === r.id}
                              style={{ background: 'none', border: '0.5px solid rgba(10,34,64,0.2)', color: '#7090b0', borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <ArrowUturnLeftIcon className="w-3 h-3" />Terugdraaien
                            </button>
                          ) : (
                            <button onClick={() => openMarkeer(r)} disabled={bezig === r.id}
                              style={{ background: '#0a7c6e', border: 'none', color: 'white', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <CheckCircleIcon className="w-4 h-4" />Betaald
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal open={!!markeer} onClose={() => setMarkeer(null)} title="Factuur als betaald markeren">
        {markeer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f4f6f9', borderRadius: 8, padding: '10px 13px', fontSize: 13 }}>
              <div><span style={{ color: '#7090b0' }}>Factuur:</span> <strong style={{ fontFamily: 'monospace' }}>{markeer.nummer}</strong></div>
              <div style={{ marginTop: 2 }}><span style={{ color: '#7090b0' }}>Klant:</span> <strong>{markeer.klant}</strong></div>
              <div style={{ marginTop: 2 }}><span style={{ color: '#7090b0' }}>Bedrag:</span> <strong>{eur(markeer.bedrag)}</strong></div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 5 }}>Betaald op</label>
              <input type="date" value={betaalDatum} onChange={e => setBetaalDatum(e.target.value)}
                style={{ width: '100%', padding: '9px 11px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 5 }}>Betaalwijze</label>
              <select value={betaalWijze} onChange={e => setBetaalWijze(e.target.value)}
                style={{ width: '100%', padding: '9px 11px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14, background: 'white', boxSizing: 'border-box' }}>
                {METHODEN.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setMarkeer(null)}>Annuleren</button>
              <button onClick={bevestigBetaald} disabled={bezig === markeer.id}
                style={{ background: '#0a7c6e', border: 'none', color: 'white', borderRadius: 8, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <BanknotesIcon className="w-4 h-4" />Opslaan
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}
