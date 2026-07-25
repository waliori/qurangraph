/* End-to-end MCP tests against the REAL corpus.
 *
 * Same posture as api.test.js: public/data/ is gitignored, so these skip rather than fail in
 * a checkout that hasn't built it. Where data is present they assert the NUMBERS, because
 * the failure that matters for an agent-facing endpoint is a confident wrong answer, not a
 * non-200 — and the load-bearing test here is that an MCP answer and the HTTP answer to the
 * same question are the same answer.
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { decodeState } from "../src/hooks/useUrlState.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(REPO, "public", "data");
const HAVE_DATA = fs.existsSync(path.join(DATA, "quran-hafs.json")) && fs.existsSync(path.join(DATA, "roots.json"));

const MCP = "/api/v1/mcp";

/* Drive the handler in-process. Unlike the REST tests the request must be a real readable
 * stream, because the transport reads the body off it with a size ceiling. */
function makeCall(handler) {
  return (body, { method = "POST", headers = {}, url = MCP } = {}) => new Promise((resolve) => {
    const payload = body == null ? "" : typeof body === "string" ? body : JSON.stringify(body);
    const req = Readable.from(payload ? [Buffer.from(payload)] : []);
    req.method = method;
    req.url = url;
    req.headers = { host: "test.local", "content-type": "application/json", ...headers };
    req.socket = { remoteAddress: "10.0.0.2" };

    const chunks = [];
    const res = {
      writeHead(status, hdrs) { this._status = status; this._headers = hdrs || {}; },
      end(buf) {
        if (buf) chunks.push(buf);
        const text = Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(String(c))))).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* empty body, or a deliberate non-JSON probe */ }
        resolve({ status: this._status, headers: this._headers, text, json });
      },
    };
    handler(req, res);
  });
}

