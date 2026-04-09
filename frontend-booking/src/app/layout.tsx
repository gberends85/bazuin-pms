import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Parkeren Harlingen — Autostalling De Bazuin',
  description: 'Reserveer een parkeerplaats bij Autostalling De Bazuin, op loopafstand van de veerboten naar Terschelling en Vlieland.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, fontFamily: "'Inter', system-ui, sans-serif", background: '#f4f6f9', color: '#0a2240' }}>{children}</body>
    </html>
  );
}
