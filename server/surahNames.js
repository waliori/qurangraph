/* ═══ Naming a sūrah ═══
 *
 * Anywhere the API takes a sūrah, it takes a number, its Arabic name, or a Latin
 * transliteration: `2`, `البقرة`, `بقرة`, `al-baqarah`, `Al Baqara`.
 *
 * Matching is EXACT after normalisation — never fuzzy. That is a deliberate refusal: the
 * corpus romanization index (src/search.js), which resolves Latin queries to Qurʾānic
 * *words*, confidently returns يوسف for "yasin", المسد for "maida" and النساء for "nas".
 * Those are fine failure modes when you are hunting a word and can see the candidates;
 * they are unacceptable when someone asks for a chapter and gets a different chapter back
 * with a 200. Better a 404 that lists near-misses than a plausible wrong answer.
 *
 * The Arabic side is DERIVED from the corpus (buildSurahIndex reads the loaded sūrah
 * list), so it cannot drift from the text. Only the Latin spellings below are curated:
 * transliteration has no single standard, and the corpus carries none at all.
 *
 * Every generated key is checked for collisions at build time — see assertUnique.
 */

import { norm } from "../src/arabic-utils.js";

/* Base transliterations, WITHOUT the definite article — the article forms are generated.
 * The first entry is the canonical one; the rest are spellings people actually type
 * (doubled vowels, -a/-ah endings, q/k and w/v swaps). */
export const LATIN = {
  1: ["fatihah", "fatiha", "faatihah"],
  2: ["baqarah", "baqara", "baqarat"],
  3: ["imran", "aliimran", "alimran", "aalimran"],
  4: ["nisa", "nisaa", "nissa"],
  5: ["maidah", "maida", "maaida", "maidat"],
  6: ["anam", "anaam", "an'am"],
  7: ["araf", "araaf", "aaraf"],
  8: ["anfal", "anfaal"],
  9: ["tawbah", "tawba", "tauba", "taubah"],
  10: ["yunus", "younus", "yoonus"],
  11: ["hud", "hood"],
  12: ["yusuf", "yousuf", "yusof"],
  13: ["rad", "raad"],
  14: ["ibrahim", "ibraheem"],
  15: ["hijr"],
  16: ["nahl"],
  17: ["isra", "israa"],
  18: ["kahf"],
  19: ["maryam", "mariam"],
  20: ["taha", "taaha"],
  21: ["anbiya", "anbiyaa"],
  22: ["hajj"],
  23: ["muminun", "muminoon", "mumineen"],
  24: ["nur", "noor"],
  25: ["furqan", "furqaan"],
  26: ["shuara", "shuaraa", "shuara'"],
  27: ["naml"],
  28: ["qasas"],
  29: ["ankabut", "ankaboot"],
  30: ["rum", "room"],
  31: ["luqman", "luqmaan"],
  32: ["sajdah", "sajda"],
  33: ["ahzab", "ahzaab"],
  34: ["saba", "sabaa"],
  35: ["fatir", "faatir"],
  36: ["yasin", "yaseen", "yaasin"],
  37: ["saffat", "saaffat", "safaat"],
  38: ["sad", "saad"],
  39: ["zumar", "zumr"],
  40: ["ghafir", "ghaafir"],
  41: ["fussilat", "fusilat"],
  42: ["shura", "shuraa"],
  43: ["zukhruf"],
  44: ["dukhan", "dukhaan"],
  45: ["jathiyah", "jathiya", "jaathiya"],
  46: ["ahqaf", "ahqaaf"],
  47: ["muhammad", "mohammad"],
  48: ["fath"],
  49: ["hujurat", "hujuraat"],
  50: ["qaf", "qaaf"],
  51: ["dhariyat", "dhaariyat", "zariyat"],
  52: ["tur", "toor"],
  53: ["najm"],
  54: ["qamar"],
  55: ["rahman", "rahmaan"],
  56: ["waqiah", "waqia", "waaqia"],
  57: ["hadid", "hadeed"],
  58: ["mujadilah", "mujadila", "mujaadila"],
  59: ["hashr"],
  60: ["mumtahanah", "mumtahana", "mumtahinah"],
  61: ["saff"],
  62: ["jumuah", "jumua", "jumah"],
  63: ["munafiqun", "munafiqoon"],
  64: ["taghabun", "taghaabun"],
  65: ["talaq", "talaaq"],
  66: ["tahrim", "tahreem"],
  67: ["mulk"],
  68: ["qalam"],
  69: ["haqqah", "haqqa", "haaqqa"],
  70: ["maarij", "maaarij", "marij"],
  71: ["nuh", "nooh", "noah"],
  72: ["jinn"],
  73: ["muzzammil", "muzammil"],
  74: ["muddaththir", "muddathir", "mudassir"],
  75: ["qiyamah", "qiyama", "qiyaama"],
  76: ["insan", "insaan", "dahr"],
  77: ["mursalat", "mursalaat"],
  78: ["naba", "nabaa"],
  79: ["naziat", "naaziat", "nazioat"],
  80: ["abasa"],
  81: ["takwir", "takweer"],
  82: ["infitar", "infitaar"],
  83: ["mutaffifin", "mutaffifeen", "tatfif"],
  84: ["inshiqaq", "inshiqaaq"],
  85: ["buruj", "burooj"],
  86: ["tariq", "taariq"],
  87: ["ala", "alaa"],
  88: ["ghashiyah", "ghashiya", "ghaashiya"],
  89: ["fajr"],
  90: ["balad"],
  91: ["shams"],
  92: ["layl", "lail", "leyl"],
  93: ["duha", "dhuha", "duhaa"],
  94: ["sharh", "inshirah", "insharh"],
  95: ["tin", "teen"],
  96: ["alaq", "alaaq"],
  97: ["qadr"],
  98: ["bayyinah", "bayyina", "bayinah"],
  99: ["zalzalah", "zalzala", "zilzal"],
  100: ["adiyat", "aadiyat"],
  101: ["qariah", "qaria", "qaariah"],
  102: ["takathur", "takaathur"],
  103: ["asr"],
  104: ["humazah", "humaza"],
  105: ["fil", "feel"],
  106: ["quraysh", "quraish"],
  107: ["maun", "maaun", "maoon"],
  108: ["kawthar", "kauthar", "kausar"],
  109: ["kafirun", "kafiroon", "kaafiroon"],
  110: ["nasr"],
  111: ["masad", "lahab"],
  112: ["ikhlas", "ikhlaas", "tawhid"],
  113: ["falaq"],
  114: ["nas", "naas"],
};

