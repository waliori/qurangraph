/* ═══ JSON-RPC 2.0 ═══
 *
 * MCP is JSON-RPC 2.0 and nothing more, so this is the whole wire layer: parse, validate,
 * frame a result or an error. Hand-rolled for the same reason the rest of the API is —
 * `docs/API.md` promises no runtime npm dependencies, and that promise is what guarantees
 * an API answer, an MCP answer and the on-screen answer are one computation. The official
 * SDK would pull a dependency tree in to save about a hundred lines.
 *
 * Batching (an array of requests) was REMOVED from MCP in the 2025-06-18 revision, so it is
 * refused here rather than supported: accepting it would also hand an anonymous caller a
 * way to spend one rate-limit token on five hundred corpus queries.
 */

export const JSONRPC_VERSION = "2.0";

/* The standard codes. MCP adds no transport-level codes of its own — a *tool* that fails
 * is a successful RPC carrying `isError: true`, which is what lets the model read the
 * failure and retry rather than the conversation dying. See tools/call in server.js. */
export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

export class RpcError extends Error {
  constructor(code, message, data) {
    super(message);
    this.code = code;
    if (data !== undefined) this.data = data;
  }
}

export const parseError = (m = "Invalid JSON.") => new RpcError(PARSE_ERROR, m);
export const invalidRequest = (m) => new RpcError(INVALID_REQUEST, m);
export const methodNotFound = (m) => new RpcError(METHOD_NOT_FOUND, `Unknown method "${m}".`);
export const invalidParams = (m, data) => new RpcError(INVALID_PARAMS, m, data);

/* A JSON-RPC id may be a string or a number, and `null` is reserved for "we could not read
 * the id". Anything else is a malformed request. */
const okId = (v) => typeof v === "string" || (typeof v === "number" && Number.isFinite(v));

/* Split a decoded message into { id, method, params, notification }, or throw. */
export function readMessage(msg) {
  if (msg === null || typeof msg !== "object" || Array.isArray(msg)) {
    throw invalidRequest("A JSON-RPC request must be a single JSON object.");
  }
  if (msg.jsonrpc !== JSONRPC_VERSION) {
    throw invalidRequest(`"jsonrpc" must be exactly "${JSONRPC_VERSION}".`);
  }
  if (typeof msg.method !== "string" || !msg.method) {
    throw invalidRequest(`"method" must be a non-empty string.`);
  }
  // A response or an error frame arriving at the server is a client bug, not a request.
  if ("result" in msg || "error" in msg) {
    throw invalidRequest("This endpoint accepts requests and notifications, not responses.");
  }
  const notification = !("id" in msg) || msg.id === null;
  if (!notification && !okId(msg.id)) {
    throw invalidRequest(`"id" must be a string or a number.`);
  }
  const params = msg.params === undefined ? {} : msg.params;
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    throw invalidParams(`"params" must be an object (positional parameters are not used by MCP).`);
  }
  return { id: notification ? null : msg.id, method: msg.method, params, notification };
}

export const resultFrame = (id, value) => ({ jsonrpc: JSONRPC_VERSION, id, result: value });

export function errorFrame(id, err) {
  const code = Number.isInteger(err?.code) ? err.code : INTERNAL_ERROR;
  const message = code === INTERNAL_ERROR && !(err instanceof RpcError)
    ? "Internal error"                       // never leak a stack or a path to a caller
    : String(err?.message || "Error");
  return {
    jsonrpc: JSONRPC_VERSION,
    id: id ?? null,
    error: { code, message, ...(err?.data !== undefined ? { data: err.data } : {}) },
  };
}
