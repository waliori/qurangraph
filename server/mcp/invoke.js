/* ═══ Calling the API from inside the process ═══
 *
 * Every MCP tool answers by invoking a REAL route handler — the same function `GET
 * /api/v1/search` runs — rather than reaching into the corpus itself. That is the whole
 * design: term resolution, the forgiving Arabic matcher, sūrah naming, paging, the UI deep
 * links and the 404-with-near-misses all come along for free, and an MCP answer cannot
 * drift from the HTTP answer or from the screen, because there is one implementation.
 *
 * No socket is involved. `router.match()` + `handler({...})` is exactly what
 * server/index.js does after its own validation, so the cost is a function call.
 */

import { config } from "../config.js";
import { notFound } from "../http.js";

/* Percent-encode a value going into a PATH segment. The router decodes it again on the way
 * out, so Arabic, colons and slashes all survive: `/verses/2%3A255` → params.key "2:255". */
export const seg = (v) => encodeURIComponent(String(v ?? ""));

export function createInvoker({ router, corpus, ctx }) {
  /* `pathname` is API-relative and already segment-encoded ("/roots/%D8%B9%D9%84%D9%85").
   * `query` is a plain object; undefined / null / "" entries are dropped, arrays joined
   * with commas (the form the API's own list parameters take). */
  return async function invoke(pathname, query = {}) {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      search.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }

    const hit = router.match(pathname);
    if (!hit) throw notFound(`No endpoint "${pathname}".`);

    const V = corpus.variant(search.get("precision") === "strict" ? "strict" : "loose");
    const url = `${config.publicBase}${pathname}${search.toString() ? `?${search}` : ""}`;

    const out = await hit.route.handler({
      V, corpus, params: hit.params, query: search, url, ctx,
    });

    // Handlers that answer with HTML (/docs, /guide) or a bare document (/openapi.json)
    // are never reached from a tool; if one ever is, that is a bug here, not a 200.
    if (out?.html) throw notFound(`"${pathname}" answers with HTML and has no MCP tool.`);

    return { data: out?.raw ?? out?.data, meta: out?.meta, links: out?.links, url };
  };
}
