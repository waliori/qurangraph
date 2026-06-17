/* ═══ QuranGraph AI free-tier proxy ═══
 *
 * A tiny, dependency-free Node server that backs the assistant's "free shared tier". The
 * browser POSTs OpenAI-style chat messages to /api/chat; this proxy injects the project's
 * Gemini API key (held here as a secret, never shipped to the browser), meters a per-IP daily
 * TOKEN budget, and streams the model's SSE response straight back. BYOK requests never reach
 * here — the browser calls the provider directly for those.
 *
 * Endpoints:
 *   GET  /api/health  → { ok: true }
 *   GET  /api/quota   → { unit:"tokens", limit, remaining, resetAt }   (this IP's daily budget)
 *   GET  /api/stats   → { uniqueIpsToday, requestsToday, tokensToday, … }  (owner-only; gated by
 *                        STATS_TOKEN — disabled with 404 unless ?token=<STATS_TOKEN> matches)
 *   POST /api/chat    → text/event-stream (OpenAI-compatible deltas), or a JSON error
 *
 * Config (env):
 *   GEMINI_API_KEY        required — the shared key (from https://aistudio.google.com/apikey)
 *   GEMINI_MODEL          default "gemini-2.5-flash"
 *   GEMINI_BASE_URL       default Google's OpenAI-compatible endpoint root
 *   TOKEN_BUDGET_PER_DAY  default 100000 (total prompt+completion tokens per IP per UTC day)
 *   MAX_TOKENS            default 1536 (hard cap on a single response, whatever the client asks)
 *   REASONING_EFFORT      default "none" (disables Gemini's thinking); "low"/"medium"/"high" re-enables
 *   STATS_TOKEN           optional — enables /api/stats when set; the caller must pass ?token=…
 *   PORT                  default 8080
 *
 * Metering is in-memory: simple, zero-dependency, resets if the container restarts — fine for a
 * hobby free tier. We meter TOKENS (not request count) because that's the real cost driver and
 * what Gemini's own free-tier quota is measured in. Swap in Redis/SQLite to survive restarts or
 * scale past one instance. NOTE: the daily ceiling is ultimately Gemini's own free-tier quota
 * (per-minute + per-day request/token caps, which change — check AI Studio); this per-IP budget
 * just rations YOUR project's shared allowance so one visitor can't drain it.
 */
import http from "node:http";

const API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const BASE_URL = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/").replace(/\/?$/, "/");
const TOKEN_BUDGET = Number(process.env.TOKEN_BUDGET_PER_DAY || 100000);
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 1536);
// "none" disables Gemini 2.5's hidden "thinking" pass — for this terse lexical assistant it
// only burned tokens (often 10×+ the visible answer) and truncated replies. Set "low"/"medium"/
// "high" to re-enable thinking. Empty string → don't send the field at all.
const REASONING_EFFORT = process.env.REASONING_EFFORT ?? "none";
const STATS_TOKEN = process.env.STATS_TOKEN || "";
const PORT = Number(process.env.PORT || 8080);
const MAX_BODY = 256 * 1024; // reject oversize request bodies

if (!API_KEY) {
  console.error("FATAL: GEMINI_API_KEY is not set. Refusing to start.");
  process.exit(1);
}

// ── Per-IP daily token meter (in-memory) ──
const buckets = new Map(); // ip → { tokens, requests, resetAt }
function nextUtcMidnight() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
}
function getBucket(ip) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now >= b.resetAt) { b = { tokens: 0, requests: 0, resetAt: nextUtcMidnight() }; buckets.set(ip, b); }
  return b;
}
// Drop expired buckets so the Map can't grow unbounded.
function sweep() {
  const now = Date.now();
  for (const [ip, b] of buckets) if (now >= b.resetAt) buckets.delete(ip);
}

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.headers["x-real-ip"] || req.socket.remoteAddress || "unknown";
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Pull complete SSE `data:` payloads out of a text buffer; return the trailing partial as rest.
function sseEvents(buf) {
  const events = [];
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    let line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    line = line.trim();
    if (line.startsWith("data:")) events.push(line.slice(5).trim());
  }
  return { events, rest: buf };
}

// Total tokens from a usage-bearing SSE frame, else 0.
function usageTotal(data) {
  if (data === "[DONE]") return 0;
  let u;
  try { u = JSON.parse(data)?.usage; } catch { return 0; }
  if (!u) return 0;
  return (u.total_tokens ?? ((u.prompt_tokens || 0) + (u.completion_tokens || 0))) || 0;
}

