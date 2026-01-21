/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  safelist: [
    'text-green-600',
    'text-yellow-600',
    'text-orange-600',
    'text-red-600',
    'text-gray-400',
    'text-gray-800',
    'bg-green-50',
    'bg-yellow-50',
    'bg-orange-50',
    'bg-red-50',
    'bg-gray-50',
    'border-green-300',
    'border-yellow-300',
    'border-orange-300',
    'border-red-300',
    'border-gray-300'
  ],
  theme: {
    extend: {
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.75rem' }], // 10px
        '3xs': ['0.5rem', { lineHeight: '0.625rem' }],  // 8px
      }
    },
  },
  plugins: [],
}