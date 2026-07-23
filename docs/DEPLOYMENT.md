# Deployment & operations

The **app** is a static, fully client-side bundle: build it and serve `dist/` from any
static host. The **API** ([API.md](API.md)) is the one server-side piece — a dependency-free
Node process that the site's nginx proxies `/api/` to. Deploying only the static site
still works; `/api/` then answers 503 and nothing else changes. Below: the PWA, the Docker
images, the nginx config, the CSP, and CI.

---

## Build output

```bash
npm run build      # → dist/  (fingerprinted assets + public/data copied in)
npm run preview    # serve dist/ locally
```

`vite.config.js` sets `base: './'` so asset URLs are **relative** — the build works
served from a domain root *or* a sub-path (project Pages site) unchanged.

> Reconstruct `public/data/` first (it's gitignored) — see [DATA.md](DATA.md).

---

## PWA / offline (`public/sw.js`, `public/manifest.webmanifest`)

Registered from `main.jsx` in production only. The service worker is
offline-first:

- **install** — pre-caches the app shell (`/`, `index.html`).
- **activate** — drops old versioned caches (`qurangraph-v1`), so a new deploy
  doesn't serve stale chunks.
- **fetch**:
  - navigations → network-first, falling back to the cached shell (offline deep
    links work).
  - same-origin GET assets/data → **stale-while-revalidate** (instant from cache,
    refreshed in the background).
  - cross-origin (the Google Fonts) → pass through, uncached.

Net effect: after the first visit the app and any data you've touched work fully
offline. The manifest makes it installable as a standalone, RTL Arabic app
(`name: آيات.network …`, `theme_color`/`background_color` `#070a12`, SVG icons).

---

## Docker (`Dockerfile`, `docker/nginx.conf`)

Three stages, two shipped images:

1. **builder** (`node:22-alpine`) — `npm ci`, copies `data/source/` + `scripts/` +
   app, **reconstructs the data offline** from the tracked corpora (downloading
   only as a fallback if a corpus is missing), then `npm run build`.
2. **api** (`node:22-alpine`) — `package.json` + `src/` + `server/` + the builder's
   `public/data/`. No `npm install`: the API has no runtime dependencies, only the app's
   own pure modules. Runs as the `node` user, health-checks `/api/v1/health`.
3. **runtime** (`nginx:1.27-alpine`) — serves `/app/dist` with the nginx config
   below; includes a `HEALTHCHECK`.

```bash
docker compose up -d --build            # both services
docker build --target runtime -t qurangraph .   # or just the site
docker run -p 8080:80 qurangraph
```

### The two services (`docker-compose.yml`)

| Service | Image | Networks |
|---------|-------|----------|
| `qurangraph` | nginx + `dist/` | `proxy_network` (Nginx Proxy Manager) + `qurangraph_internal` |
| `qurangraph-api` | Node, `/api/v1` on :8080 | `qurangraph_internal` only |

The API is deliberately **not** on `proxy_network`: it is reached only through the site's
own nginx, so there is one hostname, one certificate and no second Proxy Manager entry.
nginx resolves it by **container name** (`qurangraph-api`) — rename one and you must
rename the other (`docker/nginx.conf`).

Configure the API through the compose `environment:` block (all optional, all documented
in [API.md](API.md#configuration)). The two that matter in production:

```bash
API_APP_BASE=https://ayat.network/          # where the ui… deep links point
API_PUBLIC_BASE=https://ayat.network/api/v1 # self links + the OpenAPI server block
API_KEYS=                                   # empty = open access
```

### nginx → API (`docker/nginx.conf`)

`location /api/` proxies to `http://qurangraph-api:8080`, resolving the name per request
through Docker's embedded DNS (`resolver 127.0.0.11`) rather than at startup. With a
literal `proxy_pass`, nginx refuses to boot while the API container is down — an API
restart would take the whole site with it. If the API is unreachable, `@api_unavailable`
returns a 503 **in the API's own error shape**, so a client parses it like any other error.

`X-Forwarded-For` is passed through and the API trusts it (`API_TRUST_PROXY=true`) for
per-IP rate limiting.

The service worker skips `/api/` entirely (`public/sw.js`) — stale-while-revalidate would
hand callers yesterday's answer and hide 401/429 responses.

### nginx caching (`docker/nginx.conf`)

| Path | Cache-Control | Why |
|------|---------------|-----|
| `/assets/*` | `public, immutable`, 1 year | content-hashed filenames |
| `/data/*` | `public, max-age=3600` | precomputed corpus, revalidate hourly |
| `/changelog/*` | `public, max-age=86400` | demo clips — and a **missing one 404s** instead of falling through to the SPA, so the What's New player can drop a figure whose clip isn't filmed yet |
| `/sw.js` | `no-cache` | a stale SW would pin an old app across deploys |
| `/` + SPA fallback | `no-cache` | always pick up a new deploy's fingerprinted bundle |

gzip is on for the JSON/JS/CSS/SVG/manifest payloads (the data files are large).

---

## Content Security Policy

Injected into the **built** `index.html` by a Vite plugin (`cspPlugin` in
`vite.config.js`) — not in the source HTML, so the dev server's HMR (inline
scripts + websocket) still works. The policy is strict: `script-src 'self'`,
`connect-src 'self'` (only same-origin JSON), `worker-src 'self'` (the sim
worker), `object-src 'none'`. `style-src`/`font-src` additionally allow Google
Fonts (`fonts.googleapis.com` / `fonts.gstatic.com`) for the Arabic/Qurʾān faces;
`img-src` allows `data:` (the PNG export pipeline).

---

## CI (`.github/workflows/ci.yml`)

Runs on push to `main`/`simple-graph` and on every PR. Two jobs:

- **build** (Node 20) — `npm ci` → `lint` → `test` → `build`.
- **docker** — builds the production image end-to-end with BuildKit + GitHub
  Actions cache. This is the only job that exercises the Dockerfile's
  data-reconstruction stage (Tanzil → JSON, morphology → roots, lexicons), so a
  break there is caught in CI rather than at deploy time.