async function handleChat(req, res) {
  const ip = clientIp(req);
  const bucket = getBucket(ip);
  if (bucket.tokens >= TOKEN_BUDGET) {
    return sendJson(res, 429, { error: `Daily free-tier budget of ${TOKEN_BUDGET} tokens reached. Resets at ${new Date(bucket.resetAt).toISOString()}. Add your own API key to keep going.` });
  }

  let payload;
  try { payload = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: "Invalid JSON body." }); }
  if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
    return sendJson(res, 400, { error: "Expected { messages: [...] }." });
  }

  // Build the upstream request: force OUR model + streaming + usage reporting, clamp max_tokens,
  // pass through only the messages and temperature. Never trust the client to pick model or key.
  const upstreamBody = {
    model: MODEL,
    messages: payload.messages,
    stream: true,
    stream_options: { include_usage: true },
    temperature: typeof payload.temperature === "number" ? payload.temperature : 0.3,
    max_tokens: Math.min(Number(payload.max_tokens) || MAX_TOKENS, MAX_TOKENS),
  };
  if (REASONING_EFFORT) upstreamBody.reasoning_effort = REASONING_EFFORT;

  let upstream;
  try {
    upstream = await fetch(BASE_URL + "chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(upstreamBody),
    });
  } catch (e) {
    return sendJson(res, 502, { error: `Upstream request failed: ${String(e?.message || e)}` });
  }

  if (!upstream.ok || !upstream.body) {
    const txt = await upstream.text().catch(() => "");
    let msg = "";
    try { msg = JSON.parse(txt)?.error?.message || ""; } catch { /* plain */ }
    return sendJson(res, upstream.status === 429 ? 429 : 502, { error: msg || `Upstream error (${upstream.status}).` });
  }

  bucket.requests += 1;
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // belt-and-braces: also disabled in nginx
    "X-RateLimit-Unit": "tokens",
    "X-RateLimit-Limit": String(TOKEN_BUDGET),
    "X-RateLimit-Remaining": String(Math.max(0, TOKEN_BUDGET - bucket.tokens)),
  });

  // Stream the SSE through unchanged, while sniffing the final usage frame to bill the bucket.
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let tail = "";
  let spent = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
      tail += decoder.decode(value, { stream: true });
      const { events, rest } = sseEvents(tail);
      tail = rest;
      for (const data of events) { const t = usageTotal(data); if (t) spent = t; }
    }
  } catch { /* client disconnect or upstream hiccup — bill what we saw */ }
  finally {
    bucket.tokens += spent;
    res.end();
  }
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || "").split("?")[0];

  if (req.method === "GET" && url === "/api/health") return sendJson(res, 200, { ok: true });

  if (req.method === "GET" && url === "/api/quota") {
    sweep();
    const b = getBucket(clientIp(req));
    return sendJson(res, 200, { unit: "tokens", limit: TOKEN_BUDGET, remaining: Math.max(0, TOKEN_BUDGET - b.tokens), resetAt: b.resetAt });
  }

  if (req.method === "GET" && url === "/api/stats") {
    // Owner-only: disabled unless STATS_TOKEN is configured AND the caller passes ?token=it.
    const q = new URLSearchParams((req.url || "").split("?")[1] || "");
    if (!STATS_TOKEN || q.get("token") !== STATS_TOKEN) return sendJson(res, 404, { error: "Not found." });
    sweep();
    let requests = 0, tokens = 0;
    for (const b of buckets.values()) { requests += b.requests; tokens += b.tokens; }
    return sendJson(res, 200, {
      uniqueIpsToday: buckets.size, requestsToday: requests, tokensToday: tokens,
      budgetPerIp: TOKEN_BUDGET, model: MODEL, resetAt: nextUtcMidnight(),
    });
  }

  if (req.method === "POST" && url === "/api/chat") {
    try { return await handleChat(req, res); }
    catch (e) { if (!res.headersSent) return sendJson(res, 500, { error: String(e?.message || e) }); res.end(); }
  }

  sendJson(res, 404, { error: "Not found." });
});

server.listen(PORT, () => console.log(`qurangraph ai-proxy listening on :${PORT} (model ${MODEL}, budget ${TOKEN_BUDGET} tokens/day per IP)`));
