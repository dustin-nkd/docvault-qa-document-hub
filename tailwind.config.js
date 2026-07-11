/** @type {import('tailwindcss').Config} */
// content/theme must mirror the runtime `tailwind.config = {...}` this file
// replaces (previously set inline in index.html for the CDN JIT compiler —
// see Sprint 22 optimization audit). docvault.js/src/**/*.js are dead legacy
// paths from an earlier abandoned Vite setup; the live app is index.html +
// js/**/*.js + storage.js.
export default {
  content: [
    './index.html',
    './js/**/*.js',
    './storage.js'
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Space Grotesk', 'sans-serif'],
        sans: ['DM Sans', 'sans-serif'],
      }
    }
  },
  plugins: [],
}
