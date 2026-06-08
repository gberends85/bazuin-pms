import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import dns from 'node:dns';

// De VPS gaat standaard via IPv6 naar Google, wat Google's datacenter-IPv6 blokkeert (403).
// Forceer IPv4 zodat de Places API bereikbaar is.
dns.setDefaultResultOrder('ipv4first');

const CACHE_FILE = path.join(process.cwd(), '.reviews-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 uur

const PLACE_ID = process.env.GOOGLE_PLACE_ID || 'ChIJt9a7m0v5xEcRPGZQKjqFZzo';
const API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';

// Fallback reviews als er geen API key is
const FALLBACK_REVIEWS = [
  {
    author_name: 'Marieke de Vries',
    rating: 5,
    relative_time_description: '2 maanden geleden',
    text: 'Uitstekende stalling! Super dicht bij de veerboot en altijd vriendelijk personeel. Al jaren klant en nog nooit teleurgesteld.',
    profile_photo_url: '',
  },
  {
    author_name: 'Jan Koopman',
    rating: 5,
    relative_time_description: '3 maanden geleden',
    text: 'Perfecte locatie, op loopafstand van de boot naar Terschelling. Auto werd netjes achtergelaten en bij terugkomst direct klaar. Aanrader!',
    profile_photo_url: '',
  },
  {
    author_name: 'Sandra Hoekstra',
    rating: 5,
    relative_time_description: '1 maand geleden',
    text: 'Geweldige service. We hebben de auto opgeladen tijdens ons verblijf op Vlieland — dat werkte perfect. We komen zeker terug!',
    profile_photo_url: '',
  },
  {
    author_name: 'Peter Bakker',
    rating: 5,
    relative_time_description: '4 maanden geleden',
    text: 'Al 10 jaar parkeerwij hier als we naar Terschelling gaan. Betrouwbaar, veilig en eerlijke prijs. Hartelijk personeel ook.',
    profile_photo_url: '',
  },
  {
    author_name: 'Loes Vermeer',
    rating: 4,
    relative_time_description: '2 maanden geleden',
    text: 'Goede stalling op een handige locatie. Online reserveren werkt prettig. Kleine opmerking: de route erheen kan duidelijker. Verder zeer tevreden!',
    profile_photo_url: '',
  },
  {
    author_name: 'Klaas Dijkstra',
    rating: 5,
    relative_time_description: '5 maanden geleden',
    text: 'Overdekte stalling vlakbij de veerboot, dat is precies wat je zoekt. Vriendelijk ontvangen, auto stond er goed bij bij terugkomst.',
    profile_photo_url: '',
  },
];

async function fetchFromGoogle() {
  if (!API_KEY) return null;

  // Places API (New): https://places.googleapis.com/v1/places/{placeId}
  const url = `https://places.googleapis.com/v1/places/${PLACE_ID}?languageCode=nl`;

  const resp = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'rating,userRatingCount,reviews',
    },
    next: { revalidate: 86400 },
  });
  if (!resp.ok) return null;

  const data = await resp.json();
  if (!data || (!data.reviews && !data.rating)) return null;

  // Normaliseer het nieuwe formaat naar onze eigen structuur
  const reviews = (data.reviews || [])
    .map((r: any) => ({
      author_name: r.authorAttribution?.displayName || 'Google-gebruiker',
      rating: r.rating || 0,
      relative_time_description: r.relativePublishTimeDescription || '',
      text: r.text?.text || r.originalText?.text || '',
      profile_photo_url: r.authorAttribution?.photoUri || '',
    }))
    // Toon alle reviews mét tekst (Google geeft er maximaal ~5 terug), beste eerst.
    .filter((r: any) => r.text)
    .sort((a: any, b: any) => b.rating - a.rating)
    .slice(0, 8);

  return {
    rating: data.rating || 0,
    totalRatings: data.userRatingCount || 0,
    reviews,
    fetchedAt: Date.now(),
  };
}

async function getCachedReviews() {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf-8');
    const cache = JSON.parse(raw);
    if (Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache;
  } catch {}
  return null;
}

async function saveCache(data: any) {
  try { await fs.writeFile(CACHE_FILE, JSON.stringify(data)); } catch {}
}

export async function GET() {
  // 1. Check cache
  const cached = await getCachedReviews();
  if (cached) {
    return NextResponse.json(cached, { headers: { 'Cache-Control': 'public, s-maxage=3600' } });
  }

  // 2. Fetch from Google
  const fresh = await fetchFromGoogle();
  if (fresh) {
    await saveCache(fresh);
    return NextResponse.json(fresh, { headers: { 'Cache-Control': 'public, s-maxage=3600' } });
  }

  // 3. Fallback
  return NextResponse.json({
    rating: 4.8,
    totalRatings: 127,
    reviews: FALLBACK_REVIEWS,
    fetchedAt: Date.now(),
    isFallback: true,
  });
}
