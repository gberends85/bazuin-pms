import type { Metadata } from 'next';
import Header from '../components/Header';
import Footer from '../components/Footer';
import type { CSSProperties } from 'react';
import { getContent, whatsappUrl } from '../lib/content';
import { IconWhatsApp, IconMapPin, IconMap, IconCar, IconBoat } from '../components/icons';

const BOOKING_URL = 'https://booking.parkeren-harlingen.nl/boeken';
export const revalidate = 60;

const iconWrap: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, verticalAlign: 'middle' };

export const metadata: Metadata = {
  title: 'Route & Locatie',
  description: 'Routebeschrijving naar Autostalling De Bazuin in Harlingen. Op loopafstand van de veerboten naar Terschelling en Vlieland.',
  alternates: { canonical: 'https://booking.parkeren-harlingen.nl/route' },
};

export default async function RoutePage() {
  const content = await getContent();
  const { contact, business } = content;
  const waLink = whatsappUrl(contact.whatsapp);
  const mapsQuery = encodeURIComponent(`${contact.address}, ${contact.postalCode} ${contact.city}`);

  return (
    <>
      <Header />
      <section style={{ background: 'linear-gradient(135deg, #142440 0%, #19499e 100%)', paddingTop: 120, paddingBottom: 80, textAlign: 'center' }}>
        <div className="container">
          <div style={{ color: 'var(--cyan)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>ROUTE & LOCATIE</div>
          <h1 style={{ color: 'white', fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,56px)', marginBottom: 16 }}>Hoe rijdt u naar ons toe?</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 18, maxWidth: 520, margin: '0 auto' }}>
            {business.name} is eenvoudig te bereiken via de A31 en N31.
          </p>
        </div>
      </section>

      <div style={{ height: 450, width: '100%' }}>
        <iframe
          title={`Autoroute vanaf de veerbootterminal naar ${business.name}`}
          src="https://maps.google.com/maps?saddr=53.176571,5.415205&daddr=Zeilmakersstraat+2,+8861+SE+Harlingen&dirflg=d&output=embed"
          width="100%" height="450" style={{ border: 0, display: 'block' }}
          allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      <section style={{ background: 'var(--gray)' }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 40 }}>
            <div style={{ background: 'white', borderRadius: 16, padding: '32px', boxShadow: '0 2px 12px rgba(20,36,64,0.07)' }}>
              <h2 style={{ fontSize: 22, marginBottom: 20, ...iconWrap }}><IconMapPin size={22} color="var(--blue)" /> Ons adres</h2>
              <div style={{ fontSize: 18, lineHeight: 2, color: 'var(--navy)', fontWeight: 600 }}>
                {contact.address}<br />
                {contact.postalCode} {contact.city}
              </div>
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <a href={`https://maps.google.com/?q=${mapsQuery}`} target="_blank" rel="noopener noreferrer" className="btn btn-navy" style={{ justifyContent: 'center', ...iconWrap }}><IconMapPin size={18} /> Google Maps</a>
                <a href={`https://maps.apple.com/?q=${mapsQuery}`} target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ justifyContent: 'center', ...iconWrap }}><IconMap size={18} /> Apple Maps</a>
              </div>
            </div>

            <div>
              <h2 style={{ fontSize: 22, marginBottom: 20, ...iconWrap }}><IconCar size={22} color="var(--blue)" /> Routebeschrijving</h2>
              {[
                { from: 'Vanuit het zuiden (Amsterdam, Utrecht)', steps: 'A7 richting Leeuwarden → A31 richting Harlingen → afrit Harlingen → N31 → richting centrum → volg borden.' },
                { from: 'Vanuit Leeuwarden / Groningen', steps: 'A31 richting Harlingen → afrit Harlingen-Noord → volg borden centrum.' },
                { from: 'Navigatie', steps: `Voer in: ${contact.address}, ${contact.city}. Uw navigatiesysteem leidt u direct naar de stalling.` },
              ].map(item => (
                <div key={item.from} style={{ background: 'var(--gray)', borderRadius: 10, padding: '16px 20px', marginBottom: 12, borderLeft: '3px solid var(--cyan)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 6, fontSize: 14 }}>{item.from}</div>
                  <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7 }}>{item.steps}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 40, background: 'var(--navy)', borderRadius: 16, padding: '32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 20 }}>
            <div style={{ color: 'white' }}>
              <h3 style={{ color: 'var(--cyan)', marginBottom: 12, ...iconWrap }}><IconBoat size={20} color="var(--cyan)" /> Afstand tot veerboot</h3>
              <p style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, fontSize: 15 }}>
                De stalling ligt op slechts <strong style={{ color: 'white' }}>{business.distanceToFerry}</strong> van de Rederij Doeksen veerboten.
              </p>
            </div>
            {[
              { label: 'Veerboot Terschelling', afstand: '300 m', tijd: '~4 min lopen' },
              { label: 'Veerboot Vlieland', afstand: '350 m', tijd: '~4 min lopen' },
              { label: 'Centrum Harlingen', afstand: '600 m', tijd: '~8 min lopen' },
            ].map(item => (
              <div key={item.label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '16px', border: '1px solid rgba(74,200,237,0.15)' }}>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', color: 'var(--cyan)', fontSize: 28 }}>{item.afstand}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{item.tijd}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: 'white', padding: '60px 0', textAlign: 'center' }}>
        <div className="container">
          <h2 style={{ marginBottom: 16 }}>Vragen over de route?</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 28 }}>Stuur een WhatsApp en we helpen u de weg te vinden.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-navy" style={{ ...iconWrap }}><IconWhatsApp /> WhatsApp {contact.phoneDisplay}</a>
            <a href={BOOKING_URL} className="btn btn-primary">Reserveer nu →</a>
          </div>
        </div>
      </section>

      <Footer content={content} />
    </>
  );
}
