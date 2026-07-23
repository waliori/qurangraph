/* End-to-end API tests against the REAL corpus.
 *
 * public/data/ is gitignored (it's reconstructed from data/source/ — see docs/DATA.md), so
 * these skip rather than fail in a checkout that hasn't built it yet. Where data is
 * present they are the load-bearing tests: they assert the numbers, not just the status
 * codes, because a wrong-but-200 answer is the failure mode that matters here. */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeState } from "../src/hooks/useUrlState.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(REPO, "public", "data");
const HAVE_DATA = fs.existsSync(path.join(DATA, "quran-hafs.json")) && fs.existsSync(path.join(DATA, "roots.json"));

/* Drive the handler in-process: build a fake req/res pair and collect what it writes.
 * No socket, no port — the handler is just (req, res), so the tests exercise exactly what
 * node:http would call. */
function makeCall(handler) {
  return (url, { method = "GET", headers = {} } = {}) => new Promise((resolve) => {
    const chunks = [];
    const req = { method, url, headers: { host: "test.local", ...headers }, socket: { remoteAddress: "10.0.0.1" } };
    const res = {
      writeHead(status, hdrs) { this._status = status; this._headers = hdrs || {}; },
      end(buf) {
        if (buf) chunks.push(buf);
        const body = Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(String(c))))).toString("utf8");
        let json = null;
        try { json = JSON.parse(body); } catch { /* html or csv */ }
        resolve({ status: this._status, headers: this._headers, body, json });
      },
    };
    handler(req, res);
  });
}

