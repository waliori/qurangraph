/* ═══ Answer verification (anti-hallucination) ═══
 *
 * A small local model WILL sometimes confabulate — cite a verse that isn't there, or quote
 * Arabic that the verse doesn't contain (we observed it invent "2:189" with fabricated text).
 * RAG can't prevent that; it can only supply the right data. This deterministic pass catches
 * it after the fact using ground truth we already hold client-side (every verse's exact text):
 *
 *  • badRef     — a cited s:a reference that doesn't exist in the muṣḥaf.
 *  • offContext — a valid reference the model pulled out of nowhere (not in the attached /
 *                 retrieved context). Only checked when the caller passes `allowedRefs`.
 *  • misquote   — an Arabic run (≥ minWords) quoted right next to a reference that is NOT a
 *                 substring of that verse's actual text. This is keyed to a *nearby reference*
 *                 on purpose: it flags fake QUOTES without false-flagging the model's ordinary
 *                 Arabic prose (explaining a root, etc.), which carries no adjacent ref.
 *
 * Pure: text + ground-truth maps in, structured issues out. The panel renders the issues as a
 * caution under the message; nothing is silently rewritten.
 */

import { norm } from "../arabic-utils.js";

const AR = "\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF";
const ARABIC_RUN = new RegExp(`[${AR}]+(?:\\s+[${AR}]+)*`, "g");
const REF = /(\d{1,3}):(\d{1,3})/g;
const NEAR = 100; // chars: how close a quote must be to a ref to count as quoting it

// Normalise a phrase the same way on both sides so substring comparison is orthography-proof.
export function normalizePhrase(s) {
  return String(s).split(/\s+/).map((w) => norm(w)).filter(Boolean).join(" ");
}

export function verifyAnswer(text, { refText, allowedRefs = null, minWords = 4, maxIssues = 8 } = {}) {
  const issues = [];
  const s = String(text || "");
  if (!s.trim() || !refText) return { issues };

  // Collect cited references with their positions, validating each.
  const refs = [];
  const seen = new Set();
  let m;
  REF.lastIndex = 0;
  while ((m = REF.exec(s))) {
    const ref = `${+m[1]}:${+m[2]}`;
    refs.push({ ref, idx: m.index });
    if (seen.has(ref)) continue;
    seen.add(ref);
    if (!refText.has(ref)) issues.push({ type: "badRef", ref });
    else if (allowedRefs && !allowedRefs.has(ref)) issues.push({ type: "offContext", ref });
  }

  // Misquote: an Arabic run quoted near a (valid) reference that the verse doesn't contain.
  ARABIC_RUN.lastIndex = 0;
  while ((m = ARABIC_RUN.exec(s))) {
    const run = m[0].trim();
    if (run.split(/\s+/).length < minWords) continue;
    // nearest valid reference within the window
    let near = null, best = NEAR + 1;
    for (const r of refs) {
      if (!refText.has(r.ref)) continue;
      const d = Math.abs(r.idx - m.index);
      if (d < best) { best = d; near = r.ref; }
    }
    if (!near) continue;
    const runNorm = normalizePhrase(run);
    if (runNorm && !normalizePhrase(refText.get(near)).includes(runNorm)) {
      issues.push({ type: "misquote", ref: near, text: run.slice(0, 80) });
      if (issues.length >= maxIssues) break;
    }
  }

  return { issues: issues.slice(0, maxIssues) };
}
