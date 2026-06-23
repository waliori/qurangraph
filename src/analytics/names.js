/* ═══ Divine names (أسماء الله الحسنى) ═══
 *
 * The traditional ninety-nine names (al-Tirmidhī's well-known enumeration), each mapped to its
 * triliteral ROOT so it links to that root's attestations in the Qurʾān. The count shown is the
 * root FAMILY's occurrences (verses), not a claim that the name-form itself occurs that often —
 * many names (الباسط، القابض…) are attributes whose ROOT is Qurʾanic though the definite name is
 * not. This is the canonical reference list; the Qurʾanic link is the root.
 *
 * `الله` and the two compound names (مالك الملك، ذو الجلال والإكرام) are listed without a single
 * root anchor (root: null) — shown for completeness, not linked.
 *
 * Pure; `r2v` is root→verses for the family counts.
 */

// [display name, root|null]. Roots use the QAC spelling (hamza as أ); validated at runtime
// against r2v (an unknown root simply yields count 0 and no link).
export const NAMES_99 = [
  ["الله", null], ["الرحمن", "رحم"], ["الرحيم", "رحم"], ["الملك", "ملك"], ["القدوس", "قدس"],
  ["السلٰم", "سلم"], ["المؤمن", "أمن"], ["المهيمن", "همن"], ["العزيز", "عزز"], ["الجبار", "جبر"],
  ["المتكبر", "كبر"], ["الخٰلق", "خلق"], ["البارئ", "برأ"], ["المصور", "صور"], ["الغفٰر", "غفر"],
  ["القهار", "قهر"], ["الوهاب", "وهب"], ["الرزاق", "رزق"], ["الفتاح", "فتح"], ["العليم", "علم"],
  ["القابض", "قبض"], ["الباسط", "بسط"], ["الخافض", "خفض"], ["الرافع", "رفع"], ["المعز", "عزز"],
  ["المذل", "ذلل"], ["السميع", "سمع"], ["البصير", "بصر"], ["الحكم", "حكم"], ["العدل", "عدل"],
  ["اللطيف", "لطف"], ["الخبير", "خبر"], ["الحليم", "حلم"], ["العظيم", "عظم"], ["الغفور", "غفر"],
  ["الشكور", "شكر"], ["العلي", "علو"], ["الكبير", "كبر"], ["الحفيظ", "حفظ"], ["المقيت", "قوت"],
  ["الحسيب", "حسب"], ["الجليل", "جلل"], ["الكريم", "كرم"], ["الرقيب", "رقب"], ["المجيب", "جوب"],
  ["الواسع", "وسع"], ["الحكيم", "حكم"], ["الودود", "ودد"], ["المجيد", "مجد"], ["الباعث", "بعث"],
  ["الشهيد", "شهد"], ["الحق", "حقق"], ["الوكيل", "وكل"], ["القوي", "قوي"], ["المتين", "متن"],
  ["الولي", "ولي"], ["الحميد", "حمد"], ["المحصي", "حصي"], ["المبدئ", "بدأ"], ["المعيد", "عود"],
  ["المحيي", "حيي"], ["المميت", "موت"], ["الحي", "حيي"], ["القيوم", "قوم"], ["الواجد", "وجد"],
  ["الماجد", "مجد"], ["الوٰحد", "وحد"], ["الأحد", "أحد"], ["الصمد", "صمد"], ["القادر", "قدر"],
  ["المقتدر", "قدر"], ["المقدم", "قدم"], ["المؤخر", "أخر"], ["الأول", "أول"], ["الآخر", "أخر"],
  ["الظاهر", "ظهر"], ["الباطن", "بطن"], ["الوالي", "ولي"], ["المتعالي", "علو"], ["البر", "برر"],
  ["التواب", "توب"], ["المنتقم", "نقم"], ["العفو", "عفو"], ["الرؤوف", "رأف"], ["مالك الملك", "ملك"],
  ["ذو الجلال والإكرام", "جلل"], ["المقسط", "قسط"], ["الجامع", "جمع"], ["الغني", "غني"], ["المغني", "غني"],
  ["المانع", "منع"], ["الضار", "ضرر"], ["النافع", "نفع"], ["النور", "نور"], ["الهادي", "هدي"],
  ["البديع", "بدع"], ["الباقي", "بقي"], ["الوارث", "ورث"], ["الرشيد", "رشد"], ["الصبور", "صبر"],
];

/* The ninety-nine names with their attestation, at TWO distinct levels:
 *   familyCount — verses containing the name's ROOT family (الباسط → بسط, however inflected)
 *   formCount   — verses containing the definite name-FORM itself (الباسط as written), or null
 *                 when no exact index is supplied. Many names have a Qurʾanic root but the
 *                 definite form is rare or absent, so the two genuinely differ.
 * `r2v` is root→verses; the optional `w2v` (exact form → verses) + `keyOf` (name → its exact
 * index key, precision-aware) give the form count. Returns [{ name, root, familyCount,
 * formCount, count }] in canonical order; `count` aliases familyCount for back-compat. */
export function divineNames(r2v, w2v, keyOf) {
  return NAMES_99.map(([name, root]) => {
    const familyCount = root && r2v && r2v[root] ? r2v[root].length : 0;
    let formCount = null;
    if (w2v && keyOf) { const k = keyOf(name); formCount = w2v[k] ? w2v[k].length : 0; }
    return { name, root: root || null, familyCount, formCount, count: familyCount };
  });
}
