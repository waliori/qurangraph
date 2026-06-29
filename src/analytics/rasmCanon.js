import { rasmKey } from "../arabic-utils.js";
import { deAffix } from "../search.js";

/* ═══ Canonical رسم المصحف reference (القواعد الست) ═══
 *
 * The scholarly inventory of where the Uthmanic rasm (Ḥafṣ / Madinah muṣḥaf) departs from modern
 * imlāʾī orthography, organised on the six rules every official body uses — الحذف · الزيادة · الهمز ·
 * البدل · الفصل والوصل · ما فيه قراءتان. Extracted faithfully from a reference document built on
 * «المقنع في رسم مصاحف الأمصار» لأبي عمرو الداني (ت ٤٤٤هـ), with the methodological caveat that the
 * PRINTED Madinah Ḥafṣ muṣḥaf follows أبو داود سليمان بن نجاح «مختصر التبيين», which differs from al-Dānī
 * on specific words — so this canon is the well-known agreed core, cited to its source for verification.
 *
 * This is a CITED REFERENCE, not the data: our muṣḥaf text already IS the rasm. `reconcileCanon`
 * locates every entry in the actual text and reports detected-count beside the canon's stated count,
 * so discrepancies are surfaced (skeleton matching can over/under-count — e.g. a tāʾ-maftūḥa singular
 * collides with its plural). Each entry: { rasm (Uthmani form, may carry the dagger), modern, refs
 * (sūra/āya hint), note?, count? (canon's stated number of places) }.
 */
