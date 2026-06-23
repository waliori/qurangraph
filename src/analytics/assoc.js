/* ═══ Pure association statistics — the single definition ═══
 *
 * The corpus-linguistic measures live here, in ONE place, so the runtime
 * analytics (src/analytics/stats.js) and the offline build scripts
 * (scripts/build-*.js) compute them identically instead of each
 * re-implementing the formulas. No imports: this file is safe to load in both
 * the browser bundle and Node.
 *
 * Every measure works on the standard 2×2 contingency table for a co-occurrence:
 *   k = joint count (both X and Y present)
 *   a = marginal of X, b = marginal of Y, N = total observations (verses).
 */

/* χ²(1 df) critical values → significance tiers for |G²|.
 *   3.84 → p<.05, 6.63 → p<.01, 10.83 → p<.001. */
export const SIG_CRIT = [3.84, 6.63, 10.83];

/* Significance tier 0..3 from an absolute log-likelihood value. */
export function sigTier(absLL) {
  const x = Math.abs(absLL || 0);
  if (x >= SIG_CRIT[2]) return 3;
  if (x >= SIG_CRIT[1]) return 2;
  if (x >= SIG_CRIT[0]) return 1;
  return 0;
}

/* Dunning's log-likelihood ratio G², SIGNED by attraction vs. avoidance
 * (negative when the pair co-occurs LESS than chance). Unlike PMI it does not
 * over-reward rare hapax pairs, which is why it is the significance score. */
export function g2(k, a, b, N) {
  if (!k || !a || !b || !N) return 0;
  const o11 = k, o12 = a - k, o21 = b - k, o22 = N - a - b + k;
  const e11 = (a * b) / N, e12 = (a * (N - b)) / N, e21 = ((N - a) * b) / N, e22 = ((N - a) * (N - b)) / N;
  const term = (o, e) => (o > 0 && e > 0 ? o * Math.log(o / e) : 0);
  let g = 2 * (term(o11, e11) + term(o12, e12) + term(o21, e21) + term(o22, e22));
  if (!Number.isFinite(g) || g < 0) g = 0;
  return o11 >= e11 ? g : -g; // sign by attraction vs. avoidance
}

/* Pointwise mutual information, log2( k·N / (a·b) ). Intuitive but unstable for
 * rare pairs (it inflates them) — pair it with logDice for ranking. */
export function pmi(k, a, b, N) {
  if (!k || !a || !b || !N) return 0;
  return Math.log2((k * N) / (a * b));
}

/* Log-Dice — the modern, frequency-STABLE collocation measure (Rychlý 2008):
 *   14 + log2( 2k / (a + b) ).
 * Independent of corpus size N, bounded above by 14, and (unlike PMI) not
 * dominated by hapax pairs — so it ranks "real" collocates sensibly. Returns 0
 * for a degenerate / zero-joint pair rather than −∞. */
export function logDice(k, a, b) {
  if (!k || !(a + b)) return 0;
  return 14 + Math.log2((2 * k) / (a + b));
}

/* The full association record for a co-occurrence: { pmi, ll, logdice, sig }.
 *   pmi     — pointwise mutual information (signed; >0 attracted)
 *   ll      — signed Dunning G² (significance + direction)
 *   logdice — frequency-stable collocation strength (0..14)
 *   sig     — significance tier 0..3 from |ll| (p<.05 / .01 / .001)
 * Degenerate inputs collapse to all-zero so callers never see NaN. */
export function association(k, a, b, N) {
  if (!k || !a || !b || !N) return { pmi: 0, ll: 0, logdice: 0, sig: 0 };
  const ll = g2(k, a, b, N);
  return { pmi: pmi(k, a, b, N), ll, logdice: logDice(k, a, b), sig: sigTier(ll) };
}
