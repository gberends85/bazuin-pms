'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { toast, toastError } from '@/components/ui/Toast';
import Toaster from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { PencilSquareIcon, ArrowPathIcon, MagnifyingGlassIcon, CheckCircleIcon, TruckIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';

interface SettingField {
  key: string;
  label: string;
  description: string;
  type: 'number' | 'text' | 'euro';
  unit?: string;
}

const FIELDS: SettingField[] = [
  {
    key: 'modification_fee',
    label: 'Wijzigingstoeslag',
    description: 'Vaste toeslag per wijziging, ongeacht de prijsverandering. Bij restitutie wordt dit bedrag eerst afgetrokken.',
    type: 'euro',
    unit: '€',
  },
  {
    key: 'modification_min_days_before',
    label: 'Minimale wijzigingstermijn',
    description: 'Aantal dagen voor aankomst dat een klant nog zelf kan wijzigen (0 = altijd toegestaan). De admin kan altijd wijzigen.',
    type: 'number',
    unit: 'dagen',
  },
];

export default function AlgemeenSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Umbraco sync state
  const [umbStatus, setUmbStatus]   = useState<{ lastSyncId: string|null; lastSyncAt: string|null; hasToken: boolean; hasClientCreds?: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);

  // Voertuig-herstel-scan state
  const [vehicleScanRunning, setVehicleScanRunning] = useState(false);
  const [vehicleScanResult, setVehicleScanResult] = useState<{
    dryRun: boolean; scanned: number; flaggedCount: number; repairedCount: number;
    flagged: { reference: string; arrival: string; currentVehicles: number; detectedVehicles: number; toAdd: number; reason: string; totalPrice: number }[];
  } | null>(null);

  // Umbraco token opslaan state
  const [umbTokenInput, setUmbTokenInput] = useState('');
  const [umbTokenSaving, setUmbTokenSaving] = useState(false);
  const [umbTokenSaved, setUmbTokenSaved] = useState(false);

  // Directe synchronisatie state
  const [directSyncing, setDirectSyncing] = useState(false);
  const [directSyncResult, setDirectSyncResult] = useState<{ imported: number; cancelled: number; skipped: number; errors: number; errorIds: number[] } | null>(null);

  async function runDirectSync() {
    setDirectSyncing(true);
    setDirectSyncResult(null);
    try {
      const r = await api.umbraco.sync();
      toast(r.started ? 'Synchronisatie gestart — dit kan ~1 minuut duren.' : 'Synchronisatie loopt al — even geduld.');
      // De sync draait op de achtergrond; poll de status tot het resultaat binnen is.
      const startedAt = Date.now();
      const poll = async () => {
        try {
          const s = await api.umbraco.status();
          setUmbStatus(s);
          if (s.syncResult) {
            const res = s.syncResult;
            if (res.error) {
              toastError('Sync mislukt: ' + res.error);
            } else {
              setDirectSyncResult(res as any);
              const parts = [`${res.imported} nieuw`];
              if (res.cancelled) parts.push(`${res.cancelled} geannuleerd`);
              if (res.errors) parts.push(`${res.errors} fout`);
              toast(`Sync klaar: ${parts.join(', ')}`);
            }
            setDirectSyncing(false);
            return;
          }
          if (!s.syncRunning || Date.now() - startedAt > 180000) { setDirectSyncing(false); return; }
          setTimeout(poll, 5000);
        } catch { setDirectSyncing(false); }
      };
      setTimeout(poll, 5000);
    } catch (e: any) {
      toastError('Sync starten mislukt: ' + (e?.message || 'onbekende fout'));
      setDirectSyncing(false);
    }
  }

  useEffect(() => {
    api.settings.get()
      .then(data => { setValues(data); setOriginal(data); })
      .catch(e => toastError(e.message))
      .finally(() => setLoading(false));
    api.umbraco.status().then(setUmbStatus).catch(() => {});
  }, []);

  async function refreshStatus() {
    setRefreshing(true);
    setRefreshed(false);
    try {
      const s = await api.umbraco.status();
      setUmbStatus(s);
      setRefreshed(true);
      setTimeout(() => setRefreshed(false), 3000);
    } catch (e: any) {
      toastError('Vernieuwen mislukt: ' + (e.message || 'onbekende fout'));
    } finally {
      setRefreshing(false);
    }
  }

  async function runVehicleRepairScan(dryRun: boolean) {
    setVehicleScanRunning(true);
    setVehicleScanResult(null);
    try {
      const result = await api.umbraco.vehicleRepairScan(dryRun);
      setVehicleScanResult(result);
      if (!dryRun && result.repairedCount > 0)
        toast(`${result.repairedCount} reserveringen gerepareerd.`);
      else if (result.flaggedCount === 0)
        toast('Geen ontbrekende voertuigen gevonden.');
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setVehicleScanRunning(false);
    }
  }

  async function saveUmbToken() {
    if (!umbTokenInput.trim()) return;
    setUmbTokenSaving(true);
    try {
      await api.umbraco.saveToken(umbTokenInput.trim());
      setUmbTokenSaved(true);
      setUmbTokenInput('');
      setUmbStatus(s => s ? { ...s, hasToken: true } : s);
      setTimeout(() => setUmbTokenSaved(false), 3000);
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setUmbTokenSaving(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const changed = FIELDS.filter(f => values[f.key] !== original[f.key]);
      await Promise.all(changed.map(f => api.settings.set(f.key, values[f.key] ?? '')));
      setOriginal({ ...values });
      toast('Instellingen opgeslagen ✓');
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  const hasChanges = FIELDS.some(f => values[f.key] !== original[f.key]);

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#0a2240', display: 'block', marginBottom: 4 };
  const desc: React.CSSProperties = { fontSize: 12, color: '#7090b0', marginBottom: 10, lineHeight: 1.5 };
  const inp: React.CSSProperties = { border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, padding: '9px 12px', fontSize: 15, fontWeight: 700, color: '#0a2240', outline: 'none', width: 140 };

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '28px 32px', maxWidth: 700 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Algemene instellingen</h1>
        <p style={{ margin: '0 0 28px', fontSize: 13, color: '#7090b0' }}>Wijzigingsbeleid en overige systeeminstellingen.</p>

        {loading ? (
          <div style={{ color: '#7090b0', fontSize: 14 }}>Laden...</div>
        ) : (
          <>
            {/* Wijzigingsbeleid */}
            <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 12, padding: '24px 28px', marginBottom: 20 }}>
              <h2 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 800, color: '#0a2240', display:'flex', alignItems:'center', gap:6 }}><PencilSquareIcon className="w-4 h-4" />Wijzigingsbeleid</h2>

              {FIELDS.map(f => (
                <div key={f.key} style={{ marginBottom: 22, paddingBottom: 22, borderBottom: '0.5px solid rgba(10,34,64,0.06)' }}>
                  <label style={lbl}>{f.label}</label>
                  <p style={desc}>{f.description}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {f.unit === '€' && <span style={{ fontSize: 16, fontWeight: 700, color: '#0a2240' }}>€</span>}
                    <input
                      type={f.type === 'text' ? 'text' : 'number'}
                      min={0}
                      step={f.type === 'euro' ? '0.01' : '1'}
                      value={values[f.key] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                      style={inp}
                    />
                    {f.unit && f.unit !== '€' && <span style={{ fontSize: 13, color: '#7090b0' }}>{f.unit}</span>}
                  </div>
                </div>
              ))}

              {/* Info box */}
              <div style={{ background: '#f4f6f9', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#7090b0', lineHeight: 1.6 }}>
                <strong style={{ color: '#0a2240' }}>Annuleringsbeleid bij wijzigingen:</strong><br />
                Wanneer een klant een reservering wijzigt naar een later tijdstip en vervolgens annuleert,
                geldt altijd het annuleringsbeleid van de <em>originele</em> aankomstdatum.
                Dit voorkomt dat klanten een gunstiger annuleringsregeling krijgen door eerst te verplaatsen.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={save}
                disabled={saving || !hasChanges}
                className="btn btn-primary"
                style={{ opacity: !hasChanges ? 0.5 : 1 }}
              >
                {saving ? 'Opslaan...' : 'Wijzigingen opslaan'}
              </button>
            </div>

            {/* ── Umbraco sync ───────────────────────────────────── */}
            <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 12, padding: '24px 28px', marginTop: 20 }}>
              <h2 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: '#0a2240', display:'flex', alignItems:'center', gap:6 }}><ArrowPathIcon className="w-4 h-4" />Umbraco synchronisatie</h2>
              <p style={{ margin: '0 0 20px', fontSize: 12, color: '#7090b0', lineHeight: 1.6 }}>
                Importeert nieuwe reserveringen en annuleringen vanuit het Umbraco CMS.
                Gebruik <strong>Synchroniseer nu</strong> hieronder — de server doet dit zelf, automatisch.
              </p>

              {/* Status blok */}
              <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '14px 18px', marginBottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ab0c8', textTransform: 'uppercase', marginBottom: 3 }}>Laatste sync</div>
                    {umbStatus?.lastSyncAt
                      ? <strong style={{ color: '#0a2240' }}>{new Date(umbStatus.lastSyncAt).toLocaleString('nl-NL')}</strong>
                      : <span style={{ color: '#b0c4d8' }}>Nog niet gesynchroniseerd</span>}
                  </div>
                  {umbStatus?.lastSyncId && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ab0c8', textTransform: 'uppercase', marginBottom: 3 }}>Tot en met ID</div>
                      <strong style={{ color: '#0a2240' }}>{umbStatus.lastSyncId}</strong>
                    </div>
                  )}
                </div>
                <button
                  onClick={refreshStatus}
                  disabled={refreshing}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 7,
                    border: '0.5px solid rgba(10,34,64,0.2)', background: 'white',
                    color: refreshed ? '#0a7c6e' : '#0a2240',
                    cursor: refreshing ? 'not-allowed' : 'pointer',
                    opacity: refreshing ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {refreshing ? <><ArrowPathIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Laden...</> : refreshed ? <><CheckCircleIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Bijgewerkt</> : <><ArrowPathIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Status vernieuwen</>}
                </button>
              </div>

              {/* ── Directe sync (nieuw: volledig automatisch, geen script meer nodig) ── */}
              <div style={{ background: '#f0faf8', border: '1px solid #a7f3d0', borderRadius: 10, padding: '18px 20px', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#065f46', marginBottom: 3 }}>
                      {umbStatus?.hasClientCreds ? '✓ Automatische synchronisatie actief' : 'Directe synchronisatie'}
                    </div>
                    <div style={{ fontSize: 12, color: '#4b8a73', lineHeight: 1.5 }}>
                      {umbStatus?.hasClientCreds
                        ? 'De server haalt zelf nieuwe reserveringen op uit Umbraco — geen script of token meer nodig. Klik om nu te synchroniseren.'
                        : 'Synchroniseer rechtstreeks vanaf de server. Stel hieronder client-credentials in voor volledig automatische werking.'}
                    </div>
                  </div>
                  <button
                    onClick={runDirectSync}
                    disabled={directSyncing}
                    style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: directSyncing ? '#9bb0c8' : '#0a7c6e', color: 'white', fontWeight: 800, fontSize: 14, cursor: directSyncing ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}
                  >
                    <ArrowPathIcon className="w-4 h-4" />
                    {directSyncing ? 'Synchroniseren…' : 'Synchroniseer nu'}
                  </button>
                </div>
                {directSyncResult && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #c8ecdd', fontSize: 13, color: '#0a2240' }}>
                    <strong>{directSyncResult.imported}</strong> nieuw geïmporteerd
                    {directSyncResult.cancelled > 0 && <> · <strong>{directSyncResult.cancelled}</strong> geannuleerd</>}
                    {' · '}<span style={{ color: '#7090b0' }}>{directSyncResult.skipped} overgeslagen</span>
                    {directSyncResult.errors > 0 && (
                      <div style={{ marginTop: 8, color: '#8a2020', background: '#fdeaea', borderRadius: 6, padding: '8px 12px' }}>
                        <strong>{directSyncResult.errors}</strong> niet verwerkt
                        {directSyncResult.errorIds?.length > 0 && <> — ID's: {directSyncResult.errorIds.slice(0, 30).join(', ')}</>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Token opslaan (oude methode — alleen nog nodig zonder client-credentials) */}
              <div style={{ background: umbStatus?.hasToken ? '#f0faf8' : '#fff8e6', border: `1px solid ${umbStatus?.hasToken ? '#a7f3d0' : '#f0c060'}`, borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: umbStatus?.hasClientCreds ? 'none' : 'block' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: umbStatus?.hasToken ? '#065f46' : '#7a5a00', marginBottom: umbStatus?.hasToken ? 0 : 10 }}>
                  {umbStatus?.hasToken ? '✓ Umbraco-token opgeslagen' : '⚠ Geen Umbraco-token — vul het hieronder in'}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="password"
                    value={umbTokenInput}
                    onChange={e => setUmbTokenInput(e.target.value)}
                    placeholder={umbStatus?.hasToken ? 'Nieuw token plakken om te vervangen…' : 'Plak hier uw Umbraco access_token…'}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 12, fontFamily: 'monospace' }}
                    onKeyDown={e => e.key === 'Enter' && saveUmbToken()}
                  />
                  <button
                    onClick={saveUmbToken}
                    disabled={umbTokenSaving || !umbTokenInput.trim()}
                    style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: umbTokenSaved ? '#0a7c6e' : '#0a2240', color: 'white', fontWeight: 700, fontSize: 13, cursor: (umbTokenSaving || !umbTokenInput.trim()) ? 'not-allowed' : 'pointer', opacity: (umbTokenSaving || !umbTokenInput.trim()) ? 0.6 : 1, whiteSpace: 'nowrap' }}
                  >
                    {umbTokenSaved ? '✓ Opgeslagen' : umbTokenSaving ? 'Bezig…' : 'Opslaan'}
                  </button>
                </div>
              </div>

            </div>

            {/* ── Voertuig-herstel-scan ─────────────────────────── */}
            <div style={{ background: 'white', border: '2px solid #7c4a1a', borderRadius: 12, padding: '24px 28px', marginTop: 20 }}>
              <h2 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: '#7c4a1a', display:'flex', alignItems:'center', gap:6 }}>
                <TruckIcon className="w-4 h-4" />Voertuig-herstel-scan
              </h2>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: '#7090b0', lineHeight: 1.6 }}>
                Scant alle geïmporteerde Umbraco-reserveringen op ontbrekende voertuigen via tekst-detectie
                (bijv. "3 auto's" in de notitie) en prijsratio (totaalprijs ÷ tarief). Voegt lege kentekens toe die u bij aankomst kunt invullen.
              </p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <button
                  onClick={() => runVehicleRepairScan(true)}
                  disabled={vehicleScanRunning}
                  style={{ fontSize: 14, padding: '9px 20px', borderRadius: 8, border: '1.5px solid #7c4a1a', background: 'white', color: '#7c4a1a', fontWeight: 700, cursor: vehicleScanRunning ? 'not-allowed' : 'pointer', opacity: vehicleScanRunning ? 0.6 : 1 }}
                >
                  {vehicleScanRunning ? <><ArrowPathIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Bezig...</> : <><MagnifyingGlassIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Droogloop (alleen rapport)</>}
                </button>
                <button
                  onClick={() => runVehicleRepairScan(false)}
                  disabled={vehicleScanRunning}
                  style={{ fontSize: 14, padding: '9px 20px', borderRadius: 8, border: 'none', background: '#7c4a1a', color: 'white', fontWeight: 700, cursor: vehicleScanRunning ? 'not-allowed' : 'pointer', opacity: vehicleScanRunning ? 0.6 : 1 }}
                >
                  {vehicleScanRunning ? <><ArrowPathIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Bezig...</> : <><WrenchScrewdriverIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Scan & herstel</>}
                </button>
              </div>
              {vehicleScanResult && (
                <div>
                  <div style={{ fontSize: 13, color: '#1a2b3c', marginBottom: 10 }}>
                    <strong>{vehicleScanResult.scanned}</strong> gescand &nbsp;·&nbsp;
                    <strong style={{ color: vehicleScanResult.flaggedCount > 0 ? '#c0540a' : '#0a7c6e' }}>{vehicleScanResult.flaggedCount}</strong> gevlagged
                    {!vehicleScanResult.dryRun && <> &nbsp;·&nbsp; <strong style={{ color: '#0a7c6e' }}>{vehicleScanResult.repairedCount}</strong> gerepareerd</>}
                    {vehicleScanResult.dryRun && <span style={{ marginLeft: 8, fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 10 }}>droogloop</span>}
                  </div>
                  {vehicleScanResult.flagged.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f5f0eb', textAlign: 'left' }}>
                          <th style={{ padding: '6px 10px', color: '#7090b0' }}>Referentie</th>
                          <th style={{ padding: '6px 10px', color: '#7090b0' }}>Aankomst</th>
                          <th style={{ padding: '6px 10px', color: '#7090b0' }}>Voertuigen nu → gewenst</th>
                          <th style={{ padding: '6px 10px', color: '#7090b0' }}>Reden</th>
                          <th style={{ padding: '6px 10px', color: '#7090b0' }}>Prijs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vehicleScanResult.flagged.map((f, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #e2e8f0', background: i % 2 === 0 ? 'white' : '#fafbfc' }}>
                            <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0a2240' }}>{f.reference}</td>
                            <td style={{ padding: '6px 10px', color: '#4a5568' }}>{f.arrival}</td>
                            <td style={{ padding: '6px 10px' }}>
                              <span style={{ color: '#c0540a' }}>{f.currentVehicles}</span>
                              {' → '}
                              <span style={{ color: '#0a7c6e', fontWeight: 700 }}>{f.detectedVehicles}</span>
                              <span style={{ color: '#7090b0', marginLeft: 4 }}>(+{f.toAdd})</span>
                            </td>
                            <td style={{ padding: '6px 10px', color: '#7090b0', fontStyle: 'italic' }}>{f.reason}</td>
                            <td style={{ padding: '6px 10px', color: '#1a2b3c' }}>€{f.totalPrice.toFixed(2).replace('.',',')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

          </>
        )}
      </div>
    </AdminLayout>
  );
}
