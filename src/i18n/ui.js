/* Shared UI-primitive strings (ui.*): method disclosure, empty/error states,
 * significance, coverage caveats, collocation metric + window controls. Reused
 * across the analysis labs so the wording stays consistent. */
export const ar = {
  // Method disclosure
  "ui.method": "الطريقة",
  "ui.methodAria": "تفاصيل الطريقة",
  // States
  "ui.loading": "جارٍ التحميل…",
  "ui.empty": "لا نتائج",
  "ui.error": "تعذّر تحميل البيانات",
  "ui.retry": "إعادة المحاولة",
  "ui.showMore": "أظهر {n} أخرى (بقي {total})",
  // Significance (Dunning G² vs χ², 1 df)
  "ui.sig": "الدلالة الإحصائية",
  "ui.sig.0": "غير دالّ",
  "ui.sig.1": "دالّ (p<٠٫٠٥)",
  "ui.sig.2": "دالّ جدًّا (p<٠٫٠١)",
  "ui.sig.3": "دالّ للغاية (p<٠٫٠٠١)",
  // Coverage caveat — {n} of {m} tokens, {pct}%
  "ui.coverage": "محسوب على {n} من {m} مفردة مجذورة ({pct}٪)",
  "ui.coverageRoot": "تغطية الجذور: {pct}٪ — المفردات بلا جذر (أدوات، أعلام) مستثناة",
  // Collocation metrics
  "ui.metric.count": "العدد",
  "ui.metric.count.title": "عدد الآيات المشتركة",
  "ui.metric.ll": "G²",
  "ui.metric.ll.title": "نسبة الأرجحية اللوغاريتمية (دَنِنغ) — دلالة الاقتران مع اتجاهه",
  "ui.metric.pmi": "PMI",
  "ui.metric.pmi.title": "المعلومات المتبادلة النقطية — يبالغ في تقدير النوادر",
  "ui.metric.logdice": "Log-Dice",
  "ui.metric.logdice.title": "مقياس الاقتران المستقر عن التكرار (رِيشلي) — من ٠ إلى ١٤",
  // Window
  "ui.window": "النافذة",
  "ui.window.whole": "الآية كاملة",
  "ui.window.sym": "متماثلة",
  "ui.window.left": "قبل",
  "ui.window.right": "بعد",
};

export const en = {
  "ui.method": "Method",
  "ui.methodAria": "Method details",
  "ui.loading": "Loading…",
  "ui.empty": "No results",
  "ui.error": "Couldn't load data",
  "ui.retry": "Retry",
  "ui.showMore": "Show {n} more ({total} left)",
  "ui.sig": "Significance",
  "ui.sig.0": "not significant",
  "ui.sig.1": "significant (p<.05)",
  "ui.sig.2": "highly significant (p<.01)",
  "ui.sig.3": "very highly significant (p<.001)",
  "ui.coverage": "computed over {n} of {m} rooted tokens ({pct}%)",
  "ui.coverageRoot": "Root coverage: {pct}% — unrooted tokens (particles, proper nouns) excluded",
  "ui.metric.count": "Count",
  "ui.metric.count.title": "Number of shared verses",
  "ui.metric.ll": "G²",
  "ui.metric.ll.title": "Dunning log-likelihood ratio — significance + direction of association",
  "ui.metric.pmi": "PMI",
  "ui.metric.pmi.title": "Pointwise mutual information — over-rewards rare pairs",
  "ui.metric.logdice": "Log-Dice",
  "ui.metric.logdice.title": "Frequency-stable collocation measure (Rychlý) — 0 to 14",
  "ui.window": "Window",
  "ui.window.whole": "Whole verse",
  "ui.window.sym": "Symmetric",
  "ui.window.left": "Before",
  "ui.window.right": "After",
};
