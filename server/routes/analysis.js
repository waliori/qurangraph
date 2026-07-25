/* ═══ Analysis routes ═══
 *
 * Thin HTTP skins over the app's analytics modules (src/analytics/*), which are already
 * pure functions over the indices. Nothing is recomputed differently here: the numbers an
 * API caller gets are the numbers on screen, and every row carries the link that opens
 * that exact view.
 */

import { notFound, badRequest, qInt, qBool, qEnum, paging, page } from "../http.js";
import { resolveTerm, termShape, verseShape, resolveSurahId, MODES } from "../terms.js";
import { hitIndices } from "../corpus.js";
import { termLinks, verseLinks, surahLinks, compareLink, pairingLink, verseLink, viewLink, rasmLink } from "../links.js";
import { parseVerseKey } from "./corpus.js";

import { distributionBySura, collocations, directNeighbors, mergeCollocations } from "../../src/analytics/stats.js";
import { verseProfile, similarVerses } from "../../src/analytics/verse.js";
import { surahProfile, surahKeyness, surahCohesion, surahBonds, sharedRoots } from "../../src/analytics/surah.js";
import { suraRhymeScheme, rhymeKey, rawiyKey, rhymeMates, finalProsody, classifyFawasil } from "../../src/analytics/rhyme.js";
import { surahLetterProfile, muqattaatOf } from "../../src/analytics/letters.js";
import { divineNames } from "../../src/analytics/names.js";
import { hapaxRoots } from "../../src/analytics/corpus.js";
import { findSharedPhrases } from "../../src/analytics/phrases.js";
import { derivationFamily } from "../../src/analytics/derivation.js";
import { relationsOf, verseAntithesis, oppositesCatalogue } from "../../src/analytics/relations.js";
import { expressionsForRoot } from "../../src/analytics/expressions.js";
import { valencyProfile } from "../../src/analytics/valency.js";
import { roleBreakdown, ROLE_AR } from "../../src/analytics/role.js";
import { suraIltifat } from "../../src/analytics/iltifat.js";
import { pairingMatrix } from "../../src/analytics/pairing.js";
import { rhetoricScan } from "../../src/analytics/rhetoric.js";
import { wordGroupKey } from "../../src/arabic-utils.js";
import { frameOccIndex, headOccurrences, availableFacets, runConstruction } from "../../src/analytics/construction.js";
import { EMPTY_MORPH_FILTER } from "../../src/morphology.js";
import { rasmVariants, rasmProfile, rasmOrthography, orthoProfile } from "../../src/analytics/rasm.js";
import { P, PP, PAGED } from "../params.js";

