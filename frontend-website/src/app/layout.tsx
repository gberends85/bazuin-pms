import type { Metadata } from 'next';
import './globals.css';
import NoticeBanner from './components/NoticeBanner';

const SITE_URL = 'https://www.parkeren-harlingen.nl';
const BOOKING_URL = 'https://www.parkeren-harlingen.nl';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Parkeren Harlingen | Autostalling De Bazuin — Op loopafstand van de veerboot',
    template: '%s | Autostalling De Bazuin Harlingen',
  },
  description:
    'Veilig overdekt parkeren in Harlingen op slechts 300m van de veerboten naar Terschelling en Vlieland. Online reserveren, EV-laden, actief sinds 1995. Bekijk tarieven en boek direct.',
  keywords: [
    'parkeren Harlingen', 'autostalling Harlingen', 'parkeren veerboot Terschelling',
    'parkeren veerboot Vlieland', 'overdekt parkeren Harlingen', 'parkeerplaats Harlingen',
    'stallen auto Harlingen', 'Autostalling De Bazuin', 'parkeren Waddeneilanden',
  ],
  authors: [{ name: 'Autostalling De Bazuin' }],
  creator: 'Autostalling De Bazuin',
  publisher: 'Autostalling De Bazuin',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  openGraph: {
    type: 'website',
    locale: 'nl_NL',
    url: SITE_URL,
    siteName: 'Parkeren-Harlingen.nl | Autostalling De Bazuin',
    title: 'Parkeren Harlingen | Op loopafstand van de veerboten',
    description: 'Veilig overdekt parkeren in Harlingen, 300m van de veerboot naar Terschelling & Vlieland. Online boeken, EV-laden, vlot en betrouwbaar.',
    images: [{ url: '/Logo-wit.png', width: 800, height: 232, alt: 'Autostalling De Bazuin Harlingen' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Parkeren Harlingen | Autostalling De Bazuin',
    description: 'Veilig overdekt parkeren op 300m van de veerboot. Online reserveren, EV-laden.',
    images: ['/Logo-wit.png'],
  },
  alternates: { canonical: SITE_URL },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || '',
  },
};

const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'ParkingFacility',
  name: 'Autostalling De Bazuin',
  url: SITE_URL,
  telephone: '+31517412986',
  email: 'reserveren@parkeren-harlingen.nl',
  image: `${SITE_URL}/Logo-wit.png`,
  logo: `${SITE_URL}/logo-icon.png`,
  description:
    'Autostalling De Bazuin biedt veilig overdekt parkeren in Harlingen op slechts 300 meter van de veerboten naar Terschelling en Vlieland. Actief sinds 1995.',
  foundingDate: '1995',
  priceRange: '€€',
  paymentAccepted: 'iDEAL, Creditcard, Contant, PIN',
  currenciesAccepted: 'EUR',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Industrieweg 1',
    addressLocality: 'Harlingen',
    postalCode: '8861 NM',
    addressCountry: 'NL',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 53.1741,
    longitude: 5.4131,
  },
  openingHoursSpecification: [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'], opens: '07:00', closes: '22:00' },
  ],
  amenityFeature: [
    { '@type': 'LocationFeatureSpecification', name: 'Overdekt parkeren', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'EV opladen', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Valet service', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Online reserveren', value: true },
    { '@type': 'LocationFeatureSpecification', name: '24/7 beveiligd', value: true },
  ],
  numberOfRooms: 55,
  sameAs: [
    'https://www.facebook.com/parkerenharlingen',
    'https://autostallingdebazuin.nl',
  ],
  hasMap: 'https://maps.google.com/?q=Autostalling+De+Bazuin+Harlingen',
  potentialAction: {
    '@type': 'ReserveAction',
    target: { '@type': 'EntryPoint', urlTemplate: BOOKING_URL },
    result: { '@type': 'Reservation', name: 'Parkeerplaats reserveren' },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <link rel="icon" href="/logo-icon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="theme-color" content="#142440" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
        />
      </head>
      <body>
        <NoticeBanner />
        {children}
      </body>
    </html>
  );
}
