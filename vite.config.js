import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { CURRENT_VERSION } from './src/changelog.js'

// Single source of truth for the app version: the top changelog entry's id
// (src/changelog.js). package.json's "version" must equal it so build tooling and
// Docker image tags read the same number — fail the build fast if they drift.
const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
if (pkg.version !== CURRENT_VERSION) {
  throw new Error(
    `Version mismatch: package.json "version" is ${pkg.version} but the top changelog ` +
    `entry is ${CURRENT_VERSION}. Update package.json to match — they must stay in sync.`,
  )
}

// Stamp the app version into the document <title> by replacing the __APP_VERSION__
// token in index.html. Runs in dev and build so the browser tab always shows it.
function versionHtmlPlugin() {
  return {
    name: 'inject-version',
    transformIndexHtml(html) {
      return html.replace(/__APP_VERSION__/g, CURRENT_VERSION)
    },
  }
}

// No-flash theme bootstrap inline script in index.html (sets data-theme before paint).
const THEME_BOOT_HASH = "'sha256-bUMmeNNa7nKi6t2ICaDVWulLf+Qa0OEHcGPPqrP0gfE='"
const CSP = `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' ${PLAUSIBLE} ${PLAUSIBLE_STUB_HASH} ${THEME_BOOT_HASH}; connect-src 'self' ${PLAUSIBLE}; worker-src 'self'; manifest-src 'self'; base-uri 'self'; object-src 'none'`

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

// Stamp a unique build version into the service worker's cache name. Runs after the
// bundle (and public/ copy) are written, so it rewrites the emitted dist/sw.js. A new
// stamp every build means activate drops the previous cache and re-fetches /data — the
// fix for the "qurangraph-v1 never changes → stale corpus served forever" bug.
function swVersionPlugin() {
  let outDir = 'dist'
  return {
    name: 'sw-version',
    apply: 'build',
    configResolved(cfg) { outDir = cfg.build.outDir },
    closeBundle() {
      const swPath = path.join(outDir, 'sw.js')
      if (!fs.existsSync(swPath)) return
      const ver = `v${Date.now().toString(36)}`
      fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace(/__SW_VERSION__/g, ver))
    },
  }
}

// Pre-compress the built assets (incl. the big public/data JSON — lisan-full is ~15MB)
// to .gz siblings so nginx `gzip_static on` serves them without recompressing on every
// request. Uses Node's built-in zlib, so no extra dependency. (.br/brotli would compress
// the JSON better still, but nginx:alpine has no brotli module — a follow-up that needs a
// custom image; gzip_static is the safe, dependency-free win here.)
function compressPlugin() {
  let outDir = 'dist'
  const COMPRESSIBLE = /\.(js|css|json|svg|xml|webmanifest|html)$/
  const MIN = 1024
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p, out)
      else if (COMPRESSIBLE.test(e.name)) out.push(p)
    }
    return out
  }
  return {
    name: 'precompress-gzip',
    apply: 'build',
    configResolved(cfg) { outDir = cfg.build.outDir },
    closeBundle() {
      if (!fs.existsSync(outDir)) return
      let n = 0
      for (const file of walk(outDir)) {
        const buf = fs.readFileSync(file)
        if (buf.length < MIN) continue
        fs.writeFileSync(`${file}.gz`, zlib.gzipSync(buf, { level: 9 }))
        n++
      }
      console.log(`precompress: wrote ${n} .gz files`)
    },
  }
}

// base: './' → relative asset URLs so the build also works when served from a
// sub-path (e.g. GitHub Pages project sites), not just the domain root.
export default defineConfig({
  base: './',
  plugins: [react(), versionHtmlPlugin(), cspPlugin(), swVersionPlugin(), compressPlugin()],
  build: {
    rollupOptions: {
      output: {
        // Split the long-lived vendor code out of the app chunk so it caches across
        // app deploys, and isolate react-joyride (only pulled in when the tour runs).
        manualChunks(id) {
          if (id.includes('react-joyride')) return 'vendor-joyride'
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react'
          return undefined
        },
      },
    },
  },
  test: {
    // Node by default (pure logic); component tests opt into jsdom per-file via
    // a `// @vitest-environment jsdom` pragma.
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}', 'scripts/**/*.test.js'],
  },
})
