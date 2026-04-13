'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function EmailsPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => { api.emailTemplates.list().then(setTemplates); }, []);

  async function openEdit(slug: string) {
    const t = await api.emailTemplates.get(slug);
    setEditing(t);
    setSubject(t.subject);
    setBody(t.body_html);
  }

  async function sendTest() {
    if (!editing || !testEmail) return;
    setSendingTest(true);
    try {
      await api.emailTemplates.sendTest(editing.slug, testEmail);
      toast(`Testmail verstuurd naar ${testEmail} ✓`);
    } catch (e: any) { toastError(e.message); }
    finally { setSendingTest(false); }
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      await api.emailTemplates.update(editing.slug, subject, body);
      toast('Sjabloon opgeslagen ✓');
      setEditing(null);
      const updated = await api.emailTemplates.list();
      setTemplates(updated);
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  const VARS = ['voornaam', 'reference', 'aankomst_datum', 'vertrek_datum', 'kentekenlijst',
    'veerboot_heen', 'vertrektijd_heen', 'veerboot_terug', 'vertrektijd_terug',
    'totaal_bedrag', 'annuleringslink', 'wijzigingslink', 'whatsapp_nummer',
    'kenteken', 'inchecktijd', 'vaknummer', 'extra_bericht',
    'restitutie_bedrag', 'restitutie_pct', 'nieuwe_aankomst', 'nieuw_vertrek'];

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 900 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>E-mailsjablonen</h1>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#7090b0' }}>
          Alle automatische e-mails zijn hier volledig aanpasbaar. Gebruik {'{{variabele}}'} voor dynamische waarden.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {templates.map(t => (
            <div key={t.slug} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0a2240', marginBottom: 2 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: '#7090b0' }}>{t.description}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t.slug)}>✎ Bewerken</button>
            </div>
          ))}
        </div>

        {/* Variables reference */}
        <div style={{ marginTop: 20, padding: '14px 16px', background: '#f4f6f9', borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0a2240', marginBottom: 8 }}>Beschikbare variabelen:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {VARS.map(v => (
              <code key={v} style={{ fontSize: 11, background: 'white', border: '0.5px solid rgba(10,34,64,0.15)', borderRadius: 4, padding: '2px 6px', color: '#0a7c6e', cursor: 'pointer' }}
                onClick={() => navigator.clipboard.writeText(`{{${v}}}`).then(() => toast(`{{${v}}} gekopieerd`))}>
                {`{{${v}}}`}
              </code>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#7090b0', marginTop: 6 }}>Klik om te kopiëren.</div>
        </div>
      </div>

      {/* Edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`✎ ${editing?.name}`} width={720}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Onderwerp</label>
          <input value={subject} onChange={e => setSubject(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14 }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>HTML inhoud</label>
            <button className="btn btn-ghost btn-sm" onClick={() => setPreview(!preview)}>{preview ? 'HTML' : 'Voorbeeld'}</button>
          </div>
          {preview ? (
            <div style={{ border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, padding: 16, minHeight: 300, background: '#f8f9fb' }}
              dangerouslySetInnerHTML={{ __html: body }} />
          ) : (
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={14}
              style={{ width: '100%', padding: '9px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }} />
          )}
        </div>

        {/* Testmail */}
        <div style={{ borderTop: '0.5px solid rgba(10,34,64,0.1)', paddingTop: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Testmail versturen</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="email"
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              placeholder="ontvanger@email.nl"
              style={{ flex: 1, padding: '8px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 13 }}
            />
            <button className="btn btn-ghost btn-sm" onClick={sendTest} disabled={sendingTest || !testEmail}
              style={{ whiteSpace: 'nowrap' }}>
              {sendingTest ? 'Versturen...' : '📧 Verstuur test'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#7090b0', marginTop: 5 }}>
            Verstuurt het sjabloon met voorbeelddata naar het opgegeven adres.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Annuleren</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
        </div>
      </Modal>
    </AdminLayout>
  );
}
