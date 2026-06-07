'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import DateRangePicker from '@/components/ui/DateRangePicker';
import {
  PlusIcon, TrashIcon, PaperAirplaneIcon,
  PencilSquareIcon, CheckIcon, ArrowPathIcon, DocumentTextIcon, LinkIcon,
} from '@heroicons/react/24/outline';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const STATUS_LABEL: Record<string, string> = { draft: 'Concept', sent: 'Verstuurd', paid: 'Betaald' };

interface EvService { id: string; name: string; kwh: number; price: string; }
interface FerrySlot { id: string; departureTime: string; destination: string; ferryName: string; durationMin: number; isFast: boolean; direction: string; }

async function calcPrice(arrival: string, departure: string, vehicleCount: number) {
  const r = await fetch(`${API_BASE}/rates/calculate?arrival=${arrival}&departure=${departure}&vehicles=${vehicleCount}`);
  if (!r.ok) return null;
  return r.json();
}

async function fetchFerries(date: string, dest: string, direction: 'outbound' | 'return' = 'outbound'): Promise<FerrySlot[]> {
  if (!date || !dest || dest === 'anders') return [];
  try {
    const r = await fetch(`${API_BASE}/ferries?date=${date}&destination=${dest}`);
    if (!r.ok) return [];
    const d = await r.json();
    const all: FerrySlot[] = d.schedules || d.outbound || d || [];
    return all.filter((s: any) => s.direction === direction).slice(0, 20);
  } catch { return []; }
}

