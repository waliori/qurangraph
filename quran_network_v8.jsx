import { useState, useEffect, useMemo, useCallback, useRef } from "react";

/* ═══ Qira'at DB ═══ */
const Q = {
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
"2:238":[{t:"a",h:"—",v:"وَصَلَاةِ الْعَصْرِ",r:"عائشة/حفصة ☆",n:"إضافة 'وصلاة العصر' تعيّن الوسطى"}],
"2:259":[{t:"c",h:"نُنشِزُهَا",v:"نُنْشِرُهَا",r:"ابن كثير/أبو عمرو/يعقوب",n:"ننشزها (نرفعها) vs ننشرها (نحييها)"}],
"2:282":[{t:"c",h:"أَن تَضِلَّ",v:"إِنْ تَضِلَّ",r:"حمزة",n:"أنْ (تعليل) vs إنْ (شرط)"},{t:"c",h:"فَتُذَكِّرَ",v:"فَتُذْكِرَ",r:"ابن كثير/أبو عمرو/يعقوب",n:"تذكّر vs تُذكِر"}],
"2:285":[{t:"c",h:"وَكُتُبِهِ",v:"وَكِتَابِهِ",r:"حمزة/الكسائي",n:"كتبه (جمع) vs كتابه (مفرد)"}],
"3:37":[{t:"c",h:"وَكَفَّلَهَا زَكَرِيَّا",v:"وَكَفَلَهَا زَكَرِيَّاءُ",r:"عاصم/حمزة vs الباقون",n:"كفّلها الله vs كفَلها زكريا"}],
"3:146":[{t:"c",h:"قَاتَلَ",v:"قُتِلَ",r:"ابن عامر/عاصم vs الباقون",n:"قاتَل (حارب) vs قُتِل (استُشهد)"}],
"4:11":[{t:"a",h:"—",v:"مِنْ بَعْدِ دَيْنٍ يُقْضَى أَوْ وَصِيَّةٍ",r:"ابن مسعود ☆",n:"تقديم الدين على الوصية"}],
"4:12":[{t:"c",h:"يُوصَى",v:"يُوصِي",r:"حمزة/عاصم",n:"مبني مجهول vs معلوم"}],
"4:24":[{t:"a",h:"—",v:"إِلَى أَجَلٍ مُسَمًّى",r:"أُبَيّ/ابن عباس ☆",n:"إضافة — تأثير على حكم المتعة"}],
"4:34":[{t:"c",h:"وَاضْرِبُوهُنَّ",v:"وَأَعْرِضُوا عَنْهُنَّ",r:"ابن مسعود ☆",n:"اضربوهن vs أعرضوا عنهن — تغيير جذري"}],
"4:43":[{t:"c",h:"لَامَسْتُمُ",v:"لَمَسْتُمُ",r:"حمزة/الكسائي/خلف",n:"لامستم (جماع) vs لمستم (لمس) — يغير حكم الوضوء"}],
"4:94":[{t:"c",h:"السَّلَامَ",v:"السَّلَمَ",r:"نافع/ابن عامر/أبو جعفر",n:"السلام (تحية) vs السلَم (استسلام)"}],
"4:176":[{t:"a",h:"—",v:"مِنْ أَبِيهِ",r:"سعد بن أبي وقاص ☆",n:"تقييد أخت الكلالة"}],
"5:6":[{t:"c",h:"وَأَرْجُلَكُمْ",v:"وَأَرْجُلِكُمْ",r:"نافع/ابن عامر/حمزة/الكسائي",n:"نصب=غسل vs جر=مسح — خلاف فقهي كبير"}],
"5:38":[{t:"c",h:"أَيْدِيَهُمَا",v:"أَيْمَانَهُمَا",r:"ابن مسعود ☆",n:"أيديَهما vs أيمانَهما — يقيّد باليمنى"}],
"5:45":[{t:"c",h:"عَلَيْهِمْ",v:"عَلَيْكُمْ",r:"أُبَيّ ☆",n:"عليهم (بني إسرائيل) vs عليكم (المسلمين)"}],
"5:89":[{t:"a",h:"—",v:"مُتَتَابِعَاتٍ",r:"ابن مسعود/أُبَيّ ☆",n:"إضافة 'متتابعات' — يوجب التتابع"}],
"11:46":[{t:"c",h:"عَمَلٌ غَيْرُ صَالِحٍ",v:"عَمِلَ غَيْرَ صَالِحٍ",r:"الكسائي",n:"عملٌ (اسم) vs عمِلَ (فعل) — الابن أم أفعاله؟"}],
"13:31":[{t:"c",h:"يَيْأَسِ",v:"يَتَبَيَّنِ",r:"عليّ/ابن عباس ☆",n:"ييأس vs يتبيّن — اختلاف جذري"}],
"24:27":[{t:"c",h:"تَسْتَأْنِسُوا",v:"تَسْتَأْذِنُوا",r:"ابن مسعود/ابن عباس ☆",n:"تستأنسوا vs تستأذنوا"}],
"33:6":[{t:"a",h:"—",v:"وَهُوَ أَبٌ لَهُمْ",r:"أُبَيّ ☆",n:"إضافة — النبي أب المؤمنين"}],
"33:49":[{t:"c",h:"تَعْتَدُّونَهَا",v:"يَعْتَدِدْنَهَا",r:"أبو عمرو",n:"أنتم vs هنّ"}],
"49:6":[{t:"c",h:"فَتَبَيَّنُوا",v:"فَتَثَبَّتُوا",r:"حمزة/الكسائي/خلف",n:"تبيّنوا vs تثبّتوا"}],
"57:7":[{t:"c",h:"مُّسْتَخْلَفِينَ",v:"مُسْتَخْلِفِينَ",r:"أُبَيّ ☆",n:"مستخلَفين vs مستخلِفين"}],
"66:3":[{t:"c",h:"عَرَّفَ",v:"عَرَفَ",r:"الكسائي",n:"عرَّف (أعلمها) vs عرَف (علم فقط)"}],
"81:24":[{t:"c",h:"بِضَنِينٍ",v:"بِظَنِينٍ",r:"ابن كثير/أبو عمرو/الكسائي",n:"ضنين (بخيل) vs ظنين (متّهم)"}],
"112:1":[{t:"d",h:"قُلْ هُوَ",v:"—",r:"ابن مسعود ☆",n:"حذف 'قل هو'"}],
};
const QT = { c: { l: "تغيير", col: "#f59e0b", ic: "⇄" }, a: { l: "إضافة", col: "#22c55e", ic: "+" }, d: { l: "حذف", col: "#ef4444", ic: "−" } };

