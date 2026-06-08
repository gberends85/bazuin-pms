import type { Metadata } from 'next';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { getContent } from '../lib/content';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Algemene voorwaarden',
  description: 'De algemene voorwaarden van Autostalling De Bazuin Harlingen — reserveren, betalen, annuleren, zelfservice, laadservice en annuleringsbeleid.',
  alternates: { canonical: 'https://booking.parkeren-harlingen.nl/voorwaarden' },
};

const TERMS_API = 'https://api.booking.parkeren-harlingen.nl/api/v1/public/terms';

async function getTerms(): Promise<string> {
  try {
    const res = await fetch(TERMS_API, { next: { revalidate: 300 } });
    if (!res.ok) return '';
    const d = await res.json();
    return d.text || '';
  } catch {
    return '';
  }
}

export default async function VoorwaardenPage() {
  const [content, terms] = await Promise.all([getContent(), getTerms()]);

  return (
    <>
      <Header />

      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg, #142440 0%, #19499e 100%)', paddingTop: 120, paddingBottom: 72, textAlign: 'center' }}>
        <div className="container">
          <div style={{ color: 'var(--cyan)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>VOORWAARDEN</div>
          <h1 style={{ color: 'white', fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,52px)', margin: 0 }}>Algemene voorwaarden</h1>
        </div>
      </section>

      <section style={{ background: 'var(--gray)' }}>
        <div className="container" style={{ maxWidth: 820 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 'clamp(24px, 4vw, 44px)', boxShadow: '0 2px 16px rgba(20,36,64,0.07)' }}>
            {terms
              ? <div className="terms-content" dangerouslySetInnerHTML={{ __html: terms }} />
              : <p style={{ color: 'var(--text-muted)' }}>De voorwaarden kunnen op dit moment niet worden geladen. Probeer het later opnieuw.</p>}
          </div>
        </div>
      </section>

      <Footer content={content} />

      <style>{`
        .terms-content { color: var(--text-muted); font-size: 15px; line-height: 1.75; }
        .terms-content h3 { color: var(--navy); font-family: var(--font-display); font-size: 20px; font-weight: 700; margin: 34px 0 14px; padding-top: 22px; border-top: 1px solid #e3e8ef; }
        .terms-content h3:first-child { margin-top: 0; padding-top: 0; border-top: none; }
        .terms-content p { margin: 0 0 14px; }
        .terms-content ul { margin: 0 0 18px; padding-left: 22px; }
        .terms-content li { margin-bottom: 9px; }
        .terms-content li::marker { color: var(--cyan-dark, #0fa8cc); }
        .terms-content strong { color: var(--navy); }
      `}</style>
    </>
  );
}
