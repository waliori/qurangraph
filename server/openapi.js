/* ═══ OpenAPI 3.1 description ═══
 *
 * Generated from the router, so it cannot fall out of step with the routes: each
 * registered pattern becomes a path, its declared parameters (server/params.js) become
 * typed parameter objects with defaults and examples, and its declared response name
 * resolves to a real component schema (server/schemas.js).
 *
 * The same route metadata drives the interactive explorer at /docs, so the docs, the
 * spec and the running code all read from one declaration.
 */

import { config, keysEnforced } from "./config.js";
import { allSchemas } from "./schemas.js";

const TAG_DESCRIPTIONS = {
  meta: "Discovery, provenance and the documentation itself.",
  corpus: "The text: sūrahs, āyāt, and every token's morphology.",
  lexical: "Words, lemmas, roots, and the six classical dictionaries.",
  analysis: "Statistics and structural analyses over the corpus.",
  expressions: "Multi-word units — government frames, collocations, iḍāfa, idioms.",
  graph: "The word/āya network itself.",
};

/* One declared parameter → an OpenAPI parameter object. */
function toParameter(p) {
  const schema = { type: p.type || "string" };
  if (p.enum) schema.enum = p.enum;
  if (p.default !== undefined) schema.default = p.default;
  if (p.minimum !== undefined) schema.minimum = p.minimum;
  if (p.maximum !== undefined) schema.maximum = p.maximum;
  return {
    name: p.name,
    in: p.in,
    required: !!p.required || p.in === "path",
    description: p.description,
    schema,
    ...(p.example !== undefined ? { example: p.example } : {}),
    // Not part of the spec, but harmless and useful: it tells a renderer this field
    // holds Arabic and should be laid out right-to-left.
    ...(p.rtl ? { "x-rtl": true } : {}),
  };
}

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

export function buildOpenApi(router, ctx, url) {
  const server = ctx.base || `${url.protocol}//${url.host}/api/v1`;
  const schemas = allSchemas();
  const paths = {};
  const usedTags = new Set();

  for (const r of router.routes) {
    if (r.pattern === "/openapi.json" || r.pattern === "/docs" || r.pattern === "/guide") continue;
    const path = r.pattern.replace(/:([A-Za-z_]+)/g, "{$1}");
    const m = r.meta || {};
    const tag = (m.tags && m.tags[0]) || "meta";
    usedTags.add(tag);

    const declared = m.params || [];
    // Any `:param` in the pattern that nobody declared still has to appear, or the spec
    // is invalid — fall back to a bare string rather than silently dropping it.
    const declaredPathNames = new Set(declared.filter((p) => p.in === "path").map((p) => p.name));
    const implicit = r.parts
      .filter((seg) => seg.startsWith(":") && !declaredPathNames.has(seg.slice(1)))
      .map((seg) => ({ name: seg.slice(1), in: "path", required: true, type: "string" }));

    const responseSchema = m.response && schemas[m.response] ? ref(m.response) : ref("Envelope");

    paths[path] = {
      get: {
        summary: m.summary || r.pattern,
        ...(m.description ? { description: m.description } : {}),
        operationId: operationId(r.pattern),
        tags: [tag],
        parameters: [...implicit, ...declared].map(toParameter),
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json": { schema: responseSchema },
              ...(declared.some((p) => p.name === "format")
                ? { "text/csv": { schema: { type: "string" }, example: "root,occurrences,verses\nقول,1722,1467\n" } }
                : {}),
            },
          },
          400: { description: "A parameter is missing or out of range", content: { "application/json": { schema: ref("ErrorResponse") } } },
          404: { description: "Nothing in the corpus matches", content: { "application/json": { schema: ref("ErrorResponse") } } },
          429: { description: "Rate limit exceeded", content: { "application/json": { schema: ref("ErrorResponse") } } },
        },
        ...(m.examples?.length
          ? { "x-examples": m.examples.map((e) => ({ label: e.label, url: server + e.path })) }
          : {}),
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "آيات.network API",
      version: ctx.version,
      summary: "The Qurʾānic word · lemma · root network, its morphology, six classical lexicons, "
        + "and every analysis the app performs — as JSON.",
      description:
        "Read-only access to the corpus behind [ayat.network](" + config.appBase + ").\n\n"
        + "**Every response links back into the app.** Alongside `self` and `next`, each `links` "
        + "block carries `ui…` entries: fully-formed URLs that open the app showing exactly what "
        + "the response describes — the occurrences sheet for a word, the distribution chart for a "
        + "root, the graph centred on an āya. The whole app state travels in the URL fragment, so "
        + "they work as shares, bookmarks and citations.\n\n"
        + "**Arabic input** is forgiving: vocalized Uthmani (ٱلصَّلَوٰة), conventional imlāʾī (الصلاة) "
        + "or Latin transliteration (rahman) all resolve, and a miss returns near-matches as a hint.\n\n"
        + "**From curl**, prefer the path forms (`/search/كتب`, `/roots/علم`): curl percent-encodes a "
        + "URL's path but passes its query string through verbatim, so `?q=كتب` puts raw UTF-8 in "
        + "the request line and the HTTP parser rejects it before the API sees it.\n\n"
        + (keysEnforced()
          ? "This deployment **requires an API key** (`X-API-Key`)."
          : "This deployment is **open** — no key required. A per-IP rate limit applies."),
      contact: { email: "waliori@gmail.com", url: config.appBase },
      license: { name: "Data: see /sources for each corpus's licence", url: server + "/sources" },
    },
    servers: [{ url: server, description: "Production" }],
    externalDocs: { description: "Interactive explorer", url: server + "/docs" },
    paths,
    tags: [...usedTags].map((name) => ({ name, description: TAG_DESCRIPTIONS[name] || "" })),
    components: {
      securitySchemes: {
        ApiKeyHeader: { type: "apiKey", in: "header", name: "X-API-Key" },
        ApiKeyQuery: { type: "apiKey", in: "query", name: "api_key" },
      },
      schemas,
    },
    ...(keysEnforced() ? { security: [{ ApiKeyHeader: [] }, { ApiKeyQuery: [] }] } : {}),
  };
}

const operationId = (p) =>
  p === "/" ? "getIndex"
    : "get" + p.replace(/[:/]([a-z])/gi, (_, c) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, "");
