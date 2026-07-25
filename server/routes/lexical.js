/* ═══ Lexical routes: search, words, lemmas, roots, lexicons ═══
 *
 * The heart of the API. `/search` answers the question the app was built around —
 * "which āyāt use this word / this lemma / this root?" — and every root gets a full
 * dossier: its occurrences, its derivational family, its dictionary articles, its
 * distributional neighbours and its curated opposites, each with a link straight to the
 * matching view in the UI.
 */

import { notFound, qBool, qEnum, paging, page } from "../http.js";
import { resolveTerm, termShape, occurrencesOf, MODES } from "../terms.js";
import { termLinks, viewLink } from "../links.js";
import { rootFrequency, hapaxRoots } from "../../src/analytics/corpus.js";
import { derivationFamily } from "../../src/analytics/derivation.js";
import { relationsOf } from "../../src/analytics/relations.js";
import { expressionsForRoot, compoundPhrase } from "../../src/analytics/expressions.js";
import { distributionBySura } from "../../src/analytics/stats.js";
import { P, PP, PAGED } from "../params.js";

export function register(router, ctx) {
  const { corpus: C } = ctx;

  /* ── search ── the general entry point ──
   *
   * Offered in two shapes on purpose. `?q=` is what a browser, fetch() or any HTTP
   * library sends; but curl percent-encodes the PATH of a URL and passes the QUERY
   * STRING through verbatim, so `curl '…/search?q=كتب'` puts raw UTF-8 in the request
   * line — which nginx and Node's HTTP parser both reject with an empty 400, before any
   * of this code runs. On an API about Arabic that is a trap worth designing out, so the
   * term may also travel as a path segment, where curl encodes it for you. */
  const search = (raw) => ({ V, query, url }) => {
    const mode = qEnum(query, "mode", MODES, "exact");
    const term = resolveTerm(V, C, raw, mode);
    const all = occurrencesOf(V, C, term, { words: qBool(query, "words", false) });
    const p = page(all, paging(query), url);
    return {
      data: { term: termShape(V, term, { anchor: all[0]?.verse_key }), verses: p.items },
      meta: p.meta,
      links: { ...termLinks(term, all[0]?.verse_key), ...p.links },
    };
  };
  router.add("/search", (c) => search(c.query.get("q"))(c),
    {
      summary: "Every āya containing a word, lemma or root.",
      description: "The main entry point. Give it a term in any spelling and a grouping mode, and "
        + "it returns the resolved term plus every āya that contains it, each marking which words "
        + "matched. The `links` block opens the same result in the app.",
      tags: ["lexical"],
      params: [P.q, P.mode, P.precision, P.words, ...PAGED],
      response: "SearchResponse",
      examples: [
        { label: "The root ك-ت-ب — 279 āyāt", path: "/search?q=كتب&mode=root&limit=5" },
        { label: "Just the surface form الصلاة", path: "/search?q=الصلاة&limit=5" },
        { label: "Latin input", path: "/search?q=rahman&limit=5" },
        { label: "With full morphology", path: "/search?q=نور&mode=root&limit=3&words=true" },
      ],
    });
  router.add("/search/:q", (c) => search(c.params.q)(c),
    {
      summary: "Same as /search, with the term in the path.",
      description: "Identical to `/search?q=…`. Use this one from curl: curl percent-encodes the "
        + "path of a URL but passes the query string through verbatim, so `?q=كتب` puts raw UTF-8 "
        + "in the request line, and both nginx and Node reject that with an empty 400 before the "
        + "API ever sees it. In the path, curl encodes it for you.",
      tags: ["lexical"],
      params: [PP.searchTerm, P.mode, P.precision, P.words, ...PAGED],
      response: "SearchResponse",
      examples: [{ label: "Arabic typed as-is — the curl-safe form", path: "/search/كتب?mode=root&limit=5" }],
    });

  /* ── the three mode-specific shortcuts ── */
  const byMode = (mode) => ({ V, params, query, url }) => {
    const term = resolveTerm(V, C, params.key, mode);
    const all = occurrencesOf(V, C, term, { words: qBool(query, "words", false) });
    const p = page(all, paging(query), url);
    return {
      data: { term: termShape(V, term, { anchor: all[0]?.verse_key }), verses: p.items },
      meta: p.meta, links: { ...termLinks(term, all[0]?.verse_key), ...p.links },
    };
  };
  router.add("/words/:key", byMode("exact"), {
    summary: "Every āya containing an exact surface form.",
    description: "Exact-mode lookup: this spelling only, not its lemma or root family. The query is "
      + "still resolved forgivingly, so the conventional الصلاة reaches the Uthmani ٱلصَّلَوٰة.",
    tags: ["lexical"],
    params: [PP.wordKey, P.precision, P.words, ...PAGED],
    response: "SearchResponse",
    examples: [{ label: "ٱلصَّلَوٰة, typed the conventional way", path: "/words/الصلاة?limit=5" }],
  });
  router.add("/lemmas/:key", byMode("lemma"), {
    summary: "Every āya containing a lemma (صيغة).",
    description: "Lemma mode groups a word across its inflections, but not across its root family.",
    tags: ["lexical"],
    params: [PP.lemmaKey, P.words, ...PAGED],
    response: "SearchResponse",
    examples: [{ label: "كِتاب in every inflection", path: "/lemmas/كِتاب?limit=5" }],
  });

  /* ── roots ── */
  router.add("/roots", ({ V, query, url }) => {
    const q = (query.get("q") || "").trim();
    let list = rootFrequency(V.verseData);
    if (qBool(query, "hapax", false)) {
      const hx = new Set(hapaxRoots(V.verseData).map((h) => h.root));
      list = list.filter((r) => hx.has(r.root));
    }
    if (q) list = list.filter((r) => r.root.includes(q));
    const sort = qEnum(query, "sort", ["frequency", "alphabetical"], "frequency");
    if (sort === "alphabetical") list = [...list].sort((a, b) => a.root.localeCompare(b.root));
    const p = page(list, paging(query), url);
    return {
      data: p.items.map((r) => ({
        root: r.root, occurrences: r.count, verses: r.verses,
        links: termLinks({ key: r.root, label: r.root, mode: "root" }, (V.r2v[r.root] || [])[0], true),
      })),
      meta: p.meta, links: p.links,
    };
  }, {
    summary: "Browse every triliteral root in the Qurʾān.",
    description: "Ranked by token frequency by default. `hapax=true` narrows to the roots that occur "
      + "exactly once in the whole text.",
    tags: ["lexical"],
    params: [P.rootSearch, P.hapax, P.rootSort, ...PAGED],
    response: "RootListResponse",
    examples: [
      { label: "The 20 most frequent", path: "/roots?limit=20" },
      { label: "Roots containing ك-ت", path: "/roots?q=كت" },
      { label: "Hapax legomena", path: "/roots?hapax=true&limit=20" },
    ],
  });

  router.add("/roots/:key", ({ V, params, query, url }) => {
    const term = resolveTerm(V, C, params.key, "root");
    const root = term.key;
    const verseKeys = V.r2v[root] || [];
    const anchor = verseKeys[0];
    const all = occurrencesOf(V, C, term, { words: qBool(query, "words", false) });
    const p = page(all, paging(query), url);

    const family = derivationFamily(root, V.r2v, V.verseData, C.morph).map((d) => ({
      lemma: d.lemma, pos: d.pos, form: d.vf || undefined, voice: d.voice || undefined,
      aspect: d.aspect || undefined, occurrences: d.count, examples: d.examples,
      links: termLinks({ key: d.key, label: d.lemma, mode: "lemma" }, d.verses?.[0], true),
    }));

    const lexicons = C.lexiconIndex.map((lx) => {
      const entry = C.lexiconConcise.get(lx.id)?.[root];
      if (!entry) return null;
      return { id: lx.id, label: lx.label, concise: entry.c || null, has_full: !!lx.hasFull,
               links: { self: `${ctx.base}/lexicons/${lx.id}/${encodeURIComponent(root)}` } };
    }).filter(Boolean);

    const neighbours = (C.semantic[root] || []).map(([other, score, kind]) => ({
      root: other, similarity: score, relation: kind,
      links: termLinks({ key: other, label: other, mode: "root" }, (V.r2v[other] || [])[0], true),
    }));

    const relations = relationsOf(root, C.relations).map((r) => ({
      root: r.other, polarity: r.polarity, relatedness: r.relatedness, contrast: r.contrast,
      verses: r.verses || [],
      links: termLinks({ key: r.other, label: r.other, mode: "root" }, (V.r2v[r.other] || [])[0], true),
    }));

    const expr = C.expressions && C.expressionIndex
      ? summariseExpressions(expressionsForRoot(C.expressions, C.expressionIndex, root))
      : null;

    return {
      data: {
        term: termShape(V, term, { anchor }),
        distribution: distributionBySura(root, V.r2v, V.verseData, V.surahList, "root")
          .filter((d) => d.count > 0)
          .map((d) => ({ surah: d.sura, name: d.name, occurrences: d.count })),
        derivation: family,
        lexicons,
        semantic_neighbours: neighbours,
        relations,
        expressions: expr,
        verses: p.items,
      },
      meta: p.meta,
      links: {
        ...termLinks(term, anchor),
        ui_derivation: anchor ? viewLink({ t: "lab", r: root, l: root }, anchor, "root") : null,
        ...p.links,
      },
    };
  }, {
    summary: "Everything the corpus holds about one root.",
    description: "The full dossier: its distribution across the sūrahs, its derivational family "
      + "(every lemma built on it), its article in each of the six classical dictionaries, its "
      + "distributional neighbours, its curated opposites, the multi-word expressions it enters, "
      + "and the āyāt themselves.",
    tags: ["lexical"],
    params: [PP.rootKey, P.words, ...PAGED],
    response: "RootResponse",
    examples: [
      { label: "ع-ل-م, the whole dossier", path: "/roots/علم?limit=3" },
      { label: "ن-و-ر", path: "/roots/نور?limit=3" },
    ],
  });

  /* ── lexicons ── */
  router.add("/lexicons", () => ({
    data: C.lexiconIndex.map((lx) => ({
      id: lx.id, label: lx.label, license: lx.license, edition: lx.edition,
      has_full: !!lx.hasFull, coverage_percent: lx.coverage,
      links: { self: `${ctx.base}/lexicons/${lx.id}/{root}` },
    })),
  }), {
    summary: "The six classical Arabic dictionaries.",
    description: "Each with its edition, licence and root coverage.",
    tags: ["lexical"],
    response: "Envelope",
    examples: [{ label: "List them", path: "/lexicons" }],
  });

  router.add("/lexicons/:id/:root", ({ V, params, query }) => {
    const lx = C.lexiconIndex.find((l) => l.id === params.id);
    if (!lx) throw notFound(`No lexicon "${params.id}".`, `Available: ${C.lexiconIndex.map((l) => l.id).join(", ")}`);
    const term = resolveTerm(V, C, params.root, "root");
    const root = term.key;
    const concise = C.lexiconConcise.get(lx.id)?.[root];
    if (!concise) throw notFound(`${lx.id} has no entry for the root ${root}.`);
    const wantFull = qBool(query, "full", true);
    const full = wantFull && lx.hasFull ? C.lexiconFull(lx.id, root) : null;
    const anchor = (V.r2v[root] || [])[0];
    return {
      data: {
        lexicon: { id: lx.id, label: lx.label, license: lx.license, edition: lx.edition },
        root,
        concise: concise.c || null,
        full: full || concise.f || null,
        citation: citation(lx, root),
        links: termLinks({ key: root, label: root, mode: "root" }, anchor),
      },
    };
  }, {
    summary: "One dictionary's article for one root.",
    description: "Concise gloss plus the full article, and a citation in plain text, BibTeX and RIS "
      + "carrying the edition's own details — so a quotation can be sourced properly.",
    tags: ["lexical"],
    params: [PP.lexiconId, PP.root, P.full],
    response: "LexiconEntryResponse",
    examples: [
      { label: "Ibn Fāris on ع-ل-م", path: "/lexicons/maqayis/علم" },
      { label: "Lisān al-ʿArab, concise only", path: "/lexicons/lisan/نور?full=false" },
    ],
  });

  /* ── an occurrence-only view, for callers that just want the verse list ── */
  router.add("/occurrences", ({ V, query, url }) => {
    const mode = qEnum(query, "mode", MODES, "exact");
    const term = resolveTerm(V, C, query.get("term") ?? query.get("q"), mode);
    const keys = V.indices[mode][term.key] || [];
    const p = page(keys, paging(query), url);
    return {
      data: { term: termShape(V, term, { anchor: keys[0] }), verse_keys: p.items },
      meta: p.meta, links: { ...termLinks(term, keys[0]), ...p.links },
    };
  }, {
    summary: "Just the verse keys for a term.",
    description: "The smallest possible answer — no text, no morphology, only `2:255`-style keys. "
      + "For clients that already hold the text and need only the index.",
    tags: ["lexical"],
    params: [P.term, P.mode, P.precision, ...PAGED],
    response: "Envelope",
    examples: [{ label: "Where ن-و-ر occurs", path: "/occurrences?term=نور&mode=root&limit=50" }],
  });
}