export const RASM_CANON = {
  meta: {
    title: "الكلمات المرسومة في المصحف على خلاف الرسم الإملائي",
    transmission: "رواية حفص — مصحف المدينة (يتبع مختصر التبيين لأبي داود)",
    transmissionEn: "Ḥafṣ transmission — Madinah muṣḥaf (follows Abū Dāwūd's Mukhtaṣar al-Tabyīn)",
    note: "الرسم نقلٌ روائي تتفاوت فيه اختيارات العلماء؛ والقوائم تجمع المشهور المتّفق عليه وتُحيل إلى «المقنع» للداني. عند التحقيق تُقابَل كل كلمة على «مختصر التبيين» لأبي داود (عليه عمل مصحف المدينة المطبوع) لا على «المقنع» وحده.",
    sources: [
      { ar: "المقنع في رسم مصاحف الأمصار — أبو عمرو الداني (ت ٤٤٤هـ)", role: "المرجع الأمّ" },
      { ar: "مختصر التبيين لهجاء التنزيل — أبو داود سليمان بن نجاح (ت ٤٩٦هـ)", role: "عليه عمل مصحف المدينة (حفص)" },
      { ar: "عقيلة أتراب القصائد — الشاطبي · مورد الظمآن — الخرّاز", role: "منظومتان جامعتان" },
      { ar: "سمير الطالبين في رسم وضبط الكتاب المبين — علي محمد الضباع", role: "أوضح ترتيب حديث" },
      { ar: "مجمع الملك فهد لطباعة المصحف الشريف · مشروع مصحف قطر · دار الإفتاء المصرية", role: "مصادر مؤسسية رسمية" },
    ],
  },
  rules: [
    {
      id: "hadhf", ar: "الحذف", en: "Omission", source: "المقنع — أبواب الحذف (ص٢٠ وما بعدها)",
      def: "حذف حرف من الكلمة رسمًا لا لفظًا، ويدخل على الألف والياء والواو واللام والنون.",
      defEn: "A letter dropped from the written form but kept in pronunciation — affecting alif, yāʾ, wāw, lām and nūn.",
      groups: [
        {
          id: "alif", ar: "حذف الألف", en: "Omitted alif", source: "المقنع ص٢٠+",
          def: "الألف أكثر الحروف حذفًا (ألف خنجرية)؛ ومنه ألف النداء (يٰأيها) وألف ها التنبيه (هٰأنتم).",
          defEn: "The alif is the most often dropped letter (marked by a dagger ٰ) — including the alif of the vocative (يٰأيها) and of demonstrative hā (هٰأنتم).",
          entries: [
            { rasm: "إِبْرٰهيم", alts: ["إِبْرٰهم"], modern: "إبراهيم", refs: "البقرة وغيرها", note: "تُرسم إبرٰهم في البقرة غالبًا، وإبرٰهيم في غيرها" },
            { rasm: "إِسْمٰعيل", modern: "إسماعيل", refs: "متعددة" },
            { rasm: "إِسْحٰق", modern: "إسحاق", refs: "متعددة" },
            { rasm: "هٰرون", modern: "هارون", refs: "متعددة" },
            { rasm: "سُليمٰن", modern: "سليمان", refs: "متعددة" },
            { rasm: "عِمْرٰن", modern: "عمران", refs: "آل عمران" },
            { rasm: "لُقمٰن", modern: "لقمان", refs: "لقمان" },
            { rasm: "الرَّحْمٰن", modern: "الرحمن", refs: "متعددة", note: "حذف ألف رحمٰن" },
            { rasm: "العٰلمين", modern: "العالمين", refs: "متعددة" },
            { rasm: "السَّمٰوات", alts: ["السَّموٰت"], modern: "السماوات", refs: "متعددة", note: "حذف الألفين" },
            { rasm: "الكِتٰب", modern: "الكتاب", refs: "متعددة" },
            { rasm: "يٰأيها", modern: "يا أيها", refs: "متعددة", note: "حذف ألف النداء" },
            { rasm: "هٰأنتم", modern: "ها أنتم", refs: "متعددة", note: "حذف ألف ها التنبيه" },
            { rasm: "ذٰلك", modern: "ذلك", refs: "متعددة", note: "ألف خنجرية" },
            { rasm: "أُولٰئك", modern: "أولئك", refs: "متعددة", note: "ألف خنجرية" },
            { rasm: "هٰذا", modern: "هذا", refs: "متعددة", note: "ألف خنجرية" },
            { rasm: "ثلٰث", alts: ["ثلٰثة"], modern: "ثلاث", refs: "متعددة" },
          ],
        },
        {
          id: "yaa", ar: "حذف الياء", en: "Omitted yāʾ", source: "المقنع ص٢٧+",
          def: "تُحذف الياء اجتزاءً بكسر ما قبلها، غالبًا في أواخر الأفعال والأسماء المنقوصة، وبعضها لموافقة قراءة.",
          defEn: "The yāʾ is dropped, the preceding kasra standing in for it — usually at the end of verbs and defective nouns; some cases follow a reading.",
          entries: [
            { rasm: "يُؤْتِ", modern: "يؤتي", refs: "النساء", note: "وسوف يؤت — حذف الياء لغير الجازم" },
            { rasm: "يَدْعُ الداعِ", modern: "يدعو الداعي", refs: "القمر/الإسراء" },
            { rasm: "يَوْمَ يَأْتِ", modern: "يأتي", refs: "هود" },
            { rasm: "نَبْغِ", modern: "نبغي", refs: "الكهف", note: "ما كنا نبغ" },
            { rasm: "المُتَعالِ", modern: "المتعالي", refs: "الرعد", note: "الكبير المتعال" },
            { rasm: "الجوارِ", modern: "الجواري", refs: "الشورى/التكوير" },
            { rasm: "أكرَمَنِ", alts: ["أهانَنِ"], modern: "أكرمني/أهانني", refs: "الفجر", note: "حذف ياء المتكلم" },
            { rasm: "آتانِ", modern: "آتاني", refs: "النمل", note: "فما آتانِ الله" },
            { rasm: "يَسْرِ", modern: "يسري", refs: "الفجر", note: "والليل إذا يسر" },
          ],
        },
        {
          id: "waw", ar: "حذف الواو", en: "Omitted wāw", source: "المقنع ص٣١+",
          def: "تُحذف الواو اكتفاءً بالضمة، خاصةً حين تجتمع واوان، أو لموافقة قراءة.",
          defEn: "The wāw is dropped, the ḍamma standing in for it — especially where two wāws meet, or to follow a reading.",
          entries: [
            { rasm: "يَمْحُ الله", modern: "يمحو", refs: "الشورى", note: "حذف الواو لغير الجازم" },
            { rasm: "يَدْعُ الإنسان", modern: "يدعو", refs: "الإسراء" },
            { rasm: "سَنَدْعُ الزبانية", modern: "سندعو", refs: "العلق" },
            { rasm: "وَيَدْعُ الإنسان", modern: "ويدعو", refs: "الإسراء" },
          ],
        },
        {
          id: "lam-nun", ar: "حذف اللام والنون", en: "Omitted lām / nūn", source: "المقنع ص٦١",
          def: "تُحذف إحدى اللامين عند الإدغام، وتُحذف النون في مواضع.",
          defEn: "One of two lāms is dropped on assimilation, and the nūn is dropped in certain words.",
          entries: [
            { rasm: "الَّيل", modern: "الليل", refs: "متعددة", note: "حذف إحدى اللامين (وكذلك الَّذي والَّتي)" },
            { rasm: "فَنُجِّيَ", modern: "فننجّي", refs: "الأنبياء", note: "حذف إحدى النونين" },
            { rasm: "لا تَأْمَنّا", modern: "تأمننا", refs: "يوسف", note: "بنون واحدة" },
          ],
        },
      ],
    },
    {
      id: "ziyada", ar: "الزيادة", en: "Addition", source: "المقنع — فصل الزيادة (ص٣٦) وباب زيادة الواو (ص٤٨)",
      def: "إثبات حرف في الرسم لا يُنطق، ويكون في الألف والواو والياء.",
      defEn: "A letter written but not pronounced — occurring with alif, wāw and yāʾ.",
      groups: [
        {
          id: "alif", ar: "زيادة الألف", en: "Added alif", source: "المقنع ص٣٦",
          def: "ألف زائدة في الرسم معدومة في اللفظ.",
          defEn: "An extra alif in the writing, absent in speech.",
          entries: [
            { rasm: "مِائة", alts: ["مِائتين"], modern: "مئة", refs: "متعددة", note: "زيادة ألف بعد الميم" },
            { rasm: "لَشَايْءٍ", modern: "لشيء", refs: "الكهف", note: "زيادة ألف بعد الشين" },
            { rasm: "لٰكِنَّا", modern: "لكنّا", refs: "الكهف", note: "هو الله ربي" },
            { rasm: "الظُّنونا", modern: "الظنون", refs: "الأحزاب", note: "زيادة ألف في رؤوس الآي (والرسولا والسبيلا)" },
            { rasm: "جَزٰٓؤُا", alts: ["مَلٰٓؤُا", "تَفْتَؤُا"], modern: "جزاء", refs: "متعددة", note: "ألف بعد واو الهمزة" },
            { rasm: "أوضَعوا", modern: "أوضعوا", refs: "التوبة", note: "لأَاذبحنّه (النمل) كذلك" },
          ],
        },
        {
          id: "waw", ar: "زيادة الواو", en: "Added wāw", source: "المقنع ص٤٨",
          def: "واو زائدة في الرسم.",
          defEn: "An extra wāw in the writing.",
          entries: [
            { rasm: "أُولُوا", alts: ["أُولِي"], modern: "أولو", refs: "متعددة" },
            { rasm: "أُولٰٓئك", modern: "أولئك", refs: "متعددة", note: "زيادة واو (مع حذف ألف)" },
            { rasm: "أُولاء", alts: ["أُولات"], modern: "أولاء", refs: "متعددة" },
            { rasm: "سَأُوْريكم", modern: "سأريكم", refs: "الأعراف/الأنبياء" },
          ],
        },
        {
          id: "yaa", ar: "زيادة الياء", en: "Added yāʾ", source: "المقنع ص٣٦",
          def: "ياء زائدة في الرسم.",
          defEn: "An extra yāʾ in the writing.",
          entries: [
            { rasm: "بِأَييْدٍ", modern: "بأيدٍ", refs: "الذاريات", note: "والسماء بنيناها بأييد" },
            { rasm: "نَبَإِيْ", modern: "نبأ", refs: "الأنعام", note: "من نبإِ المرسلين" },
            { rasm: "مَلَإِيْه", modern: "ملئه", refs: "متعددة" },
            { rasm: "أَفَإِيْن مات", modern: "أفإن", refs: "آل عمران" },
          ],
        },
      ],
    },
    {
      id: "badal", ar: "البدل", en: "Substitution", source: "المقنع — رسم الألف واوًا (ص٤٩) وهاءات التأنيث (ص٧١)",
      def: "إبدال حرف مكان آخر في الرسم؛ ومنه الألف واوًا للتفخيم، ونون التوكيد الخفيفة ألفًا، وتاء التأنيث المربوطة تاءً مفتوحة.",
      defEn: "One letter drawn in place of another — ā as a wāw (for tafkhīm), the light emphatic nūn as an alif, and the closed tāʾ marbūṭa as an open tāʾ.",
      groups: [
        {
          id: "alif-waw", ar: "الألف تُرسم واوًا (التفخيم)", en: "ā written as wāw (tafkhīm)", source: "المقنع ص٤٩",
          def: "الألف الممدودة تُرسم واوًا في كلمات معدودة.",
          defEn: "The long ā is drawn as a wāw in a small, countable set of words.",
          entries: [
            { rasm: "الصَّلوٰة", modern: "الصلاة", refs: "متعددة" },
            { rasm: "الزَّكوٰة", modern: "الزكاة", refs: "متعددة" },
            { rasm: "الحَيوٰة", modern: "الحياة", refs: "متعددة" },
            { rasm: "الرِّبوٰا", modern: "الربا", refs: "البقرة" },
            { rasm: "مِشكوٰة", modern: "مشكاة", refs: "النور" },
            { rasm: "النَّجوٰة", alts: ["الغَدوٰة"], modern: "النجاة", refs: "غافر/الأنعام" },
            { rasm: "مَنوٰة", modern: "مناة", refs: "النجم" },
          ],
        },
        {
          id: "nun-taa", ar: "نون التوكيد ألفًا، وتاء التأنيث مفتوحة", en: "Nūn → alif · tāʾ marbūṭa → open tāʾ", source: "المقنع ص٧١",
          def: "نون التوكيد الخفيفة تُرسم ألفًا، وتاء التأنيث المربوطة تُرسم تاءً مفتوحة في كلمات محصورة.",
          defEn: "The light emphatic nūn is drawn as an alif, and the closed feminine tāʾ (ة) as an open tāʾ (ت) in a fixed set of words.",
          entries: [
            { rasm: "لَنَسْفَعًا", modern: "لنسفعن", refs: "العلق", note: "نون توكيد خفيفة ← ألف" },
            { rasm: "وَلَيَكونًا", modern: "وليكونن", refs: "يوسف", note: "نون توكيد ← ألف" },
            { rasm: "رَحْمَت", modern: "رحمة", refs: "البقرة والأعراف وهود ومريم والروم والزخرف", count: 7, note: "تاء مفتوحة" },
            { rasm: "نِعْمَت", modern: "نعمة", refs: "البقرة وآل عمران والمائدة وإبراهيم والنحل ولقمان وفاطر والطور", count: 11, note: "تاء مفتوحة" },
            { rasm: "سُنَّت", modern: "سنّة", refs: "متعددة", note: "تاء مفتوحة" },
            { rasm: "امرأت", modern: "امرأة", refs: "يوسف والتحريم وغيرها", note: "تاء مفتوحة (امرأت العزيز)" },
            { rasm: "لَعْنَت", modern: "لعنة", refs: "آل عمران والنور", note: "تاء مفتوحة" },
            { rasm: "مَعْصِيَت", modern: "معصية", refs: "المجادلة", note: "تاء مفتوحة" },
            { rasm: "شَجَرَت", modern: "شجرة", refs: "الدخان", note: "شجرت الزقّوم" },
            { rasm: "فِطْرَت", modern: "فطرة", refs: "الروم", note: "تاء مفتوحة" },
            { rasm: "بَقِيَّت", modern: "بقيّة", refs: "هود", note: "بقيت الله" },
            { rasm: "قُرَّت عَيْن", modern: "قرّة", refs: "القصص", note: "تاء مفتوحة" },
            { rasm: "كَلِمَت", modern: "كلمة", refs: "الأعراف ويونس وغافر", note: "تاء مفتوحة (في بعض المواضع)" },
            { rasm: "جَنَّت", modern: "جنّة", refs: "الواقعة", note: "جنّت نعيم — تاء مفتوحة (تشترك صورتها مع جمع جنّات)" },
            { rasm: "ابنَت", modern: "ابنة", refs: "التحريم", note: "ابنت عمران" },
          ],
        },
      ],
    },
    {
      id: "wasl", ar: "الفصل والوصل", en: "Joining & separation", source: "المقنع — باب المقطوع والموصول (ص٦٢ وما بعدها)",
      def: "بعض الكلمات تُوصل في الرسم وبعضها تُقطع على خلاف القياس الإملائي، وفي بعضها استثناءات محفوظة.",
      defEn: "Some words are joined in the rasm and others cut apart, against ordinary spelling, with a set of memorised exceptions.",
      groups: [
        {
          id: "wasl", ar: "المقطوع والموصول", en: "Cut & joined words", source: "المقنع ص٦٢+",
          def: "الموصول يُكتب كلمةً واحدة، والمقطوع كلمتين.",
          defEn: "A joined form is written as one word, a cut form as two.",
          entries: [
            { rasm: "مالِ هٰذا", modern: "ما لهذا", keep: true, refs: "أربعة مواضع", note: "تُقطع (ما) عن اللام في أربعة مواضع، خلافًا لوصلها في الكتابة المعتادة" },
            { rasm: "يٰبنَؤُمَّ", modern: "يا ابن أمّ", refs: "طه", note: "رسم خاص" },
            { rasm: "وَيْكَأَنَّ", modern: "ويكأنّ", keep: true, refs: "القصص", note: "رسم خاص يُقطع" },
          ],
        },
      ],
    },
  ],
  // Verbatim quotes from al-Dānī's al-Muqniʿ (Shamela page citations) — the primary-source evidence.
  quotes: [
    { rule: "hadhf", page: "ص٢٠", text: "«الألف غير مكتوبة — يعني في المصاحف — في قوله في البقرة: ﴿وما يخدعون﴾ و﴿وإذ وٰعدنا﴾ و﴿ووٰعدنا موسى﴾ … و﴿فأخذتكم الصٰعقة﴾ و﴿تشٰبه علينا﴾ … و﴿تصريف الريٰح﴾ و﴿طعٰم مسكين﴾ … ﴿ولولا دفٰع الله﴾ حيث وقعت، وفي ﴿فرهٰن مقبوضة﴾»" },
    { rule: "ziyada", page: "ص٣٦", text: "«الواو والألف الزائدتان في الرسم لمعنى، المعدومتان في اللفظ، نحو الواو في ﴿أولٰئك﴾ و﴿أولي﴾ و﴿أولات﴾ و﴿سأوريكم﴾ و﴿الربوٰا﴾، ونحو الألف في ﴿لن ندعوا﴾ و﴿ليبلوا﴾ و﴿لا أوضعوا﴾ و﴿مائة﴾ و﴿مائتين﴾ … والياء في نحو ﴿من نبإي المرسلين﴾ و﴿ملإيه﴾ و﴿أفإين متّ﴾»" },
  ],
};

