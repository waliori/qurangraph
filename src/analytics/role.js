import { morphAt } from "../morphology.js";
import { norm } from "../arabic-utils.js";

/* ═══ Syntactic-role proxy (الموقع التركيبي) ═══
 *
 * The jinn/ins debate turns on grammatical POSITION — "is جنّ ever the muḍāf (شياطين الجنّ)? the
 * object of خلق? the مستثنى?". The corpus we ship carries per-token CASE (gcase: nom/acc/gen) and
 * POS, but NOT a dependency treebank, so the exact governor ("object of THIS verb", "muḍāf ilayh of
 * THAT noun") cannot be read directly. This module gives the best HONEST approximation from case +
 * local adjacency, and is explicit that it is a heuristic, not a parse:
 *
 *   - مضاف إليه (genitive annexation): a genitive nominal directly after another nominal, with no
 *     preposition between — the classic إضافة. (A genitive right after a ḥarf jarr is مجرور بحرف, a
 *     different role, so we separate the two.)
 *   - مجرور بحرف (object of a preposition): a genitive right after a ḥarf jarr (بالله، من نار).
 *   - مفعول به (object): an accusative nominal, especially one preceded (within a couple of words)
 *     by a verb — the object-of-khalq case.
 *   - فاعل / مبتدأ / خبر (nominative): a nominative nominal (subject side).
 *   - منادى: any nominal in a يا/أيّها call.
 *   - معطوف: a nominal immediately after a و/ف/ثمّ/أو conjunction (إنسٌ ولا جانٌّ → جانّ is معطوف).
 *
 * `roleAt(M, verseData, vk, i)` returns { role, case, confidence } for one token; `roleBreakdown`
 * aggregates a whole occurrence list into a ranked tally — the "جانّ: 5× مرفوع في نفي، 2× …" view.
 * Pure (M + verseData injected). Returns role:"unknown" when morphology is absent.
 */

const CONJ = new Set(["و", "ف", "ثم", "او", "بل", "ام"]);          // عطف particles (skeletons)
const NIDA = new Set(["يا", "ايا", "ايها", "ايتها"]);              // vocative particles
// ḥarf jarr skeletons (norm) — both standalone (من، على) and the proclitic letters (ب، ل، ك).
const JARR = new Set(["من", "الى", "عن", "على", "في", "حتى", "منذ", "رب", "خلا", "عدا", "حاشا", "مذ", "كي", "واو"]);
const PROCLITIC_JARR = new Set(["ب", "ل", "ك"]);
const isNominal = (m) => m && (m.pos === "noun" || m.pos === "pn" || m.pos === "adj" || m.pos === "actpcpl" || m.pos === "passpcpl" || m.pos === "pron");

// Does the word at index j carry a cliticised ḥarf jarr at its head (بالله، لله)? Heuristic: a
// proclitic jarr letter leads a nominal whose remainder is not itself that letter's root.
function hasProcliticJarr(word) {
  const s = norm(word?.orig || word?.norm || "");
  return s.length > 1 && PROCLITIC_JARR.has(s[0]);
}

/* The role of the token at (vk, i). `confidence`: "high" when case + adjacency agree, "low" when
 * inferred from adjacency alone (no case) — surfaced so the reader weighs it. */
export function roleAt(M, verseData, vk, i) {
  const v = verseData[vk];
  const words = v?.words || [];
  const m = morphAt(M, vk, i);
  if (!m) return { role: "unknown", case: null, confidence: "none" };
  const prev = i > 0 ? words[i - 1] : null;
  const prevNorm = prev ? norm(prev.orig || prev.norm) : "";
  const prevM = i > 0 ? morphAt(M, vk, i - 1) : null;

  // منادى — a call particle just before (يا أيها الناس)
  if (NIDA.has(prevNorm)) return { role: "nida", case: m.gcase, confidence: "high" };
  // معطوف — directly after a conjunction, standalone (ثمّ، أو) or cliticised (وَلَا، فَـ…). A
  // particle token led by و/ف carries the عطف even when fused to the next حرف (إنسٌ وَلَا جانٌّ).
  const prevIsConj = CONJ.has(prevNorm) || (prevM?.pos === "particle" && (prevNorm[0] === "و" || prevNorm[0] === "ف"));
  if (prevIsConj && isNominal(m)) return { role: "atf", case: m.gcase, confidence: m.gcase ? "high" : "low" };

  if (m.gcase === "gen") {
    // genitive: مجرور بحرف if a ḥarف jarr governs it, else muḍāf ilayh (annexation)
    if (prevM?.pos === "particle" && JARR.has(prevNorm)) return { role: "jarr", case: "gen", confidence: "high" };
    if (hasProcliticJarr(words[i])) return { role: "jarr", case: "gen", confidence: "low" };
    if (prevM && isNominal(prevM)) return { role: "mudaf_ilayh", case: "gen", confidence: "high" };
    return { role: "jarr", case: "gen", confidence: "low" };
  }
  if (m.gcase === "acc") {
    // accusative: مفعول به (often after a verb within two words), else منصوب (حال/تمييز/خبر كان…)
    for (let j = Math.max(0, i - 2); j < i; j++) { const mm = morphAt(M, vk, j); if (mm?.pos === "verb") return { role: "object", case: "acc", confidence: "high" }; }
    return { role: "mansub", case: "acc", confidence: "low" };
  }
  if (m.gcase === "nom") return { role: "nom", case: "nom", confidence: "high" };
  if (m.pos === "verb") return { role: "verb", case: null, confidence: "high" };
  if (m.pos === "particle") return { role: "particle", case: null, confidence: "high" };
  return { role: "other", case: m.gcase, confidence: "low" };
}

/* Aggregate the role of `lookup` (mode-resolved positions) across an occurrence list into a ranked
 * tally. `positionsOf(vk) → [wordIdx…]` yields the token positions to score in each verse (so the
 * caller decides which occurrence of the term to read — usually all matching positions). Returns
 * { total, roles:[{ role, count, share, examples:[{vk,i}…] }] } sorted by count. */
export function roleBreakdown(M, verseData, keys, positionsOf) {
  const tally = new Map();
  let total = 0;
  for (const vk of keys || []) {
    for (const i of positionsOf(vk) || []) {
      const { role } = roleAt(M, verseData, vk, i);
      total++;
      if (!tally.has(role)) tally.set(role, { role, count: 0, examples: [] });
      const t = tally.get(role);
      t.count++;
      if (t.examples.length < 6) t.examples.push({ vk, i });
    }
  }
  const roles = [...tally.values()].map((t) => ({ ...t, share: total ? t.count / total : 0 })).sort((a, b) => b.count - a.count);
  return { total, roles };
}

// Display labels (Arabic primary, English fallback) for the role codes — kept here so both the
// per-row chip and the breakdown read from one source.
export const ROLE_AR = {
  mudaf_ilayh: "مضاف إليه", jarr: "مجرور بحرف", object: "مفعول به", mansub: "منصوب",
  nom: "مرفوع", nida: "منادى", atf: "معطوف", verb: "فعل", particle: "حرف", other: "غير ذلك", unknown: "—",
};
export const ROLE_EN = {
  mudaf_ilayh: "muḍāf ilayh (genitive annex.)", jarr: "obj. of preposition", object: "object (accusative)",
  mansub: "accusative (other)", nom: "nominative", nida: "vocative", atf: "conjoined (maʿṭūf)",
  verb: "verb", particle: "particle", other: "other", unknown: "—",
};
