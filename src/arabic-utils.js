/* Arabic text normalization — shared across graph + network views */
export function norm(w) {
  return w
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u08D4-\u08E1\u08F0-\u08F2\u0617-\u061A\u06E2-\u06E6\u06E8\u06EA-\u06EC]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[\u0671\u0622\u0623\u0625]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064A")
    .replace(/[^\u0621-\u064A]/g, "")
    .trim();
}

/* Trilateral root extraction (from quran_network_v8) */
const ROOT_CACHE = {};
export function extractRoot(w) {
  const n = norm(w);
  if (ROOT_CACHE[n]) return ROOT_CACHE[n];
  let r = n;
  const prefixes = ["واستال","فاستال","باستال","واست","فاست","باست","والت","فالت","بالت","وانت","فانت","والم","فالم","بالم","وال","فال","بال","كال","است","انت","افت","الت","لل","ال","وت","فت","وي","في","ون","فن","بت","لت","لي","لن","سي","سن","وا","فا","با","لا","كا","و","ف","ب","ل","ك","س"];
  for (const p of prefixes) { if (r.length > p.length + 2 && r.startsWith(p)) { r = r.slice(p.length); break; } }
  const suffixes = ["تموهن","تموها","كموها","وهما","تهما","تمون","كموه","تموه","وهن","وها","وهم","تهن","تها","تهم","كما","كمو","تمو","نهم","نها","نهن","يهم","يها","ونا","ينا","اتن","وكم","يكم","ون","وا","ين","ان","تم","تن","كن","كم","نا","ها","هم","هن","ني","يا","تا","ته","نه","يه","كه","ات","وه","ي","ه","ا","ت","ن","و"];
  for (const s of suffixes) { if (r.length > s.length + 2 && r.endsWith(s)) { r = r.slice(0, -s.length); break; } }
  if (r.length === 3) { ROOT_CACHE[n] = r; return r; }
  if (r.length === 4) {
    if (r[0] === "\u0645") { const tri = r[1]+r[2]+r[3]; ROOT_CACHE[n] = tri; return tri; }
    if (r[0] === "\u062A") { const tri = r[1]+r[2]+r[3]; ROOT_CACHE[n] = tri; return tri; }
    if (r[0] === "\u0627") { const tri = r[1]+r[2]+r[3]; ROOT_CACHE[n] = tri; return tri; }
    if (r[1] === r[2]) { const tri = r[0]+r[1]+r[3]; ROOT_CACHE[n] = tri; return tri; }
    if (r[1] === "\u0627") { const tri = r[0]+r[2]+r[3]; ROOT_CACHE[n] = tri; return tri; }
    if (r[2] === "\u0627") { const tri = r[0]+r[1]+r[3]; ROOT_CACHE[n] = tri; return tri; }
    if (r[2] === "\u0648") { const tri = r[0]+r[1]+r[3]; ROOT_CACHE[n] = tri; return tri; }
    if (r[2] === "\u064A") { const tri = r[0]+r[1]+r[3]; ROOT_CACHE[n] = tri; return tri; }
  }
  if (r.length === 5) {
    if (r[0] === "\u062A" && r[2] === r[3]) { const tri = r[1]+r[2]+r[4]; ROOT_CACHE[n] = tri; return tri; }
    if (r[0] === "\u062A" && r[2] === "\u0627") { const tri = r[1]+r[3]+r[4]; ROOT_CACHE[n] = tri; return tri; }
    if (r[0] === "\u0645") {
      if (r[3] === "\u0648" || r[3] === "\u0627" || r[3] === "\u064A") { const tri = r[1]+r[2]+r[4]; ROOT_CACHE[n] = tri; return tri; }
      if (r[2] === r[3]) { const tri = r[1]+r[2]+r[4]; ROOT_CACHE[n] = tri; return tri; }
    }
    if (r[0] === "\u0627" && r[2] === "\u062A") { const tri = r[1]+r[3]+r[4]; ROOT_CACHE[n] = tri; return tri; }
    if (r[0] === "\u0627" && r[3] === "\u0627") { const tri = r[1]+r[2]+r[4]; ROOT_CACHE[n] = tri; return tri; }
    if (r[0] === "\u0627" && r[1] === "\u0646") { const tri = r[2]+r[3]+r[4]; ROOT_CACHE[n] = tri; return tri; }
    for (let i = 1; i < r.length - 1; i++) {
      if ("\u0627\u0648\u064A".includes(r[i])) { const tri = r.slice(0,i)+r.slice(i+1); if (tri.length === 3) { ROOT_CACHE[n] = tri; return tri; } if (tri.length === 4) { const t2 = tri[0]+tri[1]+tri[3]; ROOT_CACHE[n] = t2; return t2; } }
    }
  }
  if (r.length >= 6) {
    if (r.startsWith("\u0627\u0633\u062A")) { const rest = r.slice(3); if (rest.length === 3) { ROOT_CACHE[n] = rest; return rest; } if (rest.length >= 3) { const tri = rest[0]+rest[1]+rest[rest.length-1]; ROOT_CACHE[n] = tri; return tri; } }
    const tri = r[r.length-3]+r[r.length-2]+r[r.length-1];
    ROOT_CACHE[n] = tri; return tri;
  }
  ROOT_CACHE[n] = r.length >= 2 ? r : n;
  return ROOT_CACHE[n];
}

export const STOP = new Set("في,من,على,الى,عن,ان,لا,ما,هو,لم,قد,بل,ثم,او,كل,هم,هن,هي,نحن,الذي,الذين,التي,ذلك,هذا,هذه,تلك,الا,اذا,اذ,حتى,لن,لو,مع,بين,عند,فيه,فيها,منه,منها,عليه,عليها,اليه,اليها,به,بها,له,لها,لهم,لكم,لنا,بكم,منكم,عليكم,فيهم,منهم,عليهم,وما,فما,بما,مما,عما,كما,لما,فلا,ولا,يا,قل,قالوا,قال,كان,كانوا,كانت,ايها,انه,انها,انا,لك,ذا,اولئك,هولاء,كيف,اين,متى,هل,الله,رب,ربك,ربكم,ربه,ربهم,انما,عليكم,ذلكم,الذين".split(","));
