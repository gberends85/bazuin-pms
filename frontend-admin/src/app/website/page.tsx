'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Home, Lightbulb, X } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────
interface ContactData {
  address: string; postalCode: string; city: string;
  phone: string; phoneDisplay: string; whatsapp: string; email: string;
}
interface BusinessData {
  name: string; tagline: string; description: string;
  foundingYear: string; totalSpots: number; distanceToFerry: string;
}
interface OpeningHours {
  monday: string; tuesday: string; wednesday: string;
  thursday: string; friday: string; saturday: string; sunday: string;
  note: string;
}
interface HeroData { title: string; subtitle: string; }
interface PricingRow { label: string; price: string; highlight: boolean; }
interface UspRow { icon: string; title: string; desc: string; }
interface FaqRow { q: string; a: string; }
interface WebsiteContent {
  contact: ContactData;
  business: BusinessData;
  openingHours: OpeningHours;
  hero: HeroData;
  pricing: PricingRow[];
  usp: UspRow[];
  faq: FaqRow[];
}

const TABS = [
  { id: 'contact', label: '📍 Contact' },
  { id: 'hero', label: 'Hero tekst' },
  { id: 'usp', label: '✅ Voordelen' },
  { id: 'pricing', label: '💶 Tarieven' },
  { id: 'hours', label: '🕐 Openingstijden' },
  { id: 'faq', label: '❓ FAQ' },
];

const DEFAULT: WebsiteContent = {
  contact: { address: '', postalCode: '', city: '', phone: '', phoneDisplay: '', whatsapp: '', email: '' },
  business: { name: '', tagline: '', description: '', foundingYear: '', totalSpots: 55, distanceToFerry: '' },
  openingHours: { monday: '', tuesday: '', wednesday: '', thursday: '', friday: '', saturday: '', sunday: '', note: '' },
  hero: { title: '', subtitle: '' },
  pricing: [],
  usp: [],
  faq: [],
};

// ── Shared input styles ──────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', border: '1px solid #d0d8e4',
  borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
  background: 'white', outline: 'none', boxSizing: 'border-box',
};
const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: 'vertical', minHeight: 90, lineHeight: 1.6,
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: '#5a6b80',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5,
};
const fieldStyle: React.CSSProperties = { marginBottom: 18 };
const sectionTitle: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, color: '#142440', marginBottom: 20,
  paddingBottom: 12, borderBottom: '2px solid #e8edf3',
};
const rowCard: React.CSSProperties = {
  background: '#f8fafc', border: '1px solid #e8edf3', borderRadius: 10,
  padding: '16px', marginBottom: 12, position: 'relative',
};

