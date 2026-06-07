'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckIcon, BoltIcon, TruckIcon, Battery50Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { bookingApi } from '@/lib/api';

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('nl-NL', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}
function fmtTime(t?: string | null) { return t ? t.slice(0, 5) : null; }

// ── EU License Plate (editable) ───────────────────────────────────────────────
function EuPlateInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'stretch', border: '1.5px solid #999', borderRadius: 5, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
      <div style={{ background: '#003399', width: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2px 0', gap: 1, flexShrink: 0 }}>
        <div style={{ fontSize: 7, color: '#FFD700', lineHeight: 1 }}>★★★</div>
        <div style={{ fontSize: 7, color: 'white', fontWeight: 900 }}>NL</div>
      </div>
      <input
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value.toUpperCase().replace(/\s/g, '-'))}
        placeholder="AB-123-C"
        style={{
          background: '#FFDD00', border: 'none', outline: 'none',
          padding: '5px 10px', minWidth: 90, width: `${Math.max(value.length, 7) * 11 + 20}px`,
          fontFamily: 'Arial, sans-serif', fontWeight: 700,
          fontSize: 15, color: '#000', letterSpacing: 2.5,
          cursor: disabled ? 'default' : 'text',
        }}
      />
    </div>
  );
}

// ── FerryPicker ───────────────────────────────────────────────────────────────
function FerryPicker({ label, date, destination, direction, currentTime, selectedTime, onSelect }: {
  label: string; date: string; destination: string; direction: string;
  currentTime?: string | null; selectedTime: string; onSelect: (t: string) => void;
}) {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(false);
  const load = useCallback(() => {
    if (!date || !destination) return;
    setLoading(true);
    bookingApi.getFerries(date, destination, direction)
      .then(d => setSchedules(d.schedules || []))
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false));
  }, [date, destination, direction]);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
      {currentTime && <div style={{ fontSize: 12, color: '#7090b0', marginBottom: 8 }}>Huidig: <strong style={{ color: '#142440' }}>{fmtTime(currentTime)}</strong></div>}
      {loading && <div style={{ fontSize: 12, color: '#7090b0' }}>Laden…</div>}
      {!loading && !manual && schedules.length > 0 && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {schedules.map(s => {
              const time = s.departureTime?.slice(0, 5) || '';
              const sel = selectedTime === time;
              return (
                <button key={s.id || time} onClick={() => onSelect(time)} style={{ padding: '8px 14px', borderRadius: 8, cursor: 'pointer', border: sel ? '2px solid #19499e' : '1px solid rgba(10,34,64,0.15)', background: sel ? '#eaf1fb' : 'white', fontWeight: sel ? 800 : 600, color: sel ? '#19499e' : '#142440', fontSize: 15, minWidth: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  {time}
                  {s.isFast && <span style={{ fontSize: 9, color: '#19499e', fontWeight: 700 }}>SNEL</span>}
                  {sel && <CheckIcon style={{ width: 11, height: 11, color: '#19499e' }} />}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => setManual(true)} style={{ fontSize: 12, color: '#9aafbf', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Handmatig invoeren</button>
        </>
      )}
      {(!loading && (schedules.length === 0 || manual)) && (
        <>
          {schedules.length === 0 && !loading && <div style={{ fontSize: 12, color: '#7090b0', marginBottom: 6 }}>Geen rooster gevonden — voer handmatig in:</div>}
          <input type="time" value={selectedTime} onChange={e => onSelect(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 14, color: '#142440', boxSizing: 'border-box' }} />
          {manual && schedules.length > 0 && <button type="button" onClick={() => setManual(false)} style={{ fontSize: 12, color: '#9aafbf', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}>Terug naar rooster</button>}
        </>
      )}
      {selectedTime && (
        <div style={{ marginTop: 8, fontSize: 13, color: '#19499e', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
          <CheckIcon style={{ width: 14, height: 14 }} />Geselecteerd: {selectedTime}
        </div>
      )}
    </div>
  );
}

// ── Ferry Modal ───────────────────────────────────────────────────────────────
function FerryModal({ res, groupToken, onSaved, onClose }: {
  res: any; groupToken: string; onSaved: () => void; onClose: () => void;
}) {
  const dest = (res.ferry_outbound_destination || res.ferry_return_destination || 'terschelling') as 'terschelling' | 'vlieland';
  const [outboundDest, setOutboundDest] = useState<'terschelling' | 'vlieland'>(dest === 'vlieland' ? 'vlieland' : 'terschelling');
  const [returnDest, setReturnDest] = useState<'terschelling' | 'vlieland'>(res.ferry_return_destination === 'vlieland' ? 'vlieland' : 'terschelling');
  const [outboundTime, setOutboundTime] = useState(fmtTime(res.ferry_outbound_time) || '');
  const [returnTime, setReturnTime] = useState(fmtTime(res.ferry_return_time) || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const DestToggle = ({ value, onChange }: { value: 'terschelling' | 'vlieland'; onChange: (d: 'terschelling' | 'vlieland') => void }) => (
    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
      {(['terschelling', 'vlieland'] as const).map(d => (
        <button key={d} type="button" onClick={() => onChange(d)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, border: value === d ? '1.5px solid #19499e' : '1px solid rgba(10,34,64,0.15)', background: value === d ? '#eaf1fb' : 'white', color: value === d ? '#19499e' : '#7090b0', cursor: 'pointer' }}>
          {d === 'terschelling' ? 'Terschelling' : 'Vlieland'}
        </button>
      ))}
    </div>
  );

  async function save() {
    if (!outboundTime && !returnTime) { setError('Selecteer ten minste één boottijd.'); return; }
    setSaving(true); setError('');
    try {
      await bookingApi.groupModifyFerry(groupToken, res.id, outboundTime || undefined, returnTime || undefined, outboundTime ? outboundDest : undefined, returnTime ? returnDest : undefined);
      onSaved(); onClose();
    } catch (e: any) { setError(e.message); setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,34,64,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', padding: '20px 18px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#142440' }}>⛴ Boottijden wijzigen</div>
          <button onClick={onClose} style={{ background: '#f0f2f5', border: 'none', borderRadius: 20, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <XMarkIcon style={{ width: 14, height: 14, color: '#556070' }} />
          </button>
        </div>

        {error && <div style={{ background: '#fdeaea', borderRadius: 8, padding: '8px 12px', color: '#8a2020', fontSize: 13, marginBottom: 14 }}>{error}</div>}

        <div style={{ fontSize: 12, fontWeight: 700, color: '#9aafbf', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Heenreis · {fmtDate(res.arrival_date)}</div>
        <DestToggle value={outboundDest} onChange={d => { setOutboundDest(d); setOutboundTime(''); }} />
        <FerryPicker
          label={`Heen → ${outboundDest === 'terschelling' ? 'Terschelling' : 'Vlieland'}`}
          date={res.arrival_date?.slice(0, 10)} destination={outboundDest} direction="outbound"
          currentTime={res.ferry_outbound_time} selectedTime={outboundTime} onSelect={setOutboundTime}
        />

        <div style={{ borderTop: '1px solid #eef1f5', margin: '6px 0 16px' }} />

        <div style={{ fontSize: 12, fontWeight: 700, color: '#9aafbf', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Terugreis · {fmtDate(res.departure_date)}</div>
        <DestToggle value={returnDest} onChange={d => { setReturnDest(d); setReturnTime(''); }} />
        <FerryPicker
          label={`Terug ← ${returnDest === 'terschelling' ? 'Terschelling' : 'Vlieland'}`}
          date={res.departure_date?.slice(0, 10)} destination={returnDest} direction="return"
          currentTime={res.ferry_return_time} selectedTime={returnTime} onSelect={setReturnTime}
        />

        <button onClick={save} disabled={saving || (!outboundTime && !returnTime)} style={{ width: '100%', padding: '13px', borderRadius: 10, background: (saving || (!outboundTime && !returnTime)) ? '#ccc' : '#142440', color: 'white', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          {saving ? 'Opslaan…' : <><CheckIcon style={{ width: 16, height: 16 }} />Boottijden opslaan</>}
        </button>
      </div>
    </div>
  );
}

// ── EV Modal ──────────────────────────────────────────────────────────────────
function EvModal({ res, evServices, groupToken, onSaved, onClose }: {
  res: any; evServices: any[]; groupToken: string; onSaved: () => void; onClose: () => void;
}) {
  const [evSelections, setEvSelections] = useState<Record<string, { serviceId: string | null; kwh?: number }>>(
    Object.fromEntries((res.vehicles || []).map((v: any) => [v.id, { serviceId: v.ev_service_id || null, kwh: v.ev_kwh || undefined }]))
  );
  const [rdwData, setRdwData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (res.vehicles || []).forEach((v: any) => {
      const plate = v.license_plate?.replace(/[-\s]/g, '').toUpperCase();
      if (!plate) return;
      bookingApi.lookupPlate(plate).then(d => setRdwData(prev => ({ ...prev, [v.id]: d }))).catch(() => {});
    });
  }, []);

  async function saveEv(vehicleId: string) {
    const sel = evSelections[vehicleId];
    setSaving(vehicleId); setError('');
    try {
      await bookingApi.groupModifyEv(groupToken, res.id, vehicleId, sel.serviceId, sel.kwh);
      onSaved();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(null); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,34,64,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', padding: '20px 18px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#142440' }}>⚡ Auto opladen</div>
          <button onClick={onClose} style={{ background: '#f0f2f5', border: 'none', borderRadius: 20, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <XMarkIcon style={{ width: 14, height: 14, color: '#556070' }} />
          </button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#7090b0', lineHeight: 1.5 }}>Laden buiten de stalling (verzekeringseis). Wij sluiten de kabel aan bij aankomst.</p>
        {error && <div style={{ background: '#fdeaea', borderRadius: 8, padding: '8px 12px', color: '#8a2020', fontSize: 13, marginBottom: 14 }}>{error}</div>}

        {(res.vehicles || []).map((v: any) => {
          const rdw = rdwData[v.id];
          const fuelLower = rdw?.fuelType?.toLowerCase() || '';
          const isEv = fuelLower.includes('electr') || fuelLower.includes('elektr') || fuelLower.includes('electric') || rdw?.ev?.batteryCapacityKwh;
          const sel = evSelections[v.id];
          const ev = rdw?.ev;
          const isBev = ev?.isBev ?? true;
          const battKwh = ev?.batteryCapacityKwh;
          const kmPerKwh = ev?.realisticKmPerKwh;
          const suggestedKwh = ev?.suggestedKwh ?? null;
          const suggestedTier: any = suggestedKwh !== null
            ? (evServices.filter((s: any) => s.kwh >= suggestedKwh).sort((a: any, b: any) => a.kwh - b.kwh)[0] ?? evServices[evServices.length - 1])
            : battKwh
              ? (evServices.reduce((best: any, s: any) => { if (s.kwh >= battKwh && (!best || s.kwh < best.kwh)) return s; return best; }, null) || evServices[evServices.length - 1])
              : null;
          const suggestedIdx = suggestedTier ? evServices.findIndex((s: any) => s.id === suggestedTier.id) : -1;
          const maxTier: any = suggestedIdx >= 0 && suggestedIdx < evServices.length - 1 ? evServices[suggestedIdx + 1] : suggestedTier;
          const availableSvcs: any[] = suggestedIdx >= 0 ? evServices.slice(0, suggestedIdx + 2) : evServices;

          return (
            <div key={v.id} style={{ marginBottom: 16, background: '#f8fafc', borderRadius: 10, padding: '14px', border: '1px solid rgba(10,34,64,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <EuPlateInput value={v.license_plate || ''} onChange={() => {}} disabled />
                {rdw?.make && <span style={{ fontSize: 12, color: '#7090b0' }}>{rdw.make} {rdw.model}</span>}
                {!rdw && <span style={{ fontSize: 12, color: '#bcc8d4' }}>Ophalen…</span>}
              </div>
              {rdw && !isEv && <div style={{ fontSize: 12, color: '#7090b0', fontStyle: 'italic' }}>Auto opladen niet beschikbaar voor dit voertuig.</div>}
              {(!rdw || isEv) && (
                <>
                  {battKwh && <div style={{ fontSize: 12, color: '#556070', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}><Battery50Icon style={{ width: 14, height: 14 }} />~{battKwh} kWh{kmPerKwh ? ` · ca. ${kmPerKwh} km/kWh` : ''}{!isBev ? ' · plug-in hybride' : ''}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10, paddingTop: 4 }}>
                    <button onClick={() => setEvSelections(prev => ({ ...prev, [v.id]: { serviceId: null } }))} style={{ padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: !sel.serviceId ? '2px solid #142440' : '1px solid rgba(10,34,64,0.15)', background: !sel.serviceId ? '#142440' : 'white', color: !sel.serviceId ? 'white' : '#142440' }}>Geen laden</button>
                    {evServices.map((s: any) => {
                      const isSuggested = suggestedTier !== null && s.kwh === suggestedTier.kwh;
                      const isExtraTier = suggestedTier !== null && maxTier !== null && maxTier.kwh !== suggestedTier.kwh && s.kwh === maxTier.kwh;
                      const isSel = sel.serviceId === s.id;
                      const extraKm = battKwh && kmPerKwh ? Math.round(Math.min(s.kwh, battKwh) * kmPerKwh) : Math.round(s.kwh * 5);
                      return (
                        <button key={s.id} onClick={() => setEvSelections(prev => ({ ...prev, [v.id]: { serviceId: s.id, kwh: s.kwh } }))}
                          style={{ position: 'relative', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: isSel ? '2px solid #19499e' : '1px solid rgba(10,34,64,0.15)', background: isSel ? '#eaf1fb' : 'white', color: isSel ? '#19499e' : '#142440' }}>
                          {isSuggested && !isSel && <div style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', background: '#3a80c0', color: 'white', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, whiteSpace: 'nowrap' }}>aanbevolen</div>}
                          {isExtraTier && !isSel && <div style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', background: '#8a6020', color: 'white', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, whiteSpace: 'nowrap' }}>{isBev ? 'meer bereik' : 'zeker vol'}</div>}
                          <div style={{ fontWeight: 800 }}>{s.kwh} kWh</div>
                          <div style={{ fontSize: 11, color: isSel ? '#19499e' : '#7090b0' }}>+€{parseFloat(s.price).toFixed(2)}</div>
                          {extraKm > 0 && <div style={{ fontSize: 10, color: isSel ? '#19499e' : '#7090b0', marginTop: 1 }}>+{extraKm} km</div>}
                        </button>
                      );
                    })}
                  </div>
                  {sel.serviceId && (() => {
                    const svc = evServices.find((s: any) => s.id === sel.serviceId);
                    if (!svc || !battKwh || !kmPerKwh) return null;
                    const isExtra = suggestedTier !== null && maxTier !== null && maxTier.kwh !== suggestedTier.kwh && svc.kwh === maxTier.kwh;
                    const realisticKm = Math.round(Math.min(svc.kwh, battKwh) * kmPerKwh);
                    return isExtra && !isBev ? (
                      <div style={{ background: '#fff8e6', border: '0.5px solid #e8a020', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: '#7a5010', marginBottom: 10 }}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>Vrijwel zeker volledig geladen (~100%)</div>
                        <div>De geselecteerde hoeveelheid is groter dan de accucapaciteit. Wij laden wat er in past — doorgaans tot 100%. Het extra bereik bedraagt ca. +{realisticKm} km. Mocht er onverhoopt minder ingaan dan besteld, vindt er geen restitutie plaats.</div>
                      </div>
                    ) : (
                      <div style={{ background: '#eaf1fb', border: '1px solid #19499e', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: '#123a80', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                        <CheckIcon style={{ width: 13, height: 13, flexShrink: 0 }} />{svc.kwh} kWh laden · +{realisticKm} km realistisch extra bereik
                      </div>
                    );
                  })()}
                  <button onClick={() => saveEv(v.id)} disabled={saving === v.id} style={{ width: '100%', padding: '10px', borderRadius: 9, background: saving === v.id ? '#ccc' : '#19499e', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {saving === v.id ? 'Opslaan…' : <><CheckIcon style={{ width: 14, height: 14 }} />Laadkeuze opslaan</>}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9aafbf', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '9px 11px', border: '1px solid rgba(10,34,64,0.14)', borderRadius: 8, fontSize: 13, color: '#142440', background: 'white', boxSizing: 'border-box' as const, outline: 'none', fontWeight: 500 }} />
    </div>
  );
}

// ── ReservationCard ───────────────────────────────────────────────────────────
function ReservationCard({ res, evServices, groupToken, onSaved }: {
  res: any; evServices: any[]; groupToken: string; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [firstName, setFirstName] = useState(res.first_name || '');
  const [lastName, setLastName] = useState(res.last_name || '');
  const [phone, setPhone] = useState(res.phone || '');
  const [plateValues, setPlateValues] = useState<{ vehicleId: string; plate: string }[]>(
    (res.vehicles || []).map((v: any) => ({ vehicleId: v.id, plate: v.license_plate || '' }))
  );
  const [ferryModal, setFerryModal] = useState(false);
  const [evModal, setEvModal] = useState(false);
  const [vehicleEvStatus, setVehicleEvStatus] = useState<Record<string, boolean | null>>({});

  useEffect(() => {
    (res.vehicles || []).forEach((v: any) => {
      const plate = v.license_plate?.replace(/[-\s]/g, '').toUpperCase();
      if (!plate) { setVehicleEvStatus(s => ({ ...s, [v.id]: false })); return; }
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
      fetch(`${apiUrl}/vehicles/rdw/${plate}`)
        .then(r => r.ok ? r.json() : null)
        .then(rdw => {
          if (!rdw?.found) { setVehicleEvStatus(s => ({ ...s, [v.id]: false })); return; }
          const fuel = rdw?.fuelType?.toLowerCase() || '';
          const isEv = fuel.includes('electr') || fuel.includes('elektr') || rdw?.ev?.batteryCapacityKwh;
          setVehicleEvStatus(s => ({ ...s, [v.id]: !!isEv }));
        })
        .catch(() => setVehicleEvStatus(s => ({ ...s, [v.id]: null })));
    });
  }, []);

  const hasChanges =
    firstName.trim() !== (res.first_name || '').trim() ||
    lastName.trim() !== (res.last_name || '').trim() ||
    phone.trim() !== (res.phone || '').trim() ||
    plateValues.some(p => p.plate.trim() !== (res.vehicles.find((v: any) => v.id === p.vehicleId)?.license_plate || ''));

  const isEditable = !['cancelled', 'completed'].includes(res.status);

  async function saveDetails() {
    setSaving(true); setError(''); setSaved(false);
    try {
      const changedPlates = plateValues.filter(p =>
        p.plate.trim() !== (res.vehicles.find((v: any) => v.id === p.vehicleId)?.license_plate || '')
      );
      await bookingApi.groupModifyDetails(
        groupToken, res.id, firstName.trim(), lastName.trim(), phone.trim(),
        changedPlates.length > 0 ? changedPlates.map(p => ({ vehicleId: p.vehicleId, newPlate: p.plate.trim().toUpperCase() })) : undefined,
      );
      setSaved(true); setTimeout(() => setSaved(false), 3000); onSaved();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  const statusCfg: Record<string, { bg: string; color: string; label: string }> = {
    booked:     { bg: '#e8f0fe', color: '#1a4fa0', label: 'Geboekt' },
    checked_in: { bg: '#eaf1fb', color: '#19499e', label: 'Ingecheckt' },
    cancelled:  { bg: '#fdeaea', color: '#8a2020', label: 'Geannuleerd' },
    completed:  { bg: '#f4f6f9', color: '#7090b0', label: 'Afgerond' },
  };
  const sc = statusCfg[res.status] || { bg: '#f4f6f9', color: '#7090b0', label: res.status };

  return (
    <>
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid rgba(10,34,64,0.09)', marginBottom: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(10,34,64,0.07)' }}>

        {/* ── Header: datum + status + boottijden ── */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(10,34,64,0.07)', background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: '#142440' }}>{fmtDate(res.arrival_date)}</span>
                <span style={{ color: '#bcc8d4', fontSize: 11 }}>→</span>
                <span style={{ fontWeight: 800, fontSize: 13, color: '#142440' }}>{fmtDate(res.departure_date)}</span>
                {res.nights != null && <span style={{ fontSize: 10, background: '#eef1f6', borderRadius: 20, padding: '1px 7px', color: '#7090b0' }}>{res.nights + 1} dagen</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {res.ferry_outbound_time || res.ferry_return_time ? (
                  <>
                    {res.ferry_outbound_time && (
                      <span style={{ fontSize: 12, background: '#eef2fb', color: '#1a4fa0', borderRadius: 20, padding: '2px 9px', fontWeight: 600 }}>
                        ⛴ heen {fmtTime(res.ferry_outbound_time)}
                      </span>
                    )}
                    {res.ferry_return_time && (
                      <span style={{ fontSize: 12, background: '#eef2fb', color: '#1a4fa0', borderRadius: 20, padding: '2px 9px', fontWeight: 600 }}>
                        ⛴ terug {fmtTime(res.ferry_return_time)}
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 11, color: '#bcc8d4' }}>Geen boottijden</span>
                )}
                {isEditable && (
                  <button onClick={() => setFerryModal(true)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, border: '1px solid rgba(10,34,64,0.15)', background: 'white', color: '#556070', cursor: 'pointer' }}>
                    Wijzigen
                  </button>
                )}
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '3px 10px', background: sc.bg, color: sc.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {sc.label}
            </span>
          </div>
        </div>

        {/* ── Body: editeerbare velden ── */}
        <div style={{ padding: '14px' }}>
          {error && <div style={{ background: '#fdeaea', borderRadius: 8, padding: '8px 12px', color: '#8a2020', fontSize: 13, marginBottom: 12 }}>{error}</div>}
          {saved && (
            <div style={{ background: '#eaf1fb', border: '1px solid #19499e', borderRadius: 8, padding: '7px 12px', fontSize: 13, color: '#19499e', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckIcon style={{ width: 14, height: 14 }} />Opgeslagen ✓
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ flex: '1 1 120px', minWidth: 100 }}>
              <Field label="Voornaam" value={firstName} onChange={setFirstName} placeholder="Voornaam" />
            </div>
            <div style={{ flex: '1 1 120px', minWidth: 100 }}>
              <Field label="Achternaam" value={lastName} onChange={setLastName} placeholder="Achternaam" />
            </div>
            <div style={{ flex: '1 1 150px', minWidth: 130 }}>
              <Field label="Telefoon" value={phone} onChange={setPhone} placeholder="+31 6 00000000" type="tel" />
            </div>
          </div>

          {plateValues.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9aafbf', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                {plateValues.length > 1 ? 'Kentekens' : 'Kenteken'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {plateValues.map((pv, i) => (
                  <EuPlateInput
                    key={pv.vehicleId}
                    value={pv.plate}
                    onChange={val => setPlateValues(prev => prev.map((p, j) => j === i ? { ...p, plate: val } : p))}
                  />
                ))}
                {isEditable && evServices.length > 0 && (res.vehicles || []).some((v: any) => vehicleEvStatus[v.id] !== false) && (
                  <button onClick={() => setEvModal(true)} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid rgba(10,34,64,0.14)', background: '#f8fafc', color: '#19499e', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <BoltIcon style={{ width: 13, height: 13 }} />Opladen
                    {res.vehicles?.some((v: any) => v.ev_service_id) && <CheckIcon style={{ width: 11, height: 11, color: '#19499e' }} />}
                  </button>
                )}
                {isEditable && hasChanges && (
                  <button onClick={saveDetails} disabled={saving} style={{ padding: '6px 13px', borderRadius: 8, background: saving ? '#ccc' : '#1a7a3a', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {saving ? 'Opslaan…' : <><CheckIcon style={{ width: 13, height: 13 }} />Opslaan</>}
                  </button>
                )}
                {saved && !hasChanges && (
                  <span style={{ fontSize: 12, color: '#1a7a3a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckIcon style={{ width: 13, height: 13 }} />Opgeslagen
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {ferryModal && <FerryModal res={res} groupToken={groupToken} onSaved={onSaved} onClose={() => setFerryModal(false)} />}
      {evModal && <EvModal res={res} evServices={evServices} groupToken={groupToken} onSaved={onSaved} onClose={() => setEvModal(false)} />}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function GroepWijzigenSinglePage({ params }: { params: { token: string; resId: string } }) {
  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load() {
    bookingApi.getInvoiceGroupByToken(params.token)
      .then(setGroup).catch((e: any) => setError(e.message)).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [params.token]);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#7090b0', fontSize: 15 }}>Laden…</div>
    </div>
  );
  if (error) return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 14, padding: '32px 28px', maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <h2 style={{ margin: '0 0 8px', color: '#142440' }}>Link niet gevonden</h2>
        <p style={{ color: '#7090b0', fontSize: 14 }}>{error}</p>
      </div>
    </div>
  );

  const evServices: any[] = group?.evServices || [];
  const res = (group?.reservations || []).find((r: any) => r.id === params.resId);

  if (!res) return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 14, padding: '32px 28px', maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <h2 style={{ margin: '0 0 8px', color: '#142440' }}>Boeking niet gevonden</h2>
        <p style={{ color: '#7090b0', fontSize: 14 }}>Deze link is niet geldig of de boeking bestaat niet meer.</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', padding: '20px 16px 48px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, background: '#142440', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color: '#FFDD00', flexShrink: 0 }}>AB</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#142440', lineHeight: 1.2 }}>Gegevens wijzigen</div>
            <div style={{ fontSize: 12, color: '#9aafbf', marginTop: 1 }}>Autostalling De Bazuin · {group?.reference}</div>
          </div>
        </div>

        <ReservationCard res={res} evServices={evServices} groupToken={params.token} onSaved={load} />

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#9aafbf' }}>
          Vragen? Mail <a href="mailto:info@parkeren-harlingen.nl" style={{ color: '#19499e', fontWeight: 600 }}>info@parkeren-harlingen.nl</a>
        </div>
      </div>
    </div>
  );
}
