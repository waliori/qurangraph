/* ═══ Streamable HTTP transport ═══
 *
 * One endpoint, POST-only, session-less. That is the smallest conformant profile of MCP's
 * current transport, and it is the right one here: the API is already stateless apart from
 * its in-memory corpus, so an MCP session would be state invented purely to have some. No
 * `Mcp-Session-Id` is issued (one arriving is ignored), and GET — which a client offers so
 * the server can push notifications over SSE — is answered 405, because a read-only corpus
 * has nothing unsolicited to say. Everything scales by running more copies, exactly as the
 * REST API does.
 *
 * The deprecated 2024-11-05 HTTP+SSE transport (a second endpoint, a session id in a query
 * string) is deliberately not implemented.
 *
 * Security posture, in order of application:
 *
 *   · Origin allow-list. Browsers attach `Origin` and cannot forge it, so this is what stops
 *     a hostile page from driving this endpoint through a visitor's browser — the DNS-
 *     rebinding class of attack the MCP spec calls out. Non-browser callers send no Origin
 *     and are unaffected. Default: no browser origin is allowed.
 *   · Body ceiling, enforced while reading, so an oversized body is dropped rather than
 *     buffered.
 *   · Batches refused: removed from MCP in 2025-06-18, and an array would otherwise let one
 *     rate-limit token buy hundreds of corpus queries.
 *   · The API's own key check and per-IP rate limiter, unchanged — an MCP client is not a
 *     privileged caller.
 */

import { config } from "../config.js";
import { send, clientIp } from "../http.js";
import { identify, requireKey, rateLimit } from "../auth.js";
import { createMcpServer, SUPPORTED_PROTOCOLS, LATEST_PROTOCOL } from "./server.js";
import {
  readMessage, errorFrame, RpcError, parseError,
  INVALID_REQUEST, INTERNAL_ERROR,
} from "./jsonrpc.js";

const ALLOW_HEADERS = "Content-Type, Authorization, X-API-Key, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID";

/* Read the request body, refusing anything over `maxBytes` while it streams. */
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let done = false;
    const chunks = [];
    const stop = (err) => { if (!done) { done = true; reject(err); req.destroy?.(); } };
    req.on("data", (c) => {
      if (done) return;
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
      size += buf.length;
      if (size > maxBytes) {
        return stop(Object.assign(new Error(`Request body exceeds ${maxBytes} bytes.`), { httpStatus: 413 }));
      }
      chunks.push(buf);
    });
    req.on("end", () => { if (!done) { done = true; resolve(Buffer.concat(chunks).toString("utf8")); } });
    req.on("error", stop);
  });
}

