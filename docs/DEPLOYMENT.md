# Deployment & operations

The app itself is a static, fully client-side bundle — build it and serve `dist/`
from any static host. The **only** server-side piece is an optional tiny proxy that
backs the AI assistant's free shared tier (see *Assistant* below); the app, and the
assistant's bring-your-own-key path, work with no server at all. Below: the PWA, the
Docker image, the nginx config, the CSP, the assistant proxy, and CI.

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

Two-stage build:

1. **builder** (`node:22-alpine`) — `npm ci`, copies `data/source/` + `scripts/` +
   app, **reconstructs the data offline** from the tracked corpora (downloading
   only as a fallback if a corpus is missing), then `npm run build`.
2. **runtime** (`nginx:1.27-alpine`) — serves `/app/dist` with the nginx config
   below; includes a `HEALTHCHECK`.

```bash
docker build -t qurangraph .
docker run -p 8080:80 qurangraph
```

### nginx caching (`docker/nginx.conf`)

| Path | Cache-Control | Why |
|------|---------------|-----|
| `/assets/*` | `public, immutable`, 1 year | content-hashed filenames |
| `/data/*` | `public, max-age=3600` | precomputed corpus, revalidate hourly |
| `/sw.js` | `no-cache` | a stale SW would pin an old app across deploys |
| `/` + SPA fallback | `no-cache` | always pick up a new deploy's fingerprinted bundle |

gzip is on for the JSON/JS/CSS/SVG/manifest payloads (the data files are large).

---

## Assistant (cloud LLM) — `docker-compose.yml`, `proxy/`

The assistant talks to a hosted model over an OpenAI-compatible endpoint. Two paths:

- **Free shared tier** — the browser POSTs to the same-origin `/api/chat`, which the
  qurangraph nginx reverse-proxies to the **`ai-proxy`** container (`proxy/proxy.mjs`,
  zero dependencies). The proxy injects the project's Gemini key, **rate-limits per
  client IP** (default 20/day, in-memory), and streams the SSE response back. The key
  lives only on the server, never in the bundle.
- **Bring your own key (BYOK)** — the browser calls the provider (Gemini / OpenRouter /
  Groq) **directly** with the user's key; nothing transits our server. Providers and
  their endpoints live in `src/ai/cloudModels.js`.

Deploy with Compose (the static app + the proxy together):

```bash
cp .env.example .env          # set GEMINI_API_KEY (from https://aistudio.google.com/apikey)
docker compose up -d --build
```

`.env` knobs: `GEMINI_API_KEY` (required for the free tier), `GEMINI_MODEL`
(default `gemini-2.5-flash`), `TOKEN_BUDGET_PER_DAY` (default 100000 — per-IP daily
**token** budget; the real ceiling is Gemini's own free-tier quota), and optional
`STATS_TOKEN` (enables the owner-only usage endpoint). To run **BYOK-only** with no
free tier, comment out the `ai-proxy` service — `/api/*` then 502s and the app falls
back to BYOK. The proxy is never published; it's reachable only by nginx over the
compose-internal network. Endpoints: `GET /api/health`, `GET /api/quota` (tokens
left today), `POST /api/chat`, and `GET /api/stats?token=…` (unique IPs / requests /
tokens today; 404 unless `STATS_TOKEN` is set and matches).

---

## Content Security Policy

Injected into the **built** `index.html` by a Vite plugin (`cspPlugin` in
`vite.config.js`) — not in the source HTML, so the dev server's HMR (inline
scripts + websocket) still works. The policy is strict: `script-src 'self'`,
`worker-src 'self'`, `object-src 'none'`. `connect-src` allows same-origin (the JSON
data + the `/api` free-tier proxy) plus the BYOK provider hosts
(`generativelanguage.googleapis.com`, `openrouter.ai`, `api.groq.com`) so the browser
can call them directly. The **optional** deep-semantic embeddings (Transformers.js)
add `huggingface.co`/`cdn.jsdelivr.net` and `blob:`/`wasm-unsafe-eval` for their
onnxruntime worker. `style-src`/`font-src` allow Google Fonts for the Arabic/Qurʾān
faces; `img-src` allows `data:` (the PNG export pipeline).

---

## CI (`.github/workflows/ci.yml`)

Runs on push to `main`/`simple-graph` and on every PR. Two jobs:

- **build** (Node 20) — `npm ci` → `lint` → `test` → `build`.
- **docker** — builds the production image end-to-end with BuildKit + GitHub
  Actions cache. This is the only job that exercises the Dockerfile's
  data-reconstruction stage (Tanzil → JSON, morphology → roots, lexicons), so a
  break there is caught in CI rather than at deploy time.
