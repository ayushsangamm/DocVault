/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#09090b',
        surface: {
          DEFAULT: '#121214',
          subtle: '#18181b',
          elevated: '#1f1f23',
        },
        border: 'rgba(39, 39, 42, 0.8)',
        accent: {
          DEFAULT: '#FF3B5C',
          hover: '#E02345',
          muted: 'rgba(255, 59, 92, 0.15)',
          glow: 'rgba(255, 59, 92, 0.35)',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
};
