/** @type {import('next').NextConfig} */
module.exports = {
  basePath: '/boeken',
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api/v1',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
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
    // De boekingsflow zit nu op de root (/boeken). De oude dubbele URL
    // (/boeken/boeken) blijft werken via een permanente redirect, met behoud
    // van de query string (deeplinks/prefill). basePath wordt automatisch
    // toegevoegd: source -> /boeken/boeken, destination -> /boeken.
    return [
      {
        source: '/boeken',
        destination: '/',
        permanent: true,
      },
    ];
  },
};
