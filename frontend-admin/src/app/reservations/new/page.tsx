'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { BoltIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface EvService { id: string; name: string; kwh: number; price: string; }

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

async function calcPrice(arrival: string, departure: string, vehicleCount: number) {
  const r = await fetch(`${API_BASE}/rates/calculate?arrival=${arrival}&departure=${departure}&vehicles=${vehicleCount}`);
  if (!r.ok) return null;
  return r.json();
}

function NewBookingForm() {
  const router = useRouter();
  const params = useSearchParams();

  // Prefill from URL params (coming from customer panel)
  const [firstName, setFirstName] = useState(params.get('firstName') || '');
  const [lastName, setLastName] = useState(params.get('lastName') || '');
  const [email, setEmail] = useState(params.get('email') || '');
  const [phone, setPhone] = useState(params.get('phone') || '');
  const [plates, setPlates] = useState<string[]>(
    params.get('plates') ? params.get('plates')!.split(',').filter(Boolean) : ['']
  );

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const [arrival, setArrival] = useState(today);
  const [departure, setDeparture] = useState(tomorrow);
  const [destination, setDestination] = useState<'terschelling' | 'vlieland' | 'anders'>('terschelling');
  const [paymentMethod, setPaymentMethod] = useState('on_site');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const [priceInfo, setPriceInfo] = useState<any>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [evServices, setEvServices] = useState<EvService[]>([]);
  // evKwhs: index → selected kWh (undefined = geen laden)
  const [evKwhs, setEvKwhs] = useState<Record<number, number | undefined>>({});

  useEffect(() => {
    if (!arrival || !departure || departure <= arrival) { setPriceInfo(null); return; }
    setPriceLoading(true);
    calcPrice(arrival, departure, plates.filter(Boolean).length || 1)
      .then(setPriceInfo)
      .catch(() => setPriceInfo(null))
      .finally(() => setPriceLoading(false));
  }, [arrival, departure, plates.length]);

  useEffect(() => {
    api.services.list()
      .then((svcs: any[]) => setEvServices(
        svcs.filter(s => s.kwh).sort((a, b) => a.kwh - b.kwh)
      ))
      .catch(() => {});
  }, []);

  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 };
  const input: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14, color: '#0a2240', boxSizing: 'border-box' };
  const card: React.CSSProperties = { background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 12, padding: '20px 24px', marginBottom: 16 };

  function addPlate() { setPlates(p => [...p, '']); }
  function removePlate(i: number) { setPlates(p => p.filter((_, j) => j !== i)); }
  function updatePlate(i: number, v: string) { setPlates(p => { const n = [...p]; n[i] = v.toUpperCase().replace(/\s/g, '-'); return n; }); }

  async function submit() {
    const validPlates = plates.filter(Boolean);
    if (!firstName || !lastName || !email) { toastError('Naam en e-mail zijn verplicht'); return; }
    if (!arrival || !departure || departure <= arrival) { toastError('Geldige aankomst- en vertrekdatum vereist'); return; }
    if (validPlates.length === 0) { toastError('Minimaal één kenteken vereist'); return; }

    setSaving(true);
    try {
      const result = await api.reservations.createAdmin({
        arrivalDate: arrival,
        departureDate: departure,
        ferryOutboundDestination: destination,
        paymentMethod,
        customerNote: note || undefined,
        customer: { firstName, lastName, email, phone: phone || undefined },
        vehicles: validPlates.map((p, i) => {
          const kwh = evKwhs[i];
          const evSvc = kwh ? evServices.find(s => s.kwh === kwh) : undefined;
          return { licensePlate: p, evServiceId: evSvc?.id || undefined, evKwh: kwh || undefined };
        }),
      });
      toast(`Boeking aangemaakt — #${result.reference}`);
      router.push(`/reservations/${result.id}`);
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const nights = arrival && departure && departure > arrival
    ? Math.round((new Date(departure).getTime() - new Date(arrival).getTime()) / 86400000)
    : 0;

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 680 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7090b0', fontSize: 20, padding: '4px 8px' }}>←</button>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Nieuwe boeking</h1>
        </div>

        {/* Klantgegevens */}
        <div style={card}>
          <h2 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#0a2240' }}>Klantgegevens</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={label}>Voornaam *</label>
              <input style={input} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jan" />
            </div>
            <div>
              <label style={label}>Achternaam *</label>
              <input style={input} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Jansen" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={label}>E-mailadres *</label>
              <input style={input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jan@voorbeeld.nl" />
            </div>
            <div>
              <label style={label}>Telefoonnummer</label>
              <input style={input} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="06-12345678" />
            </div>
          </div>
        </div>

        {/* Periode */}
        <div style={card}>
          <h2 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#0a2240' }}>Periode</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={label}>Aankomst *</label>
              <input style={input} type="date" value={arrival} onChange={e => setArrival(e.target.value)} />
            </div>
            <div>
              <label style={label}>Vertrek *</label>
              <input style={input} type="date" value={departure} min={arrival} onChange={e => setDeparture(e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Bestemming (veerboot heen)</label>
            <select style={{ ...input }} value={destination} onChange={e => setDestination(e.target.value as any)}>
              <option value="terschelling">Terschelling</option>
              <option value="vlieland">Vlieland</option>
              <option value="anders">Anders</option>
            </select>
          </div>
          {nights > 0 && (
            <div style={{ background: '#f4f6f9', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#0a2240' }}>
              {nights + 1} dag{(nights + 1) !== 1 ? 'en' : ''}
              {priceLoading && <span style={{ color: '#7090b0', marginLeft: 12 }}>Prijs berekenen…</span>}
              {priceInfo && !priceLoading && (
                <span style={{ fontWeight: 700, marginLeft: 12 }}>
                  € {priceInfo.totalPrice.toFixed(2)} <span style={{ fontWeight: 400, color: '#7090b0' }}>({priceInfo.rateName})</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Kentekens */}
        <div style={card}>
          <h2 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#0a2240' }}>Kentekens</h2>
          {plates.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                value={p}
                onChange={e => updatePlate(i, e.target.value)}
                placeholder="XX-000-X"
                style={{ ...input, fontFamily: 'monospace', fontSize: 16, fontWeight: 700, letterSpacing: 1 }}
              />
              {plates.length > 1 && (
                <button onClick={() => removePlate(i)} style={{ background: 'none', border: '0.5px solid #e0e4ea', borderRadius: 7, padding: '0 12px', color: '#c00', cursor: 'pointer', flexShrink: 0, display:'flex', alignItems:'center' }}><XMarkIcon className="w-4 h-4" /></button>
              )}
            </div>
          ))}
          {plates.length < 5 && (
            <button onClick={addPlate} style={{ background: 'none', border: '0.5px dashed rgba(10,34,64,0.3)', borderRadius: 7, padding: '8px 16px', color: '#7090b0', cursor: 'pointer', fontSize: 13, marginTop: 4 }}>
              + Kenteken toevoegen
            </button>
          )}
        </div>

        {/* EV Laden */}
        {evServices.length > 0 && (
          <div style={card}>
            <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#0a2240', display:'flex', alignItems:'center', gap:5 }}><BoltIcon className="w-4 h-4" />Auto opladen</h2>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#7090b0' }}>Optioneel — selecteer gewenste kWh per auto (laat leeg = geen laden)</p>
            {plates.filter(Boolean).map((p, i) => (
              <div key={i} style={{ marginBottom: i < plates.filter(Boolean).length - 1 ? 14 : 0 }}>
                {plates.filter(Boolean).length > 1 && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {p || `Auto ${i + 1}`}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button type="button"
                    onClick={() => setEvKwhs(prev => { const n = { ...prev }; delete n[i]; return n; })}
                    style={{ padding: '7px 12px', borderRadius: 7, border: !evKwhs[i] ? '2px solid #0a2240' : '0.5px solid rgba(10,34,64,0.2)', background: !evKwhs[i] ? '#0a2240' : 'white', color: !evKwhs[i] ? 'white' : '#0a2240', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    Geen laden
                  </button>
                  {evServices.map(s => {
                    const sel = evKwhs[i] === s.kwh;
                    return (
                      <button type="button" key={s.id}
                        onClick={() => setEvKwhs(prev => ({ ...prev, [i]: s.kwh }))}
                        style={{ padding: '7px 12px', borderRadius: 7, border: sel ? '2px solid #0a7c6e' : '0.5px solid rgba(10,34,64,0.2)', background: sel ? '#e6f7f5' : 'white', cursor: 'pointer', textAlign: 'center' as const }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: sel ? '#0a7c6e' : '#0a2240' }}>{s.kwh} kWh</div>
                        <div style={{ fontSize: 11, color: '#7090b0' }}>€ {parseFloat(s.price).toFixed(0)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Betaling & opmerking */}
        <div style={card}>
          <h2 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#0a2240' }}>Betaling & opmerkingen</h2>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Betaalmethode</label>
            <select style={{ ...input }} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
              <option value="on_site">Ter plekke betalen</option>
              <option value="ideal">iDEAL</option>
              <option value="card">Creditcard</option>
            </select>
          </div>
          <div>
            <label style={label}>Opmerking (intern / voor klant)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Bijv. telefonische boeking, specifieke wensen…"
              style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>

        {/* Samenvatting + opslaan */}
        {priceInfo && (
          <div style={{ background: '#e8f5eb', border: '0.5px solid #b0d8ba', borderRadius: 12, padding: '16px 24px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#2a7a3a', fontWeight: 700, marginBottom: 4 }}>Totaalprijs (excl. on_site toeslag)</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#0a2240' }}>€ {priceInfo.totalPrice.toFixed(2)}</div>
            <div style={{ fontSize: 11, color: '#7090b0', marginTop: 2 }}>{priceInfo.breakdown}</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => router.back()} className="btn btn-ghost">Annuleren</button>
          <button onClick={submit} disabled={saving} className="btn btn-primary" style={{ flex: 1, fontSize: 15 }}>
            {saving ? 'Boeking aanmaken…' : <><CheckIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Boeking aanmaken</>}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}

export default function NewReservationPage() {
  return (
    <Suspense fallback={<AdminLayout><div style={{ padding: 40 }}>Laden…</div></AdminLayout>}>
      <NewBookingForm />
    </Suspense>
  );
}
