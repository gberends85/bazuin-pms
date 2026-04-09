'use client';
import { useState } from 'react';
import Link from 'next/link';
import PlateTooltip from '@/components/ui/PlateTooltip';
import Modal from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { toast, toastError } from '@/components/ui/Toast';

interface Props {
  res: any;
  onUpdate: () => void;
  showCheckin?: boolean;
  showCheckout?: boolean;
}

const WA_MESSAGES = [
  { label: '🚗 Auto staat klaar', text: 'Goedemorgen! Uw auto staat klaar voor vertrek bij Autostalling De Bazuin. Tot ziens!' },
  { label: '🔑 Welkomstbericht', text: 'Welkom bij Autostalling De Bazuin! Parkeer uw auto op de geel gemarkeerde vakken en werp uw sleutel in de kluis.' },
  { label: '⛴ Boot aangekomen', text: 'De boot is aangekomen in Harlingen. U kunt uw auto ophalen. Bel aan bij de intercom als de deur gesloten is.' },
];

export default function ReservationCard({ res, onUpdate, showCheckin = true, showCheckout = false }: Props) {
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinMailOpen, setCheckinMailOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [spot, setSpot] = useState('');
  const [msg, setMsg] = useState('');
  const [waMsg, setWaMsg] = useState(WA_MESSAGES[0].text);
  const [refundPct, setRefundPct] = useState(100);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const isCheckedIn = res.status === 'checked_in';
  const plates = res.plates?.split(', ') || [];

  async function doCheckin() {
    setLoading(true);
    try {
      await api.reservations.checkin(res.id, spot || undefined);
      toast('Ingecheckt ✓');
      setCheckinOpen(false); onUpdate();
    } catch(e: any) { toastError(e.message); } finally { setLoading(false); }
  }

  async function doCheckinMail() {
    setLoading(true);
    try {
      await api.reservations.checkinMail(res.id, spot || undefined, msg || undefined);
      toast('Ingecheckt + mail verstuurd ✓');
      setCheckinMailOpen(false); onUpdate();
    } catch(e: any) { toastError(e.message); } finally { setLoading(false); }
  }

  async function doCheckout() {
    setLoading(true);
    try {
      await api.reservations.checkout(res.id);
      toast('Uitgecheckt ✓');
      onUpdate();
    } catch(e: any) { toastError(e.message); } finally { setLoading(false); }
  }

  async function doCancel() {
    setLoading(true);
    try {
      const r = await api.reservations.cancel(res.id, refundPct, reason);
      toast(`Geannuleerd — €${r.refundAmount} restitutie`);
      setCancelOpen(false); onUpdate();
    } catch(e: any) { toastError(e.message); } finally { setLoading(false); }
  }

  async function openWa() {
    const r = await api.reservations.whatsapp(res.id, waMsg).catch(() => null);
    if (r?.waLink) window.open(r.waLink, '_blank');
    else toast('WhatsApp geopend (geen nummer bekend)');
    setWaOpen(false);
  }

  const statusColor: Record<string, string> = {
    booked: '#badge-booked', checked_in: 'badge-checked_in', completed: 'badge-completed',
    cancelled: 'badge-cancelled',
  };
  const payColor: Record<string, string> = { paid: 'badge-paid', on_site: 'badge-on_site', pending: 'badge-pending', refunded: 'badge-refunded' };
  const statusLabel: Record<string, string> = { booked: 'Geboekt', checked_in: 'Ingecheckt', completed: 'Voltooid', cancelled: 'Geannuleerd' };
  const payLabel: Record<string, string> = { paid: 'Betaald', on_site: 'Ter plekke', pending: 'Wacht', refunded: 'Terugbetaald' };

  return (
    <>
      <div className="card" style={{ marginBottom: 10, overflow: 'hidden', borderLeft: isCheckedIn ? '3px solid #0a7c6e' : '0.5px solid rgba(10,34,64,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', flexWrap: 'wrap' }}>
          {/* Plates */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
            {plates.map((p: string) => <PlateTooltip key={p} plate={p} />)}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240' }}>
              {res.first_name} {res.last_name}
              {res.vehicle_count > 1 && <span style={{ fontWeight: 400, color: '#7090b0', fontSize: 12 }}> · {res.vehicle_count} auto's</span>}
            </div>
            <div style={{ fontSize: 11, color: '#7090b0', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span>{new Date(res.arrival_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} → {new Date(res.departure_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} · {res.nights} nacht{res.nights !== 1 ? 'en' : ''}</span>
              {res.ferry_outbound_name && <span>⛴ {res.ferry_outbound_name} {res.ferry_outbound_time?.slice(0,5)}</span>}
              {res.has_ev && <span style={{ color: '#0a7c6e', fontWeight: 600 }}>⚡ EV</span>}
              {res.checkin_at && <span style={{ color: '#0a7c6e' }}>✓ {new Date(res.checkin_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>}
              {res.parking_spot && <span>Vak {res.parking_spot}</span>}
            </div>
          </div>

          {/* Right: amount + status */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0a2240' }}>€ {Number(res.total_price).toFixed(0)}</div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 4, flexWrap: 'wrap' }}>
              <span className={`status-badge ${payColor[res.payment_status] || 'badge-pending'}`}>{payLabel[res.payment_status] || res.payment_status}</span>
              <span className={`status-badge ${statusColor[res.status] || 'badge-booked'}`}>{statusLabel[res.status] || res.status}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ borderTop: '0.5px solid rgba(10,34,64,0.08)', padding: '8px 12px', background: '#f8f9fb', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {showCheckin && !isCheckedIn && res.status === 'booked' && (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => setCheckinOpen(true)}>✓ Inchecken</button>
              <button className="btn btn-navy btn-sm" onClick={() => setCheckinMailOpen(true)}>✓ Inchecken + Mail</button>
            </>
          )}
          {isCheckedIn && (
            <button className="btn btn-navy btn-sm" onClick={() => setCheckinMailOpen(true)}>✉ Check-in mail</button>
          )}
          {showCheckout && isCheckedIn && (
            <button className="btn btn-primary btn-sm" onClick={doCheckout} disabled={loading}>⬆ Uitchecken</button>
          )}
          <button className="btn btn-wa btn-sm" onClick={() => setWaOpen(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.096.546 4.067 1.5 5.787L0 24l6.388-1.674A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.65-.511-5.162-1.401L2 22l1.438-4.697A9.944 9.944 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
            WhatsApp
          </button>
          {res.status !== 'cancelled' && res.status !== 'completed' && (
            <button className="btn btn-danger btn-sm" onClick={() => setCancelOpen(true)}>✕ Annuleren</button>
          )}
          <Link href={`/reservations/${res.id}`} style={{ marginLeft: 'auto', fontSize: 11, color: '#7090b0', textDecoration: 'none', alignSelf: 'center' }}>#{res.reference} →</Link>
        </div>
      </div>

      {/* Check-in modal */}
      <Modal open={checkinOpen} onClose={() => setCheckinOpen(false)} title="Inchecken">
        <div style={{ fontSize: 13, color: '#555', marginBottom: 14 }}>
          <strong>{res.first_name} {res.last_name}</strong> ({res.plates}) inchecken. Tijdstip wordt geregistreerd.
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Vaknummer (optioneel)</label>
          <input value={spot} onChange={e => setSpot(e.target.value)} placeholder="Bijv. B-07"
            style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setCheckinOpen(false)}>Annuleren</button>
          <button className="btn btn-primary" onClick={doCheckin} disabled={loading}>✓ Bevestig inchecken</button>
        </div>
      </Modal>

      {/* Check-in + mail modal */}
      <Modal open={checkinMailOpen} onClose={() => setCheckinMailOpen(false)} title="Inchecken + Mail versturen">
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Vaknummer (optioneel)</label>
          <input value={spot} onChange={e => setSpot(e.target.value)} placeholder="Bijv. B-07"
            style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14 }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Extra bericht voor klant (optioneel)</label>
          <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={3}
            placeholder="Bijv: laadkabel is aangesloten op vak B-07..."
            style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 13, resize: 'vertical' }} />
        </div>
        <div style={{ fontSize: 12, color: '#7090b0', marginBottom: 16, background: '#f4f6f9', padding: '10px 12px', borderRadius: 7 }}>
          Mail bevat: inchecktijd, vaknummer, instructies afhalen, WhatsApp contactnummer.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setCheckinMailOpen(false)}>Annuleren</button>
          <button className="btn btn-navy" onClick={doCheckinMail} disabled={loading}>✓ Inchecken + Mail sturen</button>
        </div>
      </Modal>

      {/* WhatsApp modal */}
      <Modal open={waOpen} onClose={() => setWaOpen(false)} title={`WhatsApp — ${res.first_name} ${res.last_name}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {WA_MESSAGES.map((m, i) => (
            <button key={i} className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => setWaMsg(m.text)}>{m.label}</button>
          ))}
        </div>
        <textarea value={waMsg} onChange={e => setWaMsg(e.target.value)} rows={3}
          style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 13, resize: 'vertical', marginBottom: 14 }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setWaOpen(false)}>Sluiten</button>
          <button className="btn btn-wa" onClick={openWa}>
            Openen in WhatsApp →
          </button>
        </div>
      </Modal>

      {/* Cancel modal */}
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Reservering annuleren">
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>Restitutiepercentage</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="range" min={0} max={100} value={refundPct} onChange={e => setRefundPct(Number(e.target.value))} style={{ flex: 1 }} />
            <span style={{ fontWeight: 700, fontSize: 16, minWidth: 40 }}>{refundPct}%</span>
          </div>
          <div style={{ fontSize: 13, color: '#7090b0', marginTop: 6 }}>
            Restitutie: <strong style={{ color: '#0a2240' }}>€ {(Number(res.total_price) * refundPct / 100).toFixed(2)}</strong> van € {Number(res.total_price).toFixed(2)}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Reden (optioneel)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reden annulering..."
            style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14 }} />
        </div>
        <div style={{ fontSize: 12, color: '#7090b0', marginBottom: 14 }}>Klant ontvangt automatisch een restitutiebevestiging per e-mail via Stripe.</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setCancelOpen(false)}>Terug</button>
          <button className="btn btn-danger" onClick={doCancel} disabled={loading}>Bevestig annulering</button>
        </div>
      </Modal>
    </>
  );
}
