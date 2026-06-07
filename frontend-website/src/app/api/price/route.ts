import { NextResponse } from 'next/server';

// Server-side proxy naar de échte tariefberekening van het reserveringssysteem.
// Voorkomt CORS en gebruikt altijd de actuele tarieven uit de database.
const API_BASE = process.env.BOOKING_API_URL || 'http://127.0.0.1:3001/api/v1';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const arrival = searchParams.get('arrival') || '';
  const departure = searchParams.get('departure') || '';
  const vehicles = searchParams.get('vehicles') || '1';

  if (!arrival || !departure) {
    return NextResponse.json({ error: 'arrival en departure verplicht' }, { status: 400 });
  }

  try {
    const url = `${API_BASE}/rates/calculate?arrival=${arrival}&departure=${departure}&vehicles=${vehicles}`;
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
