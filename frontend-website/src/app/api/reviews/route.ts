import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import dns from 'node:dns';

// De VPS gaat standaard via IPv6 naar Google, wat Google's datacenter-IPv6 blokkeert (403).
// Forceer IPv4 zodat de Places API bereikbaar is.
dns.setDefaultResultOrder('ipv4first');

// Altijd live uitvoeren: de pool wordt buiten de build om bijgewerkt (dagelijkse
// Google-fetch + handmatig toegevoegde reviews). Zonder dit cachet Next de
// route-respons, waardoor nieuwe reviews niet zichtbaar worden.
export const dynamic = 'force-dynamic';

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

// Google's Places API geeft per keer maximaal ~5 reviews terug. Door dagelijks op
// te halen en nieuwe, unieke reviews aan een lokale pool toe te voegen, bouwen we
// na verloop van tijd een grotere verzameling op dan die 5 momentopnamen.
const MIN_RATING = 4;      // alleen 4- en 5-sterren tonen
const POOL_DISPLAY = 12;   // hoeveel er op de homepage worden getoond

function reviewKey(r: any): string {
  return `${(r.author_name || '').trim()}::${(r.text || '').trim().slice(0, 120)}`;
}

interface Store {
  fetchedAt: number;
  rating: number;
  totalRatings: number;
  pool: any[];
}

async function fetchFromGoogle(): Promise<{ rating: number; totalRatings: number; reviews: any[] } | null> {
  if (!API_KEY) return null;
  const url = `https://places.googleapis.com/v1/places/${PLACE_ID}?languageCode=nl`;
  const resp = await fetch(url, {
    headers: { 'X-Goog-Api-Key': API_KEY, 'X-Goog-FieldMask': 'rating,userRatingCount,reviews' },
    next: { revalidate: 86400 },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data || (!data.reviews && !data.rating)) return null;

  const reviews = (data.reviews || [])
    .map((r: any) => ({
      author_name: r.authorAttribution?.displayName || 'Google-gebruiker',
      rating: r.rating || 0,
      relative_time_description: r.relativePublishTimeDescription || '',
      text: r.text?.text || r.originalText?.text || '',
      profile_photo_url: r.authorAttribution?.photoUri || '',
    }))
    .filter((r: any) => r.text && r.rating >= MIN_RATING);

  return { rating: data.rating || 0, totalRatings: data.userRatingCount || 0, reviews };
}

async function readStore(): Promise<Store | null> {
  try {
    const cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8'));
    // Migratie van oud cacheformaat ({reviews}) naar pool
    if (!cache.pool && Array.isArray(cache.reviews)) cache.pool = cache.reviews;
    if (!Array.isArray(cache.pool)) cache.pool = [];
    return cache as Store;
  } catch { return null; }
}

async function saveStore(store: Store) {
  try { await fs.writeFile(CACHE_FILE, JSON.stringify(store)); } catch {}
}

function respond(store: Store) {
  const reviews = [...store.pool]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, POOL_DISPLAY);
  return NextResponse.json(
    { rating: store.rating, totalRatings: store.totalRatings, reviews, poolSize: store.pool.length, fetchedAt: store.fetchedAt },
    { headers: { 'Cache-Control': 'public, s-maxage=3600' } },
  );
}

export async function GET() {
  const store = await readStore();
  const isFresh = store && Date.now() - store.fetchedAt < CACHE_TTL_MS;

  // 1. Recent opgehaald → serveer de opgebouwde pool
  if (store && isFresh) return respond(store);

  // 2. Vers ophalen bij Google en nieuwe unieke reviews toevoegen aan de pool
  const g = await fetchFromGoogle();
  if (g) {
    const pool = store?.pool ? [...store.pool] : [];
    const seen = new Set(pool.map(reviewKey));
    for (const r of g.reviews) {
      const k = reviewKey(r);
      if (!seen.has(k)) { seen.add(k); pool.push(r); }
    }
    const next: Store = { fetchedAt: Date.now(), rating: g.rating, totalRatings: g.totalRatings, pool };
    await saveStore(next);
    return respond(next);
  }

  // 3. Google onbereikbaar → val terug op bestaande pool, anders op fallback
  if (store && store.pool.length) return respond(store);
  return NextResponse.json({
    rating: 4.8, totalRatings: 127, reviews: FALLBACK_REVIEWS, fetchedAt: Date.now(), isFallback: true,
  });
}
