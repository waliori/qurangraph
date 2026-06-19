/* Pure, testable parsing helpers for the root/meaning build pipeline. */

/* Extract the ROOT value from a morphology FEATURES field, or null. */
export function parseMorphologyRoot(features) {
  const m = /(?:^|\|)ROOT:([^|]+)/.exec(features);
  return m ? m[1] : null;
}

/* ═══ Full morphology of one SEGMENT ═══
 *
 * The Quranic Arabic Corpus tags one row per *segment* (LOCATION = s:a:w:seg);
 * a word is several segments (prefixes + stem + pronoun suffix). FEATURES is a
 * pipe-delimited bag of tags. `posClass` is the row's column-3 value (N/P/V).
 *
 * Returns every morphological field the corpus encodes for the segment:
 *   { root, lemma, vf, aspect, voice, mood, pos, person, gender, number, gcase,
 *     pref, suff }
 * vf is an integer Form (1..11) or 0; person is 0|1|2|3; the rest are short
 * string codes or null. `pos` is the most specific class we can name.
 */
const AGREE_RE = /^(?:([123])(M|F)?(S|D|P)?|(M|F)(S|D|P)?)$/; // 3MP, 2MS, 1P, FS, M …

export function parseMorphology(features = "", posClass = "") {
  const has = (t) => new RegExp(`(?:^|\\|)${t}(?:\\||$)`).test(features);
  const grab = (t) => { const m = new RegExp(`(?:^|\\|)${t}:([^|]+)`).exec(features); return m ? m[1] : null; };

  const root = grab("ROOT");
  const lemma = grab("LEM");
  const vfRaw = grab("VF");
  const vf = vfRaw ? parseInt(vfRaw, 10) : 0;
  const aspect = has("PERF") ? "perf" : has("IMPF") ? "impf" : has("IMPV") ? "impv" : null;
  const isVerb = posClass === "V" || aspect != null;
  const voice = has("PASS") ? "pass" : isVerb ? "act" : null;
  const moodRaw = grab("MOOD");
  const mood = moodRaw ? moodRaw.toLowerCase() : null;
  const gcase = has("NOM") ? "nom" : has("ACC") ? "acc" : has("GEN") ? "gen" : null;
  const pref = has("PREF");
  const suff = has("SUFF");

  // Most-specific part of speech.
  const pos = has("PASS_PCPL") ? "passpcpl"
    : has("ACT_PCPL") ? "actpcpl"
    : has("PN") ? "pn"
    : has("PRON") ? "pron"
    : has("ADJ") ? "adj"
    : posClass === "V" ? "verb"
    : posClass === "P" ? "particle"
    : posClass === "N" ? "noun"
    : null;

  // Person / gender / number from an agreement token (3MP, FS, M, 1P …).
  let person = 0, gender = null, number = null;
  for (const tok of features.split("|")) {
    const m = AGREE_RE.exec(tok);
    if (!m) continue;
    person = m[1] ? +m[1] : 0;
    gender = (m[2] || m[4] || "").toLowerCase() || null;
    const n = (m[3] || m[5] || "").toLowerCase();
    number = n ? { s: "s", d: "d", p: "p" }[n] : null;
    break;
  }

  return { root, lemma, vf, aspect, voice, mood, pos, person, gender, number, gcase, pref, suff };
}

/* ═══ Aggregate a word's segments into one morphology record ═══
 *
 * `segments` = the segment rows of a single s:a:w, in order, each
 * { form, features, posClass }. We concatenate the surface forms and pick the
 * STEM segment (the one carrying a ROOT, else the first non-affix segment, else
 * the first) to represent the word's lemma/root/POS/inflection.
 * Returns { form, ...stemMorphology } (pref/suff stripped — a word is not an affix).
 */
export function aggregateWord(segments) {
  let form = "";
  const parsed = segments.map((sg) => {
    form += sg.form || "";
    return parseMorphology(sg.features || "", sg.posClass || "");
  });
  const stem =
    parsed.find((p) => p.root) ||
    parsed.find((p) => !p.pref && !p.suff) ||
    parsed[0] || parseMorphology("", "");
  const { pref, suff, ...morph } = stem; // eslint-disable-line no-unused-vars
  return { form, ...morph };
}

