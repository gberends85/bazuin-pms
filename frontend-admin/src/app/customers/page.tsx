'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/layout/AdminLayout';
import PlateTooltip from '@/components/ui/PlateTooltip';
import { api } from '@/lib/api';
import { XMarkIcon, PrinterIcon } from '@heroicons/react/24/outline';
import { ClipboardList, Check } from 'lucide-react';

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function payBadge(status: string) {
  const map: Record<string, [string, string]> = {
    paid:    ['Betaald',    '#e8f5eb'],
    pending: ['Te betalen', '#fff0cc'],
    partial: ['Gedeeltelijk', '#fff0cc'],
  };
  const [label, bg] = map[status] ?? [status, '#f0f0f0'];
  return <span style={{ fontSize: 10, fontWeight: 700, background: bg, padding: '2px 7px', borderRadius: 10 }}>{label}</span>;
}

function statusBadge(status: string) {
  const map: Record<string, [string, string]> = {
    booked:     ['Geboekt',      '#e6f1fb'],
    checked_in: ['Ingecheckt',   '#e6f7f5'],
    completed:  ['Afgerond',     '#e8e8e8'],
    cancelled:  ['Geannuleerd',  '#fdeaea'],
  };
  const [label, bg] = map[status] ?? [status, '#f0f0f0'];
  return <span style={{ fontSize: 10, fontWeight: 700, background: bg, padding: '2px 7px', borderRadius: 10 }}>{label}</span>;
}

// ─── Klant detail panel ───────────────────────────────────────────────────────

