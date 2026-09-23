/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/pwa/**/*.html', './src/pwa/**/*.js'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        spt: {
          bg: '#0b0d10',
          panel: '#14171c',
          line: '#262b33',
          text: '#e6e9ee',
          muted: '#9aa3ad',
          accent: '#4f8cff',
        },
      },
      maxWidth: {
        content: '52rem',
        wide: '74rem',
      },
    },
  },
  plugins: [],
};
