/* ═══ Themes & color scales ═══ */

/* These mirror the CSS design tokens in styles/theme.css so the SVG graph
   (whose colours are computed in JS, not CSS) stays in lock-step with the
   آيات.network chrome. Values are 6-digit hex because several call sites
   concat an alpha suffix (e.g. `T.panel + "ee"`). */
export const THEMES = {
  dark:  { bg: "#070a12", panel: "#0d1322", panelBorder: "#1d2740", text: "#f3f6fc", textDim: "#8d9bb5", textFaint: "#586a88", grid: "#7f9bd614", ayahText: "#f4f7fd", link: "#1b2c50", linkCenter: "#2d4a86", nodeFill: "44", nodeWordFill: "33" },
  light: { bg: "#f5f1e6", panel: "#fffdf6", panelBorder: "#e3dac4", text: "#2a2620", textDim: "#6f6757", textFaint: "#9a9077", grid: "#b7a98322", ayahText: "#2a2620", link: "#ded3b8", linkCenter: "#c7ad6f", nodeFill: "55", nodeWordFill: "44" },
};

/* Accent tokens shared with the CSS layer — the jewel-tone language. */
export const ACCENT = { gold: "#fcd34d", goldDeep: "#f5b301", lapis: "#6aa8ff", viridian: "#34d8a8", rubric: "#fb7185" };

/* Frequency colour: how many verses a word/root occurs in (rare → common). */
export function fColor(c) {
  if (c <= 2) return "#fb7185";   // rubric — rare
  if (c <= 5) return "#fb923c";   // amber
  if (c <= 15) return "#fcd34d";  // gold
  if (c <= 40) return "#34d8a8";  // viridian
  if (c <= 100) return "#6aa8ff"; // lapis
  return "#8d9bb5";               // muted — ubiquitous
}

/* Depth colour: distance (in hops) from the centre verse — a jewel rotation. */
const DC = ["#fcd34d", "#6aa8ff", "#fb7185", "#34d8a8", "#fb923c", "#a78bfa", "#f0abfc", "#67e8f9", "#fbbf24", "#86efac"];
export function dColor(d) {
  return DC[Math.min(d, DC.length - 1)];
}