describe.skipIf(!HAVE_DATA)("MCP", () => {
  let call;
  let rpc;
  let tool;

  beforeAll(async () => {
    process.env.API_APP_BASE = "https://ayat.network/";
    process.env.API_PUBLIC_BASE = "https://ayat.network/api/v1";
    const { createApp } = await import("./index.js");
    const handler = createApp();
    call = makeCall(handler);

    let n = 0;
    rpc = (method, params) => call({ jsonrpc: "2.0", id: ++n, method, params });

    /* Call a tool and hand back the parsed payload plus the raw frame. */
    tool = async (name, args) => {
      const r = await rpc("tools/call", { name, arguments: args });
      expect(r.status, `${name} transport status`).toBe(200);
      const block = r.json.result?.content?.[0];
      expect(block?.type).toBe("text");
      return {
        isError: r.json.result.isError === true,
        text: block.text,
        data: (() => { try { return JSON.parse(block.text); } catch { return null; } })(),
        frame: r.json,
      };
    };
  }, 180_000);

  /* ── handshake ── */
  describe("lifecycle", () => {
    it("negotiates a protocol version and describes itself", async () => {
      const r = await rpc("initialize", {
        protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "vitest", version: "1" },
      });
      expect(r.status).toBe(200);
      const res = r.json.result;
      expect(res.protocolVersion).toBe("2025-06-18");
      expect(res.serverInfo.name).toBe("ayat-network");
      expect(res.capabilities.tools).toBeTruthy();
      expect(res.capabilities.resources).toBeTruthy();
      expect(res.capabilities.prompts).toBeTruthy();
      expect(res.capabilities.completions).toBeTruthy();
      // The instructions are the accuracy contract; a client pastes them into its prompt.
      expect(res.instructions).toMatch(/Never state a verse reference/);
    });

    it("falls back to its own latest version when asked for one it doesn't know", async () => {
      const r = await rpc("initialize", { protocolVersion: "1999-01-01", capabilities: {}, clientInfo: { name: "x", version: "1" } });
      expect(r.json.result.protocolVersion).toBe("2025-06-18");
    });

    it("accepts a notification with 202 and an empty body", async () => {
      const r = await call({ jsonrpc: "2.0", method: "notifications/initialized" });
      expect(r.status).toBe(202);
      expect(r.text).toBe("");
    });

    it("answers ping", async () => {
      const r = await rpc("ping");
      expect(r.status).toBe(200);
      expect(r.json.result).toEqual({});
    });
  });

  /* ── the tool table ── */
  describe("tools/list", () => {
    let tools;
    beforeAll(async () => { tools = (await rpc("tools/list")).json.result.tools; });

    it("is a curated set, not one tool per endpoint", async () => {
      // The whole point of the curation: a client loads every schema on connect, so the
      // table is a fixed per-turn cost. If this ever creeps towards the ~45 HTTP routes,
      // the curation has been lost.
      expect(tools.length).toBe(12);
      expect(JSON.stringify(tools).length).toBeLessThan(40_000);
      expect(tools.map((t) => t.name)).toContain("locate_quotation");
    });

    it("declares every tool read-only, non-destructive and closed-world", () => {
      for (const t of tools) {
        expect(t.annotations, t.name).toMatchObject({
          readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false,
        });
      }
    });

    it("ships a well-formed schema and a substantial description for each", () => {
      for (const t of tools) {
        expect(t.title, t.name).toBeTruthy();
        // A thin description is what makes a model pick the wrong tool.
        expect(t.description.length, `${t.name} description`).toBeGreaterThan(200);
        expect(t.inputSchema.type).toBe("object");
        expect(t.inputSchema.additionalProperties, `${t.name} rejects unknown args`).toBe(false);
        for (const req of t.inputSchema.required || []) {
          expect(t.inputSchema.properties[req], `${t.name} declares required "${req}"`).toBeTruthy();
        }
        for (const [name, p] of Object.entries(t.inputSchema.properties)) {
          expect(p.description, `${t.name}.${name} description`).toBeTruthy();
          expect(["string", "integer", "number", "boolean", "array"]).toContain(p.type);
        }
      }
    });
  });

  /* ── the load-bearing guarantee ── */
  describe("agreement with the HTTP API", () => {
    it("answers a search with the same numbers the REST endpoint gives", async () => {
      const viaMcp = await tool("search_quran", { query: "كتب", mode: "root", limit: 3 });
      const viaHttp = await call(null, { method: "GET", url: `/api/v1/search/${encodeURIComponent("كتب")}?mode=root&limit=3` });

      expect(viaMcp.isError).toBe(false);
      expect(viaMcp.data.term.key).toBe("كتب");
      expect(viaMcp.data.term.key).toBe(viaHttp.json.data.term.key);
      expect(viaMcp.data.term.verses).toBe(viaHttp.json.data.term.verses);
      expect(viaMcp.data.term.occurrences).toBe(viaHttp.json.data.term.occurrences);
      expect(viaMcp.data.meta.total).toBe(viaHttp.json.meta.total);
      expect(viaMcp.data.verses.map((v) => v.verse_key)).toEqual(viaHttp.json.data.verses.map((v) => v.verse_key));
      expect(viaMcp.data.verses[0].text).toBe(viaHttp.json.data.verses[0].text);
    });

    it("keeps exactly one UI link per object, and it still decodes in the app", async () => {
      const { data } = await tool("search_quran", { query: "نور", mode: "root", limit: 2 });
      expect(typeof data.term.ui).toBe("string");
      // The six sibling lenses are dropped — they are the same URL with a different view.
      expect(data.term.ui_occurrences).toBeUndefined();
      expect(data.term.links).toBeUndefined();

      const state = decodeState(new URL(data.term.ui).hash);
      expect(state.mode).toBe("root");
      expect(state.view?.k).toBe("نور");
      expect(decodeState(new URL(data.verses[0].ui).hash).surah).toBe(Number(data.verses[0].verse_key.split(":")[0]));
    });

    it("resolves Latin input and reports what it resolved", async () => {
      const { data, isError } = await tool("search_quran", { query: "rahman", limit: 1 });
      expect(isError).toBe(false);
      expect(data.term.resolved_from).toBe("rahman");
      expect(data.notes.join(" ")).toMatch(/resolved to/);
    });
  });

  /* ── the verification tool ── */
  describe("locate_quotation", () => {
    it("identifies a complete āya", async () => {
      const { data } = await tool("locate_quotation", { text: "الحمد لله رب العالمين" });
      expect(data.verses[0].verse_key).toBe("1:2");
      expect(data.exact_verse_matches).toBeGreaterThanOrEqual(1);
    });

    it("folds Uthmani and imlāʾī spellings onto the same āya", async () => {
      const a = await tool("locate_quotation", { text: "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ" });
      const b = await tool("locate_quotation", { text: "الحمد لله رب العالمين" });
      expect(a.data.verses[0].verse_key).toBe(b.data.verses[0].verse_key);
    });

    it("warns loudly when the text is only a fragment", async () => {
      const { data } = await tool("locate_quotation", { text: "لا إله إلا هو", limit: 3 });
      expect(data.exact_verse_matches).toBe(0);
      expect(data.notes.join(" ")).toMatch(/No āya is covered COMPLETELY/);
    });

    it("refuses to guess when nothing matches, and says why", async () => {
      const r = await tool("locate_quotation", { text: "زززز ززززز" });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/No āya contains/);
      expect(r.text).toMatch(/Hint:/);
    });
  });

  /* ── errors the model has to be able to act on ── */
  describe("failures come back as tool errors, not protocol errors", () => {
    it("names the offending argument and lists the valid ones", async () => {
      const r = await tool("analyze_verse", { verse: "2:255" });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/Unknown argument: verse/);
      expect(r.text).toMatch(/verse_key/);
    });

    it("lists the allowed values on an enum miss", async () => {
      const r = await tool("search_quran", { query: "نور", mode: "roots" });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/must be one of: exact, lemma, root/);
    });

    it("carries the API's own hint through, near-misses included", async () => {
      const r = await tool("analyze_surah", { surah: "baqra" });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/No sūrah matches/);
      expect(r.text).toMatch(/Did you mean/);
    });

    it("reports one bad verse key without losing the good ones", async () => {
      const { data } = await tool("get_verses", { verse_keys: ["2:255", "البقرة:256", "999:1"] });
      expect(data.verses).toHaveLength(3);
      expect(data.verses[0].verse_key).toBe("2:255");
      expect(data.verses[1].verse_key).toBe("2:256");
      expect(data.verses[2].error).toMatch(/No āya 999:1/);
      expect(data.notes.join(" ")).toMatch(/1 of 3/);
    });

    it("accepts a numeric sūrah where a string is declared", async () => {
      const r = await tool("get_surah", { surah: 112, include_verses: false });
      expect(r.isError).toBe(false);
      expect(r.data.surah.id).toBe(112);
    });

    it("rejects an unknown tool at the protocol level", async () => {
      const r = await rpc("tools/call", { name: "delete_everything", arguments: {} });
      expect(r.json.error.code).toBe(-32602);
      expect(r.json.error.message).toMatch(/search_quran/);
    });
  });

  /* ── shaping ── */
  describe("context budget", () => {
    it("keeps an ordinary answer small", async () => {
      const { text } = await tool("search_quran", { query: "كتب", mode: "root", limit: 5 });
      expect(text.length).toBeLessThan(6000);
    });

    it("honours `sections` instead of returning the whole dossier", async () => {
      const { data } = await tool("root_dossier", { root: "نور", sections: ["overview", "opposites"] });
      expect(data.term).toBeTruthy();
      expect(data.opposites).toBeTruthy();
      expect(data.derivation).toBeUndefined();
      expect(data.lexicons).toBeUndefined();
    });

    it("clips a Lisān article and says so rather than silently cutting it", async () => {
      const { data } = await tool("lexicon_entry", { root: "علم", lexicon: "lisan", max_characters: 1200 });
      expect(data.full.length).toBeLessThanOrEqual(1300);
      expect(data.notes.join(" ")).toMatch(/clipped to 1200 characters/);
      expect(data.citation.bibtex).toMatch(/@incollection/);
    });

    it("never exceeds the ceiling, and reports every degradation it applied", async () => {
      const { text, data } = await tool("get_surah", { surah: 2, limit: 300 });
      expect(text.length).toBeLessThanOrEqual(60_000);
      expect(data.truncated).toBeTruthy();
      // The report has to match what was actually done — a list that was halved must not be
      // described only as "UI links removed".
      expect(data.truncated.removed).toContain("lists shortened");
      expect(data.surah.verses.length).toBeLessThan(data.meta.total);
    });

    it("stays under the ceiling for the heaviest single-section request", async () => {
      const { text } = await tool("analyze_surah", {
        surah: 2,
        sections: ["profile", "muqattaat", "letters", "keyness", "cohesion", "rhyme", "iltifat", "munasabat"],
        limit: 60,
      });
      expect(text.length).toBeLessThanOrEqual(60_000);
    });
  });

  /* ── every analysis lens actually runs ── */
  describe("analyze_term", () => {
    const ANALYSES = ["distribution", "collocations", "neighbours", "semantic_neighbours",
      "opposites", "derivation", "valency", "roles", "expressions"];

    it.each(ANALYSES)("answers %s", async (analysis) => {
      const r = await tool("analyze_term", { term: "علم", analysis, limit: 5 });
      expect(r.isError, r.text).toBe(false);
      expect(r.data.analysis).toBe(analysis);
      expect(r.data.term.key).toBe("علم");
    });

    it("says when a root-scoped analysis ignored the mode it was given", async () => {
      const { data } = await tool("analyze_term", { term: "علم", analysis: "roles", mode: "exact" });
      expect(data.notes.join(" ")).toMatch(/root-scoped/);
    });

    it("labels distribution counts as tokens, not verses", async () => {
      const { data } = await tool("analyze_term", { term: "علم", analysis: "distribution" });
      expect(data.notes.join(" ")).toMatch(/tokens, not āyāt/);
    });
  });

  /* ── resources ── */
  describe("resources", () => {
    it("offers the briefing and the fixed reference documents", async () => {
      const { resources } = (await rpc("resources/list")).json.result;
      expect(resources.map((r) => r.uri)).toEqual([
        "ayat://guide", "ayat://corpus/surahs", "ayat://corpus/sources",
        "ayat://corpus/coverage", "ayat://corpus/lexicons",
      ]);
      for (const r of resources) expect(r.description).toBeTruthy();
    });

    it("serves the briefing, and it states what the corpus does NOT contain", async () => {
      const { contents } = (await rpc("resources/read", { uri: "ayat://guide" })).json.result;
      expect(contents[0].mimeType).toBe("text/markdown");
      expect(contents[0].text).toMatch(/No translation/);
      expect(contents[0].text).toMatch(/No tafsīr/);
      expect(contents[0].text).toMatch(/No interpretive cross-referencing/);
    });

    it("resolves a templated verse URI, sūrah name and all", async () => {
      const { contents } = (await rpc("resources/read", { uri: "ayat://verse/البقرة:255" })).json.result;
      const verse = JSON.parse(contents[0].text);
      expect(verse.verse_key).toBe("2:255");
      expect(verse.words.length).toBeGreaterThan(10);
    });

    it("declares its templates", async () => {
      const { resourceTemplates } = (await rpc("resources/templates/list")).json.result;
      expect(resourceTemplates.map((t) => t.uriTemplate)).toEqual(["ayat://verse/{verse_key}", "ayat://root/{root}"]);
    });

    it("rejects an unknown URI and says what it does have", async () => {
      const r = await rpc("resources/read", { uri: "ayat://nope" });
      expect(r.json.error.code).toBe(-32602);
      expect(r.json.error.data.known).toContain("ayat://guide");
    });
  });

  /* ── prompts ── */
  describe("prompts", () => {
    it("lists research workflows with their arguments", async () => {
      const { prompts } = (await rpc("prompts/list")).json.result;
      expect(prompts.map((p) => p.name)).toEqual([
        "verify_quotation", "root_study", "verse_study", "compare_concepts", "surah_overview",
      ]);
      expect(prompts.find((p) => p.name === "root_study").arguments.find((a) => a.name === "root").required).toBe(true);
    });

    it("interpolates its arguments", async () => {
      const r = await rpc("prompts/get", { name: "root_study", arguments: { root: "علم", lexicon: "lisan" } });
      const text = r.json.result.messages[0].content.text;
      expect(text).toContain("علم");
      expect(text).toContain("lisan");
    });

    it("refuses a prompt missing a required argument", async () => {
      const r = await rpc("prompts/get", { name: "root_study", arguments: {} });
      expect(r.json.error.code).toBe(-32602);
      expect(r.json.error.message).toMatch(/requires the argument "root"/);
    });
  });

  /* ── completions ── */
  describe("completion/complete", () => {
    it("completes a lexicon id", async () => {
      const r = await rpc("completion/complete", {
        ref: { type: "ref/prompt", name: "root_study" }, argument: { name: "lexicon", value: "m" },
      });
      expect(r.json.result.completion.values).toEqual(["maqayis", "muhkam", "mufradat"]);
    });

    it("completes a verse key against the real āya count", async () => {
      const r = await rpc("completion/complete", {
        ref: { type: "ref/resource", uri: "ayat://verse/{verse_key}" }, argument: { name: "verse_key", value: "112:" },
      });
      // Al-Ikhlāṣ has exactly four āyāt — a completion that offered a fifth would be inventing one.
      expect(r.json.result.completion.values).toEqual(["112:1", "112:2", "112:3", "112:4"]);
    });

    it("completes roots from the corpus itself", async () => {
      const r = await rpc("completion/complete", {
        ref: { type: "ref/prompt", name: "root_study" }, argument: { name: "root", value: "كت" },
      });
      expect(r.json.result.completion.values).toContain("كتب");
    });
  });

  /* ── transport ── */
  describe("transport", () => {
    it("refuses anything but POST, and says which method to use", async () => {
      const r = await call(null, { method: "GET" });
      expect(r.status).toBe(405);
      expect(r.headers.Allow).toBe("POST, OPTIONS");
    });

    it("answers a CORS preflight", async () => {
      const r = await call(null, { method: "OPTIONS" });
      expect(r.status).toBe(204);
    });

    it("refuses a browser origin that is not allow-listed", async () => {
      const r = await call({ jsonrpc: "2.0", id: 1, method: "ping" }, { headers: { origin: "https://evil.example" } });
      expect(r.status).toBe(403);
      // Explicitly denied, not merely absent: the API's blanket `*` must not leak through
      // and hand the body back to the page that was refused.
      expect(r.headers["Access-Control-Allow-Origin"]).toBe("null");
    });

    it("echoes an allow-listed origin instead of the blanket wildcard", async () => {
      // The allow-list is read live off the config, so it can be widened for one assertion
      // without rebuilding the corpus.
      const { config } = await import("./config.js");
      const before = config.mcp.origins;
      config.mcp.origins = ["https://studio.example"];
      try {
        const r = await call({ jsonrpc: "2.0", id: 1, method: "ping" }, { headers: { origin: "https://studio.example" } });
        expect(r.status).toBe(200);
        expect(r.headers["Access-Control-Allow-Origin"]).toBe("https://studio.example");
        expect(r.headers.Vary).toBe("Origin");
      } finally {
        config.mcp.origins = before;
      }
    });

    it("refuses JSON-RPC batching, which MCP removed", async () => {
      const r = await call([{ jsonrpc: "2.0", id: 1, method: "ping" }]);
      expect(r.status).toBe(400);
      expect(r.json.error.message).toMatch(/batching/);
    });

    it("reports a parse error as -32700", async () => {
      const r = await call("{ not json");
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe(-32700);
    });

    it("rejects a malformed envelope as -32600", async () => {
      const r = await call({ jsonrpc: "1.0", id: 1, method: "ping" });
      expect(r.json.error.code).toBe(-32600);
      expect(r.json.error.id).toBe(undefined);
    });

    it("rejects a protocol version it cannot speak", async () => {
      const r = await call({ jsonrpc: "2.0", id: 1, method: "ping" }, { headers: { "mcp-protocol-version": "1999-01-01" } });
      expect(r.status).toBe(400);
      expect(r.json.error.message).toMatch(/2025-06-18/);
    });

    it("rejects a non-JSON content type", async () => {
      const r = await call({ jsonrpc: "2.0", id: 1, method: "ping" }, { headers: { "content-type": "text/plain" } });
      expect(r.status).toBe(415);
    });

    it("drops an oversized body instead of buffering it", async () => {
      const big = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(1_200_000) } });
      const r = await call(big);
      expect(r.status).toBe(413);
    });

    it("returns an unknown method as -32601", async () => {
      const r = await rpc("no/such/method");
      expect(r.json.error.code).toBe(-32601);
    });

    it("applies the API's rate-limit accounting and never caches", async () => {
      const r = await rpc("ping");
      expect(r.headers["X-RateLimit-Limit"]).toBeTruthy();
      expect(r.headers["Cache-Control"]).toBe("no-store");
      expect(r.headers["MCP-Protocol-Version"]).toBe("2025-06-18");
    });
  });

  /* ── it must not have broken the REST API ── */
  describe("coexistence with the HTTP API", () => {
    it("leaves the REST routes alone", async () => {
      const r = await call(null, { method: "GET", url: "/api/v1/health" });
      expect(r.status).toBe(200);
      expect(r.json.data.status).toBe("ok");
    });

    it("advertises the MCP endpoint in the service index", async () => {
      const r = await call(null, { method: "GET", url: "/api/v1/" });
      expect(r.json.data.links.mcp).toMatch(/\/mcp$/);
      expect(r.json.data.mcp.endpoint).toMatch(/\/mcp$/);
      expect(r.json.data.mcp.transport).toMatch(/Streamable HTTP/);
    });
  });
});
