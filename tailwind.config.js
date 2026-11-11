/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        carbon: '#0E0E0C',
        paper: '#EEECE5',
        steel: '#8B9096',
        muted: '#5C6065',
        signal: '#F2B705',
        alert: '#C2362B',
        'admin-white': 'var(--admin-white, #FFFFFF)',
        'admin-black': 'var(--admin-black, #111111)',
        'admin-accent': 'var(--admin-accent, #FFBD59)',
        'admin-muted': 'var(--admin-muted, rgba(17, 17, 17, 0.64))',
        'admin-line': 'var(--admin-line, rgba(17, 17, 17, 0.14))',
      },
      fontFamily: {
        condensed: ['"IBM Plex Sans Condensed"', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        island: '0 8px 24px rgba(14,14,12,0.25)',
      },
      borderRadius: {
        btn: '4px',
        island: '999px',
      },
    },
  },
  plugins: [],
}

