/* ═══ OpenAPI component schemas ═══
 *
 * The actual shape of what each endpoint returns, so "Try it out" shows a model rather
 * than an opaque blob and client generators produce real types.
 *
 * Everything is an *envelope*: `{ api, data, meta?, links }`. Only `data` varies, so the
 * per-endpoint schemas below are built by `envelope(dataSchema)` and the common parts are
 * defined exactly once.
 */

const str = (description, example) => ({ type: "string", ...(description ? { description } : {}), ...(example !== undefined ? { example } : {}) });
const int = (description, example) => ({ type: "integer", ...(description ? { description } : {}), ...(example !== undefined ? { example } : {}) });
const num = (description) => ({ type: "number", ...(description ? { description } : {}) });
const arr = (items, description) => ({ type: "array", items, ...(description ? { description } : {}) });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const obj = (properties, description) => ({ type: "object", ...(description ? { description } : {}), properties });

/* `{ api, data, meta?, links }` around a payload. */
export function envelope(data, { paged = false } = {}) {
  return obj({
    api: str("API version.", "v1"),
    data,
    ...(paged ? { meta: ref("PageMeta") } : {}),
    links: ref("Links"),
  });
}

export const SCHEMAS = {
  /* ── the thing that makes this API different ── */
  Links: {
    type: "object",
    description:
      "Where to go next. `self` is this request; `next` appears while more pages remain. "
      + "Every key starting `ui` is a fully-formed URL that opens ayat.network showing exactly "
      + "what this object describes — the occurrences sheet, the distribution chart, the root "
      + "lab, the graph. The whole app state travels in the URL fragment, so they work as "
      + "shares, bookmarks and citations.",
    properties: {
      self: str("This request."),
      next: str("The next page, when `meta.has_more` is true."),
      ui: str("The most natural view of this object, in the app."),
      ui_occurrences: str("The occurrences sheet for this term."),
      ui_distribution: str("This term's distribution across the sūrahs."),
      ui_graph: str("The graph, centred on the anchor āya."),
      ui_root_lab: str("The root lab (root-mode terms only)."),
      ui_expressions: str("The expressions explorer, focused on this root."),
      ui_construction: str("The construction query, seeded with this root."),
      ui_aya_lab: str("The āya lab."),
      ui_context: str("The context reader, at this āya."),
      ui_phrases: str("Shared phrases (المتشابهات) for this āya."),
      ui_rhyme: str("The rhyme lab for this āya."),
      ui_surah_lab: str("The sūrah lab."),
      ui_compare: str("The two-term compare view."),
      ui_pairing: str("The pairing matrix."),
    },
    additionalProperties: str(),
  },

  PageMeta: obj({
    count: int("Rows in this page.", 50),
    total: int("Rows in the whole result.", 279),
    limit: int("Requested page size.", 50),
    offset: int("Rows skipped.", 0),
    has_more: { type: "boolean", description: "More pages remain; follow `links.next`.", example: true },
  }, "Where this page sits in the whole result."),

  /* ── lexical ── */
  Term: obj({
    key: str("The canonical index key the query resolved to.", "كتب"),
    label: str("The prettiest display form — the most frequent vocalized spelling for exact keys.", "كتب"),
    mode: { type: "string", enum: ["exact", "lemma", "root"], example: "root" },
    resolved_from: str("Present when the query differed from the key it resolved to.", "الصلاة"),
    verses: int("Distinct āyāt containing it.", 279),
    occurrences: int("Token frequency — an āya using it twice counts twice.", 319),
    alternatives: arr(obj({ key: str(), label: str(), verses: int() }), "Other terms the query could have meant."),
    links: ref("Links"),
  }, "A resolved word, lemma or root."),

  Morphology: obj({
    pos: str("Part of speech.", "noun"),
    form: int("Verb Form (وزن), I–X, as a number.", 2),
    aspect: str("perf | impf | imp."),
    voice: str("act | pass."),
    mood: str("ind | subj | juss."),
    person: int("1, 2 or 3."),
    gender: str("m | f."),
    number: str("s | d | p."),
    case: str("nom | acc | gen."),
    precise: { type: "boolean", description: "The corpus analysis is unambiguous at this position." },
  }, "One token's grammatical analysis, from the Quranic Arabic Corpus."),

  Word: obj({
    index: int("Position in the āya (0-based), matching `matches.word_indices`.", 1),
    form: str("The surface form as written.", "ٱلْكِتَٰبُ"),
    normalized: str("The normalised key.", "الكتب"),
    root: str("This occurrence's root — position-correct, so homographs split correctly.", "كتب"),
    lemma: str("This occurrence's lemma.", "كِتاب"),
    morphology: ref("Morphology"),
  }, "One token of an āya."),

  Verse: obj({
    verse_key: str("`surah:ayah`.", "2:2"),
    surah: int("Sūrah number.", 2),
    surah_name: str("Sūrah name.", "البقرة"),
    ayah: int("Āya number within the sūrah.", 2),
    text: str("The Uthmani (Ḥafṣ) text.", "ذَٰلِكَ ٱلْكِتَٰبُ لَا رَيْبَ فِيهِ هُدًى لِّلْمُتَّقِينَ"),
    matches: obj({
      word_indices: arr(int(), "Which words matched — what the app highlights."),
      count: int("How many tokens in this āya matched.", 1),
    }, "Present on occurrence results."),
    words: arr(ref("Word"), "Present when `words=true`."),
    links: ref("Links"),
  }, "One āya."),

  Surah: obj({
    id: int("1–114.", 2),
    name: str("Arabic name.", "البقرة"),
    verses: int("Āya count.", 286),
    muqattaat: arr(str(), "The disjoined-letter opening, or null."),
    links: ref("Links"),
  }),

  Collocate: obj({
    key: str("The neighbour's index key.", "كتب"),
    label: str("A representative surface form."),
    count: int("Co-occurrences."),
    pmi: num("Pointwise mutual information — favours rare, tight pairings."),
    log_likelihood: num("Signed Dunning G². Positive = attracted, negative = repelled."),
    log_dice: num("Scale-independent association."),
    significance: int("Tier from the G² critical values: 0–3."),
    links: ref("Links"),
  }, "A word co-occurring with the term inside the same āya."),

  Neighbour: obj({
    key: str("The adjacent word's key."),
    label: str("A representative surface form."),
    before: int("Times it stood immediately before the term."),
    after: int("Times it stood immediately after."),
    total: int("before + after."),
    links: ref("Links"),
  }, "A word immediately adjacent to the term, corpus-wide."),

  SurahCount: obj({
    surah: int("Sūrah number.", 2),
    name: str("Sūrah name.", "البقرة"),
    occurrences: int("Token frequency in that sūrah.", 61),
    links: ref("Links"),
  }),

  Derivative: obj({
    lemma: str("The derived lemma.", "كِتاب"),
    pos: str("Part of speech.", "noun"),
    form: int("Verb Form, where applicable."),
    voice: str("act | pass."),
    aspect: str("perf | impf | imp."),
    occurrences: int("Token frequency."),
    verse_count: int("Distinct āyāt."),
    examples: arr(str(), "Distinct surface spellings."),
    verses: arr(obj({ verse_key: str(), links: ref("Links") })),
    links: ref("Links"),
  }, "One lemma built on the root."),

  LexiconRef: obj({
    id: str("Dictionary id.", "maqayis"),
    label: str("Its name.", "مقاييس اللغة — ابن فارس"),
    concise: str("The short gloss."),
    has_full: { type: "boolean", description: "A full article is available." },
    links: ref("Links"),
  }),

  SemanticNeighbour: obj({
    root: str("The neighbouring root.", "أرض"),
    similarity: num("Cosine similarity in the distributional space, 0–1."),
    relation: str("syntagmatic (occurs with) | paradigmatic (occurs instead of).", "syntagmatic"),
    links: ref("Links"),
  }),

  Relation: obj({
    root: str("The related root."),
    polarity: str("`opposite` = curated and authoritative; `candidate` = frame-discovered, un-reviewed."),
    relatedness: num("Distributional relatedness."),
    contrast: num("Strength of the opposition."),
    verses: arr({}, "Āyāt where the pair is attested."),
    links: ref("Links"),
  }, "A curated opposite (طباق) or a discovered candidate."),

  /* ── per-endpoint envelopes ── */
  get SearchResponse() {
    return envelope(obj({ term: ref("Term"), verses: arr(ref("Verse")) }), { paged: true });
  },
  get VerseResponse() { return envelope(ref("Verse")); },
  get SurahListResponse() { return envelope(arr(ref("Surah"))); },
  get SurahResponse() {
    return envelope(obj({
      id: int(), name: str(), verses: int(), muqattaat: arr(str()),
      links: ref("Links"),
    }), { paged: true });
  },
  get VerseListResponse() { return envelope(arr(ref("Verse")), { paged: true }); },

  get RootResponse() {
    return envelope(obj({
      term: ref("Term"),
      distribution: arr(ref("SurahCount"), "Where it falls across the sūrahs."),
      derivation: arr(ref("Derivative"), "Every lemma built on the root."),
      lexicons: arr(ref("LexiconRef"), "Which of the six dictionaries have an entry."),
      semantic_neighbours: arr(ref("SemanticNeighbour")),
      relations: arr(ref("Relation")),
      expressions: obj({
        government_frames: arr({}), collocations: arr({}), idafa_compounds: arr({}),
      }, "Multi-word units the root takes part in."),
      verses: arr(ref("Verse")),
    }), { paged: true });
  },

  get RootListResponse() {
    return envelope(arr(obj({
      root: str("The root.", "قول"),
      occurrences: int("Token frequency."),
      verses: int("Distinct āyāt."),
      links: ref("Links"),
    })), { paged: true });
  },

  get DistributionResponse() {
    return envelope(obj({ term: ref("Term"), distribution: arr(ref("SurahCount")) }));
  },
  get CollocationsResponse() {
    return envelope(obj({
      term: ref("Term"),
      window: { description: "`whole-verse`, or the word window used.", example: "whole-verse" },
      collocates: arr(ref("Collocate")),
    }), { paged: true });
  },
  get NeighboursResponse() {
    return envelope(obj({ term: ref("Term"), neighbours: arr(ref("Neighbour")) }), { paged: true });
  },
  get CompareResponse() {
    return envelope(obj({
      a: ref("Term"), b: ref("Term"),
      shared_verses: arr(obj({ verse_key: str(), links: ref("Links") }), "Āyāt containing both."),
      collocates: obj({
        shared: arr(obj({ key: str(), label: str(), a: int(), b: int() }), "Neighbours both terms attract."),
        only_a: arr(ref("Collocate")), only_b: arr(ref("Collocate")),
      }),
    }));
  },

  get VerseAnalysisResponse() {
    return envelope(obj({
      verse: ref("Verse"),
      profile: obj({
        words: int(), letters: int(), roots: int(),
        parts_of_speech: arr(obj({ pos: str(), count: int() })),
        verb_forms: arr(int()),
        rhyme: obj({ key: str("The strict ending."), rawiy: str("The rhyme consonant."), prosody: obj({ cv: str(), radf: {}, tasis: {} }) }),
        unique_roots: arr(str(), "Roots occurring only in this āya."),
        rarest_roots: arr(obj({ root: str(), verses: int(), links: ref("Links") })),
      }),
      rhetoric: obj({ oath: str("The oath marker, if this āya swears."), conditional: str("The conditional marker, if any.") }),
      antithesis: arr({}, "Curated opposite pairs framed at this āya."),
      similar_verses: arr(obj({
        verse_key: str(), score: num("idf-weighted shared-root cosine, 0–1."),
        shared_roots: arr(str()), text: str(), links: ref("Links"),
      })),
      shared_phrases: arr(obj({ phrase: str(), length: int(), verses: arr({}) }), "Word runs this āya shares with others."),
      near_identical: arr({}, "Mutashābihāt pairs involving this āya."),
    }));
  },

  get SurahAnalysisResponse() {
    return envelope(obj({
      surah: obj({ id: int(), name: str(), verses: int() }),
      profile: obj({}, "Counts, dominant rhyme, refrains."),
      muqattaat: arr(str()),
      letters: obj({}, "Letter frequency, and how the opening letters compare to the corpus."),
      keyness: arr(obj({
        root: str(), in_surah: int(), corpus: int(),
        keyness: num("Signed log-likelihood; positive = over-represented here."),
        links: ref("Links"),
      })),
      cohesion: obj({ mean: num(), sequence: arr({}) }, "Shared-root overlap between consecutive āyāt — dips mark topic shifts."),
      rhyme: obj({ dominant: str(), dominant_rawiy: str(), scheme: arr({}), rawiy_scheme: arr({}), fawasil: obj({}) }),
      iltifat: obj({}, "Grammatical register shifts (الالتفات)."),
      munasabat: obj({}, "Coherence with the neighbouring sūrahs."),
    }));
  },

  get LexiconEntryResponse() {
    return envelope(obj({
      lexicon: obj({ id: str(), label: str(), license: str(), edition: obj({}) }),
      root: str(),
      concise: str("The short gloss."),
      full: str("The complete article."),
      citation: obj({ text: str(), bibtex: str(), ris: str() }, "Ready to paste into a bibliography."),
      links: ref("Links"),
    }));
  },

  get GraphResponse() {
    return envelope(obj({
      centre: obj({ verse_key: str(), text: str() }),
      mode: str(),
      nodes: arr(obj({
        id: str("`v:2:255` for āyāt, `w:<lookup>@<verseKey>` for words."),
        type: str("center | verse | word | overflow."),
        label: str(), verse_key: str(), text: str(),
        lookup: str("The word's grouping key."),
        occurrences: int("How many āyāt the word reaches."),
        root: str(), lemma: str(),
        shared_words: arr(str(), "Words this āya shares with the centre."),
        connecting_word: str(), depth: int(), expanded: {},
        links: ref("Links"),
      })),
      links: arr(obj({ source: str(), target: str(), weight: num("Rarity weight — rarer shared word, stronger edge.") })),
      loop_links: arr({}, "Edges back to an āya already in the graph."),
      counts: obj({ nodes: int(), links: int(), omitted: int(), truncated: {} }),
    }));
  },

  get PairingResponse() {
    return envelope(obj({
      rows: arr(obj({ key: str(), label: str(), verses: int() })),
      cols: arr(obj({ key: str(), label: str(), verses: int() })),
      matrix: obj({
        rows: arr({}), cols: arr({}),
        cells: arr(arr(obj({ count: int(), keys: arr(str()) })), "Co-occurrence per cell — a count of 0 is a finding, not a gap."),
        rowTotals: arr(int()), colTotals: arr(int()), symmetric: {},
      }),
    }));
  },

  get ExpressionsResponse() {
    return envelope(arr(obj({
      head: str("The governing word.", "ءامن"),
      pos: str(), root: str(),
      total: int("All its occurrences."),
      governed: int("Those taking a preposition."),
      bare: int("Those taking none."),
      prepositions: arr(obj({
        preposition: str("The ḥarf.", "ب"),
        gloss: str("Its display form."),
        count: int(),
        verses: arr(obj({ verse_key: str(), word_indices: arr(int()), links: ref("Links") })),
      }), "The contrast that carries the meaning: آمَنَ بـ vs آمَنَ لـ."),
      links: ref("Links"),
    })), { paged: true });
  },

  get IndexResponse() {
    return envelope(obj({
      name: str(), description: str(), version: str(), app: str(),
      corpus: obj({
        surahs: int(), verses: int(), words: int(),
        distinctForms: int(), distinctRoots: int(), distinctLemmas: int(),
        lexicons: int(), morphology: {},
      }),
      access: obj({}, "Whether a key is required, and the rate-limit budget."),
      conventions: obj({}),
      endpoints: arr(obj({ path: str(), url: str(), summary: str() })),
    }));
  },

  ErrorResponse: obj({
    error: obj({
      code: str("Machine-readable.", "not_found"),
      message: str("What went wrong.", "No exact in the Qurʾān matches \"zzzz\"."),
      hint: str("What to do about it.", "Try a different mode (exact | lemma | root), or the bare consonantal form."),
    }),
  }, "Every failure has this shape."),

  /* Fallback for the handful of endpoints that pass a precomputed dataset straight through. */
  get Envelope() { return envelope({ description: "Endpoint-specific payload." }); },
};

/* Resolve the getters into plain objects for serialization. */
export function allSchemas() {
  const out = {};
  for (const k of Object.keys(SCHEMAS)) out[k] = SCHEMAS[k];
  return out;
}
