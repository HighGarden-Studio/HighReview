/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Light theme - Tailwind Slate with high contrast
        light: {
          bg: '#f8fafc',           // slate-50
          surface: '#ffffff',       // white
          'surface-elevated': '#f1f5f9', // slate-100
          border: '#e2e8f0',        // slate-200
          text: {
            primary: '#0f172a',     // slate-900 - much darker for better readability
            secondary: '#334155',   // slate-700 - darker secondary text
            muted: '#64748b',       // slate-500
          },
          accent: {
            primary: '#3b82f6',     // blue-500
            secondary: '#8b5cf6',   // violet-500
            success: '#10b981',     // emerald-500
            warning: '#f59e0b',     // amber-500
            error: '#ef4444',       // red-500
          }
        },
        // Dark theme - Tailwind Slate with high contrast
        dark: {
          bg: '#020617',            // slate-950
          surface: '#0f172a',       // slate-900
          'surface-elevated': '#1e293b', // slate-800
          border: '#334155',        // slate-700
          text: {
            primary: '#f8fafc',     // slate-50 - much brighter for better readability
            secondary: '#cbd5e1',   // slate-300 - brighter secondary text
            muted: '#94a3b8',       // slate-400
          },
          accent: {
            primary: '#60a5fa',     // blue-400
            secondary: '#a78bfa',   // violet-400
            success: '#34d399',     // emerald-400
            warning: '#fbbf24',     // amber-400
            error: '#f87171',       // red-400
          }
        }
      },
      animation: {
        'scanner': 'scanner 3s ease-in-out infinite',
        'slow-spin': 'spin 3s linear infinite',
        'reverse-spin': 'reverse-spin 2s linear infinite',
      },
      keyframes: {
        scanner: {
          '0%, 100%': { transform: 'translateY(-30px)', opacity: '0' },
          '50%': { transform: 'translateY(30px)', opacity: '1' },
        },
        'reverse-spin': {
          from: { transform: 'rotate(360deg)' },
          to: { transform: 'rotate(0deg)' },
        }
      }
    }
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