function QiraatPanel({ verseKey, compact, theme }) {
  const items = Q[verseKey]; if (!items?.length) return null;
  const bg = theme === "light" ? "#f5f0ff" : "#0d0f1a";
  const bd = theme === "light" ? "#d8b4fe" : "#2a1f3d";
  return (
    <div style={{ background: bg, borderRadius: 8, padding: compact ? "4px 8px" : "8px 12px", border: `1px solid ${bd}`, marginTop: compact ? 4 : 8 }}>
      <div style={{ fontSize: compact ? 9 : 11, color: "#a78bfa", fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
        📜 قراءات أخرى ({items.length})
        {items.some(i => i.r.includes("☆")) && <span style={{ fontSize: 8, color: "#fbbf24" }}>☆ = شاذة</span>}
      </div>
      {items.map((it, i) => {
        const ty = QT[it.t];
        return (<div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: compact ? 3 : 6, padding: "3px 6px", background: ty.col + "0a", borderRadius: 6, borderRight: `3px solid ${ty.col}44` }}>
          <span style={{ fontSize: 12, minWidth: 16 }}>{ty.ic}</span>
          <div style={{ flex: 1, direction: "rtl" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {it.t !== "a" && <span style={{ fontSize: compact ? 12 : 14, color: theme === "light" ? "#64748b" : "#94a3b8", textDecoration: "line-through", textDecorationColor: "#ef444466" }}>{it.h}</span>}
              {it.t !== "d" && <span style={{ fontSize: compact ? 12 : 14, color: ty.col, fontWeight: 700 }}>{it.t === "a" ? "+" : "→"} {it.v}</span>}
            </div>
            <div style={{ fontSize: compact ? 8 : 9, color: "#7c3aed", marginTop: 1 }}>{it.r}</div>
            <div style={{ fontSize: compact ? 8 : 9, color: theme === "light" ? "#64748b" : "#475569", marginTop: 1 }}>{it.n}</div>
          </div>
        </div>);
      })}
    </div>
  );
}

/* ═══ Arabic ═══ */
function norm(w) {
  return w.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u08D4-\u08E1\u08F0-\u08F2\u0617-\u061A\u06E2-\u06E6\u06E8\u06EA-\u06EC]/g, "")
    .replace(/\u0640/g, "").replace(/[\u0671\u0622\u0623\u0625]/g, "\u0627")
    .replace(/\u0629/g, "\u0647").replace(/\u0649/g, "\u064A")
    .replace(/\u0624/g, "\u0648").replace(/\u0626/g, "\u064A")
    .replace(/[^\u0621-\u064A]/g, "").trim();
}

/* ═══ Real Arabic trilateral root extraction ═══ */
const ROOT_CACHE = {};
function extractRoot(w) {
  const n = norm(w);
  if (ROOT_CACHE[n]) return ROOT_CACHE[n];
  let r = n;
  // Phase 1: Strip prefixes (longest first)
  const prefixes = ["واستال","فاستال","باستال","واست","فاست","باست","والت","فالت","بالت","وانت","فانت","والم","فالم","بالم","وال","فال","بال","كال","است","انت","افت","الت","لل","ال","وت","فت","وي","في","ون","فن","بت","لت","لي","لن","سي","سن","وا","فا","با","لا","كا","و","ف","ب","ل","ك","س"];
  for (const p of prefixes) { if (r.length > p.length + 2 && r.startsWith(p)) { r = r.slice(p.length); break; } }
  // Phase 2: Strip suffixes (longest first)
  const suffixes = ["تموهن","تموها","كموها","وهما","تهما","تمون","كموه","تموه","وهن","وها","وهم","تهن","تها","تهم","كما","كمو","تمو","نهم","نها","نهن","يهم","يها","ونا","ينا","اتن","وكم","يكم","ون","وا","ين","ان","تم","تن","كن","كم","نا","ها","هم","هن","ني","يا","تا","ته","نه","يه","كه","ات","وه","ي","ه","ا","ت","ن","و"];
  for (const s of suffixes) { if (r.length > s.length + 2 && r.endsWith(s)) { r = r.slice(0, -s.length); break; } }
  // Phase 3: Handle known patterns to get trilateral
  if (r.length === 3) { ROOT_CACHE[n] = r; return r; }
  // 4-letter with known infixes/prefixes
  if (r.length === 4) {
    // مفعل، مفعل pattern
    if (r[0] === "\u0645") { const tri = r[1]+r[2]+r[3]; ROOT_CACHE[n] = tri; return tri; }
    // تفعل pattern
    if (r[0] === "\u062A") { const tri = r[1]+r[2]+r[3]; ROOT_CACHE[n] = tri; return tri; }
    // أفعل pattern
    if (r[0] === "\u0627") { const tri = r[1]+r[2]+r[3]; ROOT_CACHE[n] = tri; return tri; }
    // فعّل (doubled middle) → فعل
    if (r[1] === r[2]) { const tri = r[0]+r[1]+r[3]; ROOT_CACHE[n] = tri; return tri; }
    // فاعل (alif after first) → فعل
    if (r[1] === "\u0627") { const tri = r[0]+r[2]+r[3]; ROOT_CACHE[n] = tri; return tri; }
    // فعال pattern
    if (r[2] === "\u0627") { const tri = r[0]+r[1]+r[3]; ROOT_CACHE[n] = tri; return tri; }
    // فعول pattern
    if (r[2] === "\u0648") { const tri = r[0]+r[1]+r[3]; ROOT_CACHE[n] = tri; return tri; }
    // فعيل pattern
    if (r[2] === "\u064A") { const tri = r[0]+r[1]+r[3]; ROOT_CACHE[n] = tri; return tri; }
  }
  if (r.length === 5) {
    // تفعّل، تفاعل
    if (r[0] === "\u062A" && r[2] === r[3]) { const tri = r[1]+r[2]+r[4]; ROOT_CACHE[n] = tri; return tri; }
    if (r[0] === "\u062A" && r[2] === "\u0627") { const tri = r[1]+r[3]+r[4]; ROOT_CACHE[n] = tri; return tri; }
    // مفعول، مفعال، مفعيل
    if (r[0] === "\u0645") {
      if (r[3] === "\u0648" || r[3] === "\u0627" || r[3] === "\u064A") { const tri = r[1]+r[2]+r[4]; ROOT_CACHE[n] = tri; return tri; }
      if (r[2] === r[3]) { const tri = r[1]+r[2]+r[4]; ROOT_CACHE[n] = tri; return tri; }
    }
    // افتعل pattern
    if (r[0] === "\u0627" && r[2] === "\u062A") { const tri = r[1]+r[3]+r[4]; ROOT_CACHE[n] = tri; return tri; }
    // افعال
    if (r[0] === "\u0627" && r[3] === "\u0627") { const tri = r[1]+r[2]+r[4]; ROOT_CACHE[n] = tri; return tri; }
    // انفعل
    if (r[0] === "\u0627" && r[1] === "\u0646") { const tri = r[2]+r[3]+r[4]; ROOT_CACHE[n] = tri; return tri; }
    // generic 5: try removing middle long vowels
    for (let i = 1; i < r.length - 1; i++) {
      if ("\u0627\u0648\u064A".includes(r[i])) { const tri = r.slice(0,i)+r.slice(i+1); if (tri.length === 3) { ROOT_CACHE[n] = tri; return tri; } if (tri.length === 4) { const t2 = tri[0]+tri[1]+tri[3]; ROOT_CACHE[n] = t2; return t2; } }
    }
  }
  if (r.length >= 6) {
    // استفعل
    if (r.startsWith("\u0627\u0633\u062A")) { const rest = r.slice(3); if (rest.length === 3) { ROOT_CACHE[n] = rest; return rest; } if (rest.length >= 3) { const tri = rest[0]+rest[1]+rest[rest.length-1]; ROOT_CACHE[n] = tri; return tri; } }
    // Fallback: take chars at positions likely to be root
    const tri = r[r.length-3]+r[r.length-2]+r[r.length-1];
    ROOT_CACHE[n] = tri; return tri;
  }
  // Fallback for length 2
  ROOT_CACHE[n] = r.length >= 2 ? r : n;
  return ROOT_CACHE[n];
}

