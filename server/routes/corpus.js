/* ═══ Corpus routes: sūrahs, āyāt, the raw text + morphology ═══ */

import { notFound, badRequest, qBool, paging, page } from "../http.js";
import { verseShape, resolveSurahId } from "../terms.js";
import { surahLinks } from "../links.js";
import { muqattaatOf } from "../../src/analytics/letters.js";
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
