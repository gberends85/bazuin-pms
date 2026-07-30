/** @type {import('next').NextConfig} */
module.exports = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api/v1',
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: 'http://localhost:3001/api/v1/:path*',
      },
    ];
  },
  async redirects() {
    return [
      // De losse lijst "Alle reserveringen" is uitgefaseerd: /arrivals (in de
      // sidebar 'Reserveringen') kan hetzelfde en meer. Hier doorverwijzen in
      // plaats van in de pagina zelf, omdat een statisch voorgerenderde pagina
      // geen echte HTTP-redirect oplevert. Alleen het exacte pad: de subroutes
      // /reservations/[id] en /reservations/new blijven gewoon werken.
      // Niet permanent (307), zodat browsers het niet blijvend cachen.
      { source: '/reservations', destination: '/arrivals', permanent: false },
    ];
  },
};