const STOP = new Set("في,من,على,الى,عن,ان,لا,ما,هو,لم,قد,بل,ثم,او,كل,هم,هن,هي,نحن,الذي,الذين,التي,ذلك,هذا,هذه,تلك,الا,اذا,اذ,حتى,لن,لو,مع,بين,عند,فيه,فيها,منه,منها,عليه,عليها,اليه,اليها,به,بها,له,لها,لهم,لكم,لنا,بكم,منكم,عليكم,فيهم,منهم,عليهم,وما,فما,بما,مما,عما,كما,لما,فلا,ولا,يا,قل,قالوا,قال,كان,كانوا,كانت,ايها,انه,انها,انا,لك,ذا,اولئك,هولاء,كيف,اين,متى,هل,الله,رب,ربك,ربكم,ربه,ربهم,انما,عليكم,ذلكم,الذين".split(","));

function fColor(c) { if (c <= 2) return "#ff6b6b"; if (c <= 5) return "#ff922b"; if (c <= 15) return "#fcc419"; if (c <= 40) return "#51cf66"; if (c <= 100) return "#339af0"; return "#868e96"; }
const DC = ["#fbbf24","#60a5fa","#cc5de8","#51cf66","#ff922b","#ff6b6b","#e599f7","#66d9e8","#ffa94d","#c0eb75"];
function dColor(d) { return DC[Math.min(d, DC.length - 1)]; }

/* ═══ Themes ═══ */
const THEMES = {
  dark: { bg: "#060a14", panel: "#0c1222", panelBorder: "#1a2744", text: "#e2e8f0", textDim: "#94a3b8", textFaint: "#475569", grid: "#1a274418", ayahText: "#f1f5f9", link: "#1a3060", linkCenter: "#2a4f8e", nodeFill: "44", nodeWordFill: "33" },
  light: { bg: "#f8fafc", panel: "#ffffff", panelBorder: "#e2e8f0", text: "#1e293b", textDim: "#64748b", textFaint: "#94a3b8", grid: "#cbd5e118", ayahText: "#1e293b", link: "#cbd5e1", linkCenter: "#93c5fd", nodeFill: "66", nodeWordFill: "55" },
};

/* ═══ Highlighted Ayah ═══ */
function HighlightedAyah({ text, primaryWord, sharedWords = [], interactive, onWordClick, activeGraphWord, searchMode, theme = "dark" }) {
  if (!text) return null;
  const T = THEMES[theme];
  const matchFn = searchMode === "root"
    ? (n) => (primaryWord && extractRoot(n) === primaryWord) || (activeGraphWord && extractRoot(n) === activeGraphWord)
    : (n) => (primaryWord && n === primaryWord) || (activeGraphWord && n === activeGraphWord);
  const sharedFn = searchMode === "root"
    ? (n) => sharedWords.some(w => extractRoot(norm(w)) === extractRoot(n) || norm(w) === n)
    : (n) => sharedWords.some(w => norm(w) === n || w === n);
  return (
    <span>{text.split(/(\s+)/).map((p, i) => {
      if (/^\s+$/.test(p)) return <span key={i}> </span>;
      const n = norm(p);
      const isPri = matchFn(n); const isShared = !isPri && sharedFn(n);
      const click = interactive && n.length >= 2;
      let bg = "transparent", color = T.text, fw = "normal", bd = "none";
      if (isPri) { bg = theme === "light" ? "#fca5a544" : "#ef444455"; color = theme === "light" ? "#dc2626" : "#fca5a5"; fw = "700"; bd = `1px solid ${theme === "light" ? "#dc262644" : "#ef444488"}`; }
      else if (isShared) { bg = theme === "light" ? "#fbbf2433" : "#f59e0b33"; color = theme === "light" ? "#b45309" : "#fcd34d"; bd = `1px solid ${theme === "light" ? "#fbbf2444" : "#f59e0b44"}`; }
      return <span key={i} style={{ background: bg, color, fontWeight: fw, borderRadius: 4, padding: bg !== "transparent" ? "1px 4px" : "0", border: bd, cursor: click ? "pointer" : "default", transition: "all 0.15s" }}
        onClick={click ? e => { e.stopPropagation(); onWordClick?.(n); } : undefined}
        onMouseEnter={click ? e => { if (!isPri && !isShared) { e.target.style.background = theme === "light" ? "#e2e8f044" : "#ffffff15"; e.target.style.borderBottom = `1px dashed ${theme === "light" ? "#3b82f6" : "#60a5fa"}`; } } : undefined}
        onMouseLeave={click ? e => { if (!isPri && !isShared) { e.target.style.background = "transparent"; e.target.style.borderBottom = "none"; } } : undefined}
      >{p}</span>;
    })}</span>
  );
}

/* ═══ Force layout ═══ */
function forceLayout(nodes, links, W, H, iters = 160) {
  const cx = W / 2, cy = H / 2, nm = {};
  nodes.forEach((n, i) => { nm[n.id] = n; if (n.fixed) { n.x = cx; n.y = cy; } else if (n.x !== undefined && n.y !== undefined) {} else { const a = (i / nodes.length) * Math.PI * 2 + (n.depth || 1) * 0.3, r = 110 + (n.depth || 1) * 100 + Math.random() * 30; n.x = cx + Math.cos(a) * r; n.y = cy + Math.sin(a) * r; } n.vx = 0; n.vy = 0; });
  for (let it = 0; it < iters; it++) { const al = (1 - it / iters) * 0.85; nodes.forEach(n => { if (n.fixed) return; n.vx += (cx - n.x) * 0.002 * al; n.vy += (cy - n.y) * 0.002 * al; }); for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const a = nodes[i], b = nodes[j]; let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy; if (d2 > 300000) continue; let dist = Math.sqrt(d2) || 1; if (dist < a.r + b.r + 22) { const f = (a.r + b.r + 22 - dist) / dist * 0.6 * al; if (!a.fixed) { a.vx -= dx * f; a.vy -= dy * f; } if (!b.fixed) { b.vx += dx * f; b.vy += dy * f; } } const rep = -55 * al / (d2 + 200); if (!a.fixed) { a.vx += dx / dist * rep; a.vy += dy / dist * rep; } if (!b.fixed) { b.vx -= dx / dist * rep; b.vy -= dy / dist * rep; } } links.forEach(l => { const s = nm[l.source], t = nm[l.target]; if (!s || !t) return; let dx = t.x - s.x, dy = t.y - s.y, dist = Math.sqrt(dx * dx + dy * dy) || 1; const f = (dist - (l.dist || 110)) / dist * 0.06 * al; if (!s.fixed) { s.vx += dx * f; s.vy += dy * f; } if (!t.fixed) { t.vx -= dx * f; t.vy -= dy * f; } }); nodes.forEach(n => { if (n.fixed) return; n.vx *= 0.65; n.vy *= 0.65; n.x += n.vx; n.y += n.vy; n.x = Math.max(40, Math.min(W - 40, n.x)); n.y = Math.max(40, Math.min(H - 40, n.y)); }); }
  return nodes;
}

function getUW(v, hs, mode) { const s = new Set(); return v.words.filter(w => { const key = mode === "root" ? extractRoot(w.norm) : w.norm; if (s.has(key)) return false; s.add(key); return !(hs && STOP.has(w.norm)); }).map(w => ({ ...w, lookup: mode === "root" ? extractRoot(w.norm) : w.norm })); }
function getDescendants(nid, links) { const ch = new Set(), cm = {}; links.forEach(l => { if (!cm[l.source]) cm[l.source] = []; cm[l.source].push(l.target); }); const q = [nid]; while (q.length) { const c = q.shift(); ch.add(c); (cm[c] || []).forEach(x => { if (!ch.has(x)) q.push(x); }); } return ch; }
function getPathToCenter(nid, pm) { const p = new Set(); let c = nid, s = 200; while (c && s-- > 0) { p.add(c); c = pm[c]; } return p; }

