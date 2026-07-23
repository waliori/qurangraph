/* ═══ Corpus routes: sūrahs, āyāt, the raw text + morphology ═══ */

import { notFound, badRequest, qBool, paging, page } from "../http.js";
import { verseShape, resolveSurahId } from "../terms.js";
import { surahLinks, verseLink } from "../links.js";
import { muqattaatOf } from "../../src/analytics/letters.js";
import { norm, quoteKeys } from "../../src/arabic-utils.js";
import { P, PP, PAGED } from "../params.js";

/* "2:255", "2/255" and "2,255" all name the same āya — accept them all, since the key
 * travels through URLs, spreadsheets and shell quoting on its way here.
 *
 * With a `surahIndex` the sūrah half may also be a name: "البقرة:255", "al-baqarah/255".
 * Without one (unit tests, callers that only ever see numbers) it stays numeric. */
export function parseVerseKey(raw, surahIndex = null) {
  const v = String(raw ?? "").trim();
  // The sūrah half may not itself contain a separator, so "2:255:1" is rejected outright
  // rather than being read as a sūrah called "2:255".
  const m = /^([^:/,]+)[:/,](\d{1,3})$/.exec(v);
  if (!m) throw badRequest(`"${v}" is not a verse key`, `Use surah:ayah — 2:255, البقرة:255, or al-baqarah/255.`);
  const [, sPart, aPart] = m;
  if (/^\d{1,3}$/.test(sPart)) return `${Number(sPart)}:${Number(aPart)}`;
  // A name where this caller only handles numbers is a malformed key, not a missing sūrah.
  if (!surahIndex) throw badRequest(`"${v}" is not a verse key`, `Use surah:ayah, e.g. 2:255`);
  const id = surahIndex.lookup(sPart);
  if (!id) {
    // The SHAPE is fine (`something:12`) — it is the sūrah that doesn't exist. That is a
    // 404, matching /analysis/surah/{id}; a 400 is reserved for a key that isn't a key.
    const near = surahIndex.near(sPart);
    throw notFound(`No sūrah called "${sPart}".`,
      near.length
        ? `Did you mean ${near.map((n) => `${n.name} (${n.id})`).join(", ")}? A sūrah may be a number, an Arabic name, or a transliteration.`
        : `Use surah:ayah — 2:255, البقرة:255, or al-baqarah/255.`);
  }
  return `${id}:${Number(aPart)}`;
}

