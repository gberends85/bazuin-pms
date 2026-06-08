import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { getContent, whatsappUrl } from '../lib/content';
import { IconWhatsApp } from '../components/icons';

const BOOKING_URL = 'https://booking.parkeren-harlingen.nl/boeken';
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Openingstijden & werkwijze',
  description: 'Openingstijden en werkwijze van Autostalling De Bazuin Harlingen — auto afgeven, sleutel in de afgiftekluis en uw auto afhalen.',
  alternates: { canonical: 'https://booking.parkeren-harlingen.nl/openingstijden' },
};

export default async function OpeningstijdenPage() {
  const content = await getContent();
  const { contact } = content;
  const waLink = whatsappUrl(contact.whatsapp);

  const card: CSSProperties = { background: 'white', borderRadius: 16, padding: '28px 32px', boxShadow: '0 2px 16px rgba(20,36,64,0.07)', marginBottom: 20 };
  const h2: CSSProperties = { fontSize: 'clamp(22px,3vw,30px)', color: 'var(--navy)', marginBottom: 18 };
  const h3: CSSProperties = { fontSize: 18, color: 'var(--navy)', margin: '0 0 8px' };
  const p: CSSProperties = { fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.75, margin: '0 0 14px' };
  const eyebrow: CSSProperties = { color: 'var(--cyan-dark)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 };

  return (
    <>
      <Header />

      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg, #142440 0%, #19499e 100%)', paddingTop: 120, paddingBottom: 80, textAlign: 'center' }}>
        <div className="container">
          <div style={{ color: 'var(--cyan)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>OPENINGSTIJDEN &amp; WERKWIJZE</div>
          <h1 style={{ color: 'white', fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,56px)', marginBottom: 16 }}>Openingstijden</h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 18, maxWidth: 640, margin: '0 auto', lineHeight: 1.6 }}>
            Omdat u zelf de auto op ons terrein parkeert en uw sleutel in de afgiftekluis werpt kunt u tegenwoordig altijd terecht.
          </p>
        </div>
      </section>

      <section style={{ background: 'var(--gray)' }}>
        <div className="container" style={{ maxWidth: 820 }}>

          {/* Intro */}
          <div style={{ ...card }}>
            <p style={{ ...p, margin: 0 }}>
              We vragen uw vertrektijd zodat we bij verwachte drukte tijdig ruimte maken op ons afgifteterrein.
            </p>
          </div>

          {/* Auto afgeven */}
          <div style={{ marginTop: 36, marginBottom: 8 }}>
            <div style={eyebrow}>AUTO AFGEVEN</div>
            <h2 style={h2}>Auto afgeven</h2>
            <p style={{ ...p, fontWeight: 600, color: 'var(--navy)' }}>Belangrijk: twee hoofdpunten</p>
            <ol style={{ margin: '0 0 20px', paddingLeft: 20, color: 'var(--navy)', fontSize: 15, lineHeight: 1.9, fontWeight: 600 }}>
              <li>Parkeer op ons terrein</li>
              <li>Geef uw sleutel af</li>
            </ol>
          </div>

          <div style={card}>
            <h3 style={h3}>1. Parkeren op ons terrein</h3>
            <p style={p}>
              Gebruik de geel gemarkeerde, extra ruime vakken op ons buitenterrein. Parkeer bij voorkeur vooruit in het laagst beschikbare nummer (zie afbeelding onderaan).
            </p>
            <div style={{ background: '#fff4e0', border: '1px solid #f5c07a', borderRadius: 12, padding: '14px 18px', fontSize: 14, color: '#7a4a00', lineHeight: 1.7 }}>
              <strong>⚠️ Let op:</strong> Parkeert u buiten ons terrein, dan riskeert u een boete van de gemeente. Bovendien kunnen wij uw auto dan niet altijd snel genoeg verwerken, wat vertraging kan veroorzaken en de kans op een boete verhoogt.
            </div>
          </div>

          <div style={card}>
            <h3 style={h3}>2. Sleutel in de afgiftekluis</h3>
            <p style={{ ...p, margin: 0 }}>
              Laat uw sleutel achter in onze beveiligde kluis. Wij zorgen dat uw auto zo snel mogelijk naar binnen wordt gereden. Gooi alleen de sleutel zelf in; dus zonder hoesje, siliconen omhulsel of envelop. Aan de hand van het sleuteltype koppelen wij deze eenvoudig aan uw auto, d.m.v. het kenteken koppelen we deze weer aan uw reservering.
            </p>
          </div>

          <div style={card}>
            <h3 style={h3}>Tijdens drukte</h3>
            <p style={{ ...p, margin: 0 }}>
              Er is dan iemand aanwezig die u helpt met parkeren en vooraf afrekenen. Heeft uw auto een startcode of afwijkende startmethode? Meld dit bij voorkeur direct na afgifte via <a href={waLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', fontWeight: 600 }}>WhatsApp</a>.
            </p>
          </div>

          {/* Auto afhalen */}
          <div style={{ marginTop: 36, marginBottom: 8 }}>
            <div style={eyebrow}>AUTO AFHALEN</div>
            <h2 style={h2}>Auto afhalen</h2>
            <p style={{ ...p, fontWeight: 600, color: 'var(--navy)' }}>Afhalen van uw auto</p>
          </div>

          <div style={card}>
            <h3 style={h3}>U heeft uw sleutel via de kluis afgegeven en nog niet betaald</h3>
            <p style={{ ...p, margin: 0 }}>
              Wij zorgen dat uw auto startklaar staat op de afhaaltijd die in uw reservering vermeld staat. Vaak is er al iemand aanwezig in de stalling. Zijn de deuren nog gesloten? Bel aan bij de intercom, dan komt er direct iemand naar u toe.
            </p>
          </div>

          <div style={card}>
            <h3 style={h3}>Indien u bij het afgeven al heeft betaald.</h3>
            <p style={{ ...p, margin: 0 }}>
              Soms sturen we op de afhaaldag een code via <a href={waLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', fontWeight: 600 }}>WhatsApp</a>, zodat u de sleutel zelf uit het uitgiftevak van de kluis kunt halen. Ontvangt u geen code? Dan is er altijd iemand aanwezig om u te helpen. Zijn de deuren gesloten, bel dan aan bij de intercom.
            </p>
          </div>

          <div style={card}>
            <h3 style={h3}>Wijzigingen in afhaaltijd of -datum</h3>
            <p style={{ ...p, margin: 0 }}>
              Graag via <a href={waLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', fontWeight: 600 }}>WhatsApp</a>, dit is de snelste en gemakkelijkste manier.
            </p>
          </div>

          <div style={card}>
            <h3 style={h3}>Afhaaltijd</h3>
            <p style={{ ...p, margin: 0 }}>
              Afhalen kan tot 15 minuten nadat de laatste passagiers van boord zijn. Dat lijkt kort, maar in de praktijk is dit ruim voldoende — u kunt rustig naar ons toe wandelen.
            </p>
          </div>

          {/* Plattegrond (afbeelding onderaan) */}
          <div style={{ marginTop: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/openingstijden-plattegrond.jpg" alt="Plattegrond van het terrein van Autostalling De Bazuin met afgiftekluis en looproute naar de veerboten"
              style={{ width: '100%', height: 'auto', borderRadius: 16, display: 'block', boxShadow: '0 2px 16px rgba(20,36,64,0.1)' }} />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: 'white', padding: '60px 0', textAlign: 'center' }}>
        <div className="container">
          <h2 style={{ marginBottom: 16 }}>Alvast een plek reserveren?</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: 420, margin: '0 auto 28px' }}>Reserveer online en ontvang direct een bevestiging. U bent zeker van uw plek.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={BOOKING_URL} className="btn btn-navy btn-lg">Reserveer nu →</a>
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-lg" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><IconWhatsApp /> WhatsApp</a>
          </div>
        </div>
      </section>

      <Footer content={content} />
    </>
  );
}