// ── Sub-forms ────────────────────────────────────────────────
function Field({ label, value, onChange, type = 'text', hint }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; hint?: string;
}) {
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>{label}</label>
      <input type={type} style={inputStyle} value={value} onChange={e => onChange(e.target.value)} />
      {hint && <div style={{ fontSize: 12, color: '#8a9ab0', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
function TextArea({ label, value, onChange, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number;
}) {
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>{label}</label>
      <textarea style={{ ...textareaStyle, minHeight: rows * 28 }} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

// ── Tab: Contact ─────────────────────────────────────────────
function ContactTab({ data, onChange }: { data: WebsiteContent; onChange: (d: WebsiteContent) => void }) {
  const set = (field: keyof ContactData, v: string) =>
    onChange({ ...data, contact: { ...data.contact, [field]: v } });
  const setBiz = (field: keyof BusinessData, v: string | number) =>
    onChange({ ...data, business: { ...data.business, [field]: v } });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 32 }}>
      <div>
        <div style={sectionTitle}>Contactgegevens</div>
        <Field label="Straat + huisnummer" value={data.contact.address} onChange={v => set('address', v)} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Postcode" value={data.contact.postalCode} onChange={v => set('postalCode', v)} />
          <Field label="Stad" value={data.contact.city} onChange={v => set('city', v)} />
        </div>
        <Field label="Telefoonnummer (kaal, bijv. 0517412986)" value={data.contact.phone} onChange={v => set('phone', v)}
          hint="Wordt gebruikt voor tel: links en WhatsApp" />
        <Field label="Telefoonnummer (weergave, bijv. 0517 – 41 29 86)" value={data.contact.phoneDisplay} onChange={v => set('phoneDisplay', v)} />
        <Field label="WhatsApp nummer (met landcode, bijv. 31517412986)" value={data.contact.whatsapp} onChange={v => set('whatsapp', v)} />
        <Field label="E-mailadres" value={data.contact.email} onChange={v => set('email', v)} type="email" />
      </div>
      <div>
        <div style={sectionTitle}>Bedrijfsgegevens</div>
        <Field label="Bedrijfsnaam" value={data.business.name} onChange={v => setBiz('name', v)} />
        <Field label="Tagline (ondertitel)" value={data.business.tagline} onChange={v => setBiz('tagline', v)} />
        <TextArea label="Korte omschrijving" value={data.business.description} onChange={v => setBiz('description', v)} rows={4} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Opgericht in jaar" value={data.business.foundingYear} onChange={v => setBiz('foundingYear', v)} />
          <Field label="Afstand tot veerboot" value={data.business.distanceToFerry} onChange={v => setBiz('distanceToFerry', v)} hint="bijv. 300m" />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Aantal parkeerplaatsen</label>
          <input type="number" style={inputStyle} value={data.business.totalSpots}
            onChange={e => setBiz('totalSpots', Number(e.target.value))} />
        </div>
      </div>
    </div>
  );
}

// ── Tab: Hero ────────────────────────────────────────────────
function HeroTab({ data, onChange }: { data: WebsiteContent; onChange: (d: WebsiteContent) => void }) {
  const set = (field: keyof HeroData, v: string) =>
    onChange({ ...data, hero: { ...data.hero, [field]: v } });
  return (
    <div style={{ maxWidth: 700 }}>
      <div style={sectionTitle}>Hero sectie (bovenste blok van de website)</div>
      <TextArea label="Hoofdtitel" value={data.hero.title} onChange={v => set('title', v)} rows={2} />
      <TextArea label="Ondertitel / beschrijving" value={data.hero.subtitle} onChange={v => set('subtitle', v)} rows={3} />
      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#0369a1' }}>
        <><Lightbulb size={13} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />De hero is het eerste wat bezoekers zien. Houd de tekst kort en krachtig. Noem de locatie en de afstand tot de veerboot.</>
      </div>
    </div>
  );
}

// ── Tab: USPs ────────────────────────────────────────────────
function UspTab({ data, onChange }: { data: WebsiteContent; onChange: (d: WebsiteContent) => void }) {
  const setUsp = (i: number, field: keyof UspRow, v: string) => {
    const next = [...data.usp];
    next[i] = { ...next[i], [field]: v };
    onChange({ ...data, usp: next });
  };
  const addUsp = () => onChange({ ...data, usp: [...data.usp, { icon: '✅', title: '', desc: '' }] });
  const removeUsp = (i: number) => onChange({ ...data, usp: data.usp.filter((_, idx) => idx !== i) });

  return (
    <div>
      <div style={sectionTitle}>Voordelen / USP's</div>
      {data.usp.map((usp, i) => (
        <div key={i} style={rowCard}>
          <button onClick={() => removeUsp(i)} style={{
            position: 'absolute', top: 10, right: 12, background: 'none', border: 'none',
            color: '#e24b4a', cursor: 'pointer', fontSize: 18, lineHeight: 1,
          }}><X size={14} style={{ display:'inline', verticalAlign:'middle' }} /></button>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 12, marginBottom: 10 }}>
            <Field label="Icoon (emoji)" value={usp.icon} onChange={v => setUsp(i, 'icon', v)} />
            <Field label="Titel" value={usp.title} onChange={v => setUsp(i, 'title', v)} />
          </div>
          <TextArea label="Beschrijving" value={usp.desc} onChange={v => setUsp(i, 'desc', v)} rows={2} />
        </div>
      ))}
      <button onClick={addUsp} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
        background: '#eaf7fb', border: '1.5px dashed #4ac8ed', borderRadius: 8,
        color: '#0fa8cc', fontWeight: 700, cursor: 'pointer', fontSize: 14,
      }}>+ Voordeel toevoegen</button>
    </div>
  );
}