function summariseExpressions(e) {
  if (!e) return null;
  return {
    government_frames: (e.heads || []).slice(0, 20).map((h) => ({
      head: h.head, pos: h.pos, total: h.total, governed: h.governed, bare: h.bare,
      prepositions: (h.preps || []).map((p) => ({ preposition: p.prep, gloss: p.disp, count: p.count })),
    })),
    collocations: (e.collocations || []).slice(0, 20).map((c) => ({
      verb: c.verb, noun: c.noun, count: c.count, log_likelihood: c.ll,
    })),
    idafa_compounds: (e.compounds || []).slice(0, 20).map((c) => ({ phrase: compoundPhrase(c), count: c.count })),
  };
}

function citation(lx, root) {
  const ed = lx.edition || {};
  const author = ed.author || lx.label;
  const title = ed.title || lx.label;
  return {
    text: `${author}, ${title}${ed.publisher ? `, ${ed.publisher}` : ""}, s.v. «${root}».`,
    bibtex: `@incollection{${lx.id}-${root},\n  author = {${author}},\n  title = {${title}},\n  chapter = {${root}},\n  publisher = {${ed.publisher || ""}},\n  note = {s.v. ${root}}\n}`,
    ris: `TY  - CHAP\nAU  - ${author}\nT1  - ${title}\nCP  - ${root}\nPB  - ${ed.publisher || ""}\nER  -`,
  };
}
