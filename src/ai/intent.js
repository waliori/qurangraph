/* ═══ Lookup-intent detection ═══
 *
 * Some questions are pure index lookups — "show me every verse this word occurs in", "كل
 * الآيات" — and routing those through a 1.5B model is strictly worse: it picks the wrong tool
 * or feeds an inflected surface form the index can't key on (we saw both). When the user has a
 * word selected and asks one of these, answer DETERMINISTICALLY via the same app action the
 * "↗ All verses" / "↗ Distribution" buttons use, bypassing the model entirely.
 *
 * Returns "verses" | "distribution" | null. Conservative by design: it only fires on
 * unambiguous list/occurrence/distribution phrasings so normal questions still reach the model.
 */

const VERSES = [
  /\b(all|every|each)\b.*\bverse/i,
  /\bverses?\b.*\b(occur|appear|contain|found|where)/i,
  /\b(occurrences?|where .*\b(occur|appear|used))/i,
  /\blist\b.*\bverses?/i,
  /كل\s*الآيات/, /جميع\s*الآيات/, /كلّ\s*الآيات/,
  /(أين|اين)\s*(ترد|تَرِد|وردت|يرد)/, /مواضع/, /المواضع/,
];
const DISTRIBUTION = [
  /\bdistribution\b/i, /\bcollocat/i, /\b(co-?occurrence|companions?)\b/i,
  /توزيع/, /(يصاحب|تصاحب|مصاحب|المصاحبة|الجوار)/,
];

export function detectLookupIntent(question) {
  const q = String(question || "").trim();
  if (!q) return null;
  if (DISTRIBUTION.some((re) => re.test(q))) return "distribution";
  if (VERSES.some((re) => re.test(q))) return "verses";
  return null;
}