/* ── Reconciliation: locate every canon form in the actual muṣḥaf text ──
 * Skeleton match on the DRAWN form (rasmKey, dagger-stripped), allowing a leading proclitic on the
 * token (وَرَحْمَت reaches رَحْمَت) but NOT stripping enclitic pronouns — because the رحمت peculiarity is
 * the STANDALONE open-tāʾ word, and stripping pronouns would wrongly pull in رحمته/رحمتك (normal
 * Arabic, not a peculiarity). Multi-word forms (لا تَأْمَنّا، يَدْعُ الداعِ، مالِ هٰذا) are matched as a
 * CONTIGUOUS run, not by their first word. Matching is transparent-but-approximate (a singular tāʾ
 * word can still share its skeleton with a plural), so the UI shows detected-count BESIDE the canon
 * count and flags ✓ / ⚠ / ❌ rather than trusting either alone. */
const idxCache = new WeakMap();
function buildIndex(verseData) {
  let idx = idxCache.get(verseData);
  if (idx) return idx;
  // single-word index: form skeleton (+ proclitic-stripped stems) → occurrences; and per-verse rows.
  const single = new Map(), rows = new Map();
  for (const vk in verseData) {
    const v = verseData[vk];
    const row = [];
    (v.words || []).forEach((w, wi) => {
      const r = rasmKey(w.orig);
      row.push(r);
      if (r.length < 2) return;
      const keys = new Set([r, ...deAffix(r).filter((s) => s.length >= 2)]);
      for (const k of keys) { let a = single.get(k); if (!a) single.set(k, (a = [])); a.push({ vk, wi }); }
    });
    rows.set(vk, row);
  }
  idx = { single, rows };
  idxCache.set(verseData, idx);
  return idx;
}
const sortVk = (a, b) => { const [sa, aa] = a.split(":").map(Number), [sb, ab] = b.split(":").map(Number); return sa - sb || aa - ab; };
// a token (its drawn skeleton) matches a form-word if equal, or once a leading proclitic is peeled.
const tokMatches = (tokenRasm, key) => tokenRasm === key || deAffix(tokenRasm).includes(key);

