/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './docvault.html',
    './docvault.js',
    './popup.html',
    './popup.js',
    './index.txt'
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Space Grotesk', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
      }
    }
  },
  plugins: [],
}
