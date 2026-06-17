/* ═══ Context serializers ═══
 *
 * Turn the structured objects a researcher gathers in the app — a selected word (with its
 * per-occurrence morphology), a verse, the current graph, a lexicon article, or a saved
 * workspace item — into compact, token-bounded plain text for the local model's prompt.
 *
 * Every serializer is pure (data in, string out) and aggressively capped: analytics lists
 * are truncated to top-N, verse-reference lists are bounded, and `assembleContext` enforces
 * a whole-block character budget so a 1–3B model isn't drowned. The app's own shapes are
 * reused verbatim (see useWorkspace item payloads, morphAt/decodeMorph records, buildGraph
 * node fields), so this layer just formats — it doesn't recompute anything.
 */

import { formRoman } from "../morphology.js";

const MAX_REFS = 25; // cap any verse-reference list
const MAX_ROWS = 20; // cap any analytics row list

// Join a capped list of "s:a" refs, noting the overflow.
function refList(refs, max = MAX_REFS) {
  const arr = Array.isArray(refs) ? refs : [];
  if (arr.length <= max) return arr.join("، ");
  return arr.slice(0, max).join("، ") + ` … (+${arr.length - max})`;
}

// One compact line from a decoded morphology record (decodeMorph / morphAt shape).
export function morphLine(m) {
  if (!m) return "";
  const bits = [];
  if (m.pos) bits.push(`pos=${m.pos}`);
  if (m.root) bits.push(`root=${m.root}`);
  if (m.lemma) bits.push(`lemma=${m.lemma}`);
  if (m.vf) bits.push(`form=${formRoman(m.vf)}`);
  if (m.aspect) bits.push(`aspect=${m.aspect}`);
  if (m.voice) bits.push(`voice=${m.voice}`);
  if (m.mood) bits.push(`mood=${m.mood}`);
  if (m.person) bits.push(`person=${m.person}`);
  if (m.gender) bits.push(`gender=${m.gender}`);
  if (m.number) bits.push(`number=${m.number}`);
  if (m.gcase) bits.push(`case=${m.gcase}`);
  if (m.precise === false) bits.push("(uncertain)");
  return bits.join(" ");
}

// A selected word node + its occurrence morphology + the verse it sits in.
// d = { label, lookup, mode, root, lemma, count, verseRef, verseText, morph }
export function serializeWord(d) {
  const lines = [`WORD: ${d.label || d.lookup || ""}`];
  if (d.lookup && d.lookup !== d.label) lines.push(`grouping key (${d.mode || "exact"}): ${d.lookup}`);
  if (d.root) lines.push(`root: ${d.root}`);
  if (d.lemma) lines.push(`lemma (صيغة): ${d.lemma}`);
  if (typeof d.count === "number") lines.push(`occurs in ${d.count} verse(s)`);
  const ml = morphLine(d.morph);
  if (ml) lines.push(`morphology @ ${d.verseRef || "?"}: ${ml}`);
  if (d.verseRef && d.verseText) lines.push(`verse ${d.verseRef}: ${d.verseText}`);
  return lines.join("\n");
}

// A verse. d = { ref, surahName, text, roots? }
export function serializeVerse(d) {
  const lines = [`VERSE ${d.ref}${d.surahName ? ` (${d.surahName})` : ""}:`, d.text || ""];
  if (Array.isArray(d.roots) && d.roots.length) lines.push(`roots: ${d.roots.join("، ")}`);
  return lines.join("\n");
}

// The current graph view. d = { centerRef, surahName, centerText, mode, expanded:[{label,count,verses}], omitted }
export function serializeGraph(d) {
  const lines = [`GRAPH centred on ${d.centerRef}${d.surahName ? ` (${d.surahName})` : ""}, grouping = ${d.mode || "exact"}`];
  if (d.centerText) lines.push(`centre verse: ${d.centerText}`);
  const exp = Array.isArray(d.expanded) ? d.expanded : [];
  if (exp.length) {
    lines.push(`expanded words (${exp.length}):`);
    for (const w of exp.slice(0, MAX_ROWS)) {
      lines.push(`  • ${w.label}${typeof w.count === "number" ? ` ×${w.count}` : ""}${w.verses?.length ? ` → ${refList(w.verses, 12)}` : ""}`);
    }
    if (exp.length > MAX_ROWS) lines.push(`  … (+${exp.length - MAX_ROWS} more)`);
  } else {
    lines.push("no words expanded yet (only the centre verse is shown)");
  }
  if (d.omitted) lines.push(`(${d.omitted} link(s) omitted by the current filters)`);
  return lines.join("\n");
}

