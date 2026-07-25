/* ═══ The tool table ═══
 *
 * Twelve tools over roughly forty endpoints, and the compression is the point. A client
 * loads every schema in this file into its context before the conversation starts, so the
 * table is a fixed tax on every turn: forty thin tools would cost more and choose worse
 * than twelve fat ones. Related endpoints therefore fold behind an enum (`analyze_term`
 * carries nine analyses; `corpus_info` carries six documents), and each description says
 * WHEN to reach for the tool, not merely what it does — a trigger condition in the
 * description is what actually drives selection.
 *
 * Two endpoint families are deliberately absent:
 *
 *   · /graph — the force-directed network. A model cannot render it, the node list is
 *     large, and every verse answer already carries the `ui` link that draws it in a
 *     browser. Nothing is lost and several thousand tokens are saved.
 *   · /docs, /guide, /openapi.json — documentation for humans and HTTP clients. An MCP
 *     client already has tools/list; `ayat://guide` covers the prose.
 *
 * Every tool is read-only, side-effect free and closed-world (it touches this corpus and
 * nothing else), which is what the annotations say — so a client may run them without
 * prompting the user for confirmation.
 */

import { seg } from "./invoke.js";
import { bare, cap, notes, pick } from "./shape.js";
import { sectionsOrDefault } from "./validate.js";
import { GUIDE_MD } from "./guide.js";

const MODES = ["exact", "lemma", "root"];
const PRECISIONS = ["loose", "strict"];
const LEXICONS = ["ayn", "sihah", "maqayis", "muhkam", "mufradat", "lisan"];

/* Nothing here writes, nothing here reaches outside this corpus, and calling twice gives
 * the same answer. Clients read these to decide whether to ask the user first. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/* ── shared parameter fragments ── */
const P = {
  mode: (def = "exact") => ({
    type: "string", enum: MODES, default: def,
    description: "How occurrences are grouped: `exact` = this surface spelling only; `lemma` = this "
      + "word in any inflection (صيغة); `root` = the whole triliteral family (جذر). Concept-level "
      + "questions almost always want `root`.",
  }),
  precision: {
    type: "string", enum: PRECISIONS, default: "loose",
    description: "`loose` folds orthographic variants (آية/اية); `strict` keeps them distinct. Affects `exact` mode only.",
  },
  offset: { type: "integer", minimum: 0, default: 0, description: "Rows to skip, for paging. `meta.total` reports the full size." },
  morphology: {
    type: "boolean", default: false,
    description: "Attach every token's root, lemma and full grammatical analysis. Roughly quadruples "
      + "the size of each āya — ask for it only when the grammar is the question.",
  },
};

