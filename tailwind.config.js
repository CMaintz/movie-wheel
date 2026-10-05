/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Bungee', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#e63946',
          light: '#ff7b84',
          dark: '#b5121f',
        },
        secondary: {
          DEFAULT: '#f4b400',
          light: '#ffd23f',
          dark: '#d18f00',
        },
        bg: {
          default: '#0d0a12',
          paper: '#18131f',
        },
        text: {
          secondary: '#b3b3b3',
        },
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-out forwards',
        slideUp: 'slideUp 0.3s ease-out forwards',
      },
    },
  },
  plugins: [],
};