export function register(router, ctx) {
  const { corpus: C } = ctx;

  router.add("/surahs", ({ V }) => ({
    data: V.surahList.map((s) => surahRow(V, s)),
  }), {
    summary: "Every sūrah with its verse count, opening letters and UI links.",
    tags: ["corpus"],
    response: "SurahListResponse",
    examples: [{ label: "All 114", path: "/surahs" }],
  });

  router.add("/surahs/:id", ({ V, params, query, url }) => {
    const id = resolveSurahId(C, params.id);
    const s = V.surahList.find((x) => x.id === id);
    if (!s) throw notFound(`No sūrah ${params.id} (1–114).`);
    const withVerses = qBool(query, "verses", true);
    const row = surahRow(V, s);
    if (!withVerses) return { data: row };
    const keys = V.orderedKeys.filter((vk) => V.verseData[vk].s === id);
    const p = page(keys, paging(query), url);
    return {
      data: { ...row, verses: p.items.map((vk) => verseShape(V, C, vk, { words: qBool(query, "words", false) })) },
      meta: p.meta, links: { ...row.links, ...p.links },
    };
  }, {
    summary: "One sūrah and its āyāt.",
    description: "The sūrah header plus its āyāt in order. `verses=false` returns just the header; "
      + "`words=true` attaches the full morphology of every token.",
    tags: ["corpus"],
    params: [PP.surahId, P.verses, P.words, ...PAGED],
    response: "SurahResponse",
    examples: [
      { label: "Al-Ikhlāṣ, complete", path: "/surahs/112" },
      { label: "…by its Arabic name", path: "/surahs/الإخلاص" },
      { label: "…by transliteration", path: "/surahs/al-ikhlas" },
      { label: "First 3 āyāt of Al-Baqara, with morphology", path: "/surahs/2?limit=3&words=true" },
    ],
  });

  router.add("/verses", ({ V, query, url }) => {
    const surah = query.get("surah") ? resolveSurahId(C, query.get("surah")) : null;
    const from = query.get("from") ? Number(query.get("from")) : null;
    const to = query.get("to") ? Number(query.get("to")) : null;
    let keys = V.orderedKeys;
    if (surah) keys = keys.filter((vk) => V.verseData[vk].s === surah);
    if (from != null) keys = keys.filter((vk) => V.verseData[vk].a >= from);
    if (to != null) keys = keys.filter((vk) => V.verseData[vk].a <= to);
    const p = page(keys, paging(query), url);
    return {
      data: p.items.map((vk) => verseShape(V, C, vk, { words: qBool(query, "words", false) })),
      meta: p.meta, links: p.links,
    };
  }, {
    summary: "Āyāt in muṣḥaf order, filterable by sūrah and āya range.",
    description: "Page through the whole muṣḥaf, or narrow to one sūrah and a range of āya numbers.",
    tags: ["corpus"],
    params: [P.surah, P.from, P.to, P.words, ...PAGED],
    response: "VerseListResponse",
    examples: [
      { label: "Al-Ikhlāṣ", path: "/verses?surah=112" },
      { label: "…by name", path: "/verses?surah=الإخلاص" },
      { label: "Al-Baqara 1–10", path: "/verses?surah=2&from=1&to=10" },
    ],
  });

  /* ── find ── the inverse of /verses/{key}: text in, āya out ──
   *
   * Answers "which āya is this?" for text pulled out of a book, an article or an editor
   * selection. Matching runs over the normalized token stream (server/corpus.js,
   * buildTextIndex), so the caller's spelling barely matters: harakāt, tatweel, the alif
   * family and the ﴿ ﴾ brackets all fold away before anything is compared, and Uthmani
   * (ٱلْحَمْدُ لِلَّهِ) and imlāʾī (الحمد لله) land on the same key.
   *
   * Both shapes are offered for the same reason /search is: curl percent-encodes a URL's
   * path but passes its query string through verbatim, so `?text=الحمد` puts raw UTF-8 in
   * the request line and the HTTP parser rejects it before the API sees it.
   *
   * REGISTRATION ORDER IS LOAD-BEARING: the router matches in declaration order among
   * routes of equal segment count, so these must precede /verses/{key} and
   * /verses/{surah}/{ayah}, which would otherwise read "find" as a sūrah name. */
  const find = (raw) => ({ V, query, url }) => {
    const needle = queryTokens(raw);
    if (!needle.length) {
      throw badRequest(
        raw ? `"${String(raw).trim()}" has no Arabic to match on` : `"text" is required`,
        "Pass the quotation as you have it — vocalized or not, with or without ﴿ ﴾: "
        + "?text=الحمد لله رب العالمين",
      );
    }
    const entries = V.textIndex();
    // Which words of which āyāt the quotation covers, unioned over every place it occurs —
    // a refrain repeated inside one āya, or a fragment recurring across the muṣḥaf, both
    // land here as marks on the āyāt they touch.
    const covered = new Map(); // verse ordinal → Set of word index
    for (let i = 0; i < entries.length; i++) {
      const keys = entries[i].keys;
      for (let p = 0; p < keys.length; p++) {
        const cover = matchAt(entries, i, p, needle, V.verseData);
        if (!cover) continue;
        for (const c of cover) {
          let set = covered.get(c.ord);
          if (!set) covered.set(c.ord, (set = new Set()));
          for (let w = c.at; w < c.at + c.count; w++) set.add(w);
        }
      }
    }
    if (!covered.size) {
      throw notFound(`No āya contains "${String(raw).trim()}".`,
        needle.length === 1
          ? "For a single word, /search?q=… is the better tool — it resolves spelling variants "
            + "and groups by lemma or root. This endpoint matches a contiguous quotation literally."
          : "Words are matched whole and in order, and a quotation may run across an āya "
            + "boundary but not a sūrah one. Check for a dropped or transposed word, or quote "
            + "a shorter run of it.");
    }
    // An āya the quotation covers ENTIRELY is a stronger answer than one it merely clips,
    // so those come first; within each group, muṣḥaf order (textIndex is already ordered).
    const hits = [...covered.entries()]
      .map(([ord, set]) => ({
        ord,
        vk: entries[ord].vk,
        indices: [...set].sort((a, b) => a - b),
        whole: set.size === entries[ord].keys.length,
      }))
      .sort((a, b) => (b.whole - a.whole) || (a.ord - b.ord));

    const withWords = qBool(query, "words", false);
    const p = page(hits, paging(query), url);
    return {
      data: p.items.map((h) => verseShape(V, C, h.vk, {
        words: withWords,
        hits: { word_indices: h.indices, count: h.indices.length },
      })),
      meta: { ...p.meta, exact_verse_matches: hits.filter((h) => h.whole).length },
      // The best hit gets the headline link, so a caller holding one answer doesn't have to
      // reach into data[0] to cite it.
      links: { ui: verseLink(hits[0].vk), ...p.links },
    };
  };

  const FIND_DESC = "Give it a quotation and it tells you which āya it is. Spelling is folded "
    + "before matching — harakāt, tatweel, the alif family, ﴿ ﴾ — so Uthmani and imlāʾī both "
    + "resolve. Words match whole and in order: a fragment returns every āya containing it, "
    + "with `matches.word_indices` marking where, and a complete āya sorts first. "
    + "For a single word, use `/search` instead: it resolves variants and groups by lemma or root.";

  router.add("/verses/find", (c) => find(c.query.get("text"))(c), {
    summary: "Which āya is this text?",
    description: FIND_DESC,
    tags: ["corpus"],
    params: [P.findText, P.words, ...PAGED],
    response: "VerseListResponse",
    examples: [
      { label: "A whole āya, vocalized", path: "/verses/find?text=ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ" },
      { label: "…the same, written plainly", path: "/verses/find?text=الحمد لله رب العالمين" },
      { label: "A fragment — every āya that carries it", path: "/verses/find?text=لا إله إلا هو" },
    ],
  });

  router.add("/verses/find/:text", (c) => find(c.params.text)(c), {
    summary: "Same as /verses/find, with the text in the path.",
    description: "Identical to `/verses/find?text=…`, and the form to use from curl: curl "
      + "encodes a URL's path for you but passes its query string through verbatim, and raw "
      + "UTF-8 in the request line is rejected before the API sees it.",
    tags: ["corpus"],
    params: [PP.findText, P.words, ...PAGED],
    response: "VerseListResponse",
    examples: [{ label: "The curl-safe form", path: "/verses/find/الحمد لله رب العالمين" }],
  });

  router.add("/verses/:key", ({ V, params, query }) => {
    const vk = parseVerseKey(params.key, C.surahIndex);
    if (!V.verseData[vk]) throw notFound(`No āya ${vk}.`);
    return { data: verseShape(V, C, vk, { words: qBool(query, "words", true) }) };
  }, {
    summary: "One āya, with its per-word root / lemma / morphology.",
    description: "`2/255` is accepted in place of `2:255`, so the key survives shell quoting.",
    tags: ["corpus"],
    params: [PP.verseKey, P.words],
    response: "VerseResponse",
    examples: [
      { label: "Āyat al-Kursī", path: "/verses/2:255" },
      { label: "…named, not numbered", path: "/verses/البقرة:255" },
      { label: "The basmala", path: "/verses/1:1" },
    ],
  });

  router.add("/verses/:surah/:ayah", ({ V, params, query }) => {
    const vk = parseVerseKey(`${params.surah}:${params.ayah}`, C.surahIndex);
    if (!V.verseData[vk]) throw notFound(`No āya ${vk}.`);
    return { data: verseShape(V, C, vk, { words: qBool(query, "words", true) }) };
  }, {
    summary: "One āya — the slash form, for callers where a colon is awkward.",
    tags: ["corpus"],
    params: [PP.surahNum, PP.ayahNum, P.words],
    response: "VerseResponse",
    examples: [
      { label: "Āyat al-Kursī", path: "/verses/2/255" },
      { label: "By sūrah name", path: "/verses/البقرة/255" },
      { label: "By transliteration", path: "/verses/al-baqarah/255" },
    ],
  });
}

