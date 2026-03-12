/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'tch-orange': '#ea8025',
        'tch-gray': '#f5f5f5',
        'tch-cream': '#fff7e6',
      },
    },
  },
  plugins: [],
}