/* ═══ Lazy Graph Builder ═══ */
function buildLazyGraph(centerKey, verseData, w2v, r2v, expandedWords, expandedVerses, hideStop, maxBranch, searchMode, showQiraat) {
  const nodes = [], links = [], loopLinks = [], parentMap = {};
  const addedNodes = new Set(), visitedVerses = new Set();
  const cv = verseData[centerKey]; if (!cv) return { nodes, links, loopLinks, parentMap };
  const index = searchMode === "root" ? r2v : w2v;
  const centerId = "v:" + centerKey;
  nodes.push({ id: centerId, type: "center", verseKey: centerKey, label: `${cv.sn} ${cv.a}`, text: cv.text, r: 28, color: "#fbbf24", fixed: true, depth: 0, words: cv.words });
  addedNodes.add(centerId); visitedVerses.add(centerKey);

  // Add qiraat variant nodes for center
  if (showQiraat && Q[centerKey]) {
    Q[centerKey].forEach((qi, idx) => {
      const qid = `q:${centerKey}:${idx}`;
      const label = qi.t === "d" ? `−${qi.h}` : qi.t === "a" ? `+${qi.v}` : qi.v;
      nodes.push({ id: qid, type: "qiraat", label, reader: qi.r, note: qi.n, qType: qi.t, hafs: qi.h, variant: qi.v, r: 14, color: QT[qi.t].col, depth: 0.5 });
      addedNodes.add(qid); links.push({ source: centerId, target: qid, dist: 80 });
    });
  }

  const queue = [{ type: "show-words", verseId: centerId, verseKey: centerKey, depth: 0 }];
  expandedVerses.forEach(vk => { if (vk !== centerKey) queue.push({ type: "show-words", verseId: "v:" + vk, verseKey: vk, depth: -1 }); });
  let safety = 5000;
  while (queue.length > 0 && safety-- > 0) {
    const item = queue.shift();
    if (item.type === "show-words") {
      const v = verseData[item.verseKey]; if (!v) continue;
      getUW(v, hideStop, searchMode).forEach(w => {
        const wid = `w:${w.lookup}@${item.verseKey}`; if (addedNodes.has(wid)) return;
        const count = (index[w.lookup] || []).length;
        const expKey = `${w.lookup}@${item.verseKey}`;
        const isExp = expandedWords.has(expKey);
        nodes.push({ id: wid, type: "word", wordNorm: w.norm, lookup: w.lookup, label: w.orig, count, r: Math.min(7 + Math.log2(count + 1) * 3, 20), color: fColor(count), depth: item.depth + 1, isExpanded: isExp, parentVerseKey: item.verseKey, rootLabel: searchMode === "root" ? w.lookup : null });
        addedNodes.add(wid); parentMap[wid] = item.verseId;
        links.push({ source: item.verseId, target: wid, dist: 130 });
        if (isExp) queue.push({ type: "show-verses", wordId: wid, lookup: w.lookup, fromVerseKey: item.verseKey, depth: item.depth + 1 });
      });
    } else if (item.type === "show-verses") {
      (index[item.lookup] || []).filter(vk => vk !== item.fromVerseKey).slice(0, maxBranch).forEach(vk => {
        const vid = "v:" + vk;
        if (visitedVerses.has(vk)) { if (addedNodes.has(vid)) loopLinks.push({ source: item.wordId, target: vid }); return; }
        visitedVerses.add(vk); const v = verseData[vk]; if (!v) return;
        const cNorms = new Set(cv.words.map(w => searchMode === "root" ? extractRoot(w.norm) : w.norm));
        const shared = [...new Set(v.words.filter(w => cNorms.has(searchMode === "root" ? extractRoot(w.norm) : w.norm)).map(w => w.orig))];
        const isVE = expandedVerses.has(vk);
        if (!addedNodes.has(vid)) {
          nodes.push({ id: vid, type: "verse", verseKey: vk, surahNum: v.s, ayahNum: v.a, label: `${v.sn} ${v.a}`, text: v.text, r: Math.min(7 + shared.length * 1.5, 18), color: dColor(item.depth), sharedWords: shared, sharedCount: shared.length, depth: item.depth, connectingWord: item.lookup, words: v.words, isExpanded: isVE });
          addedNodes.add(vid); parentMap[vid] = item.wordId;
        }
        links.push({ source: item.wordId, target: vid, dist: 95 });
        // Qiraat for child verses
        if (showQiraat && Q[vk]) {
          Q[vk].forEach((qi, idx) => {
            const qid = `q:${vk}:${idx}`; if (addedNodes.has(qid)) return;
            const label = qi.t === "d" ? `−${qi.h}` : qi.t === "a" ? `+${qi.v}` : qi.v;
            nodes.push({ id: qid, type: "qiraat", label, reader: qi.r, note: qi.n, qType: qi.t, hafs: qi.h, variant: qi.v, r: 10, color: QT[qi.t].col, depth: item.depth + 0.5 });
            addedNodes.add(qid); links.push({ source: vid, target: qid, dist: 55 });
          });
        }
        if (isVE) queue.push({ type: "show-words", verseId: vid, verseKey: vk, depth: item.depth + 1 });
      });
    }
  }
  return { nodes, links, loopLinks, parentMap };
}