// ── Tab: Pricing ─────────────────────────────────────────────
function PricingTab({ data, onChange }: { data: WebsiteContent; onChange: (d: WebsiteContent) => void }) {
  const setRow = (i: number, field: keyof PricingRow, v: string | boolean) => {
    const next = [...data.pricing];
    next[i] = { ...next[i], [field]: v };
    onChange({ ...data, pricing: next });
  };
  const addRow = () => onChange({ ...data, pricing: [...data.pricing, { label: '', price: '', highlight: false }] });
  const removeRow = (i: number) => onChange({ ...data, pricing: data.pricing.filter((_, idx) => idx !== i) });

  return (
    <div>
      <div style={sectionTitle}>Tarieven overzicht</div>
      {data.pricing.map((row, i) => (
        <div key={i} style={{ ...rowCard, borderColor: row.highlight ? '#4ac8ed' : '#e8edf3' }}>
          <button onClick={() => removeRow(i)} style={{
            position: 'absolute', top: 10, right: 12, background: 'none', border: 'none',
            color: '#e24b4a', cursor: 'pointer', fontSize: 18, lineHeight: 1,
          }}><X size={14} style={{ display:'inline', verticalAlign:'middle' }} /></button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
            <Field label="Omschrijving (bijv. 4 – 7 dagen)" value={row.label} onChange={v => setRow(i, 'label', v)} />
            <Field label="Prijs per dag (bijv. 8.75)" value={row.price} onChange={v => setRow(i, 'price', v)} />
            <div style={fieldStyle}>
              <label style={labelStyle}>Uitgelicht</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6 }}>
                <input type="checkbox" checked={row.highlight} onChange={e => setRow(i, 'highlight', e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }} />
                <span style={{ fontSize: 13, color: '#5a6b80' }}>Populairste</span>
              </div>
            </div>
          </div>
        </div>
      ))}
      <button onClick={addRow} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
        background: '#eaf7fb', border: '1.5px dashed #4ac8ed', borderRadius: 8,
        color: '#0fa8cc', fontWeight: 700, cursor: 'pointer', fontSize: 14,
      }}>+ Tariefrow toevoegen</button>
      <div style={{ marginTop: 16, fontSize: 13, color: '#8a9ab0' }}>
        Bedragen inclusief BTW. Worden weergegeven als bijv. "€ 8,75 per dag".
      </div>
    </div>
  );
}

