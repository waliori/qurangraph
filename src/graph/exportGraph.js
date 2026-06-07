/* ═══ Export (SVG / PNG / CSV) ═══
 *
 * Serialises the LIVE graph SVG (positions already written to the DOM by the
 * imperative renderer) into a framed standalone SVG, rasterises it to PNG via a
 * data: image + canvas (CSP already allows img-src data:), and writes occurrence /
 * distribution tables to CSV. Native Blob + anchor download only — no libraries.
 */

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Clone the stage <svg>, drop the pan/zoom transform on its inner <g> so content
 * sits in world coords, and frame it to `bbox` via width/height + viewBox. Returns
 * an XML string. `bg` paints a solid backdrop so the PNG isn't transparent. */
export function serializeSvg(svgEl, { bbox, bg = "#070a12" }) {
  const clone = svgEl.cloneNode(true);
  const g = clone.querySelector("g");
  if (g) g.removeAttribute("transform");
  clone.setAttribute("width", Math.round(bbox.w));
  clone.setAttribute("height", Math.round(bbox.h));
  clone.setAttribute("viewBox", `${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", bbox.x); rect.setAttribute("y", bbox.y);
  rect.setAttribute("width", bbox.w); rect.setAttribute("height", bbox.h);
  rect.setAttribute("fill", bg);
  clone.insertBefore(rect, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

export function exportSvgFile(svgString, name = "qurangraph.svg") {
  download(new Blob([svgString], { type: "image/svg+xml;charset=utf-8" }), name);
}

/* Rasterise an SVG string to a PNG at `scale`× device resolution. */
export function exportPngFile(svgString, { name = "qurangraph.png", scale = 2, bbox } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svg64 = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgString)));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bbox.w * scale);
      canvas.height = Math.round(bbox.h * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => { if (blob) { download(blob, name); resolve(); } else reject(new Error("toBlob failed")); }, "image/png");
    };
    img.onerror = () => reject(new Error("SVG image load failed"));
    img.src = svg64;
  });
}

/* rows = array of arrays (first row = headers). Quotes/commas escaped; UTF-8 BOM
 * so Excel renders Arabic correctly. */
export function toCsv(rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((row) => row.map(esc).join(",")).join("\r\n");
}

export function exportCsvFile(rows, name = "qurangraph.csv") {
  download(new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" }), name);
}

/* Pretty-printed JSON download — for re-analysis in a researcher's own tooling,
 * where CSV's flat tables lose the nested structure (metadata + arrays of records). */
export function exportJsonFile(obj, name = "qurangraph.json") {
  download(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" }), name);
}

/* Build a KWIC (keyword-in-context) concordance: every occurrence of a term, with
 * the `window` words on each side, the keyword centred. `verses` is a list of verse
 * keys, `words` resolves a verse key to its word objects, and `isHit(word)` says
 * whether a word IS the term (already mode-aware at the call site). One row per
 * occurrence (a verse with the term twice yields two rows), so frequency-by-context
 * studies line up. Returns rows ready for toCsv()/exportCsvFile (with a header). */
export function buildConcordance(verses, words, isHit, meta, window = 5) {
  const rows = [["السورة", "الآية", "المرجع", "قبل", "الكلمة", "بعد"]];
  for (const vk of verses) {
    const ws = words(vk);
    if (!ws) continue;
    ws.forEach((w, i) => {
      if (!isHit(w)) return;
      const left = ws.slice(Math.max(0, i - window), i).map((x) => x.orig).join(" ");
      const right = ws.slice(i + 1, i + 1 + window).map((x) => x.orig).join(" ");
      const m = meta(vk);
      rows.push([m.s, m.a, m.ref, left, w.orig, right]);
    });
  }
  return rows;
}
