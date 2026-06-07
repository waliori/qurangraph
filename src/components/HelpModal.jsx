import { useRef } from "react";
import { useModalFocus } from "../hooks/useModalFocus.js";

/* ═══ Help / guide ═══
 * A visual, scrollable guide — opened from the toolbar. Examples are colour-coded
 * and set in the Qur'an face; each section carries a small SVG illustration so the
 * encodings are shown, not just told. Pure content; Esc or backdrop closes it.
 */

// Colour-coded example word (Qur'an face) — used inline in descriptions.
const ex = (t, c = "var(--gold-400)") => <span className="ag-help-ex" style={{ color: c, borderColor: c + "55" }}>{t}</span>;
const BLUE = "#6aa8ff", GOLD = "#fcd34d", GREEN = "#34d8a8", RED = "#fb7185", PURPLE = "#a78bfa";

// A reusable mini-node for illustrations.
function gnode(x, y, r, stroke, label, opts = {}) {
  return (
    <g key={label + x}>
      <circle cx={x} cy={y} r={r} fill={stroke + "26"} stroke={stroke} strokeWidth={opts.sw || 2} strokeDasharray={opts.dash || "none"} />
      {opts.dot && <circle cx={x + r - 2} cy={y - r + 2} r={3.5} fill={GREEN} stroke="#0d1322" strokeWidth={1.2} />}
      {opts.ring && <circle cx={x} cy={y} r={r + 4} fill="none" stroke={PURPLE} strokeWidth={1.5} opacity={0.6} />}
      {label && <text x={x} y={y - r - 4} textAnchor="middle" fontSize={8} fill={stroke} fontFamily="var(--font-quran)">{label}</text>}
    </g>
  );
}

// Hero: a worked example of the network + the colour key.
function hero() {
  return (
    <div className="ag-help-hero">
      <svg viewBox="0 0 420 190" className="ag-help-svg" role="img" aria-label="مثال على الشبكة">
        <line x1="210" y1="100" x2="95" y2="55" stroke={GOLD} strokeWidth="3.2" strokeOpacity="0.85" />
        <line x1="210" y1="100" x2="335" y2="55" stroke="#3a4a6a" strokeWidth="1" strokeOpacity="0.7" />
        <line x1="95" y1="55" x2="60" y2="150" stroke={GREEN} strokeWidth="2" strokeOpacity="0.7" />
        <circle cx="210" cy="100" r="20" fill="#fbbf2433" stroke="#fbbf24" strokeWidth="3.5" />
        <text x="210" y="135" textAnchor="middle" fontSize="11" fill={GOLD} fontFamily="var(--font-display)">المركز (الآية)</text>
        {gnode(95, 55, 13, RED, "كلمة نادرة", { dot: true })}
        {gnode(335, 55, 13, "#8d9bb5", "شائعة")}
        {gnode(60, 150, 11, PURPLE, "آية موسّعة", { ring: true })}
      </svg>
      <div className="ag-help-key">
        <span className="ag-help-keyrow"><span className="ag-legend-swatch ag-legend-freq" /> لون الكلمة: نادر ← شائع</span>
        <span className="ag-help-keyrow"><span className="ag-help-dot" style={{ background: GREEN }} /> نقطة خضراء: كلمة موسّعة</span>
        <span className="ag-help-keyrow"><span className="ag-legend-ring" /> حلقة بنفسجية: آية موسّعة</span>
        <span className="ag-help-keyrow"><span className="ag-help-line" /> الرابط: أثخن وأزهى = كلمة أندر</span>
        <span className="ag-help-keyrow">
          {ex("كلمة", BLUE)} {ex("صيغة", GOLD)} {ex("جذر", GREEN)}
        </span>
      </div>
    </div>
  );
}

// Modes illustration — grouping granularity from surface → lemma → root.
function modesIllo() {
  return (
    <svg viewBox="0 0 420 96" className="ag-help-illo" role="img" aria-label="مستويات التجميع">
      {/* root (broad) */}
      <text x="65" y="14" textAnchor="middle" fontSize="9" fill={GREEN}>جذر — غفر</text>
      {gnode(35, 55, 9, GREEN, "استغفر")}{gnode(65, 70, 9, GREEN, "مغفرة")}{gnode(95, 55, 9, GREEN, "غفور")}
      {/* lemma */}
      <text x="210" y="14" textAnchor="middle" fontSize="9" fill={GOLD}>صيغة — استغفر</text>
      {gnode(190, 60, 10, GOLD, "يستغفر")}{gnode(230, 60, 10, GOLD, "استغفروا")}
      {/* exact */}
      <text x="350" y="14" textAnchor="middle" fontSize="9" fill={BLUE}>كلمة — يستغفرون</text>
      {gnode(350, 60, 11, BLUE, "يستغفرون")}
      <line x1="135" y1="48" x2="160" y2="48" stroke="var(--text-faint)" strokeWidth="1" strokeDasharray="2,2" />
      <line x1="270" y1="48" x2="295" y2="48" stroke="var(--text-faint)" strokeWidth="1" strokeDasharray="2,2" />
    </svg>
  );
}

