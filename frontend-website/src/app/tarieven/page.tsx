import type { Metadata } from 'next';
import Header from '../components/Header';
import Footer from '../components/Footer';
import PriceChecker from '../components/PriceChecker';
import { getContent } from '../lib/content';
import { IconBolt, IconWhatsApp } from '../components/icons';

const BOOKING_URL = 'https://www.parkeren-harlingen.nl/boeken';
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Tarieven & Prijschecker',
  description: 'Bereken direct de actuele parkeerkosten voor uw verblijf bij Autostalling De Bazuin in Harlingen. Kies uw datums en zie meteen de exacte prijs nabij de veerboten.',
  alternates: { canonical: 'https://www.parkeren-harlingen.nl/tarieven' },
};

export default async function TarievenPage() {
  const content = await getContent();
  const { contact } = content;
  const waLink = `https://wa.me/${contact.whatsapp}`;

  return (
    <>
      <Header />

      {/* Hero */}
      <section style={{
        background: 'linear-gradient(135deg, #142440 0%, #19499e 100%)',
        paddingTop: 120, paddingBottom: 80, textAlign: 'center',
      }}>
        <div className="container">
          <div style={{ color: 'var(--cyan)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            TARIEVEN
          </div>
          <h1 style={{ color: 'white', fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,56px)', marginBottom: 16 }}>
            Wat kost het parkeren?
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 18, maxWidth: 560, margin: '0 auto' }}>
            Vul uw aankomst- en vertrekdatum in en zie direct de exacte, actuele prijs. Geen verrassingen achteraf.
          </p>
        </div>
      </section>

      {/* Prijschecker — prominent, opgetild in de hero */}
      <section style={{ background: 'var(--gray)', paddingTop: 0, paddingBottom: 64 }}>
        <div className="container" style={{ maxWidth: 860 }}>
          <div style={{ marginTop: -48 }}>
            <PriceChecker />
          </div>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, marginTop: 24, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
            Hoe langer u parkeert, hoe voordeliger het tarief per dag. Alle prijzen zijn per voertuig en inclusief 21% BTW.
            EV-laden wordt apart berekend op basis van het aantal kWh dat u bij de reservering aangeeft.
          </p>
        </div>
      </section>

      {/* Extra diensten */}
      <section style={{ background: 'white' }}>
        <div className="container" style={{ maxWidth: 800 }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ color: 'var(--cyan-dark)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>EXTRA DIENSTEN</div>
            <h2 style={{ fontSize: 'clamp(24px,3.5vw,34px)' }}>Meer dan alleen parkeren</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
            {[
              { key: 'bolt', title: 'Auto opladen', desc: 'Laad uw elektrische auto tijdens uw verblijf. U geeft bij de reservering aan hoeveel kWh u wilt bijladen; dat aantal wordt in rekening gebracht.' },
            ].map(item => (
              <div key={item.key} style={{ background: 'var(--gray)', borderRadius: 14, padding: '24px', boxShadow: '0 1px 6px rgba(20,36,64,0.06)' }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--blue-light, #eaf1fb)', color: 'var(--blue, #19499e)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <IconBolt size={26} />
                </div>
                <h3 style={{ fontSize: 16, marginBottom: 8 }}>{item.title}</h3>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Betaalmethoden */}
      <section style={{ background: 'var(--gray)' }}>
        <div className="container" style={{ maxWidth: 800, textAlign: 'center' }}>
          <div style={{ color: 'var(--cyan-dark)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>BETALEN</div>
          <h2 style={{ marginBottom: 12 }}>Betaalmethoden</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>Reserveer en betaal online, of reken af ter plekke.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { label: 'iDEAL', desc: 'Online bij reservering' },
              { label: 'Creditcard', desc: 'Visa & Mastercard' },
              { label: 'PIN', desc: 'Ter plekke' },
              { label: 'Contant', desc: 'Ter plekke' },
            ].map(item => (
              <div key={item.label} style={{ background: 'white', borderRadius: 12, padding: '18px 24px', minWidth: 140, textAlign: 'center', border: '1px solid #e8edf3' }}>
                <div style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', fontSize: 16, color: 'var(--navy)' }}>{item.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: 'var(--navy)', padding: '64px 0', textAlign: 'center' }}>
        <div className="container">
          <h2 style={{ color: 'white', marginBottom: 16 }}>Klaar om te reserveren?</h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 28 }}>
            Boek online en ontvang direct een bevestiging. Of stel uw vraag via WhatsApp.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={BOOKING_URL} className="btn btn-primary btn-lg">Reserveer nu →</a>
            <a href={waLink} target="_blank" rel="noopener noreferrer"
              className="btn btn-outline btn-lg"
              style={{ color: 'white', borderColor: 'rgba(255,255,255,0.4)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <IconWhatsApp /> Vraag via WhatsApp
            </a>
          </div>
        </div>
      </section>

      <Footer content={content} />
    </>
  );
}