/* Collapse a geminate triliteral (last two radicals identical) to the
 * 2-letter form Ibn Faris uses as a header, e.g. ربب → رب, مدد → مد. */
export function collapseGeminate(root) {
  if (root.length === 3 && root[1] === root[2]) return root.slice(0, 2);
  return root;
}

/* Normalise a root for fuzzy header matching (symmetric on both sides):
 *   - unify the whole alif/hamza family → ا  (أله↔اله, سوأ↔سوء, سأل↔سال)
 *   - unify the final weak letter و/ي/ى → ى  (corpus صلو/رأي ↔ Ibn Faris صلى/رأى)
 * The final-weak fold is positional (last char only) so it does not merge
 * distinct strong roots like قول vs قيل.
 *
 * This folds standalone ء (and the whole hamza/alif family) MORE aggressively than
 * the runtime token normaliser norm() (src/arabic-utils.js), which keeps ء distinct.
 * The divergence is deliberate: here we align a closed, curated set of ROOTS onto
 * dictionary headers whose hamza spelling varies by edition, so aggressive folding is
 * what lets them match; norm() groups open-class display TOKENS, where erasing ء would
 * wrongly merge content words (ماء→ما). See the norm() header for the full rationale. */
export function matchNorm(root) {
  return root
    .replace(/[ٱأإآاءؤئ]/g, "ا")
    .replace(/ـ/g, "")
    .replace(/[ويى]$/, "ى");
}

/* Resolve a corpus root to a Maqayis header via exact → geminate → alif/hamza
 * normalised fallback. `headerSet` is a Set of headers; `normMap` maps
 * matchNorm(header) → header. Returns the matched header or null. */
export function matchRoot(root, headerSet, normMap) {
  if (headerSet.has(root)) return root;
  const g = collapseGeminate(root);
  if (g !== root && headerSet.has(g)) return g;
  const n = matchNorm(root);
  if (normMap.has(n)) return normMap.get(n);
  const gn = matchNorm(g);
  if (normMap.has(gn)) return normMap.get(gn);
  return null;
}

/* ═══ Spaced-letter root extractor (phonetically-ordered lexicons) ═══
 *
 * Ibn Sīda's al-Muḥkam is ordered by al-Khalīl's phonetic scheme, not alphabetically,
 * so its (OpenITI Shamela) section headers NAME the radicals ("العين والشين والطاء")
 * rather than spelling the root — and crucially those names are in phonetic order, NOT
 * the root's order, so they cannot be trusted to reconstruct the headword. The reliable
 * markers are the ones that spell the root out as spaced single letters:
 *   - permutation headers:  "مقلوبه: (ن ز ل)"   → نزل
 *   - entry-opening bracket: "# [ل ز ن] لزن …"   → لزن
 * Drops the OpenITI page/OCR markers (ms####, PageVxxPyyy) that get spliced mid-token,
 * then joins the spaced letters. Returns the root (2–6 letters) or null. */
export function parseSpacedRoot(s) {
  const cleaned = (s || "").replace(/\bms\d+\b/g, " ").replace(/PageV\d+P\d+/g, " ");
  const m = /[([]\s*([ء-ي](?:\s+[ء-ي]){1,5})\s*[)\]]/.exec(cleaned);
  if (!m) return null;
  const r = m[1].replace(/\s+/g, "");
  return /^[ء-ي]{2,6}$/.test(r) ? r : null;
}

const PAGE_RE = /^#\s*PageV/;
const META_RE = /^#META#/;

/* ═══ Citation metadata (OpenITI) ═══
 *
 * OpenITI texts carry a `#META#` header block (edition: editor, publisher, year,
 * volumes…) and inline `# PageVxxPyyy` page milestones. These extract both so each
 * gloss can cite its edition + (approximate) volume/page. The page milestone marks
 * the END of a printed page, so an entry's page is taken as the FIRST milestone that
 * follows its header (the page its text sits on), falling back to the last seen.
 */
const META_LINE = /^#META#\s+([0-9]+\.\w+)\s*::\s*(.*)$/;
const BAD_META = new Set(["NODATA", "NOTGIVEN", "NOCODE", "NULL", ""]);
const PAGE_PARSE = /PageV(\d+)P(\d+)/;

