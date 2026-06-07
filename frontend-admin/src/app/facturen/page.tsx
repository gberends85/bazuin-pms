'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { PlusIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline';

const STATUS_LABEL: Record<string, string> = { draft: 'Concept', sent: 'Verstuurd', paid: 'Betaald' };
const STATUS_COLOR: Record<string, string> = {
  draft:  'background:#f0f2f5;color:#556070',
  sent:   'background:#e8f0fe;color:#1a4fa0',
  paid:   'background:#e6f7f0;color:#1a6644',
};

export default function FacturenPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    billingName: '', billingCompany: '', billingAddress: '',
    billingPostalCode: '', billingCity: '', billingEmail: '',
    billingVatNumber: '', notes: '',
  });

  function load() {
    setLoading(true);
    api.invoiceGroups.list()
      .then(setGroups)
      .catch(() => toastError('Laden mislukt'))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function create() {
    if (!form.billingName || !form.billingEmail) { toastError('Naam en e-mailadres zijn verplicht'); return; }
    setCreating(true);
    try {
      const g = await api.invoiceGroups.create(form);
      toast(`Factuurgroep ${g.reference} aangemaakt`);
      setShowForm(false);
      setForm({ billingName: '', billingCompany: '', billingAddress: '', billingPostalCode: '', billingCity: '', billingEmail: '', billingVatNumber: '', notes: '' });
      load();
    } catch (e: any) { toastError(e.message); }
    finally { setCreating(false); }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', color: '#0a2240' };

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 900 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Facturen</h1>
            <p style={{ margin: 0, fontSize: 13, color: '#7090b0' }}>Groepsboekingen op factuur — meerdere auto's/namen/data onder één factuuradres.</p>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: 'none', background: '#0a2240', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <PlusIcon style={{ width: 16, height: 16 }} />Nieuwe factuurgroep
          </button>
        </div>

        {/* Nieuw factuurgroep formulier */}
        {showForm && (
          <div style={{ background: 'white', border: '1.5px solid #0a7c6e', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#0a2240' }}>Nieuwe factuurgroep</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 5 }}>Naam / Contactpersoon *</label>
                <input style={inp} value={form.billingName} onChange={e => setForm(f => ({ ...f, billingName: e.target.value }))} placeholder="Jan Jansen" /></div>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 5 }}>Bedrijfsnaam</label>
                <input style={inp} value={form.billingCompany} onChange={e => setForm(f => ({ ...f, billingCompany: e.target.value }))} placeholder="Bedrijf B.V." /></div>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 5 }}>E-mailadres *</label>
                <input style={inp} type="email" value={form.billingEmail} onChange={e => setForm(f => ({ ...f, billingEmail: e.target.value }))} placeholder="factuur@bedrijf.nl" /></div>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 5 }}>Straat en huisnummer</label>
                <input style={inp} value={form.billingAddress} onChange={e => setForm(f => ({ ...f, billingAddress: e.target.value }))} placeholder="Voorbeeldstraat 1" /></div>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 5 }}>Postcode</label>
                <input style={inp} value={form.billingPostalCode} onChange={e => setForm(f => ({ ...f, billingPostalCode: e.target.value }))} placeholder="1234 AB" /></div>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 5 }}>Stad</label>
                <input style={inp} value={form.billingCity} onChange={e => setForm(f => ({ ...f, billingCity: e.target.value }))} placeholder="Amsterdam" /></div>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 5 }}>BTW-nummer</label>
                <input style={inp} value={form.billingVatNumber} onChange={e => setForm(f => ({ ...f, billingVatNumber: e.target.value }))} placeholder="NL000000000B01" /></div>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 5 }}>Notitie (intern)</label>
                <input style={inp} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Bijv. groepsreis bedrijfsuitje" /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '0.5px solid rgba(10,34,64,0.2)', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#556070' }}>Annuleren</button>
              <button onClick={create} disabled={creating} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#0a7c6e', color: 'white', cursor: creating ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: creating ? 0.6 : 1 }}>
                {creating ? 'Aanmaken…' : 'Aanmaken'}
              </button>
            </div>
          </div>
        )}

        {/* Lijst */}
        {loading ? (
          <div style={{ color: '#7090b0', padding: 20 }}>Laden…</div>
        ) : groups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#7090b0' }}>
            <BuildingOfficeIcon style={{ width: 40, height: 40, margin: '0 auto 12px', display: 'block', opacity: 0.35 }} />
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Nog geen factuurgroepen</div>
            <div style={{ fontSize: 13 }}>Klik op "+ Nieuwe factuurgroep" om te beginnen.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups.map(g => (
              <Link key={g.id} href={`/facturen/${g.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(10,34,64,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#0a2240' }}>{g.reference}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 5, padding: '2px 8px', ...Object.fromEntries((STATUS_COLOR[g.status] || STATUS_COLOR.draft).split(';').map(s => s.split(':').map(x => x.trim()))) }}>
                        {STATUS_LABEL[g.status] || g.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#0a2240', fontWeight: 600 }}>
                      {g.billing_company ? `${g.billing_company} — ` : ''}{g.billing_name}
                    </div>
                    <div style={{ fontSize: 12, color: '#7090b0', marginTop: 2 }}>
                      {g.billing_email} · {g.billing_city || '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0a2240' }}>€ {Number(g.total_amount).toFixed(2).replace('.', ',')}</div>
                    <div style={{ fontSize: 12, color: '#7090b0', marginTop: 2 }}>{g.reservation_count} reservering{g.reservation_count !== '1' ? 'en' : ''}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
