/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cairo', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#F4FBF8',
          100: '#EAF8F3',
          200: '#D0F2E3',
          300: '#A8E6CC',
          400: '#5CD4A5',
          500: '#00B578',
          600: '#009F69',
          700: '#008F5D',
          800: '#007A4F',
          900: '#005C3A',
        },
        danger: {
          50: '#FEF3F2',
          400: '#F97066',
          500: '#D92D20',
          600: '#B42318',
          700: '#912018',
        },
        ok: {
          50: '#ECFDF3',
          400: '#32D583',
          500: '#12B76A',
          600: '#039855',
          700: '#027A48',
        },
        warn: {
          50: '#FFFAEB',
          500: '#F79009',
          600: '#DC6803',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
      },
    },
  },
  plugins: [],
};
