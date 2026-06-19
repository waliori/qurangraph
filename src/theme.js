/* ═══ Themes & color scales ═══ */

/* These mirror the CSS design tokens in styles/theme.css so the SVG graph
   (whose colours are computed in JS, not CSS) stays in lock-step with the
   آيات.network chrome. Values are 6-digit hex because several call sites
   concat an alpha suffix (e.g. `T.panel + "ee"`). */
export const THEMES = {
  dark:  { bg: "#070a12", panel: "#0d1322", panelBorder: "#1d2740", text: "#f3f6fc", textDim: "#8d9bb5", textFaint: "#586a88", grid: "#7f9bd614", ayahText: "#f4f7fd", link: "#1b2c50", linkCenter: "#2d4a86", nodeFill: "44", nodeWordFill: "33" },
  light: { bg: "#e3d9bf", panel: "#fbf7ec", panelBorder: "#d6c9a8", text: "#2a2620", textDim: "#6f6757", textFaint: "#9a9077", grid: "#9c8c5e2e", ayahText: "#2a2620", link: "#cabd99", linkCenter: "#b8993f", nodeFill: "72", nodeWordFill: "5a" },
};

/* Accent tokens shared with the CSS layer — the jewel-tone language. */
export const ACCENT = { gold: "#fcd34d", goldDeep: "#f5b301", lapis: "#6aa8ff", viridian: "#34d8a8", rubric: "#fb7185" };

/* Frequency colour: how many verses a word/root occurs in (rare → common).
 * The jewel tones are tuned for the dark field; on the light parchment they wash
 * out (pale gold/teal on cream), so light mode uses a deeper, more saturated
 * variant of each bucket that keeps contrast for both the node and its label. */
const F_DARK  = ["#fb7185", "#fb923c", "#fcd34d", "#34d8a8", "#6aa8ff", "#8d9bb5"];
const F_LIGHT = ["#be123c", "#c2410c", "#b45309", "#0f766e", "#1d4ed8", "#475569"];
function fBucket(c) {
  if (c <= 2) return 0; if (c <= 5) return 1; if (c <= 15) return 2;
  if (c <= 40) return 3; if (c <= 100) return 4; return 5;
}
export function fColor(c, theme = "dark") {
  return (theme === "light" ? F_LIGHT : F_DARK)[fBucket(c)];
}

/* Depth colour: distance (in hops) from the centre verse — a jewel rotation. */
const DC_DARK  = ["#fcd34d", "#6aa8ff", "#fb7185", "#34d8a8", "#fb923c", "#a78bfa", "#f0abfc", "#67e8f9", "#fbbf24", "#86efac"];
const DC_LIGHT = ["#b45309", "#1d4ed8", "#be123c", "#0f766e", "#c2410c", "#6d28d9", "#a21caf", "#0e7490", "#a16207", "#15803d"];
export function dColor(d, theme = "dark") {
  const DC = theme === "light" ? DC_LIGHT : DC_DARK;
  return DC[Math.min(d, DC.length - 1)];
}

/* ═══ Edge rarity ═══
 *
 * A verse-to-verse link is stronger Qur'an-internal signal the RARER the word it
 * runs through: two āyāt sharing a hapax say far more than two sharing اللّٰه. The
 * connecting word's `count` (verses it occurs in) → a weight in ~(0.1, 0.63] via
 * 1/log2(count+2); these scales render that weight as colour + stroke width, on a
 * deliberately different ramp from fColor so it reads as "signal strength", not
 * frequency. Higher weight = rarer = brighter & thicker. */
export function rarityWeight(count) { return 1 / Math.log2((count || 1) + 2); }
const E_DARK = ["#3a4a6a", "#6aa8ff", "#34d8a8", "#fcd34d"]; // common → rare (faint → bright)
const E_LIGHT = ["#b8ac8a", "#1d4ed8", "#0f766e", "#b45309"];
function eBucket(w) { if (w < 0.18) return 0; if (w < 0.28) return 1; if (w < 0.45) return 2; return 3; }
export function eColor(weight, theme = "dark") { return (theme === "light" ? E_LIGHT : E_DARK)[eBucket(weight || 0)]; }
export function eWidth(weight) { return 0.5 + Math.min(1, (weight || 0) * 1.6) * 2; }

/* Non-colour rarity cue (colour-blind safe). Rarity is otherwise read from hue (eColor)
 * + width (eWidth); for users who can't separate the hues, a stroke TEXTURE gives a
 * redundant channel. The common bulk stays solid (so the dense default view is
 * unchanged), and the two high-signal tiers get distinct dashes so the rarest — most
 * meaningful — links stand out by pattern as well as colour. `eDash` → an SVG
 * `stroke-dasharray` string ("" = solid); `eDashArr` → the canvas number[] form. */
const E_DASH = ["", "", "10,4", "4,3"]; // common → rare: solid · solid · long-dash · short-dash
export function eDash(weight) { return E_DASH[eBucket(weight || 0)]; }
export function eDashArr(weight) { const d = eDash(weight); return d ? d.split(",").map(Number) : []; }
