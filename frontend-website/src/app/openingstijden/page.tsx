import type { Metadata } from 'next';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { getContent, whatsappUrl } from '../lib/content';
import { IconWhatsApp, IconMail } from '../components/icons';

const BOOKING_URL = 'https://booking.parkeren-harlingen.nl/boeken';
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Openingstijden',
  description: 'Openingstijden van Autostalling De Bazuin Harlingen. Bekijk wanneer u bij ons terecht kunt voor het in- en uitrijden van uw voertuig.',
  alternates: { canonical: 'https://booking.parkeren-harlingen.nl/openingstijden' },
};

export default async function OpeningstijdenPage() {
  const content = await getContent();
  const { openingHours, contact } = content;
  const waLink = whatsappUrl(contact.whatsapp);

  const days: { key: keyof typeof openingHours; label: string }[] = [
    { key: 'monday', label: 'Maandag' },
    { key: 'tuesday', label: 'Dinsdag' },
    { key: 'wednesday', label: 'Woensdag' },
    { key: 'thursday', label: 'Donderdag' },
    { key: 'friday', label: 'Vrijdag' },
    { key: 'saturday', label: 'Zaterdag' },
    { key: 'sunday', label: 'Zondag' },
  ];

  return (
    <>
      <Header />
      <section style={{ background: 'linear-gradient(135deg, #142440 0%, #19499e 100%)', paddingTop: 120, paddingBottom: 80, textAlign: 'center' }}>
        <div className="container">
          <div style={{ color: 'var(--cyan)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>WANNEER BENT U WELKOM</div>
          <h1 style={{ color: 'white', fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,56px)', marginBottom: 16 }}>Openingstijden</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 18, maxWidth: 520, margin: '0 auto' }}>Wij zijn zeven dagen per week geopend. Let op: buiten openingstijden is in- en uitrijden niet mogelijk.</p>
        </div>
      </section>

      <section style={{ background: 'var(--gray)' }}>
        <div className="container" style={{ maxWidth: 700 }}>
          <div style={{ background: 'white', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 16px rgba(20,36,64,0.08)', marginBottom: 20 }}>
            <div style={{ background: 'var(--navy)', padding: '20px 28px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase' }}>Dag</span>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase' }}>Openingstijden</span>
            </div>
            {days.map((row, i) => (
              <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 28px', background: i % 2 === 0 ? 'white' : '#fafbfc', borderBottom: '1px solid var(--gray-mid)' }}>
                <span style={{ fontWeight: 600, color: 'var(--navy)', fontSize: 16 }}>{row.label}</span>
                <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 16 }}>{openingHours[row.key] as string}</span>
              </div>
            ))}
          </div>

          {openingHours.note && (
            <div style={{ background: '#fff4e0', border: '1px solid #f5c07a', borderRadius: 12, padding: '16px 20px', marginBottom: 28, fontSize: 14, color: '#7a4a00' }}>
              <strong>⚠️ Let op:</strong> {openingHours.note}
            </div>
          )}

          <div style={{ background: 'var(--navy)', borderRadius: 16, padding: '32px', color: 'white' }}>
            <h3 style={{ color: 'var(--cyan)', fontFamily: 'var(--font-heading)', marginBottom: 16 }}>Heeft u een vraag over de openingstijden?</h3>
            <p style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, marginBottom: 20 }}>Neem gerust contact op via WhatsApp. We helpen u graag bij het plannen van uw vakantie.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><IconWhatsApp /> WhatsApp {contact.phoneDisplay}</a>
              <a href={`mailto:${contact.email}`} className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.4)', display: 'inline-flex', alignItems: 'center', gap: 8 }}><IconMail size={18} /> E-mail</a>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: 'white', padding: '60px 0', textAlign: 'center' }}>
        <div className="container">
          <h2 style={{ marginBottom: 16 }}>Alvast een plek reserveren?</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 28, maxWidth: 400, margin: '0 auto 28px' }}>Reserveer online en ontvang direct een bevestiging. U bent zeker van uw plek.</p>
          <a href={BOOKING_URL} className="btn btn-navy btn-lg">Reserveer nu →</a>
        </div>
      </section>

      <Footer content={content} />
    </>
  );
}
