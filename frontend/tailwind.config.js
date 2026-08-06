/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#F0F6FF',
          100: '#E0EDFF',
          200: '#B8D8FF',
          300: '#85BEFF',
          400: '#4D9EFF',
          500: '#0066FF',
          600: '#0052CC',
          700: '#003D99',
          800: '#002966',
          900: '#001433',
        },
        surface: {
          50: '#F8FAFC',
          100: '#F4F6F9',
          200: '#E2E8F0',
        },
        brand: {
          blue: '#0066FF',
          'blue-dark': '#0052CC',
          'blue-light': '#F0F6FF',
          'text-normal': '#475569',
          'text-active': '#0066FF',
          'border': '#E2E8F0',
          'bg': '#F8FAFC',
          'bg-alt': '#F4F6F9',
        },
      },
      borderRadius: {
        'card': '12px',
        'pill': '9999px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.05)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
}