export function buildTools({ invoke }) {
  /* ════════════════════════════════════════════════════════════════════════ */
  const search_quran = {
    name: "search_quran",
    title: "Search the Qurʾān by word, lemma or root",
    description:
      "Every āya containing a given word. THE DEFAULT STARTING POINT for 'where does the Qurʾān "
      + "mention X', 'how often does X occur', 'which verses use X'.\n\n"
      + "Set `mode` to `root` for concept-level questions — it gathers the whole derivational "
      + "family (كتب → كِتاب, كَتَبَ, مَكْتوب…). Use `exact` only when the specific spelling matters.\n\n"
      + "The query may be Arabic in any spelling (vocalized ٱلصَّلَوٰة or plain الصلاة) or Latin "
      + "transliteration (salat, rahman): it runs through the same forgiving resolver as the app's "
      + "search bar. Because that resolver is forgiving, ALWAYS read `term.resolved_from` and "
      + "`term.alternatives` back to the user when they are present.\n\n"
      + "If you already have the wording of a passage and want to know which āya it is, use "
      + "`locate_quotation` — this tool matches a single word, not a phrase.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", description: "The word, lemma or root to look up. Arabic in any spelling, or Latin transliteration." },
        mode: P.mode("exact"),
        precision: P.precision,
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10, description: "How many āyāt to return. `meta.total` reports how many exist." },
        offset: P.offset,
        include_morphology: P.morphology,
      },
    },
    async run(a) {
      const r = await invoke(`/search/${seg(a.query)}`, {
        mode: a.mode, precision: a.precision, limit: a.limit, offset: a.offset, words: a.include_morphology,
      });
      return {
        term: r.data.term,
        verses: r.data.verses,
        meta: r.meta,
        notes: notes(
          r.meta?.has_more && `Showing ${r.meta.count} of ${r.meta.total} āyāt — raise \`offset\` for more.`,
          r.data.term?.resolved_from && `"${r.data.term.resolved_from}" was resolved to ${r.data.term.label}.`,
        ),
        api_url: r.url,
      };
    },
  };

  /* ════════════════════════════════════════════════════════════════════════ */
  const locate_quotation = {
    name: "locate_quotation",
    title: "Identify which āya a quotation is",
    description:
      "Give it Arabic text and it tells you which āya (or āyāt) that text is.\n\n"
      + "USE THIS BEFORE ASSERTING ANY VERSE REFERENCE you did not obtain from another tool call in "
      + "this conversation. Verse numbers recalled from memory are the single most common error in "
      + "this domain; this tool is the check.\n\n"
      + "Spelling is folded before matching, so vocalized Uthmani (ٱلْحَمْدُ لِلَّهِ) and plain imlāʾī "
      + "(الحمد لله) both resolve, with or without ﴿ ﴾ brackets. Words match whole and in order. A "
      + "fragment returns every āya carrying it, with `matches.word_indices` marking where; an āya the "
      + "quotation covers completely sorts first and is counted in `exact_verse_matches`. A quotation "
      + "may run across an āya boundary but never across a sūrah boundary.\n\n"
      + "For a single word use `search_quran` instead — it resolves variants and groups by lemma or root.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        text: { type: "string", description: "The quotation, in whatever spelling you have it." },
        limit: { type: "integer", minimum: 1, maximum: 20, default: 5, description: "How many matching āyāt to return." },
        include_morphology: P.morphology,
      },
    },
    async run(a) {
      const r = await invoke(`/verses/find/${seg(a.text)}`, { limit: a.limit, words: a.include_morphology });
      const exact = r.meta?.exact_verse_matches ?? 0;
      return {
        query: a.text,
        exact_verse_matches: exact,
        verses: r.data,
        meta: pick(r.meta, ["count", "total", "has_more"]),
        notes: notes(
          exact === 0 && "No āya is covered COMPLETELY by this text — every result below merely contains it "
            + "as a fragment, or is one part of a passage spanning several āyāt. Do not report a single "
            + "verse reference as 'the' source without saying so.",
          exact > 1 && `${exact} different āyāt match this text in full — the Qurʾān repeats it. Cite all of them, not one.`,
          r.meta?.has_more && `Showing ${r.meta.count} of ${r.meta.total} matching āyāt.`,
        ),
        api_url: r.url,
      };
    },
  };

  /* ════════════════════════════════════════════════════════════════════════ */
  const get_verses = {
    name: "get_verses",
    title: "Read specific āyāt",
    description:
      "Fetch the text of āyāt you can already name — either a list of keys (`verse_keys: [\"2:255\", "
      + "\"112:1\"]`, up to 20) or a contiguous range (`surah` with optional `from`/`to`).\n\n"
      + "Use it to read the context around a hit, or to quote a verse you already identified. Quote the "
      + "returned `text` verbatim; do not re-type it.\n\n"
      + "A sūrah may be a number, an Arabic name (البقرة) or a transliteration (al-baqarah). If you do "
      + "not know the reference, use `locate_quotation` or `search_quran` first.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        verse_keys: {
          type: "array", items: { type: "string" }, minItems: 1, maxItems: 20,
          description: "Verse keys, `surah:ayah` — e.g. [\"2:255\", \"البقرة:256\"].",
        },
        surah: { type: "string", description: "A sūrah: number (1–114), Arabic name, or transliteration. Used when `verse_keys` is absent." },
        from: { type: "integer", minimum: 1, description: "First āya number within the sūrah." },
        to: { type: "integer", minimum: 1, description: "Last āya number within the sūrah." },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20, description: "Maximum āyāt to return in range mode." },
        offset: P.offset,
        include_morphology: P.morphology,
      },
    },
    async run(a) {
      if (!a.verse_keys && !a.surah) {
        const e = new Error("Give either `verse_keys` (a list of surah:ayah keys) or `surah` (with optional `from`/`to`).");
        e.validation = true;
        throw e;
      }
      if (a.verse_keys) {
        // One bad key must not lose the other nineteen answers — report it in place, so the
        // model can correct that key alone instead of re-issuing the whole call.
        const results = await Promise.all(a.verse_keys.map(async (key) => {
          try {
            const r = await invoke(`/verses/${seg(key)}`, { words: a.include_morphology });
            return r.data;
          } catch (err) {
            return { requested: key, error: String(err?.message || err), hint: err?.hint };
          }
        }));
        const failed = results.filter((v) => v.error).length;
        return {
          requested: a.verse_keys.length,
          verses: results,
          notes: notes(failed && `${failed} of ${a.verse_keys.length} key(s) could not be read — see the \`error\` field on each.`),
        };
      }
      const r = await invoke("/verses", {
        surah: a.surah, from: a.from, to: a.to, limit: a.limit, offset: a.offset, words: a.include_morphology,
      });
      return {
        verses: r.data,
        meta: r.meta,
        notes: notes(r.meta?.has_more && `Showing ${r.meta.count} of ${r.meta.total} āyāt — raise \`offset\` for more.`),
        api_url: r.url,
      };
    },
  };

  /* ════════════════════════════════════════════════════════════════════════ */
  const get_surah = {
    name: "get_surah",
    title: "Read a sūrah",
    description:
      "One sūrah: its header (number, name, āya count, disjoined opening letters) and its āyāt in order. "
      + "Set `include_verses: false` when you only need to identify or size the chapter.\n\n"
      + "Al-Baqara has 286 āyāt, so long sūrahs page — check `meta.total` and `meta.has_more` before "
      + "describing what you received as the whole chapter. For statistical or structural questions about "
      + "a sūrah (its characteristic vocabulary, rhyme scheme, cohesion) use `analyze_surah` instead.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["surah"],
      properties: {
        surah: { type: "string", description: "Number (1–114), Arabic name (الإخلاص), or transliteration (al-ikhlas)." },
        include_verses: { type: "boolean", default: true, description: "Include the āyāt, not just the header." },
        limit: { type: "integer", minimum: 1, maximum: 300, default: 20, description: "How many āyāt to return." },
        offset: P.offset,
        include_morphology: P.morphology,
      },
    },
    async run(a) {
      const r = await invoke(`/surahs/${seg(a.surah)}`, {
        verses: a.include_verses, limit: a.limit, offset: a.offset, words: a.include_morphology,
      });
      return {
        surah: r.data,
        meta: r.meta,
        notes: notes(r.meta?.has_more && `Showing āyāt ${(r.meta.offset ?? 0) + 1}–${(r.meta.offset ?? 0) + r.meta.count} of ${r.meta.total}.`),
        api_url: r.url,
      };
    },
  };

  /* ════════════════════════════════════════════════════════════════════════ */
  const browse_roots = {
    name: "browse_roots",
    title: "Browse the triliteral roots",
    description:
      "The root inventory of the Qurʾān, ranked by frequency. Use it to answer 'what are the most "
      + "common roots', to find roots containing given consonants (`contains`), or to list the hapax "
      + "legomena — roots occurring exactly once in the whole text (`hapax: true`).\n\n"
      + "This is a catalogue, not a lookup: if you already know which root you want, go straight to "
      + "`root_dossier`.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        contains: { type: "string", description: "Substring filter on the root, in Arabic — e.g. كت." },
        hapax: { type: "boolean", default: false, description: "Only roots occurring exactly once in the whole Qurʾān." },
        sort: { type: "string", enum: ["frequency", "alphabetical"], default: "frequency", description: "Ordering." },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25, description: "How many roots to return." },
        offset: P.offset,
      },
    },
    async run(a) {
      const r = await invoke("/roots", { q: a.contains, hapax: a.hapax, sort: a.sort, limit: a.limit, offset: a.offset });
      return {
        roots: bare(r.data),
        meta: r.meta,
        notes: notes(r.meta?.has_more && `Showing ${r.meta.count} of ${r.meta.total} roots.`),
        api_url: r.url,
      };
    },
  };

  /* ════════════════════════════════════════════════════════════════════════ */
  const ROOT_SECTIONS = ["overview", "distribution", "derivation", "lexicons", "semantic_neighbours", "opposites", "expressions", "verses"];
  const root_dossier = {
    name: "root_dossier",
    title: "Everything the corpus holds about one root",
    description:
      "The full picture of a triliteral root, assembled from every dataset at once. Use it for "
      + "'what does the root X mean and where does it appear' — one call instead of five.\n\n"
      + "`sections` controls what comes back, and the default is deliberately narrow because the "
      + "complete dossier is very large. Available sections:\n"
      + "· overview — the resolved root, its verse and token counts\n"
      + "· distribution — occurrences per sūrah\n"
      + "· derivation — every lemma built on the root, with its grammatical shape\n"
      + "· lexicons — the CONCISE gloss from each of the six dictionaries that has an entry\n"
      + "· semantic_neighbours — roots that behave like it distributionally (not synonyms; shared context)\n"
      + "· opposites — the curated antithesis (طباق) pairs, with attesting āyāt\n"
      + "· expressions — the multi-word units it enters\n"
      + "· verses — sample āyāt containing it\n\n"
      + "For the FULL article from one dictionary rather than a gloss, call `lexicon_entry`.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["root"],
      properties: {
        root: { type: "string", description: "A triliteral root (علم), or any word from which it should be resolved." },
        sections: {
          type: "array", items: { type: "string", enum: ROOT_SECTIONS }, maxItems: ROOT_SECTIONS.length,
          default: ["overview", "lexicons", "derivation"],
          description: "Which parts of the dossier to return.",
        },
        verses_limit: { type: "integer", minimum: 0, maximum: 25, default: 5, description: "Sample āyāt to include when `verses` is requested." },
      },
    },
    async run(a) {
      const want = new Set(sectionsOrDefault(a.sections, ["overview", "lexicons", "derivation"]));
      const r = await invoke(`/roots/${seg(a.root)}`, { limit: Math.max(1, a.verses_limit || 1) });
      const d = r.data;
      const out = { sections: [...want] };
      const ns = [];

      if (want.has("overview")) out.term = d.term;
      if (want.has("distribution")) {
        const [rows, note] = cap(bare(d.distribution), 60, "distribution");
        out.distribution = rows; ns.push(note);
      }
      if (want.has("derivation")) {
        const [rows, note] = cap(bare(d.derivation), 30, "derivational family");
        out.derivation = rows; ns.push(note);
      }
      if (want.has("lexicons")) {
        out.lexicons = (d.lexicons || []).map((lx) => pick(lx, ["id", "label", "concise", "has_full"]));
        if (out.lexicons.length) ns.push("Lexicon entries here are the CONCISE gloss — call `lexicon_entry` for a full article.");
      }
      if (want.has("semantic_neighbours")) {
        const [rows, note] = cap(bare(d.semantic_neighbours), 20, "semantic neighbours");
        out.semantic_neighbours = rows; ns.push(note);
        if (rows.length) ns.push("Semantic neighbours are distributional (shared context), not synonyms.");
      }
      if (want.has("opposites")) {
        const [rows, note] = cap(bare(d.relations), 20, "opposites");
        out.opposites = rows; ns.push(note);
      }
      if (want.has("expressions")) out.expressions = d.expressions;
      if (want.has("verses")) {
        out.verses = (d.verses || []).slice(0, a.verses_limit);
        out.verses_meta = pick(r.meta, ["total"]);
        if (r.meta?.total > out.verses.length) ns.push(`Sample of ${out.verses.length} āyāt from ${r.meta.total} — use \`search_quran\` with mode "root" to page through them all.`);
      }

      out.notes = notes(ns);
      out.api_url = r.url;
      return out;
    },
  };

  /* ════════════════════════════════════════════════════════════════════════ */
  const lexicon_entry = {
    name: "lexicon_entry",
    title: "A classical dictionary article for a root",
    description:
      "One root's article from one of six classical Arabic dictionaries, with a ready-made citation "
      + "(plain text, BibTeX, RIS).\n\n"
      + "· ayn — al-ʿAyn, al-Khalīl b. Aḥmad (2nd c. AH), the earliest\n"
      + "· sihah — al-Ṣiḥāḥ, al-Jawharī\n"
      + "· maqayis — Maqāyīs al-Lugha, Ibn Fāris — organised around a root's core semantic principle; "
      + "the best first choice when the question is 'what does this root fundamentally mean'\n"
      + "· muhkam — al-Muḥkam, Ibn Sīda\n"
      + "· mufradat — Mufradāt Alfāẓ al-Qurʾān, al-Rāghib al-Iṣfahānī — Qurʾān-specific vocabulary\n"
      + "· lisan — Lisān al-ʿArab, Ibn Manẓūr — the most exhaustive, and much the longest\n\n"
      + "ARTICLES ARE IN CLASSICAL ARABIC AND ARE NOT TRANSLATED. If you render one into another "
      + "language, say that the translation is yours. Do not quote a dictionary from memory — these "
      + "are the digitised editions named in the citation.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["root", "lexicon"],
      properties: {
        root: { type: "string", description: "A triliteral root (علم), or a word from which to resolve one." },
        lexicon: { type: "string", enum: LEXICONS, description: "Which dictionary." },
        include_full: { type: "boolean", default: true, description: "Include the full article as well as the concise gloss." },
        max_characters: {
          type: "integer", minimum: 500, maximum: 40000, default: 6000,
          description: "Clip the full article to this length. Lisān articles run to tens of thousands of characters.",
        },
      },
    },
    async run(a) {
      const r = await invoke(`/lexicons/${seg(a.lexicon)}/${seg(a.root)}`, { full: a.include_full });
      const d = r.data;
      let full = a.include_full ? d.full : null;
      let clipped = false;
      if (typeof full === "string" && full.length > a.max_characters) {
        full = `${full.slice(0, a.max_characters)}…`;
        clipped = true;
      }
      return {
        lexicon: d.lexicon,
        root: d.root,
        concise: d.concise,
        ...(a.include_full ? { full } : {}),
        citation: d.citation,
        ui: d.links?.ui,
        notes: notes(
          clipped && `The article was clipped to ${a.max_characters} characters (it is ${d.full.length} long). `
            + `Raise \`max_characters\` if you need the rest — and do not describe the clipped text as the complete entry.`,
          "The article is classical Arabic, unglossed. Any translation you give is your own.",
        ),
        api_url: r.url,
      };
    },
  };

  /* ════════════════════════════════════════════════════════════════════════ */
  const TERM_ANALYSES = [
    "distribution", "collocations", "neighbours", "semantic_neighbours",
    "opposites", "derivation", "valency", "roles", "expressions",
  ];
  const ROOT_ONLY = new Set(["semantic_neighbours", "opposites", "derivation", "valency", "roles", "expressions"]);

  const analyze_term = {
    name: "analyze_term",
    title: "Run one analysis over one term",
    description:
      "Nine lenses on a single word or root. Pick one with `analysis`:\n\n"
      + "· distribution — occurrences per sūrah (TOKEN counts: an āya using it twice counts twice)\n"
      + "· collocations — what shares an āya with it, ranked by association (PMI / log-likelihood / "
      + "logDice) rather than raw count. Function words are filtered out\n"
      + "· neighbours — the words immediately before and after it, corpus-wide. Particles are KEPT: "
      + "the preposition beside a verb is the signal\n"
      + "· semantic_neighbours — roots occurring in similar contexts. `paradigmatic` (tends to occur "
      + "INSTEAD of it) is the closer thing to a synonym; `syntagmatic` occurs WITH it\n"
      + "· opposites — the curated antithesis (طباق) catalogue for this root, with attesting āyāt\n"
      + "· derivation — every lemma built on the root, with its grammatical shape\n"
      + "· valency — which prepositions a verb root governs and which nouns it takes directly\n"
      + "· roles — how its occurrences divide between subject, object, genitive and so on\n"
      + "· expressions — the multi-word units it enters: government frames, verb–noun collocations, iḍāfa\n\n"
      + "The last six are ROOT-scoped: whatever you pass is resolved to a root first, and `mode` is "
      + "ignored for them.\n\n"
      + "These are distributional facts. Turning them into a claim about meaning is your argument, and "
      + "should be presented as such.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["term", "analysis"],
      properties: {
        term: { type: "string", description: "The word or root to analyse. Arabic in any spelling, or Latin transliteration." },
        analysis: { type: "string", enum: TERM_ANALYSES, description: "Which lens to apply." },
        mode: P.mode("root"),
        precision: P.precision,
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20, description: "Rows to return, where the analysis is a ranked list." },
        sort: {
          type: "string", enum: ["count", "pmi", "ll", "logdice"], default: "ll",
          description: "`collocations` only. `ll` (signed log-likelihood) is the usual significance measure; "
            + "`pmi` favours rare tight pairings; `logdice` is scale-independent; `count` is raw frequency.",
        },
        window: { type: "integer", minimum: 1, maximum: 99, default: 99, description: "`collocations` only: words either side. 99 (default) means the whole āya." },
        cross_verse: { type: "boolean", default: false, description: "`neighbours` only: let adjacency continue past the āya boundary within a sūrah." },
      },
    },
    async run(a) {
      const t = seg(a.term);
      const common = { mode: a.mode, precision: a.precision };
      const ns = [];
      if (ROOT_ONLY.has(a.analysis) && a.mode !== "root") {
        ns.push(`The "${a.analysis}" analysis is root-scoped; "${a.term}" was resolved to a root and \`mode\` was ignored.`);
      }

      let r, body;
      switch (a.analysis) {
        case "distribution": {
          r = await invoke("/analysis/distribution", { q: a.term, ...common });
          const [rows, note] = cap(bare(r.data.distribution), Math.max(a.limit, 30), "sūrahs");
          body = { term: r.data.term, distribution: rows };
          ns.push(note, "Counts are tokens, not āyāt. Sūrahs where the term never occurs are omitted.");
          break;
        }
        case "collocations": {
          r = await invoke("/analysis/collocations", { q: a.term, ...common, sort: a.sort, window: a.window, limit: a.limit });
          body = { term: r.data.term, window: r.data.window, ranked_by: a.sort, collocates: bare(r.data.collocates), meta: r.meta };
          break;
        }
        case "neighbours": {
          r = await invoke("/analysis/neighbours", { q: a.term, ...common, cross_verse: a.cross_verse, limit: a.limit });
          body = { term: r.data.term, neighbours: bare(r.data.neighbours), meta: r.meta };
          break;
        }
        case "semantic_neighbours": {
          r = await invoke(`/analysis/semantic/${t}`);
          const [rows, note] = cap(bare(r.data.neighbours), a.limit, "neighbours");
          body = { term: r.data.term, neighbours: rows };
          ns.push(note, "`paradigmatic` = occurs instead of it (nearer a synonym); `syntagmatic` = occurs with it.");
          break;
        }
        case "opposites": {
          r = await invoke(`/analysis/relations/${t}`);
          const [rows, note] = cap(bare(r.data.relations), a.limit, "opposites");
          body = { term: r.data.term, opposites: rows };
          ns.push(note, "Curated pairs first, then frame-discovered candidates — check each entry's `polarity`.");
          break;
        }
        case "derivation": {
          r = await invoke(`/analysis/derivation/${t}`, { verses: 3 });
          const [rows, note] = cap(bare(r.data.family), a.limit, "derived lemmas");
          body = { term: r.data.term, family: rows };
          ns.push(note);
          break;
        }
        case "valency": {
          r = await invoke(`/analysis/valency/${t}`);
          body = { term: r.data.term, valency: r.data.valency };
          ns.push("This is the evidence for how the root reaches its complement; the reading — transitive vs preposition-governing — is yours.");
          break;
        }
        case "roles": {
          r = await invoke(`/analysis/roles/${t}`);
          body = { term: r.data.term, total: r.data.total, roles: bare(r.data.roles) };
          ns.push("Roles carry a confidence marker: case and adjacency agreeing is stronger than adjacency alone.");
          break;
        }
        case "expressions": {
          r = await invoke(`/expressions/roots/${t}`, { verses: 3 });
          const [frames, f1] = cap(bare(r.data.government_frames), a.limit, "government frames");
          const [colls, f2] = cap(bare(r.data.collocations), a.limit, "collocations");
          const [comps, f3] = cap(bare(r.data.compounds), a.limit, "iḍāfa compounds");
          body = { term: r.data.term, government_frames: frames, collocations: colls, compounds: comps };
          ns.push(f1, f2, f3);
          break;
        }
        default: {
          const e = new Error(`Unknown analysis "${a.analysis}".`);
          e.validation = true;
          throw e;
        }
      }
      return { analysis: a.analysis, ...body, notes: notes(ns), api_url: r.url };
    },
  };

  /* ════════════════════════════════════════════════════════════════════════ */
  const compare_terms = {
    name: "compare_terms",
    title: "Compare two terms",
    description:
      "Two terms side by side: the āyāt they share, the collocates they both attract, and the "
      + "collocates distinctive to each. Use it for 'how do X and Y differ in the Qurʾān', or for any "
      + "pair the tradition treats as opposed (علم/جهل, نور/ظلمة).\n\n"
      + "The two may be compared in different modes — `mode_a: \"root\"` against `mode_b: \"exact\"` "
      + "sets a whole family against one spelling. An EMPTY shared-verse list is a real finding, not a "
      + "failure: it means the Qurʾān never puts the two in one āya.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["a", "b"],
      properties: {
        a: { type: "string", description: "First term." },
        b: { type: "string", description: "Second term." },
        mode: P.mode("root"),
        mode_a: { type: "string", enum: MODES, description: "Grouping for `a`, if it should differ from `mode`." },
        mode_b: { type: "string", enum: MODES, description: "Grouping for `b`, if it should differ from `mode`." },
        precision: P.precision,
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20, description: "Collocates to return per list." },
      },
    },
    async run(a) {
      const r = await invoke("/analysis/compare", {
        a: a.a, b: a.b, mode: a.mode, mode_a: a.mode_a, mode_b: a.mode_b, precision: a.precision,
      });
      const d = r.data;
      const [shared, sNote] = cap(bare(d.shared_verses), 40, "shared āyāt");
      return {
        a: d.a,
        b: d.b,
        shared_verses: shared,
        shared_verse_count: (d.shared_verses || []).length,
        collocates: {
          shared: (d.collocates?.shared || []).slice(0, a.limit),
          only_a: (d.collocates?.only_a || []).slice(0, a.limit),
          only_b: (d.collocates?.only_b || []).slice(0, a.limit),
        },
        notes: notes(
          sNote,
          !(d.shared_verses || []).length && "The two never occur in the same āya. That absence is itself the finding.",
        ),
        api_url: r.url,
      };
    },
  };

  /* ════════════════════════════════════════════════════════════════════════ */
  const VERSE_SECTIONS = ["verse", "profile", "rhetoric", "antithesis", "similar_verses", "shared_phrases", "near_identical"];
  const analyze_verse = {
    name: "analyze_verse",
    title: "Analyse one āya",
    description:
      "One āya from several angles at once. `sections` selects what comes back:\n"
      + "· verse — the text itself\n"
      + "· profile — word / letter / root counts, parts of speech, verb Forms, rhyme key and prosody, rarest roots\n"
      + "· rhetoric — oath (قسم) and conditional frames detected at this āya\n"
      + "· antithesis — curated طباق pairs attested here\n"
      + "· similar_verses — the lexically closest āyāt, by idf-weighted shared-root cosine\n"
      + "· shared_phrases — word runs this āya shares verbatim with others\n"
      + "· near_identical — its twins in the المتشابهات set (differing by at most two words)\n\n"
      + "`similar_verses` is a LEXICAL similarity, not a thematic one: it measures shared roots and "
      + "says nothing about meaning. Report it that way.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["verse_key"],
      properties: {
        verse_key: { type: "string", description: "`surah:ayah` — 2:255. The sūrah half may be a name." },
        sections: {
          type: "array", items: { type: "string", enum: VERSE_SECTIONS }, maxItems: VERSE_SECTIONS.length,
          default: ["verse", "profile", "similar_verses", "near_identical"],
          description: "Which parts of the analysis to return.",
        },
        limit: { type: "integer", minimum: 1, maximum: 40, default: 10, description: "Rows per list section." },
        include_morphology: P.morphology,
      },
    },
    async run(a) {
      const want = new Set(sectionsOrDefault(a.sections, ["verse", "profile", "similar_verses", "near_identical"]));
      const r = await invoke(`/analysis/verse/${seg(a.verse_key)}`, {
        words: a.include_morphology, similar: want.has("similar_verses") ? a.limit : 0,
      });
      const d = r.data;
      const out = { sections: [...want] };
      const ns = [];

      if (want.has("verse")) out.verse = d.verse;
      else out.verse = pick(d.verse, ["verse_key", "surah", "surah_name", "ayah", "text"]);
      if (want.has("profile")) out.profile = d.profile;
      if (want.has("rhetoric")) out.rhetoric = d.rhetoric;
      if (want.has("antithesis")) out.antithesis = d.antithesis;
      if (want.has("similar_verses")) {
        const [rows, note] = cap(d.similar_verses, a.limit, "similar āyāt");
        out.similar_verses = rows; ns.push(note, "Similarity is lexical (shared roots), not thematic.");
      }
      if (want.has("shared_phrases")) {
        const [rows, note] = cap(d.shared_phrases, a.limit, "shared phrases");
        out.shared_phrases = rows; ns.push(note);
      }
      if (want.has("near_identical")) out.near_identical = d.near_identical;

      out.notes = notes(ns);
      out.api_url = r.url;
      return out;
    },
  };

  /* ════════════════════════════════════════════════════════════════════════ */
  const SURAH_SECTIONS = ["profile", "muqattaat", "letters", "keyness", "cohesion", "rhyme", "iltifat", "munasabat"];
  const analyze_surah = {
    name: "analyze_surah",
    title: "Analyse one sūrah",
    description:
      "Structural and statistical analysis of a whole sūrah. `sections` selects what comes back:\n"
      + "· profile — size, refrains, basic counts\n"
      + "· muqattaat — the disjoined opening letters, if any\n"
      + "· letters — letter frequency profile, and how it relates to the disjoined opening\n"
      + "· keyness — the roots OVER-REPRESENTED here versus the whole Qurʾān (signed log-likelihood). "
      + "This is the closest thing to 'what is this sūrah about' that the corpus can support\n"
      + "· cohesion — adjacent-āya lexical overlap; the dips mark topic shifts\n"
      + "· rhyme — the rhyme scheme and the fawāṣil classification\n"
      + "· iltifat — the grammatical register shifts (الالتفات): changes of person, number, tense\n"
      + "· munasabat — coherence with the neighbouring sūrahs, at the seams\n\n"
      + "To READ the sūrah rather than analyse it, use `get_surah`.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["surah"],
      properties: {
        surah: { type: "string", description: "Number (1–114), Arabic name, or transliteration." },
        sections: {
          type: "array", items: { type: "string", enum: SURAH_SECTIONS }, maxItems: SURAH_SECTIONS.length,
          default: ["profile", "keyness", "rhyme"],
          description: "Which parts of the analysis to return.",
        },
        limit: { type: "integer", minimum: 1, maximum: 60, default: 20, description: "Rows per list section (keyness, cohesion steps)." },
      },
    },
    async run(a) {
      const want = new Set(sectionsOrDefault(a.sections, ["profile", "keyness", "rhyme"]));
      const r = await invoke(`/analysis/surah/${seg(a.surah)}`, { keyness: want.has("keyness") ? a.limit : 1 });
      const d = r.data;
      const out = { surah: d.surah, sections: [...want] };
      const ns = [];

      if (want.has("profile")) out.profile = d.profile;
      if (want.has("muqattaat")) out.muqattaat = d.muqattaat;
      if (want.has("letters")) out.letters = d.letters;
      if (want.has("keyness")) {
        const [rows, note] = cap(bare(d.keyness), a.limit, "over-represented roots");
        out.keyness = rows; ns.push(note, "Keyness compares this sūrah's root frequencies against the whole Qurʾān; it is a statistical signal, not a statement of theme.");
      }
      if (want.has("cohesion")) {
        const [seq, note] = cap(d.cohesion?.sequence, a.limit, "cohesion steps");
        out.cohesion = { mean: d.cohesion?.mean, sequence: seq }; ns.push(note);
      }
      if (want.has("rhyme")) {
        // `scheme` and `rawiy_scheme` are one entry per āya — 286 of them in al-Baqara,
        // and the dominant ending is the answer to almost every question about them.
        const [scheme, r1] = cap(d.rhyme?.scheme, a.limit, "rhyme scheme (per āya)");
        const [rawiy, r2] = cap(d.rhyme?.rawiy_scheme, a.limit, "rawiy scheme (per āya)");
        out.rhyme = { ...d.rhyme, scheme, rawiy_scheme: rawiy };
        ns.push(r1, r2);
      }
      if (want.has("iltifat")) {
        const [contour, i1] = cap(d.iltifat?.contour, a.limit, "iltifāt contour (per āya)");
        const [shifts, i2] = cap(d.iltifat?.shifts, a.limit, "iltifāt shifts");
        out.iltifat = d.iltifat ? { contour, shifts } : null;
        ns.push(i1, i2);
      }
      if (want.has("munasabat")) out.munasabat = d.munasabat;

      out.notes = notes(ns);
      out.api_url = r.url;
      return out;
    },
  };

  /* ════════════════════════════════════════════════════════════════════════ */
  const TOPICS = ["overview", "conventions", "sources", "coverage", "lexicons", "surahs"];
  const corpus_info = {
    name: "corpus_info",
    title: "What this corpus is, and where it came from",
    description:
      "Metadata about the corpus itself. `topic`:\n"
      + "· overview — what this service holds, and its size\n"
      + "· conventions — the full briefing: what is and is not in the corpus, how terms resolve, how to "
      + "cite it accurately. READ THIS FIRST if you are unsure how to use the other tools\n"
      + "· sources — the exact upstream revisions and checksums this deployment was built from. "
      + "CITE THESE, not the tool\n"
      + "· coverage — what fraction of tokens carry a root or lemma analysis, which bounds what any "
      + "root-based aggregate can claim\n"
      + "· lexicons — the six dictionaries, with editions and licences\n"
      + "· surahs — all 114 with names, āya counts and disjoined letters",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        topic: { type: "string", enum: TOPICS, default: "overview", description: "Which document to return." },
      },
    },
    async run(a) {
      switch (a.topic) {
        case "conventions":
          return { topic: "conventions", guide: GUIDE_MD };
        case "sources": {
          const r = await invoke("/sources");
          return { topic: "sources", sources: r.data, notes: ["Cite these upstream revisions, not this API alone."], api_url: r.url };
        }
        case "coverage": {
          const r = await invoke("/coverage");
          return {
            topic: "coverage", coverage: r.data,
            notes: ["A root-based aggregate can only speak for the tokens that carry a root analysis."],
            api_url: r.url,
          };
        }
        case "lexicons": {
          const r = await invoke("/lexicons");
          return { topic: "lexicons", lexicons: bare(r.data), api_url: r.url };
        }
        case "surahs": {
          const r = await invoke("/surahs");
          return { topic: "surahs", surahs: bare(r.data), api_url: r.url };
        }
        case "overview":
        default: {
          const r = await invoke("/");
          return {
            topic: "overview",
            name: r.data.name,
            description: r.data.description,
            corpus: r.data.corpus,
            conventions: r.data.conventions,
            app: r.data.app,
            notes: ["Call `corpus_info` with topic \"conventions\" for the full briefing on what this corpus does and does not contain."],
            api_url: r.url,
          };
        }
      }
    },
  };

  const tools = [
    search_quran, locate_quotation, get_verses, get_surah,
    browse_roots, root_dossier, lexicon_entry,
    analyze_term, compare_terms, analyze_verse, analyze_surah,
    corpus_info,
  ];

  for (const t of tools) t.annotations = { title: t.title, ...READ_ONLY };
  return tools;
}
