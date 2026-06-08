'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api, fetchContractInvoicePreview } from '@/lib/api';

function fmt(iso: string): string {
  if (!iso) return '';
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return iso; }
}

export default function FacturenGoedkeurenPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { setItems(await api.pendingContractInvoices.list()); }
    catch (e: any) { toastError(e?.message || 'Laden mislukt'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function generate() {
    setBusy('run');
    try {
      const r = await api.pendingContractInvoices.run();
      toast(r.created > 0 ? `${r.created} concept(en) aangemaakt` : 'Geen nieuwe concepten');
      await load();
    } catch (e: any) { toastError(e?.message || 'Mislukt'); }
    finally { setBusy(null); }
  }

  async function preview(it: any) {
    setBusy('prev-' + it.id);
    try {
      const blob = await fetchContractInvoicePreview(it.contract_customer_id, it.period_from, it.period_to);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) { toastError(e?.message || 'PDF mislukt'); }
    finally { setBusy(null); }
  }

  async function approve(it: any) {
    if (!confirm(`Factuur voor ${it.customer_name} (${fmt(it.period_from)} t/m ${fmt(it.period_to)}) definitief maken en per e-mail versturen naar ${it.customer_email || 'onbekend'}?`)) return;
    setBusy('app-' + it.id);
    try {
      const inv = await api.contractCustomers.finalizeInvoice(it.contract_customer_id, it.period_from, it.period_to) as any;
      await api.contractInvoices.sendEmail(inv.id);
      await api.pendingContractInvoices.markApproved(it.id, inv.invoice_number);
      toast(`Factuur ${inv.invoice_number} aangemaakt en verstuurd`);
      await load();
    } catch (e: any) { toastError(e?.message || 'Goedkeuren mislukt'); }
    finally { setBusy(null); }
  }

  async function reject(it: any) {
    if (!confirm('Dit concept afwijzen?')) return;
    setBusy('rej-' + it.id);
    try { await api.pendingContractInvoices.reject(it.id); toast('Afgewezen'); await load(); }
    catch (e: any) { toastError(e?.message || 'Mislukt'); }
    finally { setBusy(null); }
  }

  const btn: React.CSSProperties = { border: 'none', borderRadius: 7, padding: '7px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' };

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 900 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Facturen goedkeuren</h1>
          <button onClick={generate} disabled={!!busy} style={{ ...btn, background: '#142440', color: 'white', opacity: busy === 'run' ? 0.6 : 1 }}>
            {busy === 'run' ? 'Bezig…' : 'Concepten nu genereren'}
          </button>
        </div>
        <p style={{ margin: '0 0 22px', fontSize: 13, color: '#7090b0' }}>
          Automatisch aangemaakte contractfacturen die op goedkeuring wachten. <strong>Goedkeuren</strong> maakt de definitieve factuur aan en mailt de PDF naar de klant.
        </p>

        {loading ? (
          <div style={{ color: '#7090b0', fontSize: 14 }}>Laden…</div>
        ) : items.length === 0 ? (
          <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.1)', borderRadius: 12, padding: '28px', textAlign: 'center', color: '#7090b0', fontSize: 14 }}>
            Geen facturen te beoordelen.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map(it => (
              <div key={it.id} style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(10,34,64,0.05)' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#0a2240', fontSize: 15 }}>{it.customer_name}</div>
                  <div style={{ fontSize: 13, color: '#556070', marginTop: 2 }}>{fmt(it.period_from)} t/m {fmt(it.period_to)}</div>
                  <div style={{ fontSize: 12, color: it.customer_email ? '#7090b0' : '#a32020', marginTop: 2 }}>{it.customer_email || '⚠️ geen e-mailadres'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => preview(it)} disabled={!!busy} style={{ ...btn, background: '#eef2f7', color: '#142440' }}>{busy === 'prev-' + it.id ? '…' : 'Bekijk PDF'}</button>
                  <button onClick={() => approve(it)} disabled={!!busy || !it.customer_email} style={{ ...btn, background: '#137a4f', color: 'white', opacity: (!it.customer_email) ? 0.5 : 1 }}>{busy === 'app-' + it.id ? 'Bezig…' : 'Goedkeuren & versturen'}</button>
                  <button onClick={() => reject(it)} disabled={!!busy} style={{ ...btn, background: '#fbeaea', color: '#a32020' }}>{busy === 'rej-' + it.id ? '…' : 'Afwijzen'}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
