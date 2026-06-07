'use client';
import Link from 'next/link';
import Image from 'next/image';
import { WebsiteContent, whatsappUrl } from '../lib/content';
import { IconWhatsApp } from './icons';

const BOOKING_URL = 'https://booking.parkeren-harlingen.nl/boeken';

export default function Footer({ content }: { content?: WebsiteContent }) {
  const contact = content?.contact;
  const business = content?.business;
  const waLink = contact ? whatsappUrl(contact.whatsapp) : 'https://wa.me/31517412986';

  return (
    <footer style={{ background: 'linear-gradient(135deg, #142440 0%, #19499e 100%)', color: 'rgba(255,255,255,0.75)', paddingTop: 60, paddingBottom: 32 }}>
      <div className="container">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 40, marginBottom: 48 }}>
          {/* Brand */}
          <div>
            <Link href="/" style={{ display: 'inline-block', marginBottom: 16 }}>
              <Image
                src="/Logo.png"
                alt="De Bazuin – Autostalling Harlingen"
                width={200}
                height={58}
                style={{ objectFit: 'contain' }}
              />
            </Link>
            <p style={{ fontSize: 14, lineHeight: 1.75, color: 'rgba(255,255,255,0.7)' }}>
              {business?.description ?? 'Veilig overdekt parkeren op 300m van de veerboten naar Terschelling en Vlieland. Al actief sinds 1995.'}
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 style={{ color: 'white', fontFamily: 'var(--font-heading)', marginBottom: 16, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Navigatie</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { href: '/', label: 'Home' },
                { href: '/tarieven', label: 'Tarieven' },
                { href: '/openingstijden', label: 'Openingstijden' },
                { href: '/route', label: 'Route & Locatie' },
                { href: BOOKING_URL, label: 'Direct reserveren' },
              ].map(item => (
                <li key={item.href}>
                  <Link href={item.href} style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, transition: 'color 0.2s' }}
                    onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.color = 'var(--cyan)')}
                    onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.color = 'rgba(255,255,255,0.75)')}
                  >→ {item.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 style={{ color: 'white', fontFamily: 'var(--font-heading)', marginBottom: 16, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
              <li>
                <div style={{ color: 'var(--cyan)', fontWeight: 600, marginBottom: 2 }}>Adres</div>
                {contact?.address ?? 'Zeilmakersstraat 2'}<br />
                {contact?.postalCode ?? '8861 SE'} {contact?.city ?? 'Harlingen'}
              </li>
              <li>
                <div style={{ color: 'var(--cyan)', fontWeight: 600, marginBottom: 2 }}>WhatsApp / Telefoon</div>
                <a href={waLink} style={{ color: 'rgba(255,255,255,0.85)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <IconWhatsApp size={15} /> {contact?.phoneDisplay ?? '0517 – 41 29 86'}
                </a>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Bij voorkeur via WhatsApp</div>
              </li>
              <li>
                <div style={{ color: 'var(--cyan)', fontWeight: 600, marginBottom: 2 }}>E-mail</div>
                <a href={`mailto:${contact?.email ?? 'info@parkeren-harlingen.nl'}`} style={{ color: 'rgba(255,255,255,0.75)', wordBreak: 'break-all' }}>
                  {contact?.email ?? 'info@parkeren-harlingen.nl'}
                </a>
              </li>
            </ul>
          </div>

          {/* Hours */}
          <div>
            <h4 style={{ color: 'white', fontFamily: 'var(--font-heading)', marginBottom: 16, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Openingstijden</h4>
            <div style={{ fontSize: 14, lineHeight: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Maandag – zondag</span>
                <span style={{ color: 'white', fontWeight: 600, marginLeft: 16 }}>
                  {content?.openingHours?.monday ?? '07:00 – 22:00'}
                </span>
              </div>
              {content?.openingHours?.note && (
                <div style={{ marginTop: 12, background: 'rgba(74,200,237,0.1)', borderLeft: '3px solid var(--cyan)', padding: '8px 12px', borderRadius: '0 6px 6px 0', fontSize: 13 }}>
                  <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>Let op:</span>{' '}
                  {content.openingHours.note}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 24, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
          <div>© {new Date().getFullYear()} {business?.name ?? 'Autostalling De Bazuin'} Harlingen. Alle rechten voorbehouden.</div>
          <div style={{ display: 'flex', gap: 20 }}>
            <a href="#" style={{ color: 'rgba(255,255,255,0.5)' }}>Privacybeleid</a>
            <a href="#" style={{ color: 'rgba(255,255,255,0.5)' }}>Algemene voorwaarden</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