describe.skipIf(!HAVE_DATA)("API", () => {
  let call;
  // The corpus takes tens of seconds to index; build it once for the whole file.
  beforeAll(async () => {
    process.env.API_APP_BASE = "https://ayat.network/";
    process.env.API_PUBLIC_BASE = "https://ayat.network/api/v1";
    const { createApp } = await import("./index.js");
    call = makeCall(createApp());
  }, 180_000);

  const V1 = "/api/v1";
  const ar = (s) => encodeURIComponent(s);
  const uiState = (url) => decodeState(new URL(url).hash);

  describe("service description", () => {
    it("lists its own endpoints and the corpus it loaded", async () => {
      const r = await call(`${V1}/`);
      expect(r.status).toBe(200);
      expect(r.json.data.corpus.verses).toBe(6236);
      expect(r.json.data.corpus.surahs).toBe(114);
      expect(r.json.data.endpoints.length).toBeGreaterThan(40);
      expect(r.json.data.links.docs).toMatch(/\/docs$/);
      expect(r.json.data.links.guide).toMatch(/\/guide$/);
      expect(r.json.data.endpoints.every((e) => e.summary)).toBe(true);
    });

    it("describes every route in the OpenAPI document", async () => {
      const oa = await call(`${V1}/openapi.json`);
      expect(oa.json.openapi).toBe("3.1.0");
      expect(Object.keys(oa.json.paths).length).toBeGreaterThan(40);

      // Every `{param}` in a path is declared, or a client generator produces a URL it
      // cannot fill in.
      for (const [path, item] of Object.entries(oa.json.paths)) {
        for (const name of [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1])) {
          const p = item.get.parameters.find((x) => x.name === name && x.in === "path");
          expect(p, `${path} declares {${name}}`).toBeTruthy();
          expect(p.required).toBe(true);
        }
      }

      // Every $ref resolves.
      const refs = [...JSON.stringify(oa.json).matchAll(/"#\/components\/schemas\/(\w+)"/g)].map((m) => m[1]);
      expect(refs.length).toBeGreaterThan(30);
      for (const r of new Set(refs)) expect(oa.json.components.schemas[r], `schema ${r}`).toBeTruthy();

      // Every route carries a summary and a tag.
      for (const [path, item] of Object.entries(oa.json.paths)) {
        expect(item.get.summary, `${path} summary`).toBeTruthy();
        expect(item.get.tags?.length, `${path} tag`).toBeGreaterThan(0);
      }
    });

    it("types the parameters, with defaults and Arabic examples", async () => {
      const oa = await call(`${V1}/openapi.json`);
      const params = oa.json.paths["/search"].get.parameters;
      const by = (n) => params.find((p) => p.name === n);

      expect(by("q")).toMatchObject({ in: "query", required: true, example: "كتب", "x-rtl": true });
      expect(by("mode").schema).toMatchObject({ type: "string", enum: ["exact", "lemma", "root"], default: "exact" });
      expect(by("limit").schema).toMatchObject({ type: "integer", default: 50, maximum: 500 });
      expect(by("words").schema).toMatchObject({ type: "boolean", default: false });

      // The response is a real model, not a generic blob.
      const schemaRef = oa.json.paths["/search"].get.responses[200].content["application/json"].schema.$ref;
      expect(schemaRef).toBe("#/components/schemas/SearchResponse");
      const term = oa.json.components.schemas.Term;
      expect(Object.keys(term.properties)).toEqual(
        expect.arrayContaining(["key", "label", "mode", "verses", "occurrences", "links"]),
      );

      // Runnable examples, pointing at real endpoints.
      const ex = oa.json.paths["/search"].get["x-examples"];
      expect(ex.length).toBeGreaterThan(2);
      expect(ex[0].url).toContain("/search?q=");
    });

    it("serves the interactive explorer and the prose guide", async () => {
      const d = await call(`${V1}/docs`);
      expect(d.headers["Content-Type"]).toMatch(/text\/html/);
      expect(d.body).toContain("API explorer");
      // Self-contained: the CSS and JS are inlined, nothing is fetched from another host.
      expect(d.body).toContain("<style>");
      expect(d.body).not.toContain("/*__CSS__*/");
      expect(d.body).not.toContain("/*__JS__*/");
      expect(d.body).not.toMatch(/<(script|link)[^>]+(src|href)="https?:/);

      const g = await call(`${V1}/guide`);
      expect(g.headers["Content-Type"]).toMatch(/text\/html/);
      expect(g.body).toContain("interactive explorer");
      expect(g.body).toContain("Conventions");
    });
  });

  describe("corpus", () => {
    it("returns all 114 sūrahs", async () => {
      const r = await call(`${V1}/surahs`);
      expect(r.json.data).toHaveLength(114);
      expect(r.json.data[1]).toMatchObject({ id: 2, name: "البقرة", verses: 286 });
      // The disjoined letters are attached where they exist and nowhere else.
      expect(r.json.data[1].muqattaat).toEqual(["ا", "ل", "م"]);
      expect(r.json.data[0].muqattaat).toBe(null);
    });

    it("returns an āya with its per-word analysis", async () => {
      const r = await call(`${V1}/verses/1:1`);
      const d = r.json.data;
      // Compared against the shipped corpus rather than a literal: the Uthmani text is
      // full of combining marks whose order a copy-paste silently changes.
      const source = JSON.parse(fs.readFileSync(path.join(DATA, "quran-hafs.json"), "utf8"));
      expect(d.text).toBe(source[0].verses[0].text);
      expect(d.words).toHaveLength(4);           // بسم · الله · الرحمن · الرحيم
      expect(d.words.map((w) => w.root)).toEqual(["سمو", "أله", "رحم", "رحم"]);
      expect(d.words[0].morphology.pos).toBeTruthy();
      expect(d.words[0].index).toBe(0);
    });

    it("names a sūrah as well as numbering it", async () => {
      const byNumber = await call(`${V1}/verses/2:255`);
      for (const form of ["2/255", ar("البقرة") + "/255", ar("البقرة") + ":255", "al-baqarah/255", "baqarah:255"]) {
        const r = await call(`${V1}/verses/${form}`);
        expect(r.status, form).toBe(200);
        expect(r.json.data.verse_key, form).toBe("2:255");
        expect(r.json.data.text, form).toBe(byNumber.json.data.text);
      }
    });

    it("takes a name on every route that takes a sūrah", async () => {
      const routes = [
        `/surahs/${ar("الإخلاص")}`,
        "/surahs/al-ikhlas",
        `/verses?surah=${ar("يس")}&limit=1`,
        "/analysis/surah/yasin",
        `/analysis/iltifat/${ar("الفاتحة")}`,
        "/analysis/bonds/al-baqarah?limit=2",
        `/analysis/verse/${ar("البقرة")}:255`,
        `/analysis/rhyme/${ar("الإخلاص")}:1?limit=2`,
        `/graph?verse=${ar("يس")}:1&mode=root&max_branch=2`,
      ];
      for (const r of routes) expect((await call(V1 + r)).status, r).toBe(200);
    });

    it("never answers with a different sūrah than the one asked for", async () => {
      // The corpus romanizer maps these to يوسف / المسد / النساء; the API must not.
      for (const [name, id, arabic] of [["yasin", 36, "يس"], ["maida", 5, "المائدة"], ["nas", 114, "الناس"]]) {
        const r = await call(`${V1}/analysis/surah/${name}`);
        expect(r.json.data.surah.id, name).toBe(id);
        expect(r.json.data.surah.name, name).toBe(arabic);
      }
    });

    it("suggests candidates for an unknown sūrah instead of guessing", async () => {
      const r = await call(`${V1}/analysis/surah/baqra`);
      expect(r.status).toBe(404);
      expect(r.json.error.hint).toContain("البقرة");

      const v = await call(`${V1}/verses/baqra/1`);
      expect(v.status).toBe(404);            // well-formed key, unknown sūrah
      expect((await call(`${V1}/verses/banana`)).status).toBe(400);   // not a key at all
    });

    it("accepts both /verses/2:255 and /verses/2/255", async () => {
      const a = await call(`${V1}/verses/2:255`);
      const b = await call(`${V1}/verses/2/255`);
      expect(a.json.data.text).toBe(b.json.data.text);
    });

    it("rejects a malformed verse key and an out-of-range one differently", async () => {
      expect((await call(`${V1}/verses/banana`)).status).toBe(400);   // not a key at all
      expect((await call(`${V1}/verses/2:900`)).status).toBe(404);     // a key, but no such āya
    });
  });

  describe("search — the core question", () => {
    it("finds every āya carrying a root, and counts tokens not verses", async () => {
      const r = await call(`${V1}/search?q=${ar("كتب")}&mode=root&limit=3`);
      expect(r.json.data.term.key).toBe("كتب");
      expect(r.json.meta.total).toBe(r.json.data.term.verses);
      expect(r.json.data.term.occurrences).toBeGreaterThanOrEqual(r.json.data.term.verses);
      expect(r.json.data.verses).toHaveLength(3);
      // Each result says WHERE in the āya it matched.
      for (const v of r.json.data.verses) expect(v.matches.word_indices.length).toBeGreaterThan(0);
    });

    it("resolves the conventional imlāʾī spelling to the Uthmani form", async () => {
      const r = await call(`${V1}/search?q=${ar("الصلاة")}&mode=exact&limit=1&words=true`);
      const term = r.json.data.term;
      // The query is NOT the corpus spelling (ٱلصَّلَوٰة) — the resolver bridged to it.
      expect(term.resolved_from).toBe("الصلاة");
      expect(term.key).not.toBe("الصلاة");
      expect(term.verses).toBeGreaterThan(50);
      // …and the matched word really is a form of ص-ل-و.
      const v = r.json.data.verses[0];
      expect(v.words[v.matches.word_indices[0]].root).toBe("صلو");
    });

    it("resolves Latin input", async () => {
      const r = await call(`${V1}/search?q=rahman&limit=1`);
      expect(r.json.data.term.verses).toBeGreaterThan(0);
    });

    it("404s an impossible query with near-misses as a hint", async () => {
      const r = await call(`${V1}/search?q=zzzzz`);
      expect(r.status).toBe(404);
      expect(r.json.error.code).toBe("not_found");
      expect(r.json.error.hint).toBeTruthy();
    });

    it("takes the term in the path too — the form curl can send Arabic through", async () => {
      const viaQuery = await call(`${V1}/search?q=${ar("كتب")}&mode=root&limit=2`);
      const viaPath = await call(`${V1}/search/${ar("كتب")}?mode=root&limit=2`);
      expect(viaPath.status).toBe(200);
      expect(viaPath.json.data.term).toEqual(viaQuery.json.data.term);
      expect(viaPath.json.meta.total).toBe(viaQuery.json.meta.total);
    });

    it("paginates without changing the total", async () => {
      const p1 = await call(`${V1}/search?q=${ar("كتب")}&mode=root&limit=5&offset=0`);
      const p2 = await call(`${V1}/search?q=${ar("كتب")}&mode=root&limit=5&offset=5`);
      expect(p1.json.meta.total).toBe(p2.json.meta.total);
      expect(p1.json.data.verses[0].verse_key).not.toBe(p2.json.data.verses[0].verse_key);
      expect(p1.json.links.next).toContain("offset=5");
    });

    it("groups differently per mode: root ⊇ lemma ⊇ exact", async () => {
      const exact = await call(`${V1}/search?q=${ar("كتاب")}&mode=exact&limit=1`);
      const root = await call(`${V1}/search?q=${ar("كتب")}&mode=root&limit=1`);
      expect(root.json.meta.total).toBeGreaterThan(exact.json.meta.total);
    });
  });

  describe("UI links", () => {
    it("attaches links the app can decode to every result", async () => {
      const r = await call(`${V1}/search?q=${ar("كتب")}&mode=root&limit=1`);
      const s = uiState(r.json.links.ui_occurrences);
      expect(s.view).toEqual({ t: "occ", k: "كتب", l: "كتب", m: "root" });
      // …anchored on a verse that actually contains the term.
      const anchor = `${s.surah}:${s.ayah}`;
      expect(anchor).toBe(r.json.data.verses[0].verse_key);

      const vs = uiState(r.json.data.verses[0].links.ui_aya_lab);
      expect(vs.view).toEqual({ t: "aya", c: r.json.data.verses[0].verse_key });
    });

    it("links a root to its lab, distribution and expressions", async () => {
      const r = await call(`${V1}/roots/${ar("علم")}?limit=1`);
      expect(uiState(r.json.links.ui_root_lab).view.t).toBe("lab");
      expect(uiState(r.json.links.ui_distribution).view.t).toBe("dist");
      expect(uiState(r.json.links.ui_expressions).view.t).toBe("expr");
    });

    it("links a comparison to the compare dialog with both terms", async () => {
      const r = await call(`${V1}/analysis/compare?a=${ar("علم")}&b=${ar("جهل")}&mode=root`);
      const v = uiState(r.json.links.ui).view;
      expect(v.t).toBe("cmp");
      expect(v.a.k).toBe("علم");
      expect(v.b.k).toBe("جهل");
    });

    it("links a graph query to the same graph in the app", async () => {
      const r = await call(`${V1}/graph?verse=2:255&mode=root&max_branch=3`);
      const s = uiState(r.json.links.ui);
      expect([s.surah, s.ayah, s.mode]).toEqual([2, 255, "root"]);
      expect(r.json.data.nodes.length).toBeGreaterThan(1);
      expect(r.json.data.nodes[0].type).toBe("center");
    });
  });

  describe("dossiers", () => {
    it("assembles a root's occurrences, derivatives, lexicons and neighbours", async () => {
      const r = await call(`${V1}/roots/${ar("علم")}?limit=2`);
      const d = r.json.data;
      expect(d.term.mode).toBe("root");
      expect(d.derivation.length).toBeGreaterThan(3);
      expect(d.lexicons.length).toBeGreaterThan(0);
      expect(d.lexicons.some((l) => l.id === "maqayis" && l.concise)).toBe(true);
      expect(d.semantic_neighbours.length).toBeGreaterThan(0);
      expect(d.distribution.every((x) => x.occurrences > 0)).toBe(true);
    });

    it("returns a dictionary article with a citation", async () => {
      const r = await call(`${V1}/lexicons/maqayis/${ar("علم")}`);
      expect(r.json.data.concise).toBeTruthy();
      expect(r.json.data.citation.bibtex).toContain("@incollection");
      expect(r.json.data.citation.ris).toContain("TY  - CHAP");
    });

    it("404s an unknown lexicon and lists the real ones", async () => {
      const r = await call(`${V1}/lexicons/nope/${ar("علم")}`);
      expect(r.status).toBe(404);
      expect(r.json.error.hint).toContain("maqayis");
    });

    it("analyses one āya", async () => {
      const r = await call(`${V1}/analysis/verse/2:255`);
      const d = r.json.data;
      expect(d.profile.words).toBeGreaterThan(20);
      expect(d.profile.rhyme.key).toBeTruthy();
      expect(d.similar_verses.length).toBeGreaterThan(0);
      expect(d.similar_verses[0].score).toBeLessThanOrEqual(1);
    });

    it("analyses one sūra", async () => {
      const r = await call(`${V1}/analysis/surah/112`);
      const d = r.json.data;
      expect(d.surah.name).toBe("الإخلاص");
      expect(d.keyness.length).toBeGreaterThan(0);
      expect(d.rhyme.dominant).toBeTruthy();
      expect(d.muqattaat).toBe(null);
    });
  });

  describe("statistics", () => {
    it("distributes a root over the sūrahs, summing to its occurrence count", async () => {
      const r = await call(`${V1}/analysis/distribution?q=${ar("كتب")}&mode=root`);
      const total = r.json.data.distribution.reduce((n, x) => n + x.occurrences, 0);
      expect(total).toBe(r.json.data.term.occurrences);
    });

    it("ranks collocates and reports significance", async () => {
      const r = await call(`${V1}/analysis/collocations?q=${ar("علم")}&mode=root&sort=ll&limit=5`);
      const c = r.json.data.collocates;
      expect(c).toHaveLength(5);
      expect(c[0].log_likelihood).toBeGreaterThanOrEqual(c[4].log_likelihood);
    });

    it("splits adjacency into before and after", async () => {
      const r = await call(`${V1}/analysis/neighbours?q=${ar("علم")}&mode=root&limit=5`);
      const n = r.json.data.neighbours[0];
      expect(n.total).toBe(n.before + n.after);
    });

    it("builds a pairing matrix whose empty cells are visible", async () => {
      const r = await call(`${V1}/analysis/pairing?rows=${ar("علم")},${ar("جهل")}&cols=${ar("نور")},${ar("ظلم")}&mode=root`);
      expect(r.json.data.matrix.cells).toHaveLength(2);
      expect(r.json.data.matrix.cells[0]).toHaveLength(2);
      expect(r.json.data.matrix.cells[0][0].count).toBeGreaterThanOrEqual(0);
    });

    it("requires both axes of a pairing query", async () => {
      const r = await call(`${V1}/analysis/pairing?rows=${ar("علم")}`);
      expect(r.status).toBe(400);
      expect(r.json.error.hint).toContain("rows=");
    });
  });

  describe("transport", () => {
    it("serves CSV for tabular endpoints and refuses it elsewhere", async () => {
      const ok = await call(`${V1}/roots?limit=3&format=csv`);
      expect(ok.headers["Content-Type"]).toMatch(/text\/csv/);
      expect(ok.body.split("\n")[0]).toContain("root");

      const no = await call(`${V1}/verses/2:255?format=csv`);
      expect(no.status).toBe(400);
    });

    it("returns 304 when the caller already has the answer", async () => {
      const first = await call(`${V1}/surahs`);
      const etag = first.headers.ETag;
      expect(etag).toBeTruthy();
      const again = await call(`${V1}/surahs`, { headers: { "if-none-match": etag } });
      expect(again.status).toBe(304);
    });

    it("allows cross-origin reads", async () => {
      const r = await call(`${V1}/health`);
      expect(r.headers["Access-Control-Allow-Origin"]).toBe("*");
    });

    it("reports the rate-limit budget on every response", async () => {
      const r = await call(`${V1}/health`);
      expect(Number(r.headers["X-RateLimit-Limit"])).toBeGreaterThan(0);
      expect(r.headers["X-RateLimit-Remaining"]).toBeDefined();
    });

    it("points a stray /api at the current version", async () => {
      const r = await call("/api/v2/verses/1:1");
      expect(r.status).toBe(404);
      expect(r.json.error.hint).toContain("/api/v1");
    });

    it("refuses writes — the whole API is read-only", async () => {
      const r = await call(`${V1}/verses/1:1`, { method: "POST" });
      expect(r.status).toBe(405);
      expect(r.json.error.code).toBe("method_not_allowed");
    });

    it("answers a CORS preflight", async () => {
      const r = await call(`${V1}/search?q=x`, { method: "OPTIONS" });
      expect(r.status).toBe(204);
      expect(r.headers["Access-Control-Allow-Headers"]).toContain("X-API-Key");
    });
  });
});
