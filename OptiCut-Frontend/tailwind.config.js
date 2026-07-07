/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'ngja-blue': '#1e3a8a',
        'gem-green': '#059669',
      }
    },
  },
  plugins: [],
}