function addMins(time: string, mins: number): string {
  if (!time || !mins) return '';
  const [h, m] = time.split(':').map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export default function FactuurDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();

  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editBilling, setEditBilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [billing, setBilling] = useState<any>({});

  // Nieuw boeking formulier
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    arrival: new Date().toISOString().split('T')[0],
    departure: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    destination: 'terschelling' as 'terschelling' | 'vlieland' | 'anders',
    note: '',
    // Heenvlucht
    ferryOutboundId: '',
    ferryOutboundTime: '',
    ferryOutboundCustom: false,
    ferryOutboundCustomTime: '',
    // Terugvlucht
    ferryReturnId: '',
    ferryReturnTime: '',
    ferryReturnCustom: false,
    ferryReturnCustomTime: '',
  });
  const [plates, setPlates] = useState(['']);
  const [evKwhs, setEvKwhs] = useState<Record<number, number | undefined>>({});
  const [evServices, setEvServices] = useState<EvService[]>([]);
  const [priceInfo, setPriceInfo] = useState<any>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [addSaving, setAddSaving] = useState(false);

  // Veerboot tijden
  const [outboundSlots, setOutboundSlots] = useState<FerrySlot[]>([]);
  const [returnSlots, setReturnSlots] = useState<FerrySlot[]>([]);
  const [ferriesLoading, setFerriesLoading] = useState(false);

  function load() {
    setLoading(true);
    api.invoiceGroups.get(id)
      .then(g => {
        setGroup(g);
        setBilling({
          billingName: g.billing_name, billingCompany: g.billing_company || '',
          billingAddress: g.billing_address, billingPostalCode: g.billing_postal_code,
          billingCity: g.billing_city, billingEmail: g.billing_email,
          billingVatNumber: g.billing_vat_number || '', notes: g.notes || '',
        });
      })
      .catch(() => toastError('Laden mislukt'))
      .finally(() => setLoading(false));
  }
  useEffect(load, [id]);

  useEffect(() => {
    api.services.list()
      .then((svcs: any[]) => setEvServices(svcs.filter(s => s.kwh).sort((a: any, b: any) => a.kwh - b.kwh)))
      .catch(() => {});
  }, []);

  // Prijs herberekenen bij periode/kenteken-wijziging
  useEffect(() => {
    if (!addForm.arrival || !addForm.departure || addForm.departure <= addForm.arrival) { setPriceInfo(null); return; }
    const count = plates.filter(Boolean).length || 1;
    setPriceLoading(true);
    calcPrice(addForm.arrival, addForm.departure, count)
      .then(setPriceInfo).catch(() => setPriceInfo(null)).finally(() => setPriceLoading(false));
  }, [addForm.arrival, addForm.departure, plates.length]);

  // Veerboten laden bij datum/bestemming-wijziging
  useEffect(() => {
    if (!addForm.arrival || !addForm.destination || addForm.destination === 'anders') {
      setOutboundSlots([]); return;
    }
    setFerriesLoading(true);
    fetchFerries(addForm.arrival, addForm.destination, 'outbound')
      .then(setOutboundSlots).finally(() => setFerriesLoading(false));
  }, [addForm.arrival, addForm.destination]);

  useEffect(() => {
    if (!addForm.departure || !addForm.destination || addForm.destination === 'anders') {
      setReturnSlots([]); return;
    }
    fetchFerries(addForm.departure, addForm.destination, 'return').then(setReturnSlots);
  }, [addForm.departure, addForm.destination]);

  function reloadFerries() {
    if (addForm.arrival && addForm.destination && addForm.destination !== 'anders') {
      setFerriesLoading(true);
      fetchFerries(addForm.arrival, addForm.destination, 'outbound')
        .then(setOutboundSlots).finally(() => setFerriesLoading(false));
    }
    if (addForm.departure && addForm.destination && addForm.destination !== 'anders') {
      fetchFerries(addForm.departure, addForm.destination, 'return').then(setReturnSlots);
    }
  }

  // Formulier openen: vul naam/email/tel over vanuit factuurgegevens
  function openAddForm() {
    if (group) {
      // Splits billing_name op voor- en achternaam (eerste woord = voornaam)
      const parts = (group.billing_name || '').trim().split(' ');
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || '';
      setAddForm(f => ({
        ...f,
        firstName,
        lastName,
        email: group.billing_email || '',
        phone: '',
      }));
    }
    setPlates(['']);
    setEvKwhs({});
    setShowAddForm(true);
  }

  function upd(field: string, val: any) {
    setAddForm(f => ({ ...f, [field]: val }));
  }

  async function saveBilling() {
    setSaving(true);
    try {
      await api.invoiceGroups.update(id, billing);
      toast('Factuurgegevens opgeslagen ✓');
      setEditBilling(false);
      load();
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  async function sendInvoice() {
    if (!group?.reservations?.length) { toastError('Voeg eerst reserveringen toe'); return; }
    if (!confirm(`Factuur versturen naar ${group.billing_email}?`)) return;
    setSending(true);
    try {
      const r = await api.invoiceGroups.send(id);
      toast(`Factuur verstuurd naar ${r.sentTo} ✓`);
      load();
    } catch (e: any) { toastError(e.message); }
    finally { setSending(false); }
  }

  async function markPaid() {
    try {
      await api.invoiceGroups.update(id, { ...billing, status: 'paid' });
      toast('Factuur gemarkeerd als betaald ✓');
      load();
    } catch (e: any) { toastError(e.message); }
  }

  async function removeReservation(resId: string, resRef: string) {
    if (!confirm(`Reservering ${resRef} uit factuurgroep verwijderen?`)) return;
    try {
      await api.invoiceGroups.removeReservation(id, resId);
      toast(`${resRef} verwijderd`);
      load();
    } catch (e: any) { toastError(e.message); }
  }

  async function addReservation() {
    const validPlates = plates.filter(Boolean);
    if (!addForm.firstName || !addForm.lastName || !addForm.email) { toastError('Naam en e-mailadres zijn verplicht'); return; }
    if (!addForm.arrival || !addForm.departure || addForm.departure <= addForm.arrival) { toastError('Geldige periodes vereist'); return; }
    if (validPlates.length === 0) { toastError('Minimaal één kenteken vereist'); return; }
    setAddSaving(true);
    try {
      const result = await api.reservations.createAdmin({
        arrivalDate: addForm.arrival,
        departureDate: addForm.departure,
        ferryOutboundDestination: addForm.destination,
        ferryOutboundId: addForm.ferryOutboundId || undefined,
        ferryOutboundTime: addForm.ferryOutboundCustom ? addForm.ferryOutboundCustomTime : addForm.ferryOutboundTime || undefined,
        ferryReturnId: addForm.ferryReturnId || undefined,
        ferryReturnTime: addForm.ferryReturnCustom ? addForm.ferryReturnCustomTime : addForm.ferryReturnTime || undefined,
        ferryReturnCustom: addForm.ferryReturnCustom || undefined,
        ferryReturnCustomTime: addForm.ferryReturnCustom ? addForm.ferryReturnCustomTime : undefined,
        paymentMethod: 'invoice',
        customerNote: addForm.note || undefined,
        customer: { firstName: addForm.firstName, lastName: addForm.lastName, email: addForm.email, phone: addForm.phone || undefined },
        vehicles: validPlates.map((p, i) => {
          const kwh = evKwhs[i];
          const evSvc = kwh ? evServices.find(s => s.kwh === kwh) : undefined;
          return { licensePlate: p, evServiceId: evSvc?.id || undefined, evKwh: kwh || undefined };
        }),
        invoiceGroupId: parseInt(id),
      });
      toast(`Boeking ${result.reference} toegevoegd`);
      setShowAddForm(false);
      load();
    } catch (e: any) { toastError(e.message); }
    finally { setAddSaving(false); }
  }

  const nights = addForm.arrival && addForm.departure && addForm.departure > addForm.arrival
    ? Math.round((new Date(addForm.departure).getTime() - new Date(addForm.arrival).getTime()) / 86400000) : 0;

  const totalAmount = group?.reservations?.reduce((s: number, r: any) => s + parseFloat(r.total_price), 0) || 0;

  const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', color: '#0a2240', background: 'white' };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 5 };

  if (loading) return <AdminLayout><div style={{ padding: 40, color: '#7090b0' }}>Laden…</div></AdminLayout>;
  if (!group) return <AdminLayout><div style={{ padding: 40, color: '#8a2020' }}>Niet gevonden</div></AdminLayout>;

  // Geselecteerde veerboot-slot info
  const selOut = outboundSlots.find(s => s.id === addForm.ferryOutboundId);
  const selRet = returnSlots.find(s => s.id === addForm.ferryReturnId);
  const BOAT_DUR = addForm.destination === 'vlieland' ? 100 : 120;
  const FAST_DUR = 50;

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 920 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => router.push('/facturen')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7090b0', fontSize: 20, padding: '4px 8px', lineHeight: 1 }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0a2240' }}>{group.reference}</h1>
              <span style={{
                fontSize: 11, fontWeight: 700, borderRadius: 5, padding: '3px 9px',
                background: group.status === 'paid' ? '#e6f7f0' : group.status === 'sent' ? '#e8f0fe' : '#f0f2f5',
                color: group.status === 'paid' ? '#1a6644' : group.status === 'sent' ? '#1a4fa0' : '#556070',
              }}>{STATUS_LABEL[group.status] || group.status}</span>
            </div>
            <div style={{ fontSize: 13, color: '#7090b0', marginTop: 2 }}>
              {group.billing_company ? `${group.billing_company} — ` : ''}{group.billing_name} · {group.billing_email}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={`/print/factuurgroep/${id}`} target="_blank" rel="noopener noreferrer"
              style={{ padding: '8px 14px', borderRadius: 8, border: '0.5px solid rgba(10,34,64,0.2)', background: 'white', fontSize: 13, fontWeight: 600, color: '#0a2240', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
              <DocumentTextIcon style={{ width: 15, height: 15 }} />Factuurvoorbeeld
            </a>
            {group.modification_token && (
              <button onClick={() => {
                const origin = window.location.hostname === 'localhost'
                  ? window.location.origin.replace(':3002', ':3000')
                  : 'https://booking.parkeren-harlingen.nl';
                const url = `${origin}/boeken/groep-wijzigen/${group.modification_token}`;
                navigator.clipboard.writeText(url).then(() => toast('Wijzigingslink gekopieerd ✓')).catch(() => { window.prompt('Kopieer de link:', url); });
              }} style={{ padding: '8px 14px', borderRadius: 8, border: '0.5px solid rgba(10,34,64,0.2)', background: 'white', fontSize: 13, fontWeight: 600, color: '#0a7c6e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <LinkIcon style={{ width: 15, height: 15 }} />Wijzigingslink
              </button>
            )}
            {group.status !== 'paid' && (
              <button onClick={markPaid} style={{ padding: '8px 14px', borderRadius: 8, border: '0.5px solid rgba(10,34,64,0.2)', background: 'white', fontSize: 13, fontWeight: 600, color: '#1a6644', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <CheckIcon style={{ width: 15, height: 15 }} />Betaald
              </button>
            )}
            <button onClick={sendInvoice} disabled={sending} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0a2240', color: 'white', fontSize: 13, fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, opacity: sending ? 0.6 : 1 }}>
              <PaperAirplaneIcon style={{ width: 15, height: 15 }} />{sending ? 'Versturen…' : 'Factuur versturen'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {/* Factuurgegevens */}
          <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0a2240' }}>Factuurgegevens</h2>
              <button onClick={() => setEditBilling(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7090b0', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                <PencilSquareIcon style={{ width: 14, height: 14 }} />Bewerken
              </button>
            </div>
            {editBilling ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div><label style={lbl}>Naam *</label><input style={inp} value={billing.billingName} onChange={e => setBilling((b: any) => ({ ...b, billingName: e.target.value }))} /></div>
                <div><label style={lbl}>Bedrijf</label><input style={inp} value={billing.billingCompany} onChange={e => setBilling((b: any) => ({ ...b, billingCompany: e.target.value }))} /></div>
                <div><label style={lbl}>E-mail *</label><input style={inp} type="email" value={billing.billingEmail} onChange={e => setBilling((b: any) => ({ ...b, billingEmail: e.target.value }))} /></div>
                <div><label style={lbl}>Straat</label><input style={inp} value={billing.billingAddress} onChange={e => setBilling((b: any) => ({ ...b, billingAddress: e.target.value }))} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
                  <div><label style={lbl}>Postcode</label><input style={inp} value={billing.billingPostalCode} onChange={e => setBilling((b: any) => ({ ...b, billingPostalCode: e.target.value }))} /></div>
                  <div><label style={lbl}>Stad</label><input style={inp} value={billing.billingCity} onChange={e => setBilling((b: any) => ({ ...b, billingCity: e.target.value }))} /></div>
                </div>
                <div><label style={lbl}>BTW-nummer</label><input style={inp} value={billing.billingVatNumber} onChange={e => setBilling((b: any) => ({ ...b, billingVatNumber: e.target.value }))} /></div>
                <div><label style={lbl}>Notitie</label><input style={inp} value={billing.notes} onChange={e => setBilling((b: any) => ({ ...b, notes: e.target.value }))} /></div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button onClick={() => setEditBilling(false)} style={{ padding: '7px 14px', borderRadius: 7, border: '0.5px solid rgba(10,34,64,0.2)', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#556070' }}>Annuleren</button>
                  <button onClick={saveBilling} disabled={saving} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#0a7c6e', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{saving ? '…' : 'Opslaan'}</button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#1a2e48', lineHeight: 1.7 }}>
                {group.billing_company && <div style={{ fontWeight: 700 }}>{group.billing_company}</div>}
                <div>{group.billing_name}</div>
                {group.billing_address && <div>{group.billing_address}</div>}
                {group.billing_postal_code && <div>{group.billing_postal_code} {group.billing_city}</div>}
                <div style={{ color: '#0a7c6e', marginTop: 4 }}>{group.billing_email}</div>
                {group.billing_vat_number && <div style={{ color: '#7090b0', fontSize: 12, marginTop: 4 }}>BTW: {group.billing_vat_number}</div>}
                {group.notes && <div style={{ marginTop: 8, padding: '8px 10px', background: '#f4f6f9', borderRadius: 6, fontSize: 12, color: '#556070' }}>{group.notes}</div>}
              </div>
            )}
          </div>

          {/* Samenvatting */}
          <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 12, padding: '18px 20px' }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#0a2240' }}>Samenvatting</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#556070' }}>
                <span>Aantal boekingen</span><span style={{ fontWeight: 700, color: '#0a2240' }}>{group.reservations?.length || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#556070' }}>
                <span>Totaal aantal auto's</span>
                <span style={{ fontWeight: 700, color: '#0a2240' }}>
                  {group.reservations?.reduce((s: number, r: any) => s + (r.plates ? r.plates.split(',').length : 0), 0) || 0}
                </span>
              </div>
              <div style={{ height: 1, background: 'rgba(10,34,64,0.06)', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: '#0a2240' }}>
                <span>Totaalbedrag</span><span>€ {totalAmount.toFixed(2).replace('.', ',')}</span>
              </div>
              <div style={{ fontSize: 11, color: '#7090b0' }}>incl. 21% BTW</div>
            </div>
          </div>
        </div>

        {/* Reserveringen */}
        <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0a2240' }}>Boekingen ({group.reservations?.length || 0})</h2>
            <button onClick={openAddForm} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#0a7c6e', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <PlusIcon style={{ width: 14, height: 14 }} />Boeking toevoegen
            </button>
          </div>

          {group.reservations?.length === 0 && !showAddForm ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#7090b0', fontSize: 13 }}>Nog geen boekingen — klik "+ Boeking toevoegen".</div>
          ) : group.reservations?.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: showAddForm ? 0 : 0 }}>
              <thead>
                <tr style={{ background: '#f4f6f9' }}>
                  {['Ref.', 'Naam', 'Kenteken(s)', 'Periode', 'Veerboot heen', 'Dagen', 'Bedrag', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#7090b0', textAlign: h === 'Bedrag' ? 'right' : 'left', textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.reservations.map((r: any) => (
                  <tr key={r.id} style={{ borderBottom: '0.5px solid rgba(10,34,64,0.07)' }}>
                    <td style={{ padding: '10px', fontSize: 12, fontWeight: 700 }}>
                      <a href={`/reservations/${r.id}?from=/facturen/${id}`} style={{ color: '#0a7c6e', textDecoration: 'none' }}>{r.reference}</a>
                    </td>
                    <td style={{ padding: '10px', fontSize: 13, color: '#1a2e48', whiteSpace: 'nowrap' }}>{r.first_name} {r.last_name}</td>
                    <td style={{ padding: '10px', fontSize: 12, color: '#556070', fontFamily: 'monospace' }}>{r.plates || '—'}</td>
                    <td style={{ padding: '10px', fontSize: 12, color: '#556070', whiteSpace: 'nowrap' }}>
                      {new Date(r.arrival_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – {new Date(r.departure_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '10px', fontSize: 12, color: '#556070' }}>
                      {r.ferry_outbound_time ? r.ferry_outbound_time.slice(0, 5) : '—'}
                    </td>
                    <td style={{ padding: '10px', fontSize: 12, color: '#556070' }}>{r.nights + 1}</td>
                    <td style={{ padding: '10px', fontSize: 13, fontWeight: 700, color: '#0a2240', textAlign: 'right', whiteSpace: 'nowrap' }}>€ {Number(r.total_price).toFixed(2).replace('.', ',')}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                        {group.modification_token && (
                          <button onClick={async () => {
                            const origin = window.location.hostname === 'localhost'
                              ? window.location.origin.replace(':3002', ':3000')
                              : 'https://booking.parkeren-harlingen.nl';
                            const fullUrl = `${origin}/boeken/groep-wijzigen/${group.modification_token}/${r.id}`;
                            try {
                              const resp = await fetch(`${API_BASE}/public/short-link`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ url: fullUrl }),
                              });
                              const { code } = resp.ok ? await resp.json() : {};
                              const shortUrl = code ? `${origin}/boeken/r/${code}` : fullUrl;
                              navigator.clipboard.writeText(shortUrl).then(() => toast('Persoonlijke link gekopieerd ✓')).catch(() => { window.prompt('Kopieer de link:', shortUrl); });
                            } catch {
                              navigator.clipboard.writeText(fullUrl).then(() => toast('Persoonlijke link gekopieerd ✓')).catch(() => { window.prompt('Kopieer de link:', fullUrl); });
                            }
                          }} title="Persoonlijke link kopiëren"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0a7c6e', padding: '2px 4px' }}>
                            <LinkIcon style={{ width: 14, height: 14 }} />
                          </button>
                        )}
                        <button onClick={() => removeReservation(r.id, r.reference)} title="Verwijderen"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', padding: '2px 4px' }}>
                          <TrashIcon style={{ width: 15, height: 15 }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {/* ── Boeking toevoegen formulier ── */}
          {showAddForm && (
            <div style={{ marginTop: group.reservations?.length > 0 ? 16 : 0, borderTop: group.reservations?.length > 0 ? '1px solid rgba(10,34,64,0.08)' : 'none', paddingTop: group.reservations?.length > 0 ? 16 : 0 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#0a2240' }}>Nieuwe boeking toevoegen aan {group.reference}</h3>

              {/* Contactgegevens */}
              <div style={{ background: '#f8fafc', borderRadius: 9, padding: '14px 16px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Contactgegevens</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label style={lbl}>Voornaam *</label><input style={inp} value={addForm.firstName} onChange={e => upd('firstName', e.target.value)} placeholder="Jan" /></div>
                  <div><label style={lbl}>Achternaam *</label><input style={inp} value={addForm.lastName} onChange={e => upd('lastName', e.target.value)} placeholder="Jansen" /></div>
                  <div><label style={lbl}>E-mailadres *</label><input style={inp} type="email" value={addForm.email} onChange={e => upd('email', e.target.value)} /></div>
                  <div><label style={lbl}>Telefoon</label><input style={inp} value={addForm.phone} onChange={e => upd('phone', e.target.value)} placeholder="06-12345678" /></div>
                </div>
              </div>

              {/* Periode + bestemming */}
              <div style={{ background: '#f8fafc', borderRadius: 9, padding: '14px 16px', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.5 }}>Periode</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ ...lbl, margin: 0 }}>Bestemming</label>
                    <select style={{ ...inp, width: 'auto', padding: '5px 10px', fontSize: 12 }} value={addForm.destination} onChange={e => upd('destination', e.target.value)}>
                      <option value="terschelling">Terschelling</option>
                      <option value="vlieland">Vlieland</option>
                      <option value="anders">Anders</option>
                    </select>
                  </div>
                </div>
                <DateRangePicker
                  arrival={addForm.arrival}
                  departure={addForm.departure}
                  onArrival={d => upd('arrival', d)}
                  onDeparture={d => upd('departure', d)}
                  allowPast={true}
                />
                {priceInfo && !priceLoading && nights > 0 && (
                  <div style={{ marginTop: 8, background: 'white', borderRadius: 7, padding: '7px 12px', fontSize: 13, color: '#0a2240', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    {nights + 1} dag{(nights + 1) !== 1 ? 'en' : ''}
                    <span style={{ fontWeight: 700 }}>€ {priceInfo.totalPrice.toFixed(2)} <span style={{ fontWeight: 400, color: '#7090b0' }}>({priceInfo.rateName})</span></span>
                  </div>
                )}
                {priceLoading && <div style={{ marginTop: 8, fontSize: 12, color: '#7090b0' }}>Prijs berekenen…</div>}
              </div>

              {/* Veerbottijden heen */}
              {addForm.destination !== 'anders' && (
                <div style={{ background: '#f8fafc', borderRadius: 9, padding: '14px 16px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Veerboot heen — {addForm.arrival ? new Date(addForm.arrival).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
                      {ferriesLoading && <span style={{ fontWeight: 400, marginLeft: 8 }}>laden…</span>}
                    </div>
                    <button onClick={reloadFerries} title="Dienstregeling opnieuw ophalen" disabled={ferriesLoading}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '0.5px solid rgba(10,34,64,0.2)', background: 'white', cursor: ferriesLoading ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600, color: '#556070', opacity: ferriesLoading ? 0.5 : 1 }}>
                      <ArrowPathIcon style={{ width: 13, height: 13 }} />Ophalen
                    </button>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 13, color: '#0a2240' }}>
                    <input type="checkbox" checked={addForm.ferryOutboundCustom} onChange={e => upd('ferryOutboundCustom', e.target.checked)} />
                    Handmatig tijd invoeren
                  </label>
                  {addForm.ferryOutboundCustom ? (
                    <input style={{ ...inp, width: 140 }} type="time" value={addForm.ferryOutboundCustomTime} onChange={e => upd('ferryOutboundCustomTime', e.target.value)} />
                  ) : outboundSlots.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {outboundSlots.map((s: any) => {
                        const depTime = (s.departureTime || s.departure_time || s.time || '').slice(0, 5);
                        const isSnelboot = s.isFast || s.ferryName?.toLowerCase().includes('snel') || s.durationMin <= 55;
                        const dur = isSnelboot ? FAST_DUR : BOAT_DUR;
                        const arr = depTime ? addMins(depTime, dur) : '';
                        const sel = addForm.ferryOutboundId === s.id;
                        return (
                          <button key={s.id} onClick={() => { upd('ferryOutboundId', s.id); upd('ferryOutboundTime', depTime); }}
                            style={{ padding: '8px 12px', borderRadius: 8, border: sel ? '2px solid #0a7c6e' : '0.5px solid rgba(10,34,64,0.18)', background: sel ? '#e6f7f5' : 'white', cursor: 'pointer', textAlign: 'center', minWidth: 80 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: sel ? '#0a7c6e' : '#0a2240' }}>{depTime}</div>
                            {arr && <div style={{ fontSize: 10, color: '#7090b0' }}>↓ {arr}</div>}
                            {isSnelboot && <div style={{ fontSize: 9, color: '#0a7c6e', fontWeight: 700 }}>SNEL</div>}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#7090b0' }}>{addForm.arrival ? 'Geen dienstregeling gevonden — gebruik handmatige invoer.' : 'Voer eerst een aankomstdatum in.'}</div>
                  )}
                  {(addForm.ferryOutboundTime || addForm.ferryOutboundCustomTime) && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#0a7c6e', fontWeight: 700 }}>
                      ✓ Vertrek {addForm.ferryOutboundCustom ? addForm.ferryOutboundCustomTime : addForm.ferryOutboundTime} geselecteerd
                    </div>
                  )}
                </div>
              )}

              {/* Veerbottijden terug */}
              {addForm.destination !== 'anders' && (
                <div style={{ background: '#f8fafc', borderRadius: 9, padding: '14px 16px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Veerboot terug — {addForm.departure ? new Date(addForm.departure).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
                    </div>
                    <button onClick={reloadFerries} title="Dienstregeling opnieuw ophalen"
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '0.5px solid rgba(10,34,64,0.2)', background: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#556070' }}>
                      <ArrowPathIcon style={{ width: 13, height: 13 }} />Ophalen
                    </button>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 13, color: '#0a2240' }}>
                    <input type="checkbox" checked={addForm.ferryReturnCustom} onChange={e => upd('ferryReturnCustom', e.target.checked)} />
                    Handmatig tijd invoeren
                  </label>
                  {addForm.ferryReturnCustom ? (
                    <input style={{ ...inp, width: 140 }} type="time" value={addForm.ferryReturnCustomTime} onChange={e => upd('ferryReturnCustomTime', e.target.value)} />
                  ) : returnSlots.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {returnSlots.map((s: any) => {
                        const depTime = (s.departureTime || s.departure_time || s.time || '').slice(0, 5);
                        const isSnelboot = s.isFast || s.ferryName?.toLowerCase().includes('snel') || s.durationMin <= 55;
                        const dur = isSnelboot ? FAST_DUR : BOAT_DUR;
                        const arr = depTime ? addMins(depTime, dur) : '';
                        const sel = addForm.ferryReturnId === s.id;
                        return (
                          <button key={s.id} onClick={() => { upd('ferryReturnId', s.id); upd('ferryReturnTime', depTime); }}
                            style={{ padding: '8px 12px', borderRadius: 8, border: sel ? '2px solid #0a2240' : '0.5px solid rgba(10,34,64,0.18)', background: sel ? '#e8eef5' : 'white', cursor: 'pointer', textAlign: 'center', minWidth: 80 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#0a2240' }}>{depTime}</div>
                            {arr && <div style={{ fontSize: 10, color: '#7090b0' }}>↓ {arr}</div>}
                            {isSnelboot && <div style={{ fontSize: 9, color: '#0a7c6e', fontWeight: 700 }}>SNEL</div>}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#7090b0' }}>{addForm.departure ? 'Geen dienstregeling gevonden — gebruik handmatige invoer.' : 'Voer eerst een vertrekdatum in.'}</div>
                  )}
                  {(addForm.ferryReturnTime || addForm.ferryReturnCustomTime) && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#0a2240', fontWeight: 700 }}>
                      ✓ Vertrek terug {addForm.ferryReturnCustom ? addForm.ferryReturnCustomTime : addForm.ferryReturnTime} geselecteerd
                    </div>
                  )}
                </div>
              )}

              {/* Kentekens */}
              <div style={{ background: '#f8fafc', borderRadius: 9, padding: '14px 16px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Kenteken(s) *</div>
                {plates.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input style={{ ...inp, flex: 1, fontFamily: 'monospace', textTransform: 'uppercase' }}
                      value={p} placeholder={`Kenteken ${i + 1}`}
                      onChange={e => { const n = [...plates]; n[i] = e.target.value.toUpperCase().replace(/\s/g, '-'); setPlates(n); }} />
                    {evServices.length > 0 && (
                      <select style={{ padding: '8px 10px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 12, color: '#0a2240', background: 'white', minWidth: 130 }}
                        value={evKwhs[i] ?? ''}
                        onChange={e => setEvKwhs(k => ({ ...k, [i]: e.target.value ? parseInt(e.target.value) : undefined }))}>
                        <option value="">Geen laden</option>
                        {evServices.map(s => <option key={s.id} value={s.kwh}>{s.kwh} kWh +€{parseFloat(s.price).toFixed(2)}</option>)}
                      </select>
                    )}
                    {plates.length > 1 && (
                      <button onClick={() => setPlates(p => p.filter((_, j) => j !== i))}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '0.5px solid rgba(10,34,64,0.15)', background: 'white', cursor: 'pointer', color: '#c62828' }}>
                        <TrashIcon style={{ width: 14, height: 14 }} />
                      </button>
                    )}
                  </div>
                ))}
                {plates.length < 5 && (
                  <button onClick={() => setPlates(p => [...p, ''])} style={{ fontSize: 12, color: '#0a7c6e', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '2px 0' }}>
                    + Kenteken toevoegen
                  </button>
                )}
              </div>

              {/* Notitie */}
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Notitie (optioneel)</label>
                <input style={inp} value={addForm.note} onChange={e => upd('note', e.target.value)} placeholder="Bijv. invalidenparkeerplaats gewenst" />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowAddForm(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '0.5px solid rgba(10,34,64,0.2)', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#556070' }}>Annuleren</button>
                <button onClick={addReservation} disabled={addSaving} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#0a7c6e', color: 'white', cursor: addSaving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: addSaving ? 0.6 : 1 }}>
                  {addSaving ? 'Toevoegen…' : 'Toevoegen aan factuur'}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </AdminLayout>
  );
}