/* The query, put through exactly what the index did to the corpus (server/corpus.js,
 * buildTextIndex): one key set per whitespace-separated token, and tokens the corpus keeps
 * out of `words` kept out here too — it drops anything normalising to under two
 * characters, so admitting them here would make every quotation containing one miss.
 * Whatever isn't Arabic — the ﴿ ﴾ brackets, āya numbers, a footnote mark dragged along
 * with the selection — falls out inside norm() and takes its token with it. */
function queryTokens(raw) {
  const words = String(raw ?? "")
    .split(/\s+/)
    .filter((t) => norm(t).length >= 2);
  return words
    .map((t, i) => ({
      keys: quoteKeys(t),
      // The muṣḥaf sometimes writes as ONE word what everyone types as two — يَٰٓأَيُّهَا
      // against يا أيها above all, which opens more quoted passages than any other phrase.
      // That is a tokenisation difference, not a spelling one, so no amount of folding
      // reaches it; carrying each token's fusion with the next lets the matcher spend two
      // query words on one corpus word when, and only when, the plain comparison fails.
      join: i + 1 < words.length ? quoteKeys(t + words[i + 1]) : null,
    }))
    .filter((t) => t.keys.length);
}

/* Two tokens are the same word when any of their spellings coincide. Both sides are tiny
 * (one to three keys), so a nested scan beats building a Set per comparison. */