// A lexicon article. d = { root, lexLabel, concise, full, cite }
export function serializeLexicon(d) {
  const lines = [`LEXICON «${d.lexLabel || ""}» — root ${d.root}:`];
  const text = (d.full && d.full.trim()) || d.concise || "";
  if (text) lines.push(text);
  if (d.cite && (d.cite.vol || d.cite.page)) lines.push(`(citation: vol ${d.cite.vol ?? "?"}, p. ${d.cite.page ?? "?"})`);
  return lines.join("\n");
}

// A saved workspace item (useWorkspace item shapes). `verseData` lets verse/occ items
// carry their actual text. Falls back to a reference-only summary for the rest.
export function serializeWsItem(item, { verseData } = {}) {
  const p = item?.payload || {};
  const head = `SAVED (${item.type})${item.title ? ` "${item.title}"` : ""}`;
  switch (item.type) {
    case "verse": {
      const vk = `${p.surah}:${p.ayah}`;
      const v = verseData?.[vk];
      return `${head}: ${p.label || vk}${v ? `\n${vk}: ${v.text}` : ""}`;
    }
    case "occ":
      return `${head}: occurrences of «${p.label || p.lookup}» (${p.mode}) in ${refList(p.keys)}`;
    case "dist":
      return `${head}: distribution/collocation of «${p.label || p.lookup}» (${p.mode})`;
    case "compare":
      return `${head}: compare «${p.A?.label}» (${p.A?.mode}) vs «${p.B?.label}» (${p.B?.mode})`;
    case "lexicon":
      return `${head}: «${p.lexicon}» on root ${p.root}${p.gloss ? ` — ${p.gloss}` : ""}`;
    case "word":
      return `${head}: word «${p.label || p.lookup}» (${p.mode})`;
    case "phrase":
      return `${head}: shared phrase «${p.text || p.norm || ""}»${p.verses?.length ? ` in ${refList(p.verses)}` : ""}`;
    case "graph":
      return `${head}: graph of ${p.surah}:${p.ayah} (${p.mode}, ${p.expandedWords?.length || 0} words expanded)`;
    default:
      return `${head}`;
  }
}

// A RAG retrieval bundle (retrieve.js output) → compact grounded block. Leads with the
// matched/related roots so the model knows WHY these verses are here, then the ranked
// verses with their evidence tags. This is the auto-retrieved counterpart to the items the
// user hand-attaches; it travels through assembleContext under the same char budget.
export function serializeRetrieved(r) {
  if (!r || (!r.verses?.length && !r.matched?.length)) return "";
  const lines = ["RETRIEVED (auto, from your question):"];
  if (r.matched?.length) {
    lines.push("matched: " + r.matched.map((m) => m.root ? `${m.norm}→${m.root}` : m.norm).join("، "));
  }
  if (r.related?.length) {
    lines.push("related roots (meaning-by-context): " + r.related.map((x) => `${x.root}≈${x.via}`).join("، "));
  }
  if (r.opposites?.length) {
    lines.push("opposites (طباق): " + r.opposites.map((x) => `${x.root}↔${x.other}`).join("، "));
  }
  if (r.verses?.length) {
    lines.push(`top verses (${r.verses.length}):`);
    for (const v of r.verses) {
      const why = v.reasons?.length ? ` [${v.reasons.slice(0, 3).join(", ")}]` : "";
      lines.push(`  • ${v.ref}: ${v.text}${why}`);
    }
  }
  return lines.join("\n");
}

// Generic analytics table → capped rows. rows: [{...}], pick the salient fields by kind.
export function serializeRows(title, rows, fmt, max = MAX_ROWS) {
  const arr = Array.isArray(rows) ? rows : [];
  const lines = [title + ":"];
  for (const r of arr.slice(0, max)) lines.push("  • " + fmt(r));
  if (arr.length > max) lines.push(`  … (+${arr.length - max} more)`);
  return lines.join("\n");
}

