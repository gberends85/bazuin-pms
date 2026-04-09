'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster from '@/components/ui/Toast';
import { toast, toastError } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import PlateTooltip from '@/components/ui/PlateTooltip';
import { api } from '@/lib/api';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDateLong(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
}
function toIso(d: Date) { return d.toISOString().split('T')[0]; }
function addDays(iso: string, n: number) {
  const d = new Date(iso); d.setDate(d.getDate() + n); return toIso(d);
}
function waLink(phone: string) {
  const digits = phone.replace(/^0/, '31').replace(/\D/g, '');
  return `https://wa.me/${digits}`;
}

// ─── Detail Panel ────────────────────────────────────────────────────────────

function DetailPanel({ res, onClose, onUpdate }: { res: any; onClose: () => void; onUpdate: () => void }) {
  const [plates, setPlates] = useState<string[]>((res.plates || '').split(', ').filter(Boolean));
  const [outTime, setOutTime] = useState(res.ferry_outbound_time || '');
  const [retTime, setRetTime] = useState(res.ferry_return_time || '');
  const [spot, setSpot] = useState(res.parking_spot || '');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundPct, setRefundPct] = useState(100);
  const [reason, setReason] = useState('');

  const isCheckedIn = res.status === 'checked_in';

  const label: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 5 };
  const input: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14, color: '#0a2240', boxSizing: 'border-box' };
  const section: React.CSSProperties = { padding: '12px 20px', borderBottom: '0.5px solid rgba(10,34,64,0.08)' };

  async function save() {
    setSaving(true);
    try {
      await api.reservations.update(res.id, {
        ferryOutboundTime: outTime || undefined,
        ferryReturnTime: retTime || undefined,
        parkingSpot: spot || undefined,
        vehicles: plates.map((p, i) => ({ license_plate: p.toUpperCase().replace(/\s/g, '-'), sort_order: i })),
      });
      toast('Opgeslagen ✓'); onUpdate();
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  async function doCheckin() {
    setLoading(true);
    try {
      await api.reservations.checkin(res.id, spot || undefined);
      toast('Ingecheckt ✓'); setCheckinOpen(false); onUpdate(); onClose();
    } catch (e: any) { toastError(e.message); }
    finally { setLoading(false); }
  }

  async function doCancel() {
    setLoading(true);
    try {
      const r = await api.reservations.cancel(res.id, refundPct, reason);
      toast(`Geannuleerd — €${r.refundAmount} restitutie`);
      setCancelOpen(false); onUpdate(); onClose();
    } catch (e: any) { toastError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,34,64,0.2)', zIndex: 9000 }} />
      {/* Panel */}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, maxWidth: '100vw', background: 'white', boxShadow: '-4px 0 28px rgba(10,34,64,0.14)', zIndex: 9001, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '0.5px solid rgba(10,34,64,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0a2240' }}>{res.first_name} {res.last_name}</div>
            <div style={{ fontSize: 11, color: '#7090b0' }}>#{res.reference} · {isCheckedIn ? '✓ Ingecheckt' : 'Te inchecken'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#7090b0', cursor: 'pointer', padding: '4px 8px', lineHeight: 1 }}>✕</button>
        </div>

        {/* Periode */}
        <div style={section}>
          <label style={label}>Periode</label>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0a2240' }}>
            {fmtDateLong(res.arrival_date)} → {fmtDateLong(res.departure_date)}
          </div>
          <div style={{ fontSize: 11, color: '#7090b0', marginTop: 3 }}>{res.nights} nacht{res.nights !== 1 ? 'en' : ''} · {res.vehicle_count} auto{res.vehicle_count !== 1 ? "'s" : ''}</div>
        </div>

        {/* Kentekens */}
        <div style={section}>
          <label style={label}>Kenteken{plates.length > 1 ? 's' : ''}</label>
          {plates.map((p, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <input value={p} onChange={e => { const n = [...plates]; n[i] = e.target.value; setPlates(n); }}
                style={{ ...input, fontFamily: 'monospace', fontSize: 16, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}
                placeholder="AA-BB-11" />
            </div>
          ))}
        </div>

        {/* Heenreis */}
        <div style={section}>
          <label style={label}>Heenreis {res.ferry_outbound_destination ? `· ${res.ferry_outbound_destination}` : ''}</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="time" value={outTime} onChange={e => setOutTime(e.target.value)} style={{ ...input, width: 120 }} />
            {res.ferry_outbound_name && <span style={{ fontSize: 12, color: '#7090b0' }}>{res.ferry_outbound_name}</span>}
          </div>
        </div>

        {/* Terugreis */}
        <div style={section}>
          <label style={label}>Terugreis · {fmtDateLong(res.departure_date)}</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="time" value={retTime} onChange={e => setRetTime(e.target.value)} style={{ ...input, width: 120 }} />
            {res.ferry_return_name && <span style={{ fontSize: 12, color: '#7090b0' }}>{res.ferry_return_name}</span>}
          </div>
          {res.ferry_return_arrival_harlingen && (
            <div style={{ fontSize: 11, color: '#7090b0', marginTop: 6 }}>Aankomst Harlingen: <strong>{res.ferry_return_arrival_harlingen}</strong></div>
          )}
        </div>

        {/* Parkeervak */}
        <div style={section}>
          <label style={label}>Parkeervak</label>
          <input value={spot} onChange={e => setSpot(e.target.value)} style={{ ...input, width: 150 }} placeholder="Bijv. B-07" />
        </div>

        {/* Opmerking klant */}
        {res.admin_notes && (
          <div style={{ ...section, background: '#fffbf0' }}>
            <label style={{ ...label, color: '#9a6010' }}>💬 Opmerking klant</label>
            <div style={{ fontSize: 13, color: '#5a3a00', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{res.admin_notes}</div>
          </div>
        )}

        {/* Opslaan */}
        <div style={{ padding: '12px 20px', borderBottom: '0.5px solid rgba(10,34,64,0.08)' }}>
          <button onClick={save} disabled={saving} className="btn btn-primary" style={{ width: '100%' }}>
            {saving ? 'Opslaan...' : '✓ Wijzigingen opslaan'}
          </button>
        </div>

        {/* Acties */}
        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!isCheckedIn && res.status === 'booked' && (
            <button className="btn btn-primary" onClick={() => setCheckinOpen(true)}>✓ Inchecken</button>
          )}
          {res.status !== 'cancelled' && res.status !== 'completed' && (
            <button className="btn btn-danger btn-sm" onClick={() => setCancelOpen(true)}>✕ Annuleren</button>
          )}
          {res.phone && (
            <a href={waLink(res.phone)} target="_blank" rel="noopener" className="btn btn-wa btn-sm" style={{ textAlign: 'center', textDecoration: 'none' }}>
              📱 WhatsApp {res.first_name}
            </a>
          )}
          <a href={`/reservations/${res.id}`} style={{ textAlign: 'center', fontSize: 11, color: '#7090b0', textDecoration: 'none', marginTop: 4 }}>
            Volledige reservering →
          </a>
        </div>
      </div>

      {/* Inchecken modal */}
      <Modal open={checkinOpen} onClose={() => setCheckinOpen(false)} title="Inchecken">
        <div style={{ fontSize: 13, color: '#555', marginBottom: 14 }}><strong>{res.first_name} {res.last_name}</strong> ({res.plates}) inchecken.</div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...label, display: 'block', marginBottom: 6 }}>Vaknummer (optioneel)</label>
          <input value={spot} onChange={e => setSpot(e.target.value)} placeholder="Bijv. B-07" style={input} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setCheckinOpen(false)}>Annuleren</button>
          <button className="btn btn-primary" onClick={doCheckin} disabled={loading}>✓ Bevestig inchecken</button>
        </div>
      </Modal>

      {/* Annuleren modal */}
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Reservering annuleren">
        <div style={{ marginBottom: 14 }}>
          <label style={{ ...label, display: 'block', marginBottom: 8 }}>Restitutiepercentage</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="range" min={0} max={100} value={refundPct} onChange={e => setRefundPct(Number(e.target.value))} style={{ flex: 1 }} />
            <span style={{ fontWeight: 700, fontSize: 16, minWidth: 40 }}>{refundPct}%</span>
          </div>
          <div style={{ fontSize: 13, color: '#7090b0', marginTop: 6 }}>Restitutie: <strong>€ {(Number(res.total_price) * refundPct / 100).toFixed(2)}</strong></div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...label, display: 'block', marginBottom: 6 }}>Reden (optioneel)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reden annulering..." style={input} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setCancelOpen(false)}>Terug</button>
          <button className="btn btn-danger" onClick={doCancel} disabled={loading}>Bevestig annulering</button>
        </div>
      </Modal>
    </>
  );
}

