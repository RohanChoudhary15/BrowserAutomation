/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./sidepanel.html",
    "./popup.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0c0e14',
          850: '#11141c',
          800: '#161a24',
          750: '#1c2230',
          700: '#232a3b',
          600: '#323c52',
          500: '#4b5978'
        },
        accent: {
          blue: '#3b82f6',
          indigo: '#6366f1',
          purple: '#8b5cf6',
          emerald: '#10b981',
          rose: '#f43f5e',
          amber: '#f59e0b'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace', 'ui-monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif']
      }
    },
  },
  plugins: [],
}