/* Latin input → a comparable key: letters only, lower case. Apostrophes, hyphens and
 * spaces vanish, so "Al-Baqarah", "al baqarah" and "albaqarah" agree. */
export const latinKey = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");

/* The consonant the definite article assimilates into, for sun letters ("an-nas",
 * "ash-shams"). Digraphs first so "sh"/"th"/"dh"/"kh"/"gh" are not split. */
const SUN = ["sh", "th", "dh", "t", "d", "r", "z", "s", "n", "l"];
function articleForms(base) {
  const out = [`al${base}`];
  const lead = SUN.find((c) => base.startsWith(c));
  if (lead) out.push(`a${lead}${base}`);      // an + nas → annas, ash + shams → ashshams
  return out;
}

/* Arabic input → a comparable key. Reuses the app's own normaliser (which folds the
 * hamza/alif and tāʾ-marbūṭa variants people mistype), then drops spaces so "آل عمران"
 * and "آلعمران" agree. The bare form (article stripped) is registered separately. */
export const arabicKey = (s) => norm(String(s || "")).replace(/\s+/g, "");

/* Levenshtein, abandoned once it provably exceeds `max` — enough for a typo hint. */
function editWithin(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/* Build the lookup: every accepted spelling → sūrah id.
 * `surahList` is the corpus's own [{ id, name }], so the Arabic side can never drift
 * from the text; the Latin side comes from LATIN above. Throws on any collision. */
export function buildSurahIndex(surahList) {
  const byKey = new Map();
  const owner = new Map();                     // key → id, for the collision report
  const clashes = [];
  const put = (key, id) => {
    if (!key) return;
    const prev = owner.get(key);
    if (prev !== undefined && prev !== id) { clashes.push(`"${key}" → ${prev} and ${id}`); return; }
    owner.set(key, id); byKey.set(key, id);
  };

  for (const s of surahList) {
    const ar = arabicKey(s.name);
    put(ar, s.id);
    put(ar.replace(/^ال/, ""), s.id);          // البقرة → بقرة
    for (const base of LATIN[s.id] || []) {
      put(base, s.id);
      for (const f of articleForms(base)) put(f, s.id);
    }
  }
  if (clashes.length) {
    throw new Error(`Sūrah name index is ambiguous — refusing to guess:\n  ${clashes.join("\n  ")}`);
  }
  const missing = surahList.filter((s) => !(LATIN[s.id] || []).length).map((s) => s.id);
  if (missing.length) throw new Error(`No transliteration for sūrah(s) ${missing.join(", ")}`);

  return {
    byKey,
    canonical: new Map(surahList.map((s) => [s.id, s.name])),
    /* number | Arabic name | Latin name → id, or null. Exact after normalisation. */
    lookup(raw) {
      const v = String(raw ?? "").trim();
      if (!v) return null;
      if (/^\d{1,3}$/.test(v)) { const n = Number(v); return n >= 1 && n <= surahList.length ? n : null; }
      return byKey.get(arabicKey(v)) ?? byKey.get(latinKey(v)) ?? null;
    },
    /* Spellings closest to a failed lookup, for the 404 hint ONLY — never to answer with.
     * Substring first, then a bounded edit distance so an ordinary typo ("baqra") still
     * suggests something. Because this only ever decorates an error, being generous here
     * costs nothing; being generous in lookup() would hand back the wrong chapter. */
    near(raw) {
      const v = String(raw ?? "").trim();
      const k = /[a-z]/i.test(v) ? latinKey(v) : arabicKey(v);
      if (k.length < 2) return [];
      const best = new Map();                       // id → distance
      for (const [key, id] of byKey) {
        let d = null;
        if (key.startsWith(k) || k.startsWith(key) || key.includes(k)) d = 0;
        else if (Math.abs(key.length - k.length) <= 2) {
          const e = editWithin(key, k, 2);
          if (e <= 2) d = e;
        }
        if (d !== null && (best.get(id) ?? 99) > d) best.set(id, d);
      }
      return [...best.entries()]
        .sort((a, b) => a[1] - b[1] || a[0] - b[0])
        .slice(0, 5)
        .map(([id]) => ({ id, name: this.canonical.get(id) }));
    },
  };
}
