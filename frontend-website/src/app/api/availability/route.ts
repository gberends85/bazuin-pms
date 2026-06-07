import { NextResponse } from 'next/server';

// Server-side proxy naar de beschikbaarheidscontrole van het reserveringssysteem.
// Twee modi:
//   /api/availability?arrival=YYYY-MM-DD&departure=YYYY-MM-DD  → { available, total, lotId }
//   /api/availability?from=YYYY-MM-DD&to=YYYY-MM-DD            → [{ date, available }]  (kalender)
const API_BASE = process.env.BOOKING_API_URL || 'http://127.0.0.1:3001/api/v1';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const arrival = searchParams.get('arrival') || '';
  const departure = searchParams.get('departure') || '';
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';

  try {
    if (from && to) {
      const url = `${API_BASE}/availability/calendar?from=${from}&to=${to}`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return NextResponse.json({ error: 'Beschikbaarheid niet beschikbaar' }, { status: r.status });
      const data = await r.json();
      return NextResponse.json(data, { headers: { 'Cache-Control': 'public, s-maxage=120' } });
    }

    if (arrival && departure) {
      const url = `${API_BASE}/availability?arrival=${arrival}&departure=${departure}`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        return NextResponse.json({ error: body.error || 'Beschikbaarheid niet beschikbaar' }, { status: r.status });
      }
      const data = await r.json();
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    }

    return NextResponse.json({ error: 'arrival+departure of from+to verplicht' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Beschikbaarheidsservice niet bereikbaar' }, { status: 502 });
  }
}
