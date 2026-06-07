import { NextResponse } from 'next/server';

// Server-side proxy naar de échte tariefberekening van het reserveringssysteem.
// Voorkomt CORS en gebruikt altijd de actuele tarieven uit de database.
const API_BASE = process.env.BOOKING_API_URL || 'http://127.0.0.1:3001/api/v1';

// Strikte validatie; voorkomt injectie van extra query-params/pad in de backend-URL.
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const arrival = searchParams.get('arrival') || '';
  const departure = searchParams.get('departure') || '';
  const vehicles = searchParams.get('vehicles') || '1';

  if (!isDate(arrival) || !isDate(departure)) {
    return NextResponse.json({ error: 'arrival en departure moeten geldige datums zijn' }, { status: 400 });
  }
  const vehiclesNum = Math.max(1, Math.min(99, parseInt(vehicles, 10) || 1));

  try {
    const url = `${API_BASE}/rates/calculate?arrival=${encodeURIComponent(arrival)}&departure=${encodeURIComponent(departure)}&vehicles=${vehiclesNum}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      return NextResponse.json({ error: body.error || 'Berekening mislukt' }, { status: r.status });
    }
    const data = await r.json();
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, s-maxage=300' } });
  } catch (e: any) {
    return NextResponse.json({ error: 'Tariefservice niet bereikbaar' }, { status: 502 });
  }
}
