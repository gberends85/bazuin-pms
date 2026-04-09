'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import PlateTooltip from '@/components/ui/PlateTooltip';
import Modal from '@/components/ui/Modal';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ReservationDetailPage({ params }: { params: { id: string } }) {
  const [res, setRes] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundPct, setRefundPct] = useState(100);
  const [cancelReason, setCancelReason] = useState('');
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  // Wijziging state
  const [modifyOpen, setModifyOpen] = useState(false);
  const [modNewArrival, setModNewArrival] = useState('');
  const [modNewDeparture, setModNewDeparture] = useState('');
  const [modPreview, setModPreview] = useState<any>(null);
  const [modOverrideAvail, setModOverrideAvail] = useState(false);
  const [modOverridePrice, setModOverridePrice] = useState('');
  const [modNotes, setModNotes] = useState('');
  const [modLoading, setModLoading] = useState(false);
  const [modHistory, setModHistory] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    try { const d = await api.reservations.get(params.id); setRes(d); }
    catch (e: any) { toastError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    api.reservations.modifications(params.id).then(setModHistory).catch(() => {});
  }, [params.id]);

  function openModify() {
    if (res) {
      setModNewArrival(res.arrival_date?.slice(0, 10) || '');
      setModNewDeparture(res.departure_date?.slice(0, 10) || '');
      setModPreview(null); setModOverridePrice(''); setModNotes(''); setModOverrideAvail(false);
    }
    setModifyOpen(true);
  }

  async function calcModPreview() {
    setModLoading(true);
    try {
      const p = await api.reservations.modificationPreview(params.id, modNewArrival, modNewDeparture, modOverrideAvail);
      setModPreview(p);
    } catch (e: any) { toastError(e.message); }
    finally { setModLoading(false); }
  }

  async function doModify() {
    setModLoading(true);
    try {
      await api.reservations.modify(params.id, {
        newArrivalDate: modNewArrival, newDepartureDate: modNewDeparture,
        overrideAvailability: modOverrideAvail,
        overrideTotalPrice: modOverridePrice ? parseFloat(modOverridePrice) : undefined,
        adminNotes: modNotes || undefined,
      });
      toast('Reservering gewijzigd ✓');
      setModifyOpen(false);
      load();
      api.reservations.modifications(params.id).then(setModHistory).catch(() => {});
    } catch (e: any) { toastError(e.message); }
    finally { setModLoading(false); }
  }

  async function doCheckin() {
    setSaving(true);
    try { await api.reservations.checkin(params.id); toast('Ingecheckt ✓'); load(); }
    catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  async function doCheckout() {
    setSaving(true);
    try { await api.reservations.checkout(params.id); toast('Uitgecheckt ✓'); load(); }
    catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  async function doCancel() {
    setSaving(true);
    try {
      const r = await api.reservations.cancel(params.id, refundPct, cancelReason);
      toast(`Geannuleerd — € ${r.refundAmount?.toFixed(2)} restitutie`);
      setCancelOpen(false);
      load();
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  async function openWa(msg: string) {
    const r = await api.reservations.whatsapp(params.id, msg).catch(() => null);
    if (r?.waLink) window.open(r.waLink, '_blank');
  }

  if (loading) return <AdminLayout><div style={{ padding: 40, color: '#7090b0' }}>Laden...</div></AdminLayout>;
  if (!res) return <AdminLayout><div style={{ padding: 40 }}>Niet gevonden</div></AdminLayout>;

  const STATUS_LABELS: Record<string, string> = {
    booked: 'Geboekt', checked_in: 'Ingecheckt',
    completed: 'Voltooid', cancelled: 'Geannuleerd', no_show: 'Niet verschenen',
  };
  const PAY_LABELS: Record<string, string> = {
    paid: 'Betaald', on_site: 'Ter plekke', pending: 'Wacht',
    refunded: 'Terugbetaald', failed: 'Mislukt',
  };
  const statusColors: Record<string, string> = {
    booked: '#e6f1fb', checked_in: '#e6f7f5', completed: '#e8e8e8',
    cancelled: '#fdeaea', no_show: '#fdeaea',
  };

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 900 }}>

        {/* Breadcrumb + actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/reservations" style={{ color: '#7090b0', textDecoration: 'none', fontSize: 13 }}>← Reserveringen</Link>
            <span style={{ color: '#7090b0' }}>/</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>{res.reference}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {res.status === 'booked' && (
              <>
                <button className="btn btn-primary btn-sm" onClick={doCheckin} disabled={saving}>✓ Inchecken</button>
                <button className="btn btn-navy btn-sm" onClick={() => { /* open checkin+mail modal */ }}>✓ + Mail</button>
                <button className="btn btn-gold btn-sm" onClick={openModify}>✏ Wijzigen</button>
              </>
            )}
            {res.status === 'checked_in' && (
              <button className="btn btn-primary btn-sm" onClick={doCheckout} disabled={saving}>⬆ Uitchecken</button>
            )}
            <button className="btn btn-sm" style={{ background: '#f4f6f9', color: '#0a2240', border: '0.5px solid rgba(10,34,64,0.2)' }}
              onClick={() => window.open(`/print/envelope/${params.id}`, '_blank')}
              title="Envelop afdrukken">🖨 Envelop</button>
            {res.status !== 'cancelled' && res.status !== 'completed' && (
              <button className="btn btn-danger btn-sm" onClick={() => setCancelOpen(true)}>✕ Annuleren</button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          {/* Main */}
          <div>
            {/* Status header */}
            <div className="card" style={{ padding: '18px 22px', marginBottom: 14, background: statusColors[res.status] || 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#0a2240' }}>
                    {res.first_name} {res.last_name}
                  </div>
                  <div style={{ fontSize: 13, color: '#7090b0', marginTop: 2 }}>
                    {res.email} · {res.phone || 'geen telefoon'}
                    {res.btw_number && ` · BTW: ${res.btw_number}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#0a2240' }}>
                    € {Number(res.total_price).toFixed(2)}
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                    <span className={`status-badge badge-${res.payment_status}`}>
                      {PAY_LABELS[res.payment_status] || res.payment_status}
                    </span>
                    <span className={`status-badge badge-${res.status}`}>
                      {STATUS_LABELS[res.status] || res.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Voertuigen */}
            <div className="card" style={{ padding: '18px 22px', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', marginBottom: 14 }}>Voertuigen</div>
              {(res.vehicles || []).map((v: any, i: number) => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < res.vehicles.length - 1 ? '0.5px solid rgba(10,34,64,0.08)' : 'none' }}>
                  <PlateTooltip plate={v.license_plate} />
                  {v.rdw_make && (
                    <div style={{ fontSize: 13, color: '#7090b0' }}>
                      {v.rdw_make} {v.rdw_model}
                      {v.rdw_color && ` · ${v.rdw_color}`}
                      {v.rdw_fuel_type && ` · ${v.rdw_fuel_type}`}
                    </div>
                  )}
                  {v.ev_kwh && (
                    <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#0a7c6e', background: '#e6f7f5', padding: '3px 10px', borderRadius: 20 }}>
                      ⚡ {v.ev_kwh} kWh · € {Number(v.ev_price).toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Veerboot */}
            <div className="card" style={{ padding: '18px 22px', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', marginBottom: 14 }}>Veerbootinformatie</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13 }}>
                {[
                  ['Bestemming', res.ferry_outbound_destination || '—'],
                  ['Heenreis', `${res.ferry_outbound_name || '—'} ${res.ferry_outbound_time ? `om ${res.ferry_outbound_time.slice(0,5)}` : ''}`],
                  ['Terugreis', `${res.ferry_return_name || (res.ferry_return_custom ? 'Eigen tijd' : '—')} ${res.ferry_return_time ? `om ${res.ferry_return_time.slice(0,5)}` : ''}`],
                  ['Snelle boot', res.is_fast_ferry_outbound ? 'Ja' : 'Nee'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Prijsopbouw */}
            <div className="card" style={{ padding: '18px 22px', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', marginBottom: 14 }}>Prijsopbouw</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid rgba(10,34,64,0.06)' }}>
                  <span style={{ color: '#7090b0' }}>Parkeerkosten</span>
                  <span>€ {Number(res.base_price).toFixed(2)}</span>
                </div>
                {Number(res.season_surcharge_amount) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid rgba(10,34,64,0.06)' }}>
                    <span style={{ color: '#7090b0' }}>Seizoenstoeslag</span>
                    <span>€ {Number(res.season_surcharge_amount).toFixed(2)}</span>
                  </div>
                )}
                {Number(res.services_total) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid rgba(10,34,64,0.06)' }}>
                    <span style={{ color: '#7090b0' }}>Extra diensten (EV etc.)</span>
                    <span>€ {Number(res.services_total).toFixed(2)}</span>
                  </div>
                )}
                {Number(res.on_site_surcharge) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid rgba(10,34,64,0.06)' }}>
                    <span style={{ color: '#7090b0' }}>Toeslag ter plekke betalen</span>
                    <span>€ {Number(res.on_site_surcharge).toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 5px', borderTop: '1.5px solid #0a2240', fontWeight: 800, fontSize: 16 }}>
                  <span>Totaal incl. BTW (21%)</span>
                  <span>€ {Number(res.total_price).toFixed(2)}</span>
                </div>
                {res.refund_amount && Number(res.refund_amount) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', color: '#2a7a3a', fontWeight: 600 }}>
                    <span>Restitutie ({res.refund_percentage}%)</span>
                    <span>− € {Number(res.refund_amount).toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Admin notities */}
            <div className="card" style={{ padding: '18px 22px', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', marginBottom: 10 }}>Interne notities</div>
              <textarea
                defaultValue={res.admin_notes || ''}
                placeholder="Aantekeningen voor intern gebruik..."
                onBlur={async e => {
                  try {
                    await api.reservations.update(params.id, { admin_notes: e.target.value });
                    toast('Notitie opgeslagen');
                  } catch { /* silent */ }
                }}
                style={{ width: '100%', border: '0.5px solid rgba(10,34,64,0.15)', borderRadius: 8, padding: '10px 12px', fontSize: 13, resize: 'vertical', minHeight: 80, boxSizing: 'border-box' }}
              />
            </div>

            {/* Wijzigingshistorie */}
            {modHistory.length > 0 && (
              <div className="card" style={{ padding: '18px 22px' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', marginBottom: 12 }}>✏ Wijzigingshistorie</div>
                {modHistory.map((m: any) => (
                  <div key={m.id} style={{ padding: '10px 0', borderBottom: '0.5px solid rgba(10,34,64,0.06)', fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: '#0a2240' }}>
                        {m.modified_by === 'admin' ? `Admin${m.admin_email ? ` (${m.admin_email})` : ''}` : 'Klant'}
                      </span>
                      <span style={{ color: '#7090b0' }}>{new Date(m.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div style={{ color: '#7090b0' }}>
                      {new Date(m.old_arrival_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – {new Date(m.old_departure_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                      {' → '}
                      <strong style={{ color: '#0a2240' }}>
                        {new Date(m.new_arrival_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – {new Date(m.new_departure_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                      </strong>
                    </div>
                    <div style={{ marginTop: 2, color: parseFloat(m.price_difference) > 0 ? '#8a2020' : parseFloat(m.price_difference) < 0 ? '#0a7c6e' : '#7090b0' }}>
                      € {parseFloat(m.old_total_price).toFixed(2)} → € {parseFloat(m.new_total_price).toFixed(2)}
                      {parseFloat(m.price_difference) !== 0 && (
                        <span> ({parseFloat(m.price_difference) > 0 ? '+' : ''}€ {parseFloat(m.price_difference).toFixed(2)})</span>
                      )}
                    </div>
                    {m.admin_notes && <div style={{ marginTop: 4, fontStyle: 'italic', color: '#7090b0' }}>{m.admin_notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div>
            {/* Quick info */}
            <div className="card" style={{ padding: '16px 18px', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0a2240', marginBottom: 12 }}>Details</div>
              {[
                ['Referentie', res.reference],
                ['Aankomst', new Date(res.arrival_date).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })],
                ['Vertrek', new Date(res.departure_date).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })],
                ['Nachten', res.nights],
                ['Betaalmethode', res.payment_method],
                ['Aangemaakt', new Date(res.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })],
                ...(res.checkin_at ? [['Ingecheckt om', new Date(res.checkin_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })]] : []),
                ...(res.parking_spot ? [['Vaknummer', res.parking_spot]] : []),
              ].map(([k, v]) => (
                <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12, borderBottom: '0.5px solid rgba(10,34,64,0.06)' }}>
                  <span style={{ color: '#7090b0' }}>{k}</span>
                  <span style={{ fontWeight: 600, fontFamily: k === 'Referentie' ? 'monospace' : 'inherit' }}>{v}</span>
                </div>
              ))}
            </div>

            {/* WhatsApp quick actions */}
            <div className="card" style={{ padding: '16px 18px' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0a2240', marginBottom: 10 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#25d366" style={{ marginRight: 6, verticalAlign: 'middle' }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.096.546 4.067 1.5 5.787L0 24l6.388-1.674A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.65-.511-5.162-1.401L2 22l1.438-4.697A9.944 9.944 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                WhatsApp snelberichten
              </div>
              {[
                ['🚗 Auto staat klaar', `Goedemorgen! Uw auto (${res.vehicles?.[0]?.license_plate || ''}) staat klaar bij Autostalling De Bazuin. Fijne reis!`],
                ['⛴ Boot aangekomen', 'De boot is aangekomen in Harlingen. U kunt uw auto ophalen. Bel aan bij de intercom als de deur gesloten is.'],
                ['🔑 Welkomstbericht', 'Welkom bij Autostalling De Bazuin! Parkeer op de gele vakken en werp de sleutel in de kluis.'],
              ].map(([label, msg]) => (
                <button key={String(label)} className="btn btn-ghost btn-sm"
                  style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 6, fontSize: 12 }}
                  onClick={() => openWa(msg as string)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Wijzigen modal */}
      <Modal open={modifyOpen} onClose={() => setModifyOpen(false)} title="Reservering wijzigen">
        <div style={{ fontSize: 12, color: '#7090b0', marginBottom: 14, padding: '8px 12px', background: '#f8f9fb', borderRadius: 7 }}>
          Huidige periode: <strong style={{ color: '#0a2240' }}>
            {res?.arrival_date ? new Date(res.arrival_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '—'}
            {' – '}
            {res?.departure_date ? new Date(res.departure_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
          </strong>
          {' · '}€ {Number(res?.total_price || 0).toFixed(2)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block', marginBottom: 5 }}>Nieuwe aankomst</label>
            <input type="date" value={modNewArrival} onChange={e => { setModNewArrival(e.target.value); setModPreview(null); }}
              style={{ width: '100%', padding: '8px 10px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block', marginBottom: 5 }}>Nieuw vertrek</label>
            <input type="date" value={modNewDeparture} onChange={e => { setModNewDeparture(e.target.value); setModPreview(null); }}
              style={{ width: '100%', padding: '8px 10px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14 }} />
          </div>
        </div>

        {/* Admin powers */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={modOverrideAvail} onChange={e => setModOverrideAvail(e.target.checked)} />
            Beschikbaarheid overrulen (ook boeken als vol)
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block', marginBottom: 5 }}>
            Tarief overrulen (leeg = berekend tarief)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700 }}>€</span>
            <input type="number" min={0} step="0.01" value={modOverridePrice} onChange={e => setModOverridePrice(e.target.value)}
              placeholder="Bijv. 120.00"
              style={{ width: 130, padding: '8px 10px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14 }} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block', marginBottom: 5 }}>Interne notitie (optioneel)</label>
          <input value={modNotes} onChange={e => setModNotes(e.target.value)} placeholder="Reden wijziging..."
            style={{ width: '100%', padding: '8px 10px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14 }} />
        </div>

        {/* Preview result */}
        {modPreview && (
          <div style={{ background: '#f4f6f9', borderRadius: 8, padding: '12px 14px', marginBottom: 12, fontSize: 12 }}>
            {[
              ['Nieuw tarief', `€ ${parseFloat(modPreview.newPrice).toFixed(2)}${modOverridePrice ? ' (override)' : ''}`],
              ['Prijsverschil', `${modPreview.priceDifference > 0 ? '+' : ''}€ ${parseFloat(modPreview.priceDifference).toFixed(2)}`],
              ...(modPreview.modificationFee > 0 ? [['Wijzigingstoeslag', `€ ${modPreview.modificationFee.toFixed(2)}`]] : []),
              ...(modPreview.netAmountDue > 0 ? [['Bijbetaling klant', `€ ${modPreview.netAmountDue.toFixed(2)}`]] : []),
              ...(modPreview.netRefundAmount > 0 ? [['Restitutie', `€ ${modPreview.netRefundAmount.toFixed(2)}`]] : []),
            ].map(([k, v]) => (
              <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '0.5px solid rgba(10,34,64,0.06)' }}>
                <span style={{ color: '#7090b0' }}>{k}</span>
                <span style={{ fontWeight: 700 }}>{v}</span>
              </div>
            ))}
            {!modPreview.available && !modOverrideAvail && (
              <div style={{ marginTop: 8, color: '#8a2020', fontWeight: 600 }}>⚠ Onvoldoende beschikbare plaatsen. Vink "overrulen" aan om toch te boeken.</div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setModifyOpen(false)}>Annuleren</button>
          {!modPreview ? (
            <button className="btn btn-navy btn-sm" onClick={calcModPreview} disabled={modLoading || !modNewArrival || !modNewDeparture}>
              {modLoading ? 'Berekenen...' : 'Berekenen'}
            </button>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setModPreview(null)}>Herberekenen</button>
              <button className="btn btn-gold btn-sm" onClick={doModify}
                disabled={modLoading || (!modPreview.available && !modOverrideAvail)}>
                {modLoading ? 'Opslaan...' : '✓ Wijziging bevestigen'}
              </button>
            </>
          )}
        </div>
      </Modal>

      {/* Cancel modal */}
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Reservering annuleren">
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>
            Restitutiepercentage
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="range" min={0} max={100} value={refundPct} onChange={e => setRefundPct(Number(e.target.value))} style={{ flex: 1 }} />
            <span style={{ fontWeight: 800, fontSize: 18, minWidth: 48, textAlign: 'right' }}>{refundPct}%</span>
          </div>
          <div style={{ fontSize: 13, color: '#7090b0', marginTop: 6 }}>
            Restitutie: <strong style={{ color: '#0a2240' }}>€ {(Number(res.total_price) * refundPct / 100).toFixed(2)}</strong>
            {' '}van € {Number(res.total_price).toFixed(2)}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
            Reden (optioneel)
          </label>
          <input value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Reden voor annulering..."
            style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14 }} />
        </div>
        <div style={{ fontSize: 12, color: '#7090b0', marginBottom: 14, padding: '10px 12px', background: '#f4f6f9', borderRadius: 7 }}>
          Klant ontvangt automatisch een annuleringsbevestiging per e-mail. Restitutie wordt direct verwerkt via Stripe.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setCancelOpen(false)}>Terug</button>
          <button className="btn btn-danger" onClick={doCancel} disabled={saving}>
            {saving ? 'Verwerken...' : 'Bevestig annulering'}
          </button>
        </div>
      </Modal>
    </AdminLayout>
  );
}