// ─── Note Icon with popup ────────────────────────────────────────────────────

function NoteIcon({ note, onClick }: { note: string; onClick?: (e: React.MouseEvent) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [open, setOpen] = useState(false);

  function show(e: React.MouseEvent) {
    onClick?.(e);
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen(true);
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0, display: 'inline-flex' }}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        title="Opmerking van klant"
        style={{
          background: '#e8a020', color: 'white',
          borderRadius: 10, width: 16, height: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'default', fontSize: 10, fontWeight: 900, flexShrink: 0,
          boxShadow: '0 1px 3px rgba(232,160,32,0.4)',
        }}
      >
        !
      </div>
      {open && (
        <div
          style={{
            position: 'fixed', top: pos.top, left: pos.left,
            zIndex: 9999,
            background: 'white', border: '0.5px solid rgba(10,34,64,0.15)',
            borderRadius: 8, boxShadow: '0 4px 20px rgba(10,34,64,0.15)',
            padding: '12px 14px', maxWidth: 300, minWidth: 200,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9a6010', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>💬 Opmerking klant</div>
          <div style={{ fontSize: 13, color: '#0a2240', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{note}</div>
        </div>
      )}
    </div>
  );
}

// ─── Arrival Card (compact row) ──────────────────────────────────────────────

function ArrivalCard({ res, onSelect, onUpdate }: { res: any; onSelect: () => void; onUpdate: () => void }) {
  const isCheckedIn = res.status === 'checked_in';
  const plates = (res.plates || '').split(', ').filter(Boolean);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinMailOpen, setCheckinMailOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [spot, setSpot] = useState(res.parking_spot || '');
  const [mailMsg, setMailMsg] = useState('');
  const [refundPct, setRefundPct] = useState(100);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const carInfo = [res.rdw_color, res.rdw_make && res.rdw_model ? `${res.rdw_make} ${res.rdw_model}` : res.rdw_make || res.rdw_model].filter(Boolean).join(' · ');

  async function doCheckin() {
    setLoading(true);
    try { await api.reservations.checkin(res.id, spot || undefined); toast('Ingecheckt ✓'); setCheckinOpen(false); onUpdate(); }
    catch (e: any) { toastError(e.message); } finally { setLoading(false); }
  }
  async function doCheckinMail() {
    setLoading(true);
    try { await api.reservations.checkinMail(res.id, spot || undefined, mailMsg || undefined); toast('Ingecheckt + mail ✓'); setCheckinMailOpen(false); onUpdate(); }
    catch (e: any) { toastError(e.message); } finally { setLoading(false); }
  }
  async function doCancel() {
    setLoading(true);
    try { const r = await api.reservations.cancel(res.id, refundPct, reason); toast(`Geannuleerd — €${r.refundAmount}`); setCancelOpen(false); onUpdate(); }
    catch (e: any) { toastError(e.message); } finally { setLoading(false); }
  }

  function stopProp(e: React.MouseEvent) { e.stopPropagation(); }

  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 5 };
  const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14, color: '#0a2240', boxSizing: 'border-box' };

  const payBadge = res.payment_status === 'paid'
    ? <span style={{ fontSize: 9, fontWeight: 700, background: '#e8f5eb', color: '#2a7a3a', borderRadius: 3, padding: '1px 6px' }}>✓ betaald</span>
    : res.payment_status === 'on_site' || res.payment_method === 'on_site'
    ? <span style={{ fontSize: 9, fontWeight: 700, background: '#fff0cc', color: '#8a5f00', borderRadius: 3, padding: '1px 6px' }}>● ter plekke</span>
    : <span style={{ fontSize: 9, fontWeight: 700, background: '#fdeaea', color: '#8a2020', borderRadius: 3, padding: '1px 6px' }}>! open</span>;

  const actionBtns = (
    <div style={{ display: 'flex', gap: 4 }} onClick={stopProp}>
      {!isCheckedIn && res.status === 'booked' && (
        <>
          <button title="Inchecken" onClick={() => setCheckinOpen(true)}
            style={{ background: '#0a7c6e', border: 'none', color: 'white', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>✓</button>
          <button title="Inchecken + mail" onClick={() => setCheckinMailOpen(true)}
            style={{ background: '#0a2240', border: 'none', color: 'white', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 13 }}>✉</button>
        </>
      )}
      <button title="Envelop afdrukken" onClick={() => window.open(`/print/envelope/${res.id}`, '_blank')}
        style={{ background: '#f4f6f9', border: '0.5px solid rgba(10,34,64,0.2)', color: '#0a2240', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 13 }}>🖨</button>
      {res.status !== 'cancelled' && res.status !== 'completed' && (
        <button title="Annuleren" onClick={() => setCancelOpen(true)}
          style={{ background: 'none', border: '0.5px solid rgba(200,0,0,0.3)', color: '#c00', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 13 }}>✕</button>
      )}
    </div>
  );

  return (
    <>
      <div
        onClick={onSelect}
        style={{
          background: 'white', borderRadius: 8, marginBottom: 5,
          border: isCheckedIn ? '1.5px solid #0a7c6e' : '0.5px solid rgba(10,34,64,0.1)',
          cursor: 'pointer', overflow: 'hidden',
        }}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 1px 8px rgba(10,34,64,0.08)')}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
      >
        {/* ── Desktop layout ─────────────────────────────────── */}
        <div className="arrival-row-desktop" style={{ alignItems: 'center', padding: '9px 12px', gap: 12 }}>
          {/* 1. Kenteken + auto info */}
          <div style={{ flexShrink: 0, width: 150 }}>
            {plates.map((p: string) => <PlateTooltip key={p} plate={p} />)}
            {carInfo && <div style={{ fontSize: 9, color: '#7090b0', marginTop: 3, lineHeight: 1.3 }}>{carInfo}</div>}
          </div>
          {/* 2. Naam + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.first_name} {res.last_name}</span>
              {isCheckedIn && <span style={{ fontSize: 9, fontWeight: 700, color: '#0a7c6e', background: '#e6f7f5', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>✓ IN</span>}
              {res.admin_notes && <NoteIcon note={res.admin_notes} onClick={stopProp} />}
            </div>
            <div style={{ fontSize: 10, color: '#9ab0c8', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>#{res.reference}</span>
              {res.phone && <a href={waLink(res.phone)} target="_blank" rel="noopener" onClick={stopProp} style={{ color: '#25D366', textDecoration: 'none', fontWeight: 600 }}>📱 WA</a>}
              {res.ev_kwh_total > 0 && <span style={{ color: '#0a7c6e', fontWeight: 700 }}>⚡ {res.ev_kwh_total} kWh</span>}
            </div>
            <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#0a2240' }}>€ {parseFloat(res.total_price || 0).toFixed(2)}</span>
              {payBadge}
            </div>
          </div>
          {/* 3. Heentijd */}
          <div style={{ flexShrink: 0, width: 170, paddingRight: 14, borderRight: '0.5px solid rgba(10,34,64,0.08)', marginRight: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#4a6080', marginBottom: 2, textTransform: 'capitalize' }}>{fmtDateLong(res.arrival_date)}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: '#0a2240', lineHeight: 1.1 }}>{res.ferry_outbound_time || '—'}</span>
              {res.ferry_outbound_arrival_island && <span style={{ fontSize: 13, fontWeight: 700, color: '#7090b0' }}>→ {res.ferry_outbound_arrival_island}</span>}
            </div>
          </div>
          {/* 4. Terugreis */}
          {res.ferry_return_time && (
            <div style={{ flexShrink: 0, width: 190 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#4a6080', marginBottom: 2, textTransform: 'capitalize' }}>← {fmtDateLong(res.departure_date)}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#7090b0' }}>{res.ferry_return_time}</span>
                {res.ferry_return_arrival_harlingen && <span style={{ fontSize: 20, fontWeight: 900, color: '#0a7c6e' }}>{res.ferry_return_arrival_harlingen}</span>}
              </div>
            </div>
          )}
          {/* 5. Knoppen */}
          <div style={{ flexShrink: 0 }}>{actionBtns}</div>
        </div>

        {/* ── Mobile layout ───────────────────────────────────── */}
        <div className="arrival-row-mobile" style={{ flexDirection: 'column', padding: '10px 12px', gap: 8 }}>
          {/* Bovenste rij: kenteken + status + knoppen */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Naam + badge */}
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0a2240', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {res.first_name} {res.last_name}
                {isCheckedIn && <span style={{ fontSize: 9, fontWeight: 700, color: '#0a7c6e', background: '#e6f7f5', borderRadius: 3, padding: '1px 5px' }}>✓ IN</span>}
                {res.admin_notes && <NoteIcon note={res.admin_notes} onClick={stopProp} />}
              </div>
              {/* Kentekens */}
              <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {plates.map((p: string) => <PlateTooltip key={p} plate={p} />)}
              </div>
              {carInfo && <div style={{ fontSize: 10, color: '#7090b0', marginTop: 3 }}>{carInfo}</div>}
            </div>
            <div onClick={stopProp}>{actionBtns}</div>
          </div>

          {/* Onderste rij: boottijd + prijs + meta */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            {/* Boottijd heen */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#0a2240' }}>{res.ferry_outbound_time || '—'}</span>
              {res.ferry_outbound_arrival_island && <span style={{ fontSize: 12, color: '#7090b0', fontWeight: 600 }}>→ {res.ferry_outbound_arrival_island}</span>}
            </div>
            {/* Prijs + betaalstatus */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0a2240' }}>€ {parseFloat(res.total_price || 0).toFixed(2)}</span>
              {payBadge}
            </div>
          </div>

          {/* Meta: reference + WA + EV */}
          <div style={{ fontSize: 11, color: '#9ab0c8', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>#{res.reference}</span>
            {res.phone && <a href={waLink(res.phone)} target="_blank" rel="noopener" onClick={stopProp} style={{ color: '#25D366', textDecoration: 'none', fontWeight: 600 }}>📱 WA</a>}
            {res.ev_kwh_total > 0 && <span style={{ color: '#0a7c6e', fontWeight: 700 }}>⚡ {res.ev_kwh_total} kWh</span>}
            {res.ferry_return_arrival_harlingen && <span>← {res.ferry_return_arrival_harlingen}</span>}
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal open={checkinOpen} onClose={() => setCheckinOpen(false)} title={`Inchecken — ${res.first_name} ${res.last_name}`}>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 14 }}>({res.plates}) · {res.ferry_outbound_time} {res.ferry_outbound_destination}</div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...lbl, display: 'block', marginBottom: 6 }}>Vaknummer (optioneel)</label>
          <input value={spot} onChange={e => setSpot(e.target.value)} placeholder="Bijv. B-07" style={inp} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setCheckinOpen(false)}>Annuleren</button>
          <button className="btn btn-primary" onClick={doCheckin} disabled={loading}>✓ Bevestig inchecken</button>
        </div>
      </Modal>

      <Modal open={checkinMailOpen} onClose={() => setCheckinMailOpen(false)} title={`Inchecken + mail — ${res.first_name}`}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ ...lbl, display: 'block', marginBottom: 6 }}>Vaknummer (optioneel)</label>
          <input value={spot} onChange={e => setSpot(e.target.value)} placeholder="Bijv. B-07" style={inp} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...lbl, display: 'block', marginBottom: 6 }}>Extra bericht (optioneel)</label>
          <textarea value={mailMsg} onChange={e => setMailMsg(e.target.value)} rows={3}
            style={{ ...inp, resize: 'vertical' }} placeholder="Bijv: laadkabel aangesloten..." />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setCheckinMailOpen(false)}>Annuleren</button>
          <button className="btn btn-navy" onClick={doCheckinMail} disabled={loading}>✓ Inchecken + mail</button>
        </div>
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Reservering annuleren">
        <div style={{ marginBottom: 14 }}>
          <label style={{ ...lbl, display: 'block', marginBottom: 8 }}>Restitutie</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="range" min={0} max={100} value={refundPct} onChange={e => setRefundPct(Number(e.target.value))} style={{ flex: 1 }} />
            <span style={{ fontWeight: 700, fontSize: 16, minWidth: 40 }}>{refundPct}%</span>
          </div>
          <div style={{ fontSize: 13, color: '#7090b0', marginTop: 6 }}>€ {(Number(res.total_price) * refundPct / 100).toFixed(2)}</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...lbl, display: 'block', marginBottom: 6 }}>Reden</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reden annulering..." style={inp} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setCancelOpen(false)}>Terug</button>
          <button className="btn btn-danger" onClick={doCancel} disabled={loading}>Bevestig annulering</button>
        </div>
      </Modal>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ArrivalsPage() {
  const todayIso = toIso(new Date());
  const [date, setDate] = useState(todayIso);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCheckedIn, setShowCheckedIn] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchIncludeAll, setSearchIncludeAll] = useState(false);
  const [selectedRes, setSelectedRes] = useState<any | null>(null);
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async (d?: string) => {
    setLoading(true);
    try { setData(await api.reservations.today(d || date)); }
    finally { setLoading(false); }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (searchQuery.length < 4) { setSearchResults(null); return; }
    setSearchLoading(true);
    searchTimer.current = setTimeout(async () => {
      try { const r = await api.reservations.search(searchQuery, searchIncludeAll); setSearchResults(r.data || []); }
      catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 300);
  }, [searchQuery, searchIncludeAll]);

  const arrivals = data?.arrivals || [];
  const toCheck = arrivals.filter((r: any) => r.status === 'booked');
  const checkedIn = arrivals.filter((r: any) => r.status === 'checked_in');
  const displayed = showCheckedIn ? checkedIn : toCheck;
  const isToday = date === todayIso;
  const isSearching = searchQuery.length >= 4;

  function changeDate(delta: number) { const d = addDays(date, delta); setDate(d); load(d); }

  function handleUpdate() {
    load();
    if (searchQuery.length >= 4) api.reservations.search(searchQuery, searchIncludeAll).then(r => setSearchResults(r.data || [])).catch(() => {});
    setSelectedRes(null);
  }

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '22px 24px', maxWidth: 1000 }}>

        {/* Header */}
        <h1 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 800, color: '#0a2240' }}>Aankomsten</h1>

        {/* Date nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <button onClick={() => changeDate(-1)} style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, padding: '6px 11px', cursor: 'pointer', fontSize: 13, color: '#0a2240' }}>‹</button>
          <input type="date" value={date}
            onChange={e => { if (e.target.value) { setDate(e.target.value); load(e.target.value); } }}
            style={{ border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: '#0a2240', fontWeight: 600, background: 'white' }} />
          <button onClick={() => changeDate(1)} style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, padding: '6px 11px', cursor: 'pointer', fontSize: 13, color: '#0a2240' }}>›</button>
          <span style={{ fontSize: 13, color: '#7090b0', textTransform: 'capitalize' }}>{fmtDateLong(date)}</span>
          {!isToday && <button onClick={() => { setDate(todayIso); load(todayIso); }} style={{ background: 'none', border: 'none', fontSize: 12, color: '#0a7c6e', cursor: 'pointer', textDecoration: 'underline' }}>Vandaag</button>}
          <button onClick={() => load()} style={{ marginLeft: 'auto', background: 'none', border: '0.5px solid rgba(10,34,64,0.15)', borderRadius: 6, padding: '5px 9px', fontSize: 11, color: '#7090b0', cursor: 'pointer' }}>↻</button>
          {arrivals.length > 0 && (
            <button
              onClick={() => window.open(`/print/envelopes?date=${date}`, '_blank')}
              style={{ background: '#0a2240', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              🖨 Enveloppen ({arrivals.length})
            </button>
          )}
        </div>

        {/* Filter toggles */}
        {!isSearching && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button onClick={() => setShowCheckedIn(false)}
              style={{ padding: '5px 12px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: !showCheckedIn ? '#0a2240' : 'rgba(10,34,64,0.07)', color: !showCheckedIn ? 'white' : '#0a2240' }}>
              Te inchecken {toCheck.length > 0 && `(${toCheck.length})`}
            </button>
            <button onClick={() => setShowCheckedIn(true)}
              style={{ padding: '5px 12px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: showCheckedIn ? '#0a7c6e' : 'rgba(10,34,64,0.07)', color: showCheckedIn ? 'white' : '#0a2240' }}>
              ✓ Ingecheckt {checkedIn.length > 0 && `(${checkedIn.length})`}
            </button>
          </div>
        )}

        {/* Zoekbalk */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ab0c8', fontSize: 13 }}>🔍</span>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Zoek op kenteken, naam of reserveringsnummer..."
              style={{ width: '100%', padding: '8px 34px 8px 32px', border: '0.5px solid rgba(10,34,64,0.18)', borderRadius: 8, fontSize: 13, color: '#0a2240', boxSizing: 'border-box', background: 'white' }} />
            {searchQuery && <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9ab0c8', cursor: 'pointer', fontSize: 14 }}>✕</button>}
          </div>
          {isSearching && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#7090b0', cursor: 'pointer', marginTop: 6 }}>
              <input type="checkbox" checked={searchIncludeAll} onChange={e => setSearchIncludeAll(e.target.checked)} />
              Inclusief ingecheckt, voltooid &amp; geannuleerd
              {searchLoading && <span style={{ marginLeft: 8 }}>Zoeken...</span>}
            </label>
          )}
          {searchQuery.length > 0 && searchQuery.length < 4 && (
            <div style={{ fontSize: 11, color: '#9ab0c8', marginTop: 4 }}>Typ minimaal 4 tekens</div>
          )}
        </div>

        {/* Resultaten */}
        {isSearching ? (
          searchResults === null || searchLoading
            ? <div style={{ color: '#7090b0', padding: 16 }}>Zoeken...</div>
            : searchResults.length === 0
              ? <div className="card" style={{ padding: 24, textAlign: 'center', color: '#7090b0' }}>Geen resultaten</div>
              : <>
                  <div style={{ fontSize: 11, color: '#7090b0', marginBottom: 8 }}>{searchResults.length} resultaten</div>
                  {searchResults.map((r: any) => <ArrivalCard key={r.id} res={r} onSelect={() => setSelectedRes(r)} onUpdate={handleUpdate} />)}
                </>
        ) : (
          <>
            {loading && <div style={{ color: '#7090b0', padding: 16 }}>Laden...</div>}
            {!loading && displayed.length === 0 && (
              <div className="card" style={{ padding: 28, textAlign: 'center', color: '#7090b0' }}>
                {showCheckedIn ? 'Niemand ingecheckt op deze dag' : 'Geen verwachte aankomsten'}
              </div>
            )}
            {!loading && displayed.map((r: any) => <ArrivalCard key={r.id} res={r} onSelect={() => setSelectedRes(r)} onUpdate={handleUpdate} />)}
          </>
        )}
      </div>

      {/* Detail panel */}
      {selectedRes && <DetailPanel res={selectedRes} onClose={() => setSelectedRes(null)} onUpdate={handleUpdate} />}
    </AdminLayout>
  );
}
