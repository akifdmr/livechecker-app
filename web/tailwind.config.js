/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0f0f0f',
          card: '#1a1a1a',
          input: '#0d0d0d',
        },
        border: {
          DEFAULT: '#333',
          light: '#444',
        },
        accent: '#4CAF50',
        live: '#4CAF50',
        dead: '#f44336',
        info: '#64B5F6',
        warn: '#FFC107',
      },
    },
  },
  plugins: [],
}