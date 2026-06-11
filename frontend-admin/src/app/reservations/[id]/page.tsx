'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import PlateTooltip from '@/components/ui/PlateTooltip';
import Modal from '@/components/ui/Modal';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import RefundPolicyInfo from '@/components/ui/RefundPolicyInfo';
import { api, getToken } from '@/lib/api';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CheckIcon, XMarkIcon, PencilSquareIcon, ArrowUpTrayIcon,
  DocumentTextIcon, PrinterIcon, UserIcon, ChatBubbleOvalLeftEllipsisIcon,
  ClipboardDocumentListIcon, CreditCardIcon, ArrowPathIcon,
  ExclamationTriangleIcon, ClockIcon, CalendarDaysIcon,
  ArrowUturnLeftIcon, BanknotesIcon, DevicePhoneMobileIcon, BuildingLibraryIcon,
  BoltIcon, EnvelopeIcon,
} from '@heroicons/react/24/outline';
import { Banknote, RefreshCw, X, Link2, ClipboardCheck } from 'lucide-react';

export default function ReservationDetailPage({ params }: { params: { id: string } }) {
  const [res, setRes] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundPct, setRefundPct] = useState(100);
  const [refundInfo, setRefundInfo] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');
  // Bij openen annuleer-venster: standaard het restitutie% volgens annuleringsbeleid voorselecteren
  useEffect(() => {
    if (cancelOpen && res?.payment_status === 'paid') {
      api.reservations.refundPreview(params.id).then(p => { setRefundPct(p.refundPct); setRefundInfo(p); }).catch(() => {});
    } else if (cancelOpen && res && res.payment_status !== 'paid') {
      setRefundPct(0);
    }
  }, [cancelOpen]);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

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
  const [stripeData, setStripeData] = useState<any>(null);
  const [stripeSyncing, setStripeSyncing] = useState(false);
  const [applyingOnSite, setApplyingOnSite] = useState(false);
  const [onSiteSurchargeSaving, setOnSiteSurchargeSaving] = useState(false);
  const [ferryDoeksenSyncing, setFerryDoeksenSyncing] = useState(false);
  // Bijbetaling na wijziging
  const [pendingPayStep, setPendingPayStep] = useState(false);
  const [pendingPayAmt, setPendingPayAmt] = useState(0);
  const [pendingPayModId, setPendingPayModId] = useState<string | null>(null);
  const [sendingPayLink, setSendingPayLink] = useState(false);

  // Extra factuurregels
  const [extraItems, setExtraItems] = useState<Array<{description:string; quantity:number; unit_price:number}>>([]);
  const [extraItemsSaving, setExtraItemsSaving] = useState(false);

  // Betaalstatus
  const [payStatusSaving, setPayStatusSaving] = useState(false);

  // Factuurdatum
  const [invoiceDate, setInvoiceDate] = useState<string>('');
  const [invoiceDateSaving, setInvoiceDateSaving] = useState(false);

  // Kenteken inline bewerken
  const [editingPlates, setEditingPlates] = useState(false);
  const [plateValues, setPlateValues] = useState<string[]>([]);
  const [plateSaving, setPlateSaving] = useState(false);

  // Naam/contact inline bewerken
  const [editingContact, setEditingContact] = useState(false);
  const [contactValues, setContactValues] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [contactSaving, setContactSaving] = useState(false);
  const [nameLinkCopied, setNameLinkCopied] = useState(false);

  // Ferry inline bewerken
  const [editingFerry, setEditingFerry] = useState(false);
  const [ferryOutDest, setFerryOutDest] = useState<'terschelling'|'vlieland'>('terschelling');
  const [ferryRetDest, setFerryRetDest] = useState<'terschelling'|'vlieland'>('terschelling');
  const [ferryOutTime, setFerryOutTime] = useState('');
  const [ferryRetTime, setFerryRetTime] = useState('');
  const [ferryOutSchedules, setFerryOutSchedules] = useState<any[]>([]);
  const [ferryRetSchedules, setFerryRetSchedules] = useState<any[]>([]);
  const [ferryScheduleLoading, setFerryScheduleLoading] = useState(false);
  const [ferrySaving, setFerrySaving] = useState(false);
  const [ferryOutManual, setFerryOutManual] = useState(false);
  const [ferryRetManual, setFerryRetManual] = useState(false);
  const [ferryOutId, setFerryOutId] = useState('');
  const [ferryRetId, setFerryRetId] = useState('');

  function openFerryEdit() {
    const dest = (res.ferry_outbound_destination || 'terschelling') as 'terschelling'|'vlieland';
    const retDest = (res.ferry_return_destination || dest) as 'terschelling'|'vlieland';
    setFerryOutDest(dest); setFerryRetDest(retDest);
    setFerryOutTime(res.ferry_outbound_time?.slice(0,5) || '');
    setFerryRetTime(res.ferry_return_time?.slice(0,5) || '');
    setFerryOutId(''); setFerryRetId('');
    setFerryOutManual(false); setFerryRetManual(false);
    setEditingFerry(true);
    loadFerrySchedules(res.arrival_date?.slice(0,10), res.departure_date?.slice(0,10), dest, retDest);
  }

  async function loadFerrySchedules(outDate: string, retDate: string, outDest: string, retDest: string) {
    setFerryScheduleLoading(true);
    try {
      const [outRes, retRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}/ferries?date=${outDate}&destination=${outDest}&direction=outbound`, { headers: { Authorization: `Bearer ${getToken() || ''}` } }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}/ferries?date=${retDate}&destination=${retDest}&direction=return`, { headers: { Authorization: `Bearer ${getToken() || ''}` } }),
      ]);
      const outData = await outRes.json().catch(() => ({}));
      const retData = await retRes.json().catch(() => ({}));
      setFerryOutSchedules(outData.schedules || []);
      setFerryRetSchedules(retData.schedules || []);
    } catch { setFerryOutSchedules([]); setFerryRetSchedules([]); }
    finally { setFerryScheduleLoading(false); }
  }

  async function saveFerry() {
    setFerrySaving(true);
    try {
      // Determine isFast from the selected outbound schedule
      const selOutSch = ferryOutSchedules.find((s: any) => s.id === ferryOutId)
                     || ferryOutSchedules.find((s: any) => s.departureTime?.slice(0,5) === ferryOutTime);
      const selRetSch = ferryRetSchedules.find((s: any) => s.id === ferryRetId)
                     || ferryRetSchedules.find((s: any) => s.departureTime?.slice(0,5) === ferryRetTime);

      await api.reservations.update(params.id, {
        ferryOutboundTime: ferryOutTime || null,
        ferryReturnTime: ferryRetTime || null,
        ferryOutboundDestination: ferryOutDest,
        ferryReturnDestination: ferryRetDest,
        ...(selOutSch ? { ferryOutboundId: selOutSch.ferryId, isFastFerryOutbound: selOutSch.isFast } : {}),
        ...(selRetSch ? { ferryReturnId: selRetSch.ferryId } : {}),
      });
      toast('Boottijden opgeslagen ✓');
      setEditingFerry(false);
      load();
    } catch (e: any) { toastError(e.message); }
    finally { setFerrySaving(false); }
  }

  async function load() {
    setLoading(true);
    try {
      const d = await api.reservations.get(params.id);
      setRes(d);
      setPlateValues((d.vehicles || []).map((v: any) => v.license_plate || ''));
      setContactValues({ firstName: d.first_name || '', lastName: d.last_name || '', email: d.email || '', phone: d.phone || '' });
      // Sync extra items from reservation
      const items = Array.isArray(d.invoice_extra_items) ? d.invoice_extra_items
        : (typeof d.invoice_extra_items === 'string' ? JSON.parse(d.invoice_extra_items || '[]') : []);
      setExtraItems(items);
      setInvoiceDate(d.invoice_date?.slice(0, 10) || d.created_at?.slice(0, 10) || '');
    }
    catch (e: any) { toastError(e.message); }
    finally { setLoading(false); }
  }

  async function saveContact() {
    setContactSaving(true);
    try {
      await api.reservations.update(params.id, {
        firstName: contactValues.firstName,
        lastName: contactValues.lastName,
        email: contactValues.email,
        phone: contactValues.phone,
      });
      toast('Contactgegevens opgeslagen ✓');
      setEditingContact(false);
      load();
    } catch (e: any) { toastError(e.message); }
    finally { setContactSaving(false); }
  }

  async function savePlates() {
    setPlateSaving(true);
    try {
      const vehicles = (res.vehicles || []).map((v: any, i: number) => ({
        sort_order: v.sort_order ?? i,
        license_plate: plateValues[i] ?? '',
      }));
      await api.reservations.update(params.id, { vehicles });
      toast('Kentekenplaten opgeslagen ✓');
      setEditingPlates(false);
      load();
    } catch (e: any) { toastError(e.message); }
    finally { setPlateSaving(false); }
  }

  useEffect(() => {
    load();
    api.reservations.modifications(params.id).then(setModHistory).catch(() => {});
    api.reservations.stripeDetails(params.id).then(setStripeData).catch(() => {});
  }, [params.id]);

  // Auto-open modify modal when ?modify=1 in URL
  useEffect(() => {
    if (searchParams.get('modify') === '1' && res && !modifyOpen) {
      openModify();
    }
  }, [res, searchParams]);

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

  async function doSendPaymentLink() {
    if (!pendingPayModId) return;
    setSendingPayLink(true);
    try {
      await api.modifications.sendPaymentLink(pendingPayModId);
      toast('Betaallink verstuurd per e-mail ✓');
      setPendingPayStep(false);
      load();
    } catch (e: any) { toastError(e.message); }
    finally { setSendingPayLink(false); }
  }

  async function doModify() {
    setModLoading(true);
    try {
      const result = await api.reservations.modify(params.id, {
        newArrivalDate: modNewArrival, newDepartureDate: modNewDeparture,
        overrideAvailability: modOverrideAvail,
        overrideTotalPrice: modOverridePrice ? parseFloat(modOverridePrice) : undefined,
        adminNotes: modNotes || undefined,
      });
      load();
      api.reservations.modifications(params.id).then(setModHistory).catch(() => {});
      // Check of er bijbetaling nodig is
      if (result.pendingPaymentAmount > 0 && result.pendingModificationId) {
        setPendingPayAmt(result.pendingPaymentAmount);
        setPendingPayModId(result.pendingModificationId);
        setModifyOpen(false);
        setPendingPayStep(true);
      } else {
        toast('Reservering gewijzigd ✓');
        setModifyOpen(false);
      }
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

  async function saveExtraItems(items: typeof extraItems) {
    setExtraItemsSaving(true);
    try {
      await api.reservations.extraItems(params.id, items);
      setExtraItems(items);
      toast('Extra factuurregels opgeslagen ✓');
    } catch (e: any) { toastError(e.message); }
    finally { setExtraItemsSaving(false); }
  }

  async function updatePaymentStatus(status: string, method?: string | null) {
    setPayStatusSaving(true);
    try {
      await api.reservations.updatePaymentStatus(params.id, status, method);
      toast('Betaalstatus bijgewerkt ✓');
      load();
    } catch (e: any) { toastError(e.message); }
    finally { setPayStatusSaving(false); }
  }

  async function saveInvoiceDate() {
    setInvoiceDateSaving(true);
    try {
      await api.reservations.updateInvoiceDate(params.id, invoiceDate || null);
      toast('Factuurdatum opgeslagen ✓');
      load();
    } catch (e: any) { toastError(e.message); }
    finally { setInvoiceDateSaving(false); }
  }

  async function applyOnSitePayment(modId: string) {
    setApplyingOnSite(true);
    try {
      await api.modifications.applyOnSitePayment(modId);
      toast('Betaling ontvangen — wijziging toegepast ✓');
      load();
      api.reservations.modifications(params.id).then(setModHistory).catch(() => {});
    } catch (e: any) { toastError(e.message); }
    finally { setApplyingOnSite(false); }
  }

  async function toggleOnSiteSurcharge(remove: boolean) {
    setOnSiteSurchargeSaving(true);
    try {
      await api.reservations.onSiteSurcharge(params.id, remove);
      toast(remove ? 'Toeslag verwijderd ✓' : 'Betalen ter plekke ingesteld (+€5) ✓');
      load();
    } catch (e: any) { toastError(e.message); }
    finally { setOnSiteSurchargeSaving(false); }
  }

  async function syncFerryDatesFromDoeksen() {
    const outDate = res?.arrival_date?.slice(0, 10);
    const retDate = res?.departure_date?.slice(0, 10);
    if (!outDate) return;
    setFerryDoeksenSyncing(true);
    try {
      await api.ferries.syncDate(outDate);
      if (retDate && retDate !== outDate) await api.ferries.syncDate(retDate);
      toast('Boottijden opgehaald van Doeksen ✓');
      // Herlaad roosters
      loadFerrySchedules(outDate, retDate || outDate, ferryOutDest, ferryRetDest);
    } catch (e: any) { toastError('Doeksen sync mislukt: ' + e.message); }
    finally { setFerryDoeksenSyncing(false); }
  }

  async function doStripeSync() {
    setStripeSyncing(true);
    try {
      const r = await api.reservations.stripeSync(params.id);
      if (r.updated) {
        toast('Betaalstatus bijgewerkt naar Betaald ✓');
        load();
        api.reservations.stripeDetails(params.id).then(setStripeData).catch(() => {});
      } else {
        toast(`Geen update nodig — Stripe: ${r.intentStatus}, systeem: ${r.currentStatus}`);
      }
    } catch (e: any) { toastError(e.message); }
    finally { setStripeSyncing(false); }
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
            <Link href={searchParams.get('from') || '/reservations'} style={{ color: '#7090b0', textDecoration: 'none', fontSize: 13 }}>
              ← {searchParams.get('from') === '/facturen' ? 'Facturen' : searchParams.get('from')?.startsWith('/facturen/') ? 'Factuurgroep' : 'Reserveringen'}
            </Link>
            <span style={{ color: '#7090b0' }}>/</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>{res.reference}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {res.status === 'booked' && (
              <>
                <button className="btn btn-primary btn-sm" onClick={doCheckin} disabled={saving} style={{display:'inline-flex',alignItems:'center',gap:5}}><CheckIcon className="w-4 h-4" />Inchecken</button>
                <button className="btn btn-navy btn-sm" onClick={() => { /* open checkin+mail modal */ }} style={{display:'inline-flex',alignItems:'center',gap:5}}><CheckIcon className="w-4 h-4" />+ Mail</button>
                <button className="btn btn-gold btn-sm" onClick={openModify} style={{display:'inline-flex',alignItems:'center',gap:5}}><PencilSquareIcon className="w-4 h-4" />Wijzigen</button>
              </>
            )}
            {res.status === 'checked_in' && (
              <button className="btn btn-primary btn-sm" onClick={doCheckout} disabled={saving} style={{display:'inline-flex',alignItems:'center',gap:5}}><ArrowUpTrayIcon className="w-4 h-4" />Uitchecken</button>
            )}
            <a href={`/print/invoice/${params.id}`} target="_blank"
              className="btn btn-sm"
              style={{ background: '#f4f6f9', color: '#0a2240', border: '0.5px solid rgba(10,34,64,0.2)', textDecoration: 'none', display:'inline-flex', alignItems:'center', gap:5 }}
              title="Factuur openen"><DocumentTextIcon className="w-4 h-4" />Factuur</a>
            <button className="btn btn-sm" style={{ background: '#f4f6f9', color: '#0a2240', border: '0.5px solid rgba(10,34,64,0.2)', display:'inline-flex', alignItems:'center', gap:5 }}
              onClick={() => window.open(`/print/envelope/${params.id}`, '_blank')}
              title="Envelop afdrukken"><PrinterIcon className="w-4 h-4" />Envelop</button>
            <button className="btn btn-sm" style={{ background: '#f4f6f9', color: '#0a2240', border: '0.5px solid rgba(10,34,64,0.2)', display:'inline-flex', alignItems:'center', gap:5 }}
              title="Bevestigingsmail opnieuw versturen"
              onClick={async () => {
                try {
                  await api.reservations.resendConfirmation(params.id);
                  toast('Bevestigingsmail verstuurd');
                } catch (e: any) {
                  toastError('Mail versturen mislukt: ' + e.message);
                }
              }}><EnvelopeIcon className="w-4 h-4" />Mail</button>
            {res.status !== 'cancelled' && res.status !== 'completed' && (
              <button className="btn btn-danger btn-sm" onClick={() => setCancelOpen(true)} style={{display:'inline-flex',alignItems:'center',gap:5}}><XMarkIcon className="w-4 h-4" />Annuleren</button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          {/* Main */}
          <div>
            {/* Status header */}
            <div className="card" style={{ padding: '18px 22px', marginBottom: 14, background: statusColors[res.status] || 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  {editingContact ? (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 3 }}>Voornaam</label>
                          <input value={contactValues.firstName} onChange={e => setContactValues(v => ({ ...v, firstName: e.target.value }))}
                            style={{ width: '100%', padding: '7px 10px', border: '1.5px solid rgba(10,34,64,0.25)', borderRadius: 7, fontSize: 14, fontWeight: 700, color: '#0a2240', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 3 }}>Achternaam</label>
                          <input value={contactValues.lastName} onChange={e => setContactValues(v => ({ ...v, lastName: e.target.value }))}
                            style={{ width: '100%', padding: '7px 10px', border: '1.5px solid rgba(10,34,64,0.25)', borderRadius: 7, fontSize: 14, fontWeight: 700, color: '#0a2240', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 3 }}>E-mailadres</label>
                          <input type="email" value={contactValues.email} onChange={e => setContactValues(v => ({ ...v, email: e.target.value }))}
                            style={{ width: '100%', padding: '7px 10px', border: '1.5px solid rgba(10,34,64,0.25)', borderRadius: 7, fontSize: 13, color: '#0a2240', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 3 }}>Telefoon</label>
                          <input value={contactValues.phone} onChange={e => setContactValues(v => ({ ...v, phone: e.target.value }))}
                            style={{ width: '100%', padding: '7px 10px', border: '1.5px solid rgba(10,34,64,0.25)', borderRadius: 7, fontSize: 13, color: '#0a2240', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditingContact(false); setContactValues({ firstName: res.first_name || '', lastName: res.last_name || '', email: res.email || '', phone: res.phone || '' }); }} style={{ fontSize: 11 }}>Annuleren</button>
                        <button className="btn btn-primary btn-sm" onClick={saveContact} disabled={contactSaving} style={{ fontSize: 11 }}><CheckIcon className="w-3 h-3" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />{contactSaving ? 'Opslaan...' : 'Opslaan'}</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: '#0a2240', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {res.first_name} {res.last_name}
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingContact(true)} style={{ fontSize: 11 }}>
                          <PencilSquareIcon className="w-3 h-3" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />Naam wijzigen
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 11, color: nameLinkCopied ? '#0a7c6e' : '#7090b0' }}
                          title="Kopieer link zodat iemand anders de naam kan aanpassen"
                          onClick={() => {
                            const url = `${window.location.origin}/guest/naam/${res.id}`;
                            navigator.clipboard.writeText(url);
                            setNameLinkCopied(true);
                            setTimeout(() => setNameLinkCopied(false), 3000);
                          }}
                        >
                          {nameLinkCopied
                            ? <><ClipboardCheck size={12} style={{ display:'inline', verticalAlign:'middle', marginRight:3 }} />Gekopieerd!</>
                            : <><Link2 size={12} style={{ display:'inline', verticalAlign:'middle', marginRight:3 }} />Link</>
                          }
                        </button>
                        <a
                          href={`/customers?ref=${encodeURIComponent(res.reference)}`}
                          title="Klantpagina openen"
                          style={{ fontSize: 12, fontWeight: 600, color: '#0a7c6e', background: '#e6f7f5', borderRadius: 6, padding: '3px 9px', textDecoration: 'none', whiteSpace: 'nowrap' }}
                        >
                          <UserIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Klantpagina →
                        </a>
                      </div>
                      <div style={{ fontSize: 13, color: '#7090b0', marginTop: 2 }}>
                        {res.email} · {res.phone || 'geen telefoon'}
                        {res.btw_number && ` · BTW: ${res.btw_number}`}
                      </div>
                    </div>
                  )}
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

            {/* Opmerking klant */}
            {(() => {
              const klantNoot = (res.notes || '').replace(/(\r\n|\r|\n)?Imported from v1 \| Original ID:[^\r\n]*/g, '').trim();
              return klantNoot ? (
                <div className="card" style={{ padding: '14px 18px', marginBottom: 14, background: '#fffbe6', border: '0.5px solid #e8c84a' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#8a6000', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, display:'flex', alignItems:'center', gap:4 }}><ChatBubbleOvalLeftEllipsisIcon className="w-3 h-3" />Opmerking klant</div>
                  <div style={{ fontSize: 13, color: '#0a2240', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{klantNoot}</div>
                </div>
              ) : null;
            })()}

            {/* Voertuigen */}
            <div className="card" style={{ padding: '18px 22px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240' }}>Voertuigen</div>
                {!editingPlates
                  ? <button className="btn btn-ghost btn-sm" onClick={() => setEditingPlates(true)} style={{ fontSize: 11 }}><PencilSquareIcon className="w-3 h-3" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />Kentekens bewerken</button>
                  : <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditingPlates(false); setPlateValues((res.vehicles || []).map((v: any) => v.license_plate || '')); }} style={{ fontSize: 11 }}>Annuleren</button>
                      <button className="btn btn-primary btn-sm" onClick={savePlates} disabled={plateSaving} style={{ fontSize: 11 }}><CheckIcon className="w-3 h-3" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />{plateSaving ? 'Opslaan...' : 'Opslaan'}</button>
                    </div>
                }
              </div>
              {(res.vehicles || []).map((v: any, i: number) => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < res.vehicles.length - 1 ? '0.5px solid rgba(10,34,64,0.08)' : 'none' }}>
                  {editingPlates
                    ? <input
                        value={plateValues[i] ?? ''}
                        onChange={e => setPlateValues(prev => { const next = [...prev]; next[i] = e.target.value.toUpperCase(); return next; })}
                        placeholder="Onbekend"
                        style={{ width: 130, padding: '7px 10px', border: '1.5px solid rgba(10,34,64,0.25)', borderRadius: 7, fontSize: 14, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase' }}
                      />
                    : <PlateTooltip plate={v.license_plate} />
                  }
                  {v.rdw_make && !editingPlates && (
                    <div style={{ fontSize: 13, color: '#7090b0' }}>
                      {v.rdw_make} {v.rdw_model}
                      {v.rdw_color && ` · ${v.rdw_color}`}
                      {v.rdw_fuel_type && ` · ${v.rdw_fuel_type}`}
                    </div>
                  )}
                  {v.ev_kwh && (
                    <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#0a7c6e', background: '#e6f7f5', padding: '3px 10px', borderRadius: 20, display:'inline-flex', alignItems:'center', gap:4 }}>
                      <BoltIcon className="w-3 h-3" />{v.ev_kwh} kWh · € {Number(v.ev_price).toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Veerboot */}
            <div className="card" style={{ padding: '18px 22px', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240' }}>Veerbootinformatie</div>
                {!editingFerry && (
                  <button onClick={openFerryEdit} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 7, border: '0.5px solid rgba(10,34,64,0.18)', background: 'white', fontSize: 12, fontWeight: 600, color: '#0a2240', cursor: 'pointer' }}>
                    <PencilSquareIcon style={{ width: 13, height: 13 }} />Wijzigen
                  </button>
                )}
              </div>

              {!editingFerry ? (() => {
                // Bestemming: backend levert al COALESCE(reservation.dest, ferry_type.dest)
                // Naam als extra fallback als beide null zijn
                const destRaw = res.ferry_outbound_destination
                  || (res.ferry_outbound_name?.toLowerCase().includes('terschelling') ? 'terschelling'
                    : res.ferry_outbound_name?.toLowerCase().includes('vlieland') ? 'vlieland'
                    : res.ferry_return_name?.toLowerCase().includes('terschelling') ? 'terschelling'
                    : res.ferry_return_name?.toLowerCase().includes('vlieland') ? 'vlieland'
                    : null);
                const destLabel = destRaw === 'terschelling' ? 'Terschelling' : destRaw === 'vlieland' ? 'Vlieland' : '—';
                const outTime = res.ferry_outbound_time?.slice(0, 5);
                const outArr = res.ferry_outbound_arrival_island;
                const retTime = res.ferry_return_time?.slice(0, 5) || (res.ferry_return_custom ? res.ferry_return_custom_time?.slice(0, 5) : null);
                const retArr = res.ferry_return_arrival_harlingen;
                const isFast = res.is_fast_ferry_outbound;
                return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                  {/* Bestemming */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Bestemming</div>
                    <div style={{ fontWeight: 700, color: '#0a2240', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {destLabel}
                      {isFast && <span style={{ fontSize: 10, background: '#e6f7f5', color: '#0a7c6e', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>Snelboot</span>}
                    </div>
                  </div>
                  {/* Heenreis */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>⛴ Heenreis</div>
                    {outTime ? (
                      <div style={{ fontWeight: 700, color: '#0a2240' }}>
                        {outTime}{outArr ? <span style={{ color: '#7090b0', fontWeight: 600 }}> → {outArr}</span> : ''}
                        {res.ferry_outbound_name && res.ferry_outbound_name !== '—' && (
                          <div style={{ fontSize: 11, color: '#9aafbf', fontWeight: 500, marginTop: 1 }}>{res.ferry_outbound_name}</div>
                        )}
                      </div>
                    ) : <span style={{ color: '#b0c4d4' }}>—</span>}
                  </div>
                  {/* Terugreis */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>⛴ Terugreis</div>
                    {retTime ? (
                      <div>
                        {/* Aankomsttijd Harlingen prominent */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontSize: 10, color: '#7090b0', fontWeight: 600 }}>vertrek {retTime}</span>
                          {retArr && <><span style={{ fontSize: 11, color: '#9aafbf' }}>→</span>
                          <span style={{ fontSize: 20, fontWeight: 900, color: '#0a7c6e', lineHeight: 1 }}>{retArr}</span></>}
                        </div>
                        {retArr && <div style={{ fontSize: 9, color: '#7090b0', fontWeight: 600, marginTop: 1 }}>aankomst Harlingen</div>}
                        {res.ferry_return_name && res.ferry_return_name !== '—' && (
                          <div style={{ fontSize: 11, color: '#9aafbf', fontWeight: 500, marginTop: 2 }}>{res.ferry_return_name}</div>
                        )}
                        {res.ferry_return_custom && <div style={{ fontSize: 10, color: '#9aafbf' }}>Eigen tijd</div>}
                      </div>
                    ) : <span style={{ color: '#b0c4d4' }}>—</span>}
                  </div>
                  {/* Lege cel voor grid balans */}
                  <div />
                </div>
                );
              })()
              : (
                <div>
                  {/* Doeksen sync */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '8px 10px', background: '#f4f6f9', borderRadius: 7 }}>
                    <span style={{ fontSize: 12, color: '#7090b0', flex: 1 }}>
                      {ferryOutSchedules.length > 0
                        ? `${ferryOutSchedules.length} vertrektijden gevonden`
                        : 'Nog geen rooster voor deze datum'}
                    </span>
                    <button
                      type="button"
                      onClick={syncFerryDatesFromDoeksen}
                      disabled={ferryDoeksenSyncing}
                      style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 6, border: '0.5px solid rgba(10,34,64,0.2)', background: 'white', color: '#0a2240', cursor: ferryDoeksenSyncing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      <ArrowPathIcon style={{ width: 12, height: 12, animation: ferryDoeksenSyncing ? 'spin 1s linear infinite' : 'none' }} />
                      {ferryDoeksenSyncing ? 'Ophalen…' : <><RefreshCw size={13} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />Ophalen van Doeksen</>}
                    </button>
                  </div>
                  {/* Eilandkeuze */}
                  {(['outbound', 'return'] as const).map(dir => {
                    const isOut = dir === 'outbound';
                    const dest = isOut ? ferryOutDest : ferryRetDest;
                    const setDest = isOut
                      ? (d: 'terschelling'|'vlieland') => { setFerryOutDest(d); setFerryOutTime(''); setFerryOutId(''); loadFerrySchedules(res.arrival_date?.slice(0,10), res.departure_date?.slice(0,10), d, ferryRetDest); }
                      : (d: 'terschelling'|'vlieland') => { setFerryRetDest(d); setFerryRetTime(''); setFerryRetId(''); loadFerrySchedules(res.arrival_date?.slice(0,10), res.departure_date?.slice(0,10), ferryOutDest, d); };
                    const time = isOut ? ferryOutTime : ferryRetTime;
                    const setTime = isOut ? setFerryOutTime : setFerryRetTime;
                    const selectedId = isOut ? ferryOutId : ferryRetId;
                    const setSelectedId = isOut ? setFerryOutId : setFerryRetId;
                    const schedules = isOut ? ferryOutSchedules : ferryRetSchedules;
                    const manual = isOut ? ferryOutManual : ferryRetManual;
                    const setManual = isOut ? setFerryOutManual : setFerryRetManual;
                    const date = isOut ? res.arrival_date?.slice(0,10) : res.departure_date?.slice(0,10);
                    const label = isOut ? '⛴ Heenreis' : '⛴ Terugreis';

                    return (
                      <div key={dir} style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                          {label} · {date}
                        </div>
                        {/* Eiland toggle */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                          {(['terschelling', 'vlieland'] as const).map(d => (
                            <button key={d} type="button" onClick={() => setDest(d)} style={{ flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 12, fontWeight: 700, border: dest === d ? '1.5px solid #0a7c6e' : '0.5px solid rgba(10,34,64,0.2)', background: dest === d ? '#e6f7f5' : 'white', color: dest === d ? '#0a7c6e' : '#7090b0', cursor: 'pointer' }}>
                              {d === 'terschelling' ? 'Terschelling' : 'Vlieland'}
                            </button>
                          ))}
                        </div>
                        {/* Tijdknoppen */}
                        {ferryScheduleLoading ? (
                          <div style={{ fontSize: 12, color: '#7090b0' }}>Laden…</div>
                        ) : !manual && schedules.length > 0 ? (
                          <>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                              {schedules.map((s: any) => {
                                const t = s.departureTime?.slice(0,5) || '';
                                const sel = selectedId ? s.id === selectedId : time === t;
                                return (
                                  <button key={s.id || t} onClick={() => { setTime(t); setSelectedId(s.id || ''); }}
                                    style={{ padding: '6px 10px', borderRadius: 7, cursor: 'pointer', border: sel ? '2px solid #0a7c6e' : '0.5px solid rgba(10,34,64,0.2)', background: sel ? '#e6f7f5' : 'white', fontWeight: sel ? 800 : 600, color: sel ? '#0a7c6e' : '#0a2240', fontSize: 14, textAlign: 'center' as const, minWidth: 58 }}>
                                    {t}
                                    <div style={{ fontSize: 9, fontWeight: 700, color: sel ? '#0a7c6e' : s.isFast ? '#0a7c6e' : '#9aafbf', marginTop: 1 }}>
                                      {s.isFast ? 'Snelboot' : 'Veerboot'}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            <button type="button" onClick={() => setManual(true)} style={{ fontSize: 11, color: '#9aafbf', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Handmatig invoeren</button>
                          </>
                        ) : (
                          <>
                            {schedules.length === 0 && !ferryScheduleLoading && <div style={{ fontSize: 11, color: '#9aafbf', marginBottom: 4 }}>Geen rooster — handmatig:</div>}
                            <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14, color: '#0a2240', boxSizing: 'border-box' }} />
                            {manual && schedules.length > 0 && <button type="button" onClick={() => setManual(false)} style={{ fontSize: 11, color: '#9aafbf', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}>Terug naar rooster</button>}
                          </>
                        )}
                        {time && (() => {
                          const selSch = schedules.find((s: any) => s.id === selectedId) || schedules.find((s: any) => s.departureTime?.slice(0,5) === time);
                          const destLabel = dest === 'terschelling' ? 'Terschelling' : 'Vlieland';
                          const typeLabel = selSch ? (selSch.isFast ? 'Snelboot' : 'Veerboot') : '';
                          const durMin = selSch?.durationMin || (selSch?.isFast ? 50 : (dest === 'vlieland' ? 100 : 120));
                          const [h, m] = time.split(':').map(Number);
                          const arrTot = h * 60 + m + durMin;
                          const arrTime = `${String(Math.floor(arrTot / 60)).padStart(2, '0')}:${String(arrTot % 60).padStart(2, '0')}`;
                          return (
                            <div style={{ marginTop: 6, fontSize: 12, color: '#0a7c6e', fontWeight: 700 }}>
                              ✓ {time} → {arrTime}{destLabel ? ` · ${destLabel}` : ''}{typeLabel ? ` · ${typeLabel}` : ''}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}

                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button onClick={saveFerry} disabled={ferrySaving} style={{ flex: 1, padding: '9px', borderRadius: 8, background: ferrySaving ? '#ccc' : '#0a2240', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: ferrySaving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <CheckIcon style={{ width: 14, height: 14 }} />{ferrySaving ? 'Opslaan…' : 'Opslaan'}
                    </button>
                    <button onClick={() => setEditingFerry(false)} style={{ padding: '9px 14px', borderRadius: 8, border: '0.5px solid rgba(10,34,64,0.18)', background: 'white', fontSize: 13, fontWeight: 600, color: '#556070', cursor: 'pointer' }}>
                      Annuleren
                    </button>
                  </div>
                </div>
              )}
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
                {Number(res.overbooking_surcharge) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid rgba(10,34,64,0.06)' }}>
                    <span style={{ color: '#7090b0' }}>Overboekingstoeslag</span>
                    <span>€ {Number(res.overbooking_surcharge).toFixed(2)}</span>
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

            {/* Extra factuurregels */}
            <div className="card" style={{ padding: '18px 22px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', display:'flex', alignItems:'center', gap:6 }}><ClipboardDocumentListIcon className="w-4 h-4" />Extra factuurregels</div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, padding: '3px 10px' }}
                  onClick={() => {
                    const newItems = [...extraItems, { description: '', quantity: 1, unit_price: 0 }];
                    setExtraItems(newItems);
                  }}
                >+ Regel toevoegen</button>
              </div>

              {extraItems.length === 0 && (
                <div style={{ fontSize: 12, color: '#9090a0', fontStyle: 'italic', marginBottom: 8 }}>
                  Geen extra regels. Klik op "Regel toevoegen" om bijv. laadkosten of andere diensten toe te voegen.
                </div>
              )}

              {extraItems.map((it, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 56px 90px 32px', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={it.description}
                    placeholder="Omschrijving"
                    onChange={e => {
                      const updated = extraItems.map((x, i) => i === idx ? { ...x, description: e.target.value } : x);
                      setExtraItems(updated);
                    }}
                    style={{ padding: '6px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 13 }}
                  />
                  <input
                    type="number"
                    min={1}
                    value={it.quantity}
                    title="Aantal"
                    onChange={e => {
                      const updated = extraItems.map((x, i) => i === idx ? { ...x, quantity: parseInt(e.target.value) || 1 } : x);
                      setExtraItems(updated);
                    }}
                    style={{ padding: '6px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 13, textAlign: 'right' }}
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={it.unit_price}
                    title="Bedrag per stuk"
                    onChange={e => {
                      const updated = extraItems.map((x, i) => i === idx ? { ...x, unit_price: parseFloat(e.target.value) || 0 } : x);
                      setExtraItems(updated);
                    }}
                    style={{ padding: '6px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 13, textAlign: 'right' }}
                  />
                  <button
                    onClick={() => {
                      const updated = extraItems.filter((_, i) => i !== idx);
                      setExtraItems(updated);
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c04040', padding: 0, display:'flex', alignItems:'center' }}
                    title="Verwijder regel"
                  ><XMarkIcon className="w-4 h-4" /></button>
                </div>
              ))}

              {extraItems.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid rgba(10,34,64,0.1)' }}>
                  <div style={{ fontSize: 12, color: '#7090b0' }}>
                    Totaal extra: <strong style={{ color: '#0a2240' }}>
                      € {extraItems.reduce((s, it) => s + (parseFloat(String(it.unit_price)) || 0) * (parseInt(String(it.quantity)) || 1), 0).toFixed(2)}
                    </strong>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: 12 }}
                    disabled={extraItemsSaving}
                    onClick={() => saveExtraItems(extraItems)}
                  >
                    {extraItemsSaving ? 'Opslaan...' : '💾 Opslaan'}
                  </button>
                </div>
              )}

              {extraItems.length === 0 && (
                <div style={{ fontSize: 11, color: '#9090a0' }}>
                  Regels verschijnen op de factuur onder het parkeerbedrag.
                </div>
              )}
            </div>

            {/* Stripe betaaldetails */}
            {stripeData?.hasStripe && (
              <div className="card" style={{ padding: '18px 22px', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', display:'flex', alignItems:'center', gap:6 }}>
                    <CreditCardIcon className="w-4 h-4" />Stripe betaling
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {res.payment_status !== 'paid' && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={doStripeSync}
                        disabled={stripeSyncing}
                        style={{ fontSize: 11, padding: '3px 9px' }}
                      >
                        {stripeSyncing ? '...' : <><ArrowPathIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Sync status</>}
                      </button>
                    )}
                    <a
                      href={`https://dashboard.stripe.com/payments/${stripeData.intentId}`}
                      target="_blank" rel="noreferrer"
                      style={{ fontSize: 11, color: '#635bff', fontWeight: 600, textDecoration: 'none', background: '#f0efff', borderRadius: 5, padding: '3px 9px' }}
                    >
                      Bekijk in Stripe →
                    </a>
                  </div>
                </div>
                {stripeData.fetchError && (
                  <div style={{ fontSize: 12, color: '#8a5f00', background: '#fff8e6', border: '0.5px solid #e8c84a', borderRadius: 6, padding: '7px 10px', marginBottom: 12 }}>
                    <ExclamationTriangleIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Stripe details konden niet worden opgehaald — mogelijk test/live modus verschil.<br />
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#555' }}>{stripeData.fetchError}</span>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                  {[
                    ['Intent ID', stripeData.intentId],
                    ...(stripeData.intentStatus != null ? [['Status', stripeData.intentStatus]] : []),
                    ...(stripeData.paymentMethodType != null ? [['Betaalmethode', stripeData.paymentMethodType || '—']] : []),
                    ...(stripeData.amount != null ? [['Bedrag', `€ ${Number(stripeData.amount).toFixed(2)}`]] : []),
                    ...(stripeData.amountReceived != null ? [['Ontvangen', `€ ${Number(stripeData.amountReceived).toFixed(2)}`]] : []),
                    ...(stripeData.created != null ? [['Aangemaakt', new Date(stripeData.created * 1000).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })]] : []),
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>{label}</div>
                      <div style={{ fontWeight: 600, fontFamily: label === 'Intent ID' ? 'monospace' : 'inherit', fontSize: label === 'Intent ID' ? 11 : 13, wordBreak: 'break-all' }}>{String(value)}</div>
                    </div>
                  ))}
                </div>
                {stripeData.charge && (
                  <>
                    <div style={{ borderTop: '0.5px solid rgba(10,34,64,0.08)', margin: '14px 0 12px' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                      {stripeData.charge.paymentMethodDetails?.ideal && (
                        <>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>Bank (iDEAL)</div>
                            <div style={{ fontWeight: 600 }}>{stripeData.charge.paymentMethodDetails.ideal.bank || '—'}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>BIC</div>
                            <div style={{ fontWeight: 600 }}>{stripeData.charge.paymentMethodDetails.ideal.bic || '—'}</div>
                          </div>
                        </>
                      )}
                      {stripeData.charge.paymentMethodDetails?.card && (
                        <>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>Kaart</div>
                            <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                              {stripeData.charge.paymentMethodDetails.card.brand} •••• {stripeData.charge.paymentMethodDetails.card.last4}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>Geldig t/m</div>
                            <div style={{ fontWeight: 600 }}>
                              {stripeData.charge.paymentMethodDetails.card.exp_month}/{stripeData.charge.paymentMethodDetails.card.exp_year}
                            </div>
                          </div>
                        </>
                      )}
                      {stripeData.charge.amountRefunded > 0 && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>Terugbetaald</div>
                          <div style={{ fontWeight: 600, color: '#2a7a3a' }}>€ {Number(stripeData.charge.amountRefunded).toFixed(2)}</div>
                        </div>
                      )}
                      {stripeData.charge.receiptUrl && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>Betaalbewijs</div>
                          <a href={stripeData.charge.receiptUrl} target="_blank" rel="noreferrer"
                            style={{ color: '#0a7c6e', fontWeight: 600, fontSize: 12, textDecoration: 'none' }}>
                            Bekijk bon →
                          </a>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

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

            {/* Pending wijziging (openstaande betaling) */}
            {modHistory.filter((m: any) => m.status === 'pending_payment').map((m: any) => {
              const details = m.change_details
                ? (typeof m.change_details === 'string' ? JSON.parse(m.change_details) : m.change_details)
                : {};
              const netDue = details.netDue || (parseFloat(m.price_difference || '0') + parseFloat(m.modification_fee || '0'));
              return (
                <div key={m.id} className="card" style={{ padding: '18px 22px', marginBottom: 14, border: '2px solid #ff9800', background: '#fff8e6' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', marginBottom: 12, display:'flex', alignItems:'center', gap:6 }}>
                    <ClockIcon className="w-4 h-4" />Openstaande wijziging — wacht op betaling
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 4 }}>Nieuwe aankomst</div>
                      <div style={{ fontWeight: 600, color: '#0a2240' }}>
                        {new Date(String(m.new_arrival_date).slice(0, 10) + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 4 }}>Nieuw vertrek</div>
                      <div style={{ fontWeight: 600, color: '#0a2240' }}>
                        {new Date(String(m.new_departure_date).slice(0, 10) + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 4 }}>Nieuw totaal</div>
                      <div style={{ fontWeight: 600, color: '#0a2240' }}>€ {parseFloat(m.new_total_price).toFixed(2)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 4 }}>Te ontvangen (incl. toeslag)</div>
                      <div style={{ fontWeight: 700, color: '#8a2020', fontSize: 15 }}>€ {Number(netDue).toFixed(2)}</div>
                    </div>
                  </div>
                  {details.paymentMethod === 'on_site' && (
                    <button
                      className="btn btn-gold btn-sm"
                      onClick={() => applyOnSitePayment(m.id)}
                      disabled={applyingOnSite}
                      style={{ width: '100%' }}
                    >
                      {applyingOnSite ? 'Verwerken...' : <><CheckIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Betaling ontvangen (contant)</>}
                    </button>
                  )}
                  {details.paymentMethod === 'stripe' && (
                    <div style={{ fontSize: 12, color: '#7090b0', padding: '8px 12px', background: 'white', borderRadius: 7 }}>
                      Klant betaalt via Stripe — wacht op betaalbevestiging.
                    </div>
                  )}
                </div>
              );
            })}

            {/* Wijzigingshistorie */}
            {modHistory.length > 0 && (
              <div className="card" style={{ padding: '18px 22px' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', marginBottom: 12, display:'flex', alignItems:'center', gap:6 }}><PencilSquareIcon className="w-4 h-4" />Wijzigingshistorie</div>
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
                ['Dagen', (res.nights ?? 0) + 1],
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

            {/* Betaalstatus wijzigen */}
            <div className="card" style={{ padding: '16px 18px', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0a2240', marginBottom: 10, display:'flex', alignItems:'center', gap:5 }}><CreditCardIcon className="w-4 h-4" />Betaalstatus</div>
              <div style={{ fontSize: 12, color: '#7090b0', marginBottom: 10 }}>
                Huidig: <strong style={{ color: '#0a2240' }}>
                  {res.payment_status === 'paid' ? 'Betaald' : res.payment_status === 'pending' ? 'Openstaand' : res.payment_status === 'on_site' ? 'Ter plekke' : res.payment_status}
                  {res.payment_method ? ` (${res.payment_method})` : ''}
                </strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ justifyContent: 'flex-start', fontSize: 12 }}
                  disabled={payStatusSaving}
                  onClick={() => updatePaymentStatus('paid', 'contant')}
                ><BanknotesIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:5}} />Contant betaald</button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ justifyContent: 'flex-start', fontSize: 12 }}
                  disabled={payStatusSaving}
                  onClick={() => updatePaymentStatus('paid', 'pin')}
                ><CreditCardIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:5}} />Pin betaald</button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ justifyContent: 'flex-start', fontSize: 12 }}
                  disabled={payStatusSaving}
                  onClick={() => updatePaymentStatus('paid', 'tikkie')}
                ><DevicePhoneMobileIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:5}} />Tikkie betaald</button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ justifyContent: 'flex-start', fontSize: 12 }}
                  disabled={payStatusSaving}
                  onClick={() => updatePaymentStatus('paid', 'ideal')}
                ><BuildingLibraryIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:5}} />iDEAL betaald</button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ justifyContent: 'flex-start', fontSize: 12, borderTop: '0.5px solid rgba(10,34,64,0.1)', marginTop: 2, paddingTop: 8 }}
                  disabled={payStatusSaving}
                  onClick={() => updatePaymentStatus('pending', null)}
                ><ClockIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:5}} />Openstaand</button>

                {/* Betalen ter plekke toeslag */}
                <div style={{ borderTop: '0.5px solid rgba(10,34,64,0.1)', marginTop: 4, paddingTop: 8 }}>
                  {Number(res.on_site_surcharge) > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, background: '#fff8e6', border: '1px solid #e8c84a', borderRadius: 6, padding: '3px 8px', color: '#8a5f00', fontWeight: 700, flex: 1 }}>
                        🏪 Ter plekke betalen — toeslag €{Number(res.on_site_surcharge).toFixed(2)} actief
                      </span>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 11, padding: '3px 8px', color: '#c83232' }}
                        disabled={onSiteSurchargeSaving}
                        onClick={() => toggleOnSiteSurcharge(true)}
                        title="Toeslag verwijderen"
                      ><X size={13} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />Verwijder</button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ justifyContent: 'flex-start', fontSize: 12, width: '100%', background: '#fffbf0', borderColor: '#e8c84a', color: '#7a5500' }}
                      disabled={onSiteSurchargeSaving}
                      onClick={() => toggleOnSiteSurcharge(false)}
                    >🏪 Betalen ter plekke (+€5)</button>
                  )}
                </div>
              </div>
            </div>

            {/* Factuurdatum */}
            <div className="card" style={{ padding: '16px 18px', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0a2240', marginBottom: 10, display:'flex', alignItems:'center', gap:5 }}><CalendarDaysIcon className="w-4 h-4" />Factuurdatum</div>
              <div style={{ fontSize: 11, color: '#7090b0', marginBottom: 8 }}>
                Standaard: reserveringsdatum ({res.created_at ? new Date(res.created_at).toLocaleDateString('nl-NL') : '—'})
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                  style={{ flex: 1, fontSize: 13, padding: '5px 8px', border: '1px solid #d0dbe8', borderRadius: 6, color: '#0a2240' }}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                  disabled={invoiceDateSaving}
                  onClick={() => setInvoiceDate(res.created_at?.slice(0, 10) || '')}
                  title="Reset naar reserveringsdatum"
                ><ArrowUturnLeftIcon className="w-4 h-4" /></button>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                  disabled={invoiceDateSaving}
                  onClick={saveInvoiceDate}
                >{invoiceDateSaving ? '…' : 'Opslaan'}</button>
              </div>
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
              ['Nieuw tarief (datums)', `€ ${parseFloat(modPreview.newPrice).toFixed(2)}${modOverridePrice ? ' (override)' : ''}`],
              ...(modPreview.onSiteSurcharge > 0 ? [['Toeslag ter plekke betalen', `€ ${parseFloat(modPreview.onSiteSurcharge).toFixed(2)}`]] : []),
              ...(modPreview.onSiteSurcharge > 0 ? [['Nieuw totaal', `€ ${parseFloat(modPreview.newTotalWithSurcharge).toFixed(2)}`]] : []),
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
              <div style={{ marginTop: 8, color: '#8a2020', fontWeight: 600, display:'flex', alignItems:'center', gap:5 }}><ExclamationTriangleIcon className="w-4 h-4" />Onvoldoende beschikbare plaatsen. Vink "overrulen" aan om toch te boeken.</div>
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
                {modLoading ? 'Opslaan...' : <><CheckIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Wijziging bevestigen</>}
              </button>
            </>
          )}
        </div>
      </Modal>

      {/* Bijbetaling modal — na datum-wijziging met meerprijs */}
      <Modal open={pendingPayStep} onClose={() => setPendingPayStep(false)} title="Bijbetaling vereist">
        <div style={{ background: '#fff4e0', borderRadius: 8, padding: '16px 18px', marginBottom: 18, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#7a3f00', marginBottom: 4 }}>Te ontvangen van {res?.first_name} {res?.last_name}</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#c05000', lineHeight: 1.1 }}>€ {pendingPayAmt.toFixed(2)}</div>
          <div style={{ fontSize: 12, color: '#7a3f00', marginTop: 4 }}>vanwege de gewijzigde reisdatum</div>
        </div>
        <div style={{ fontSize: 13, color: '#444', marginBottom: 18 }}>
          Hoe wil je de bijbetaling regelen?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}>
          <button
            onClick={doSendPaymentLink}
            disabled={sendingPayLink}
            style={{ background: '#0a2240', border: 'none', color: 'white', borderRadius: 8, padding: '12px 18px', cursor: sendingPayLink ? 'default' : 'pointer', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: sendingPayLink ? 0.7 : 1 }}>
            {sendingPayLink ? 'Versturen...' : <>✉ Betaallink sturen per e-mail</>}
          </button>
          <button
            onClick={async () => {
              if (!pendingPayModId) return;
              try {
                await api.modifications.applyOnSitePayment(pendingPayModId);
                toast('Bijbetaling geregistreerd als contant/PIN ✓');
                setPendingPayStep(false);
                load();
              } catch (e: any) { toastError((e as any).message); }
            }}
            style={{ background: '#e07b00', border: 'none', color: 'white', borderRadius: 8, padding: '12px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <><Banknote size={14} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />Contant / PIN ontvangen</>
          </button>
          <button
            onClick={() => setPendingPayStep(false)}
            style={{ background: 'none', border: '0.5px solid rgba(10,34,64,0.2)', color: '#7090b0', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13 }}>
            Later regelen
          </button>
        </div>
      </Modal>

      {/* Cancel modal */}
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Reservering annuleren">
        <div style={{ marginBottom: 14 }}>
          <RefundPolicyInfo info={refundInfo} />
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