/* { vol, page } from a `PageVxxPyyy` milestone line, or null. */
export function parsePageMarker(line) {
  const m = PAGE_PARSE.exec(line || "");
  return m ? { vol: +m[1], page: +m[2] } : null;
}

/* Edition/author fields from the `#META#` block, placeholders dropped. Returns only
 * the keys that have real values: { title, author, died, editor, publisher, year, vols }. */
export function parseLexMeta(text) {
  const meta = {};
  for (const line of (text || "").split("\n")) {
    if (/^#META#Header#End#/.test(line)) break;
    const m = META_LINE.exec(line);
    if (!m) continue;
    const v = m[2].trim();
    if (!BAD_META.has(v) && !meta[m[1]]) meta[m[1]] = v;
  }
  const pick = (suffix) => { for (const k in meta) if (k.endsWith(suffix)) return meta[k]; return null; };
  const out = {};
  const title = pick("BookTITLE"); if (title) out.title = title;
  const author = pick("AuthorAKA") || pick("AuthorNAME"); if (author) out.author = author;
  const died = pick("AuthorDIED"); if (died && /\d/.test(died)) out.died = died;
  const editor = pick("EdEDITOR"); if (editor) out.editor = editor;
  const publisher = pick("EdPUBLISHER"); if (publisher) out.publisher = publisher;
  const year = pick("EdYEAR"); if (year) out.year = year;
  const vols = pick("BookVOLS"); if (vols && /^\d+$/.test(vols)) out.vols = +vols;
  return out;
}

function cleanProse(s) {
  return s
    .replace(/\bms\d+\b/g, " ")
    .replace(/PageV\d+P\d+/g, " ")
    .replace(/[#~[\]{}]/g, " ") // OpenITI markup + OCR bracket artifacts
    .replace(/\s+/g, " ")
    .trim();
}

function capAtSentence(s, max) {
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  const lastDot = slice.lastIndexOf(".");
  return (lastDot > max * 0.5 ? slice.slice(0, lastDot + 1) : slice).trim();
}

/* ═══ Concise core-sense extraction ═══
 *
 * The old heuristic was `indexOf('.')` — "everything up to the first period". That
 * is unreliable for classical Arabic dictionary prose: OpenITI OCR scatters or omits
 * the ASCII period, and an Arabic clause is delimited by ؟ ؛ ، and the full stop ۔/.
 * as much as by '.'. A stray early dot (an abbreviation, a digit) then truncates the
 * gloss to nothing; a missing dot leaves the whole article as the "concise" sense.
 *
 * Instead: take the first STRONG clause boundary (. ۔ ؛ !) that falls in a sensible
 * window (not so early it's an abbreviation, not past `maxChars`); failing that the
 * first WEAK boundary (، ;); failing that a hard WORD cap so the result is never a
 * mid-word slice. Returns the trimmed core sense (never empty if `prose` is non-empty). */
const STRONG_BOUNDARY = /[.۔؛!]/g;
const WEAK_BOUNDARY = /[،;]/g;
export function conciseGloss(prose, { minChars = 10, maxChars = 240, maxWords = 28 } = {}) {
  const s = (prose || "").trim();
  if (!s) return s;
  const pick = (re) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s)) !== null) {
      if (m.index > maxChars) break;
      if (m.index >= minChars) return s.slice(0, m.index).trim();
    }
    return null;
  };
  const byBoundary = pick(STRONG_BOUNDARY) || pick(WEAK_BOUNDARY);
  if (byBoundary) return byBoundary;
  const words = s.split(/\s+/);
  return (words.length <= maxWords ? s : words.slice(0, maxWords).join(" ")).trim();
}

/* Turn the body lines of one Maqayis entry (the lines after a
 * `### | (root)` header, up to the next header) into { c, f, full }:
 *   c    = concise core sense (first sentence)
 *   f    = the full opening prose paragraph (cleaned, length-capped)
 *   full = the COMPLETE entry — every content/continuation line joined and
 *          cleaned, uncapped (the entire Maqāyīs al-Lugha article for the root).
 * Returns null if no usable prose is found. */
