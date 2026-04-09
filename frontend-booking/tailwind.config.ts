import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy: '#0a2240',
        teal: '#0a7c6e',
        gold: '#e8a020',
      },
    },
  },
  plugins: [],
};
export default config;
