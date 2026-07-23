/* ═══ Access control ═══
 *
 * Two independent gates, both off-by-default-friendly:
 *
 *   1. API keys — enforced only when API_KEYS is set. Until then the API is open, which
 *      is the launch posture: anyone can call it, no signup. Setting API_KEYS later turns
 *      the same deployment into a keyed one with no code change; existing clients then
 *      need `X-API-Key: …` (or `?api_key=…`, for links and curl one-liners).
 *
 *   2. Rate limit — always on (unless API_RATE_LIMIT=0). A fixed window per IP, in
 *      memory: it survives nothing, which is fine — it exists to stop a runaway script,
 *      not a determined adversary. Requests carrying a valid key get the higher budget.
 *
 * Key comparison is timing-safe, and unknown keys are compared against a same-length
 * dummy so a wrong key costs the same as a right one.
 */

import crypto from "node:crypto";
import { config, keysEnforced } from "./config.js";
import { ApiError, clientIp } from "./http.js";

function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  if (A.length !== B.length) { crypto.timingSafeEqual(A, A); return false; }
  return crypto.timingSafeEqual(A, B);
}

/* Presented key → its label, or null. */
export function identify(req, url) {
  const header = req.headers["x-api-key"];
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "")?.[1];
  const presented = (header || bearer || url.searchParams.get("api_key") || "").trim();
  if (!presented) return null;
  for (const [key, label] of config.keys) if (safeEqual(key, presented)) return { key, label };
  return { key: presented, label: null, invalid: true };
}

export function requireKey(identity) {
  if (!keysEnforced()) return;
  if (!identity || identity.invalid) {
    throw new ApiError(401, "unauthorized", "A valid API key is required.",
      "Send it as the X-API-Key header (or ?api_key=…). Ask for one at waliori@gmail.com.");
  }
}

/* ── Fixed-window limiter ── */
const buckets = new Map(); // id → { count, resetAt }

export function rateLimit(req, url, identity) {
  const budget = identity && !identity.invalid ? config.rateLimitKeyed : config.rateLimit;
  if (!budget) return null;
  const id = identity && !identity.invalid ? `k:${identity.key}` : `i:${clientIp(req)}`;
  const now = Date.now();
  let b = buckets.get(id);
  if (!b || b.resetAt <= now) buckets.set(id, (b = { count: 0, resetAt: now + config.rateWindowMs }));
  b.count++;
  const remaining = Math.max(0, budget - b.count);
  const headers = {
    "X-RateLimit-Limit": String(budget),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(b.resetAt / 1000)),
  };
  if (b.count > budget) {
    const err = new ApiError(429, "rate_limited",
      `Rate limit exceeded (${budget} requests per ${Math.round(config.rateWindowMs / 60000)} minutes).`,
      keysEnforced() ? "Use your API key for a higher budget." : "Retry after the window resets.");
    err.headers = { ...headers, "Retry-After": String(Math.ceil((b.resetAt - now) / 1000)) };
    throw err;
  }
  return headers;
}

/* Drop expired buckets so a long-running process doesn't accumulate one entry per IP
 * that ever called. Cheap: the map is small and this runs once a window. */
export function startLimiterSweep() {
  const t = setInterval(() => {
    const now = Date.now();
    for (const [id, b] of buckets) if (b.resetAt <= now) buckets.delete(id);
  }, Math.max(60_000, config.rateWindowMs));
  t.unref?.();
  return t;
}

/* `npm run api:key` — mint a key to paste into API_KEYS. */
export function generateKey(label = "client") {
  return `${label}:ayat_${crypto.randomBytes(24).toString("base64url")}`;
}