// Locate one entry: union the occurrences of its rasm form + any alternates. Returns
// { found, verses:[{vk, idx:[wi]}] } (verses muṣḥaf-ordered, idx = the word positions to highlight).
export function locateEntry(verseData, entry) {
  const { single, rows } = buildIndex(verseData);
  const byVk = new Map();
  const add = (vk, wis) => { let a = byVk.get(vk); if (!a) byVk.set(vk, (a = new Set())); for (const wi of wis) a.add(wi); };
  for (const f of [entry.rasm, ...(entry.alts || [])]) {
    const words = f.split(/\s+/).map((w) => rasmKey(w)).filter((k) => k.length >= 2);
    if (words.length === 0) continue;
    if (words.length === 1) {
      for (const o of single.get(words[0]) || []) add(o.vk, [o.wi]);
    } else {
      // contiguous-run match across a verse's word skeletons
      for (const [vk, row] of rows) {
        for (let i = 0; i + words.length <= row.length; i++) {
          if (words.every((k, j) => tokMatches(row[i + j], k))) add(vk, Array.from({ length: words.length }, (_, j) => i + j));
        }
      }
    }
  }
  const verses = [...byVk.entries()].map(([vk, set]) => ({ vk, idx: [...set].sort((a, b) => a - b) })).sort((a, b) => sortVk(a.vk, b.vk));
  return { found: verses.reduce((s, v) => s + v.idx.length, 0), verses };
}

