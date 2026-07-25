/* ═══ Shaping an API answer for a context window ═══
 *
 * The HTTP API is tuned for a browser: every object carries seven `ui…` deep links, a root
 * dossier ships all six dictionary articles, and a page defaults to fifty rows. That is the
 * right shape for a page and the wrong one for a model, where the whole answer is read into
 * a context window and paid for by the token.
 *
 * Three passes, applied in this order by every tool:
 *
 *   1. slimLinks   — keep exactly one `ui` link per object. It is the citation the model
 *                    hands back to a human ("here is that distribution"), and it is the one
 *                    part of the links block worth its bytes; the other six are the same
 *                    URL with a different view flag.
 *   2. per-tool projection — sections, caps, article clipping. Lives in tools.js, because
 *                    what may be dropped is a judgement about the data, not a generic rule.
 *   3. fitToBudget — the backstop. A single tool result can never exceed the configured
 *                    ceiling, whatever the caller asked for; it degrades in a defined order
 *                    and SAYS SO in the payload, because a silently truncated list read as
 *                    complete is exactly how a grounded answer becomes a wrong one.
 */

const MAX_DEPTH = 24;

/* Structural clone that keeps only `links.ui`. Nulls and empty link blocks fall out. */
export function slimLinks(value, depth = 0) {
  if (depth > MAX_DEPTH || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => slimLinks(v, depth + 1));
  if (typeof value !== "object") return value;

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined || v === null) continue;
    if (k === "links") {
      if (v && typeof v === "object" && typeof v.ui === "string") out.ui = v.ui;
      continue;
    }
    // A stray `ui_*` sibling outside a links block (compare, pairing, graph) is the same
    // duplication one level up; keep only the headline.
    if (/^ui_/.test(k)) continue;
    out[k] = slimLinks(v, depth + 1);
  }
  return out;
}

/* Depth-first walk over every container, parent-first. `fn(node, key, value)`. */
function walk(node, fn, depth = 0, seen = new Set()) {
  if (depth > MAX_DEPTH || node == null || typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);
  const keys = Array.isArray(node) ? node.map((_, i) => i) : Object.keys(node);
  for (const k of keys) {
    fn(node, k, node[k]);
    walk(node[k], fn, depth + 1, seen);
  }
}

const clone = (v) => JSON.parse(JSON.stringify(v));

function stripKey(root, key) {
  walk(root, (node, k) => { if (!Array.isArray(node) && k === key) delete node[k]; });
}

/* Clip long strings — one Lisān al-ʿArab article can outweigh everything else combined. */
function clampStrings(root, max) {
  let clipped = 0;
  walk(root, (node, k, v) => {
    if (typeof v === "string" && v.length > max) {
      node[k] = `${v.slice(0, max)}… [clipped: ${v.length - max} more characters]`;
      clipped++;
    }
  });
  return clipped;
}

/* The longest array anywhere in the tree — the thing worth halving next. */
function largestArray(root) {
  let best = null;
  walk(root, (node, k, v) => {
    if (Array.isArray(v) && v.length > 1 && (!best || v.length > best.length)) best = v;
  });
  return best;
}

/* Force a payload under `maxChars` of serialized JSON, degrading in a defined order and
 * recording what was lost. Converges: halving the longest array strictly shrinks the tree,
 * and string clamping bounds the leaves, so the loop always terminates. */
/* Serialized COMPACTLY, not pretty-printed. Indentation is whitespace the model pays for
 * by the token — on a nested payload it inflates the answer by half again — and nothing
 * downstream reads this by eye. */
export function fitToBudget(payload, maxChars) {
  const asIs = JSON.stringify(payload);
  if (asIs.length <= maxChars) return { payload, text: asIs, truncated: false };

  const out = clone(payload);
  const lost = [];
  out.truncated = {
    reason: `The full answer exceeded this server's ${maxChars}-character ceiling for one tool result.`,
    removed: lost,
    advice: "Treat every list below as INCOMPLETE — compare each one against the counts in `meta`. "
      + "To see the rest, narrow the request (fewer sections, a smaller limit, one lexicon instead of "
      + "all six) or page through it with `offset`.",
  };

  // Degrade against a slightly smaller budget than the real one, so the notes appended along
  // the way — which are themselves part of the answer — cannot push it back over.
  const budget = Math.max(1000, maxChars - 600);
  const fits = () => JSON.stringify(out).length <= budget;

  stripKey(out, "ui");
  lost.push("UI links");

  if (!fits() && clampStrings(out, 4000)) lost.push("long text clipped to 4000 characters");

  if (!fits()) {
    let halved = 0;
    for (let i = 0; i < 60 && !fits(); i++) {
      const arr = largestArray(out);
      if (!arr) break;
      arr.length = Math.max(1, Math.floor(arr.length / 2));
      halved++;
    }
    if (halved) lost.push("lists shortened");
  }

  if (!fits()) {
    clampStrings(out, 400);
    lost.push("long text clipped to 400 characters");
  }

  // Serialize ONCE, after every note is in place: a snapshot taken mid-degradation would
  // describe less loss than actually occurred, which is the one thing this must never do.
  return { payload: out, text: JSON.stringify(out), truncated: true };
}

/* Cap a list and say so in the same breath, so the model never reads a cut list as the
 * whole set. Returns [items, note] — the note is null when nothing was dropped. */
export function cap(list, n, what) {
  const arr = Array.isArray(list) ? list : [];
  if (arr.length <= n) return [arr, null];
  return [arr.slice(0, n), `${what}: showing ${n} of ${arr.length}.`];
}

/* Assemble the `notes` array a tool result carries. Nulls fall out; empty stays absent. */
export const notes = (...xs) => {
  const out = xs.flat().filter(Boolean);
  return out.length ? out : undefined;
};

/* Rows of a long tabular list drop their link block entirely: one deep-link URL per row
 * outweighs the row, and the object the request is ABOUT still carries one. */
export function bare(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const copy = { ...row };
    delete copy.links;
    delete copy.ui;
    return copy;
  });
}

/* Keep named keys, in the order given, dropping absent ones. */
export function pick(obj, keys) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  return out;
}
