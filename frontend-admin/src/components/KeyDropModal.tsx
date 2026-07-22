'use client';
import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';

// WhatsApp-deeplink: NL-nummers (0…) -> 31…, internationale 00.. -> ..
function waLink(phone: string, text: string): string {
  let d = (phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '31' + d.slice(1);
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

// "Sleutel in kluis doen" voor een contractklant (bv. Sixt): blokkeert een kluis
// met dit kenteken (mini-reservering) en genereert een afhaalcode. Zodra de code
// wordt ingetoetst geldt dat als de exacte afhaaltijd van deze auto.
export default function KeyDropModal({
  open, onClose, onDone, customerId, customerName, plate, stayId, defaultPhone, departureDate,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  customerId: string;
  customerName: string;
  plate: string;
  stayId?: number | string | null;
  defaultPhone?: string;
  departureDate?: string;
}) {
  const [locker, setLocker] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [occupied, setOccupied] = useState<Set<string>>(new Set());
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!open) return;
    setLocker(''); setBusy(false); setCode('');
    setPhone(defaultPhone || '');
    const today = new Date().toISOString().slice(0, 10);
    api.reservations.today(today).then((d: any) => {
      const rows = [...(d?.departures || []), ...(d?.arrivals || [])];
      setOccupied(new Set(rows.filter((r: any) => r.parking_spot && !r.locker_collected_at).map((r: any) => String(r.parking_spot))));
    }).catch(() => setOccupied(new Set()));
  }, [open, defaultPhone]);

  async function submit() {
    if (!locker) { toastError('Kies een kluis'); return; }
    setBusy(true);
    try {
      const created = await api.contractCustomers.keyDrop(customerId, {
        licensePlate: plate,
        phone: phone.trim() || undefined,
        lockerNumber: Number(locker),
        departureDate,
        stayId: stayId ?? undefined,
      } as any);
      let c = '';
      try { const r = await api.reservations.assignLockerCode(created.id); c = r.code; }
      catch (e: any) { toastError('Kluisblok gemaakt, maar code aanmaken mislukte: ' + (e?.message || '')); }
      if (c) { setCode(c); toast(`Kluis ${locker} · code ${c}`); }
      else { toast(`Kluis ${locker} geblokkeerd`); }
      onDone();
    } catch (e: any) { toastError(e?.message || 'Aanmaken mislukt'); }
    finally { setBusy(false); }
  }

  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 5 };
  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, fontSize: 14, color: '#0a2240', boxSizing: 'border-box' };
  const waMsg = code ? `Uw afhaalcode voor de autosleutel bij Autostalling De Bazuin: ${code} (kluis ${locker}). Toets de code in op het kluisje om de sleutel op te halen.` : '';

  return (
    <Modal open={open} onClose={onClose} title="Sleutel in kluis doen">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: '#f4f6f9', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
          <div><span style={{ color: '#7090b0' }}>Contractklant:</span> <strong>{customerName}</strong></div>
          <div style={{ marginTop: 2 }}><span style={{ color: '#7090b0' }}>Kenteken:</span> <strong style={{ fontFamily: 'monospace', letterSpacing: '1px' }}>{plate}</strong></div>
        </div>

        {!code ? (
          <>
            <div>
              <label style={lbl}>Kluis</label>
              <select value={locker} onChange={e => setLocker(e.target.value)} style={inp}>
                <option value="">— kies een vrije kluis —</option>
                {[1, 2, 3, 4, 5, 6, 7].map(n => (
                  <option key={n} value={n} disabled={occupied.has(String(n))}>{n}{occupied.has(String(n)) ? ' — bezet' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}>Telefoon (code via WhatsApp)</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0612345678" style={inp} />
            </div>
            <div style={{ fontSize: 12, color: '#7090b0', lineHeight: 1.5 }}>
              De kluis wordt geblokkeerd met dit kenteken (zichtbaar in de reserveringslijst als {customerName}) en er wordt een afhaalcode gegenereerd. Zodra de code wordt ingetoetst, geldt dat als de exacte afhaaltijd van deze auto.
            </div>
            <button onClick={submit} disabled={busy}
              style={{ width: '100%', padding: '11px', borderRadius: 8, background: busy ? '#9bb0c8' : '#0a2240', color: 'white', border: 'none', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
              {busy ? 'Bezig…' : 'In kluis doen + code aanmaken'}
            </button>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', padding: '6px 0' }}>
              <div style={{ fontSize: 11, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Afhaalcode · kluis {locker}</div>
              <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: '4px', color: '#0a2240' }}>{code}</div>
            </div>
            {phone.trim() && (
              <a href={waLink(phone, waMsg)} target="_blank" rel="noreferrer"
                style={{ display: 'block', textAlign: 'center', padding: '11px', borderRadius: 8, background: '#25D366', color: 'white', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                Code via WhatsApp sturen
              </a>
            )}
            <button onClick={() => { onDone(); onClose(); }}
              style={{ width: '100%', padding: '10px', borderRadius: 8, background: 'white', color: '#0a2240', border: '0.5px solid rgba(10,34,64,0.2)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Klaar
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
