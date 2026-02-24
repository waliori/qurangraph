import { readFileSync, writeFileSync } from "fs";

/* ── Normalize to consonantal skeleton ── */
function norm(w) {
  return w
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u08D4-\u08E1\u08F0-\u08F2\u0617-\u061A\u06E2-\u06E6\u06E8\u06EA-\u06EC\u0610-\u0616\u065E\u0656-\u0658\u06DF\u06E0\u06E1]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[\u0671\u0622\u0623\u0625]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064A")
    .replace(/[^\u0621-\u064A]/g, "")
    .trim();
}

function stripNum(t) {
  return t.replace(/\s+[\u0660-\u0669\u06F0-\u06F9٠-٩0-9]+\s*$/, "").trim();
}

/* Is diff a KFGQPC font-encoding artifact? */
function isArtifact(a, b) {
  if (a === b) return true;
  // Hamza/alef variation only
  const sa = a.replace(/[\u0621\u0627]/g, "");
  const sb = b.replace(/[\u0621\u0627]/g, "");
  if (sa === sb) return true;
  // One is the other with ya/hamza stripped (font glyph merging)
  const stripYH = (s) => s.replace(/[\u064A\u0621]/g, "");
  if (stripYH(a) === stripYH(b)) return true;
  // One is a prefix of other with only ي/ن/ء/ا/ه/و missing
  const [longer, shorter] = a.length >= b.length ? [a, b] : [b, a];
  if (shorter.length < 2) return true;
  if (longer.startsWith(shorter)) {
    const suffix = longer.slice(shorter.length);
    if (/^[\u064A\u0646\u0621\u0627\u0647\u0648]+$/.test(suffix)) return true;
  }
  return false;
}

