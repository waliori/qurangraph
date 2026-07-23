/* ═══ HTTP plumbing ═══
 *
 * A tiny router + response envelope, on node:http with no dependencies (the app itself
 * ships two runtime deps; the API should not be the thing that drags in fifty).
 *
 * Route patterns use `:name` segments and are matched in registration order. Handlers are
 * plain functions `(ctx) => data | { data, meta, links }`; throwing an ApiError produces
 * the matching status. Everything is GET (plus OPTIONS for CORS preflight) — this API is
 * strictly read-only.
 */

import crypto from "node:crypto";
import { config } from "./config.js";

export class ApiError extends Error {
  constructor(status, code, message, hint) {
    super(message);
    this.status = status; this.code = code; this.hint = hint;
  }
}
export const badRequest = (m, hint) => new ApiError(400, "bad_request", m, hint);
export const notFound = (m, hint) => new ApiError(404, "not_found", m, hint);

/* ── Router ── */
export function createRouter() {
  const routes = [];
  const add = (pattern, handler, meta = {}) => {
    const parts = pattern.split("/").filter(Boolean);
    routes.push({ pattern, parts, handler, meta });
  };
  const match = (pathname) => {
    const segs = pathname.split("/").filter(Boolean);
    for (const r of routes) {
      if (r.parts.length !== segs.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < r.parts.length; i++) {
        const p = r.parts[i];
        if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(segs[i]);
        else if (p !== segs[i]) { ok = false; break; }
      }
      if (ok) return { route: r, params };
    }
    return null;
  };
  return { add, match, routes };
}

/* ── Query helpers (every one validates, so a handler never sees junk) ── */
export function qInt(q, name, { min = -Infinity, max = Infinity, def = null } = {}) {
  const raw = q.get(name);
  if (raw == null || raw === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw badRequest(`"${name}" must be an integer (got "${raw}")`);
  if (n < min || n > max) throw badRequest(`"${name}" must be between ${min} and ${max} (got ${n})`);
  return n;
}

export function qEnum(q, name, allowed, def) {
  const raw = q.get(name);
  if (raw == null || raw === "") return def;
  if (!allowed.includes(raw)) throw badRequest(`"${name}" must be one of ${allowed.join(", ")} (got "${raw}")`);
  return raw;
}

export const qBool = (q, name, def = false) => {
  const raw = q.get(name);
  if (raw == null || raw === "") return def;
  return /^(1|true|yes|on)$/i.test(raw);
};

/* limit/offset with the configured ceiling applied. */
export function paging(q) {
  const limit = qInt(q, "limit", { min: 1, max: config.maxLimit, def: config.defaultLimit });
  const offset = qInt(q, "offset", { min: 0, def: 0 });
  return { limit, offset };
}

/* Slice a list and describe the slice — the shape every paginated endpoint returns. */
export function page(list, { limit, offset }, selfUrl) {
  const total = list.length;
  const items = list.slice(offset, offset + limit);
  const meta = { count: items.length, total, limit, offset, has_more: offset + items.length < total };
  const links = {};
  if (selfUrl && meta.has_more) {
    const u = new URL(selfUrl);
    u.searchParams.set("limit", String(limit));
    u.searchParams.set("offset", String(offset + limit));
    links.next = u.toString();
  }
  return { items, meta, links };
}

/* ── Serialization ── */
const CSV_CELL = (v) => {
  if (v == null) return "";
  if (Array.isArray(v)) v = v.join(" ");
  else if (typeof v === "object") v = JSON.stringify(v);
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/* CSV for the tabular endpoints (the same escape rules the UI's exports use). Only makes
 * sense when `data` is an array of objects; anything else is refused rather than mangled. */
export function toCsv(data) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : null;
  if (!rows || !rows.length || typeof rows[0] !== "object") {
    throw badRequest("format=csv is only available on endpoints that return a list of rows");
  }
  const cols = [...rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set())];
  const out = [cols.join(",")];
  for (const r of rows) out.push(cols.map((c) => CSV_CELL(r[c])).join(","));
  return out.join("\n") + "\n";
}

/* ── Response ── */
export function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    "Content-Length": buf.length,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
    "Access-Control-Max-Age": "86400",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(buf);
}

export function sendJson(req, res, status, payload, headers = {}) {
  const body = Buffer.from(JSON.stringify(payload, null, 2) + "\n");
  const etag = `W/"${crypto.createHash("sha1").update(body).digest("base64url")}"`;
  if (status === 200 && req.headers["if-none-match"] === etag) {
    return send(res, 304, "", { ETag: etag });
  }
  send(res, status, body, {
    "Content-Type": "application/json; charset=utf-8",
    ETag: etag,
    "Cache-Control": status === 200 ? `public, max-age=${config.cacheSeconds}` : "no-store",
    ...headers,
  });
}

export function sendError(req, res, err) {
  const status = err?.status || 500;
  if (status >= 500) console.error("[api] 500", err);
  sendJson(req, res, status, {
    error: {
      code: err?.code || "internal_error",
      message: status >= 500 ? "Internal error" : String(err?.message || "Error"),
      ...(err?.hint ? { hint: err.hint } : {}),
    },
  });
}

/* The client IP, honouring the proxy chain we control (nginx → Nginx Proxy Manager). */
export function clientIp(req) {
  if (config.trustProxy) {
    const xff = req.headers["x-forwarded-for"];
    if (xff) return String(xff).split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}