// Is this a GENUINE rasm difference — does the drawn skeleton actually differ from the modern
// imlāʾī skeleton? Filters out entries that look the same once written (مؤمن=مؤمن, متى=متى, ذلك=ذلك):
// those follow ordinary spelling and are NOT a rasm peculiarity. A few boundary-only specials whose
// skeleton is unchanged (مالِ هٰذا, ويكأنّ) carry `keep:true` to stay in. Modern may list two readings
// with "/"; compare against the first.
export function isRasmDifference(entry) {
  if (entry.keep) return true;
  const modern = (entry.modern || "").split("/")[0].trim();
  return !modern || rasmKey(entry.rasm) !== rasmKey(modern);
}

// The whole canon with every entry reconciled against the text (counts + located āyāt), cached.
const reconcileCache = new WeakMap();
export function reconcileCanon(verseData) {
  let r = reconcileCache.get(verseData);
  if (r) return r;
  r = {
    meta: RASM_CANON.meta,
    quotes: RASM_CANON.quotes,
    rules: RASM_CANON.rules.map((rule) => ({
      ...rule,
      groups: rule.groups.map((g) => ({
        ...g,
        entries: g.entries.map((e) => ({ ...e, differs: isRasmDifference(e), ...locateEntry(verseData, e) })),
      })),
    })),
  };
  reconcileCache.set(verseData, r);
  return r;
}
