/* ═══ Themes & color scales ═══ */

export const THEMES = {
  dark: { bg: "#060a14", panel: "#0c1222", panelBorder: "#1a2744", text: "#e2e8f0", textDim: "#94a3b8", textFaint: "#475569", grid: "#1a274418", ayahText: "#f1f5f9", link: "#1a3060", linkCenter: "#2a4f8e", nodeFill: "44", nodeWordFill: "33" },
  light: { bg: "#f8fafc", panel: "#ffffff", panelBorder: "#e2e8f0", text: "#1e293b", textDim: "#64748b", textFaint: "#94a3b8", grid: "#cbd5e118", ayahText: "#1e293b", link: "#cbd5e1", linkCenter: "#93c5fd", nodeFill: "66", nodeWordFill: "55" },
};

/* Frequency colour: how many verses a word/root occurs in. */
export function fColor(c) {
  if (c <= 2) return "#ff6b6b";
  if (c <= 5) return "#ff922b";
  if (c <= 15) return "#fcc419";
  if (c <= 40) return "#51cf66";
  if (c <= 100) return "#339af0";
  return "#868e96";
}

/* Depth colour: distance (in hops) from the centre verse. */
const DC = ["#fbbf24", "#60a5fa", "#cc5de8", "#51cf66", "#ff922b", "#ff6b6b", "#e599f7", "#66d9e8", "#ffa94d", "#c0eb75"];
export function dColor(d) {
  return DC[Math.min(d, DC.length - 1)];
}
