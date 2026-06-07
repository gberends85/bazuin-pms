'use client';
import { useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function WachtwoordPage() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) { toastError('Nieuw wachtwoord moet minimaal 8 tekens zijn'); return; }
    if (next !== confirm) { toastError('De nieuwe wachtwoorden komen niet overeen'); return; }
    setSaving(true);
    try {
      await api.auth.changePassword(current, next);
      toast('Wachtwoord gewijzigd');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err: any) {
      toastError(err.message || 'Wijzigen mislukt');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #d4d9e0',
    fontSize: 14, marginTop: 4,
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#0a2240' };

  return (
    <AdminLayout>
      <Toaster />
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0a2240', marginBottom: 4 }}>Wachtwoord wijzigen</h1>
      <p style={{ color: '#667', fontSize: 13, marginBottom: 20 }}>
        Wijzig het wachtwoord van je eigen beheerdersaccount.
      </p>

      <form onSubmit={submit} style={{ maxWidth: 420, background: 'white', border: '1px solid #e6e9ef', borderRadius: 12, padding: 20 }}>
        <label style={labelStyle}>Huidig wachtwoord
          <input type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" required style={inputStyle} />
        </label>
        <div style={{ height: 14 }} />
        <label style={labelStyle}>Nieuw wachtwoord (min. 8 tekens)
          <input type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" required minLength={8} style={inputStyle} />
        </label>
        <div style={{ height: 14 }} />
        <label style={labelStyle}>Bevestig nieuw wachtwoord
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required style={inputStyle} />
        </label>
        <div style={{ height: 20 }} />
        <button type="submit" disabled={saving}
          style={{ background: '#0a2240', color: 'white', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Bezig…' : 'Wachtwoord wijzigen'}
        </button>
      </form>
    </AdminLayout>
  );
}