export function createMcpHandler({ router, corpus, ctx }) {
  const mcp = createMcpServer({ router, corpus, ctx });

  const allowAllOrigins = () => config.mcp.origins.includes("*");
  const originAllowed = (origin) => !origin || allowAllOrigins() || config.mcp.origins.includes(origin);

  /* CORS + protocol headers for whichever origin (if any) is talking. */
  function baseHeaders(origin) {
    const h = {
      "Cache-Control": "no-store",
      "MCP-Protocol-Version": LATEST_PROTOCOL,
      "Access-Control-Expose-Headers": "MCP-Protocol-Version, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After",
      Vary: "Origin",
    };
    if (origin && originAllowed(origin)) {
      // Echo the caller's origin rather than "*": the endpoint takes credentials
      // (X-API-Key) when keys are on, and "*" is invalid with credentials.
      h["Access-Control-Allow-Origin"] = allowAllOrigins() ? "*" : origin;
      h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
      h["Access-Control-Allow-Headers"] = ALLOW_HEADERS;
      h["Access-Control-Max-Age"] = "86400";
    } else if (origin) {
      // Refused, and the denial has to be explicit: send() applies this API's blanket
      // `Access-Control-Allow-Origin: *`, which would hand the body straight back to the
      // page we just turned away. "null" matches no real origin, so the browser drops it.
      h["Access-Control-Allow-Origin"] = "null";
    }
    return h;
  }

  const rpcError = (res, status, code, message, extraHeaders = {}, origin) =>
    send(res, status, `${JSON.stringify(errorFrame(null, new RpcError(code, message)))}\n`, {
      "Content-Type": "application/json; charset=utf-8",
      ...baseHeaders(origin),
      ...extraHeaders,
    });

  return async function handleMcp(req, res, url) {
    const origin = req.headers.origin;

    if (!originAllowed(origin)) {
      return rpcError(res, 403, INVALID_REQUEST,
        `Origin "${origin}" is not allowed to reach this MCP endpoint. `
        + `Set API_MCP_ORIGINS on the server to permit it (or "*" for any).`, {}, origin);
    }

    if (req.method === "OPTIONS") return send(res, 204, "", baseHeaders(origin));

    if (req.method !== "POST") {
      // A client may GET this endpoint hoping to open a server→client SSE stream. This
      // server has none, and 405 is the spec's way of saying so.
      return rpcError(res, 405, INVALID_REQUEST,
        "This MCP endpoint accepts POST only. It is session-less and does not offer a server-to-client "
        + "event stream, so GET and DELETE are not supported.",
        { Allow: "POST, OPTIONS" }, origin);
    }

    // The protocol revision the client speaks, when it says. Absent is fine — the field was
    // introduced mid-protocol, and initialize negotiates anyway.
    const declared = req.headers["mcp-protocol-version"];
    if (declared && !SUPPORTED_PROTOCOLS.includes(String(declared))) {
      return rpcError(res, 400, INVALID_REQUEST,
        `Unsupported MCP-Protocol-Version "${declared}". This server speaks: ${SUPPORTED_PROTOCOLS.join(", ")}.`,
        {}, origin);
    }

    const contentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (contentType && contentType !== "application/json") {
      return rpcError(res, 415, INVALID_REQUEST,
        `Content-Type must be application/json (got "${contentType}").`, {}, origin);
    }

    /* Access control — identical to every other route on this API. */
    let rateHeaders = {};
    try {
      const identity = identify(req, url);
      requireKey(identity);
      rateHeaders = rateLimit(req, url, identity) || {};
    } catch (err) {
      const status = err?.status || 500;
      const extra = { ...(err.headers || {}) };
      if (status === 401) {
        extra["WWW-Authenticate"] = `Bearer realm="${config.publicBase}", error="invalid_token"`;
      }
      return rpcError(res, status, INVALID_REQUEST,
        `${err.message}${err.hint ? ` ${err.hint}` : ""}`, extra, origin);
    }

    let raw;
    try {
      raw = await readBody(req, config.mcp.maxBodyBytes);
    } catch (err) {
      return rpcError(res, err.httpStatus || 400, INVALID_REQUEST, String(err.message), rateHeaders, origin);
    }

    let decoded;
    try {
      // Strip a leading BOM. JSON.parse rejects one, and Windows puts it there without
      // being asked: PowerShell's `Set-Content -Encoding UTF8` writes a BOM, so a request
      // body prepared as a file arrives with three bytes in front of the `{`. The failure
      // reads as "your JSON is malformed" when the JSON is perfect.
      decoded = JSON.parse(raw.replace(/^\uFEFF/, ""));
    } catch {
      return rpcError(res, 400, parseError().code, "Request body is not valid JSON.", rateHeaders, origin);
    }

    if (Array.isArray(decoded)) {
      return rpcError(res, 400, INVALID_REQUEST,
        "JSON-RPC batching was removed from MCP in revision 2025-06-18 and is not accepted. "
        + "Send one request per HTTP call.", rateHeaders, origin);
    }

    let message;
    try {
      message = readMessage(decoded);
    } catch (err) {
      const id = decoded && typeof decoded === "object" && !Array.isArray(decoded) ? decoded.id ?? null : null;
      return send(res, 400, `${JSON.stringify(errorFrame(id, err))}\n`, {
        "Content-Type": "application/json; charset=utf-8",
        ...baseHeaders(origin),
        ...rateHeaders,
      });
    }

    let frame;
    try {
      frame = await mcp.handle(message);
    } catch (err) {
      console.error("[mcp] dispatch failed", err);
      frame = errorFrame(message.id, new RpcError(INTERNAL_ERROR, "Internal error"));
    }

    if (config.logRequests) console.log(`[mcp] ${message.method}${message.notification ? " (notification)" : ""} · ${clientIp(req)}`);

    // A notification has no reply. 202 is how Streamable HTTP says "accepted, nothing to
    // return" — a 200 with an empty body would be read as a malformed response.
    if (!frame) return send(res, 202, "", { ...baseHeaders(origin), ...rateHeaders });

    return send(res, 200, `${JSON.stringify(frame)}\n`, {
      "Content-Type": "application/json; charset=utf-8",
      ...baseHeaders(origin),
      ...rateHeaders,
    });
  };
}
