'use client';
import { useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { BoltIcon, ArrowDownTrayIcon, MagnifyingGlassIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

const KWH_OPTIONS = [15, 20, 30, 40, 60] as const;

const card: React.CSSProperties = {
  background: 'white', border: '0.5px solid rgba(10,34,64,0.12)',
  borderRadius: 12, padding: '20px 24px', marginBottom: 20,
};
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#7090b0',
  textTransform: 'uppercase', letterSpacing: '0.5px',
  display: 'block', marginBottom: 6,
};
const input: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7,
  fontSize: 14, color: '#0a2240', boxSizing: 'border-box',
};

// ── EV repareren (enkelvoudig) ────────────────────────────────────────────────
function EvRepairSingle() {
  const [ref, setRef] = useState('');
  const [kwh, setKwh] = useState<number | null>(null);
  const [included, setIncluded] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function repair() {
    const match = ref.trim().match(/(\d+)$/);
    if (!match) { toastError('Voer een geldig referentienummer in (bijv. DB-2026-U24314)'); return; }
    const umbId = parseInt(match[1]);
    setLoading(true); setResult(null);
    try {
      const r = await api.umbraco.addEvService([{ umbId, kwh, includedInPrice: included }]) as any;
      if (r.updated === 0) {
        setResult('⚠️ Niets bijgewerkt — record niet gevonden, al correct, of geannuleerd.');
      } else {
        setResult(`✅ ${ref.trim()} bijgewerkt met ${kwh ? kwh + ' kWh' : 'vol laden'}`);
        toast('EV service toegepast');
      }
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={card}>
      <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: '#0a2240', display:'flex', alignItems:'center', gap:6 }}><BoltIcon className="w-4 h-4" />EV repareren — één reservering</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#7090b0' }}>
        Voeg alsnog de laaddienst toe aan een al-geïmporteerde boeking waar het niet opgepakt werd.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={label}>Referentie of Umbraco-ID</label>
          <input style={input} value={ref} onChange={e => setRef(e.target.value)}
            placeholder="DB-2026-U24314 of 24314" />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={label}>kWh laden</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {KWH_OPTIONS.map(k => (
            <button key={k} type="button"
              onClick={() => setKwh(kwh === k ? null : k)}
              style={{
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                border: kwh === k ? '2px solid #0a7c6e' : '0.5px solid rgba(10,34,64,0.2)',
                background: kwh === k ? '#e6f7f5' : 'white',
                fontWeight: 700, fontSize: 13,
                color: kwh === k ? '#0a7c6e' : '#0a2240',
              }}>
              {k} kWh
            </button>
          ))}
          <button type="button"
            onClick={() => setKwh(null)}
            style={{
              padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
              border: kwh === null ? '2px solid #0a2240' : '0.5px solid rgba(10,34,64,0.2)',
              background: kwh === null ? '#0a2240' : 'white',
              fontWeight: 700, fontSize: 13,
              color: kwh === null ? 'white' : '#0a2240',
            }}>
            Vol (€5)
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" id="included" checked={included} onChange={e => setIncluded(e.target.checked)} />
        <label htmlFor="included" style={{ fontSize: 13, color: '#0a2240', cursor: 'pointer' }}>
          EV-kosten zaten al in de Umbraco-prijs (splitsen van base_price)
        </label>
      </div>

      <button onClick={repair} disabled={loading || !ref.trim()}
        className="btn btn-primary" style={{ minWidth: 160 }}>
        {loading ? 'Bezig…' : <><BoltIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Repareer</>}
      </button>

      {result && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: result.startsWith('✅') ? '#e6f7f5' : '#fff8e0', borderRadius: 8, fontSize: 13, color: result.startsWith('✅') ? '#0a5040' : '#7a5010' }}>
          {result}
        </div>
      )}
    </div>
  );
}

