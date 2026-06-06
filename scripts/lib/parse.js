/* Pure, testable parsing helpers for the root/meaning build pipeline. */

/* Extract the ROOT value from a morphology FEATURES field, or null. */
export function parseMorphologyRoot(features) {
  const m = /(?:^|\|)ROOT:([^|]+)/.exec(features);
  return m ? m[1] : null;
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
 * distinct strong roots like قول vs قيل. */
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

const PAGE_RE = /^#\s*PageV/;
const META_RE = /^#META#/;

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

/* Turn the body lines of one Maqayis entry (the lines after a
 * `### | (root)` header, up to the next header) into { c, f }:
 *   c = concise core sense (first sentence)
 *   f = the full opening prose paragraph (cleaned, length-capped)
 * Returns null if no usable prose is found. */
export function parseMaqayisEntry(lines, maxFull = 600) {
  let i = 0;
  const isContent = (l) => /^#\s*\S/.test(l) && !PAGE_RE.test(l) && !META_RE.test(l);
  while (i < lines.length && !isContent(lines[i])) i++;
  if (i >= lines.length) return null;

  const para = [lines[i]];
  let j = i + 1;
  while (j < lines.length && /^~~/.test(lines[j])) { para.push(lines[j]); j++; }

  const full = cleanProse(para.join(" "));
  if (!full) return null;
  const dot = full.indexOf(".");
  const c = dot > 0 ? full.slice(0, dot).trim() : full;
  const f = capAtSentence(full, maxFull);
  return { c, f };
}
