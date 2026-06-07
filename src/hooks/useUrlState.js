/* ═══ Shareable URL state ═══
 *
 * Encodes the whole app state into the URL hash so a graph can be deep-linked and
 * shared. encodeState/decodeState are PURE (and round-trip stable: Sets are sorted)
 * so they're trivially testable; the hook wires them to history with debounced,
 * pan-friendly writes (replaceState, no history spam).
 *
 * Shape is a compact object with short keys; only non-default fields are emitted so
 * a fresh graph yields a short URL.
 */

const r = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

export function encodeState(s) {
  const o = {};
  if (s.surah) o.s = s.surah;
  if (s.ayah) o.a = s.ayah;
  if (s.mode && s.mode !== "exact") o.m = s.mode;
  if (s.precision && s.precision !== "loose") o.p = s.precision;
  if (s.activeLexicon && s.activeLexicon !== "maqayis") o.lx = s.activeLexicon;
  if (s.theme && s.theme !== "dark") o.th = s.theme;
  if (s.maxBranch && s.maxBranch !== 10) o.b = s.maxBranch;
  if (s.hideStop === false) o.hs = 0;
  if (s.showLoops === false) o.sl = 0;
  if (s.rareOnly) o.ro = 1;
  // expandedWords/expandedVerses arrive as Sets (no .length!) — spread first so the
  // expansion state is actually captured. stopExtra/stopDisabled may be arrays or Sets.
  const arr = (v) => (v ? [...v] : []);
  const ew = arr(s.expandedWords); if (ew.length) o.ew = ew.sort();
  const ev = arr(s.expandedVerses); if (ev.length) o.ev = ev.sort();
  if (s.selected) o.sel = s.selected;
  if (s.transform) o.t = [r(s.transform.x), r(s.transform.y), r(s.transform.k, 3)];
  if (s.morphFilter && (s.morphFilter.pos?.length || s.morphFilter.form?.length || s.morphFilter.aspect?.length || s.morphFilter.voice?.length)) o.mf = s.morphFilter;
  const sx = arr(s.stopExtra); if (sx.length) o.sx = sx.sort();
  const sd = arr(s.stopDisabled); if (sd.length) o.sd = sd.sort();
  // Node positions (flat [x0,y0,x1,y1,…] in sorted-node-id order) so a shared graph
  // reproduces the exact arrangement, not just which nodes are expanded.
  if (Array.isArray(s.pos) && s.pos.length) o.pp = s.pos;
  return encodeURIComponent(JSON.stringify(o));
}

export function decodeState(str) {
  if (!str) return null;
  let o;
  try { o = JSON.parse(decodeURIComponent(str.replace(/^#/, "").replace(/^s=/, ""))); } catch { return null; }
  if (!o || typeof o !== "object") return null;
  const out = {};
  if (o.s) out.surah = o.s;
  if (o.a) out.ayah = o.a;
  out.mode = o.m || "exact";
  out.precision = o.p || "loose";
  // theme + activeLexicon are PERSONAL viewing prefs, not part of the shared graph.
  // Leave them undefined when absent so opening someone's link can't flip your theme
  // or active dictionary — applyState only sets them when the link explicitly carries
  // a non-default value. Everything else below defines the graph and is reproduced.
  if (o.lx !== undefined) out.activeLexicon = o.lx;
  if (o.th !== undefined) out.theme = o.th;
  out.maxBranch = o.b || 10;
  out.hideStop = o.hs !== 0;
  out.showLoops = o.sl !== 0;
  out.rareOnly = o.ro === 1;
  out.expandedWords = Array.isArray(o.ew) ? o.ew : [];
  out.expandedVerses = Array.isArray(o.ev) ? o.ev : [];
  out.selected = o.sel || null;
  out.transform = Array.isArray(o.t) ? { x: o.t[0], y: o.t[1], k: o.t[2] } : null;
  out.morphFilter = o.mf && typeof o.mf === "object" ? o.mf : null;
  out.stopExtra = Array.isArray(o.sx) ? o.sx : [];
  out.stopDisabled = Array.isArray(o.sd) ? o.sd : [];
  out.pos = Array.isArray(o.pp) ? o.pp : null;
  return out;
}

/* Read the current state from the URL hash once (e.g. on mount). */
export function readUrlState() {
  if (typeof location === "undefined") return null;
  return decodeState(location.hash);
}

/* Write state to the URL hash (debounced via rAF; replaceState so pan/zoom don't
 * spam history). Returns the full href for copy-to-clipboard. */
export function writeUrlState(s) {
  if (typeof location === "undefined") return "";
  const hash = "#s=" + encodeState(s);
  history.replaceState(null, "", location.pathname + location.search + hash);
  return location.href;
}