const sec = (title, illo, items) => (
  <section className="ag-help-sec" key={title}>
    <h3 className="ag-help-h">{title}</h3>
    {illo}
    <dl className="ag-help-dl">
      {items.map(([t, d]) => (
        <div className="ag-help-row" key={t}><dt className="ag-help-t">{t}</dt><dd className="ag-help-d">{d}</dd></div>
      ))}
    </dl>
  </section>
);

export function HelpModal({ open, onClose }) {
  const dialogRef = useRef(null);
  useModalFocus(open, dialogRef, { onEscape: onClose });

  if (!open) return null;
  return (
    <div className="ag-modal-scrim is-open" onClick={onClose}>
      <div className="ag-modal" role="dialog" aria-modal="true" aria-label="دليل الاستخدام" ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="ag-modal-head">
          <div className="ag-modal-title"><span className="ag-badge t-verse">؟</span><h2 className="ag-modal-word" style={{ fontFamily: "var(--font-display)" }}>دليل آيات.network</h2></div>
          <button type="button" className="ag-iconbtn" aria-label="إغلاق" onClick={onClose}>✕</button>
        </div>
        <div className="ag-help-body">
          {hero()}

          {sec("أنماط الربط", modesIllo(), [
            ["كلمة", <>تطابق سطح الكلمة كما تُرسم، مثل {ex("يستغفرون", BLUE)} وحدها (مع دقة المطابقة أدناه).</>],
            ["صيغة", <>تجمع تصاريف الكلمة الواحدة: {ex("استغفر", GOLD)} + {ex("يستغفرون", GOLD)} معًا، وتُبقي {ex("غفور", RED)} منفصلة.</>],
            ["جذر", <>تجمع كل المشتقات تحت الجذر {ex("غفر", GREEN)}: {ex("استغفر", GREEN)}، {ex("مغفرة", GREEN)}، {ex("غفور", GREEN)}…</>],
          ])}

          {sec("دقة المطابقة (في وضع الكلمة)", null, [
            ["مرنة", <>تتطابق الرسوم المتقاربة: {ex("آية", GREEN)} <b style={{ color: GREEN }}>=</b> {ex("اية", GREEN)}، و{ex("صلاة", GREEN)} <b style={{ color: GREEN }}>=</b> {ex("صلوه", GREEN)}.</>],
            ["دقيقة", <>تميّز التاء المربوطة والألف المقصورة والهمزات: {ex("آية", RED)} <b style={{ color: RED }}>≠</b> {ex("اية", RED)}.</>],
          ])}

          {sec("التنقل والتفاعل", null, [
            ["توسيع/طي", "اضغط كلمة (في الآية أو الشبكة) لتوسيعها إلى آياتها، ومرة ثانية لطيّها."],
            ["التحريك", "اسحب الخلفية للتحريك، والعجلة أو إصبعان للتكبير، واسحب عقدة لتثبيتها."],
            ["السياق", <>زر {ex("☰", "var(--text-body)")} يعرض الآية داخل سورتها كاملة مع التمرير.</>],
            ["تراجع/إعادة", <>{ex("Ctrl+Z", "var(--text-body)")} للتراجع، و{ex("Ctrl+Y", "var(--text-body)")} للإعادة (توسيع/تحديد/تنقّل).</>],
          ])}

          {sec("ألوان الشبكة", null, [
            ["المركز", <><span className="ag-help-dot" style={{ background: "#fbbf24" }} /> الآية المختارة (ذهبي).</>],
            ["كلمة/صيغة/جذر", <><span className="ag-legend-swatch ag-legend-freq" /> اللون حسب التكرار: النادر زاهٍ والشائع باهت.</>],
            ["آية", <><span className="ag-legend-swatch ag-legend-depth" /> اللون حسب العمق: المستوى الأول بلون والأعمق بألوان أخرى.</>],
            ["الروابط", <><span className="ag-help-line" /> سُمكها ولونها حسب ندرة الكلمة الرابطة — الأندر أقوى دلالة.</>],
            ["موسّعة", <><span className="ag-help-dot" style={{ background: GREEN }} /> نقطة خضراء: كلمة موسّعة · <span className="ag-legend-ring" /> حلقة بنفسجية: آية موسّعة.</>],
            ["بلا جذر/صيغة", <><span className="ag-legend-dot ag-legend-dash" /> عقدة متقطعة: لا تتوفر لها بيانات صرفية.</>],
          ])}

          {sec("الأدوات", null, [
            ["تصفية صرفية", <>أظهر فقط نوعًا ({ex("فعل", BLUE)}/{ex("اسم", BLUE)})، أو وزنًا، أو {ex("الماضي", GOLD)}/{ex("المضارع", GOLD)}/{ex("الأمر", GOLD)}، أو {ex("المبني للمجهول", RED)}.</>],
            ["روابط نادرة فقط", "يخفي الكلمات الشائعة (المحاور) ليُبرز المفردات المميِّزة."],
            ["الكلمات المخفية", <>تحكّم بأي الكلمات تُخفى؛ المضيئة مخفية، اضغطها لإظهارها. تُطابق بحروفها ({ex("علي", "var(--text-faint)")} ≠ {ex("عليهم", "var(--text-faint)")}).</>],
            ["عدد الآيات لكل كلمة", "حدّ تفرّع كل كلمة؛ يمكن رفعه حتى كل ورودها (مع تنبيه الأداء للأعداد الكبيرة)."],
          ])}

          {sec("التحليل والمعاجم", null, [
            ["التحليل الصرفي", "الجذر والصيغة والوزن والزمن والبناء والإعراب لكل كلمة — من المدوّنة القرآنية."],
            ["المعاجم", <>معنى الجذر من معجم عربي قابل للتبديل ({ex("مقاييس اللغة", GREEN)}، {ex("المفردات", GREEN)}، {ex("لسان العرب", GREEN)})؛ كلٌّ مرجع لغوي واحد.</>],
            ["التوزيع والمجاورات", "كم ترد الكلمة في كل سورة، والكلمات التي تجاورها داخل الآيات — اضغط كلمة مجاورة لعرض الآيات المشتركة."],
            ["كل الآيات", "نافذة بكل الآيات التي ترد فيها الكلمة/الجذر/الصيغة."],
          ])}

          {sec("المشاركة والتصدير", null, [
            ["رابط المشاركة", <>زر {ex("⎘", "var(--text-body)")} يحفظ حالة الشبكة كاملة (بما فيها التوسيعات) في الرابط.</>],
            ["تصدير", "صورة PNG أو SVG للشبكة، وCSV لقوائم الآيات والإحصاءات."],
            ["دون اتصال", "التطبيق قابل للتثبيت ويعمل دون إنترنت بعد أول زيارة."],
          ])}

          {sec("منهجية المطابقة وحدودها", null, [
            ["الجذور والصيغ مُحكَّمة", <>الجذر والصيغة مأخوذان من الوسم اليدوي في {ex("المدوّنة القرآنية", GREEN)}، لا بالاشتقاق الآلي. لكن خريطة «الرسم ← الجذر» تُحسم <b>بأغلبية</b> ورود الرسم، فرسمٌ واحد ⇐ جذرٌ واحد.</>],
            ["المشترك اللفظي", <>لذلك قد يُجمَع رسمٌ يحتمل أكثر من جذر تحت جذره الأغلب. عند تحديد العقدة يَعرض «التحليل الصرفي» الجذر الصحيح <b>في هذه الآية</b>، ويُنبّه إن خالف جذر التجميع.</>],
            ["المطابقة المرنة", <>في وضعَي الصيغة والجذر تُطوى الرسوم المتقاربة دائمًا ({ex("آية", GREEN)}={ex("اية", GREEN)}، التاء المربوطة والهمزات)؛ للتمييز استخدم وضع {ex("الكلمة", BLUE)} بدقة {ex("دقيقة", RED)}.</>],
            ["التغطية", <>نحو ⅔ الكلمات لها جذر (الحروف وكثير من الأعلام بلا جذر، فتظهر متقطعةً وغير مجمَّعة)؛ ومعنى الجذر يعتمد جودة رقمنة المعجم المصدر.</>],
          ])}

          <p className="ag-hint" style={{ textAlign: "center", paddingBlock: "var(--space-3)" }}>
            أداة بحثية قرآنية محضة — كل الروابط لغوية (كلمة/صيغة/جذر)، دون تفسير أو ترجمة.
          </p>
        </div>
      </div>
    </div>
  );
}
