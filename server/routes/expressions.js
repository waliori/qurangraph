/* ═══ Expressions routes (التعابير) ═══
 *
 * Multi-word units rather than single words: a head's governed prepositions
 * (آمَنَ بـ vs آمَنَ لـ), verb–noun collocations (أقام الصلاة), iḍāfa compounds
 * (مالك يوم الدين), and the curated idioms. All mined offline into
 * public/data/expressions.json; these routes read it and attach the verses.
 */

import { notFound, qInt, paging, page } from "../http.js";
import { resolveTerm, termShape } from "../terms.js";
import { termLinks, verseLinks, viewLink } from "../links.js";
import { headRows, expressionsForRoot, occVerses, FRAME_SPAN, spanRun, compoundPhrase, idiomPhrase } from "../../src/analytics/expressions.js";
import { P, PP, PAGED } from "../params.js";

export function register(router, ctx) {
  const { corpus: C } = ctx;

  const need = () => {
    if (!C.expressions || !C.expressionIndex) {
      throw notFound("The expressions dataset was not built for this deployment.",
        "Run `npm run data:expressions` and restart the API.");
    }
  };

  /* Every occurrence list is capped by `?verses=` (0 for none). An unbounded default
   * would make a two-row page weigh a megabyte: these frames run to thousands of
   * āyāt each, and the point of the row is the CONTRAST between prepositions. */
  const verseCap = (query) => qInt(query, "verses", { min: 0, max: 500, def: 5 });

  router.add("/expressions", ({ V, query, url }) => {
    need();
    const rows = headRows(C.expressions, C.expressionIndex);
    const p = page(rows, paging(query), url);
    const cap = verseCap(query);
    return {
      data: p.items.map((h) => shapeHead(V, h, cap)),
      meta: p.meta, links: p.links,
    };
  }, {
    summary: "Every governing head, with its preposition breakdown.",
    description: "The contrast is the content: آمَنَ بـ against آمَنَ لـ, and the bare (un-governed) "
      + "residual alongside both, so you can see how often a head takes each ḥarf versus none. "
      + "Ranked by how often the head governs at all.",
    tags: ["expressions"],
    params: [P.exprVerses, ...PAGED],
    response: "ExpressionsResponse",
    examples: [
      { label: "The strongest governing heads", path: "/expressions?limit=10" },
      { label: "With 20 example āyāt each", path: "/expressions?limit=5&verses=20" },
    ],
  });

  router.add("/expressions/idioms", ({ V, query, url }) => {
    need();
    const rows = C.expressions.idioms || [];
    const p = page(rows, paging(query), url);
    return {
      data: p.items.map((i) => ({
        phrase: idiomPhrase(i),
        gloss: i.gloss || undefined,
        count: i.count ?? (i.occ || []).length,
        verses: occVerses(i.occ || [], V.verseData, spanRun((i.len || (i.norm || "").split(" ").length) || 2))
          .slice(0, verseCap(query))
          .map((o) => ({ verse_key: o.vk, word_indices: o.hi, text: V.verseData[o.vk]?.text, links: verseLinks(o.vk, "exact", true) })),
      })),
      meta: p.meta, links: p.links,
    };
  }, {
    summary: "Curated Qurʾānic idioms.",
    description: "Multi-word units whose sense is not the sum of their parts, with the āyāt that "
      + "carry them and the exact word positions to highlight.",
    tags: ["expressions"],
    params: [P.exprVerses, ...PAGED],
    response: "Envelope",
    examples: [{ label: "The idiom list", path: "/expressions/idioms?limit=20" }],
  });

  router.add("/expressions/compounds", ({ V, query, url }) => {
    need();
    const rows = C.expressions.compounds || [];
    const p = page(rows, paging(query), url);
    return {
      data: p.items.map((c) => ({
        phrase: compoundPhrase(c), count: c.count, roots: c.roots || [],
        verses: occVerses(c.occ || [], V.verseData, spanRun(2))
          .slice(0, verseCap(query))
          .map((o) => ({ verse_key: o.vk, word_indices: o.hi, links: verseLinks(o.vk, "exact", true) })),
      })),
      meta: p.meta, links: p.links,
    };
  }, {
    summary: "Iḍāfa constructs (مالك يوم الدين), by frequency.",
    description: "Annexation pairs mined from the corpus morphology, each with its component roots "
      + "and the āyāt it appears in.",
    tags: ["expressions"],
    params: [P.exprVerses, ...PAGED],
    response: "Envelope",
    examples: [{ label: "The most frequent constructs", path: "/expressions/compounds?limit=20" }],
  });

  router.add("/expressions/collocations", ({ query, url }) => {
    need();
    const rows = [...(C.expressions.collocations || [])].sort((a, b) => b.ll - a.ll);
    const p = page(rows, paging(query), url);
    return {
      data: p.items.map((c) => ({ verb: c.verb, noun: c.noun, verb_root: c.verbRoot, noun_root: c.nounRoot, count: c.count, log_likelihood: c.ll })),
      meta: p.meta, links: p.links,
    };
  }, {
    summary: "Verb–noun collocations (أقام الصلاة), by log-likelihood.",
    description: "Verb-and-object pairings that occur together far more than chance would predict.",
    tags: ["expressions"],
    params: [...PAGED],
    response: "Envelope",
    examples: [{ label: "The tightest pairings", path: "/expressions/collocations?limit=20" }],
  });

  router.add("/expressions/roots/:root", ({ V, params, query }) => {
    need();
    const cap = verseCap(query);
    const t = resolveTerm(V, C, params.root, "root");
    const e = expressionsForRoot(C.expressions, C.expressionIndex, t.key);
    const anchor = (V.r2v[t.key] || [])[0];
    return {
      data: {
        term: termShape(V, t, { anchor }),
        government_frames: (e.heads || []).map((h) => shapeHead(V, h, cap)),
        collocations: (e.collocations || []).map((c) => ({ verb: c.verb, noun: c.noun, count: c.count, log_likelihood: c.ll })),
        compounds: (e.compounds || []).map((c) => ({ phrase: compoundPhrase(c), count: c.count })),
      },
      links: {
        ...termLinks(t, anchor),
        ui: anchor ? viewLink({ t: "expr", r: t.key }, anchor, "root") : undefined,
      },
    };
  }, {
    summary: "Every multi-word expression a root takes part in.",
    description: "Its government frames, its verb–noun collocations and its iḍāfa constructs, "
      + "gathered in one place — the root seen as a member of phrases rather than alone.",
    tags: ["expressions"],
    params: [PP.root, P.exprVerses],
    response: "Envelope",
    examples: [
      { label: "The phrases أ-م-ن enters", path: "/expressions/roots/أمن" },
      { label: "…and ص-ل-و", path: "/expressions/roots/صلو" },
    ],
  });

  function shapeHead(V, h, verseCapN = 5) {
    const frames = C.expressionIndex.byHead.get(`${h.pos}|${h.head}`) || [];
    const byPrep = new Map(frames.map((f) => [f.prep, f]));
    const anchor = frames[0]?.occ?.[0]?.[0] || (h.root ? (V.r2v[h.root] || [])[0] : undefined);
    return {
      head: h.head, pos: h.pos, root: h.root,
      total: h.total, governed: h.governed, bare: h.bare,
      prepositions: (h.preps || []).map((p) => ({
        preposition: p.prep, gloss: p.disp, count: p.count,
        verses: occVerses(byPrep.get(p.prep)?.occ || [], V.verseData, FRAME_SPAN)
          .slice(0, verseCapN)
          .map((o) => ({ verse_key: o.vk, word_indices: o.hi, links: verseLinks(o.vk, "exact", true) })),
      })),
      links: h.root && anchor
        ? { ui: viewLink({ t: "expr", r: h.root }, anchor, "root"), ui_root: termLinks({ key: h.root, label: h.root, mode: "root" }, anchor, true).ui }
        : {},
    };
  }
}
