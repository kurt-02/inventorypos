/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Neutral UI scale. Surfaces are white; the page sits on ink-100 so
        // cards read as raised without needing heavy borders or shadows.
        ink: {
          50: '#F8FAFC',
          100: '#F1F4F8',
          200: '#E4E9F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#4B5769',
          700: '#374151',
          800: '#232B38',
          900: '#131922',
        },
        // Single action accent. Industry-neutral so the app suits any business.
        brand: {
          50: '#EEF3FF',
          100: '#DCE5FD',
          400: '#7191F0',
          500: '#3B62D9',
          600: '#2F4EB8',
          700: '#26409A',
        },
        // Revenue and positive movement.
        success: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          500: '#0F8A5F',
          600: '#0B6E4C',
        },
        // Low stock, voids, destructive actions.
        danger: {
          50: '#FEF2F2',
          100: '#FCE0E0',
          500: '#C93838',
          600: '#A82C2C',
        },
        // Advisory states that are neither good nor bad.
        warn: {
          50: '#FFFBEB',
          100: '#FDF0C8',
          500: '#B45309',
          700: '#92400E',
        },
      },
      fontFamily: {
        sans: ['Karla', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
