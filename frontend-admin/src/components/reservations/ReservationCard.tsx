'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import PlateTooltip from '@/components/ui/PlateTooltip';
import Modal from '@/components/ui/Modal';
import RefundPolicyInfo from '@/components/ui/RefundPolicyInfo';
import { api } from '@/lib/api';
import { toast, toastError } from '@/components/ui/Toast';
import { CheckIcon, XMarkIcon, EnvelopeIcon, ArrowUpTrayIcon, ChatBubbleOvalLeftEllipsisIcon, TruckIcon, MapIcon, BoltIcon } from '@heroicons/react/24/outline';
import { AlertTriangle, Receipt } from 'lucide-react';

function NotesPopup({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const truncated = text.length > 48 ? text.slice(0, 48) + '…' : text;
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <span style={{ fontSize: 11, color: '#7090b0', cursor: 'default', display: 'flex', alignItems: 'center', gap: 3 }}>
        <ChatBubbleOvalLeftEllipsisIcon className="w-3 h-3" style={{ opacity: 0.6 }} /> {truncated}
      </span>
      {open && text.length > 48 && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 4px)', left: 0,
          background: '#1a2e4a', color: 'white', borderRadius: 6,
          padding: '7px 10px', fontSize: 12, lineHeight: 1.5,
          maxWidth: 320, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)', zIndex: 100,
          pointerEvents: 'none',
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

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
  const [refundInfo, setRefundInfo] = useState<any>(null);
  const [reason, setReason] = useState('');
  // Bij openen annuleer-venster: standaard het restitutie% volgens annuleringsbeleid voorselecteren
  useEffect(() => {
    if (cancelOpen && res.payment_status === 'paid') {
      api.reservations.refundPreview(res.id).then(p => { setRefundPct(p.refundPct); setRefundInfo(p); }).catch(() => {});
    } else if (cancelOpen && res.payment_status !== 'paid') {
      setRefundPct(0);
    }
  }, [cancelOpen]);
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
  const payColor: Record<string, string> = { paid: 'badge-paid', on_site: 'badge-on_site', pending: 'badge-pending', refunded: 'badge-refunded', invoiced: 'badge-on_site' };
  const statusLabel: Record<string, string> = { booked: 'Geboekt', checked_in: 'Ingecheckt', completed: 'Voltooid', cancelled: 'Geannuleerd' };
  const payLabel: Record<string, string> = { paid: 'Betaald', on_site: 'Ter plekke', pending: 'Wacht', refunded: 'Terugbetaald', invoiced: 'Op factuur' };

  const isCancelledPaid = res.status === 'cancelled' && res.payment_status === 'paid';
  const isCancelled = res.status === 'cancelled';
  const isNew = res.created_at && new Date(res.created_at).toDateString() === new Date().toDateString();
  const isInvoiced = res.payment_method === 'invoice' && res.invoice_group_id;

  return (
    <>
      <div className="card" style={{ marginBottom: 10, overflow: 'hidden', opacity: isCancelled ? 0.6 : 1, borderLeft: isCancelled ? '3px solid #e53935' : isCheckedIn ? '3px solid #0a7c6e' : '0.5px solid rgba(10,34,64,0.12)' }}>
        {isCancelled && !isCancelledPaid && (
          <div style={{ background: '#fdeaea', borderBottom: '1px solid #f5c6c6', padding: '5px 14px', fontSize: 11, fontWeight: 700, color: '#c62828', display: 'flex', alignItems: 'center', gap: 6 }}>
            <XMarkIcon className="w-3 h-3" style={{ display:'inline', verticalAlign:'middle' }} />Geannuleerde reservering
          </div>
        )}
        {isCancelledPaid && (
          <div style={{ background: '#fff3e0', borderBottom: '1px solid #ffb74d', padding: '7px 14px', fontSize: 12, fontWeight: 700, color: '#bf360c', display: 'flex', alignItems: 'center', gap: 6 }}>
            <><AlertTriangle size={13} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />Betaling ontvangen voor geannuleerde reservering — controleer en herstel handmatig</>
          </div>
        )}
        {isInvoiced && (
          <div style={{ background: '#e8f0fe', borderBottom: '1px solid #90b4f5', padding: '6px 14px', fontSize: 11, fontWeight: 700, color: '#1a4fa0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}><Receipt size={11} />Op factuur</span>
            {res.invoice_group_reference && (
              <a href={`/facturen/${res.invoice_group_id}`} style={{ color: '#1a4fa0', textDecoration: 'underline', fontSize: 11 }}>
                {res.invoice_group_reference}
                {res.invoice_group_billing_name ? ` — ${res.invoice_group_billing_name}` : ''}
              </a>
            )}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', flexWrap: 'wrap' }}>
          {/* Plates */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
            {plates.map((p: string) => <PlateTooltip key={p} plate={p} />)}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: isCancelled ? '#9e9e9e' : '#0a2240', textDecoration: isCancelled ? 'line-through' : 'none', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {res.first_name} {res.last_name}
              {isNew && (
                <span style={{ fontSize: 10, fontWeight: 800, background: '#e6f7f5', color: '#0a7c6e', borderRadius: 4, padding: '1px 6px', letterSpacing: '0.3px', textDecoration: 'none', flexShrink: 0 }}>NIEUW</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#7090b0', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span>{new Date(res.arrival_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} → {new Date(res.departure_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} · {res.nights + 1} dag{(res.nights + 1) !== 1 ? 'en' : ''}</span>
              {res.vehicle_count && <span style={{ fontWeight: 700, color: Number(res.vehicle_count) > 1 ? '#0a2240' : '#7090b0', display:'inline-flex', alignItems:'center', gap:3 }}><TruckIcon className="w-3 h-3" />{res.vehicle_count}×</span>}
              {res.ferry_outbound_name && <span style={{display:'inline-flex', alignItems:'center', gap:3}}><MapIcon className="w-3 h-3" />{res.ferry_outbound_name} {res.ferry_outbound_time?.slice(0,5)}</span>}
              {res.has_ev && <span style={{ color: '#0a7c6e', fontWeight: 600, display:'inline-flex', alignItems:'center', gap:3 }}><BoltIcon className="w-3 h-3" />EV</span>}
              {res.checkin_at && <span style={{ color: '#0a7c6e', display:'inline-flex', alignItems:'center', gap:3 }}><CheckIcon className="w-3 h-3" />{new Date(res.checkin_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>}
              {res.parking_spot && <span>Vak {res.parking_spot}</span>}
            </div>
            {res.notes && (
              <div style={{ marginTop: 3 }}>
                <NotesPopup text={res.notes} />
              </div>
            )}
          </div>

          {/* Right: amount + status */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0a2240' }}>€ {Number(res.total_price).toFixed(0)}</div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 4, flexWrap: 'wrap' }}>
              {res.pending_payment_amount && Number(res.pending_payment_amount) > 0 && (
                <span style={{ background: '#ff9800', color: 'white', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 700 }}>
                  € {Number(res.pending_payment_amount).toFixed(2)} te betalen
                </span>
              )}
              <span className={`status-badge ${payColor[res.payment_status] || 'badge-pending'}`}>{payLabel[res.payment_status] || res.payment_status}</span>
              <span className={`status-badge ${statusColor[res.status] || 'badge-booked'}`}>{statusLabel[res.status] || res.status}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ borderTop: '0.5px solid rgba(10,34,64,0.08)', padding: '8px 12px', background: '#f8f9fb', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {showCheckin && !isCheckedIn && res.status === 'booked' && (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => setCheckinOpen(true)}><CheckIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Inchecken</button>
              <button className="btn btn-navy btn-sm" onClick={() => setCheckinMailOpen(true)}><CheckIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Inchecken + Mail</button>
            </>
          )}
          {isCheckedIn && (
            <button className="btn btn-navy btn-sm" onClick={() => setCheckinMailOpen(true)}><EnvelopeIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Check-in mail</button>
          )}
          {showCheckout && isCheckedIn && (
            <button className="btn btn-primary btn-sm" onClick={doCheckout} disabled={loading}><ArrowUpTrayIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Uitchecken</button>
          )}
          <button className="btn btn-wa btn-sm" onClick={() => setWaOpen(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.096.546 4.067 1.5 5.787L0 24l6.388-1.674A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.65-.511-5.162-1.401L2 22l1.438-4.697A9.944 9.944 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
            WhatsApp
          </button>
          {res.status !== 'cancelled' && res.status !== 'completed' && (
            <button className="btn btn-danger btn-sm" onClick={() => setCancelOpen(true)}><XMarkIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Annuleren</button>
          )}
          {isCancelledPaid && (
            <button className="btn btn-primary btn-sm" disabled={loading} onClick={async () => {
              if (!confirm(`Reservering ${res.reference} herstellen naar "Geboekt"?`)) return;
              setLoading(true);
              try {
                await api.reservations.update(res.id, { status: 'booked' });
                toast('Reservering hersteld ✓');
                onUpdate();
              } catch(e: any) { toastError(e.message); } finally { setLoading(false); }
            }}>
              ↩ Herstel reservering
            </button>
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
          <button className="btn btn-primary" onClick={doCheckin} disabled={loading}><CheckIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Bevestig inchecken</button>
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
          <button className="btn btn-navy" onClick={doCheckinMail} disabled={loading}><CheckIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Inchecken + Mail sturen</button>
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
          <RefundPolicyInfo info={refundInfo} />
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