/* ═══ MAIN ═══ */
export default function QuranNetwork() {
  const [quranRaw, setQuranRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [surah, setSurah] = useState(2); const [ayah, setAyah] = useState(228);
  const [maxBranch, setMaxBranch] = useState(10);
  const [hideStop, setHideStop] = useState(true); const [showLoops, setShowLoops] = useState(true);
  const [searchMode, setSearchMode] = useState("exact");
  const [showQiraat, setShowQiraat] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [expandedWords, setExpandedWords] = useState(new Set());
  const [expandedVerses, setExpandedVerses] = useState(new Set());
  const [hovered, setHovered] = useState(null); const [selected, setSelected] = useState(null);
  const [activeWord, setActiveWord] = useState(null);
  const [hist, setHist] = useState([]);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isPanning, setIsPanning] = useState(false); const [panStart, setPanStart] = useState(null);
  const [positions, setPositions] = useState({}); const [dragId, setDragId] = useState(null);
  const dragStartRef = useRef(null); const containerRef = useRef();
  const [dims, setDims] = useState({ w: 900, h: 600 });
  const [showHelp, setShowHelp] = useState(false);
  const T = THEMES[theme];

  useEffect(() => { const u = () => { if (containerRef.current) { const r = containerRef.current.getBoundingClientRect(); setDims({ w: r.width, h: r.height }); } }; u(); window.addEventListener("resize", u); return () => window.removeEventListener("resize", u); }, [loading]);
  useEffect(() => { fetch("https://cdn.jsdelivr.net/npm/quran-json@3.1.2/dist/quran.json").then(r => r.json()).then(d => { setQuranRaw(d); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const { w2v, r2v, verseData, surahList } = useMemo(() => {
    if (!quranRaw) return { w2v: {}, r2v: {}, verseData: {}, surahList: [] };
    const w2v = {}, r2v = {}, vd = {}, sl = [];
    for (const s of quranRaw) { sl.push({ id: s.id, name: s.name, count: s.total_verses }); for (const v of s.verses) { const vk = `${s.id}:${v.id}`; const words = []; for (const raw of v.text.split(/\s+/)) { const n = norm(raw); if (n.length >= 2) { words.push({ orig: raw, norm: n }); if (!w2v[n]) w2v[n] = []; if (!w2v[n].includes(vk)) w2v[n].push(vk); const root = extractRoot(n); if (!r2v[root]) r2v[root] = []; if (!r2v[root].includes(vk)) r2v[root].push(vk); } } vd[vk] = { text: v.text, s: s.id, a: v.id, sn: s.name, words }; } }
    return { w2v, r2v, verseData: vd, surahList: sl };
  }, [quranRaw]);

  const currentKey = `${surah}:${ayah}`;
  const currentVerse = verseData[currentKey];
  const ayahCount = quranRaw?.find(s => s.id === surah)?.total_verses || 1;

  const { graphNodes, graphLinks, loopLinks, parentMap } = useMemo(() => {
    if (!currentVerse) return { graphNodes: [], graphLinks: [], loopLinks: [], parentMap: {} };
    const r = buildLazyGraph(currentKey, verseData, w2v, r2v, expandedWords, expandedVerses, hideStop, maxBranch, searchMode, showQiraat);
    const newN = r.nodes.map(n => positions[n.id] ? { ...n, x: positions[n.id].x, y: positions[n.id].y } : { ...n });
    if (newN.some(n => !positions[n.id] && !n.fixed)) {
      const laid = forceLayout(newN, r.links, dims.w, dims.h, 140);
      const np = {}; laid.forEach(n => { if (!n.fixed) np[n.id] = { x: n.x, y: n.y }; });
      setTimeout(() => setPositions(prev => { const m = { ...prev }; for (const [id, pos] of Object.entries(np)) { if (!m[id]) m[id] = pos; } return m; }), 0);
      return { graphNodes: laid, graphLinks: r.links, loopLinks: r.loopLinks, parentMap: r.parentMap };
    }
    return { graphNodes: newN, graphLinks: r.links, loopLinks: r.loopLinks, parentMap: r.parentMap };
  }, [currentVerse, currentKey, verseData, w2v, r2v, expandedWords, expandedVerses, hideStop, maxBranch, searchMode, showQiraat, dims]);

  useEffect(() => { const ids = new Set(graphNodes.map(n => n.id)); setPositions(prev => { const c = {}; for (const [k, v] of Object.entries(prev)) { if (ids.has(k)) c[k] = v; } return c; }); }, [graphNodes]);

  const nmap = useMemo(() => { const m = {}; graphNodes.forEach(n => m[n.id] = n); return m; }, [graphNodes]);
  const wordToNodeIds = useMemo(() => { const m = {}; graphNodes.forEach(n => { if (n.type === "word") { const key = n.lookup || n.wordNorm; if (!m[key]) m[key] = []; m[key].push(n.id); } }); return m; }, [graphNodes]);
  const highlightSet = useMemo(() => { if (!selected) return null; return new Set([...getPathToCenter(selected, parentMap), ...getDescendants(selected, graphLinks)]); }, [selected, parentMap, graphLinks]);
  const highlightLinks = useMemo(() => { if (!highlightSet) return null; const s = new Set(); graphLinks.forEach((l, i) => { if (highlightSet.has(l.source) && highlightSet.has(l.target)) s.add(i); }); return s; }, [highlightSet, graphLinks]);
  const activeWordNodeIds = useMemo(() => !activeWord ? new Set() : new Set(wordToNodeIds[activeWord] || []), [activeWord, wordToNodeIds]);

  const getPos = useCallback(n => positions[n.id] || { x: n.x, y: n.y }, [positions]);
  const getConnWord = useCallback(n => n?.connectingWord || (parentMap[n?.id] ? nmap[parentMap[n.id]]?.lookup || nmap[parentMap[n.id]]?.wordNorm : null), [parentMap, nmap]);
  const reset = useCallback(() => { setExpandedWords(new Set()); setExpandedVerses(new Set()); setSelected(null); setActiveWord(null); setPositions({}); setTransform({ x: 0, y: 0, k: 1 }); }, []);
  const navigate = useCallback((s, a) => { setHist(h => [...h, { s: surah, a: ayah }]); setSurah(s); setAyah(a); reset(); }, [surah, ayah, reset]);
  const goBack = useCallback(() => { if (!hist.length) return; const p = hist[hist.length - 1]; setHist(h => h.slice(0, -1)); setSurah(p.s); setAyah(p.a); reset(); }, [hist, reset]);

  const toggleWord = useCallback((lookup, fromVerseKey) => {
    const key = `${lookup}@${fromVerseKey}`;
    setExpandedWords(prev => { const n = new Set(prev); if (n.has(key)) { const wid = `w:${lookup}@${fromVerseKey}`; const desc = getDescendants(wid, graphLinks); const nw = new Set(n); nw.delete(key); nw.forEach(ek => { const vk = ek.split("@").slice(1).join("@"); if (desc.has(`v:${vk}`)) nw.delete(ek); }); setExpandedVerses(p2 => { const nv = new Set(p2); desc.forEach(d => { if (d.startsWith("v:")) nv.delete(d.slice(2)); }); return nv; }); return nw; } else { n.add(key); return n; } });
  }, [graphLinks]);
  const toggleVerse = useCallback((verseKey) => {
    setExpandedVerses(prev => { const n = new Set(prev); if (n.has(verseKey)) { const vid = `v:${verseKey}`; const desc = getDescendants(vid, graphLinks); const nv = new Set(n); nv.delete(verseKey); desc.forEach(d => { if (d.startsWith("v:") && d !== vid) nv.delete(d.slice(2)); }); setExpandedWords(p2 => { const nw = new Set(p2); nw.forEach(ek => { const vk = ek.split("@").slice(1).join("@"); if (desc.has(`v:${vk}`)) nw.delete(ek); }); return nw; }); return nv; } else { n.add(verseKey); return n; } });
  }, [graphLinks]);

  const handleWheel = useCallback(e => { e.preventDefault(); const d = e.deltaY > 0 ? 0.9 : 1.1; setTransform(t => { const nk = Math.max(0.08, Math.min(8, t.k * d)); const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return { ...t, k: nk }; const mx = e.clientX - rect.left, my = e.clientY - rect.top; return { k: nk, x: mx - (mx - t.x) * (nk / t.k), y: my - (my - t.y) * (nk / t.k) }; }); }, []);
  const svgToWorld = useCallback((cx, cy) => { const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return { x: 0, y: 0 }; return { x: (cx - rect.left - transform.x) / transform.k, y: (cy - rect.top - transform.y) / transform.k }; }, [transform]);
  const startDrag = useCallback((nodeId, clientX, clientY) => { const desc = getDescendants(nodeId, graphLinks); const wp = svgToWorld(clientX, clientY); const np = {}; desc.forEach(did => { const n = nmap[did]; if (n) { const p = positions[did] || { x: n.x, y: n.y }; np[did] = { x: p.x, y: p.y }; } }); dragStartRef.current = { worldPos: wp, nodePositions: np }; setDragId(nodeId); }, [graphLinks, nmap, positions, svgToWorld]);
  const handleBgDown = useCallback(e => { if (e.target.closest("[data-node]") || e.target.closest("[data-panel]")) return; setIsPanning(true); setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y }); }, [transform]);
  const handleMove = useCallback(e => { if (dragId && dragStartRef.current) { const cur = svgToWorld(e.clientX, e.clientY); const dx = cur.x - dragStartRef.current.worldPos.x, dy = cur.y - dragStartRef.current.worldPos.y; setPositions(prev => { const next = { ...prev }; for (const [id, op] of Object.entries(dragStartRef.current.nodePositions)) next[id] = { x: op.x + dx, y: op.y + dy }; return next; }); } else if (isPanning && panStart) { setTransform(t => ({ ...t, x: e.clientX - panStart.x, y: e.clientY - panStart.y })); } }, [dragId, isPanning, panStart, svgToWorld]);
  const handleUp = useCallback(() => { setDragId(null); dragStartRef.current = null; setIsPanning(false); setPanStart(null); }, []);

  // Click word in ANY ayah (top or bottom) → expand in graph
  const handleWordClick = useCallback((wordNorm, fromVerseKey) => {
    const lookup = searchMode === "root" ? extractRoot(wordNorm) : wordNorm;
    const vk = fromVerseKey || currentKey;
    if (activeWord === lookup) { setActiveWord(null); setSelected(null); }
    else { setActiveWord(lookup); const nids = wordToNodeIds[lookup]; if (nids?.length) setSelected(nids[0]); toggleWord(lookup, vk); }
  }, [activeWord, wordToNodeIds, toggleWord, currentKey, searchMode]);

  const hovNode = hovered ? nmap[hovered] : null;
  const selNode = selected ? nmap[selected] : null;

  if (loading) return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: T.bg, fontFamily: "Arial" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🕸️</div>
      <div style={{ fontSize: 15, color: T.textDim, letterSpacing: 2 }}>جارٍ تحميل الشبكة القرآنية...</div>
      <div style={{ width: 220, height: 3, background: T.panelBorder, marginTop: 16, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: "100%", height: "100%", background: "linear-gradient(90deg, #3b82f6, #a855f7, #3b82f6)", backgroundSize: "200%", animation: "sh 1.5s infinite linear" }} />
      </div>
      <style>{`@keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );

  const totalExp = expandedWords.size + expandedVerses.size;
  const SS = {
    sel: { background: theme === "light" ? "#f1f5f9" : "#070b14", color: T.text, border: `1px solid ${T.panelBorder}`, borderRadius: 5, padding: "2px 5px", fontSize: 11, direction: "rtl" },
    btn: { background: theme === "light" ? "#f1f5f9" : "#0c1222", color: T.textDim, border: `1px solid ${T.panelBorder}`, borderRadius: 5, padding: "2px 7px", cursor: "pointer", fontSize: 10 },
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: T.bg, color: T.text, fontFamily: "Arial", overflow: "hidden" }}>
      {/* Controls */}
      <div style={{ background: T.panel, borderBottom: `1px solid ${T.panelBorder}`, padding: "6px 10px", flexShrink: 0, zIndex: 20, direction: "rtl" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 800, color: "#60a5fa", fontSize: 13 }}>🕸️</span>
            <select value={surah} onChange={e => { setSurah(+e.target.value); setAyah(1); reset(); }} style={SS.sel}>
              {surahList.map(s => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}
            </select>
            <select value={ayah} onChange={e => { setAyah(+e.target.value); reset(); }} style={{ ...SS.sel, width: 55 }}>
              {Array.from({ length: ayahCount }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: `1px solid ${T.panelBorder}` }}>
              <button onClick={() => { setSearchMode("exact"); reset(); }} style={{ ...SS.btn, border: "none", ...(searchMode === "exact" ? { background: "#1e40af33", color: "#60a5fa", fontWeight: 700 } : {}) }}>📝 كلمة</button>
              <button onClick={() => { setSearchMode("root"); reset(); }} style={{ ...SS.btn, border: "none", ...(searchMode === "root" ? { background: "#22c55e22", color: "#22c55e", fontWeight: 700 } : {}) }}>🌿 جذر</button>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 2, cursor: "pointer", fontSize: 9, color: T.textDim }}>
              <input type="checkbox" checked={showQiraat} onChange={e => setShowQiraat(e.target.checked)} /><span style={{ color: "#a78bfa" }}>📜 قراءات</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 3, background: theme === "light" ? "#f1f5f9" : "#0a0e1a", borderRadius: 6, padding: "2px 8px", border: `1px solid ${T.panelBorder}` }}>
              <span style={{ fontSize: 9, color: "#cc5de8" }}>لكل كلمة</span>
              <input type="range" min={3} max={50} value={maxBranch} onChange={e => setMaxBranch(+e.target.value)} style={{ width: 50, accentColor: "#cc5de8" }} />
              <span style={{ fontSize: 11, color: "#cc5de8", fontWeight: 700, minWidth: 16 }}>{maxBranch}</span>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 2, cursor: "pointer", fontSize: 9, color: T.textDim }}><input type="checkbox" checked={hideStop} onChange={e => setHideStop(e.target.checked)} /> أدوات</label>
            <label style={{ display: "flex", alignItems: "center", gap: 2, cursor: "pointer", fontSize: 9, color: T.textDim }}><input type="checkbox" checked={showLoops} onChange={e => setShowLoops(e.target.checked)} /> حلقات</label>
            <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} style={{ ...SS.btn, fontSize: 12 }}>{theme === "dark" ? "☀️" : "🌙"}</button>
            {totalExp > 0 && <button onClick={reset} style={{ ...SS.btn, color: "#ff6b6b" }}>↺ طي</button>}
            {(selected || activeWord) && <button onClick={() => { setSelected(null); setActiveWord(null); }} style={{ ...SS.btn, color: "#fcc419" }}>✦</button>}
            <button onClick={() => setShowHelp(h => !h)} style={{ ...SS.btn, color: showHelp ? "#60a5fa" : T.textFaint }}>؟</button>
            <button onClick={() => setTransform({ x: 0, y: 0, k: 1 })} style={SS.btn}>⟲</button>
            {hist.length > 0 && <button onClick={goBack} style={{ ...SS.btn, color: "#fbbf24" }}>→</button>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 3, fontSize: 9, color: T.textFaint, flexWrap: "wrap" }}>
          <span>{graphNodes.length} عقدة · {graphLinks.length} رابط</span>
          <span style={{ color: searchMode === "root" ? "#22c55e" : "#60a5fa" }}>{searchMode === "root" ? "🌿 جذر ثلاثي" : "📝 تطابق"}</span>
        </div>
        {showHelp && (
          <div style={{ background: theme === "light" ? "#f8fafc" : "#0a0e1a", borderRadius: 8, padding: "8px 12px", marginTop: 6, border: `1px solid ${T.panelBorder}`, fontSize: 11, lineHeight: 2.2, color: T.textDim }}>
            <b style={{ color: "#22c55e" }}>🌿 جذر:</b> يستخرج الجذر الثلاثي — أشهُر/شهور/شهر/الأشهر → ش ه ر<br />
            <b style={{ color: "#60a5fa" }}>📝 كلمة:</b> تطابق دقيق<br />
            <b style={{ color: "#a78bfa" }}>📜 قراءات:</b> عُقد بنفسجية تظهر الاختلافات بين القراء (☆ = شاذة). فعّل/عطّل بالزر.<br />
            <b>اضغط كلمة</b> (في الآية أو الشبكة) → توسيع. مرة ثانية → طي تلقائي مع الفروع.
          </div>
        )}
      </div>

      {/* Graph */}
      <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden", cursor: dragId ? "grabbing" : isPanning ? "grabbing" : "grab" }}
        onMouseDown={e => { if (!e.target.closest("[data-node]") && !e.target.closest("[data-panel]")) handleBgDown(e); }}
        onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp} onWheel={handleWheel}>

        <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(circle, ${T.grid} 1px, transparent 1px)`, backgroundSize: "30px 30px", pointerEvents: "none" }} />

        {/* Top ayah */}
        {currentVerse && (
          <div data-panel="1" style={{ position: "absolute", top: 6, left: 6, right: 6, background: T.panel + (theme === "dark" ? "ee" : "f0"), backdropFilter: "blur(8px)", borderRadius: 8, padding: "8px 12px", border: `1px solid ${T.panelBorder}`, direction: "rtl", zIndex: 5 }}>
            <div style={{ fontSize: 17, lineHeight: 2.2, color: T.ayahText }}>
              <HighlightedAyah text={currentVerse.text} primaryWord={activeWord || (hovNode?.type === "word" ? (hovNode.lookup || hovNode.wordNorm) : null)} interactive={true} onWordClick={(wn) => handleWordClick(wn, currentKey)} activeGraphWord={hovNode?.type === "word" ? (hovNode.lookup || hovNode.wordNorm) : null} searchMode={searchMode} theme={theme} />
            </div>
            <div style={{ fontSize: 9, color: T.textFaint, marginTop: 2 }}>
              {currentVerse.sn} — الآية {currentVerse.a}
              {Q[currentKey] && <span style={{ color: "#a78bfa", marginRight: 8 }}>📜 {Q[currentKey].length} قراءة</span>}
            </div>
            {Q[currentKey] && <QiraatPanel verseKey={currentKey} compact={true} theme={theme} />}
          </div>
        )}

        <svg width={dims.w} height={dims.h} style={{ position: "absolute", inset: 0 }}>
          <defs><marker id="arrL" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ff6b6b" opacity="0.6" /></marker></defs>
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
            {graphLinks.map((l, i) => {
              const s = nmap[l.source], t = nmap[l.target]; if (!s || !t) return null;
              const sp = getPos(s), tp = getPos(t);
              const isQ = s.type === "qiraat" || t.type === "qiraat";
              const isC = s.type === "center" || t.type === "center";
              const onP = highlightLinks ? highlightLinks.has(i) : true;
              const onA = activeWordNodeIds.size > 0 && (activeWordNodeIds.has(l.source) || activeWordNodeIds.has(l.target));
              const bright = onP || onA;
              return <line key={`l${i}`} x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y}
                stroke={isQ ? "#a78bfa33" : bright ? (onA ? "#fcc41955" : isC ? T.linkCenter : T.link) : (theme === "light" ? "#e2e8f0" : "#0a1020")}
                strokeWidth={isQ ? 0.8 : bright ? (isC ? 1.8 : 1) : 0.3}
                strokeOpacity={bright ? 0.7 : 0.1}
                strokeDasharray={isQ ? "3,3" : "none"} />;
            })}
            {showLoops && loopLinks.map((l, i) => {
              const s = nmap[l.source], t = nmap[l.target]; if (!s || !t) return null;
              const sp = getPos(s), tp = getPos(t), mx = (sp.x + tp.x) / 2, my = (sp.y + tp.y) / 2, dx = tp.x - sp.x, dy = tp.y - sp.y;
              return <path key={`lp${i}`} d={`M ${sp.x} ${sp.y} Q ${mx - dy * 0.3} ${my + dx * 0.3} ${tp.x} ${tp.y}`} fill="none" stroke="#ff6b6b" strokeWidth={1.2} strokeDasharray="4,3" strokeOpacity={0.4} markerEnd="url(#arrL)" />;
            })}

            {graphNodes.map(n => {
              const p = getPos(n);
              const isH = hovered === n.id, isS = selected === n.id;
              const isAW = activeWordNodeIds.has(n.id);
              const onP = highlightSet ? highlightSet.has(n.id) : true;
              const bright = onP || isAW;
              const opacity = bright ? 1 : (highlightSet || activeWordNodeIds.size > 0) ? 0.1 : 1;
              const r = isH ? n.r * 1.35 : isS || isAW ? n.r * 1.2 : n.r;
              const isWE = n.type === "word" && n.isExpanded;
              const isVE = n.type === "verse" && n.isExpanded;
              const isQN = n.type === "qiraat";

              return (
                <g key={n.id} data-node="1" style={{ cursor: "pointer", opacity, transition: "opacity 0.25s" }}
                  onMouseDown={e => { e.stopPropagation(); if (!n.fixed) startDrag(n.id, e.clientX, e.clientY); }}
                  onMouseEnter={() => { setHovered(n.id); if (n.type === "word") setActiveWord(n.lookup || n.wordNorm); }}
                  onMouseLeave={() => { setHovered(null); if (!selected) setActiveWord(null); }}
                  onClick={e => {
                    e.stopPropagation();
                    if (n.type === "center") { setSelected(null); setActiveWord(null); return; }
                    if (n.type === "word") { toggleWord(n.lookup || n.wordNorm, n.parentVerseKey); setActiveWord(n.lookup || n.wordNorm); setSelected(n.id); }
                    else if (n.type === "verse") { if (selected === n.id) toggleVerse(n.verseKey); else { setSelected(n.id); setActiveWord(null); } }
                    else if (isQN) { setSelected(n.id); }
                  }}>

                  {(isWE || isVE) && <circle cx={p.x} cy={p.y} r={r + 7} fill="none" stroke={isWE ? "#22c55e" : "#cc5de8"} strokeWidth={2} opacity={0.3} strokeDasharray={isVE ? "4,2" : "none"} />}
                  {(isS || isAW) && <circle cx={p.x} cy={p.y} r={r + 10} fill="none" stroke={isAW ? "#fcc419" : n.color} strokeWidth={2} opacity={0.3}><animate attributeName="r" values={`${r + 8};${r + 14};${r + 8}`} dur="2s" repeatCount="indefinite" /></circle>}

                  {isQN ? (
                    <rect x={p.x - r} y={p.y - r * 0.6} width={r * 2} height={r * 1.2} rx={4}
                      fill={n.color + "22"} stroke={n.color} strokeWidth={isH ? 2 : 1.2} strokeDasharray="3,2" />
                  ) : (
                    <circle cx={p.x} cy={p.y} r={r}
                      fill={isAW ? "#fcc41944" : isWE ? "#22c55e33" : isVE ? "#cc5de833" : n.color + T.nodeFill}
                      stroke={isS ? (theme === "light" ? "#1e293b" : "#fff") : isAW ? "#fcc419" : isWE ? "#22c55e" : isVE ? "#cc5de8" : isH ? (theme === "light" ? "#1e293b" : "#fff") : n.color}
                      strokeWidth={n.type === "center" ? 3 : isH || isS || isAW ? 2.5 : isWE || isVE ? 2 : n.type === "word" ? 1.8 : 1} />
                  )}

                  {n.type === "word" && <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={8} fontWeight="bold" fill={theme === "light" ? "#1e293b" : "#fff"} style={{ pointerEvents: "none" }}>{n.count || ""}</text>}
                  {n.type === "verse" && (n.sharedCount || 0) > 1 && <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize={7} fill="#fcc419" fontWeight="bold" style={{ pointerEvents: "none" }}>{n.sharedCount}</text>}

                  <text x={p.x} y={isQN ? p.y + r * 0.6 + 11 : n.type === "word" ? p.y - r - 4 : p.y + r + 11}
                    textAnchor="middle" fontSize={isQN ? 9 : n.type === "center" ? 12 : n.type === "word" ? 11 : 8}
                    fontWeight={n.type !== "verse" ? "bold" : "normal"} fill={isS || isAW ? (theme === "light" ? "#1e293b" : "#fff") : isQN ? n.color : n.type === "verse" ? T.textDim : n.color}
                    direction="rtl" style={{ pointerEvents: "none" }}>{n.label}</text>

                  {n.type === "word" && n.rootLabel && n.rootLabel !== norm(n.label) && (
                    <text x={p.x} y={p.y - r - 15} textAnchor="middle" fontSize={8} fill="#22c55e" opacity={0.7} direction="rtl" style={{ pointerEvents: "none" }}>({n.rootLabel})</text>
                  )}
                  {n.type === "word" && !isWE && n.count > 1 && <text x={p.x + r + 3} y={p.y + 3} fontSize={10} fill={T.textFaint} style={{ pointerEvents: "none" }}>+</text>}
                  {isWE && <circle cx={p.x + r - 1} cy={p.y - r + 1} r={5} fill="#22c55e" stroke={T.bg} strokeWidth={1.5} />}
                  {n.type === "verse" && Q[n.verseKey] && <g><circle cx={p.x - r} cy={p.y + r - 2} r={5} fill="#7c3aed" stroke={T.bg} strokeWidth={1.5} /><text x={p.x - r} y={p.y + r + 1} textAnchor="middle" fontSize={6} fill="#fff" style={{ pointerEvents: "none" }}>📜</text></g>}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Hover tooltip */}
        {hovNode && hovNode.type !== "center" && !selNode && (
          <div data-panel="1" style={{ position: "absolute", bottom: 12, left: 12, right: 12, background: T.panel + (theme === "dark" ? "f5" : "f8"), backdropFilter: "blur(12px)", borderRadius: 10, padding: "10px 14px", border: `1px solid ${hovNode.color}44`, direction: "rtl", zIndex: 30, pointerEvents: hovNode.type === "verse" ? "auto" : "none", maxHeight: "28vh", overflow: "auto" }}>
            {hovNode.type === "word" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: hovNode.color }}>{hovNode.label}</span>
                {hovNode.rootLabel && <span style={{ fontSize: 12, color: "#22c55e" }}>جذر: {hovNode.rootLabel}</span>}
                <span style={{ fontSize: 10, color: fColor(hovNode.count), background: fColor(hovNode.count) + "22", padding: "1px 8px", borderRadius: 10 }}>{hovNode.count} آية</span>
              </div>
            ) : hovNode.type === "qiraat" ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: hovNode.color }}>{QT[hovNode.qType]?.ic} {hovNode.label}</span>
                <span style={{ fontSize: 10, color: "#7c3aed" }}>{hovNode.reader}</span>
                <span style={{ fontSize: 10, color: T.textFaint }}>{hovNode.note}</span>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: hovNode.color }}>{hovNode.label}</span>
                  {Q[hovNode.verseKey] && <span style={{ fontSize: 9, color: "#a78bfa" }}>📜 {Q[hovNode.verseKey].length}</span>}
                </div>
                <div style={{ fontSize: 15, lineHeight: 2, color: T.text }}>
                  <HighlightedAyah text={hovNode.text} primaryWord={getConnWord(hovNode)} sharedWords={hovNode.sharedWords || []} searchMode={searchMode} theme={theme}
                    interactive={true} onWordClick={(wn) => handleWordClick(wn, hovNode.verseKey)} />
                </div>
              </>
            )}
          </div>
        )}

        {/* Selected panel */}
        {selNode && (
          <div data-panel="1" style={{ position: "absolute", bottom: 6, left: 6, right: 6, background: T.panel + (theme === "dark" ? "f8" : "fa"), backdropFilter: "blur(12px)", borderRadius: 10, padding: 12, border: `1px solid ${selNode.color}55`, direction: "rtl", zIndex: 25, maxHeight: "32vh", overflow: "auto" }}>
            {selNode.type === "word" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: selNode.color }}>{selNode.label}</span>
                    {selNode.rootLabel && <span style={{ fontSize: 13, color: "#22c55e", background: "#22c55e22", padding: "2px 8px", borderRadius: 8 }}>جذر: {selNode.rootLabel}</span>}
                    <span style={{ fontSize: 11, color: fColor(selNode.count), background: fColor(selNode.count) + "22", padding: "2px 10px", borderRadius: 10 }}>{selNode.count} آية</span>
                  </div>
                  <button onClick={() => { setSelected(null); setActiveWord(null); }} style={{ ...SS.btn, fontSize: 11 }}>✕</button>
                </div>
                {(() => { const pid = parentMap[selNode.id], parent = pid ? nmap[pid] : null; if (parent?.text) return (<div style={{ background: theme === "light" ? "#f1f5f9" : "#0a0e1a", borderRadius: 8, padding: "6px 10px" }}><div style={{ fontSize: 9, color: T.textFaint, marginBottom: 3 }}>من: {parent.label}</div><div style={{ fontSize: 15, lineHeight: 2, color: T.text }}><HighlightedAyah text={parent.text} primaryWord={selNode.lookup || selNode.wordNorm} searchMode={searchMode} theme={theme} interactive={true} onWordClick={(wn) => handleWordClick(wn, parent.verseKey)} /></div></div>); return null; })()}
              </>
            ) : selNode.type === "qiraat" ? (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: selNode.color }}>{QT[selNode.qType]?.ic} {selNode.label}</span>
                {selNode.hafs && <span style={{ color: T.textDim, textDecoration: "line-through" }}>{selNode.hafs}</span>}
                <div style={{ fontSize: 11, color: "#7c3aed" }}>{selNode.reader}</div>
                <div style={{ fontSize: 11, color: T.textDim }}>{selNode.note}</div>
                <button onClick={() => { setSelected(null); }} style={{ ...SS.btn, fontSize: 11 }}>✕</button>
              </div>
            ) : selNode.type === "verse" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: selNode.color }}>📖 {selNode.label}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => toggleVerse(selNode.verseKey)} style={{ ...SS.btn, color: selNode.isExpanded ? "#ff6b6b" : "#cc5de8", fontSize: 11 }}>{selNode.isExpanded ? "⊖ طي" : "⊕ كلمات"}</button>
                    <button onClick={() => navigate(selNode.surahNum, selNode.ayahNum)} style={{ ...SS.btn, color: "#60a5fa", fontSize: 11 }}>🔍</button>
                    <button onClick={() => { setSelected(null); setActiveWord(null); }} style={{ ...SS.btn, fontSize: 11 }}>✕</button>
                  </div>
                </div>
                <div style={{ fontSize: 17, lineHeight: 2.2, color: T.ayahText }}>
                  <HighlightedAyah text={selNode.text} primaryWord={getConnWord(selNode)} sharedWords={selNode.sharedWords || []} searchMode={searchMode} theme={theme}
                    interactive={true} onWordClick={(wn) => handleWordClick(wn, selNode.verseKey)} />
                </div>
                {(selNode.sharedWords || []).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: "#fcc419" }}>مشتركة:</span>
                    {selNode.sharedWords.map((w, i) => <span key={i} style={{ fontSize: 11, color: "#fcd34d", background: "#fcc41922", padding: "1px 7px", borderRadius: 5, border: "1px solid #fcc41933" }}>{w}</span>)}
                  </div>
                )}
                {selNode.verseKey && Q[selNode.verseKey] && <QiraatPanel verseKey={selNode.verseKey} theme={theme} />}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
