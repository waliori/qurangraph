/* ═══ MCP method dispatch ═══
 *
 * Transport-independent: it takes a decoded JSON-RPC message and returns a frame (or null
 * for a notification). server/mcp/http.js wraps it in Streamable HTTP; a stdio bridge
 * could wrap the same object without changing a line here.
 *
 * The one design decision worth stating: a TOOL that fails is not a protocol error. An
 * unresolvable root, a sūrah name that matches nothing, a verse key out of range — all come
 * back as a successful RPC carrying `isError: true` and the API's own message AND hint. That
 * is what lets the model read "No root matches «zzz» — try the bare consonantal form" and
 * fix its own call, instead of the client surfacing a dead protocol error. Only genuinely
 * protocol-level faults (unknown method, malformed params object) become JSON-RPC errors.
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { createInvoker } from "./invoke.js";
import { buildTools } from "./tools.js";
import { buildResources } from "./resources.js";
import { buildPrompts } from "./prompts.js";
import { INSTRUCTIONS } from "./guide.js";
import { validateArgs } from "./validate.js";
import { slimLinks, fitToBudget } from "./shape.js";
import { RpcError, invalidParams, methodNotFound, resultFrame, errorFrame, INTERNAL_ERROR } from "./jsonrpc.js";

/* Revisions we can speak. The newest is what we advertise; the older ones are accepted so a
 * client pinned to one keeps working. A client asking for something we don't know gets our
 * latest back and decides whether it can live with it — which is what the spec prescribes. */
export const LATEST_PROTOCOL = "2025-06-18";
export const SUPPORTED_PROTOCOLS = [LATEST_PROTOCOL, "2025-03-26", "2024-11-05"];

const SERVER_NAME = "ayat-network";

function packageVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(config.repoRoot, "package.json"), "utf8")).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/* An ApiError (or any thrown Error) rendered for a model to act on. The hint is the
 * valuable half — it carries the near-miss spellings the resolver found. */
function toolFailure(err) {
  const status = err?.status;
  if (!status || status >= 500) {
    if (!err?.validation) console.error("[mcp] tool error", err);
    return err?.validation
      ? String(err.message)
      : "The server failed to answer that request. Try a narrower request, or a different tool.";
  }
  const parts = [String(err.message || "Error")];
  if (err.hint) parts.push(`Hint: ${err.hint}`);
  return parts.join("\n");
}

