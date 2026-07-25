#!/usr/bin/env node
/* ═══ stdio transport ═══
 *
 *   node server/mcp/stdio.js                      # local: this checkout's own corpus
 *   node server/mcp/stdio.js --url https://…/mcp  # bridge: proxy to a remote MCP endpoint
 *
 * Remote Streamable HTTP is the primary transport (server/mcp/http.js); this exists because
 * a good number of MCP clients still only know how to launch a subprocess and talk
 * newline-delimited JSON-RPC over its stdin/stdout. Two modes, one file:
 *
 *   LOCAL   — runs the same createMcpServer() in-process against public/data. No network,
 *             no rate limit, and it works offline. Costs the corpus boot (tens of seconds,
 *             a few hundred MB) and needs the derived data built.
 *   BRIDGE  — forwards each message to a remote /mcp over HTTPS. Starts instantly, needs no
 *             data locally, and is what most people should use.
 *
 * Framing: exactly one JSON message per line. The MCP server serializes compactly, so a
 * message can never contain a raw newline. NOTHING may be written to stdout except protocol
 * frames — every diagnostic goes to stderr, because a stray log line on stdout corrupts the
 * stream and the client simply disconnects.
 */

import readline from "node:readline";
import { config } from "../config.js";
import { errorFrame, readMessage, RpcError, INTERNAL_ERROR, PARSE_ERROR } from "./jsonrpc.js";

const log = (...a) => console.error("[mcp:stdio]", ...a);

function parseArgs(argv) {
  const out = { url: process.env.MCP_TARGET_URL || null, apiKey: process.env.API_KEY || null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--url") out.url = argv[++i];
    else if (argv[i] === "--api-key") out.apiKey = argv[++i];
  }
  return out;
}

/* ── BRIDGE: forward to a remote endpoint ── */
function createBridge({ url, apiKey }) {
  log(`bridging to ${url}`);
  return async function forward(raw) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
      body: raw,
    });
    // 202 is the transport's "notification accepted, nothing to return".
    if (res.status === 202) return null;
    const text = (await res.text()).trim();
    return text || null;
  };
}

/* ── LOCAL: the same server object the HTTP transport wraps ── */
async function createLocal() {
  log(`loading corpus from ${config.dataDir} — this takes a moment`);
  const t0 = Date.now();
  // Exactly what the HTTP app is built from, so a tool here calls the same route handler
  // an HTTP request would.
  const { createServices } = await import("../index.js");
  const { createMcpServer } = await import("./server.js");
  const mcp = createMcpServer(createServices());
  log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  return async function handle(raw) {
    let decoded;
    try {
      decoded = JSON.parse(raw);
    } catch {
      return JSON.stringify(errorFrame(null, new RpcError(PARSE_ERROR, "Request is not valid JSON.")));
    }
    if (Array.isArray(decoded)) {
      return JSON.stringify(errorFrame(null, new RpcError(-32600, "JSON-RPC batching is not supported.")));
    }
    let message;
    try {
      message = readMessage(decoded);
    } catch (err) {
      return JSON.stringify(errorFrame(decoded?.id ?? null, err));
    }
    const frame = await mcp.handle(message);
    return frame ? JSON.stringify(frame) : null;
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let handle;
  try {
    handle = args.url ? createBridge(args) : await createLocal();
  } catch (err) {
    log(`failed to start: ${err.message}`);
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  // Messages are handled in arrival order: a client may send several without waiting, and
  // interleaving replies to a stdio client is a good way to confuse one.
  let queue = Promise.resolve();
  rl.on("line", (line) => {
    const raw = line.trim();
    if (!raw) return;
    queue = queue.then(async () => {
      try {
        const out = await handle(raw);
        if (out) process.stdout.write(`${out}\n`);
      } catch (err) {
        log(`handler failed: ${err.message}`);
        let id = null;
        try { id = JSON.parse(raw).id ?? null; } catch { /* unparseable — reply with a null id */ }
        process.stdout.write(`${JSON.stringify(errorFrame(id, new RpcError(INTERNAL_ERROR, "Internal error")))}\n`);
      }
    });
  });

  // stdin closing means the client is done SENDING, not that we are done ANSWERING. Drain
  // the queue first and let the loop end on its own, so the last frame is flushed rather
  // than truncated — a forced exit here loses the reply to the final request.
  rl.on("close", () => { queue.finally(() => { process.exitCode = 0; }); });
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
}

main();
