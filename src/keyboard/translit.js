/* ═══ Phonetic Arabic transliteration + on-screen keyboard layout ═══
 *
 * A friendly "type Latin, get Arabic" scheme (NOT Buckwalter): single keystrokes map
 * straight to a letter (a→ا, b→ب, S→ص …) and an apostrophe MODIFIER upgrades the
 * previous letter to its dotted/seated variant (t'→ث, H'→خ, d'→ذ, s'→ش, g'→غ, and the
 * hamza seats a'→أ, w'→ؤ, y'→ئ). Capitals carry the emphatics (S ḍ T Z) and ح vs ه (H/h).
 *
 * Three exports drive everything:
 *   CHAR_MAP  — single typed char → Arabic (physical typing + on-screen single keys)
 *   UPGRADE   — Arabic-char-before-caret → upgraded char, applied when "'" is typed
 *   LAYOUT    — rows of keys for the on-screen keyboard (mirrors the reference design)
 *
 * The same tables back BOTH the physical-keyboard interception and the clickable keys,
 * so what you see on a key is exactly what typing it produces — they can never drift.
 */

// Typed Latin char → Arabic letter / digit / punctuation (one keystroke, no modifier).
export const CHAR_MAP = {
  // Row 1 — basic consonants
  a: "ا", b: "ب", t: "ت", j: "ج", H: "ح", d: "د", r: "ر", z: "ز", s: "س",
  // Row 2 — emphatics (capitals) + the rest
  S: "ص", D: "ض", T: "ط", Z: "ظ", e: "ع", g: "غ", f: "ف", q: "ق", k: "ك",
  l: "ل", m: "م", n: "ن", h: "ه", w: "و", y: "ي",
  // Hamza / madda / extra letters
  "-": "ء", "|": "آ", "<": "إ", p: "ة", Y: "ى",
  // Digits → Arabic-Indic
  0: "٠", 1: "١", 2: "٢", 3: "٣", 4: "٤", 5: "٥", 6: "٦", 7: "٧", 8: "٨", 9: "٩",
  // Punctuation → Arabic forms
  ",": "،", ";": "؛", "?": "؟", "%": "٪",
};

// The "'" modifier: the char immediately before the caret is replaced by its variant.
// A self-mapping (غ→غ) means "' after this letter is a no-op" — typing g then ' keeps غ
// rather than spilling a stray hamza, since غ is already reached by a bare g.
export const UPGRADE = {
  "ت": "ث", // t'
  "د": "ذ", // d'
  "ح": "خ", // H'
  "س": "ش", // s'
  "غ": "غ", // g' (no-op: غ already from g)
  "ا": "أ", // a'
  "و": "ؤ", // w'
  "ي": "ئ", // y'
};

// A lone apostrophe (nothing upgradable before the caret) drops a bare hamza.
export const LONE_APOSTROPHE = "ء";

// Resolve a single typed char while the keyboard is on:
//   • a mapped char            → its Arabic form ("k" → "ك", "2" → "٢")
//   • an unmapped ASCII letter → its lowercase mapping if any ("B" → "ب"), else "" (DROP).
//     The scheme has no short-vowel letters, so a stray i/o/u/c/v/x is swallowed rather
//     than left as Latin litter — "ktab" yields كتاب cleanly.
//   • anything else (space, dot, unmapped punctuation) → null (PASS THROUGH untouched).
export function resolveTyped(ch) {
  if (CHAR_MAP[ch] != null) return CHAR_MAP[ch];
  if (/^[A-Za-z]$/.test(ch)) {
    const lo = ch.toLowerCase();
    return CHAR_MAP[lo] != null ? CHAR_MAP[lo] : "";
  }
  return null;
}

// A combining mark needs a dotted-circle carrier (◌) to be legible on its own key.
const DOTTED = "◌";
const mark = (ar, hint) => ({ ar, hint, combining: true });

// On-screen layout. Order is LOGICAL (ا first); the RTL panel renders ا on the right,
// matching the reference image. `hint` is the Latin label shown above each key.
export const LAYOUT = [
  // Row 1
  [
    { ar: "ا", hint: "a" }, { ar: "ب", hint: "b" }, { ar: "ت", hint: "t" }, { ar: "ث", hint: "t'" },
    { ar: "ج", hint: "j" }, { ar: "ح", hint: "H" }, { ar: "خ", hint: "H'" }, { ar: "د", hint: "d" },
    { ar: "ذ", hint: "d'" }, { ar: "ر", hint: "r" }, { ar: "ز", hint: "z" }, { ar: "س", hint: "s" },
    { ar: "ش", hint: "s'" },
  ],
  // Row 2
  [
    { ar: "ص", hint: "S" }, { ar: "ض", hint: "D" }, { ar: "ط", hint: "T" }, { ar: "ظ", hint: "Z" },
    { ar: "ع", hint: "e" }, { ar: "غ", hint: "g'" }, { ar: "ف", hint: "f" }, { ar: "ق", hint: "q" },
    { ar: "ك", hint: "k" }, { ar: "ل", hint: "l" }, { ar: "م", hint: "m" }, { ar: "ن", hint: "n" },
    { ar: "ه", hint: "h" }, { ar: "و", hint: "w" }, { ar: "ي", hint: "y" }, { ar: "ء", hint: "-" },
  ],
  // Row 3 — hamza / madda seats + ة ى, then the harakat (click-only diacritics)
  [
    { ar: "آ", hint: "|" }, { ar: "أ", hint: "a'" }, { ar: "إ", hint: "<" }, { ar: "ؤ", hint: "w'" },
    { ar: "ئ", hint: "y'" }, { ar: "ة", hint: "p" }, { ar: "ى", hint: "Y" },
    mark("ٌ", "uN"), mark("ٍ", "iN"), mark("ً", "aN"),
    mark("ُ", "u"), mark("ِ", "i"), mark("َ", "a"),
    mark("ّ", "~"), mark("ْ", "o"),
  ],
  // Row 4 — punctuation (guillemets + tatweel are click-only)
  [
    { ar: "،", hint: "," }, { ar: "؛", hint: ";" }, { ar: "؟", hint: "?" },
    { ar: "«", hint: "«" }, { ar: "»", hint: "»" }, { ar: "ـ", hint: "—" },
  ],
  // Row 5 — Arabic-Indic digits + percent
  [
    { ar: "٠", hint: "0" }, { ar: "١", hint: "1" }, { ar: "٢", hint: "2" }, { ar: "٣", hint: "3" },
    { ar: "٤", hint: "4" }, { ar: "٥", hint: "5" }, { ar: "٦", hint: "6" }, { ar: "٧", hint: "7" },
    { ar: "٨", hint: "8" }, { ar: "٩", hint: "9" }, { ar: "٪", hint: "%" },
  ],
];

// Render label for a combining-mark key: the mark sitting on a dotted circle.
export const dottedGlyph = (ar) => DOTTED + ar;
