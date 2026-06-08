'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { EyeIcon, PencilSquareIcon } from '@heroicons/react/24/outline';

export default function VoorwaardenSettingsPage() {
  const [text, setText] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    api.settings.get()
      .then((s: Record<string, string>) => {
        const val = s['terms_text'] || '';
        setText(val);
        setOriginal(val);
      })
      .catch(() => toastError('Kon voorwaarden niet laden'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await api.settings.set('terms_text', text);
      setOriginal(text);
      toast('Voorwaarden opgeslagen ✓');
    } catch (e: any) {
      toastError(e.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  const isDirty = text !== original;

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 920 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Algemene Voorwaarden</h1>
            <p style={{ margin: 0, fontSize: 13, color: '#7090b0' }}>
              De tekst die klanten te zien krijgen via de link "algemene voorwaarden" op de reserveringspagina.
              HTML-opmaak is ondersteund.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 16 }}>
            <a
              href="https://www.parkeren-harlingen.nl/boeken/voorwaarden"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '0.5px solid rgba(10,34,64,0.2)', background: 'white', fontSize: 13, fontWeight: 600, color: '#0a2240', textDecoration: 'none', cursor: 'pointer' }}
            >
              <EyeIcon style={{ width: 16, height: 16 }} />
              Live bekijken
            </a>
          </div>
        </div>

        {/* Tabs: Bewerken / Voorbeeld */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
          {[
            { id: false, icon: PencilSquareIcon, label: 'Bewerken' },
            { id: true, icon: EyeIcon, label: 'Voorbeeld' },
          ].map(tab => (
            <button
              key={String(tab.id)}
              onClick={() => setPreview(tab.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                background: preview === tab.id ? '#0a2240' : 'rgba(10,34,64,0.06)',
                color: preview === tab.id ? 'white' : '#0a2240',
              }}
            >
              <tab.icon style={{ width: 15, height: 15 }} />
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#7090b0' }}>Laden…</div>
        ) : preview ? (
          /* ── Voorbeeld ── */
          <div style={{ background: 'white', borderRadius: 12, border: '0.5px solid rgba(10,34,64,0.1)', padding: '28px 32px', minHeight: 400, boxShadow: '0 1px 4px rgba(10,34,64,0.06)' }}>
            {text ? (
              <div
                style={{ fontSize: 14, lineHeight: 1.75, color: '#1a2e48' }}
                dangerouslySetInnerHTML={{ __html: text }}
              />
            ) : (
              <div style={{ color: '#aab8c8', fontStyle: 'italic' }}>Geen tekst ingevoerd.</div>
            )}
          </div>
        ) : (
          /* ── Editor ── */
          <div>
            <div style={{ background: '#fff8e1', border: '0.5px solid #f0c040', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#7a5010' }}>
              <strong>HTML-tips:</strong> Gebruik <code>&lt;h2&gt;</code>, <code>&lt;h3&gt;</code> voor koppen, <code>&lt;p&gt;</code> voor alinea's, <code>&lt;strong&gt;</code> voor vet, <code>&lt;br&gt;</code> voor regeleinde, <code>&lt;a href="..."&gt;</code> voor links.
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={30}
              style={{
                width: '100%',
                padding: '14px 16px',
                border: '0.5px solid rgba(10,34,64,0.18)',
                borderRadius: 10,
                fontSize: 13,
                fontFamily: 'Monaco, Menlo, Consolas, monospace',
                lineHeight: 1.6,
                color: '#1a2e48',
                background: 'white',
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              placeholder="Voer hier de HTML-tekst van de algemene voorwaarden in..."
            />
          </div>
        )}

        {/* Actiebalk */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <div style={{ fontSize: 12, color: isDirty ? '#e8a020' : '#7090b0', fontWeight: isDirty ? 700 : 400 }}>
            {isDirty ? '● Niet-opgeslagen wijzigingen' : 'Alles opgeslagen'}
          </div>
          <button
            onClick={save}
            disabled={saving || !isDirty}
            style={{
              padding: '10px 24px', borderRadius: 9, border: 'none', cursor: saving || !isDirty ? 'not-allowed' : 'pointer',
              background: isDirty ? '#0a7c6e' : 'rgba(10,34,64,0.08)',
              color: isDirty ? 'white' : '#7090b0',
              fontSize: 14, fontWeight: 700,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>

      </div>
    </AdminLayout>
  );
}
