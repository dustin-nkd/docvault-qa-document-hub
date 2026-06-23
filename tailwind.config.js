/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './docvault.js',
    './src/**/*.js'
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
