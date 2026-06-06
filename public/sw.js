/* ═══ Service worker — offline-first ═══
 *
 * Strategy:
 *   - Navigations: network-first, falling back to the cached app shell (so the
 *     SPA opens offline; deep-link hashes are client-side so any path works).
 *   - Same-origin GET (built JS/CSS/fonts, /data/*.json): stale-while-revalidate
 *     — serve from cache instantly, refresh in the background. After the first
 *     visit the whole app + the data it has touched work offline.
 * Hashed asset filenames mean we cache-on-fetch rather than precache a fixed list;
 * the cache name is versioned so a new deploy drops the old one on activate. The
 * huge full-article files (lisan-full ~15MB) are cached only if actually fetched.
 */
const CACHE = "qurangraph-v1";
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