// ── Tab: Opening Hours ────────────────────────────────────────
function HoursTab({ data, onChange }: { data: WebsiteContent; onChange: (d: WebsiteContent) => void }) {
  const set = (field: keyof OpeningHours, v: string) =>
    onChange({ ...data, openingHours: { ...data.openingHours, [field]: v } });

  const days: { key: keyof OpeningHours; label: string }[] = [
    { key: 'monday', label: 'Maandag' },
    { key: 'tuesday', label: 'Dinsdag' },
    { key: 'wednesday', label: 'Woensdag' },
    { key: 'thursday', label: 'Donderdag' },
    { key: 'friday', label: 'Vrijdag' },
    { key: 'saturday', label: 'Zaterdag' },
    { key: 'sunday', label: 'Zondag' },
  ];

  const copyToAll = () => {
    const monday = data.openingHours.monday;
    const next = { ...data.openingHours };
    days.forEach(d => { next[d.key] = monday; });
    onChange({ ...data, openingHours: next });
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={sectionTitle}>Openingstijden per dag</div>
      {days.map(day => (
        <div key={day.key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <label style={{ fontWeight: 600, color: '#142440', fontSize: 14 }}>{day.label}</label>
          <input style={inputStyle} value={data.openingHours[day.key] as string}
            onChange={e => set(day.key, e.target.value)}
            placeholder="bijv. 07:00 – 22:00 of Gesloten" />
        </div>
      ))}
      <button onClick={copyToAll} style={{
        marginTop: 4, marginBottom: 20, padding: '8px 16px',
        background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 7,
        color: '#166534', fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}>↓ Maandagtijd kopiëren naar alle dagen</button>

      <TextArea label="Opmerking (wordt getoond op de website)" value={data.openingHours.note} onChange={v => set('note', v)} rows={2} />
    </div>
  );
}

// ── Tab: FAQ ─────────────────────────────────────────────────
function FaqTab({ data, onChange }: { data: WebsiteContent; onChange: (d: WebsiteContent) => void }) {
  const setRow = (i: number, field: keyof FaqRow, v: string) => {
    const next = [...data.faq];
    next[i] = { ...next[i], [field]: v };
    onChange({ ...data, faq: next });
  };
  const addRow = () => onChange({ ...data, faq: [...data.faq, { q: '', a: '' }] });
  const removeRow = (i: number) => onChange({ ...data, faq: data.faq.filter((_, idx) => idx !== i) });
  const moveRow = (i: number, dir: -1 | 1) => {
    const next = [...data.faq];
    const swap = i + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[i], next[swap]] = [next[swap], next[i]];
    onChange({ ...data, faq: next });
  };

  return (
    <div>
      <div style={sectionTitle}>Veelgestelde vragen</div>
      {data.faq.map((row, i) => (
        <div key={i} style={rowCard}>
          <div style={{ position: 'absolute', top: 10, right: 12, display: 'flex', gap: 4 }}>
            <button onClick={() => moveRow(i, -1)} disabled={i === 0}
              style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#ccc' : '#5a6b80', fontSize: 16 }}>↑</button>
            <button onClick={() => moveRow(i, 1)} disabled={i === data.faq.length - 1}
              style={{ background: 'none', border: 'none', cursor: i === data.faq.length - 1 ? 'default' : 'pointer', color: i === data.faq.length - 1 ? '#ccc' : '#5a6b80', fontSize: 16 }}>↓</button>
            <button onClick={() => removeRow(i)}
              style={{ background: 'none', border: 'none', color: '#e24b4a', cursor: 'pointer', fontSize: 18, lineHeight: 1, marginLeft: 4 }}><X size={14} style={{ display:'inline', verticalAlign:'middle' }} /></button>
          </div>
          <div style={{ paddingRight: 80 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8a9ab0', marginBottom: 6 }}>VRAAG {i + 1}</div>
            <Field label="Vraag" value={row.q} onChange={v => setRow(i, 'q', v)} />
            <TextArea label="Antwoord" value={row.a} onChange={v => setRow(i, 'a', v)} rows={3} />
          </div>
        </div>
      ))}
      <button onClick={addRow} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
        background: '#eaf7fb', border: '1.5px dashed #4ac8ed', borderRadius: 8,
        color: '#0fa8cc', fontWeight: 700, cursor: 'pointer', fontSize: 14,
      }}>+ Vraag toevoegen</button>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────
export default function WebsiteContentPage() {
  const [data, setData] = useState<WebsiteContent>(DEFAULT);
  const [activeTab, setActiveTab] = useState('contact');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/v1/admin/website-content', {
      headers: { Authorization: `Bearer ${localStorage.getItem('bazuin_token')}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d && d.contact) setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/v1/admin/website-content', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('bazuin_token')}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Opslaan mislukt');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  }, [data]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#5a6b80' }}>
      Inhoud laden…
    </div>
  );

  return (
    <div style={{ background: '#f4f6f9', minHeight: '100vh', padding: '0 0 60px' }}>

      {/* Header */}
      <div style={{
        background: 'white', borderBottom: '1px solid #e8edf3',
        padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 50, minHeight: 60,
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, color: '#142440' }}>Website inhoud bewerken</div>
          <div style={{ fontSize: 12, color: '#8a9ab0' }}>Wijzigingen worden direct zichtbaar op de website</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="https://booking.parkeren-harlingen.nl" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, color: '#4ac8ed', fontWeight: 600 }}>
            Website bekijken ↗
          </a>
          {error && <span style={{ color: '#e24b4a', fontSize: 13 }}>{error}</span>}
          {saved && <span style={{ color: '#0a7c6e', fontSize: 13, fontWeight: 700 }}>✓ Opgeslagen!</span>}
          <button onClick={save} disabled={saving} style={{
            background: saving ? '#8ab4c0' : '#142440',
            color: 'white', border: 'none', borderRadius: 8,
            padding: '10px 22px', fontWeight: 700, fontSize: 14, cursor: saving ? 'wait' : 'pointer',
          }}>
            {saving ? 'Opslaan…' : '💾 Opslaan'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: 'white', borderBottom: '1px solid #e8edf3', padding: '0 24px', display: 'flex', gap: 4, overflowX: 'auto' }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '14px 18px', background: 'none', border: 'none',
            borderBottom: activeTab === tab.id ? '3px solid #142440' : '3px solid transparent',
            color: activeTab === tab.id ? '#142440' : '#5a6b80',
            fontWeight: activeTab === tab.id ? 700 : 500,
            fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap',
            transition: 'all 0.15s',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ background: 'white', borderRadius: 12, padding: '28px', boxShadow: '0 1px 6px rgba(20,36,64,0.06)' }}>
          {activeTab === 'contact' && <ContactTab data={data} onChange={setData} />}
          {activeTab === 'hero' && <HeroTab data={data} onChange={setData} />}
          {activeTab === 'usp' && <UspTab data={data} onChange={setData} />}
          {activeTab === 'pricing' && <PricingTab data={data} onChange={setData} />}
          {activeTab === 'hours' && <HoursTab data={data} onChange={setData} />}
          {activeTab === 'faq' && <FaqTab data={data} onChange={setData} />}
        </div>

        {/* Bottom save button */}
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          {saved && <span style={{ color: '#0a7c6e', fontWeight: 700, fontSize: 14, alignSelf: 'center' }}>✓ Opgeslagen!</span>}
          <button onClick={save} disabled={saving} style={{
            background: saving ? '#8ab4c0' : '#142440',
            color: 'white', border: 'none', borderRadius: 8,
            padding: '12px 28px', fontWeight: 700, fontSize: 15, cursor: saving ? 'wait' : 'pointer',
          }}>
            {saving ? 'Opslaan…' : '💾 Opslaan en publiceren'}
          </button>
        </div>
      </div>
    </div>
  );
}