const agree = (a, b) => a.some((k) => b.includes(k));

/* Try to lay the whole `needle` down starting at word `p` of verse ordinal `i`.
 *
 * It walks ON into the following āya when it runs off the end of this one, because people
 * quote passages, not verse records — ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ is one
 * quotation and two āyāt, and refusing it would fail on the most ordinary input there is.
 * It will NOT cross a sūrah boundary: consecutive āyāt of one sūrah are continuous text,
 * but the last āya of one sūrah and the first of the next are not, and a run spanning them
 * would be an artefact of muṣḥaf order rather than a passage anybody quoted.
 *
 * Returns the āyāt it covered as `[{ ord, at, count }]`, or null if the run breaks. */
function matchAt(entries, i, p, needle, verseData) {
  const cover = [];
  let ord = i, w = p, j = 0, start = p, count = 0;
  while (j < needle.length) {
    const keys = entries[ord].keys;
    if (w >= keys.length) {
      // Off the end of this āya — bank what it contributed and step to the next one.
      if (count) cover.push({ ord, at: start, count });
      const next = entries[ord + 1];
      if (!next || verseData[next.vk].s !== verseData[entries[ord].vk].s) return null;
      ord += 1; w = 0; start = 0; count = 0;
      continue;
    }
    // Spend one query word on this corpus word, or two when the muṣḥaf fuses them
    // (يا أيها → يَٰٓأَيُّهَا). The fused reading is only tried once the plain one has failed,
    // so it can never pre-empt a straightforward match.
    let spend = 0;
    if (agree(keys[w], needle[j].keys)) spend = 1;
    else if (needle[j].join && agree(keys[w], needle[j].join)) spend = 2;
    else return null;
    if (!count) start = w;
    count += 1; w += 1; j += spend;
  }
  if (count) cover.push({ ord, at: start, count });
  return cover;
}

function surahRow(V, s) {
  const anchor = `${s.id}:1`;
  return {
    id: s.id,
    name: s.name,
    verses: s.count,
    muqattaat: muqattaatOf(s.id),
    links: surahLinks(s.id, anchor),
  };
}
