import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0a2240', 50: '#e8eef8', 100: '#c5d3ec', 200: '#92aad8', 600: '#0e3060', 900: '#060f1c' },
        teal: { DEFAULT: '#0a7c6e', 50: '#e6f7f5', 100: '#c0ece7', 500: '#0d9b8a', 700: '#085041' },
        gold: { DEFAULT: '#e8a020', 50: '#fef8eb', 300: '#f5c842', 600: '#b87a10' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
