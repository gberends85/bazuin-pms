import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic'; // searchParams op request-tijd lezen, niet bij build

// Root (/boeken) stuurt door naar de boekingsflow (/boeken/boeken).
// Query string wordt meegenomen zodat deeplinks (arrival/departure/autos/stap,
// e-mail-prefill, enz.) behouden blijven.
export default function Home({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (Array.isArray(v)) v.forEach(val => qs.append(k, val));
    else if (v != null) qs.set(k, v);
  }
  const q = qs.toString();
  redirect(`/boeken${q ? `?${q}` : ''}`);
}
