/* ═══ Assistant → app actions ═══
 *
 * The assistant is a lexical aid, but it can also DRIVE the app: when the user asks to see
 * something ("show every verse with this root", "go to 2:255", "compare these two roots"),
 * the model emits a small JSON action in a fenced block. We parse those out of its reply,
 * hide the raw JSON from the rendered bubble, and surface each as a CONFIRM button — the app
 * only acts when the user clicks, never on the model's say-so alone (small local models can
 * hallucinate). Execution itself is wired in QuranGraph via existing openOcc/navigate/
 * setDist/setCmp, so this module stays pure: parsing + labelling only.
 *
 * Action shapes the model is taught (see systemPrompt.js):
 *   {"tool":"verses","term":"<word|root>","mode":"root|lemma|exact"}   → all occurrences
 *   {"tool":"distribution","term":"…","mode":"…"}                       → sūrah distribution
 *   {"tool":"goto","ref":"S:A"}                                          → centre that verse
 *   {"tool":"compare","a":"…","b":"…","mode":"…"}                        → compare two terms
 */

export const ACTION_TOOLS = new Set(["verses", "occurrences", "distribution", "goto", "compare"]);

// Reasoning models (Qwen3/3.5, etc.) emit <think>…</think> chain-of-thought. Strip it from
// what we display AND from what we feed back as history — it's noise to the user and to the
// next turn. Also drop a dangling, unclosed <think> while a reply is still streaming.
export function stripThinking(text) {
  if (!text) return "";
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .replace(/^\s*<\/think>/i, "")
    .trim();
}

// Pull fenced ```action / ```json blocks (and any bare {…"tool"…}) out of the text.
// Returns { clean, actions } — `clean` is the prose with thinking + action blocks stripped.
export function parseActions(text) {
  if (!text) return { clean: "", actions: [] };
  const actions = [];
  let clean = stripThinking(text);

  const fence = /```(?:action|json)?\s*(\{[\s\S]*?\})\s*```/gi;
  clean = clean.replace(fence, (_m, json) => {
    const a = tryParse(json);
    if (a) { actions.push(a); return ""; }
    return _m; // leave non-action JSON blocks untouched
  });

  // Fallback: a bare top-level {...} object that carries a "tool" key, no fences.
  if (actions.length === 0) {
    const bare = clean.match(/\{[^{}]*"tool"\s*:\s*"[^"]+"[^{}]*\}/);
    if (bare) {
      const a = tryParse(bare[0]);
      if (a) { actions.push(a); clean = clean.replace(bare[0], ""); }
    }
  }

  return { clean: clean.replace(/\n{3,}/g, "\n\n").trim(), actions: dedupe(actions) };
}

function tryParse(json) {
  try {
    const o = JSON.parse(json);
    if (o && typeof o === "object" && typeof o.tool === "string" && ACTION_TOOLS.has(o.tool)) return normalize(o);
  } catch { /* ignore malformed */ }
  return null;
}

function normalize(o) {
  const mode = o.mode === "root" || o.mode === "lemma" ? o.mode : "exact";
  if (o.tool === "occurrences") o = { ...o, tool: "verses" };
  return { tool: o.tool, term: o.term, a: o.a, b: o.b, ref: o.ref, mode };
}

function dedupe(actions) {
  const seen = new Set();
  return actions.filter((a) => { const k = JSON.stringify(a); if (seen.has(k)) return false; seen.add(k); return true; });
}

// A short button label for an action, in the active UI language (ar|en).
export function actionLabel(a, lang) {
  const ar = lang !== "en";
  const m = a.mode === "root" ? (ar ? "جذر" : "root") : a.mode === "lemma" ? (ar ? "صيغة" : "lemma") : (ar ? "لفظ" : "word");
  switch (a.tool) {
    case "verses": return ar ? `↗ كل آيات «${a.term}» (${m})` : `↗ All verses for «${a.term}» (${m})`;
    case "distribution": return ar ? `↗ توزيع «${a.term}» (${m})` : `↗ Distribution of «${a.term}» (${m})`;
    case "goto": return ar ? `↗ اذهب إلى ${a.ref}` : `↗ Go to ${a.ref}`;
    case "compare": return ar ? `↗ قارن «${a.a}» و«${a.b}» (${m})` : `↗ Compare «${a.a}» & «${a.b}» (${m})`;
    default: return a.tool;
  }
}
