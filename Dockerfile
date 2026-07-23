# syntax=docker/dockerfile:1

# ── Stage 1: build the data + the app ──────────────────────────────────────
# The raw corpora in data/source/ are copied in (they're tracked in git), the
# derived JSON the app serves is reconstructed from them offline — no network
# download at build time — and then Vite builds the static site.
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies first so this layer is cached across source changes.
COPY package.json package-lock.json ./
RUN npm ci

# App sources + the raw corpora needed to build the data.
COPY data ./data
COPY scripts ./scripts
COPY public ./public
COPY src ./src
COPY index.html vite.config.js ./

# Reconstruct the derived data (Tanzil → quran-hafs.json; morphology + Maqāyīs
# → roots / meanings), then build the production bundle into /app/dist. The
# corpora are expected in data/source/ (tracked in git); if they're missing
# they're downloaded as a fallback so the image still builds from a bare clone.
RUN if [ ! -s data/source/maqayis.txt ] || [ ! -s data/source/quran-morphology.txt ] || [ ! -s data/source/tanzil-uthmani.xml ]; then \
      echo "data/source/ missing — downloading corpora" && npm run data:download; \
    fi \
 && npm run data:transform \
 && npm run data:roots \
 && npm run data:lexicons \
 && npm run data:semantic \
 && npm run data:relations \
 && npm run data:expressions \
 && npm run data:mutashabihat \
 && npm run data:munasabat \
 && npm run data:iltifat \
 && npm run data:manifest \
 && npm run build

# ── Stage 2a: the HTTP API ─────────────────────────────────────────────────
# A plain Node process serving /api/v1 from the SAME derived data the site ships, using
# the app's own pure modules (src/analytics, src/graph, src/search…) so an API answer and
# the on-screen answer are computed by one implementation. It has no runtime npm
# dependencies, so nothing is installed here — only sources + data are copied in.
FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production API_PORT=8080 API_HOST=0.0.0.0
COPY package.json ./
COPY src ./src
COPY server ./server
COPY --from=builder /app/public/data ./public/data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD wget -qO- http://127.0.0.1:8080/api/v1/health >/dev/null 2>&1 || exit 1
CMD ["node", "server/index.js"]

# ── Stage 2b: static runtime ───────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
