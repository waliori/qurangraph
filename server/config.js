/* ═══ API configuration ═══
 *
 * Everything the server can be tuned with, read once from the environment. Defaults are
 * chosen so `node server/index.js` in a checkout Just Works with no env at all: open
 * access, generous rate limit, data read from public/data, UI links pointing at the
 * production app.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
const bool = (v, d) => (v === undefined || v === "" ? d : /^(1|true|yes|on)$/i.test(String(v)));

/* API_KEYS is a comma-separated list; each entry is either a bare key or `label:key`,
 * so a shared key can be attributed in the logs without a database. Empty ⇒ the API is
 * OPEN (no key required) — the deliberate launch posture. Set it later and every request
 * must carry `X-API-Key` (or `?api_key=`); nothing else about the API changes. */
function parseKeys(raw) {
  const out = new Map(); // key → label
  for (const entry of String(raw || "").split(",")) {
    const s = entry.trim();
    if (!s) continue;
    const i = s.lastIndexOf(":");
    if (i > 0) out.set(s.slice(i + 1).trim(), s.slice(0, i).trim());
    else out.set(s, "anonymous-key");
  }
  return out;
}

export const config = {
  port: num(process.env.API_PORT, 8080),
  host: process.env.API_HOST || "0.0.0.0",

  // Where the derived corpus JSON lives (the same tree the app serves at /data).
  dataDir: process.env.API_DATA_DIR || path.join(REPO, "public", "data"),

  // Base URL of the UI, used to build every `ui` deep link in a response. Must end in "/"
  // (or a path the app is served from); the state travels in the fragment after it.
  appBase: (process.env.API_APP_BASE || "https://ayat.network/").replace(/#.*$/, ""),

  // Public base of the API itself, for `self` links + the OpenAPI server block.
  publicBase: (process.env.API_PUBLIC_BASE || "https://ayat.network/api/v1").replace(/\/+$/, ""),

  keys: parseKeys(process.env.API_KEYS),

  // Per-IP request budget, fixed window. Anonymous callers get the lower one; a request
  // carrying a valid key gets the higher. 0 disables the limiter entirely.
  rateLimit: num(process.env.API_RATE_LIMIT, 600),
  rateLimitKeyed: num(process.env.API_RATE_LIMIT_KEYED, 6000),
  rateWindowMs: num(process.env.API_RATE_WINDOW_MS, 60 * 60 * 1000),

  // Trust X-Forwarded-For for the client IP (true behind nginx / Nginx Proxy Manager).
  trustProxy: bool(process.env.API_TRUST_PROXY, true),

  // Hard ceilings so one request can't ask for the whole corpus in a single page.
  maxLimit: num(process.env.API_MAX_LIMIT, 500),
  defaultLimit: num(process.env.API_DEFAULT_LIMIT, 50),

  // How many lexicon full-article shards to keep resident (each is a few hundred KB).
  lexiconShardCache: num(process.env.API_LEXICON_SHARD_CACHE, 24),

  cacheSeconds: num(process.env.API_CACHE_SECONDS, 3600),
  logRequests: bool(process.env.API_LOG, true),
  repoRoot: REPO,
};

export const keysEnforced = () => config.keys.size > 0;
