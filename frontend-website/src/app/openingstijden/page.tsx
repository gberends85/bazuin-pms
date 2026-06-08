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
  const badge: CSSProperties = { flexShrink: 0, width: 38, height: 38, borderRadius: '50%', background: 'var(--blue, #19499e)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17, fontFamily: 'var(--font-display)' };
  const warn: CSSProperties = { background: '#fff4e0', border: '1px solid #f5c07a', borderRadius: 12, padding: '14px 18px', fontSize: 14, color: '#7a4a00', lineHeight: 1.7 };
  const info: CSSProperties = { background: '#eef3fa', borderLeft: '3px solid var(--cyan, #4ac8ed)', borderRadius: '0 12px 12px 0', padding: '18px 22px', marginBottom: 16 };
  const infoLabel: CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--cyan-dark, #0fa8cc)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 };
  const waStyle: CSSProperties = { color: 'var(--blue)', fontWeight: 600 };

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
        <div className="container" style={{ maxWidth: 860 }}>

          {/* Intro */}
          <p style={{ ...p, textAlign: 'center', maxWidth: 620, margin: '0 auto 40px', fontSize: 16 }}>
            We vragen uw vertrektijd zodat we bij verwachte drukte tijdig ruimte maken op ons afgifteterrein.
          </p>

          {/* ── AUTO AFGEVEN ── */}
          <h2 style={{ ...h2, textAlign: 'center', marginBottom: 8 }}>Auto afgeven</h2>
          <p style={{ ...p, textAlign: 'center', marginBottom: 28 }}>Belangrijk: twee hoofdpunten.</p>

          {/* Stap 1 */}
          <div style={card}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <span style={badge}>1</span>
              <div style={{ flex: 1 }}>
                <h3 style={h3}>Parkeren op ons terrein</h3>
                <p style={p}>
                  Gebruik de geel gemarkeerde, extra ruime vakken op ons buitenterrein. Parkeer bij voorkeur vooruit in het laagst beschikbare nummer (zie afbeelding onderaan).
                </p>
                <div style={warn}>
                  <strong>⚠️ Let op:</strong> Parkeert u buiten ons terrein, dan riskeert u een boete van de gemeente. Bovendien kunnen wij uw auto dan niet altijd snel genoeg verwerken, wat vertraging kan veroorzaken en de kans op een boete verhoogt.
                </div>
              </div>
            </div>
          </div>

          {/* Stap 2 */}
          <div style={card}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <span style={badge}>2</span>
              <div style={{ flex: 1 }}>
                <h3 style={h3}>Sleutel in de afgiftekluis</h3>
                <p style={{ ...p, margin: 0 }}>
                  Laat uw sleutel achter in onze beveiligde kluis. Wij zorgen dat uw auto zo snel mogelijk naar binnen wordt gereden. Gooi alleen de sleutel zelf in; dus zonder hoesje, siliconen omhulsel of envelop. Aan de hand van het sleuteltype koppelen wij deze eenvoudig aan uw auto, d.m.v. het kenteken koppelen we deze weer aan uw reservering.
                </p>
              </div>
            </div>
          </div>

          {/* Tijdens drukte — info-strip */}
          <div style={info}>
            <div style={infoLabel}>Tijdens drukte</div>
            <p style={{ ...p, margin: 0 }}>
              Er is dan iemand aanwezig die u helpt met parkeren en vooraf afrekenen. Heeft uw auto een startcode of afwijkende startmethode? Meld dit bij voorkeur direct na afgifte via <a href={waLink} target="_blank" rel="noopener noreferrer" style={waStyle}>WhatsApp</a>.
            </p>
          </div>

          {/* ── AUTO AFHALEN ── */}
          <h2 style={{ ...h2, textAlign: 'center', marginTop: 48, marginBottom: 28 }}>Auto afhalen</h2>

          <div style={card}>
            <p style={{ ...p, margin: 0 }}>
              Bij terugkomst staan wij meestal voor u klaar. Soms ontvangt u vooraf een code waarmee u uw sleutel zelf uit de afgiftekluis kunt halen. Wanneer we er niet zijn en u geen code heeft ontvangen dan belt u aan bij de intercom naast de afgiftekluis. We komen dan direct.
            </p>
          </div>

          <div style={info}>
            <div style={infoLabel}>Wijzigingen in afhaaltijd of -datum</div>
            <p style={{ ...p, margin: 0 }}>
              Heeft u via dit systeem gereserveerd? Dan wijzigt u uw afhaaltijd of -datum eenvoudig zelf via de link in uw bevestigingsmail. Bij oudere reserveringen is dat nog niet mogelijk — neem in dat geval contact met ons op via <a href={waLink} target="_blank" rel="noopener noreferrer" style={waStyle}>WhatsApp</a>.
            </p>
          </div>

          <div style={info}>
            <div style={infoLabel}>Afhaaltijd</div>
            <p style={{ ...p, margin: 0 }}>
              Afhalen kan tot 15 minuten nadat de laatste passagiers van boord zijn. Dat lijkt kort, maar in de praktijk is dit ruim voldoende — u kunt rustig naar ons toe wandelen.
            </p>
          </div>

          {/* Plattegrond (afbeelding onderaan) */}
          <div style={{ marginTop: 36 }}>
            <div style={{ ...infoLabel, textAlign: 'center', marginBottom: 14 }}>Plattegrond van ons terrein</div>
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