/* Render an arbitrary computed object (a modal's analytics: derivations, keyness, collocations,
 * similar verses, …) into compact, readable, token-bounded text. This is what lets a dialogue
 * hand the AI its REAL content — not just a label — so the user can ask it to explain/compare/
 * summarise that analysis. Arrays are capped (with a "+N" note); flat objects/arrays collapse to
 * one line; null/empty fields are dropped; the whole thing is capped to maxChars. */
export function compactObject(value, { maxArray = 12, maxChars = 1800 } = {}) {
  const out = [];
  const isScalar = (x) => x == null || (typeof x !== "object");
  const flatLine = (o) => {
    if (Array.isArray(o)) return o.map((x) => (isScalar(x) ? x : "")).filter((x) => x !== "").join(" · ");
    return Object.entries(o).filter(([, x]) => isScalar(x) && x != null && x !== "").map(([k, x]) => `${k}=${x}`).join(", ");
  };
  const allScalar = (o) => (Array.isArray(o) ? o.every(isScalar) : Object.values(o).every(isScalar));
  const render = (v, key, depth) => {
    const pad = "  ".repeat(depth);
    const label = key != null ? `${key}: ` : "";
    if (v == null) return;
    if (isScalar(v)) { const s = String(v).trim(); if (s) out.push(`${pad}${label}${s}`); return; }
    if (Array.isArray(v)) {
      if (!v.length) return;
      out.push(`${pad}${label}(${v.length})`);
      for (const item of v.slice(0, maxArray)) {
        if (isScalar(item)) out.push(`${pad}  • ${item}`);
        else if (allScalar(item)) out.push(`${pad}  • ${flatLine(item)}`);
        else render(item, null, depth + 1);
      }
      if (v.length > maxArray) out.push(`${pad}  … (+${v.length - maxArray})`);
      return;
    }
    // plain object
    if (allScalar(v)) { const fl = flatLine(v); if (fl) out.push(`${pad}${label}${fl}`); return; }
    if (label) out.push(`${pad}${label.trimEnd()}`);
    for (const k of Object.keys(v)) render(v[k], k, depth + (label ? 1 : 0));
  };
  render(value, null, 0);
  let text = out.join("\n");
  if (text.length > maxChars) text = text.slice(0, maxChars) + "\n…";
  return text;
}

// Dispatch one attachable { id, kind, title, payload } → text.
export function renderAttachable(att, ctx = {}) {
  switch (att.kind) {
    case "word": return serializeWord(att.payload);
    case "verse": return serializeVerse(att.payload);
    case "graph": return serializeGraph(att.payload);
    case "lexicon": return serializeLexicon(att.payload);
    case "ws": return serializeWsItem(att.payload, ctx);
    case "retrieved": return serializeRetrieved(att.payload);
    // A modal's computed analysis pushed from its "Ask AI": pass `text` (ready string) or
    // `data` (any computed object — rendered via compactObject). Lets any dialogue hand the
    // model its REAL content (derivations, keyness, collocations, …), not just a label.
    case "note": {
      const p = att.payload || {};
      const body = p.text || (p.data != null ? compactObject(p.data) : "");
      if (!body) return att.title || "";
      return p.title ? `${p.title}:\n${body}` : body;
    }
    default: return att.title || "";
  }
}

// Assemble the selected attachables into one capped block. Returns { text, chars, dropped }.
export function assembleContext(attachables, ctx = {}, { maxChars = 6000 } = {}) {
  const blocks = [];
  let chars = 0;
  let dropped = 0;
  for (const att of attachables) {
    const piece = renderAttachable(att, ctx).trim();
    if (!piece) continue;
    if (chars + piece.length + 2 > maxChars && blocks.length > 0) { dropped++; continue; }
    blocks.push(piece);
    chars += piece.length + 2;
  }
  return { text: blocks.join("\n\n"), chars, dropped };
}

// Rough token estimate for the "~N tokens" meter (Arabic ≈ heavier per char than English;
// ~3 chars/token is a safe display approximation, not used for hard limits).
export function estimateTokens(chars) {
  return Math.ceil(chars / 3);
}