export function register(router, ctx) {
  const { corpus: C } = ctx;

  const term = (V, query, param = "term") => {
    const mode = qEnum(query, "mode", MODES, "exact");
    return resolveTerm(V, C, query.get(param) ?? query.get("q"), mode);
  };

  /* ── distribution across the 114 sūrahs ── */
  router.add("/analysis/distribution", ({ V, query }) => {
    const t = term(V, query);
    const anchor = (V.indices[t.mode][t.key] || [])[0];
    const rows = distributionBySura(t.key, V.indices[t.mode], V.verseData, V.surahList, t.mode);
    const nonZero = qBool(query, "include_empty", false) ? rows : rows.filter((r) => r.count > 0);
    return {
      data: {
        term: termShape(V, t, { anchor }),
        distribution: nonZero.map((r) => ({
          surah: r.sura, name: r.name, occurrences: r.count,
          links: { ui: surahLinks(r.sura, `${r.sura}:1`).ui },
        })),
      },
      links: termLinks(t, anchor),
    };
  }, {
    summary: "How a term spreads across the sūrahs.",
    description: "True TOKEN frequency, not verse frequency: an āya using the term twice counts "
      + "twice. Sūrahs where it never occurs are dropped unless you ask for them.",
    tags: ["analysis"],
    params: [P.q, P.mode, P.precision, P.includeEmpty],
    response: "DistributionResponse",
    examples: [
      { label: "ع-ل-م across the muṣḥaf", path: "/analysis/distribution?q=علم&mode=root" },
      { label: "Including the silent sūrahs", path: "/analysis/distribution?q=نور&mode=root&include_empty=true" },
    ],
  });

  /* ── within-verse collocation (PMI + signed log-likelihood) ── */
  router.add("/analysis/collocations", ({ V, query, url }) => {
    const t = term(V, query);
    const anchor = (V.indices[t.mode][t.key] || [])[0];
    const window = qInt(query, "window", { min: 1, max: 99, def: 99 });
    const sort = qEnum(query, "sort", ["count", "pmi", "ll", "logdice"], "count");
    const rows = collocations(t.key, t.mode, V.indices[t.mode], V.verseData, V.stopSet, window, { sort });
    const p = page(rows, paging(query), url);
    return {
      data: {
        term: termShape(V, t, { anchor }),
        window: window >= 99 ? "whole-verse" : window,
        collocates: p.items.map((c) => ({
          key: c.key, label: c.label, count: c.count,
          pmi: round(c.pmi), log_likelihood: round(c.ll), log_dice: round(c.logdice), significance: c.sig,
          links: termLinks({ key: c.key, label: c.label, mode: t.mode }, (V.indices[t.mode][c.key] || [])[0], true),
        })),
      },
      meta: p.meta,
      links: { ...termLinks(t, anchor), ...p.links },
    };
  }, {
    summary: "What a term keeps company with, inside the same āya.",
    description: "Co-occurrence ranked by association rather than raw count, so a frequent but "
      + "uninformative neighbour cannot drown a rare, telling one. PMI favours tight rare pairings; "
      + "signed log-likelihood (`ll`) is the usual significance measure; `logdice` is scale-independent. "
      + "Function words are filtered out — for the immediate grammatical neighbour use /analysis/neighbours.",
    tags: ["analysis"],
    params: [P.q, P.mode, P.precision, P.window, P.collocSort, ...PAGED],
    response: "CollocationsResponse",
    examples: [
      { label: "Strongest associations with ع-ل-م", path: "/analysis/collocations?q=علم&mode=root&sort=ll&limit=20" },
      { label: "Within 3 words either side", path: "/analysis/collocations?q=نور&mode=root&window=3&limit=20" },
    ],
  });

  /* ── immediate left/right neighbours (corpus-wide adjacency) ── */
  router.add("/analysis/neighbours", ({ V, query, url }) => {
    const t = term(V, query);
    const anchor = (V.indices[t.mode][t.key] || [])[0];
    const rows = directNeighbors(t.key, t.mode, V.indices[t.mode], V.verseData, { crossVerse: qBool(query, "cross_verse", false) });
    const p = page(rows, paging(query), url);
    return {
      data: {
        term: termShape(V, t, { anchor }),
        neighbours: p.items.map((n) => ({
          key: n.key, label: n.label, before: n.before, after: n.after, total: n.total,
          links: termLinks({ key: n.key, label: n.label, mode: t.mode }, (V.indices[t.mode][n.key] || [])[0], true),
        })),
      },
      meta: p.meta, links: { ...termLinks(t, anchor), ...p.links },
    };
  }, {
    summary: "The words immediately before and after a term, corpus-wide.",
    description: "True positional adjacency (bigrams), unlike collocations' whole-āya window. "
      + "Particles are KEPT here — the preposition beside a verb is precisely the signal. "
      + "`cross_verse` lets adjacency continue past the āya boundary within a sūrah.",
    tags: ["analysis"],
    params: [P.q, P.mode, P.precision, P.crossVerse, ...PAGED],
    response: "NeighboursResponse",
    examples: [
      { label: "What sits beside ع-ل-م", path: "/analysis/neighbours?q=علم&mode=root&limit=20" },
      { label: "Across the āya boundary", path: "/analysis/neighbours?q=رب&mode=root&cross_verse=true&limit=20" },
    ],
  });

  /* ── two-term compare ── */
  router.add("/analysis/compare", ({ V, query }) => {
    const modeA = qEnum(query, "mode_a", MODES, qEnum(query, "mode", MODES, "exact"));
    const modeB = qEnum(query, "mode_b", MODES, modeA);
    const A = resolveTerm(V, C, query.get("a"), modeA);
    const B = resolveTerm(V, C, query.get("b"), modeB);
    const keysA = V.indices[modeA][A.key] || [], keysB = V.indices[modeB][B.key] || [];
    const setB = new Set(keysB);
    const shared = keysA.filter((vk) => setB.has(vk));
    const colA = collocations(A.key, modeA, V.indices[modeA], V.verseData, V.stopSet, 99, {});
    const colB = collocations(B.key, modeB, V.indices[modeB], V.verseData, V.stopSet, 99, {});
    const merged = mergeCollocations(colA.slice(0, 200), colB.slice(0, 200));
    const anchor = shared[0] || keysA[0] || keysB[0];
    return {
      data: {
        a: termShape(V, A, { anchor: keysA[0] }),
        b: termShape(V, B, { anchor: keysB[0] }),
        shared_verses: shared.map((vk) => ({ verse_key: vk, links: verseLinks(vk, "exact", true) })),
        collocates: {
          shared: merged.shared.slice(0, 50).map((s) => ({ key: s.key, label: s.label, a: s.a.count, b: s.b.count })),
          only_a: merged.onlyA.slice(0, 50).map((c) => ({ key: c.key, label: c.label, count: c.count })),
          only_b: merged.onlyB.slice(0, 50).map((c) => ({ key: c.key, label: c.label, count: c.count })),
        },
      },
      links: { ui: compareLink(A, B, anchor), ui_compare: compareLink(A, B, anchor) },
    };
  }, {
    summary: "Two terms side by side.",
    description: "The āyāt they share, and how their company differs — neighbours both attract, "
      + "versus those distinctive to each. The pair may be compared in different modes "
      + "(`mode_a`/`mode_b`), e.g. one root against one exact form.",
    tags: ["analysis"],
    params: [P.a, P.b, P.mode, P.modeA, P.modeB, P.precision],
    response: "CompareResponse",
    examples: [
      { label: "علم against جهل", path: "/analysis/compare?a=علم&b=جهل&mode=root" },
      { label: "نور against ظلم", path: "/analysis/compare?a=نور&b=ظلم&mode=root" },
    ],
  });

  /* ── one āya, analysed ── */
  router.add("/analysis/verse/:key", ({ V, params, query }) => {
    const vk = parseVerseKey(params.key, C.surahIndex);
    const v = V.verseData[vk];
    if (!v) throw notFound(`No āya ${vk}.`);
    const profile = verseProfile(vk, V.verseData, V.r2v, C.morph);
    const similar = similarVerses(vk, V.verseData, V.r2v, { topN: qInt(query, "similar", { min: 0, max: 100, def: 10 }) });
    const phrases = findSharedPhrases(vk, V.verseData, V.seedIndex(), { minLen: qInt(query, "phrase_min", { min: 2, max: 12, def: 3 }) });
    return {
      data: {
        verse: verseShape(V, C, vk, { words: qBool(query, "words", true) }),
        profile: {
          words: profile.wordCount, letters: profile.letterCount, roots: profile.rootCount,
          parts_of_speech: profile.posBreakdown, verb_forms: profile.forms,
          rhyme: { key: profile.rhyme, rawiy: rawiyKey(v.text), prosody: finalProsody(v.text) },
          unique_roots: profile.uniqueRoots,
          rarest_roots: profile.rarestRoots.map((r) => ({ root: r.root, verses: r.freq, links: termLinks({ key: r.root, label: r.root, mode: "root" }, (V.r2v[r.root] || [])[0], true) })),
        },
        rhetoric: verseRhetoric(V, C, vk),
        antithesis: verseAntithesis(vk, C.relations),
        similar_verses: similar.map((s) => ({
          verse_key: s.vk, score: round(s.score), shared_roots: s.shared, text: V.verseData[s.vk]?.text,
          links: verseLinks(s.vk, "exact", true),
        })),
        shared_phrases: phrases.slice(0, 40).map((p) => ({
          phrase: p.tokens.join(" "), length: p.len,
          verses: p.verses.map((x) => ({ verse_key: x, links: verseLinks(x, "exact", true) })),
        })),
        near_identical: nearIdentical(C, vk),
      },
      links: verseLinks(vk),
    };
  }, {
    summary: "One āya, analysed from every angle.",
    description: "Structural profile (words, letters, roots, parts of speech), rhyme key and prosody, "
      + "oath and conditional frames, curated antithesis attested here, the most lexically similar "
      + "āyāt by idf-weighted shared-root cosine, the word runs it shares with other āyāt, and any "
      + "near-identical twins (المتشابهات).",
    tags: ["analysis"],
    params: [PP.verseKey, P.words, P.similar, P.phraseMin],
    response: "VerseAnalysisResponse",
    examples: [
      { label: "Āyat al-Kursī", path: "/analysis/verse/2:255" },
      { label: "The basmala", path: "/analysis/verse/1:1" },
    ],
  });

  /* ── one sūra, analysed ── */
  router.add("/analysis/surah/:id", ({ V, params, query }) => {
    const id = resolveSurahId(C, params.id);
    const profile = surahProfile(id, V.verseData);
    const keyness = surahKeyness(id, V.verseData, V.r2v, { minVerses: qInt(query, "min_verses", { min: 1, max: 50, def: 2 }) });
    const cohesion = surahCohesion(id, V.verseData, V.r2v);
    const rhyme = suraRhymeScheme(id, V.verseData);
    const letters = surahLetterProfile(id, V.verseData);
    const anchor = `${id}:1`;
    return {
      data: {
        surah: { id, name: V.surahList.find((s) => s.id === id)?.name, verses: profile?.total ?? V.surahList.find((s) => s.id === id)?.count },
        profile,
        muqattaat: muqattaatOf(id),
        letters: { total: letters.total, opening: letters.opening, muqattaat: letters.muqattaat, top: letters.top },
        keyness: keyness.slice(0, qInt(query, "keyness", { min: 1, max: 200, def: 30 })).map((k) => ({
          root: k.root, in_surah: k.inSura, corpus: k.total, keyness: round(k.keyness),
          links: termLinks({ key: k.root, label: k.root, mode: "root" }, (V.r2v[k.root] || [])[0], true),
        })),
        cohesion: { mean: round(cohesion.mean), sequence: cohesion.seq.map((s) => ({ from: s.a, to: s.b, score: round(s.score), shared_roots: s.shared })) },
        rhyme: {
          dominant: rhyme.dominant, dominant_rawiy: rhyme.dominantRawiy,
          scheme: rhyme.scheme, rawiy_scheme: rhyme.rawiyScheme,
          fawasil: classifyFawasil(id, V.verseData),
        },
        iltifat: C.morph ? suraIltifat(id, V.verseData, C.morph) : null,
        munasabat: C.munasabat?.bySura?.[id] ?? null,
      },
      links: surahLinks(id, anchor),
    };
  }, {
    summary: "One sūrah, analysed from every angle.",
    description: "Its profile and refrains; the roots over-represented in it versus the whole Qurʾān "
      + "(keyness, by signed log-likelihood); adjacent-āya cohesion, whose dips mark topic shifts; "
      + "the rhyme scheme and fawāṣil classification; the letter profile against the disjoined-letter "
      + "opening; the iltifāt contour; and its coherence with the neighbouring sūrahs.",
    tags: ["analysis"],
    params: [PP.surahId, P.keyness, P.minVerses],
    response: "SurahAnalysisResponse",
    examples: [
      { label: "Al-Ikhlāṣ — short and sharp", path: "/analysis/surah/112" },
      { label: "Yā-Sīn by name", path: "/analysis/surah/yasin" },
      { label: "Yā-Sīn", path: "/analysis/surah/36" },
    ],
  });

  /* ── rhyme ── */
  router.add("/analysis/rhyme/:key", ({ V, params, query, url }) => {
    const vk = parseVerseKey(params.key, C.surahIndex);
    const v = V.verseData[vk];
    if (!v) throw notFound(`No āya ${vk}.`);
    const by = qEnum(query, "by", ["key", "rawiy"], "key");
    const k = by === "rawiy" ? rawiyKey(v.text) : rhymeKey(v.text);
    const mates = rhymeMates(k, V.verseData, vk, { by });
    const p = page(mates, paging(query), url);
    return {
      data: {
        verse: verseShape(V, C, vk),
        rhyme: { key: rhymeKey(v.text), rawiy: rawiyKey(v.text), prosody: finalProsody(v.text), matched_on: by },
        mates: p.items.map((x) => ({ verse_key: x, text: V.verseData[x].text, links: verseLinks(x, "exact", true) })),
      },
      meta: p.meta,
      links: { ...verseLinks(vk), ...p.links },
    };
  }, {
    summary: "Every āya sharing this one's rhyme ending.",
    description: "`by=key` matches the strict ending (ridf + rawiy); `by=rawiy` matches the rhyme "
      + "consonant alone — the classical primary criterion, and a much wider net.",
    tags: ["analysis"],
    params: [PP.verseKey, P.rhymeBy, ...PAGED],
    response: "Envelope",
    examples: [
      { label: "Rhyme-mates of 112:1", path: "/analysis/rhyme/112:1?limit=20" },
      { label: "By rawiy alone", path: "/analysis/rhyme/93:1?by=rawiy&limit=20" },
    ],
  });

  /* ── derivation / valency / role, per root ── */
  router.add("/analysis/derivation/:root", ({ V, params, query }) => {
    const t = resolveTerm(V, C, params.root, "root");
    const fam = derivationFamily(t.key, V.r2v, V.verseData, C.morph);
    // A frequent root has hundreds of derivatives × hundreds of āyāt each; sample the
    // verses per lemma and let the caller raise it (or follow ui_occurrences for all).
    const cap = qInt(query, "verses", { min: 0, max: 500, def: 10 });
    return {
      data: {
        term: termShape(V, t),
        family: fam.map((d) => ({
          lemma: d.lemma, pos: d.pos, form: d.vf || undefined, voice: d.voice || undefined, aspect: d.aspect || undefined,
          occurrences: d.count, examples: d.examples,
          verse_count: d.verses.length,
          verses: d.verses.slice(0, cap).map((vk) => ({ verse_key: vk, links: verseLinks(vk, "root", true) })),
          links: termLinks({ key: d.key, label: d.lemma, mode: "lemma" }, d.verses?.[0], true),
        })),
      },
      links: termLinks(t, (V.r2v[t.key] || [])[0]),
    };
  }, {
    summary: "The derivational family of a root.",
    description: "Every lemma built on it, ordered by part-of-speech class then Form then frequency, "
      + "each with its distinct spellings and the āyāt it occurs in.",
    tags: ["analysis"],
    params: [PP.root, P.derivVerses],
    response: "Envelope",
    examples: [
      { label: "Everything built on ع-ل-م", path: "/analysis/derivation/علم" },
      { label: "…and on ك-ت-ب", path: "/analysis/derivation/كتب" },
    ],
  });

  router.add("/analysis/valency/:root", ({ V, params }) => {
    const t = resolveTerm(V, C, params.root, "root");
    if (!C.expressions) throw notFound("Valency reads the expressions dataset, which this deployment did not load.");
    const view = C.expressions && C.expressionIndex ? expressionsForRoot(C.expressions, C.expressionIndex, t.key) : null;
    return { data: { term: termShape(V, t), valency: valencyProfile(view) }, links: termLinks(t, (V.r2v[t.key] || [])[0]) };
  }, {
    summary: "A root's argument structure.",
    description: "How a verb root reaches its complement: which prepositions it governs (تعدية بحرف) "
      + "and which nouns it takes directly. The reading — transitive versus preposition-governing — "
      + "is yours; this is the evidence.",
    tags: ["analysis"],
    params: [PP.root],
    response: "Envelope",
    examples: [{ label: "How أ-م-ن takes its complement", path: "/analysis/valency/أمن" }],
  });

  router.add("/analysis/roles/:root", ({ V, params }) => {
    const t = resolveTerm(V, C, params.root, "root");
    if (!C.morph) throw notFound("Syntactic roles need the morphology data, which this deployment did not load.");
    const keys = V.r2v[t.key] || [];
    const positionsOf = (vk) => hitIndices(V.verseData[vk], t.key, "root");
    const br = roleBreakdown(C.morph, V.verseData, keys, positionsOf);
    return {
      data: {
        term: termShape(V, t),
        total: br.total,
        roles: br.roles.map((r) => ({
          role: r.role, label_ar: ROLE_AR[r.role] || r.role, count: r.count, share: round(r.share),
          examples: r.examples.map((e) => ({ verse_key: e.vk, word_index: e.i, links: verseLinks(e.vk, "root", true) })),
        })),
      },
      links: termLinks(t, keys[0]),
    };
  }, {
    summary: "What syntactic role a root's occurrences play.",
    description: "Each occurrence classified as subject, object, muḍāf ilayh, governed by a "
      + "preposition and so on, with a confidence marker (case and adjacency agreeing, versus "
      + "inferred from adjacency alone) and example positions.",
    tags: ["analysis"],
    params: [PP.root],
    response: "Envelope",
    examples: [{ label: "ع-ل-م by role", path: "/analysis/roles/علم" }],
  });

  /* ── construction query (الاستعلام التركيبي) ──
   *
   * The one move a form-based concordance cannot make: pin a root to ONE exact construction
   * and read just those tokens. أشرك (Form IV) + بـ, held apart from أشرك مع, from the nominal
   * شركاء, and from the passive أن يُشرَك بـ.
   *
   * `facets` comes back on every response whether or not anything was pinned, because the
   * caller cannot know what is available to pin until it has looked: which Forms this root
   * actually appears in, which particles it actually governs, whether a bare (un-governed)
   * residual exists at all. Ask with no filter first, then narrow. */
  router.add("/analysis/construction/:root", ({ V, params, query, url }) => {
    if (!C.morph) throw notFound("The construction query needs the morphology data, which this deployment did not load.");
    const mode = qEnum(query, "mode", MODES, "root");
    const t = resolveTerm(V, C, params.root, mode);
    const keys = V.indices[mode][t.key] || [];
    const frameIdx = C.expressions ? frameOccIndex(C.expressions) : new Map();
    const heads = headOccurrences(t.key, mode, keys, V.verseData, C.morph);

    const list = (name) => (query.get(name) || "").split(",").map((s) => s.trim()).filter(Boolean);
    const headFilter = {
      ...EMPTY_MORPH_FILTER,
      form: list("form").map(Number).filter(Number.isInteger),
      voice: list("voice"),
      pos: list("pos"),
      aspect: list("aspect"),
    };
    const particles = list("particle");
    const particleMode = qEnum(query, "particle_mode", ["present", "absent", "any"], particles.length ? "present" : "any");
    const prep = particles.length || particleMode !== "any"
      ? { set: particles, mode: particleMode, source: qEnum(query, "particle_source", ["frame", "standalone", "any"], "any") }
      : null;
    const definite = query.get("definite");
    const spec = {
      headFilter,
      prep,
      object: definite ? { definite: /^(1|true|yes|on)$/i.test(definite) } : null,
      span: qInt(query, "span", { min: 1, max: 12, def: 4 }),
    };

    const res = runConstruction({ lookup: t.key, mode, keys, verseData: V.verseData, M: C.morph, frameIdx, spec });
    const p = page(res.occ, paging(query), url);
    const anchor = res.occ[0]?.vk || keys[0];
    return {
      data: {
        term: termShape(V, t, { anchor }),
        facets: availableFacets(heads, frameIdx),
        head_occurrences: heads.length,
        matched: res.total,
        // `bareCount` and `byPrep` are only computed when a particle facet was actually
        // requested — with none, the scan never looks for a particle and would report every
        // occurrence as "bare", which is false. Omit them rather than answer 168 out of 168;
        // `facets.preps` and `facets.hasBare` already give the unfiltered picture.
        ...(prep
          ? {
            bare: res.bareCount,
            by_preposition: [...res.byPrep.entries()]
              .map(([preposition, count]) => ({ preposition, count }))
              .sort((a, b) => b.count - a.count),
          }
          : { note: "No particle facet was requested, so governed-vs-bare was not evaluated — see `facets.preps` and `facets.hasBare` for what this head governs." }),
        occurrences: p.items.map((o) => ({
          verse_key: o.vk, head: o.head, head_index: o.headIdx,
          form: o.vf || undefined, voice: o.voice || undefined,
          preposition: o.prep || undefined, preposition_index: o.prepIdx ?? undefined,
          object_index: o.objIdx ?? undefined, object_definite: o.definite ?? undefined,
          before: o.before, after: o.after,
          text: V.verseData[o.vk]?.text,
          links: verseLinks(o.vk, mode, true),
        })),
      },
      meta: p.meta,
      links: {
        ...termLinks(t, anchor),
        ui: anchor ? viewLink({ t: "constr", r: t.key, l: t.label }, anchor, mode) : undefined,
        ...p.links,
      },
    };
  }, {
    summary: "Pin a root to one exact construction and read just those tokens.",
    description: "Crosses four facets on every head occurrence: head morphology (Form, voice, part of "
      + "speech), the particle it governs (authoritatively, from the mined frames — or a standalone scan), "
      + "the definiteness of its object, and presence versus ABSENCE of the construction. "
      + "`facets` reports what this root actually offers before you pin anything. Definiteness and the "
      + "standalone-particle scan are heuristics — the record carries the evidence, the reading is yours.",
    tags: ["analysis"],
    params: [PP.root, P.mode, P.constrForm, P.constrVoice, P.constrPos, P.constrAspect,
      P.constrParticle, P.constrParticleMode, P.constrParticleSource, P.constrDefinite, P.constrSpan, ...PAGED],
    response: "Envelope",
    examples: [
      { label: "Everything ش-ر-ك offers", path: "/analysis/construction/شرك" },
      { label: "أشرك (Form IV) governing بـ", path: "/analysis/construction/شرك?form=4&particle=ب" },
      { label: "…and the bare residual instead", path: "/analysis/construction/شرك?form=4&particle_mode=absent" },
      { label: "آمن with an indefinite object", path: "/analysis/construction/أمن?definite=false" },
    ],
  });

  /* ── rasm: orthographic variation (الرسم) ──
   *
   * The Uthmanic muṣḥaf draws one spoken word more than one way — إِبْرَٰهِۦمَ beside إِبْرَٰهِيمَ,
   * كتب beside كتاب. `/analysis/rasm` is the catalogue; `/analysis/rasm/{id}` the deep dive.
   *
   * The catalogue drops each row's occurrence list: كتب alone carries 226 of them, and a
   * caller browsing the catalogue wants the counts. Follow an `id` for the positions. */
  router.add("/analysis/rasm", ({ V, query, url }) => {
    const kind = qEnum(query, "kind", ["variants", "orthography"], "variants");
    if (kind === "orthography") {
      const o = rasmOrthography(V.verseData);
      const p = page(o.forms || [], paging(query), url);
      return {
        data: {
          kind,
          total: o.total,
          // byCategory nests the whole form list, occurrence positions included — a third of
          // a megabyte for a two-row page. The counts are what a summary is for; the forms
          // are already the paged list below.
          by_category: (o.byCategory || []).map((c) => ({ category: c.key, forms: (c.forms || []).length, occurrences: c.count })),
          forms: p.items.map((f) => ({
            id: f.id, rasm: f.rasm, drawn: f.drawn, plene: f.plene, category: f.category,
            occurrences: f.count, surahs: f.suraCount,
            links: { self: `${ctx.base}/analysis/rasm/${encodeURIComponent(f.id)}` },
          })),
        },
        meta: p.meta, links: p.links,
      };
    }
    const rows = rasmVariants(V.verseData);
    const p = page(rows, paging(query), url);
    return {
      data: {
        kind,
        variants: p.items.map((r) => ({
          id: r.id, pronounced: r.pron, lemma: r.lemma, display: r.display,
          occurrences: r.total, surahs: r.suraCount,
          spellings: (r.forms || []).map((f) => ({
            rasm: f.rasm, display: f.display, occurrences: f.count, verses: f.verses, first: f.first, last: f.last,
          })),
          links: { self: `${ctx.base}/analysis/rasm/${encodeURIComponent(r.id)}` },
        })),
      },
      meta: p.meta, links: p.links,
    };
  }, {
    summary: "Words the muṣḥaf draws more than one way (الرسم).",
    description: "`kind=variants` (default) catalogues the words with two or more drawn skeletons for "
      + "one spoken word — detected by bucketing tokens on pronunciation AND lemma, so homographs "
      + "don't masquerade as one word's two spellings. `kind=orthography` catalogues the systematic "
      + "conventions instead (the dagger alif, the wāw seat). Occurrence positions come from "
      + "`/analysis/rasm/{id}`.",
    tags: ["analysis"],
    params: [P.rasmKind, ...PAGED],
    response: "Envelope",
    examples: [
      { label: "Words drawn two ways", path: "/analysis/rasm?limit=20" },
      { label: "Orthographic conventions", path: "/analysis/rasm?kind=orthography&limit=20" },
    ],
  });

  router.add("/analysis/rasm/:id", ({ V, params, query }) => {
    // An `o|…` id is an orthography entry, anything else a variant word — the same split the
    // Rasm Lab makes when a row is opened. The two profiles are genuinely different objects,
    // not one shape with optional fields, so they are answered separately rather than merged
    // into a union where half the keys are always null.
    const id = params.id;
    const isOrtho = id.startsWith("o|");
    const prof = isOrtho ? orthoProfile(V.verseData, id) : rasmProfile(V.verseData, id);
    if (!prof) {
      throw notFound(`No rasm entry "${id}".`,
        "Take an `id` from /analysis/rasm — e.g. `سيماهم|سِيما` for a variant word, or `o|كتب` for an orthographic convention.");
    }
    const cap = qInt(query, "verses", { min: 0, max: 500, def: 20 });
    // `verseList` groups by āya ({vk, idx:[…]}); `occ` is one row per token ({vk, wi}).
    const source = prof.verseList || prof.occ || [];
    const verses = source.slice(0, cap).map((o) => ({
      verse_key: o.vk,
      word_indices: o.idx || (o.wi != null ? [o.wi] : undefined),
      text: V.verseData[o.vk]?.text,
      links: verseLinks(o.vk, "exact", true),
    }));
    const common = {
      id: prof.id, surahs: prof.suraCount, by_surah: prof.bySura, verses,
      verses_total: source.length,
    };
    return {
      data: isOrtho
        ? {
          kind: "orthography", ...common,
          rasm: prof.rasm, drawn: prof.drawn, plene: prof.plene, category: prof.category,
          occurrences: prof.count,
        }
        : {
          kind: "variant", ...common,
          pronounced: prof.pron, lemma: prof.lemma, display: prof.display,
          occurrences: prof.total,
          spellings: prof.forms,
          timeline: prof.timeline,
          longest_run: prof.longestRun,
          switch_points: prof.switches,
        },
      links: { ui: rasmLink(id, source[0]?.vk) },
    };
  }, {
    summary: "One rasm entry: every spelling, where each is used, and where the text switches.",
    description: "Per-spelling counts and ratio, the by-sūrah distribution, the muṣḥaf-order timeline, "
      + "the longest unbroken run of one spelling, and the switch-points where the text moves from one "
      + "to the other.",
    tags: ["analysis"],
    params: [PP.rasmId, P.rasmVerses],
    response: "Envelope",
    examples: [
      { label: "سيماهم — drawn three ways", path: "/analysis/rasm/سيماهم|سِيما" },
      { label: "The dagger alif in كتب", path: "/analysis/rasm/o|كتب" },
    ],
  });

  /* ── semantic neighbours + curated opposites ── */
  router.add("/analysis/semantic/:root", ({ V, params }) => {
    const t = resolveTerm(V, C, params.root, "root");
    const rows = C.semantic[t.key] || [];
    return {
      data: {
        term: termShape(V, t),
        neighbours: rows.map(([other, score, kind]) => ({
          root: other, similarity: score, relation: kind,
          links: termLinks({ key: other, label: other, mode: "root" }, (V.r2v[other] || [])[0], true),
        })),
      },
      links: termLinks(t, (V.r2v[t.key] || [])[0]),
    };
  }, {
    summary: "Distributional neighbours of a root — meaning by shared context.",
    description: "Roots that behave like this one in the text, computed offline from co-occurrence. "
      + "`syntagmatic` = tends to occur WITH it; `paradigmatic` = tends to occur INSTEAD of it, which "
      + "is the closer thing to a synonym.",
    tags: ["analysis"],
    params: [PP.root],
    response: "Envelope",
    examples: [{ label: "Neighbours of ع-ل-م", path: "/analysis/semantic/علم" }],
  });

  router.add("/analysis/relations", ({ query, url }) => {
    const list = oppositesCatalogue(C.relations, { framedOnly: qBool(query, "framed", false) });
    const p = page(list, paging(query), url);
    return { data: p.items, meta: p.meta, links: p.links };
  }, {
    summary: "The curated antithesis (طباق) catalogue.",
    description: "Human-curated opposite pairs. `framed=true` keeps only those with an attested "
      + "antithesis construction in the text, rather than mere co-occurrence.",
    tags: ["analysis"],
    params: [P.framed, ...PAGED],
    response: "Envelope",
    examples: [
      { label: "The whole catalogue", path: "/analysis/relations?limit=50" },
      { label: "Only the framed pairs", path: "/analysis/relations?framed=true&limit=50" },
    ],
  });

  router.add("/analysis/relations/:root", ({ V, params }) => {
    const t = resolveTerm(V, C, params.root, "root");
    return {
      data: {
        term: termShape(V, t),
        relations: relationsOf(t.key, C.relations).map((r) => ({
          root: r.other, polarity: r.polarity, relatedness: r.relatedness, contrast: r.contrast,
          verses: (r.verses || []).map((vk) => ({ verse_key: vk, links: verseLinks(vk, "root", true) })),
          links: termLinks({ key: r.other, label: r.other, mode: "root" }, (V.r2v[r.other] || [])[0], true),
        })),
      },
      links: termLinks(t, (V.r2v[t.key] || [])[0]),
    };
  }, {
    summary: "A root's opposites.",
    description: "Curated, authoritative opposites first, then frame-discovered candidates kept "
      + "separate for review. Every pair carries the āyāt attesting it.",
    tags: ["analysis"],
    params: [PP.root],
    response: "Envelope",
    examples: [{ label: "The opposites of ن-و-ر", path: "/analysis/relations/نور" }],
  });

  /* ── pairing matrix (co-occurrence grid) ── */
  router.add("/analysis/pairing", ({ V, query }) => {
    const mode = qEnum(query, "mode", MODES, "root");
    const parse = (name) => (query.get(name) || "").split(",").map((s) => s.trim()).filter(Boolean)
      .map((s) => { const t = resolveTerm(V, C, s, mode); return { key: t.key, label: t.label, mode, keys: V.indices[mode][t.key] || [] }; });
    const rows = parse("rows"), cols = parse("cols");
    if (!rows.length || !cols.length) throw badRequest(`"rows" and "cols" are both required`, "e.g. ?rows=علم,جهل&cols=نور,ظلم&mode=root");
    const matrix = pairingMatrix(rows, cols);
    const anchor = rows[0]?.keys?.[0];
    return {
      data: {
        rows: rows.map((r) => ({ key: r.key, label: r.label, verses: r.keys.length })),
        cols: cols.map((c) => ({ key: c.key, label: c.label, verses: c.keys.length })),
        matrix,
      },
      links: { ui: pairingLink(rows, cols, anchor), ui_pairing: pairingLink(rows, cols, anchor) },
    };
  }, {
    summary: "A co-occurrence grid for two lists of terms.",
    description: "Rows × columns, each cell counting the āyāt containing both. The empty cells are "
      + "the point: a pairing the text never makes is a finding, and a grid makes it visible in a "
      + "way a ranked list cannot.",
    tags: ["analysis"],
    params: [P.rows, P.cols, P.modeRootDefault, P.precision],
    response: "PairingResponse",
    examples: [
      { label: "علم·جهل × نور·ظلم", path: "/analysis/pairing?rows=علم,جهل&cols=نور,ظلم&mode=root" },
    ],
  });

  /* ── corpus-wide catalogues ── */
  router.add("/analysis/names", ({ V }) => ({
    data: divineNames(V.r2v, V.w2v, (name) => wordGroupKey({ norm: name, exact: name }, "exact")).map((n) => ({
      name: n.name, root: n.root, root_family_verses: n.familyCount, exact_form_verses: n.formCount,
      links: n.root ? termLinks({ key: n.root, label: n.root, mode: "root" }, (V.r2v[n.root] || [])[0], true) : {},
    })),
  }), {
    summary: "The 99 names, each with its root's corpus footprint.",
    description: "Two counts per name: how many āyāt carry the whole root family, and how many carry "
      + "that exact form. They diverge sharply where the definite form is rare.",
    tags: ["analysis"],
    response: "Envelope",
    examples: [{ label: "All 99", path: "/analysis/names" }],
  });

  router.add("/analysis/hapax", ({ V, query, url }) => {
    const list = hapaxRoots(V.verseData);
    const p = page(list, paging(query), url);
    return {
      data: p.items.map((h) => ({ root: h.root, verse_key: h.vk, links: { ...termLinks({ key: h.root, label: h.root, mode: "root" }, h.vk, true), ...verseLinks(h.vk, "root", true) } })),
      meta: p.meta, links: p.links,
    };
  }, {
    summary: "The hapax legomena — roots occurring exactly once.",
    tags: ["analysis"],
    params: [...PAGED],
    response: "Envelope",
    examples: [{ label: "In muṣḥaf order", path: "/analysis/hapax?limit=50" }],
  });

  router.add("/analysis/mutashabihat", ({ V, query, url }) => {
    if (!C.mutashabihat) throw notFound("The mutashābihāt dataset was not built for this deployment.");
    const verse = query.get("verse");
    if (verse) {
      const vk = parseVerseKey(verse, C.surahIndex);
      const ids = C.mutashabihat.byVerse?.[vk] || [];
      const pairs = ids.map((i) => C.mutashabihat.pairs[i]).filter(Boolean);
      return { data: { verse: verseShape(V, C, vk), pairs: pairs.map((p) => shapePair(V, p)) }, links: verseLinks(vk) };
    }
    const p = page(C.mutashabihat.pairs || [], paging(query), url);
    return { data: p.items.map((x) => shapePair(V, x)), meta: p.meta, links: p.links };
  }, {
    summary: "Near-identical āyāt (المتشابهات).",
    description: "Pairs differing by at most two words — the passages readers most often confuse. "
      + "Pass `verse` for a single āya's twins.",
    tags: ["analysis"],
    params: [P.verseParam, ...PAGED],
    response: "Envelope",
    examples: [
      { label: "The whole set", path: "/analysis/mutashabihat?limit=20" },
      { label: "Twins of 2:255", path: "/analysis/mutashabihat?verse=2:255" },
    ],
  });

  router.add("/analysis/munasabat", ({ query, url }) => {
    if (!C.munasabat) throw notFound("The munāsabāt dataset was not built for this deployment.");
    const surah = query.get("surah");
    if (surah) {
      const id = resolveSurahId(C, surah);
      return { data: C.munasabat.bySura?.[id] ?? null, links: surahLinks(id) };
    }
    const p = page(C.munasabat.pairs || [], paging(query), url);
    return { data: p.items, meta: p.meta, links: p.links };
  }, {
    summary: "Coherence between consecutive sūrahs (المناسبات).",
    description: "Distinctive roots shared across each sūrah boundary, plus the roots that close one "
      + "and open the next — the seam evidence.",
    tags: ["analysis"],
    params: [P.surahParam, ...PAGED],
    response: "Envelope",
    examples: [
      { label: "Every seam", path: "/analysis/munasabat?limit=20" },
      { label: "Around Al-Baqara", path: "/analysis/munasabat?surah=2" },
    ],
  });

  router.add("/analysis/iltifat/:surah", ({ V, params }) => {
    const id = resolveSurahId(C, params.surah);
    const pre = C.iltifat?.bySura?.[id];
    const data = pre || (C.morph ? suraIltifat(id, V.verseData, C.morph) : null);
    if (!data) throw notFound("Iltifāt needs either the prebuilt dataset or the morphology data.");
    return { data, links: surahLinks(id) };
  }, {
    summary: "Grammatical register shifts (الالتفات) across a sūrah.",
    description: "The person / number / gender / tense / voice contour āya by āya, and every turn "
      + "between consecutive āyāt — a change of person being the headline one.",
    tags: ["analysis"],
    params: [PP.surahNum],
    response: "Envelope",
    examples: [{ label: "Al-Fātiḥa's turn to the second person", path: "/analysis/iltifat/1" }],
  });

  router.add("/analysis/bonds/:surah", ({ V, params, query, url }) => {
    const id = resolveSurahId(C, params.surah);
    const bonds = surahBonds(id, V.verseData, V.w2v, V.seedIndex(), V.stopSet, {
      maxGlobal: qInt(query, "max_global", { min: 1, max: 50, def: 3 }),
      minDist: qInt(query, "min_distance", { min: 1, max: 200, def: 2 }),
    });
    const flat = Array.isArray(bonds) ? bonds : [...(bonds.words || []), ...(bonds.phrases || [])];
    const p = page(flat, paging(query), url);
    return { data: p.items, meta: p.meta, links: { ...surahLinks(id), ...p.links } };
  }, {
    summary: "Rare words and phrases binding distant āyāt within one sūrah.",
    description: "A word counts as a bond only if it is rare corpus-wide (`max_global`) and the two "
      + "āyāt are far apart (`min_distance`) — which is what makes the repetition structural rather "
      + "than incidental.",
    tags: ["analysis"],
    params: [PP.surahNum, P.maxGlobal, P.minDistance, ...PAGED],
    response: "Envelope",
    examples: [{ label: "The bonds inside Al-Baqara", path: "/analysis/bonds/2?limit=20" }],
  });

  router.add("/analysis/shared-roots", ({ V, query }) => {
    const a = parseVerseKey(query.get("a"), C.surahIndex);
    const b = parseVerseKey(query.get("b"), C.surahIndex);
    if (!V.verseData[a] || !V.verseData[b]) throw notFound("Both a and b must be existing āyāt.");
    const roots = sharedRoots(a, b, V.verseData);
    return {
      data: {
        a: verseShape(V, C, a), b: verseShape(V, C, b),
        shared_roots: roots.map((r) => ({ root: r, links: termLinks({ key: r, label: r, mode: "root" }, (V.r2v[r] || [])[0], true) })),
      },
      links: { ui_a: verseLink(a, "root"), ui_b: verseLink(b, "root") },
    };
  }, {
    summary: "The roots two āyāt have in common.",
    tags: ["analysis"],
    params: [P.aVerse, P.bVerse],
    response: "Envelope",
    examples: [{ label: "1:1 against 1:3", path: "/analysis/shared-roots?a=1:1&b=1:3" }],
  });
}

function shapePair(V, p) {
  const [a, b] = Array.isArray(p) ? p : [p.a, p.b];
  return {
    a: { verse_key: a, text: V.verseData[a]?.text, links: verseLinks(a) },
    b: { verse_key: b, text: V.verseData[b]?.text, links: verseLinks(b) },
    ...(Array.isArray(p) ? {} : { distance: p.d ?? p.distance }),
  };
}

function nearIdentical(C, vk) {
  const ids = C.mutashabihat?.byVerse?.[vk] || [];
  return ids.map((i) => C.mutashabihat.pairs[i]).filter(Boolean);
}

/* The oath / conditional frames the rhetoric scanner finds AT this āya. The scanner works
 * over a whole sūra, so scope it to the verse's own sūra and pick the entry out. */
function verseRhetoric(V, C, vk) {
  if (!C.morph) return null;
  const scan = rhetoricScan(V.verseData, C.morph, { suraId: V.verseData[vk].s });
  return {
    oath: scan.oath.find((x) => x.vk === vk)?.marker || null,
    conditional: scan.conditional.find((x) => x.vk === vk)?.marker || null,
  };
}

const round = (n) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 1000) / 1000 : n);
