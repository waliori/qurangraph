/* ═══ The parameter vocabulary ═══
 *
 * Every query and path parameter the API accepts, declared ONCE and referenced from the
 * route table. Three things then read the same declaration:
 *
 *   · server/openapi.js  — turns it into OpenAPI parameter objects
 *   · server/explorer/   — turns it into the form controls on /docs
 *   · a human            — reads it here
 *
 * The handlers still validate independently (server/http.js), because a spec is a promise
 * and validation is enforcement; but nothing can now be documented one way and typed
 * another, which is the usual way API docs rot.
 *
 * `rtl: true` marks a field whose value is Arabic — the explorer flips those inputs to
 * right-to-left so a typed root reads correctly while you type it.
 */

/* A query parameter. */
const q = (name, spec) => ({ name, in: "query", ...spec });

/* A path parameter (always required). */
export const path = (name, spec) => ({ name, in: "path", required: true, ...spec });

export const P = {
  /* ── the term ── */
  q: q("q", {
    type: "string", required: true, rtl: true, example: "كتب",
    description: "The term to look up. Arabic in any spelling — vocalized Uthmani (ٱلصَّلَوٰة), "
      + "conventional imlāʾī (الصلاة) — or Latin transliteration (rahman). Resolved by the same "
      + "forgiving matcher the search bar uses; a miss returns near-matches as a hint.",
  }),
  term: q("term", {
    type: "string", required: true, rtl: true, example: "نور",
    description: "The term to look up (alias of q).",
  }),
  a: q("a", { type: "string", required: true, rtl: true, example: "علم", description: "First term." }),
  b: q("b", { type: "string", required: true, rtl: true, example: "جهل", description: "Second term." }),

  mode: q("mode", {
    type: "string", enum: ["exact", "lemma", "root"], default: "exact",
    description: "How occurrences are grouped. `exact` = this surface form; `lemma` = this "
      + "word (صيغة) in any inflection; `root` = the whole جذر family. It also travels into "
      + "the UI links, so the app opens in the same mode.",
  }),
  modeRootDefault: q("mode", {
    type: "string", enum: ["exact", "lemma", "root"], default: "root",
    description: "How occurrences are grouped.",
  }),
  modeA: q("mode_a", { type: "string", enum: ["exact", "lemma", "root"], description: "Grouping for `a` (defaults to `mode`)." }),
  modeB: q("mode_b", { type: "string", enum: ["exact", "lemma", "root"], description: "Grouping for `b` (defaults to `mode_a`)." }),

  precision: q("precision", {
    type: "string", enum: ["loose", "strict"], default: "loose",
    description: "`loose` folds orthographic variants (آية/اية); `strict` keeps them distinct. "
      + "Affects exact-mode keys only.",
  }),

  /* ── shaping the response ── */
  words: q("words", {
    type: "boolean", default: false,
    description: "Attach each āya's per-token analysis: surface form, normalised key, root, lemma, full morphology.",
  }),
  limit: q("limit", { type: "integer", default: 50, minimum: 1, maximum: 500, description: "Page size." }),
  offset: q("offset", { type: "integer", default: 0, minimum: 0, description: "Rows to skip. `meta.total` and `links.next` come back." }),
  format: q("format", { type: "string", enum: ["json", "csv"], default: "json", description: "`csv` on endpoints whose data is a list of rows." }),

  /* ── per-endpoint ── */
  surah: q("surah", { type: "integer", minimum: 1, maximum: 114, example: 2, description: "Restrict to one sūrah." }),
  from: q("from", { type: "integer", minimum: 1, example: 1, description: "First āya number (within the sūrah)." }),
  to: q("to", { type: "integer", minimum: 1, example: 10, description: "Last āya number (within the sūrah)." }),
  verses: q("verses", { type: "boolean", default: true, description: "Include the āyāt themselves, not just the header." }),

  window: q("window", {
    type: "integer", default: 99, minimum: 1, maximum: 99,
    description: "Co-occurrence window in words either side. 99 (the default) means the whole āya.",
  }),
  collocSort: q("sort", {
    type: "string", enum: ["count", "pmi", "ll", "logdice"], default: "count",
    description: "Ranking measure. `ll` (signed log-likelihood) is the usual choice for "
      + "significance; `pmi` favours rare pairings; `logdice` is scale-independent.",
  }),
  crossVerse: q("cross_verse", {
    type: "boolean", default: false,
    description: "Let adjacency cross the āya boundary within a sūrah — the recited flow doesn't stop at the verse end.",
  }),
  includeEmpty: q("include_empty", { type: "boolean", default: false, description: "Keep sūrahs where the term never occurs (count 0)." }),

  rootSearch: q("q", { type: "string", rtl: true, example: "كت", description: "Substring filter on the root." }),
  hapax: q("hapax", { type: "boolean", default: false, description: "Only roots occurring exactly once in the whole Qurʾān." }),
  rootSort: q("sort", { type: "string", enum: ["frequency", "alphabetical"], default: "frequency", description: "Ordering." }),

  full: q("full", { type: "boolean", default: true, description: "Include the full dictionary article, not just the concise gloss." }),
  framed: q("framed", { type: "boolean", default: false, description: "Only pairs with an attested antithesis construction in the text." }),

  similar: q("similar", { type: "integer", default: 10, minimum: 0, maximum: 100, description: "How many similar āyāt to return." }),
  phraseMin: q("phrase_min", { type: "integer", default: 3, minimum: 2, maximum: 12, description: "Shortest shared phrase to report, in words." }),
  keyness: q("keyness", { type: "integer", default: 30, minimum: 1, maximum: 200, description: "How many over-represented roots to return." }),
  minVerses: q("min_verses", { type: "integer", default: 2, minimum: 1, maximum: 50, description: "Ignore roots occurring in fewer than this many āyāt of the sūrah." }),
  rhymeBy: q("by", { type: "string", enum: ["key", "rawiy"], default: "key", description: "`key` = the strict ending; `rawiy` = the rhyme consonant alone (the classical criterion)." }),

  verseParam: q("verse", { type: "string", example: "2:255", description: "Restrict to one āya's pairs." }),
  surahParam: q("surah", { type: "integer", minimum: 1, maximum: 114, example: 2, description: "Restrict to one sūrah." }),
  aVerse: q("a", { type: "string", required: true, example: "1:1", description: "First āya key." }),
  bVerse: q("b", { type: "string", required: true, example: "1:3", description: "Second āya key." }),

  rows: q("rows", { type: "string", required: true, rtl: true, example: "علم,جهل", description: "Comma-separated terms for the matrix rows." }),
  cols: q("cols", { type: "string", required: true, rtl: true, example: "نور,ظلم", description: "Comma-separated terms for the matrix columns." }),

  exprVerses: q("verses", {
    type: "integer", default: 5, minimum: 0, maximum: 500,
    description: "How many example āyāt to attach per expression. These lists run to thousands; 0 omits them.",
  }),
  derivVerses: q("verses", { type: "integer", default: 10, minimum: 0, maximum: 500, description: "How many āyāt to attach per derived lemma." }),

  maxGlobal: q("max_global", { type: "integer", default: 3, minimum: 1, maximum: 50, description: "A word counts as a bond only if it occurs in at most this many āyāt corpus-wide." }),
  minDistance: q("min_distance", { type: "integer", default: 2, minimum: 1, maximum: 200, description: "Minimum āya distance for a bond to be interesting." }),

  graphVerse: q("verse", { type: "string", default: "2:255", example: "2:255", description: "The āya at the centre of the graph." }),
  maxBranch: q("max_branch", { type: "integer", default: 10, minimum: 1, maximum: 60, description: "Most āyāt any one word may fan out to." }),
  hideStop: q("hide_stopwords", { type: "boolean", default: true, description: "Hide grammatical particles (حروف المعاني)." }),
  expandWords: q("expand_words", {
    type: "string", rtl: true, example: "الكتب@2:255",
    description: "Comma-separated `lookup@verseKey` pairs to expand — the same identity the app uses.",
  }),
  expandVerses: q("expand_verses", { type: "string", example: "2:2", description: "Comma-separated verse keys whose words should be expanded." }),
};

