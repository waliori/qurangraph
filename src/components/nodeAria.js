/* Shared, translated accessible label for a graph node — used by BOTH the SVG
 * (GraphLayer) and Canvas (GraphCanvas) renderers so screen-reader text never drifts
 * between them and honours the active UI language. The bare word/ref alone gave a
 * screen reader no type, frequency, relationship, or affordance, so each label is a
 * short descriptive sentence built from translated fragments. `t` is the i18n lookup. */
export function nodeAria(n, t) {
  if (n.type === "center") return t("common.aria.center", { label: n.label });
  if (n.type === "word") {
    let s = t("common.aria.word", { label: n.label, count: n.count });
    if (n.rootLabel) s += t("common.aria.wordRoot", { root: n.rootLabel });
    s += n.isExpanded ? t("common.aria.wordExpanded") : t("common.aria.wordCollapse");
    return s;
  }
  if (n.type === "verse") {
    let s = t("common.aria.verse", { label: n.label });
    if (n.connectingWord) s += t("common.aria.verseVia", { word: n.connectingWord });
    if (n.sharedCount > 1) s += t("common.aria.verseShares", { count: n.sharedCount });
    s += n.isExpanded ? t("common.aria.verseExpanded") : t("common.aria.verseSelect");
    return s;
  }
  if (n.type === "overflow") return t("common.aria.overflow", { count: n.count });
  return n.label;
}
