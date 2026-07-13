/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'tch-orange': '#1a8b46',
        'hc-green': '#1a8b46',
        'hc-red': '#c41230',
        'hc-brown': '#d4a574',
        'hc-cream': '#fdf8f0',
        'hc-dark': '#1a1a1a',
        'tch-gray': '#f5f5f5',
        'tch-cream': '#fdf8f0',
      },
    },
  },
  plugins: [],
}