function CustomerPanel({ customerId, onClose, onDeleted }: {
  customerId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState<string | false>(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [selectedPlates, setSelectedPlates] = useState<string[]>([]);
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [magicLinkCopied, setMagicLinkCopied] = useState(false);

  useEffect(() => {
    setCustomer(null); setNotFound(false); setLoading(true);
    api.customers.get(customerId).then(d => {
      setCustomer(d);
      const lastRes = d.reservations?.[0];
      if (lastRes?.plates) {
        setSelectedPlates(lastRes.plates.split(', ').filter(Boolean));
      }
    }).catch((e: any) => setNotFound(e?.message || 'Onbekende fout'))
      .finally(() => setLoading(false));
  }, [customerId]);

  async function doDelete() {
    setDeleting(true);
    try {
      await api.customers.remove(customerId);
      onDeleted();
      onClose();
    } finally { setDeleting(false); }
  }

  async function getMagicLink() {
    setMagicLinkLoading(true);
    setMagicLink(null);
    setMagicLinkCopied(false);
    try {
      const r = await api.customers.magicLink(customerId);
      setMagicLink(r.url);
    } catch (e: any) {
      alert('Kon link niet genereren: ' + e.message);
    } finally {
      setMagicLinkLoading(false);
    }
  }

  function copyMagicLink() {
    if (!magicLink) return;
    navigator.clipboard.writeText(magicLink).then(() => {
      setMagicLinkCopied(true);
      setTimeout(() => setMagicLinkCopied(false), 2500);
    });
  }

  function startNewBooking() {
    // Navigeer naar boekingspagina met klantdata als query params
    const params = new URLSearchParams({
      prefill: '1',
      firstName: customer.first_name,
      lastName: customer.last_name,
      email: customer.email,
      phone: customer.phone || '',
      plates: selectedPlates.join(','),
    });
    router.push(`/reservations/new?${params}`);
  }

  const label: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 };
  const section: React.CSSProperties = { padding: '14px 20px', borderBottom: '0.5px solid rgba(10,34,64,0.08)' };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,34,64,0.2)', zIndex: 9000 }} />
      <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 560, background: 'white', zIndex: 9001, overflowY: 'auto', boxShadow: '-4px 0 24px rgba(10,34,64,0.15)' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', background: '#0a2240', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>
              {loading ? '...' : notFound ? 'Fout bij laden' : `${customer?.first_name} ${customer?.last_name}`}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{customer?.email}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', opacity: 0.7, display:'flex', alignItems:'center' }}><XMarkIcon className="w-5 h-5" /></button>
        </div>

        {loading && <div style={{ padding: 32, color: '#7090b0' }}>Laden...</div>}
        {notFound && (
          <div style={{ padding: 32, color: '#c0392b', fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Fout bij laden klant</div>
            <div style={{ fontFamily: 'monospace', background: '#fdeaea', padding: '8px 12px', borderRadius: 6, wordBreak: 'break-all' }}>
              {typeof notFound === 'string' ? notFound : 'Onbekende fout'}
            </div>
            <div style={{ marginTop: 8, color: '#777', fontSize: 11 }}>ID: {customerId}</div>
          </div>
        )}

        {customer && (
          <>
            {/* Contactinfo */}
            <div style={section}>
              <span style={label}>Contactgegevens</span>
              <div style={{ display: 'flex', gap: 24, fontSize: 13, marginBottom: 10 }}>
                <div><span style={{ color: '#7090b0' }}>Tel: </span>{customer.phone || '—'}</div>
                <div><span style={{ color: '#7090b0' }}>E-mail: </span>{customer.email}</div>
              </div>

              {/* Boekingspagina link */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={getMagicLink}
                  disabled={magicLinkLoading}
                  style={{ fontSize: 12 }}
                >
                  {magicLinkLoading ? '⏳ Laden...' : '🔗 Boekingspagina link'}
                </button>
                {magicLink && (
                  <>
                    <button
                      onClick={copyMagicLink}
                      style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                        background: magicLinkCopied ? '#e8f5eb' : '#f4f6f9',
                        border: magicLinkCopied ? '1px solid #a8d5b0' : '1px solid rgba(10,34,64,0.15)',
                        color: magicLinkCopied ? '#2a7a3a' : '#0a2240', fontWeight: 700,
                      }}
                    >
                      {magicLinkCopied ? <><Check size={13} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />Gekopieerd!</> : <><ClipboardList size={13} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />Kopieer link</>}
                    </button>
                    <a
                      href={magicLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 11, color: '#185fa5', textDecoration: 'underline' }}
                    >
                      Bekijken ↗
                    </a>
                  </>
                )}
              </div>
              {magicLink && (
                <div style={{ marginTop: 6, fontSize: 10, color: '#7090b0', wordBreak: 'break-all',
                  background: '#f4f6f9', borderRadius: 6, padding: '5px 8px', fontFamily: 'monospace' }}>
                  {magicLink}
                </div>
              )}
            </div>

            {/* Alle kentekens + nieuwe boeking */}
            <div style={section}>
              <span style={label}>Kentekens</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {customer.all_plates.map((p: string) => (
                  <PlateTooltip key={p} plate={p} />
                ))}
                {customer.all_plates.length === 0 && <span style={{ color: '#7090b0', fontSize: 13 }}>Geen kentekens</span>}
              </div>

              {/* Nieuwe boeking maken */}
              {!newBookingOpen ? (
                <button className="btn btn-primary btn-sm" onClick={() => setNewBookingOpen(true)}>
                  + Nieuwe boeking
                </button>
              ) : (
                <div style={{ background: '#f4f6f9', borderRadius: 8, padding: 14, marginTop: 8 }}>
                  <div style={{ ...label, marginBottom: 8 }}>Selecteer kenteken(s) voor nieuwe boeking</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {customer.all_plates.map((p: string) => {
                      const selected = selectedPlates.includes(p);
                      return (
                        <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: selected ? '#e6f7f5' : 'white', border: `1.5px solid ${selected ? '#0a7c6e' : '#ddd'}` }}>
                          <input type="checkbox" checked={selected} onChange={e => {
                            if (e.target.checked) setSelectedPlates(prev => [...prev, p]);
                            else setSelectedPlates(prev => prev.filter(x => x !== p));
                          }} style={{ accentColor: '#0a7c6e' }} />
                          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: 1 }}>{p}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={startNewBooking} disabled={selectedPlates.length === 0}>
                      Boeking starten →
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setNewBookingOpen(false)}>Annuleer</button>
                  </div>
                </div>
              )}
            </div>

            {/* Boekingshistorie */}
            <div style={section}>
              <span style={label}>Boekingshistorie ({customer.reservations.length})</span>
              {customer.reservations.length === 0 && (
                <div style={{ color: '#7090b0', fontSize: 13 }}>Geen boekingen</div>
              )}
              {customer.reservations.map((r: any) => (
                <div key={r.id} style={{ background: '#f8f9fb', borderRadius: 8, padding: '10px 14px', marginBottom: 8, border: '0.5px solid rgba(10,34,64,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0a2240', marginBottom: 3 }}>
                        {fmtDate(r.arrival_date)} – {fmtDate(r.departure_date)}
                        {r.ferry_outbound_destination && (
                          <span style={{ fontSize: 11, fontWeight: 400, color: '#7090b0', marginLeft: 8, textTransform: 'capitalize' }}>
                            {r.ferry_outbound_destination}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {statusBadge(r.status)}
                        {payBadge(r.payment_status)}
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#0a2240' }}>€ {parseFloat(r.total_price || 0).toFixed(2)}</span>
                        {r.plates && r.plates.split(', ').map((p: string) => (
                          <span key={p} style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, background: '#f5c518', border: '1.5px solid #c8a010', borderRadius: 4, padding: '0 5px' }}>{p}</span>
                        ))}
                      </div>
                      {r.notes && <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{r.notes}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {/* Factuur afdrukken */}
                      <a
                        href={`/print/invoice/${r.id}`}
                        target="_blank"
                        rel="noopener"
                        className="btn btn-ghost btn-sm"
                        title="Factuur afdrukken"
                        style={{ padding: '4px 8px', fontSize: 13 }}
                      >
                        <PrinterIcon className="w-4 h-4" />
                      </a>
                      {/* Detail openen */}
                      <a
                        href={`/reservations/${r.id}`}
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 11 }}
                      >
                        Detail →
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Verwijderen */}
            <div style={{ padding: '14px 20px' }}>
              {!confirmDelete ? (
                <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
                  Klant + alle data verwijderen
                </button>
              ) : (
                <div style={{ background: '#fdeaea', borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#8a2020', marginBottom: 10 }}>
                    Weet je zeker dat je {customer.first_name} {customer.last_name} en alle bijbehorende boekingen wilt verwijderen? Dit is onomkeerbaar.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-danger btn-sm" onClick={doDelete} disabled={deleting}>
                      {deleting ? 'Verwijderen...' : 'Ja, verwijder alles'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Annuleer</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Hoofdpagina ──────────────────────────────────────────────────────────────

function CustomersPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('open'));

  async function load(q?: string) {
    setLoading(true);
    try { const d = await api.customers.list(q); setCustomers(d); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    // Support ?ref=DB-2026-T012 → resolve customer and open panel
    const ref = searchParams.get('ref');
    if (ref && !searchParams.get('open')) {
      api.customers.byRef(ref)
        .then(({ customerId }) => openCustomer(customerId))
        .catch(() => {});
    }
  }, []);

  function openCustomer(id: string) {
    setSelectedId(id);
    router.replace(`/customers?open=${id}`);
  }

  function closeCustomer() {
    setSelectedId(null);
    router.replace('/customers');
  }

  return (
    <AdminLayout>
      <div style={{ padding: '24px 28px', maxWidth: 1000 }}>
        <h1 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Klanten</h1>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Zoek naam of e-mail..."
            onKeyDown={e => e.key === 'Enter' && load(search)}
            style={{ flex: 1, padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 13 }}
          />
          <button className="btn btn-primary btn-sm" onClick={() => load(search)}>Zoeken</button>
        </div>

        {loading && <div style={{ color: '#7090b0', padding: 20 }}>Laden...</div>}

        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a2240', color: 'white' }}>
                {['Naam', 'E-mail', 'Telefoon', 'Boekingen', 'Laatste bezoek', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.4px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((c, i) => (
                <tr
                  key={c.id}
                  onClick={() => openCustomer(c.id)}
                  style={{ borderBottom: '0.5px solid rgba(10,34,64,0.08)', background: i % 2 === 0 ? 'white' : '#f8f9fb', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fffbe6')}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'white' : '#f8f9fb')}
                >
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{c.first_name} {c.last_name}</td>
                  <td style={{ padding: '10px 14px', color: '#0a7c6e' }}>{c.email}</td>
                  <td style={{ padding: '10px 14px', color: '#7090b0' }}>{c.phone || '—'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>{c.reservation_count}</td>
                  <td style={{ padding: '10px 14px', color: '#7090b0', fontSize: 12 }}>
                    {c.last_visit ? fmtDate(c.last_visit) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, color: '#0a7c6e', fontWeight: 600 }}>Details →</span>
                  </td>
                </tr>
              ))}
              {!loading && customers.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#7090b0' }}>Geen klanten gevonden</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedId && (
        <CustomerPanel
          customerId={selectedId}
          onClose={closeCustomer}
          onDeleted={() => { load(search); closeCustomer(); }}
        />
      )}
    </AdminLayout>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<AdminLayout><div style={{ padding: 32, color: '#7090b0' }}>Laden...</div></AdminLayout>}>
      <CustomersPageInner />
    </Suspense>
  );
}
