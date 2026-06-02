/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './frontend/**/*.html',
    './frontend/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        primary:      '#A67C8E',
        'primary-dk': '#8B6175',
        'primary-lt': '#C4A0B0',
        secondary:    '#DDC3A5',
        cream:        '#FAF5F0',
        'text-main':  '#4A2E3A',
        'text-muted': '#9B8090',
      },
      fontFamily: {
        heebo: ['Heebo', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 2px 14px -6px rgba(74,46,58,0.12), 0 1px 4px -2px rgba(74,46,58,0.06)',
      },
    },
  },
  plugins: [],
};