export function createMcpServer({ router, corpus, ctx }) {
  const invoke = createInvoker({ router, corpus, ctx });
  const tools = buildTools({ invoke });
  const byName = new Map(tools.map((t) => [t.name, t]));
  const resources = buildResources({ invoke });
  const prompts = buildPrompts();
  const version = packageVersion();

  /* The public tool descriptor — `run` is ours, not the client's. */
  const describe = (t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: t.annotations,
  });

  async function callTool(params) {
    const name = params?.name;
    if (typeof name !== "string" || !name) throw invalidParams(`"name" is required.`);
    const tool = byName.get(name);
    if (!tool) {
      throw invalidParams(`Unknown tool "${name}". This server offers: ${tools.map((t) => t.name).join(", ")}.`);
    }

    // Argument faults come back as a tool error rather than a protocol error, on purpose:
    // the message names the offending argument and lists the valid ones, and a model can
    // only act on it if it reaches the model.
    let args;
    try {
      args = validateArgs(tool.inputSchema, params.arguments);
    } catch (err) {
      return { content: [{ type: "text", text: `Invalid arguments for \`${name}\`: ${err.message}` }], isError: true };
    }

    let payload;
    try {
      payload = await tool.run(args);
    } catch (err) {
      return { content: [{ type: "text", text: toolFailure(err) }], isError: true };
    }

    const { payload: fitted, text } = fitToBudget(slimLinks(payload), config.mcp.maxResponseChars);
    return {
      content: [{ type: "text", text }],
      // Off by default: a client that renders BOTH the text block and the structured result
      // pays for the same answer twice, and the text block is the one every client can read.
      ...(config.mcp.structuredContent ? { structuredContent: fitted } : {}),
    };
  }

  /* ── argument completion ──
   * Cheap, and it removes a class of failed calls: a model completing a lexicon id or a
   * sūrah name never mistypes one. Values are drawn from the live corpus, so they cannot
   * name something that isn't there. */
  const LEXICON_IDS = ["ayn", "sihah", "maqayis", "muhkam", "mufradat", "lisan"];
  const MAX_COMPLETIONS = 100;

  function completeArgument(argName, rawValue) {
    const value = String(rawValue ?? "").trim();
    const starts = (s) => !value || String(s).toLowerCase().startsWith(value.toLowerCase());

    switch (argName) {
      case "lexicon":
        return LEXICON_IDS.filter(starts);

      case "surah": {
        const out = [];
        for (const s of corpus.surahList || []) {
          if (starts(String(s.id)) || starts(s.name)) out.push(String(s.id));
        }
        return out;
      }

      case "verse_key": {
        const [sPart, aPart] = value.split(":");
        if (value.includes(":")) {
          const id = corpus.surahIndex.lookup(sPart);
          const s = (corpus.surahList || []).find((x) => x.id === id);
          if (!s) return [];
          const out = [];
          for (let a = 1; a <= s.count && out.length < MAX_COMPLETIONS; a++) {
            if (!aPart || String(a).startsWith(aPart)) out.push(`${id}:${a}`);
          }
          return out;
        }
        return (corpus.surahList || []).filter((s) => starts(String(s.id))).map((s) => `${s.id}:1`);
      }

      case "root":
      case "term":
      case "query":
      case "a":
      case "b":
        // Roots are the only key space small enough (a few thousand) to enumerate usefully.
        return Object.keys(corpus.r2v || {}).filter((r) => !value || r.startsWith(value));

      default:
        return [];
    }
  }

  function complete(params) {
    const ref = params?.ref;
    const argument = params?.argument;
    if (!ref?.type || typeof argument?.name !== "string") {
      throw invalidParams(`"ref" and "argument" are required.`);
    }
    if (ref.type === "ref/prompt" && !prompts.names().includes(ref.name)) {
      throw invalidParams(`Unknown prompt "${ref.name}".`);
    }
    if (ref.type === "ref/resource" && !resources.knownUris().includes(ref.uri)) {
      throw invalidParams(`Unknown resource template "${ref.uri}".`);
    }
    const all = completeArgument(argument.name, argument.value);
    return {
      completion: {
        values: all.slice(0, MAX_COMPLETIONS),
        total: all.length,
        hasMore: all.length > MAX_COMPLETIONS,
      },
    };
  }

  /* ── the method table ── */
  const methods = {
    initialize(params) {
      const asked = params?.protocolVersion;
      const negotiated = SUPPORTED_PROTOCOLS.includes(asked) ? asked : LATEST_PROTOCOL;
      return {
        protocolVersion: negotiated,
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false, subscribe: false },
          prompts: { listChanged: false },
          completions: {},
        },
        serverInfo: {
          name: SERVER_NAME,
          title: "آيات.network — Qurʾān corpus, morphology and classical lexicons",
          version,
        },
        instructions: INSTRUCTIONS,
      };
    },

    ping: () => ({}),

    "tools/list": () => ({ tools: tools.map(describe) }),
    "tools/call": (params) => callTool(params),

    "resources/list": () => ({ resources: resources.list() }),
    "resources/templates/list": () => ({ resourceTemplates: resources.listTemplates() }),
    async "resources/read"(params) {
      const uri = params?.uri;
      if (typeof uri !== "string" || !uri) throw invalidParams(`"uri" is required.`);
      let contents;
      try {
        contents = await resources.read(uri);
      } catch (err) {
        throw new RpcError(INTERNAL_ERROR, toolFailure(err));
      }
      if (!contents) {
        throw invalidParams(
          `Unknown resource "${uri}".`,
          { known: resources.knownUris() },
        );
      }
      return { contents };
    },

    "prompts/list": () => ({ prompts: prompts.list() }),
    "prompts/get"(params) {
      const name = params?.name;
      if (typeof name !== "string" || !name) throw invalidParams(`"name" is required.`);
      let built;
      try {
        built = prompts.get(name, params.arguments || {});
      } catch (err) {
        throw invalidParams(String(err.message));
      }
      if (!built) throw invalidParams(`Unknown prompt "${name}". Available: ${prompts.names().join(", ")}.`);
      return built;
    },

    "completion/complete": (params) => complete(params),
  };

  return {
    name: SERVER_NAME,
    version,
    toolNames: () => tools.map((t) => t.name),

    /* Handle one decoded message. Returns a JSON-RPC frame, or null for a notification.
     * `readMessage` (jsonrpc.js) has already validated the envelope. */
    async handle({ id, method, params, notification }) {
      // Client → server notifications are acknowledged by the transport and dropped here:
      // there is nothing stateful to update in a session-less server.
      if (notification) return null;

      const fn = methods[method];
      if (!fn) return errorFrame(id, methodNotFound(method));
      try {
        return resultFrame(id, await fn(params));
      } catch (err) {
        if (!(err instanceof RpcError)) console.error(`[mcp] ${method} failed`, err);
        return errorFrame(id, err);
      }
    },
  };
}