export function parseMaqayisEntry(lines, maxFull = 600) {
  let i = 0;
  const isContent = (l) => /^#\s*\S/.test(l) && !PAGE_RE.test(l) && !META_RE.test(l);
  while (i < lines.length && !isContent(lines[i])) i++;
  if (i >= lines.length) return null;

  const para = [lines[i]];
  let j = i + 1;
  while (j < lines.length && /^~~/.test(lines[j])) { para.push(lines[j]); j++; }

  const opening = cleanProse(para.join(" "));
  if (!opening) return null;
  const c = conciseGloss(opening);
  const f = capAtSentence(opening, maxFull);

  // The complete article: all content + continuation lines (skipping page /
  // metadata markers), in order.
  const body = lines.filter((l) => (/^#\s*\S/.test(l) || /^~~/.test(l)) && !PAGE_RE.test(l) && !META_RE.test(l));
  const full = cleanProse(body.join(" ")) || opening;

  return { c, f, full };
}

/* ═══ Generalised lexicon parser ═══
 *
 * Turns a whole OpenITI dictionary text into { headword → { c, f, full } } for any
 * of the supported layouts. Headwords are the dictionary's own root entries; the
 * build step aligns them onto the Qur'an's roots via matchRoot (same as Maqāyīs).
 *   - "maqayis":  `### | (root)` headers (handled by parseMaqayisEntry per entry).
 *   - "lisan":    a bare `# <root>` line opens an entry; body runs to the next one.
 *   - "mufradat": `# <root> : <definition>` opens an entry; `~~` lines continue it.
 */
const LEX_NOISE = /\bms\d+\b|PageV\d+P\d+|@[A-Z]+@|\^|@|%|\*|=|\(\s*\d+\s*\)/g;
function cleanLex(s) {
  return s.replace(LEX_NOISE, " ").replace(/[#~[\]{}|]/g, " ").replace(/\s+/g, " ").trim();
}
function pack(rootText, bodyLines, maxFull) {
  const full = cleanLex(bodyLines.join(" "));
  if (!full || full.length < 4) return null;
  const c = conciseGloss(full);
  const f = capAtSentence(full, maxFull);
  return { root: rootText, c, f, full };
}

export function parseLexiconText(text, format, maxFull = 600) {
  const lines = text.split("\n");
  const out = {};
  const add = (root, body, cite) => {
    const r = (root || "").replace(/[^ء-ي]/g, "");
    if (!/^[ء-ي]{2,6}$/.test(r) || out[r]) return;
    const e = pack(r, body, maxFull);
    if (e) { const o = { c: e.c, f: e.f, full: e.full }; if (cite) o.cite = cite; out[r] = o; }
  };
  let lastPage = null, entryPage = null; // entryPage: first milestone after the open header

  if (format === "mufradat") {
    const HEAD = /^#\s*([ء-ي]{2,6})\s*:\s*(.*)$/;
    let root = null, body = [];
    for (const line of lines) {
      const pg = parsePageMarker(line);
      if (pg) { lastPage = pg; if (root && entryPage == null) entryPage = pg; }
      const m = HEAD.exec(line);
      if (m) { add(root, body, entryPage || lastPage); root = m[1]; body = [m[2] || ""]; entryPage = null; }
      else if (root && /^~~/.test(line)) body.push(line);
      else if (root && /^#\s/.test(line) && !/PageV/.test(line)) body.push(line); // sub-point within entry
    }
    add(root, body, entryPage || lastPage);
  } else if (format === "lisan") {
    const HEAD = /^#\s*([ء-ي]{2,6})\s*$/; // a line that is only a root
    let root = null, body = [];
    for (const line of lines) {
      const pg = parsePageMarker(line);
      if (pg) { lastPage = pg; if (root && entryPage == null) entryPage = pg; }
      const m = HEAD.exec(line);
      if (m) { add(root, body, entryPage || lastPage); root = m[1]; body = []; entryPage = null; }
      else if (root && (/^~~/.test(line) || /^#\s/.test(line)) && !/PageV/.test(line)) body.push(line);
    }
    add(root, body, entryPage || lastPage);
  }
  return out;
}