/* Path parameters, with an example that actually resolves. */
export const PP = {
  verseKey: path("key", { type: "string", example: "2:255", description: "An āya key, `surah:ayah`." }),
  surahId: path("id", { type: "integer", example: 112, description: "Sūrah number, 1–114." }),
  surahNum: path("surah", { type: "integer", example: 2, description: "Sūrah number, 1–114." }),
  ayahNum: path("ayah", { type: "integer", example: 255, description: "Āya number within the sūrah." }),
  root: path("root", { type: "string", rtl: true, example: "علم", description: "A triliteral root." }),
  rootKey: path("key", { type: "string", rtl: true, example: "علم", description: "A triliteral root." }),
  wordKey: path("key", { type: "string", rtl: true, example: "الصلاة", description: "A surface form, in any spelling." }),
  lemmaKey: path("key", { type: "string", rtl: true, example: "كِتاب", description: "A lemma (صيغة)." }),
  searchTerm: path("q", { type: "string", rtl: true, example: "كتب", description: "The term to look up." }),
  lexiconId: path("id", { type: "string", enum: ["ayn", "sihah", "maqayis", "muhkam", "mufradat", "lisan"], example: "maqayis", description: "Which dictionary." }),
};

/* The pagination trio, appended to every list endpoint. */
export const PAGED = [P.limit, P.offset, P.format];
