/** @type {import('tailwindcss').Config} */
// content/theme must mirror the runtime `tailwind.config = {...}` this file
// replaces (previously set inline in index.html for the CDN JIT compiler —
// see Sprint 22 optimization audit). The live app is index.html + js/**/*.js
// + storage.js; legacy sources are intentionally excluded.
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
