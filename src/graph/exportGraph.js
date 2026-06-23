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

/* The corpus build version (sources.json `builtAt`), set once at app start so every
 * reproducible export records WHICH corpus snapshot it was computed against. */
let _corpusVersion = null;
export function setExportCorpusVersion(v) { _corpusVersion = v || null; }

/* ═══ Reproducible analysis export ═══
 *
 * Wraps a result in a self-describing envelope so a researcher can cite not just the
 * numbers but HOW they were produced — the metric + its parameters (window, thresholds,
 * sort) and the corpus snapshot. `meta` = { method, params, ...extra }; `data` is the
 * raw result. Schema-tagged for forward compatibility. */
export function exportBundle({ method, params, data, ...extra }, name = "qurangraph-analysis.json") {
  const bundle = {
    schema: "ayatnet-export-v1",
    exportedAt: new Date().toISOString(),
    corpus: _corpusVersion || undefined,
    method: method || undefined,
    params: params || undefined,
    ...extra,
    data,
  };
  download(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json;charset=utf-8" }), name);
}

/* Plain-text download (BibTeX / RIS citation files). */
export function exportTextFile(text, name, mime = "text/plain;charset=utf-8") {
  download(new Blob([text], { type: mime }), name);
}

/* ═══ Citation export (BibTeX / RIS) ═══
 *
 * A lexicon gloss already carries its provenance — the dictionary edition (author,
 * title, editor, publisher, year) and the (approximate) volume/page from the OpenITI
 * pagination markers — so a researcher can cite the exact entry. These turn that into
 * the two formats reference managers read. `info`:
 *   { root, lexLabel, edition:{ title, author, died, editor, publisher, year } | null,
 *     cite:{ vol, page } | null }
 * Missing fields are simply omitted. The "s.v. (sub verbo) ROOT" note pins the entry. */
function citeKey(info) {
  const lex = (info.lexLabel || "lexicon").toString().toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16) || "lex";
  const root = (info.root || "root").replace(/[^A-Za-z؀-ۿ]/g, "");
  const yr = info.edition?.year ? String(info.edition.year).replace(/[^0-9]/g, "") : "";
  return `${lex}_${root}${yr}`;
}
function sv(info) {
  const bits = [`s.v. ${info.root}`];
  if (info.cite?.vol != null) bits.push(`vol. ${info.cite.vol}`);
  if (info.cite?.page != null) bits.push(`p. ${info.cite.page}`);
  return bits.join(", ");
}
export function buildBibtex(info) {
  const ed = info.edition || {};
  const title = ed.title || info.lexLabel || "";
  const fields = [];
  if (ed.author) fields.push(["author", ed.died ? `${ed.author} (d. ${ed.died})` : ed.author]);
  if (title) fields.push(["title", title]);
  if (ed.editor) fields.push(["editor", ed.editor]);
  if (ed.publisher) fields.push(["publisher", ed.publisher]);
  if (ed.year) fields.push(["year", String(ed.year)]);
  if (info.cite?.vol != null) fields.push(["volume", String(info.cite.vol)]);
  if (info.cite?.page != null) fields.push(["pages", String(info.cite.page)]);
  fields.push(["note", sv(info)]);
  const body = fields.map(([k, v]) => `  ${k} = {${String(v).replace(/[{}]/g, "")}}`).join(",\n");
  return `@book{${citeKey(info)},\n${body}\n}\n`;
}
export function buildRis(info) {
  const ed = info.edition || {};
  const lines = ["TY  - BOOK"];
  if (ed.author) lines.push(`AU  - ${ed.author}`);
  if (ed.title || info.lexLabel) lines.push(`TI  - ${ed.title || info.lexLabel}`);
  if (ed.editor) lines.push(`A2  - ${ed.editor}`);
  if (ed.publisher) lines.push(`PB  - ${ed.publisher}`);
  if (ed.year) lines.push(`PY  - ${String(ed.year).replace(/[^0-9]/g, "")}`);
  if (info.cite?.vol != null) lines.push(`VL  - ${info.cite.vol}`);
  if (info.cite?.page != null) lines.push(`SP  - ${info.cite.page}`);
  if (info.root) lines.push(`KW  - ${info.root}`);
  lines.push(`N1  - ${sv(info)}`);
  lines.push("ER  - ");
  return lines.join("\r\n") + "\r\n";
}

/* ═══ Result citation (BibTeX / RIS) ═══
 *
 * Unlike the lexicon citation above (which cites a printed dictionary entry), this cites
 * an ANALYSIS RESULT produced by the tool — an occurrence list, a distribution, a
 * comparison — so a paper can reference the exact query, corpus and result, not just a
 * screenshot. `info`: { key, title, note, url, year, keywords:[] }. The corporate author
 * is the tool; the deep-link URL pins the reproducible view. Title/note are pre-translated
 * at the call site. */
const escBib = (s) => String(s).replace(/[{}]/g, "");
export function buildResultBibtex(info) {
  const fields = [["author", "{آيات.network (QuranGraph)}"]]; // double-braced: corporate author
  if (info.title) fields.push(["title", escBib(info.title)]);
  if (info.note) fields.push(["note", escBib(info.note)]);
  if (info.url) fields.push(["howpublished", `\\url{${info.url}}`]);
  if (info.year) fields.push(["year", String(info.year)]);
  const body = fields.map(([k, v]) => `  ${k} = {${v}}`).join(",\n");
  return `@misc{${info.key || "ayatnet_result"},\n${body}\n}\n`;
}
export function buildResultRis(info) {
  const lines = ["TY  - DATA", "AU  - آيات.network (QuranGraph)"];
  if (info.title) lines.push(`TI  - ${info.title}`);
  if (info.note) lines.push(`N1  - ${info.note}`);
  if (info.url) lines.push(`UR  - ${info.url}`);
  if (info.year) lines.push(`PY  - ${String(info.year)}`);
  (info.keywords || []).filter(Boolean).forEach((k) => lines.push(`KW  - ${k}`));
  lines.push("ER  - ");
  return lines.join("\r\n") + "\r\n";
}

/* Build a KWIC (keyword-in-context) concordance: every occurrence of a term, with
 * the `window` words on each side, the keyword centred. `verses` is a list of verse
 * keys, `words` resolves a verse key to its word objects, and `isHit(word)` says
 * whether a word IS the term (already mode-aware at the call site). One row per
 * occurrence (a verse with the term twice yields two rows), so frequency-by-context
 * studies line up. `headers` is the (translated) header row; it defaults to Arabic for
 * back-compat. Returns rows ready for toCsv()/exportCsvFile (with a header). */
export function buildConcordance(verses, words, isHit, meta, window = 5,
  headers = ["السورة", "الآية", "المرجع", "قبل", "الكلمة", "بعد"]) {
  const rows = [headers];
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