/* ── LCS alignment ── */
function lcsAlign(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const pairs = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { pairs.unshift([i - 1, j - 1]); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return pairs;
}

/* ── Load data ── */
const tanzil = JSON.parse(readFileSync("public/data/quran-hafs.json", "utf8"));
const hafsKfg = JSON.parse(readFileSync("data/source/kfgqpc/hafs.json", "utf8"));

const NARR_KEYS = ["warsh", "qaloon", "shouba", "doori", "soosi", "bazzi", "qumbul"];
const NARR_LABELS = {
  warsh: "ورش", qaloon: "قالون", shouba: "شعبة",
  doori: "الدوري", soosi: "السوسي", bazzi: "البزي", qumbul: "قنبل",
};

/* Build KFGQPC Hafs per-sura word lists with Hafs verse tracking */
const hafsSuras = {};
for (const e of hafsKfg) {
  const s = e.sora;
  if (!hafsSuras[s]) hafsSuras[s] = { words: [], verseOfWord: [], origWords: [] };
  for (const w of stripNum(e.aya_text).split(/\s+/)) {
    const n = norm(w);
    if (n.length >= 1) {
      hafsSuras[s].words.push(n);
      hafsSuras[s].verseOfWord.push(e.aya_no);
      hafsSuras[s].origWords.push(w);
    }
  }
}

/* Also build Hafs emlaey lookup for display: sura:aya → emlaey words */
const hafsEmlaey = {};
for (const e of hafsKfg) {
  const vk = `${e.sora}:${e.aya_no}`;
  if (e.aya_text_emlaey) {
    hafsEmlaey[vk] = e.aya_text_emlaey.split(/\s+/);
  }
}

/* Build Tanzil Hafs lookup for original display text */
const tanzilVerse = {};
for (const sura of tanzil) {
  for (const v of sura.verses) {
    tanzilVerse[`${sura.id}:${v.id}`] = v.text;
  }
}

/* Load narrations */
const narrData = {};
for (const key of NARR_KEYS) {
  const raw = JSON.parse(readFileSync(`data/source/kfgqpc/${key}.json`, "utf8"));
  const bySura = {};
  for (const e of raw) {
    const s = e.sura_no;
    if (!bySura[s]) bySura[s] = { words: [], origWords: [] };
    for (const w of stripNum(e.aya_text).split(/\s+/)) {
      const n = norm(w);
      if (n.length >= 1) {
        bySura[s].words.push(n);
        bySura[s].origWords.push(w);
      }
    }
  }
  narrData[key] = bySura;
}

/* ── Generate diffs ── */
const allDiffs = {};

for (let suraId = 1; suraId <= 114; suraId++) {
  const hafs = hafsSuras[suraId];
  if (!hafs) continue;

  for (const key of NARR_KEYS) {
    const narr = narrData[key]?.[suraId];
    if (!narr) continue;

    const aligned = lcsAlign(hafs.words, narr.words);
    const inH = new Set(aligned.map((p) => p[0]));
    const inN = new Set(aligned.map((p) => p[1]));

    // Collect unmatched words
    const hOnly = [], nOnly = [];
    hafs.words.forEach((w, i) => { if (!inH.has(i)) hOnly.push({ w, i, orig: hafs.origWords[i] }); });
    narr.words.forEach((w, i) => { if (!inN.has(i)) nOnly.push({ w, i, orig: narr.origWords[i] }); });

    // Pair changes, then handle additions/deletions
    const minP = Math.min(hOnly.length, nOnly.length);
    for (let k = 0; k < minP; k++) {
      if (isArtifact(hOnly[k].w, nOnly[k].w)) continue;
      const verseId = hafs.verseOfWord[hOnly[k].i];
      const vk = `${suraId}:${verseId}`;

      // Try to get emlaey display text
      const emWords = hafsEmlaey[vk];
      const hDisplay = emWords
        ? findClosestEmlaey(hOnly[k].w, emWords)
        : hOnly[k].orig;

      addDiff(vk, "c", hDisplay, nOnly[k].orig, key);
    }
    // Hafs-only = deleted in narration
    for (let k = minP; k < hOnly.length; k++) {
      if (hOnly[k].w.length < 2) continue;
      const verseId = hafs.verseOfWord[hOnly[k].i];
      const vk = `${suraId}:${verseId}`;
      const emWords = hafsEmlaey[vk];
      const hDisplay = emWords
        ? findClosestEmlaey(hOnly[k].w, emWords)
        : hOnly[k].orig;
      addDiff(vk, "d", hDisplay, "—", key);
    }
    // Narration-only = added in narration
    for (let k = minP; k < nOnly.length; k++) {
      if (nOnly[k].w.length < 2) continue;
      // Find nearest Hafs verse context
      const ctxH = minP > 0 ? hOnly[minP - 1].i : 0;
      const verseId = hafs.verseOfWord[Math.min(ctxH, hafs.verseOfWord.length - 1)];
      const vk = `${suraId}:${verseId}`;
      addDiff(vk, "a", "—", nOnly[k].orig, key);
    }
  }
}

function findClosestEmlaey(normWord, emlaeyWords) {
  // Find the emlaey word that normalizes closest to normWord
  for (const w of emlaeyWords) {
    if (norm(w) === normWord) return w;
  }
  return normWord; // fallback
}

function addDiff(vk, type, h, v, narrKey) {
  if (!allDiffs[vk]) allDiffs[vk] = [];
  // Clean display text (strip harakat from KFGQPC encoding for readability)
  const cleanV = v === "—" ? "—" : cleanDisplay(v);
  const cleanH = h === "—" ? "—" : h; // Hafs already clean from emlaey

  const existing = allDiffs[vk].find(
    (e) => e.t === type && e.h === cleanH && e.v === cleanV
  );
  if (existing) {
    if (!existing.r.includes(NARR_LABELS[narrKey])) {
      existing.r += "/" + NARR_LABELS[narrKey];
    }
  } else {
    allDiffs[vk].push({ t: type, h: cleanH, v: cleanV, r: NARR_LABELS[narrKey], n: "" });
  }
}

function cleanDisplay(text) {
  // Strip KFGQPC-specific marks but keep Arabic letters + basic harakat
  return text
    .replace(/[\u06D6-\u06ED\u08D4-\u08E1\u08F0-\u08F2\u0617-\u061A\u06E2-\u06E6\u06E8\u06EA-\u06EC\u0610-\u0616\u065E\u0656-\u0658\u06DF\u06E0\u06E1]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[^\u0621-\u064A\u064B-\u0652\u0670]/g, "")
    .trim();
}

/* ── Merge curated entries (original 42 with expert notes) ── */
const CURATED = {
"1:4":[{t:"c",h:"مَالِكِ",v:"مَلِكِ",r:"نافع/ابن كثير/أبو عمرو",n:"مالك (صاحب) vs ملك (حاكم)"}],
"2:9":[{t:"c",h:"يُخَادِعُونَ",v:"يَخْدَعُونَ",r:"نافع/ابن كثير/أبو عمرو",n:"مفاعلة vs فعل"}],
"2:10":[{t:"c",h:"يَكْذِبُونَ",v:"يُكَذِّبُونَ",r:"نافع/ابن كثير",n:"يكذبون vs يكذّبون (إنكار)"}],
"2:51":[{t:"c",h:"وَاعَدْنَا",v:"وَعَدْنَا",r:"أبو عمرو/أبو جعفر/يعقوب",n:"مفاعلة vs فعل"}],
"2:85":[{t:"c",h:"أُسَارَى تُفَادُوهُمْ",v:"أَسْرَى تَفْدُوهُمْ",r:"حمزة/الكسائي/خلف",n:"تغيير وزن الجمع والفعل"}],
"2:106":[{t:"c",h:"نُنسِهَا",v:"نَنْسَأْهَا",r:"ابن عامر",n:"ننسها (نسيان) vs ننسأها (تأخير)"}],
"2:125":[{t:"c",h:"وَاتَّخِذُوا",v:"وَاتَّخَذُوا",r:"نافع/ابن عامر/أبو جعفر",n:"اتخِذوا (أمر) vs اتخَذوا (خبر)"}],
"2:132":[{t:"c",h:"وَوَصَّى",v:"وَأَوْصَى",r:"نافع/ابن عامر/أبو جعفر",n:"وصّى vs أوصى"}],
"2:140":[{t:"c",h:"تَقُولُونَ",v:"يَقُولُونَ",r:"ابن كثير/أبو عمرو",n:"خطاب vs غيبة"}],
"2:184":[{t:"c",h:"يُطِيقُونَهُ",v:"يُطَوَّقُونَهُ",r:"ابن عباس ☆",n:"يطيقونه (يستطيعون) vs يطوّقونه (يُكلَّفون)"},{t:"c",h:"مِسْكِينٍ",v:"مَسَاكِينَ",r:"نافع/ابن ذكوان",n:"مفرد vs جمع"}],
"2:222":[{t:"c",h:"يَطْهُرْنَ",v:"يَطَّهَّرْنَ",r:"أبو عمرو وغيره",n:"يطهُرن (ينقطع) vs يتطهّرن (يغتسلن) — يغير الحكم"}],
"2:259":[{t:"c",h:"نُنشِزُهَا",v:"نُنْشِرُهَا",r:"ابن كثير/أبو عمرو/يعقوب",n:"ننشزها (نرفعها) vs ننشرها (نحييها)"}],
"2:282":[{t:"c",h:"أَن تَضِلَّ",v:"إِنْ تَضِلَّ",r:"حمزة",n:"أنْ (تعليل) vs إنْ (شرط)"},{t:"c",h:"فَتُذَكِّرَ",v:"فَتُذْكِرَ",r:"ابن كثير/أبو عمرو/يعقوب",n:"تذكّر vs تُذكِر"}],
"2:285":[{t:"c",h:"وَكُتُبِهِ",v:"وَكِتَابِهِ",r:"حمزة/الكسائي",n:"كتبه (جمع) vs كتابه (مفرد)"}],
"3:37":[{t:"c",h:"وَكَفَّلَهَا زَكَرِيَّا",v:"وَكَفَلَهَا زَكَرِيَّاءُ",r:"عاصم/حمزة vs الباقون",n:"كفّلها الله vs كفَلها زكريا"}],
"3:146":[{t:"c",h:"قَاتَلَ",v:"قُتِلَ",r:"ابن عامر/عاصم vs الباقون",n:"قاتَل (حارب) vs قُتِل (استُشهد)"}],
"4:12":[{t:"c",h:"يُوصَى",v:"يُوصِي",r:"حمزة/عاصم",n:"مبني مجهول vs معلوم"}],
"4:34":[{t:"c",h:"وَاضْرِبُوهُنَّ",v:"وَأَعْرِضُوا عَنْهُنَّ",r:"ابن مسعود ☆",n:"اضربوهن vs أعرضوا عنهن — تغيير جذري"}],
"4:43":[{t:"c",h:"لَامَسْتُمُ",v:"لَمَسْتُمُ",r:"حمزة/الكسائي/خلف",n:"لامستم (جماع) vs لمستم (لمس) — يغير حكم الوضوء"}],
"4:94":[{t:"c",h:"السَّلَامَ",v:"السَّلَمَ",r:"نافع/ابن عامر/أبو جعفر",n:"السلام (تحية) vs السلَم (استسلام)"}],
"5:6":[{t:"c",h:"وَأَرْجُلَكُمْ",v:"وَأَرْجُلِكُمْ",r:"نافع/ابن عامر/حمزة/الكسائي",n:"نصب=غسل vs جر=مسح — خلاف فقهي كبير"}],
"11:46":[{t:"c",h:"عَمَلٌ غَيْرُ صَالِحٍ",v:"عَمِلَ غَيْرَ صَالِحٍ",r:"الكسائي",n:"عملٌ (اسم) vs عمِلَ (فعل) — الابن أم أفعاله؟"}],
"13:31":[{t:"c",h:"يَيْأَسِ",v:"يَتَبَيَّنِ",r:"عليّ/ابن عباس ☆",n:"ييأس vs يتبيّن — اختلاف جذري"}],
"24:27":[{t:"c",h:"تَسْتَأْنِسُوا",v:"تَسْتَأْذِنُوا",r:"ابن مسعود/ابن عباس ☆",n:"تستأنسوا vs تستأذنوا"}],
"33:49":[{t:"c",h:"تَعْتَدُّونَهَا",v:"يَعْتَدِدْنَهَا",r:"أبو عمرو",n:"أنتم vs هنّ"}],
"49:6":[{t:"c",h:"فَتَبَيَّنُوا",v:"فَتَثَبَّتُوا",r:"حمزة/الكسائي/خلف",n:"تبيّنوا vs تثبّتوا"}],
"57:7":[{t:"c",h:"مُّسْتَخْلَفِينَ",v:"مُسْتَخْلِفِينَ",r:"أُبَيّ ☆",n:"مستخلَفين vs مستخلِفين"}],
"66:3":[{t:"c",h:"عَرَّفَ",v:"عَرَفَ",r:"الكسائي",n:"عرَّف (أعلمها) vs عرَف (علم فقط)"}],
"81:24":[{t:"c",h:"بِضَنِينٍ",v:"بِظَنِينٍ",r:"ابن كثير/أبو عمرو/الكسائي",n:"ضنين (بخيل) vs ظنين (متّهم)"}],
};

// Merge curated over auto-generated (curated takes priority)
for (const [vk, entries] of Object.entries(CURATED)) {
  if (!allDiffs[vk]) allDiffs[vk] = [];
  for (const entry of entries) {
    // Check if auto-gen already has a similar entry
    const existing = allDiffs[vk].find(e =>
      e.t === entry.t && norm(e.h || "") === norm(entry.h || "") && norm(e.v || "") === norm(entry.v || "")
    );
    if (existing) {
      // Curated has better display text and notes, replace
      existing.h = entry.h;
      existing.v = entry.v;
      if (entry.n) existing.n = entry.n;
      // Merge reader attributions
      if (entry.r && !existing.r.includes(entry.r)) existing.r = entry.r;
    } else {
      // Add curated entry (prepend so it shows first)
      allDiffs[vk].unshift(entry);
    }
  }
}

/* Stats & output */
let totalEntries = 0;
for (const entries of Object.values(allDiffs)) totalEntries += entries.length;
const totalVerses = Object.keys(allDiffs).length;

writeFileSync("public/data/qiraat-diffs.json", JSON.stringify(allDiffs));
console.log(`${totalEntries} diff entries across ${totalVerses} verses`);

let c = 0, a = 0, d = 0;
for (const entries of Object.values(allDiffs))
  for (const e of entries) { if (e.t === "c") c++; if (e.t === "a") a++; if (e.t === "d") d++; }
console.log(`Changes: ${c}, Additions: ${a}, Deletions: ${d}`);