// ── EV repareren (bulk) ───────────────────────────────────────────────────────
function EvRepairBulk() {
  const [text, setText] = useState('');
  const [included, setIncluded] = useState(true);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<string[]>([]);

  // Formaat: één per regel → "24314:40" of "DB-2026-U24314:40"
  function parseLines(): Array<{ umbId: number; kwh: number | null }> {
    return text.split('\n')
      .map(l => l.trim()).filter(Boolean)
      .map(l => {
        const parts = l.split(':');
        const idMatch = parts[0].match(/(\d+)$/);
        if (!idMatch) return null;
        const umbId = parseInt(idMatch[1]);
        const kwh = parts[1] ? parseInt(parts[1]) || null : null;
        return { umbId, kwh };
      })
      .filter(Boolean) as Array<{ umbId: number; kwh: number | null }>;
  }

  async function applyBulk() {
    const records = parseLines();
    if (records.length === 0) { toastError('Geen geldige regels gevonden'); return; }
    setLoading(true); setResults([]);
    try {
      const r = await api.umbraco.addEvService(
        records.map(({ umbId, kwh }) => ({ umbId, kwh, includedInPrice: included }))
      ) as any;
      setResults([`✅ ${r.updated} van ${records.length} record(s) bijgewerkt`]);
      toast(`${r.updated} records bijgewerkt`);
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const preview = parseLines();

  return (
    <div style={card}>
      <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: '#0a2240', display:'flex', alignItems:'center', gap:6 }}><BoltIcon className="w-4 h-4" />EV repareren — meerdere tegelijk</h2>
      <p style={{ margin: '0 0 4px', fontSize: 13, color: '#7090b0' }}>
        Eén regel per boeking. Formaat: <code style={{ background: '#f4f6f9', padding: '1px 6px', borderRadius: 4 }}>UmbracoID:kWh</code>
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: '#b0c4d8' }}>
        Voorbeeld: <code style={{ background: '#f4f6f9', padding: '1px 6px', borderRadius: 4 }}>24314:40</code> of <code style={{ background: '#f4f6f9', padding: '1px 6px', borderRadius: 4 }}>24315:20</code> — laat kWh weg voor vol laden (<code style={{ background: '#f4f6f9', padding: '1px 6px', borderRadius: 4 }}>24316</code>)
      </p>

      <textarea value={text} onChange={e => setText(e.target.value)} rows={6}
        placeholder={'24314:40\n24315:20\n24316:60\n24317'}
        style={{ ...input, resize: 'vertical', fontFamily: 'monospace', marginBottom: 12 }} />

      {preview.length > 0 && (
        <div style={{ marginBottom: 12, fontSize: 12, color: '#556070', background: '#f8f9fb', borderRadius: 8, padding: '8px 12px' }}>
          {preview.length} regel(s) herkend:{' '}
          {preview.map(r => `DB-2026-U${r.umbId}${r.kwh ? ` (${r.kwh} kWh)` : ' (vol)'}`).join(', ')}
        </div>
      )}

      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" id="included-bulk" checked={included} onChange={e => setIncluded(e.target.checked)} />
        <label htmlFor="included-bulk" style={{ fontSize: 13, color: '#0a2240', cursor: 'pointer' }}>
          EV-kosten zaten al in de Umbraco-prijs
        </label>
      </div>

      <button onClick={applyBulk} disabled={loading || preview.length === 0}
        className="btn btn-primary">
        {loading ? 'Bezig…' : <><BoltIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Toepassen op {preview.length} record(s)</>}
      </button>

      {results.map((r, i) => (
        <div key={i} style={{ marginTop: 12, padding: '10px 14px', background: '#e6f7f5', borderRadius: 8, fontSize: 13, color: '#0a5040' }}>{r}</div>
      ))}
    </div>
  );
}

