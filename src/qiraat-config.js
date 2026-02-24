export const NARRATIONS = [
  { key: "hafs",   label: "Hafs",    ar: "حفص",    font: "KFGQPC-Hafs" },
  { key: "warsh",  label: "Warsh",   ar: "ورش",    font: "KFGQPC-Warsh" },
  { key: "qaloon", label: "Qaloon",  ar: "قالون",   font: "KFGQPC-Qaloon" },
  { key: "shouba", label: "Shu'bah", ar: "شعبة",   font: "KFGQPC-Shouba" },
  { key: "doori",  label: "Doori",   ar: "الدوري",  font: "KFGQPC-Doori" },
  { key: "soosi",  label: "Soosi",   ar: "السوسي",  font: "KFGQPC-Soosi" },
  { key: "bazzi",  label: "Bazzi",   ar: "البزي",   font: "KFGQPC-Bazzi" },
  { key: "qumbul", label: "Qunbul",  ar: "قنبل",   font: "KFGQPC-Qumbul" },
];

export const NARRATION_MAP = Object.fromEntries(NARRATIONS.map(n => [n.key, n]));
