'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster from '@/components/ui/Toast';
import { toast, toastError } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import PlateTooltip from '@/components/ui/PlateTooltip';
import { api } from '@/lib/api';
import { formatPlate } from '@/lib/plate';
import RefundPolicyInfo from '@/components/ui/RefundPolicyInfo';
import {
  ArrowPathIcon,
  KeyIcon,
  ArchiveBoxIcon,
  ChatBubbleLeftIcon,
  CheckIcon,
  XMarkIcon,
  EnvelopeIcon,
  PrinterIcon,
  ArrowUturnLeftIcon,
  MagnifyingGlassIcon,
  CalendarDaysIcon,
  PencilIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  ClipboardDocumentIcon,
  MapIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline';
import { Phone, Zap, Receipt, Banknote, CreditCard, AlertTriangle } from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDateLong(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
}
function fmtDateCompact(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${parseInt(day)}-${parseInt(month)}-'${year.slice(2)}`;
}
function fmtDateShortNoYear(iso: string) {
  const [, month, day] = iso.slice(0, 10).split('-');
  return `${parseInt(day)}-${parseInt(month)}`;
}
function fmtTime(t: string | null | undefined): string {
  if (!t) return '';
  return String(t).slice(0, 5); // "14:05:00" → "14:05"
}
function fmtPaidAt(paidAt: string | null | undefined, method: string | null | undefined): string | null {
  if (!paidAt) return null;
  const d = new Date(paidAt);
  const dateStr = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  const timeStr = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const methodLabel = method === 'contant' ? 'cash' : method === 'pin' ? 'pin' : method || '';
  return `Betaald${methodLabel ? `, ${methodLabel}` : ''} op ${dateStr} ${timeStr}`;
}
function toIso(d: Date) { return d.toISOString().split('T')[0]; }
function addDays(iso: string, n: number) {
  const d = new Date(iso); d.setDate(d.getDate() + n); return toIso(d);
}
function waLink(phone: string) {
  const digits = phone.replace(/^0/, '31').replace(/\D/g, '');
  return `whatsapp://send/?phone=%2B${digits}`;
}

// ─── Detail Panel ────────────────────────────────────────────────────────────

function DetailPanel({ res, onClose, onUpdate }: { res: any; onClose: () => void; onUpdate: () => void }) {
  const initPlates = (): string[] => {
    const count = Math.max(res.vehicle_count || 1, 1);
    const existing = (res.plates || '').split(', ');
    return Array.from({ length: count }, (_, i) => existing[i] || '');
  };
  const initOutTime = res.ferry_outbound_time || '';
  const initRetTime = res.ferry_return_time || '';

  const [plates, setPlates] = useState<string[]>(initPlates);
  const [outTime, setOutTime] = useState(initOutTime);
  const [retTime, setRetTime] = useState(initRetTime);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countSaving, setCountSaving] = useState(false);

  async function changeVehicleCount(delta: number) {
    const target = plates.length + delta;
    if (target < 1 || target > 20) return;
    const msg = delta > 0
      ? `Een parkeerplaats toevoegen? De prijs wordt herberekend voor ${target} auto's.`
      : `Een parkeerplaats verwijderen? De prijs wordt herberekend voor ${target} auto${target !== 1 ? "'s" : ''}.`;
    if (!confirm(msg)) return;
    setCountSaving(true);
    try {
      const r = await api.reservations.setVehicleCount(res.id, target) as any;
      setPlates(prev => {
        const n = [...prev];
        if (target > n.length) { while (n.length < target) n.push(''); } else { n.length = target; }
        return n;
      });
      toast(`Parkeerplaatsen: ${target} · nieuw totaal € ${Number(r.total_price).toFixed(2).replace('.', ',')}`);
      onUpdate();
    } catch (e: any) { toastError(e?.message || 'Aanpassen mislukt'); }
    finally { setCountSaving(false); }
  }

  // Contactgegevens snel bewerken + bevestigingsmail opnieuw sturen
  const [editContact, setEditContact] = useState(false);
  const [emailVal, setEmailVal] = useState(res.email || '');
  const [phoneVal, setPhoneVal] = useState(res.phone || '');
  const [contactSaving, setContactSaving] = useState(false);
  const [resending, setResending] = useState(false);

  async function saveContact() {
    setContactSaving(true);
    try {
      await api.reservations.update(res.id, { email: emailVal.trim(), phone: phoneVal.trim() });
      toast('Contactgegevens opgeslagen ✓');
      setEditContact(false);
      onUpdate();
    } catch (e: any) { toastError(e?.message || 'Opslaan mislukt'); }
    finally { setContactSaving(false); }
  }

  async function resendConfirmation() {
    setResending(true);
    try {
      await api.reservations.resendConfirmation(res.id);
      toast(`Bevestigingsmail verstuurd naar ${res.email} ✓`);
    } catch (e: any) { toastError(e?.message || 'Versturen mislukt'); }
    finally { setResending(false); }
  }

  // Admin notitie snel bewerken
  const [editNote, setEditNote] = useState(false);
  const [noteVal, setNoteVal] = useState(res.admin_notes || '');
  const [noteSaving, setNoteSaving] = useState(false);

  async function saveNote() {
    setNoteSaving(true);
    try {
      await api.reservations.update(res.id, { admin_notes: noteVal.trim() });
      toast('Admin notitie opgeslagen ✓');
      setEditNote(false);
      onUpdate();
    } catch (e: any) { toastError(e?.message || 'Opslaan mislukt'); }
    finally { setNoteSaving(false); }
  }

  // Dirty state — show save button only when something changed
  const isDirty = (() => {
    const origPlates = initPlates();
    if (plates.length !== origPlates.length) return true;
    if (plates.some((p, i) => p !== origPlates[i])) return true;
    if (outTime !== initOutTime) return true;
    if (retTime !== initRetTime) return true;
    return false;
  })();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundPct, setRefundPct] = useState(() => res.payment_status === 'paid' ? 100 : 0);
  const [refundInfo, setRefundInfo] = useState<any>(null);
  const [reason, setReason] = useState('');
  // Bij openen annuleer-venster: standaard het restitutie% volgens annuleringsbeleid voorselecteren
  useEffect(() => {
    if (cancelOpen && res.payment_status === 'paid') {
      api.reservations.refundPreview(res.id).then(p => { setRefundPct(p.refundPct); setRefundInfo(p); }).catch(() => {});
    }
  }, [cancelOpen]);
  const [checkinMailOpen, setCheckinMailOpen] = useState(false);
  const [mailMsg, setMailMsg] = useState('');
  const [outSchedules, setOutSchedules] = useState<any[]>([]);
  const [retSchedules, setRetSchedules] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [outDest, setOutDest] = useState<string>(res.ferry_outbound_destination || '');
  const [retDest, setRetDest] = useState<string>(res.ferry_return_destination || '');

  const isCheckedIn = res.status === 'checked_in';

  const label: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 5 };
  const input: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14, color: '#0a2240', boxSizing: 'border-box' };
  const section: React.CSSProperties = { padding: '12px 20px', borderBottom: '0.5px solid rgba(10,34,64,0.08)' };

  useEffect(() => {
    loadOutSchedules(outDest);
    loadRetSchedules(retDest);
  }, []);

  async function loadOutSchedules(dest?: string) {
    try {
      const out = await api.ferries.schedules(res.arrival_date, dest || undefined);
      setOutSchedules((out?.schedules || []).filter((s: any) => s.direction === 'outbound'));
    } catch {}
  }

  async function loadRetSchedules(dest?: string) {
    try {
      const ret = await api.ferries.schedules(res.departure_date, dest || undefined);
      setRetSchedules((ret?.schedules || []).filter((s: any) => s.direction === 'return'));
    } catch {}
  }

  async function changeOutDest(dest: string) {
    setOutDest(dest);
    setOutTime('');
    try {
      await api.reservations.update(res.id, {
        ferryOutboundDestination: dest || null,
        ferryOutboundTime: null,
      });
    } catch (e: any) { toastError(e?.message || 'Er is een fout opgetreden'); }
    await loadOutSchedules(dest);
  }

  async function changeRetDest(dest: string) {
    setRetDest(dest);
    setRetTime('');
    try {
      await api.reservations.update(res.id, {
        ferryReturnDestination: dest || null,
        ferryReturnTime: null,
      });
    } catch (e: any) { toastError(e?.message || 'Er is een fout opgetreden'); }
    await loadRetSchedules(dest);
  }

  async function syncSchedules() {
    setSyncing(true);
    try {
      // Sync aankomst- en vertrekdatum synchroon (per datum endpoint wacht op voltooiing)
      // Dit duurt ~6s maar geeft betrouwbare data; de bulk-sync is asynchroon en zou leeg teruggeven
      const dates = Array.from(new Set([res.arrival_date.slice(0, 10), res.departure_date.slice(0, 10)]));
      await Promise.all(dates.map(d => api.ferries.syncDate(d)));
      await Promise.all([loadOutSchedules(outDest), loadRetSchedules(retDest)]);
      toast('Dienstregeling bijgewerkt ✓');
    } catch (e: any) { toastError(e?.message || 'Er is een fout opgetreden'); }
    finally { setSyncing(false); }
  }

  async function save() {
    setSaving(true);
    try {
      await api.reservations.update(res.id, {
        ferryOutboundTime: outTime || undefined,
        ferryReturnTime: retTime || undefined,
        vehicles: plates.map((p, i) => ({ license_plate: p.toUpperCase().replace(/\s/g, '-'), sort_order: i })),
      });
      toast('Opgeslagen ✓');
      onUpdate(); // herlaadt de lijst maar sluit het panel niet (handlePanelUpdate)
    } catch (e: any) { toastError(e?.message || 'Er is een fout opgetreden'); }
    finally { setSaving(false); }
  }

  async function doCheckin() {
    setLoading(true);
    try {
      await api.reservations.checkin(res.id);
      toast('Ingecheckt ✓'); onUpdate(); onClose();
    } catch (e: any) { toastError(e?.message || 'Er is een fout opgetreden'); }
    finally { setLoading(false); }
  }

  async function doCancel() {
    setLoading(true);
    try {
      const r = await api.reservations.cancel(res.id, refundPct, reason);
      toast(`Geannuleerd — €${r.refundAmount} restitutie`);
      setCancelOpen(false); onUpdate(); onClose();
    } catch (e: any) { toastError(e?.message || 'Er is een fout opgetreden'); }
    finally { setLoading(false); }
  }

  const chipStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '0.5px solid rgba(10,34,64,0.2)',
    background: active ? '#0a2240' : 'white', color: active ? 'white' : '#0a2240',
    cursor: 'pointer', whiteSpace: 'nowrap' as const,
  });

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,34,64,0.2)', zIndex: 9000 }} />
      {/* Panel */}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '100vw', background: 'white', boxShadow: '-4px 0 28px rgba(10,34,64,0.14)', zIndex: 9001, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '0.5px solid rgba(10,34,64,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0a2240' }}>{res.first_name} {res.last_name}</div>
            <div style={{ fontSize: 11, color: '#7090b0' }}>
              #{res.reference} · {isCheckedIn ? '✓ Ingecheckt' : 'Te inchecken'}
              {res.created_at && (
                <span style={{ marginLeft: 8, opacity: 0.7 }}>
                  · gereserveerd {new Date(res.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
            <div style={{ marginTop: 5 }}>
              {editContact ? (
                /* ── Bewerk-modus: e-mail + telefoon ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 340 }}>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.4px' }}>E-mail</label>
                    <input type="email" value={emailVal} onChange={e => setEmailVal(e.target.value)}
                      style={{ width: '100%', padding: '6px 9px', border: '1.5px solid rgba(10,34,64,0.25)', borderRadius: 7, fontSize: 13, color: '#0a2240', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Telefoon</label>
                    <input type="tel" value={phoneVal} onChange={e => setPhoneVal(e.target.value)}
                      style={{ width: '100%', padding: '6px 9px', border: '1.5px solid rgba(10,34,64,0.25)', borderRadius: 7, fontSize: 13, color: '#0a2240', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-primary btn-sm" onClick={saveContact} disabled={contactSaving} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CheckIcon className="w-3 h-3" />{contactSaving ? 'Opslaan…' : 'Opslaan'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditContact(false); setEmailVal(res.email || ''); setPhoneVal(res.phone || ''); }}>Annuleren</button>
                  </div>
                </div>
              ) : (
                /* ── Weergave-modus ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <a href={`mailto:${res.email}`} style={{ fontSize: 12, color: '#0a7c6e', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <EnvelopeIcon className="w-3 h-3" style={{ flexShrink: 0 }} />{res.email || '—'}
                    </a>
                    {res.email && (
                      <button onClick={resendConfirmation} disabled={resending}
                        title="Bevestigingsmail opnieuw versturen"
                        style={{ background: '#f4f6f9', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 5, padding: '2px 6px', cursor: resending ? 'default' : 'pointer', color: '#0a7c6e', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        {resending ? <ArrowPathIcon className="w-3 h-3" /> : <EnvelopeIcon className="w-3 h-3" />}opnieuw
                      </button>
                    )}
                    <button onClick={() => setEditContact(true)} title="Contactgegevens bewerken"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7090b0', padding: 2, display: 'inline-flex' }}>
                      <PencilIcon className="w-3 h-3" />
                    </button>
                  </div>
                  {res.phone && (
                    <a href={`tel:${res.phone}`} style={{ fontSize: 12, color: '#0a7c6e', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}><Phone size={11} /></span>{res.phone}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7090b0', cursor: 'pointer', padding: '4px 8px', lineHeight: 1, display: 'flex', alignItems: 'center' }}><XMarkIcon className="w-5 h-5" /></button>
        </div>

        {/* Periode */}
        <div style={section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <label style={label}>Periode</label>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0a2240' }}>
                {fmtDateLong(res.arrival_date)} → {fmtDateLong(res.departure_date)}
              </div>
              <div style={{ fontSize: 11, color: '#7090b0', marginTop: 3 }}>{res.nights + 1} dag{(res.nights + 1) !== 1 ? 'en' : ''} · {res.vehicle_count} auto{res.vehicle_count !== 1 ? "'s" : ''}</div>
            </div>
            <a href={`/reservations/${res.id}?modify=1`}
              style={{ fontSize: 11, fontWeight: 700, color: '#0a7c6e', background: '#e6f7f5', borderRadius: 6, padding: '4px 10px', textDecoration: 'none', whiteSpace: 'nowrap', marginTop: 2 }}>
              <PencilIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Datum wijzigen →
            </a>
          </div>
        </div>

        {/* Parkeerplaatsen & kentekens */}
        <div style={section}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ ...label, marginBottom: 0 }}>Parkeerplaats{plates.length > 1 ? 'en' : ''} &amp; kenteken{plates.length > 1 ? 's' : ''}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} title="Aantal parkeerplaatsen aanpassen (prijs wordt herberekend)">
              <button onClick={() => changeVehicleCount(-1)} disabled={countSaving || plates.length <= 1}
                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(10,34,64,0.2)', background: 'white', cursor: (countSaving || plates.length <= 1) ? 'not-allowed' : 'pointer', fontSize: 18, fontWeight: 700, color: '#0a2240', lineHeight: 1, opacity: (countSaving || plates.length <= 1) ? 0.4 : 1 }}>−</button>
              <span style={{ fontWeight: 800, color: '#0a2240', minWidth: 18, textAlign: 'center' }}>{plates.length}</span>
              <button onClick={() => changeVehicleCount(1)} disabled={countSaving}
                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(10,34,64,0.2)', background: 'white', cursor: countSaving ? 'wait' : 'pointer', fontSize: 18, fontWeight: 700, color: '#0a2240', lineHeight: 1 }}>+</button>
            </div>
          </div>
          {plates.map((p, i) => {
            const veh = res.vehicles?.[i];
            const carInfo = veh
              ? [veh.rdw_color, veh.rdw_make, veh.rdw_model].filter(Boolean).join(' ')
              : '';
            return (
              <div key={i} style={{ marginBottom: 8 }}>
                <input value={p} onChange={e => { const n = [...plates]; n[i] = e.target.value.toUpperCase(); setPlates(n); }}
                  style={{ ...input, fontFamily: 'monospace', fontSize: 16, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}
                  placeholder="Onbekend" />
                {carInfo && (
                  <div style={{ fontSize: 11, color: '#7090b0', marginTop: 3, paddingLeft: 2 }}>{carInfo}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Heenreis */}
        <div style={section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ ...label, marginBottom: 0 }}>Heenreis</label>
            <button onClick={syncSchedules} disabled={syncing}
              style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '0.5px solid rgba(10,34,64,0.2)', background: 'white', color: '#0a2240', cursor: 'pointer' }}>
              <ArrowPathIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />{syncing ? 'Laden…' : 'Dienstregeling'}
            </button>
          </div>
          {/* Eiland selector heenreis */}
          <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
            {['terschelling', 'vlieland'].map(isle => (
              <button key={isle} onClick={() => changeOutDest(isle === outDest ? '' : isle)}
                style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                  border: outDest === isle ? 'none' : '0.5px solid rgba(10,34,64,0.2)',
                  background: outDest === isle ? '#0a2240' : 'white',
                  color: outDest === isle ? 'white' : '#0a2240',
                  fontWeight: outDest === isle ? 700 : 400,
                }}>
                <MapIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle',marginRight:3}} />{isle === 'terschelling' ? 'Terschelling' : 'Vlieland'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="time" value={outTime} onChange={e => setOutTime(e.target.value)} style={{ ...input, width: 120 }} />
            {res.ferry_outbound_name && <span style={{ fontSize: 12, color: '#7090b0' }}>{res.ferry_outbound_name}</span>}
          </div>
          {outSchedules.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 7 }}>
              {outSchedules.map((s: any) => (
                <button key={s.id} onClick={() => setOutTime(s.departureTime)} style={chipStyle(outTime === s.departureTime)}>
                  {s.departureTime}{s.isFast ? <Zap size={10} style={{ display:'inline', verticalAlign:'middle', marginLeft:3, color:'#e8a020' }} /> : null}
                </button>
              ))}
            </div>
          )}
          {outSchedules.length === 0 && (
            <div style={{ fontSize: 10, color: '#bbb', marginTop: 5 }}>Geen dienstregeling geladen — klik op de knop om op te halen</div>
          )}
        </div>

        {/* Terugreis */}
        <div style={section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ ...label, marginBottom: 0 }}>Terugreis · {fmtDateLong(res.departure_date)}</label>
            <button onClick={syncSchedules} disabled={syncing}
              style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '0.5px solid rgba(10,34,64,0.2)', background: 'white', color: '#0a2240', cursor: 'pointer' }}>
              <ArrowPathIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />{syncing ? 'Laden…' : 'Dienstregeling'}
            </button>
          </div>
          {/* Eiland selector terugreis */}
          <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
            {['terschelling', 'vlieland'].map(isle => (
              <button key={isle} onClick={() => changeRetDest(isle === retDest ? '' : isle)}
                style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                  border: retDest === isle ? 'none' : '0.5px solid rgba(10,34,64,0.2)',
                  background: retDest === isle ? '#0a2240' : 'white',
                  color: retDest === isle ? 'white' : '#0a2240',
                  fontWeight: retDest === isle ? 700 : 400,
                }}>
                <MapIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle',marginRight:3}} />{isle === 'terschelling' ? 'Terschelling' : 'Vlieland'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="time" value={retTime} onChange={e => setRetTime(e.target.value)} style={{ ...input, width: 120 }} />
            {res.ferry_return_name && <span style={{ fontSize: 12, color: '#7090b0' }}>{res.ferry_return_name}</span>}
          </div>
          {retSchedules.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 7 }}>
              {retSchedules.map((s: any) => (
                <button key={s.id} onClick={() => setRetTime(s.departureTime)} style={chipStyle(retTime === s.departureTime)}>
                  {s.departureTime}{s.arrivalHarlingen ? ` → ${s.arrivalHarlingen}` : ''}{s.isFast ? <Zap size={10} style={{ display:'inline', verticalAlign:'middle', marginLeft:3, color:'#e8a020' }} /> : null}
                </button>
              ))}
            </div>
          )}
          {retSchedules.length === 0 && (
            <div style={{ fontSize: 10, color: '#bbb', marginTop: 5 }}>Geen dienstregeling geladen — klik op de knop om op te halen</div>
          )}
          {res.ferry_return_arrival_harlingen && (
            <div style={{ fontSize: 11, color: '#7090b0', marginTop: 6 }}>Aankomst Harlingen: <strong>{res.ferry_return_arrival_harlingen}</strong></div>
          )}
        </div>

        {/* Opmerking klant */}
        {(() => {
          const klantNoot = (res.notes || '').replace(/(\r\n|\r|\n)?Imported from v1 \| Original ID:[^\r\n]*/g, '').trim();
          return klantNoot ? (
            <div style={{ ...section, background: '#fffbf0' }}>
              <label style={{ ...label, color: '#9a6010', display:'flex', alignItems:'center', gap:4 }}><ChatBubbleOvalLeftEllipsisIcon className="w-3 h-3" />Opmerking klant</label>
              <div style={{ fontSize: 13, color: '#5a3a00', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{klantNoot}</div>
            </div>
          ) : null;
        })()}

        {/* Admin notitie — bewerkbaar */}
        <div style={{ ...section, background: '#f4f6f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <label style={{ ...label, color: '#4a6080', display:'flex', alignItems:'center', gap:4, marginBottom: 0 }}><ClipboardDocumentIcon className="w-3 h-3" />Admin notitie</label>
            {!editNote && (
              <button onClick={() => { setNoteVal(res.admin_notes || ''); setEditNote(true); }} title="Admin notitie bewerken"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7090b0', padding: 2, display: 'flex', alignItems: 'center' }}>
                <PencilIcon className="w-3 h-3" />
              </button>
            )}
          </div>
          {editNote ? (
            <div>
              <textarea value={noteVal} onChange={e => setNoteVal(e.target.value)} rows={3} placeholder="Interne notitie…"
                style={{ ...input, resize: 'vertical', minHeight: 64, lineHeight: 1.4 }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={saveNote} disabled={noteSaving} style={{ flex: 1 }}>
                  <CheckIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />{noteSaving ? 'Opslaan…' : 'Opslaan'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEditNote(false); setNoteVal(res.admin_notes || ''); }}>Annuleren</button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: res.admin_notes ? '#2a3a50' : '#9aa8b8', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {res.admin_notes || 'Geen notitie — klik op het potlood om er een toe te voegen.'}
            </div>
          )}
        </div>

        {/* Opslaan — alleen zichtbaar bij wijzigingen */}
        {isDirty && (
          <div style={{ padding: '12px 20px', borderBottom: '0.5px solid rgba(10,34,64,0.08)', background: '#fff8e6' }}>
            <button onClick={save} disabled={saving} style={{
              width: '100%', padding: '11px 16px', borderRadius: 8, border: 'none',
              background: saving ? '#a0b8c8' : '#e67e22',
              color: 'white', fontWeight: 800, fontSize: 14, cursor: saving ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: '0 2px 8px rgba(230,126,34,0.35)',
            }}>
              <CheckIcon className="w-4 h-4" />
              {saving ? 'Opslaan...' : 'Wijzigingen opslaan'}
            </button>
          </div>
        )}

        {/* Acties */}
        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!isCheckedIn && res.status === 'booked' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={doCheckin} disabled={loading} style={{ flex: 1 }}>
                <CheckIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Inchecken
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setCheckinMailOpen(true)} style={{ flex: 1 }}>
                <EnvelopeIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />+ mail
              </button>
            </div>
          )}
          {res.status !== 'cancelled' && res.status !== 'completed' && (
            <button className="btn btn-danger btn-sm" onClick={() => setCancelOpen(true)}><XMarkIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Annuleren</button>
          )}
          {res.phone && (
            <a href={waLink(res.phone)} className="btn btn-wa btn-sm" style={{ textAlign: 'center', textDecoration: 'none' }}>
              <ChatBubbleLeftIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />WhatsApp {res.first_name}
            </a>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <a href={`/print/invoice/${res.id}`} target="_blank"
              className="btn btn-ghost btn-sm"
              style={{ flex: 1, textAlign: 'center', textDecoration: 'none', fontSize: 12 }}>
              Factuur
            </a>
            <a href={`/reservations/${res.id}`}
              className="btn btn-ghost btn-sm"
              style={{ flex: 1, textAlign: 'center', textDecoration: 'none', fontSize: 12, color: '#7090b0' }}>
              Volledige reservering →
            </a>
          </div>
          {res.cancellation_token && (
            <a href={`https://www.parkeren-harlingen.nl/boeken/wijzigen/${res.cancellation_token}`}
              target="_blank" rel="noopener noreferrer"
              className="btn btn-ghost btn-sm"
              style={{ textAlign: 'center', textDecoration: 'none', fontSize: 12, color: '#19499e' }}>
              <PencilIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Klant-wijzigpagina openen →
            </a>
          )}
        </div>
      </div>

      {/* Inchecken + mail modal */}
      <Modal open={checkinMailOpen} onClose={() => setCheckinMailOpen(false)} title="Inchecken + bevestigingsmail">
        <div style={{ fontSize: 13, color: '#555', marginBottom: 14 }}><strong>{res.first_name} {res.last_name}</strong> inchecken en bevestigingsmail sturen.</div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...label, display: 'block', marginBottom: 6 }}>Extra bericht (optioneel)</label>
          <input value={mailMsg} onChange={e => setMailMsg(e.target.value)} placeholder="Bijv. uw auto staat op vak B-07" style={input} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setCheckinMailOpen(false)}>Annuleren</button>
          <button className="btn btn-primary" onClick={async () => { setLoading(true); try { await api.reservations.checkinMail(res.id, undefined, mailMsg || undefined); toast('Ingecheckt + mail ✓'); setCheckinMailOpen(false); onUpdate(); onClose(); } catch(e:any){toastError(e?.message || 'Er is een fout opgetreden');} finally{setLoading(false);} }} disabled={loading}><EnvelopeIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Bevestig inchecken</button>
        </div>
      </Modal>

      {/* Annuleren modal */}
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Reservering annuleren">
        <div style={{ marginBottom: 14 }}>
          {res.payment_status !== 'paid' ? (
            <div style={{ background: '#f4f6f9', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#556070' }}>
              <strong>Restitutie: niet van toepassing</strong><br />
              <span style={{ fontSize: 12 }}>De reservering is nog niet betaald — er wordt geen restitutie verwerkt.</span>
            </div>
          ) : (
            <>
              <RefundPolicyInfo info={refundInfo} />
              <label style={{ ...label, display: 'block', marginBottom: 8 }}>Restitutiepercentage</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="range" min={0} max={100} value={refundPct} onChange={e => setRefundPct(Number(e.target.value))} style={{ flex: 1 }} />
                <span style={{ fontWeight: 700, fontSize: 16, minWidth: 40 }}>{refundPct}%</span>
              </div>
              <div style={{ fontSize: 13, color: '#7090b0', marginTop: 6 }}>Restitutie: <strong>€ {(Number(res.total_price) * refundPct / 100).toFixed(2)}</strong></div>
            </>
          )}
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

// ─── Note Text with popup ────────────────────────────────────────────────────

function NoteText({ note, onClick }: { note: string; onClick?: (e: React.MouseEvent) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [open, setOpen] = useState(false);
  const truncated = note.length > 52 ? note.slice(0, 52) + '…' : note;
  const needsPopup = note.length > 52;

  function show(e: React.MouseEvent) {
    onClick?.(e);
    if (needsPopup && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(true);
  }

  return (
    <div ref={ref}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 3, marginTop: 3, cursor: 'default' }}
    >
      <ChatBubbleOvalLeftEllipsisIcon className="w-3 h-3" style={{ opacity: 0.6, flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 11, color: '#8a6010', lineHeight: '14px', fontStyle: 'italic' }}>{truncated}</span>
      {needsPopup && open && (
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left,
          zIndex: 9999,
          background: 'white', border: '0.5px solid rgba(10,34,64,0.15)',
          borderRadius: 8, boxShadow: '0 4px 20px rgba(10,34,64,0.15)',
          padding: '10px 14px', maxWidth: 320, minWidth: 200,
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9a6010', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5, display:'flex', alignItems:'center', gap:4 }}><ChatBubbleOvalLeftEllipsisIcon className="w-3 h-3" />Opmerking klant</div>
          <div style={{ fontSize: 13, color: '#0a2240', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{note}</div>
        </div>
      )}
    </div>
  );
}

// ─── Admin Note inline ───────────────────────────────────────────────────────

function AdminNoteText({ note, onClick }: { note: string; onClick?: (e: React.MouseEvent) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [open, setOpen] = useState(false);
  const truncated = note.length > 52 ? note.slice(0, 52) + '…' : note;
  const needsPopup = note.length > 52;

  function show(e: React.MouseEvent) {
    onClick?.(e);
    if (needsPopup && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(true);
  }

  return (
    <div ref={ref}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 3, marginTop: 3, cursor: 'default' }}
    >
      <ClipboardDocumentIcon className="w-3 h-3" style={{ color: '#2a5ea0', opacity: 0.7, flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 11, color: '#2a5ea0', lineHeight: '14px', fontStyle: 'italic' }}>{truncated}</span>
      {needsPopup && open && (
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left,
          zIndex: 9999,
          background: 'white', border: '0.5px solid rgba(10,34,64,0.15)',
          borderRadius: 8, boxShadow: '0 4px 20px rgba(10,34,64,0.15)',
          padding: '10px 14px', maxWidth: 320, minWidth: 200,
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#2a5ea0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <ClipboardDocumentIcon className="w-3 h-3" />Admin notitie
          </div>
          <div style={{ fontSize: 13, color: '#0a2240', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{note}</div>
        </div>
      )}
    </div>
  );
}

// ─── Payment Dropdown ────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: 'contant', label: 'Contant' },
  { value: 'pin',     label: 'PIN' },
  { value: 'ideal',   label: 'iDEAL' },
];

function PaymentDropdown({ res, onUpdate }: { res: any; onUpdate: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Sluit dropdown bij klik buiten of scroll
  // MOET vóór de early return staan — React-hooks mogen niet conditioneel worden aangeroepen
  useEffect(() => {
    if (!open) return;
    function close() { setOpen(false); }
    const id = setTimeout(() => document.addEventListener('click', close), 0);
    document.addEventListener('scroll', close as any, true);
    return () => { clearTimeout(id); document.removeEventListener('click', close); document.removeEventListener('scroll', close as any, true); };
  }, [open]);

  const isInvoice = res.payment_method === 'invoice' || res.payment_status === 'invoiced';
  const isPaid    = res.payment_status === 'paid';
  if (isPaid || isInvoice) return null;

  async function register(method: string) {
    setSaving(true); setOpen(false);
    try {
      await api.reservations.update(res.id, { paymentStatus: 'paid', paymentMethod: method });
      toast(`Betaling geregistreerd (${PAYMENT_METHODS.find(m => m.value === method)?.label}) ✓`);
      onUpdate();
    } catch (e: any) { toastError(e?.message || 'Er is een fout opgetreden'); }
    finally { setSaving(false); }
  }

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen(o => !o);
  }

  return (
    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        ref={btnRef}
        title="Betaling registreren"
        onClick={handleClick}
        disabled={saving}
        style={{ background: saving ? '#e8f5eb' : '#f0fdf4', border: '1px solid #4caf50', color: '#1a7a3a', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
        <BanknotesIcon className="w-4 h-4" />€
      </button>
      {open && dropPos && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: dropPos.top, right: dropPos.right, zIndex: 9999, background: 'white', border: '0.5px solid rgba(10,34,64,0.15)', borderRadius: 8, boxShadow: '0 4px 20px rgba(10,34,64,0.18)', minWidth: 130, overflow: 'hidden' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9ab0c8', textTransform: 'uppercase', padding: '7px 12px 4px', letterSpacing: 0.5 }}>Betaalwijze</div>
          {PAYMENT_METHODS.map(m => (
            <button key={m.value} onClick={() => register(m.value)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', fontSize: 13, fontWeight: 600, color: '#0a2240', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f4f6f9')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Arrival Card (compact row) ──────────────────────────────────────────────

function ArrivalCard({ res, onSelect, onUpdate, compact }: { res: any; onSelect: () => void; onUpdate: () => void; compact?: boolean }) {
  const isCheckedIn = res.status === 'checked_in';
  const isNew = res.created_at && new Date(res.created_at).toDateString() === new Date().toDateString();
  const plates = (res.plates || '').split(', ').filter(Boolean);
  const [checkinMailOpen, setCheckinMailOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [mailMsg, setMailMsg] = useState('');
  const [refundPct, setRefundPct] = useState(() => res.payment_status === 'paid' ? 100 : 0);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [refundInfo, setRefundInfo] = useState<any>(null);
  // Bij openen annuleer-venster: standaard het restitutie% volgens annuleringsbeleid voorselecteren
  useEffect(() => {
    if (cancelOpen && res.payment_status === 'paid') {
      api.reservations.refundPreview(res.id).then(p => { setRefundPct(p.refundPct); setRefundInfo(p); }).catch(() => {});
    }
  }, [cancelOpen]);

  // Undo check-in state
  const [pendingCheckin, setPendingCheckin] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [fadingOut, setFadingOut] = useState(false);
  const checkinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const carInfo = [
    res.rdw_make && res.rdw_model ? `${res.rdw_make} ${res.rdw_model}` : res.rdw_make || res.rdw_model,
    res.rdw_color,
    res.rdw_year,
  ].filter(Boolean).join(' · ');

  const pendingAmt = parseFloat(res.pending_payment_amount || 0);
  const pendingModId = res.pending_modification_id || null;

  function startCheckin(e: React.MouseEvent) {
    e.stopPropagation();
    if (pendingCheckin) return;
    setPendingCheckin(true);
    setCountdown(5);
    let count = 5;
    countdownRef.current = setInterval(() => {
      count--;
      setCountdown(count);
      if (count <= 0 && countdownRef.current) clearInterval(countdownRef.current);
    }, 1000);
    checkinTimerRef.current = setTimeout(async () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      setFadingOut(true);
      await new Promise(r => setTimeout(r, 350));
      setLoading(true);
      try { await api.reservations.checkin(res.id); onUpdate(); }
      catch (e: any) { toastError(e?.message || 'Er is een fout opgetreden'); setFadingOut(false); setPendingCheckin(false); }
      finally { setLoading(false); }
    }, 5000);
  }

  function cancelCheckin(e: React.MouseEvent) {
    e.stopPropagation();
    if (checkinTimerRef.current) clearTimeout(checkinTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setPendingCheckin(false);
    setCountdown(5);
    setFadingOut(false);
  }

  async function doCheckin() {
    setLoading(true);
    try { await api.reservations.checkin(res.id); toast('Ingecheckt ✓'); onUpdate(); }
    catch (e: any) { toastError(e?.message || 'Er is een fout opgetreden'); } finally { setLoading(false); }
  }
  async function doCheckinMail() {
    setLoading(true);
    try { await api.reservations.checkinMail(res.id, undefined, mailMsg || undefined); toast('Ingecheckt + mail ✓'); setCheckinMailOpen(false); onUpdate(); }
    catch (e: any) { toastError(e?.message || 'Er is een fout opgetreden'); } finally { setLoading(false); }
  }
  async function doCancel() {
    setLoading(true);
    try { const r = await api.reservations.cancel(res.id, refundPct, reason); toast(`Geannuleerd — €${r.refundAmount}`); setCancelOpen(false); onUpdate(); }
    catch (e: any) { toastError(e?.message || 'Er is een fout opgetreden'); } finally { setLoading(false); }
  }
  async function doPayOnSite(method: string) {
    setLoading(true);
    try {
      const isFullUnpaid = res.payment_status !== 'paid' && res.payment_status !== 'invoiced' && res.payment_method !== 'invoice';
      if (isFullUnpaid) {
        // Volledige betaling ter plekke — markeer als betaald en pas eventuele wijziging toe
        await api.reservations.updatePaymentStatus(res.id, 'paid', method);
        if (pendingModId) {
          await api.modifications.applyOnSitePayment(pendingModId);
        }
      } else if (pendingAmt > 0 && pendingModId) {
        await api.modifications.applyOnSitePayment(pendingModId);
      }
      // Ook direct inchecken als de boeking nog niet is ingecheckt
      if (res.status === 'booked') {
        await api.reservations.checkin(res.id);
      }
      toast(`Betaling ontvangen (${method}) + ingecheckt ✓`);
      onUpdate();
    } catch (e: any) { toastError(e?.message || 'Er is een fout opgetreden'); } finally { setLoading(false); }
  }

  async function doConfirmPayment() {
    setLoading(true);
    try {
      await api.modifications.applyOnSitePayment(pendingModId);
      toast('Betaling ontvangen ✓');
      setPaymentConfirmOpen(false);
      onUpdate();
    } catch (e: any) { toastError(e?.message || 'Er is een fout opgetreden'); } finally { setLoading(false); }
  }

  function stopProp(e: React.MouseEvent) { e.stopPropagation(); }

  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 5 };
  const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14, color: '#0a2240', boxSizing: 'border-box' };

  const payBadge = res.payment_status === 'paid'
    ? <span style={{ fontSize: 9, fontWeight: 700, background: '#e8f5eb', color: '#2a7a3a', borderRadius: 3, padding: '1px 6px' }}>✓ betaald</span>
    : res.payment_method === 'invoice' || res.payment_status === 'invoiced'
    ? <a href={`/facturen/${res.invoice_group_id}`} onClick={stopProp}
        style={{ fontSize: 9, fontWeight: 700, background: '#e8f0fe', color: '#1a4fa0', borderRadius: 3, padding: '1px 6px', textDecoration: 'none', cursor: 'pointer' }}>
        <><Receipt size={11} style={{ display:'inline', verticalAlign:'middle', marginRight:3 }} />{res.invoice_group_reference || 'op factuur'}</>
      </a>
    : res.payment_status === 'on_site' || res.payment_method === 'on_site'
    ? <span style={{ fontSize: 9, fontWeight: 700, background: '#fff0cc', color: '#8a5f00', borderRadius: 3, padding: '1px 6px' }}>● ter plekke</span>
    : <span style={{ fontSize: 9, fontWeight: 700, background: '#fdeaea', color: '#8a2020', borderRadius: 3, padding: '1px 6px' }}>! open</span>;

  const needsPayment = res.payment_status !== 'paid' && res.payment_status !== 'invoiced' && res.payment_method !== 'invoice';

  const payBlock = (needsPayment || pendingAmt > 0) ? (
    <div onClick={stopProp} style={{
      background: '#fef3e2',
      border: '1.5px solid #f0a030',
      borderRadius: 8,
      padding: '6px 10px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      width: '100%',
    }}>
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#a06010', textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: 1.2 }}>Nog te betalen</div>
        <div style={{ fontSize: 17, fontWeight: 900, color: '#c05000', lineHeight: 1.1 }}>
          € {(needsPayment ? parseFloat(res.total_price || 0) : pendingAmt).toFixed(2)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5 }}>
        <button onClick={(e) => { e.stopPropagation(); doPayOnSite('contant'); }} disabled={loading}
          style={{ background: 'white', border: '1px solid #2a7a3a', color: '#2a7a3a', borderRadius: 6, padding: '4px 9px', cursor: loading ? 'default' : 'pointer', fontSize: 11, fontWeight: 700, opacity: loading ? 0.5 : 1, whiteSpace: 'nowrap' }}>
          <><Banknote size={13} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />Cash</>
        </button>
        <button onClick={(e) => { e.stopPropagation(); doPayOnSite('pin'); }} disabled={loading}
          style={{ background: 'white', border: '1px solid #1a4fa0', color: '#1a4fa0', borderRadius: 6, padding: '4px 9px', cursor: loading ? 'default' : 'pointer', fontSize: 11, fontWeight: 700, opacity: loading ? 0.5 : 1, whiteSpace: 'nowrap' }}>
          <><CreditCard size={13} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />Pin</>
        </button>
      </div>
    </div>
  ) : null;

  const actionBtns = (
    <div style={{ display: 'flex', gap: 4 }} onClick={stopProp}>
      {pendingCheckin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Voortgangsbalk + countdown */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#0a7c6e', whiteSpace: 'nowrap' }}>✓ {countdown}s…</span>
            <div style={{ width: 52, height: 3, background: 'rgba(10,124,110,0.2)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#0a7c6e', borderRadius: 2, width: `${(countdown / 5) * 100}%`, transition: 'width 1s linear' }} />
            </div>
          </div>
          <button onClick={cancelCheckin} title="Inchecken annuleren"
            style={{ background: 'white', border: '1.5px solid #0a7c6e', color: '#0a5a50', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
            <ArrowUturnLeftIcon className="w-4 h-4" />
          </button>
        </div>
      )}
      {!pendingCheckin && !isCheckedIn && res.status === 'booked' && (
        <>
          <button title="Inchecken" onClick={startCheckin} disabled={loading}
            style={{ background: '#0a7c6e', border: 'none', color: 'white', borderRadius: 6, padding: '6px 10px', cursor: loading ? 'default' : 'pointer', fontWeight: 700, opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center' }}><CheckIcon className="w-4 h-4" /></button>
          <button title="Inchecken + mail sturen" onClick={() => setCheckinMailOpen(true)}
            style={{ background: '#0a2240', border: 'none', color: 'white', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><EnvelopeIcon className="w-4 h-4" /></button>
        </>
      )}
      {res.phone && (
        <a href={waLink(res.phone)} onClick={e => e.stopPropagation()}
          style={{ background: '#25D366', border: 'none', color: 'white', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', textDecoration: 'none' }}
          title="WhatsApp">
          <ChatBubbleLeftIcon className="w-4 h-4" />
        </a>
      )}
      <button title="Envelop afdrukken" onClick={e => { e.stopPropagation(); window.open(`/print/envelope/${res.id}?autoclose=1`, '_blank', 'width=900,height=700,menubar=no,toolbar=no,location=no'); }}
        style={{ background: '#f4f6f9', border: '0.5px solid rgba(10,34,64,0.2)', color: '#0a2240', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><PrinterIcon className="w-4 h-4" /></button>
      {res.status !== 'cancelled' && res.status !== 'completed' && (
        <button title="Annuleren" onClick={() => setCancelOpen(true)}
          style={{ background: 'none', border: '0.5px solid rgba(200,0,0,0.3)', color: '#c00', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><XMarkIcon className="w-4 h-4" /></button>
      )}
    </div>
  );

  return (
    <>
      <div
        onClick={onSelect}
        className="arrival-card"
        style={{
          background: 'white', borderRadius: 8, marginBottom: 5,
          border: pendingCheckin
            ? '2px solid #0a7c6e'
            : isCheckedIn
                ? '1.5px solid #0a7c6e'
                : '0.5px solid rgba(10,34,64,0.1)',
          cursor: 'pointer', overflow: 'hidden',
          opacity: fadingOut ? 0 : 1,
          transform: fadingOut ? 'translateX(30px)' : 'none',
          transition: 'opacity 0.35s ease, transform 0.35s ease, border-color 0.2s ease',
        }}
      >
        {/* ── Desktop layout ─────────────────────────────────── */}
        <div className="arrival-row-desktop" style={{ alignItems: 'center', padding: '9px 12px', gap: 12 }}>
          {/* 0. Boot vertrektijd (heen) */}
          <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 46 }}>
            <div style={{ fontSize: 9, color: '#7090b0', fontWeight: 600, lineHeight: 1, marginBottom: 1 }}>Boot</div>
            <div style={{ fontSize: 19, fontWeight: 900, color: '#0a2240', lineHeight: 1.1 }}>
              {fmtTime(res.ferry_outbound_time) || '—'}
            </div>
          </div>
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
              {isNew && <span style={{ fontSize: 9, fontWeight: 800, color: '#0a7c6e', background: '#e6f7f5', borderRadius: 3, padding: '1px 6px', flexShrink: 0, letterSpacing: '0.3px' }}>NIEUW</span>}
            </div>
            <div style={{ fontSize: 10, color: '#9ab0c8', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>#{res.reference}</span>
              {res.phone && <a href={waLink(res.phone)} onClick={stopProp} style={{ color: '#25D366', textDecoration: 'none', fontWeight: 600, display:'inline-flex', alignItems:'center', gap:3 }}><ChatBubbleLeftIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle'}} />WA</a>}
              {res.has_ev && <span style={{ color: '#0a7c6e', fontWeight: 700 }}><><Zap size={11} style={{ display:'inline', verticalAlign:'middle', marginRight:2 }} />{res.ev_kwh_total > 0 ? res.ev_kwh_total + ' kWh' : 'vol'}</></span>}
              {res.created_at && <span style={{ color: '#b0c4d8' }}>gereserveerd {new Date(res.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
            </div>
            <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#0a2240' }}>€ {parseFloat(res.total_price || 0).toFixed(2)}</span>
              {payBadge}
              {res.payment_status === 'paid' && res.paid_at && (
                <span style={{ fontSize: 9, color: '#5a8060', fontWeight: 600 }}>
                  {fmtPaidAt(res.paid_at, res.payment_method)}
                </span>
              )}
            </div>
            {res.notes && <NoteText note={res.notes} onClick={stopProp} />}
            {res.admin_notes && <AdminNoteText note={res.admin_notes} onClick={stopProp} />}
          </div>
          {/* 3. Heentijd */}
          <div style={{ flexShrink: 0, width: 170, paddingRight: 14, borderRight: '0.5px solid rgba(10,34,64,0.08)', marginRight: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#4a6080', marginBottom: 2, textTransform: compact ? 'none' : 'capitalize' }}>
              {compact ? fmtDateCompact(res.arrival_date) : fmtDateLong(res.arrival_date)}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: '#0a2240', lineHeight: 1.1 }}>{fmtTime(res.ferry_outbound_time) || '—'}</span>
              {res.ferry_outbound_arrival_island && <span style={{ fontSize: 13, fontWeight: 700, color: '#7090b0' }}>→ {res.ferry_outbound_arrival_island}</span>}
            </div>
          </div>
          {/* 4. Terugreis */}
          <div className="arrival-dep-col" style={{ flexShrink: 0, width: 190 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#4a6080', marginBottom: 2, textTransform: compact ? 'none' : 'capitalize' }}>
              ← {compact ? fmtDateCompact(res.departure_date) : fmtDateLong(res.departure_date)}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              {res.ferry_return_time || res.ferry_return_arrival_harlingen
                ? <>{res.ferry_return_time && <span style={{ fontSize: 11, fontWeight: 600, color: '#7090b0' }}>{fmtTime(res.ferry_return_time)}</span>}
                    <span style={{ fontSize: 20, fontWeight: 900, color: '#0a7c6e' }}>
                      {fmtTime(res.ferry_return_arrival_harlingen) || fmtTime(res.ferry_return_time)}
                    </span></>
                : <span style={{ fontSize: 13, color: '#b0c4d8' }}>—</span>
              }
            </div>
          </div>
          {/* 5. Knoppen */}
          <div style={{ flexShrink: 0, width: 250, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 5 }}>
            {payBlock}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{actionBtns}</div>
          </div>
        </div>

        {/* ── Mobile layout ───────────────────────────────────── */}
        <div className="arrival-row-mobile" style={{ flexDirection: 'column', padding: '9px 11px', gap: 6 }}>

          {/* Betaalblok (oranje balk) */}
          {payBlock && <div onClick={stopProp}>{payBlock}</div>}

          {/* Rij 1: [kenteken + auto-info links-boven] [naam rechts van kenteken] [bedrag rechts-boven] */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            {/* Kenteken + RDW-info — linksboven, max. even breed als het kenteken */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0, maxWidth: 105 }}>
              {plates.map((p: string) => <PlateTooltip key={p} plate={p} small />)}
              {carInfo && <div style={{ fontSize: 9, color: '#7090b0', lineHeight: 1.3, whiteSpace: 'normal', wordBreak: 'break-word' }}>{carInfo}</div>}
            </div>
            {/* Naam + badges + ferry-info — midden */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.first_name} {res.last_name}</span>
                {isCheckedIn && <span style={{ fontSize: 9, fontWeight: 700, color: '#0a7c6e', background: '#e6f7f5', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>✓ IN</span>}
                {isNew && <span style={{ fontSize: 9, fontWeight: 800, color: '#0a7c6e', background: '#e6f7f5', borderRadius: 3, padding: '1px 6px', flexShrink: 0, letterSpacing: '0.3px' }}>NIEUW</span>}
              </div>
              {/* Heen + terug op één rij — datum zwart, tijd donkergroen */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 3, flexWrap: 'wrap', lineHeight: 1.3 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0a2240' }}>{fmtDateShortNoYear(res.arrival_date)}&nbsp;</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#0a6050' }}>{fmtTime(res.ferry_outbound_time) || '—'}</span>
                <span style={{ fontSize: 11, color: '#c8d8e8', margin: '0 4px' }}>·</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0a2240' }}>{fmtDateShortNoYear(res.departure_date)}&nbsp;</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#0a6050' }}>{fmtTime(res.ferry_return_arrival_harlingen) || fmtTime(res.ferry_return_time) || '—'}</span>
              </div>
            </div>
            {/* Bedrag + betaalstatus — rechtsboven (geen betaaldetails op mobiel) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0a2240', whiteSpace: 'nowrap' }}>€ {parseFloat(res.total_price || 0).toFixed(2)}</span>
              {payBadge}
            </div>
          </div>

          {/* Notities — beide onderaan, op eigen regels */}
          {res.notes && <NoteText note={res.notes} onClick={stopProp} />}
          {res.admin_notes && <AdminNoteText note={res.admin_notes} onClick={stopProp} />}

          {/* Onderste rij: #ref + EV links, knoppen rechts */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <div style={{ fontSize: 10, color: '#9ab0c8', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>#{res.reference}</span>
              {res.has_ev && <span style={{ color: '#0a7c6e', fontWeight: 700 }}><Zap size={10} style={{ display:'inline', verticalAlign:'middle', marginRight:2 }} />{res.ev_kwh_total > 0 ? res.ev_kwh_total + ' kWh' : 'vol'}</span>}
            </div>
            <div onClick={stopProp} style={{ flexShrink: 0 }}>{actionBtns}</div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal open={checkinMailOpen} onClose={() => setCheckinMailOpen(false)} title={`Inchecken + bevestigingsmail — ${res.first_name}`}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...lbl, display: 'block', marginBottom: 6 }}>Extra bericht (optioneel)</label>
          <textarea value={mailMsg} onChange={e => setMailMsg(e.target.value)} rows={3}
            style={{ ...inp, resize: 'vertical' }} placeholder="Bijv: laadkabel aangesloten..." />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setCheckinMailOpen(false)}>Annuleren</button>
          <button className="btn btn-navy" onClick={doCheckinMail} disabled={loading}><CheckIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Inchecken + mail</button>
        </div>
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Reservering annuleren">
        <div style={{ marginBottom: 14 }}>
          {res.payment_status !== 'paid' ? (
            <div style={{ background: '#f4f6f9', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#556070' }}>
              <strong>Restitutie: niet van toepassing</strong><br />
              <span style={{ fontSize: 12 }}>De reservering is nog niet betaald — er wordt geen restitutie verwerkt.</span>
            </div>
          ) : (
            <>
              <RefundPolicyInfo info={refundInfo} />
              <label style={{ ...lbl, display: 'block', marginBottom: 8 }}>Restitutie</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="range" min={0} max={100} value={refundPct} onChange={e => setRefundPct(Number(e.target.value))} style={{ flex: 1 }} />
                <span style={{ fontWeight: 700, fontSize: 16, minWidth: 40 }}>{refundPct}%</span>
              </div>
              <div style={{ fontSize: 13, color: '#7090b0', marginTop: 6 }}>€ {(Number(res.total_price) * refundPct / 100).toFixed(2)}</div>
            </>
          )}
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

      <Modal open={paymentConfirmOpen} onClose={() => setPaymentConfirmOpen(false)} title="Bijbetaling ontvangen">
        <div style={{ background: '#fff4e0', borderRadius: 8, padding: '14px 16px', marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#7a3f00', marginBottom: 4 }}>Te ontvangen van {res.first_name} {res.last_name}</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: '#c05000' }}>€ {pendingAmt.toFixed(2)}</div>
        </div>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
          Bevestig dat je de bijbetaling contant of via PIN hebt ontvangen. De wijziging wordt daarna als afgerond gemarkeerd.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setPaymentConfirmOpen(false)}>Annuleren</button>
          <button onClick={doConfirmPayment} disabled={loading}
            style={{ background: '#e07b00', border: 'none', color: 'white', borderRadius: 7, padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
            <CheckIcon className="w-4 h-4" />Betaling ontvangen
          </button>
        </div>
      </Modal>
    </>
  );
}

// ─── Departure Card ───────────────────────────────────────────────────────────

function DepartureCard({ res, onUpdate, occupiedLockers = [] }: { res: any; onUpdate: () => void; occupiedLockers?: string[] }) {
  const plates = (res.plates || '').split(', ').filter(Boolean);
  const [code, setCode] = useState(res.locker_code || '');
  const [locker, setLocker] = useState<string>(res.parking_spot || '');

  // Synchroniseer lokale state wanneer de parent nieuwe data doorgeeft (bijv. na ✕ wissen)
  useEffect(() => { setCode(res.locker_code || ''); }, [res.locker_code]);
  useEffect(() => { setLocker(res.parking_spot || ''); }, [res.parking_spot]);
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [sending, setSending] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const [varPos, setVarPos] = useState<{ top: number; right: number } | null>(null);
  const varBtnRef = useRef<HTMLButtonElement>(null);
  const [emailSending, setEmailSending] = useState(false);

  // Sluit het varianten-menu bij klik buiten of scroll
  useEffect(() => {
    if (!showVariants) return;
    const close = () => setShowVariants(false);
    const id = setTimeout(() => document.addEventListener('click', close), 0);
    document.addEventListener('scroll', close as any, true);
    return () => { clearTimeout(id); document.removeEventListener('click', close); document.removeEventListener('scroll', close as any, true); };
  }, [showVariants]);

  function toggleVariants(e: React.MouseEvent) {
    e.stopPropagation();
    if (!code.trim()) { toastError('Voer eerst een code in'); return; }
    if (!showVariants && varBtnRef.current) {
      const r = varBtnRef.current.getBoundingClientRect();
      setVarPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setShowVariants(o => !o);
  }
  const [checkingOut, setCheckingOut] = useState(false);
  const [payLoading, setPayLoading] = useState(false);

  const pendingAmtDep = parseFloat(res.pending_payment_amount || 0);
  const pendingModIdDep = res.pending_modification_id || null;
  const needsPaymentDep = res.payment_status !== 'paid' && res.payment_status !== 'invoiced' && res.payment_method !== 'invoice';

  async function doPayDeparture(method: string) {
    setPayLoading(true);
    try {
      if (needsPaymentDep) {
        await api.reservations.updatePaymentStatus(res.id, 'paid', method);
        if (pendingModIdDep) await api.modifications.applyOnSitePayment(pendingModIdDep);
      } else if (pendingAmtDep > 0 && pendingModIdDep) {
        await api.modifications.applyOnSitePayment(pendingModIdDep);
      }
      toast(`Betaling ontvangen (${method}) ✓`);
      onUpdate();
    } catch (e: any) { toastError(e?.message || 'Er is een fout opgetreden'); } finally { setPayLoading(false); }
  }

  async function saveLocker(val: string) {
    setSaving(true);
    try {
      if (val) {
        // Nieuwe kluis geselecteerd → sla op en maak direct een verse code aan
        await api.reservations.update(res.id, { parkingSpot: val });
        setAssigning(true);
        try {
          const r = await api.reservations.assignLockerCode(res.id);
          setCode(r.code);
          toast(`Code ${r.code} aangemaakt voor kluis ${val} ✓`);
        } catch (e: any) {
          toastError('Code aanmaken mislukt: ' + (e?.message || ''));
        } finally {
          setAssigning(false);
        }
      } else {
        // Kluis de-selecteren: wis ook locker_code etc. uit de DB
        await api.reservations.update(res.id, { parkingSpot: null, clearLockerInfo: true });
        setCode('');
      }
      onUpdate(); // statusbalk direct bijwerken
    }
    catch (e: any) { toastError(e?.message || 'Er is een fout opgetreden'); }
    finally { setSaving(false); }
  }

  async function sendLockerEmail(e: React.MouseEvent) {
    e.stopPropagation();
    if (!code.trim()) { toastError('Nog geen code beschikbaar'); return; }
    setEmailSending(true);
    try {
      await api.reservations.sendLockerEmail(res.id);
      toast(`Code per e-mail verstuurd naar ${res.email} ✓`);
    } catch (err: any) { toastError(err?.message || 'E-mail versturen mislukt'); }
    finally { setEmailSending(false); }
  }

  async function doCheckout(e: React.MouseEvent) {
    e.stopPropagation();
    setCheckingOut(true);
    try {
      await api.reservations.checkout(res.id);
      toast(`${res.first_name} ${res.last_name} uitgecheckt ✓`);
      onUpdate();
    } catch (err: any) { toastError(err?.message || 'Er is een fout opgetreden'); }
    finally { setCheckingOut(false); }
  }

  const carInfo = [
    res.rdw_make && res.rdw_model ? `${res.rdw_make} ${res.rdw_model}` : res.rdw_make || res.rdw_model,
    res.rdw_color,
  ].filter(Boolean).join(' · ');

  const locationLines: Record<string, string> = {
    default: 'Uw auto staat naast ons pand startklaar',
    buiten: 'Uw auto staat op ons buitenterrein klaar',
    loods: 'Uw auto staat achter in onze loods startklaar',
  };
  function buildMessage(c: string, variant: string = 'default') {
    return `*${c}* Is de code om vandaag uw autosleutel af te halen.\n${locationLines[variant] || locationLines.default}, de code gebruikt u om uw sleutel uit de afhaalkluis naast onze intercom te verkrijgen.\nGaat er iets mis?\n- reply op deze app\n- of bel aan (intercom)\n- of volg de bel instructie zoals aangegeven bij de intercom.`;
  }

  function sendCode(e: React.MouseEvent, variant: string = 'default') {
    e.stopPropagation();
    if (!code.trim()) { toastError('Voer eerst een code in'); return; }
    if (!res.phone) { toastError('Geen telefoonnummer bekend'); return; }
    const digits = res.phone.replace(/\D/g, '').replace(/^0/, '31');
    window.open(`whatsapp://send/?phone=%2B${digits}&text=${encodeURIComponent(buildMessage(code.trim(), variant))}`);
    setSending(true);
    setShowVariants(false);
    setTimeout(() => setSending(false), 2000);
  }

  const isCheckedOut = res.status === 'completed';
  const isNotCheckedIn = res.status === 'booked';

  const depPayBlock = (needsPaymentDep || pendingAmtDep > 0) ? (
    <div onClick={e => e.stopPropagation()} style={{
      background: '#fef3e2', borderBottom: '1px solid #f0a030',
      padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    }}>
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#a06010', textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: 1.2 }}>Nog te betalen</div>
        <div style={{ fontSize: 17, fontWeight: 900, color: '#c05000', lineHeight: 1.1 }}>
          € {(needsPaymentDep ? parseFloat(res.total_price || 0) : pendingAmtDep).toFixed(2)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5 }}>
        <button onClick={() => doPayDeparture('contant')} disabled={payLoading}
          style={{ background: 'white', border: '1px solid #2a7a3a', color: '#2a7a3a', borderRadius: 6, padding: '4px 9px', cursor: payLoading ? 'default' : 'pointer', fontSize: 11, fontWeight: 700, opacity: payLoading ? 0.5 : 1, whiteSpace: 'nowrap' }}>
          <><Banknote size={13} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />Cash</>
        </button>
        <button onClick={() => doPayDeparture('pin')} disabled={payLoading}
          style={{ background: 'white', border: '1px solid #1a4fa0', color: '#1a4fa0', borderRadius: 6, padding: '4px 9px', cursor: payLoading ? 'default' : 'pointer', fontSize: 11, fontWeight: 700, opacity: payLoading ? 0.5 : 1, whiteSpace: 'nowrap' }}>
          <><CreditCard size={13} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />Pin</>
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div style={{
      background: isCheckedOut ? '#f0faf8' : isNotCheckedIn ? '#fffaf5' : 'white',
      borderRadius: 8, marginBottom: 4,
      border: isCheckedOut ? '1.5px solid #0a7c6e' : isNotCheckedIn ? '1.5px solid #ffb74d' : (needsPaymentDep || pendingAmtDep > 0) ? '1.5px solid #f0a030' : '0.5px solid rgba(10,34,64,0.1)',
      overflow: 'hidden',
    }}>
      {depPayBlock}
      {/* Enkele compacte rij */}
      <div onClick={e => e.stopPropagation()} style={{
        display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 10, flexWrap: 'wrap',
      }}>
        {/* Aankomsttijd (groot) */}
        <div style={{ flexShrink: 0, minWidth: 54, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#7090b0', fontWeight: 600, lineHeight: 1 }}>Hrl</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#0a2240', lineHeight: 1.1 }}>
            {res.ferry_return_arrival_harlingen || res.ferry_return_time || '—'}
          </div>
          {res.ferry_return_time && res.ferry_return_arrival_harlingen && (
            <div style={{ fontSize: 9, color: '#9ab0c8' }}>boot {res.ferry_return_time}</div>
          )}
        </div>

        {/* Kenteken(s) */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {plates.map((p: string) => <PlateTooltip key={p} plate={p} small />)}
          {carInfo && <div style={{ fontSize: 9, color: '#7090b0', lineHeight: 1.3 }}>{carInfo}</div>}
        </div>

        {/* Naam + ref */}
        <div style={{ flex: 1, minWidth: 100 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#0a2240', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            {res.first_name} {res.last_name}
            {isCheckedOut && <span style={{ fontSize: 9, fontWeight: 700, color: '#0a7c6e', background: '#d0f5ea', borderRadius: 3, padding: '1px 5px' }}>✓ UIT</span>}
            {isNotCheckedIn && <span style={{ fontSize: 9, fontWeight: 700, color: '#a04000', background: '#fff0d0', border: '1px solid #ffb74d', borderRadius: 3, padding: '1px 5px' }}><><AlertTriangle size={10} style={{ display:'inline', verticalAlign:'middle', marginRight:2 }} />niet ingecheckt</></span>}
            {res.has_ev && <span style={{ fontSize: 9, fontWeight: 700, color: '#0a7c6e' }}><><Zap size={11} style={{ display:'inline', verticalAlign:'middle', marginRight:2 }} />{res.ev_kwh_total > 0 ? res.ev_kwh_total + 'kWh' : 'vol'}</></span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 1, flexWrap: 'wrap' }}>
            <a href={`/reservations/${res.id}`} onClick={e => e.stopPropagation()}
              style={{ fontSize: 10, color: '#7090b0', textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
              #{res.reference}
            </a>
            {res.arrival_date && (
              <span style={{ fontSize: 10, color: '#9ab0c8' }}>
                ↗ {new Date(res.arrival_date.slice(0,10) + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
              </span>
            )}
            {res.payment_status === 'paid' && res.paid_at && (
              <span style={{ fontSize: 9, color: '#5a8060', fontWeight: 600 }}>
                {fmtPaidAt(res.paid_at, res.payment_method)}
              </span>
            )}
          </div>
        </div>

        {/* € Betaling registreren */}
        <PaymentDropdown res={res} onUpdate={onUpdate} />

        {/* Sleutelcode invoer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <KeyIcon className="w-4 h-4" style={{ color: '#7090b0', flexShrink: 0 }} />
          <input
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendCode(e as any); }}
            placeholder="bijv. 48"
            style={{
              padding: '4px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6,
              fontSize: 14, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 2,
              width: 80, color: '#0a2240',
            }}
          />
        </div>

        {/* Kluisje + code-toewijzing */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <ArchiveBoxIcon className="w-4 h-4" style={{ color: '#7090b0', flexShrink: 0 }} />
          <select
            value={locker}
            onChange={e => { setLocker(e.target.value); saveLocker(e.target.value); }}
            title="Kluisnummer — kies om automatisch een code aan te maken"
            disabled={assigning}
            style={{
              padding: '4px 6px', border: locker ? '1.5px solid #0a7c6e' : '0.5px dashed rgba(10,34,64,0.25)',
              borderRadius: 6, fontSize: 12, fontWeight: 700,
              color: locker ? '#0a7c6e' : '#9ab0c8',
              background: locker ? '#e6f7f5' : '#f0f4f8',
              cursor: assigning ? 'default' : 'pointer', minWidth: 62,
            }}>
            <option value="">— kies</option>
            {[1,2,3,4,5,6,7].map(n => {
              const isTaken = occupiedLockers.includes(String(n)) && String(n) !== locker;
              return (
                <option key={n} value={String(n)} disabled={isTaken}>
                  {isTaken ? `${n} — bezet` : String(n)}
                </option>
              );
            })}
          </select>
          {(saving || assigning) && <ArrowPathIcon className="w-3 h-3" style={{ color: '#7090b0' }} />}
          {locker && !saving && !assigning && <CheckIcon className="w-3 h-3" style={{ color: '#0a7c6e' }} />}
        </div>

        {/* 🔑 Afgehaald badge */}
        {res.locker_collected_at && (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#3a80c0', background: '#ddeeff', borderRadius: 5, padding: '2px 7px', flexShrink: 0 }}>
            🔑 Afgehaald {new Date(res.locker_collected_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}

        {/* 📧 E-mail sturen */}
        {res.email && code && (
          <button onClick={sendLockerEmail} disabled={emailSending || !code.trim()}
            title={res.locker_code_sent_at ? `Opnieuw e-mailen (eerder verstuurd)` : 'Code per e-mail sturen'}
            style={{
              background: res.locker_code_sent_at ? '#e6f7f5' : '#f4f6f9',
              border: res.locker_code_sent_at ? '1.5px solid #0a7c6e' : '0.5px solid rgba(10,34,64,0.2)',
              color: res.locker_code_sent_at ? '#0a7c6e' : '#0a2240',
              borderRadius: 6, padding: '5px 8px', cursor: emailSending ? 'default' : 'pointer',
              flexShrink: 0, display: 'flex', alignItems: 'center', opacity: emailSending ? 0.6 : 1,
            }}>
            {emailSending
              ? <ArrowPathIcon className="w-4 h-4" />
              : <EnvelopeIcon className="w-4 h-4" />}
          </button>
        )}

        {/* 📱 WhatsApp leeg bericht */}
        {res.phone && (
          <button onClick={e => { e.stopPropagation(); const d = res.phone.replace(/\D/g,'').replace(/^0/,'31'); window.open(`whatsapp://send/?phone=%2B${d}`); }}
            style={{ background: '#25D366', border: 'none', color: 'white', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', flexShrink: 0, display:'flex', alignItems:'center' }}
            title="WhatsApp openen">
            <ChatBubbleOvalLeftEllipsisIcon className="w-4 h-4" />
          </button>
        )}
        {/* 📱 WhatsApp + code */}
        {res.phone && (
          <div style={{ position: 'relative', flexShrink: 0, display: 'flex' }}>
            <button onClick={e => sendCode(e)} disabled={!code.trim() || sending}
              style={{
                background: sending ? '#0a7c6e' : '#25D366', border: 'none', color: 'white', borderRadius: '6px 0 0 6px',
                padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: code.trim() ? 'pointer' : 'default',
                opacity: !code.trim() ? 0.45 : 1, whiteSpace: 'nowrap',
              }}>
              {sending ? <CheckIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle'}} /> : <><ChatBubbleLeftIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Stuur code</>}
            </button>
            <button ref={varBtnRef} onClick={toggleVariants} disabled={!code.trim() || sending} title="Ander bericht kiezen"
              style={{
                background: sending ? '#0a7c6e' : '#1fb955', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.35)', color: 'white',
                borderRadius: '0 6px 6px 0', padding: '5px 7px', fontSize: 11, cursor: code.trim() ? 'pointer' : 'default',
                opacity: !code.trim() ? 0.45 : 1,
              }}>▾</button>
            {showVariants && varPos && (
              <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: varPos.top, right: varPos.right, background: 'white', border: '0.5px solid rgba(10,34,64,0.15)', borderRadius: 8, boxShadow: '0 6px 24px rgba(10,34,64,0.22)', zIndex: 9999, minWidth: 240, overflow: 'hidden' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 12px 4px' }}>Alternatief bericht</div>
                <button onClick={e => sendCode(e, 'buiten')} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'white', padding: '9px 12px', fontSize: 13, cursor: 'pointer', color: '#142440' }}>
                  <strong>Buiten</strong> — auto staat op het buitenterrein
                </button>
                <button onClick={e => sendCode(e, 'loods')} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderTop: '0.5px solid #eef1f5', background: 'white', padding: '9px 12px', fontSize: 13, cursor: 'pointer', color: '#142440' }}>
                  <strong>Loods</strong> — auto staat achter in de loods
                </button>
              </div>
            )}
          </div>
        )}

        {/* ✓ Inchecken (alleen als nog niet ingecheckt) */}
        {isNotCheckedIn && (
          <button onClick={async e => { e.stopPropagation(); setCheckingOut(true); try { await api.reservations.checkin(res.id); toast('Ingecheckt ✓'); onUpdate(); } catch(err:any){ toastError(err?.message || 'Er is een fout opgetreden'); } finally { setCheckingOut(false); } }} disabled={checkingOut}
            style={{
              background: '#e07b00', border: 'none', color: 'white', borderRadius: 6,
              padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              opacity: checkingOut ? 0.6 : 1, whiteSpace: 'nowrap', flexShrink: 0,
            }}>
            {checkingOut ? <ArrowPathIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle'}} /> : <><CheckIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Inchecken</>}
          </button>
        )}

        {/* ✓ Uitchecken */}
        {!isCheckedOut && !isNotCheckedIn && (
          <button onClick={doCheckout} disabled={checkingOut}
            style={{
              background: '#0a7c6e', border: 'none', color: 'white', borderRadius: 6,
              padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              opacity: checkingOut ? 0.6 : 1, whiteSpace: 'nowrap', flexShrink: 0,
            }}>
            {checkingOut ? <ArrowPathIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle'}} /> : <><CheckIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Uitchecken</>}
          </button>
        )}
      </div>

    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function fmtDateShort(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
}

const STORAGE_KEY = 'bazuin_arrivals_state';

function loadSavedState(todayIso: string) {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export default function ArrivalsPage() {
  const todayIso = toIso(new Date());

  const saved = loadSavedState(todayIso);

  const [dateFrom, setDateFrom] = useState<string>(saved?.dateFrom || todayIso);
  const [dateTo, setDateTo] = useState<string>(saved?.dateTo || todayIso);
  const [rangeMode, setRangeMode] = useState<boolean>(saved?.rangeMode ?? false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [arrivalTab, setArrivalTab] = useState<'booked'|'checked_in'|'completed'>(saved?.arrivalTab || 'booked');
  const [showDepartedToday, setShowDepartedToday] = useState<boolean>(saved?.showDepartedToday ?? false);
  const [keysafeLockers, setKeysafeLockers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchIncludeAll, setSearchIncludeAll] = useState(false);
  const [selectedRes, setSelectedRes] = useState<any | null>(null);
  const [rdwRefreshing, setRdwRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  // Sla staat op bij elke relevante wijziging
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ dateFrom, dateTo, rangeMode, arrivalTab, showDepartedToday }));
    } catch {}
  }, [dateFrom, dateTo, rangeMode, arrivalTab, showDepartedToday]);

  const load = useCallback(async (from?: string, to?: string, silent = false) => {
    if (!silent) setLoading(true);
    const f = from ?? dateFrom;
    const t = to ?? dateTo;
    try { setData(await api.reservations.today(f, f !== t ? t : undefined)); }
    catch (e: any) { if (!silent) toastError(e?.message || 'Kon reserveringen niet laden'); }
    finally { if (!silent) setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    load();
    api.rdw.bulkRefresh().then(r => { if (r.updated > 0) load(); }).catch(() => {});
  }, [load]);

  // Live keysafe-status ophalen (bij laden + elke 60 seconden)
  // Herlaadt de reserveringsdata STIL (zonder spinner/flash) zodat webhook-updates
  // (locker_collected_at) zichtbaar worden zonder dat de pagina hoorbaar "ververst".
  useEffect(() => {
    function fetchLockers() {
      api.keysafe.lockers().then(setKeysafeLockers).catch(() => {});
      load(undefined, undefined, true); // stille achtergrond-refresh
    }
    fetchLockers();
    const interval = setInterval(fetchLockers, 60000);
    return () => clearInterval(interval);
  }, [load]);

  function setQuickRange(days: number) {
    const from = todayIso;
    const to = addDays(todayIso, days - 1);
    setDateFrom(from); setDateTo(to); setRangeMode(days > 1);
    load(from, to);
  }

  function changeSingleDate(delta: number) {
    const d = addDays(dateFrom, delta);
    setDateFrom(d); setDateTo(d);
    load(d, d);
  }

  async function refreshRdw() {
    setRdwRefreshing(true);
    try {
      const r = await api.rdw.bulkRefresh();
      toast(`RDW: ${r.updated} van ${r.total} voertuigen bijgewerkt`);
      if (r.updated > 0) load();
    } catch (e: any) { toastError('RDW: ' + (e?.message || 'onbekende fout')); }
    finally { setRdwRefreshing(false); }
  }

  async function runUmbracoSync() {
    setSyncing(true);
    try {
      const r = await api.umbraco.sync();
      toast(r.started ? 'Synchronisatie gestart — dit kan ~1 minuut duren.' : 'Synchronisatie loopt al — even geduld.');
      // Sync draait op de achtergrond; poll de status tot het resultaat binnen is.
      const startedAt = Date.now();
      const poll = async () => {
        try {
          const s = await api.umbraco.status();
          if (s.syncResult) {
            const res = s.syncResult;
            if (res.error) {
              toastError('Sync mislukt: ' + res.error);
            } else {
              const parts = [`${res.imported} nieuw`];
              if (res.cancelled) parts.push(`${res.cancelled} geannuleerd`);
              if (res.errors) parts.push(`${res.errors} fout`);
              toast(`Sync klaar: ${parts.join(', ')}`);
              if (res.errors && res.errorIds?.length) toastError(`Niet verwerkt: ${res.errorIds.slice(0, 20).join(', ')}`);
              load();
            }
            setSyncing(false);
            return;
          }
          if (!s.syncRunning || Date.now() - startedAt > 180000) { setSyncing(false); return; }
          setTimeout(poll, 5000);
        } catch { setSyncing(false); }
      };
      setTimeout(poll, 5000);
    } catch (e: any) { toastError('Sync starten mislukt: ' + (e?.message || 'onbekende fout')); setSyncing(false); }
  }

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

  const allArrivals: any[] = data?.arrivals || [];
  const allDepartures: any[] = data?.departures || [];
  const isSearching = searchQuery.length >= 4;
  const isToday = dateFrom === todayIso && dateTo === todayIso;

  // Groepeer aankomsten per datum als bereik > 1 dag
  const arrivalsByDate: Record<string, any[]> = {};
  allArrivals.forEach((r: any) => {
    const d = r.arrival_date?.slice(0, 10) || dateFrom;
    if (!arrivalsByDate[d]) arrivalsByDate[d] = [];
    arrivalsByDate[d].push(r);
  });
  const dateGroups = Object.keys(arrivalsByDate).sort();
  const isSingleDay = dateFrom === dateTo;

  const toCheck   = allArrivals.filter((r: any) => r.status === 'booked');
  const checkedIn = allArrivals.filter((r: any) => r.status === 'checked_in');
  const checkedOut = allArrivals.filter((r: any) => r.status === 'completed');

  function handleUpdate() {
    load();
    if (searchQuery.length >= 4) api.reservations.search(searchQuery, searchIncludeAll).then(r => setSearchResults(r.data || [])).catch(() => {});
    setSelectedRes(null);
  }

  // Herlaad lijst maar houd het panel open (voor wijzigingen vanuit het panel zelf)
  function handlePanelUpdate() {
    load();
    if (searchQuery.length >= 4) api.reservations.search(searchQuery, searchIncludeAll).then(r => setSearchResults(r.data || [])).catch(() => {});
  }

  const btnBase: React.CSSProperties = { padding: '5px 11px', borderRadius: 6, border: '0.5px solid rgba(10,34,64,0.2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'white', color: '#0a2240' };
  const btnActive: React.CSSProperties = { ...btnBase, background: '#0a2240', color: 'white', border: 'none' };

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '22px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0a2240' }}>Reserveringen</h1>
          <button onClick={runUmbracoSync} disabled={syncing}
            title="Haal nieuwe reserveringen op uit het oude systeem (Umbraco)"
            style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: syncing ? '#9bb0c8' : '#0a7c6e', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: syncing ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ArrowPathIcon className="w-3 h-3" style={{ ...(syncing ? { animation: 'spin 1s linear infinite' } : {}) }} />
            {syncing ? 'Synchroniseren…' : 'Synchroniseren'}
          </button>
          <button onClick={refreshRdw} disabled={rdwRefreshing}
            style={{ fontSize: 11, fontWeight: 600, color: rdwRefreshing ? '#aaa' : '#7090b0', background: 'none', border: '0.5px solid #c8d8e8', borderRadius: 6, padding: '4px 10px', cursor: rdwRefreshing ? 'default' : 'pointer' }}>
            {rdwRefreshing ? <><ArrowPathIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />RDW...</> : <><MagnifyingGlassIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />RDW vernieuwen</>}
          </button>
        </div>

        {/* Datum navigatie */}
        <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
          {/* Snelknoppen */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <button style={dateFrom === addDays(todayIso,-1) && isSingleDay ? btnActive : btnBase}
              onClick={() => { const d=addDays(todayIso,-1); setDateFrom(d);setDateTo(d);setRangeMode(false);load(d,d); }}>Gisteren</button>
            <button style={isToday && !rangeMode ? btnActive : btnBase} onClick={() => { setRangeMode(false); setQuickRange(1); }}>Vandaag</button>
            <button style={!isSingleDay && dateTo===addDays(todayIso,1) ? btnActive : btnBase} onClick={() => { setRangeMode(true); setQuickRange(2); }}>2 dagen</button>
            <button style={!isSingleDay && dateTo===addDays(todayIso,6) ? btnActive : btnBase} onClick={() => { setRangeMode(true); setQuickRange(7); }}>7 dagen</button>
            <div style={{ width: 1, background: 'rgba(10,34,64,0.1)', margin: '0 4px' }} />
            <button style={rangeMode ? btnActive : btnBase} onClick={() => setRangeMode(r => !r)}><CalendarDaysIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Bereik</button>
          </div>

          {/* Datum invoer */}
          {rangeMode ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#7090b0', fontWeight: 600 }}>Van</span>
              <input type="date" value={dateFrom}
                onChange={e => { if (e.target.value) { setDateFrom(e.target.value); load(e.target.value, dateTo); } }}
                style={{ border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, padding: '5px 9px', fontSize: 13, color: '#0a2240', fontWeight: 600, background: 'white' }} />
              <span style={{ fontSize: 12, color: '#7090b0', fontWeight: 600 }}>t/m</span>
              <input type="date" value={dateTo} min={dateFrom}
                onChange={e => { if (e.target.value) { setDateTo(e.target.value); load(dateFrom, e.target.value); } }}
                style={{ border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, padding: '5px 9px', fontSize: 13, color: '#0a2240', fontWeight: 600, background: 'white' }} />
              {allArrivals.length > 0 && (
                <span style={{ fontSize: 12, color: '#7090b0' }}>{allArrivals.length} aankomsten</span>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => changeSingleDate(-1)} style={{ ...btnBase, padding: '5px 10px', fontSize: 14 }}>‹</button>
              <input type="date" value={dateFrom}
                onChange={e => { if (e.target.value) { setDateFrom(e.target.value); setDateTo(e.target.value); load(e.target.value, e.target.value); } }}
                style={{ border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, padding: '5px 9px', fontSize: 13, color: '#0a2240', fontWeight: 600, background: 'white' }} />
              <button onClick={() => changeSingleDate(1)} style={{ ...btnBase, padding: '5px 10px', fontSize: 14 }}>›</button>
              <span style={{ fontSize: 13, color: '#7090b0', textTransform: 'capitalize' }}>{fmtDateLong(dateFrom)}</span>
            </div>
          )}
        </div>

        {/* Filter + afdrukken */}
        {!isSearching && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setArrivalTab('booked')}
              style={{ padding: '5px 12px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: arrivalTab==='booked' ? '#0a2240' : 'rgba(10,34,64,0.07)', color: arrivalTab==='booked' ? 'white' : '#0a2240' }}>
              Te inchecken {toCheck.length > 0 && `(${toCheck.length})`}
            </button>
            <button onClick={() => setArrivalTab('checked_in')}
              style={{ padding: '5px 12px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: arrivalTab==='checked_in' ? '#0a7c6e' : 'rgba(10,34,64,0.07)', color: arrivalTab==='checked_in' ? 'white' : '#0a2240' }}>
              <CheckIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Ingecheckt {checkedIn.length > 0 && `(${checkedIn.length})`}
            </button>
            <button onClick={() => setArrivalTab('completed')}
              style={{ padding: '5px 12px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: arrivalTab==='completed' ? '#556070' : 'rgba(10,34,64,0.07)', color: arrivalTab==='completed' ? 'white' : '#0a2240', opacity: checkedOut.length === 0 ? 0.45 : 1 }}>
              <CheckIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Uitgecheckt {checkedOut.length > 0 && `(${checkedOut.length})`}
            </button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button onClick={() => load()} style={{ background: 'none', border: '0.5px solid rgba(10,34,64,0.15)', borderRadius: 6, padding: '5px 9px', fontSize: 11, color: '#7090b0', cursor: 'pointer', display:'flex', alignItems:'center' }}><ArrowPathIcon className="w-4 h-4" /></button>
              {isSingleDay && toCheck.length > 0 && (
                <button onClick={() => window.open(`/print/envelopes?ids=${toCheck.map((r: any) => r.id).join(',')}`, '_blank')}
                  style={{ background: '#0a2240', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  <PrinterIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Enveloppen ({toCheck.length})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Zoekbalk */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ position: 'relative' }}>
            <MagnifyingGlassIcon className="w-4 h-4" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ab0c8' }} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Zoek op kenteken, naam of reserveringsnummer..."
              style={{ width: '100%', padding: '8px 34px 8px 32px', border: '0.5px solid rgba(10,34,64,0.18)', borderRadius: 8, fontSize: 13, color: '#0a2240', boxSizing: 'border-box', background: 'white' }} />
            {searchQuery && <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9ab0c8', cursor: 'pointer', display:'flex', alignItems:'center' }}><XMarkIcon className="w-4 h-4" /></button>}
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
                  {[...searchResults].sort((a, b) => b.arrival_date.localeCompare(a.arrival_date)).map((r: any) => <ArrivalCard key={r.id} res={r} onSelect={() => setSelectedRes(r)} onUpdate={handleUpdate} compact />)}
                </>
        ) : loading ? (
          <div style={{ color: '#7090b0', padding: 16 }}>Laden...</div>
        ) : isSingleDay ? (
          /* Enkelvoudige dag — bestaande weergave */
          <>
            {(() => {
              const displayed = arrivalTab === 'checked_in' ? checkedIn : arrivalTab === 'completed' ? checkedOut : toCheck;
              return displayed.length === 0
                ? <div className="card" style={{ padding: 28, textAlign: 'center', color: '#7090b0' }}>
                    {arrivalTab === 'checked_in' ? 'Niemand ingecheckt op deze dag' : arrivalTab === 'completed' ? 'Niemand uitgecheckt op deze dag' : 'Geen verwachte aankomsten'}
                  </div>
                : displayed.map((r: any) => <ArrivalCard key={r.id} res={r} onSelect={() => setSelectedRes(r)} onUpdate={handleUpdate} />);
            })()}
          </>
        ) : (
          /* Bereik-weergave — gegroepeerd per datum */
          <>
            {dateGroups.length === 0 && (
              <div className="card" style={{ padding: 28, textAlign: 'center', color: '#7090b0' }}>
                Geen aankomsten in dit bereik
              </div>
            )}
            {dateGroups.map(d => {
              const dayArrivals = arrivalsByDate[d] || [];
              const dayToCheck = dayArrivals.filter((r: any) => r.status === 'booked');
              const dayCheckedIn = dayArrivals.filter((r: any) => r.status === 'checked_in');
              const dayCheckedOut = dayArrivals.filter((r: any) => r.status === 'completed');
              const displayed = arrivalTab === 'checked_in' ? dayCheckedIn : arrivalTab === 'completed' ? dayCheckedOut : dayToCheck;
              if (displayed.length === 0) return null;
              return (
                <div key={d}>
                  {/* Dag-header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 8px', position: 'sticky', top: 0, zIndex: 10, background: '#f4f6f9', padding: '6px 0' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0a2240', textTransform: 'capitalize' }}>
                      {fmtDateLong(d)}
                    </div>
                    <div style={{ fontSize: 12, color: '#7090b0', fontWeight: 600 }}>
                      {displayed.length} aankomst{displayed.length !== 1 ? 'en' : ''}
                    </div>
                    <button onClick={() => window.open(`/print/envelopes?date=${d}`, '_blank')}
                      style={{ marginLeft: 'auto', background: '#0a2240', color: 'white', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      <PrinterIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Enveloppen
                    </button>
                  </div>
                  {displayed.map((r: any) => <ArrivalCard key={r.id} res={r} onSelect={() => setSelectedRes(r)} onUpdate={handleUpdate} />)}
                </div>
              );
            })}
          </>
        )}

        {/* ── Vertrekken vandaag ─────────────────────────────── */}
        {isSingleDay && !isSearching && allDepartures.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0a2240' }}>
                Vertrekken vandaag
              </h2>
              {/* Toggle: nog uit te checken vs. al uitgecheckt */}
              {(() => {
                const pending   = allDepartures.filter((r: any) => r.status !== 'completed');
                const completed = allDepartures.filter((r: any) => r.status === 'completed');
                return (
                  <>
                    <button onClick={() => setShowDepartedToday(false)}
                      style={{ padding: '4px 12px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        background: !showDepartedToday ? '#0a2240' : 'rgba(10,34,64,0.07)',
                        color: !showDepartedToday ? 'white' : '#0a2240' }}>
                      Uit te checken {pending.length > 0 && `(${pending.length})`}
                    </button>
                    {completed.length > 0 && (
                      <button onClick={() => setShowDepartedToday(true)}
                        style={{ padding: '4px 12px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          background: showDepartedToday ? '#0a7c6e' : 'rgba(10,34,64,0.07)',
                          color: showDepartedToday ? 'white' : '#0a2240' }}>
                        <CheckIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle',marginRight:3}} />
                        Uitgecheckt ({completed.length})
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
            {/* ── Keysafe live overzicht: kluis 1–7 ── */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'stretch' }}>
              {[1,2,3,4,5,6,7].map(n => {
                // Reserveringsdata (uit DB) — alleen vertrekkende klanten vandaag
                const dep       = allDepartures.find((r: any) => String(r.parking_spot) === String(n));
                const collected = dep?.locker_collected_at;
                const depCode   = dep?.locker_code || null;  // code uit DB (aangemaakt via PMS)

                // Live gateway-data
                const gw    = keysafeLockers.find((l: any) => l.locker_number === n || l.index === n - 1);
                const keyIn = gw?.product_in ?? false;       // sleutel fysiek aanwezig in kluis

                const plate = dep ? (dep.plates || '').split(', ')[0] : null;
                const naam  = dep ? `${dep.first_name} ${dep.last_name}` : null;

                // Bepaal status — alleen op basis van PMS-data (dep), niet op rauwe gateway-code
                // want de gateway slaat altijd de laatste code op, ook als de kluis leeg/vrij is.
                const isOccupied = !!dep && !!depCode && !collected; // code aangemaakt, nog niet opgehaald
                const isDone     = !!collected;

                const color = isDone ? '#3a80c0' : keyIn ? '#43a047' : isOccupied ? '#e8a020' : '#9ab0c8';
                const icon  = isDone ? '✓' : keyIn ? '🔑' : isOccupied ? '⏳' : '·';

                return (
                  <div key={n} style={{ display:'flex', alignItems:'stretch', gap:0,
                    background:`${color}12`, border:`1.5px solid ${color}60`,
                    borderRadius:9, overflow:'hidden', userSelect:'none' }}>

                    {/* Kluisnummer + icoon */}
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                      padding:'6px 10px', fontWeight:900, fontSize:14, color, gap:1, minWidth:38 }}>
                      <span style={{ fontSize:15 }}>{icon}</span>
                      <span style={{ fontSize:11 }}>{n}</span>
                    </div>

                    {/* Detail (alleen als er een reservering is) */}
                    {dep && (
                      <div style={{ display:'flex', flexDirection:'column', justifyContent:'center',
                        borderLeft:`1px solid ${color}30`, padding:'5px 9px', gap:3 }}>
                        {naam && <span style={{ fontSize:11, fontWeight:700, color:'#0a2240', lineHeight:1.2, whiteSpace:'nowrap' }}>{naam}</span>}
                        {plate && (
                          <div style={{ display:'inline-flex', alignItems:'stretch', borderRadius:3,
                            border:'2px solid #999', overflow:'hidden', background:'#f5c518',
                            fontFamily:"'Arial Narrow',Arial,sans-serif", fontWeight:800,
                            fontSize:13, letterSpacing:1.5 }}>
                            <div style={{ width:8, background:'#003399', flexShrink:0 }} />
                            <span style={{ padding:'1px 6px', color:'#000', textTransform:'uppercase' }}>
                              {formatPlate(plate)}
                            </span>
                          </div>
                        )}
                        {/* Code tonen (uit DB, niet uit gateway — gateway heeft altijd een code) */}
                        {depCode && !isDone && (
                          <span style={{ fontSize:15, fontWeight:900, color: keyIn ? '#2a7a3a' : '#b07a10',
                            fontFamily:'monospace', letterSpacing:3, lineHeight:1 }}>
                            {depCode}
                          </span>
                        )}
                        {isDone && (
                          <span style={{ fontSize:10, color:'#3a80c0', fontWeight:700 }}>
                            opgehaald {new Date(collected).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}
                          </span>
                        )}
                      </div>
                    )}

                    {/* ✕ Handmatig leeg maken (alleen als bezet of opgehaald) */}
                    {dep && (isOccupied || isDone) && (
                      <button
                        title="Kluis handmatig leeg maken"
                        onClick={async () => {
                          try {
                            await api.reservations.update(dep.id, { parkingSpot: null, clearLockerInfo: true });
                            handleUpdate();
                          } catch (e: any) { toastError(e?.message || 'Kon kluis niet legen'); }
                        }}
                        style={{ background:'none', border:'none', borderLeft:`1px solid ${color}30`,
                          padding:'4px 8px', cursor:'pointer', color:'#9ab0c8', fontSize:14,
                          display:'flex', alignItems:'center', alignSelf:'stretch',
                          transition:'color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#e53935')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#9ab0c8')}>
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {[...(showDepartedToday
              ? allDepartures.filter((r: any) => r.status === 'completed')
              : allDepartures.filter((r: any) => r.status !== 'completed')
            )].sort((a, b) => {
              const ta = a.ferry_return_arrival_harlingen || a.ferry_return_time || '99:99';
              const tb = b.ferry_return_arrival_harlingen || b.ferry_return_time || '99:99';
              return ta.localeCompare(tb);
            }).map((r: any) => {
              // Bezette kluizen = alle andere vertrekkers die vandaag al een kluis hebben
              const occupied = allDepartures
                .filter((d: any) => d.id !== r.id && d.parking_spot && !d.locker_collected_at)
                .map((d: any) => String(d.parking_spot));
              return (
                <DepartureCard key={r.id} res={r} onUpdate={handleUpdate} occupiedLockers={occupied} />
              );
            })}
          </div>
        )}

      </div>

      {selectedRes && <DetailPanel res={selectedRes} onClose={() => setSelectedRes(null)} onUpdate={handlePanelUpdate} />}

    </AdminLayout>
  );
}
