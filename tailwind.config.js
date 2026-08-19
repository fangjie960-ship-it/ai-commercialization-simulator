/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0F1117',
        card: '#1C1E26',
        accent: '#3B82F6',
      }
    },
  },
  plugins: [],
}
