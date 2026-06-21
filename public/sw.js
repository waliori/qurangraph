/* ═══ Service worker — offline-first ═══
 *
 * Strategy:
 *   - Navigations: network-first, falling back to the cached app shell (so the
 *     SPA opens offline; deep-link hashes are client-side so any path works).
 *   - Same-origin GET (built JS/CSS/fonts, /data/*.json): stale-while-revalidate
 *     — serve from cache instantly, refresh in the background. After the first
 *     visit the whole app + the data it has touched work offline.
 * Hashed asset filenames mean we cache-on-fetch rather than precache a fixed list;
 * the cache name carries a BUILD VERSION (injected at build time, see the sw-version
 * plugin in vite.config.js) so every deploy drops the previous cache on activate and
 * re-fetches everything — including the unhashed /data/*.json, which would otherwise
 * stay stale forever behind stale-while-revalidate. The huge full-article files
 * (lisan-full ~15MB) are cached only if actually fetched.
 *
 * __SW_VERSION__ is replaced with the build stamp; if it's left verbatim (dev), the
 * SW isn't registered anyway (main.jsx gates registration to production builds).
 */
const CACHE = "qurangraph-__SW_VERSION__";
const SHELL = "./index.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([SHELL, "./"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin (fonts CDN) pass through

  // The intro videos stream via HTTP range requests; let the browser handle them
  // natively. Caching them would choke on 206 partial responses and bloat the
  // cache with tens of MB the user may only watch once.
  if (url.pathname.endsWith(".mp4")) return;

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match(SHELL)));
    return;
  }

  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
        return cached || network;
      })
    )
  );
});