// ── Umbraco batch import ──────────────────────────────────────────────────────
function UmbracoImport() {
  const [json, setJson] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function runImport() {
    let records: any[];
    try {
      records = JSON.parse(json);
      if (!Array.isArray(records)) throw new Error('Verwacht een array');
    } catch {
      toastError('Ongeldige JSON — plak een array van records'); return;
    }
    setLoading(true); setResult(null);
    try {
      const r = await api.umbraco.importBatch(records, dryRun) as any;
      setResult(r);
      if (!dryRun) toast(`Import klaar: ${r.imported} geïmporteerd`);
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={card}>
      <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: '#0a2240', display:'flex', alignItems:'center', gap:6 }}><ArrowDownTrayIcon className="w-4 h-4" />Umbraco batch-import</h2>
      <p style={{ margin: '0 0 4px', fontSize: 13, color: '#7090b0' }}>
        Plak een JSON-array met Umbraco-records. Gebruik <code style={{ background: '#f4f6f9', padding: '1px 6px', borderRadius: 4 }}>"evKwh": 40</code> bij boekingen met laden.
      </p>
      <details style={{ marginBottom: 16 }}>
        <summary style={{ fontSize: 12, color: '#0a7c6e', cursor: 'pointer', fontWeight: 600 }}>Voorbeeld record tonen</summary>
        <pre style={{ fontSize: 11, background: '#f4f6f9', padding: 12, borderRadius: 8, overflowX: 'auto', marginTop: 8, color: '#0a2240' }}>{`[
  {
    "id": 24320,
    "name": "Jan Jansen",
    "email": "jan@voorbeeld.nl",
    "phone": "0612345678",
    "plate": "AB-12-CD",
    "arrival": "2026-05-10",
    "departure": "2026-05-17",
    "depH": 9, "depM": 0,
    "retH": 17, "retM": 30,
    "fast": false,
    "price": 127.20,
    "paid": true,
    "stripe": null,
    "method": "ideal",
    "note": "",
    "cancelled": false,
    "evKwh": 40
  }
]`}</pre>
      </details>

      <textarea value={json} onChange={e => setJson(e.target.value)} rows={8}
        placeholder='[{ "id": 24320, "name": "...", "evKwh": 40, ... }]'
        style={{ ...input, resize: 'vertical', fontFamily: 'monospace', marginBottom: 12 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />
          Dry run (preview, niets opslaan)
        </label>
        {!dryRun && (
          <span style={{ fontSize: 12, color: '#c05000', fontWeight: 600 }}>
            ⚠️ Let op: records worden écht geïmporteerd
          </span>
        )}
      </div>

      <button onClick={runImport} disabled={loading || !json.trim()}
        className={dryRun ? 'btn btn-ghost' : 'btn btn-primary'}>
        {loading ? 'Bezig…' : dryRun ? <><MagnifyingGlassIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Preview</> : <><ArrowDownTrayIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Importeren</>}
      </button>

      {result && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f4f6f9', borderRadius: 8, fontSize: 13 }}>
          <div style={{ fontWeight: 700, color: '#0a2240', marginBottom: 8 }}>
            {result.dryRun ? 'Preview resultaat' : 'Import resultaat'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
            {[
              { label: 'Geïmporteerd', value: result.imported, color: '#0a7c6e' },
              { label: 'Overgeslagen', value: result.skipped, color: '#7090b0' },
              { label: 'Geannuleerd', value: result.cancelled, color: '#e07b00' },
              { label: 'Fouten', value: result.errors, color: '#c00' },
            ].map(({ label: l, value, color }) => (
              <div key={l} style={{ textAlign: 'center', padding: '8px', background: 'white', borderRadius: 8, border: '0.5px solid rgba(10,34,64,0.1)' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
                <div style={{ fontSize: 11, color: '#7090b0' }}>{l}</div>
              </div>
            ))}
          </div>
          {result.lastId > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#7090b0' }}>
              Hoogste verwerkte ID: <strong>{result.lastId}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Annuleringen bijwerken ──────────────────────────────────────────────────
function SyncCancellations() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function run() {
    setLoading(true); setResult(null);
    try {
      const r = await api.umbraco.syncCancellations() as any;
      setResult(r);
      if (r.cancelled > 0) toast(`${r.cancelled} annulering(en) bijgewerkt`);
      else toast('Geen nieuwe annuleringen gevonden');
    } catch (e: any) { toastError(e?.message || 'Mislukt'); }
    finally { setLoading(false); }
  }

  return (
    <div style={card}>
      <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: '#0a2240', display: 'flex', alignItems: 'center', gap: 6 }}><ArrowPathIcon className="w-4 h-4" />Annuleringen bijwerken</h2>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: '#7090b0' }}>
        Controleert alle actieve/aankomende reserveringen uit Umbraco op annuleringen die de gewone (vooruit-)sync mist, en zet ze hier ook op geannuleerd. Draait ook automatisch 1× per dag.
      </p>
      <button onClick={run} disabled={loading}
        style={{ background: '#19499e', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1 }}>
        {loading ? 'Bezig…' : 'Annuleringen bijwerken'}
      </button>
      {result && (
        <div style={{ marginTop: 14, padding: '12px 16px', background: '#f4f6f9', borderRadius: 8, fontSize: 13, color: '#0a2240' }}>
          <div>Gecontroleerd: <strong>{result.checked}</strong> · Geannuleerd: <strong style={{ color: result.cancelled > 0 ? '#c0392b' : '#0a5040' }}>{result.cancelled}</strong>{result.notFound ? ` · Niet gevonden: ${result.notFound}` : ''}{result.errors ? ` · Fouten: ${result.errors}` : ''}</div>
          {result.cancelledRefs?.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#7090b0' }}>{result.cancelledRefs.join(', ')}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Pagina ────────────────────────────────────────────────────────────────────
export default function ToolsPage() {
  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 720 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Importtools</h1>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#7090b0' }}>
          Umbraco-import en EV-service reparatie voor bestaande boekingen.
        </p>
        <SyncCancellations />
        <EvRepairSingle />
        <EvRepairBulk />
        <UmbracoImport />
      </div>
    </AdminLayout>
  );
}
