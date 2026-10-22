const blueAccent = {
  50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
  400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
  800: '#1e40af', 900: '#1e3a8a', 950: '#172554',
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,mjs,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Be Vietnam Pro"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Fira Code', 'Consolas', 'monospace'],
      },
      colors: {
        // Keep legacy utility names so the visual refresh stays independent of feature code.
        primary: blueAccent,
        emerald: blueAccent,
        teal: blueAccent,
        slate: {
          850: '#151e2e',
          950: '#0a0f1d',
        }
      },
      boxShadow: {
        'soft': '0 2px 10px -2px rgba(15, 23, 42, 0.05), 0 1px 3px -1px rgba(15, 23, 42, 0.03)',
        'card': '0 4px 20px -2px rgba(15, 23, 42, 0.06)',
      }
    },
  },
  plugins: [],
}
