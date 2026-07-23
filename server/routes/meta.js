/* ═══ Meta routes: the service's own description ═══
 *
 * `/` is the discovery document — hit it with no arguments and you can find everything
 * else from there. `/openapi.json` is the machine-readable version, `/docs` the human one.
 */

import { config, keysEnforced } from "../config.js";
import { buildOpenApi } from "../openapi.js";
import { docsHtml } from "../docs.js";
import { explorerHtml } from "../explorer.js";
import { corpusLink, claimsLink, rasmLink } from "../links.js";

export function register(router, ctx) {
  const { corpus: C, base } = ctx;

  router.add("/", () => ({
    data: {
      name: "آيات.network API",
      description: "Read-only access to the Qurʾānic word / lemma / root network, its morphology, "
        + "six classical lexicons and every analysis the app performs — each answer carrying a link "
        + "that opens the same thing in the UI.",
      version: ctx.version,
      app: config.appBase,
      corpus: C.stats,
      access: keysEnforced()
        ? { keys: "required", header: "X-API-Key", rate_limit_per_window: config.rateLimitKeyed, window_minutes: config.rateWindowMs / 60000 }
        : { keys: "not required (open access)", rate_limit_per_window: config.rateLimit, window_minutes: config.rateWindowMs / 60000 },
      conventions: {
        verse_key: "surah:ayah, e.g. 2:255 (also accepted as 2/255)",
        mode: "exact (surface form) | lemma (صيغة) | root (جذر)",
        precision: "loose (folds آية/اية, the default) | strict",
        pagination: "?limit= (max " + config.maxLimit + ") &offset=; responses carry meta.total and links.next",
        format: "?format=csv on list endpoints",
        links: "every object carries `links` — `ui*` keys open the matching view in the app",
      },
      endpoints: router.routes
        .filter((r) => !r.meta.hidden)
        .map((r) => ({ path: r.pattern, url: base + (r.pattern === "/" ? "" : r.pattern), summary: r.meta.summary })),
      links: {
        self: base + "/",
        docs: base + "/docs",
        guide: base + "/guide",
        openapi: base + "/openapi.json",
        ui: config.appBase,
        ui_corpus_explorer: corpusLink("2:255"),
        ui_claim_board: claimsLink("2:255"),
        ui_rasm_lab: rasmLink(null, "2:255"),
      },
    },
  }), {
    summary: "This document: every endpoint, the corpus counts, the conventions.",
    description: "Start here. Everything else in the API is reachable from this response.",
    tags: ["meta"],
    response: "IndexResponse",
    examples: [{ label: "The service index", path: "/" }],
  });

  router.add("/health", () => ({
    data: { status: "ok", verses: C.stats.verses, morphology: C.stats.morphology, lexicons: C.stats.lexicons },
  }), {
    summary: "Liveness, and what data this instance actually loaded.",
    tags: ["meta"],
    response: "Envelope",
    examples: [{ label: "Is it up?", path: "/health" }],
  });

  router.add("/sources", () => ({
    data: C.sources || { note: "This build did not emit a provenance manifest." },
  }), {
    summary: "Provenance: the exact corpora revisions and checksums this data was built from.",
    description: "Cite these, not the API alone. Each entry names the upstream repository, the "
      + "revision shipped, and its checksum.",
    tags: ["meta"],
    response: "Envelope",
    examples: [{ label: "What this build shipped", path: "/sources" }],
  });

  router.add("/coverage", () => ({
    data: C.coverage || { note: "This build did not emit a coverage manifest." },
  }), {
    summary: "What fraction of tokens carry a root / lemma analysis.",
    description: "Root-based aggregates can only speak for the tokens that have a root; this says "
      + "how many that is.",
    tags: ["meta"],
    response: "Envelope",
    examples: [{ label: "Coverage", path: "/coverage" }],
  });

  router.add("/openapi.json", ({ url }) => ({ raw: buildOpenApi(router, ctx, url) }),
    {
      summary: "OpenAPI 3.1 description of this API.",
      description: "Every path, parameter and response schema, machine-readable. Feed it to a client "
        + "generator, an API explorer, or an agent.",
      tags: ["meta"],
      examples: [{ label: "The spec", path: "/openapi.json" }],
    });

  router.add("/docs", () => ({ html: explorerHtml() }),
    {
      summary: "The interactive API explorer.",
      description: "Every endpoint with its parameters, its examples and a Run button — try any "
        + "request in the browser and follow the `ui…` links straight into the app.",
      tags: ["meta"],
      examples: [{ label: "Open it", path: "/docs" }],
    });

  router.add("/guide", () => ({ html: docsHtml(router, ctx) }),
    {
      summary: "The prose reference: conventions, access, the endpoint table.",
      description: "The narrative version — what the API is for, how Arabic input is resolved, "
        + "how paging and CSV work, and what every endpoint does. Static HTML, no JavaScript.",
      tags: ["meta"],
      examples: [{ label: "Read it", path: "/guide" }],
    });
}
