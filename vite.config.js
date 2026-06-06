import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Inject a Content-Security-Policy meta tag into the *built* HTML only. Doing it
// here (rather than in index.html) keeps the dev server working — Vite's HMR
// relies on inline scripts and a websocket that a strict `script-src 'self'`
// would block. The app loads only same-origin JSON and uses React inline styles,
// hence connect-src 'self' and style-src 'unsafe-inline'. The Arabic/Qur'an
// faces come from Google Fonts, so its stylesheet host (fonts.googleapis.com)
// and font host (fonts.gstatic.com) are allowed for style-src / font-src.
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'self'; object-src 'none'"

function cspPlugin() {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '</title>',
        `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      )
    },
  }
}

// base: './' → relative asset URLs so the build also works when served from a
// sub-path (e.g. GitHub Pages project sites), not just the domain root.
export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin()],
  test: {
    // Node by default (pure logic); component tests opt into jsdom per-file via
    // a `// @vitest-environment jsdom` pragma.
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}', 'scripts/**/*.test.js'],
  },
})
