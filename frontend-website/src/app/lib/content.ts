// Fetches CMS content from the backend API
// Falls back to defaults if API is unavailable

export interface ContactData {
  address: string; postalCode: string; city: string;
  phone: string; phoneDisplay: string; whatsapp: string; email: string;
}
export interface BusinessData {
  name: string; tagline: string; description: string;
  foundingYear: string; totalSpots: number; distanceToFerry: string;
}
export interface OpeningHours {
  monday: string; tuesday: string; wednesday: string;
  thursday: string; friday: string; saturday: string; sunday: string;
  note: string;
}
export interface PricingRow { label: string; price: string; highlight: boolean; }
export interface UspRow { icon: string; title: string; desc: string; }
export interface FaqRow { q: string; a: string; }
export interface WebsiteContent {
  contact: ContactData;
  business: BusinessData;
  openingHours: OpeningHours;
  hero: { title: string; subtitle: string; };
  pricing: PricingRow[];
  usp: UspRow[];
  faq: FaqRow[];
}

export const DEFAULT_CONTENT: WebsiteContent = {
  contact: {
    address: 'Zeilmakersstraat 2',
    postalCode: '8861 SE',
    city: 'Harlingen',
    phone: '0517412986',
    phoneDisplay: '0517 – 41 29 86',
    whatsapp: '31517412986',
    email: 'info@parkeren-harlingen.nl',
  },
  business: {
    name: 'Autostalling De Bazuin',
    tagline: 'Op loopafstand van de veerboot',
    description: 'Al meer dan 30 jaar bieden wij betrouwbare overdekte parkeermogelijkheden aan reizigers richting Terschelling en Vlieland.',
    foundingYear: '1995',
    totalSpots: 55,
    distanceToFerry: '300m',
  },
  openingHours: {
    monday: '07:00 – 22:00', tuesday: '07:00 – 22:00', wednesday: '07:00 – 22:00',
    thursday: '07:00 – 22:00', friday: '07:00 – 22:00', saturday: '07:00 – 22:00',
    sunday: '07:00 – 22:00',
    note: 'Buiten openingstijden is in- en uitrijden niet mogelijk.',
  },
  hero: {
    title: 'Parkeren bij de veerboot in Harlingen',
    subtitle: 'Veilig overdekt parkeren op slechts 300 meter van de veerboten naar Terschelling en Vlieland. Online reserveren, EV-laden, vriendelijk personeel.',
  },
  pricing: [
    { label: '1 – 3 dagen', price: '9.50', highlight: false },
    { label: '4 – 7 dagen', price: '8.75', highlight: true },
    { label: '8 – 14 dagen', price: '8.25', highlight: false },
    { label: '15+ dagen', price: '7.75', highlight: false },
  ],
  usp: [
    { icon: '🏢', title: 'Volledig overdekt', desc: 'Uw auto staat altijd droog, zomer en winter. Geen sneeuw krabben, geen hagel.' },
    { icon: '🔒', title: '24/7 beveiliging', desc: "Camera's, verlichting en toegangscontrole zorgen dag en nacht voor uw veiligheid." },
    { icon: '⚡', title: 'Auto opladen', desc: 'Laad uw EV op terwijl u geniet van de eilanden. Laadpalen beschikbaar.' },
    { icon: '📱', title: 'Online reserveren', desc: 'Snel, eenvoudig en met directe bevestiging. Betaal vooraf via iDEAL.' },
    { icon: '🤝', title: 'Persoonlijke service', desc: 'Ons vriendelijke team staat klaar met tips, advies en hulp bij uw bagage.' },
  ],
  faq: [
    { q: 'Hoe ver is de stalling van de veerboot?', a: 'Autostalling De Bazuin ligt op slechts 300 meter van de veerboten van Rederij Doeksen. Lopen duurt circa 3–4 minuten.' },
    { q: 'Is online reserveren verplicht?', a: 'Online reserveren is niet verplicht, maar wel sterk aan te raden — zeker in het hoogseizoen (mei t/m september) zijn er regelmatig periodes dat we vol zijn.' },
    { q: 'Kan ik mijn elektrische auto opladen?', a: 'Ja! We hebben laadpalen beschikbaar voor elektrische voertuigen. U kunt bij de reservering aangeven dat u een laadpunt wenst.' },
    { q: 'Is de stalling overdekt en beveiligd?', a: "Ja, de stalling is volledig overdekt en 24/7 beveiligd met camera's, verlichting en toegangscontrole." },
    { q: 'Wat als ik later terug ben dan gepland?', a: 'Geen probleem — u betaalt gewoon de extra dagen bij. Bel ons even zodat we rekening kunnen houden met de bezetting.' },
    { q: 'Welke betaalmethoden accepteren jullie?', a: 'We accepteren iDEAL (online bij reservering), PIN, creditcard en contant aan de balie.' },
  ],
};

const API_URL = 'https://api.booking.parkeren-harlingen.nl/api/v1/website-content';

export async function getContent(): Promise<WebsiteContent> {
  try {
    const res = await fetch(API_URL, { next: { revalidate: 60 } }); // refresh every 60s
    if (!res.ok) return DEFAULT_CONTENT;
    const data = await res.json();
    if (!data?.contact) return DEFAULT_CONTENT;
    return data as WebsiteContent;
  } catch {
    return DEFAULT_CONTENT;
  }
}

export function formatPrice(price: string): string {
  const n = parseFloat(price);
  return `€ ${n.toFixed(2).replace('.', ',')}`;
}

export function formatAddress(c: ContactData): string {
  return `${c.address}, ${c.postalCode} ${c.city}`;
}

export function whatsappUrl(whatsapp: string): string {
  return `https://wa.me/${whatsapp}`;
}
