#!/usr/bin/env node
/* ═══ آيات.network HTTP API ═══
 *
 *   node server/index.js          # → http://localhost:8080/api/v1
 *
 * A read-only JSON API over the same corpus and the same analysis code the app runs, with
 * one distinguishing habit: every object it returns carries links back into the UI, so an
 * API answer and a shareable page are the same artefact.
 *
 * Deliberately dependency-free (node:http + the app's own modules) and stateless apart
 * from the in-memory corpus and rate-limit buckets, so it scales by running more copies.
 */

import http from "node:http";
import { config, keysEnforced } from "./config.js";
import { loadCorpus } from "./corpus.js";
import { createRouter, sendJson, send, sendError, toCsv, ApiError, notFound, qEnum } from "./http.js";
import { identify, requireKey, rateLimit, startLimiterSweep } from "./auth.js";
import { PRECISIONS } from "./terms.js";

import * as metaRoutes from "./routes/meta.js";
import * as corpusRoutes from "./routes/corpus.js";
import * as lexicalRoutes from "./routes/lexical.js";
import * as analysisRoutes from "./routes/analysis.js";
import * as expressionRoutes from "./routes/expressions.js";
import * as graphRoutes from "./routes/graph.js";

export const API_VERSION = "v1";
const PREFIX = `/api/${API_VERSION}`;

export function createApp({ corpus } = {}) {
  const C = corpus || loadCorpus();
  const router = createRouter();
  const ctx = { corpus: C, base: config.publicBase, version: API_VERSION };

  // Registration order is match order; the meta routes claim "/" first.
  for (const m of [metaRoutes, corpusRoutes, lexicalRoutes, analysisRoutes, expressionRoutes, graphRoutes]) {
    m.register(router, ctx);
  }

  /** Handle one request. Exported shape: (req, res) — usable by node:http directly. */
  return async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") return send(res, 204, "");
    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendError(req, res, new ApiError(405, "method_not_allowed", "This API is read-only; use GET."));
    }

    // Everything lives under /api/v1. A bare /api or an unknown version gets a pointer
    // rather than a bare 404 — the most likely cause is a hand-typed URL.
    let pathname = decodeURI(url.pathname);
    if (!pathname.startsWith(PREFIX)) {
      if (/^\/api(\/|$)/.test(pathname)) {
        return sendJson(req, res, 404, {
          error: { code: "not_found", message: `Unknown API path "${pathname}".`, hint: `The current version lives at ${PREFIX}/ — start at ${config.publicBase}/` },
        });
      }
      return sendJson(req, res, 404, { error: { code: "not_found", message: `Not found: ${pathname}` } });
    }
    pathname = pathname.slice(PREFIX.length) || "/";

    let rateHeaders = {};
    try {
      const identity = identify(req, url);
      requireKey(identity);
      rateHeaders = rateLimit(req, url, identity) || {};

      const hit = router.match(pathname);
      if (!hit) {
        throw notFound(`No endpoint "${pathname}".`, `See ${config.publicBase}/ for the list.`);
      }

      const precision = qEnum(url.searchParams, "precision", PRECISIONS, "loose");
      const V = C.variant(precision);

      const result = await hit.route.handler({
        V, corpus: C, params: hit.params, query: url.searchParams, url: url.toString(), ctx,
      });

      if (config.logRequests) console.log(`[api] ${req.method} ${url.pathname}${url.search}`);

      // A handler may return raw HTML (/docs), a raw object (/openapi.json), or the
      // normal { data, meta, links } triple that gets the envelope.
      if (result?.html) {
        return send(res, 200, result.html, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": `public, max-age=${config.cacheSeconds}`,
          ...rateHeaders,
        });
      }
      if (result?.raw) return sendJson(req, res, 200, result.raw, rateHeaders);

      const format = qEnum(url.searchParams, "format", ["json", "csv"], "json");
      if (format === "csv") {
        return send(res, 200, toCsv(result.data), {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="ayat${pathname.replace(/[^\w]+/g, "-")}.csv"`,
          "Cache-Control": `public, max-age=${config.cacheSeconds}`,
          ...rateHeaders,
        });
      }

      const payload = { api: API_VERSION, data: result.data };
      if (result.meta) payload.meta = result.meta;
      payload.links = { self: config.publicBase + (pathname === "/" ? "/" : pathname) + (url.search || ""), ...(result.links || {}) };
      return sendJson(req, res, 200, payload, rateHeaders);
    } catch (err) {
      return sendError(req, res, Object.assign(err, { headers: { ...rateHeaders, ...(err.headers || {}) } }));
    }
  };
}

/* ── Entry point ── */
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const t0 = Date.now();
  let handler;
  try {
    handler = createApp();
  } catch (e) {
    console.error(`[api] ${e.message}`);
    process.exit(1);
  }
  startLimiterSweep();
  const server = http.createServer((req, res) => { handler(req, res); });
  server.listen(config.port, config.host, () => {
    console.log(`[api] آيات.network API listening on http://${config.host}:${config.port}${PREFIX}/`);
    console.log(`[api] data: ${config.dataDir}  ·  app links: ${config.appBase}`);
    console.log(`[api] access: ${keysEnforced() ? `${config.keys.size} key(s) required` : "OPEN (no key)"}  ·  rate limit: ${config.rateLimit}/${Math.round(config.rateWindowMs / 60000)}min`);
    console.log(`[api] ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  });
  const bye = () => server.close(() => process.exit(0));
  process.on("SIGTERM", bye);
  process.on("SIGINT", bye);
}
