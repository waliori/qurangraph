/* ═══ Minimal-pair verse diff (المتشابهات: مواضع الاختلاف) ═══
 *
 * The phrase finder shows what near-identical verses SHARE; the study of mutashābihāt is
 * really about what they DON'T — the single word that turns ٱدْخُلُوا۟ (2:58) into ٱسْكُنُوا۟
 * (7:161), فَكُلُوا۟ into وَكُلُوا۟. This aligns two verses word-by-word (LCS over the matching
 * skeleton) and marks every same / inserted / deleted token, so the divergence is exact and
 * visible. Pure, text-only; display uses the original spelling, alignment uses w.norm.
 */

/* Align two word arrays by their skeleton via LCS. Returns an ordered op list:
 *   [{ type:"same", a, b } | { type:"del", a } | { type:"ins", b }]
 * (`del` = in A only, `ins` = in B only; a substitution shows as a del aligned with an ins).
 * `keyOf(word)` picks the comparison key (default w.norm). */
export function alignWords(a, b, keyOf) {
  const k = keyOf || ((w) => w.norm);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = k(a[i]) === k(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (k(a[i]) === k(b[j])) { ops.push({ type: "same", a: a[i], b: b[j] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: "del", a: a[i] }); i++; }
    else { ops.push({ type: "ins", b: b[j] }); j++; }
  }
  while (i < n) ops.push({ type: "del", a: a[i++] });
  while (j < m) ops.push({ type: "ins", b: b[j++] });
  return ops;
}

/* Word-level diff of two verses. Returns
 *   { ops, same, changed, ratio, identical }
 * where `same` = shared tokens, `changed` = inserted + deleted, `ratio` = same / max(len)
 * (1 = identical skeleton), `identical` = no differences. Returns null on a missing verse. */
export function verseDiff(vkA, vkB, verseData) {
  const A = verseData[vkA]?.words, B = verseData[vkB]?.words;
  if (!A || !B) return null;
  const ops = alignWords(A, B);
  let same = 0, changed = 0;
  for (const o of ops) { if (o.type === "same") same++; else changed++; }
  const ratio = (same * 2) / (A.length + B.length || 1);
  return { ops, same, changed, ratio, identical: changed === 0 };
}
