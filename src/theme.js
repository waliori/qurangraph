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
