/* ═══ Release changelog ═══
 *
 * The single source of truth for "what's new". Each entry is one release you
 * decide to announce — it can bundle ONE commit or MANY under a single title.
 * NEWEST FIRST: the first entry's `id` IS the current app version. On load the
 * app compares the user's `qg.lastSeenVersion` against this list and shows every
 * entry newer than what they last acknowledged (so skipping a deploy still
 * surfaces the accumulated changes), then records the current id on dismiss.
 *
 * To ship a release: prepend one entry here before you build/deploy. The service
 * worker already reloads open tabs into the new bundle (see main.jsx), so the
 * dialog fires on the next load. No version bump in package.json is needed.
 *
 * Versioning: SemVer (MAJOR.MINOR.PATCH). The first entry's id is the current
 * app version and MUST equal package.json's "version" — the build asserts this
 * (see vite.config.js) so the two can't silently drift. Bump PATCH for fixes,
 * MINOR for features (most releases), MAJOR for big reworks.
 *
 * Entry shape
 * ───────────
 *   id      SemVer string; unique; newest first (index 0 = current version)
 *   date    ISO date string, shown in the header
 *   title   { ar, en } — the release headline
 *   changes [ { kind, text, icon?, media?, mediaAlt? } ]
 *
 * change.kind   "new" | "improve" | "fix"  (drives the coloured icon chip)
 * change.text   { ar, en } — Arabic is the source/fallback (matches i18n)
 * change.icon   optional override for the chip glyph (else the kind default)
 * change.media  optional asset under public/ — png / svg / gif / webp / mp4.
 *               Reference it relative to the served base, e.g. "changelog/foo.gif".
 *               Drop the file in public/changelog/ and it ships with the build.
 * change.mediaAlt { ar, en } — alt text / caption for the media (a11y)
 */

export const CHANGELOG = [
  {
    id: "1.3.0",
    date: "2026-06-23",
    title: { ar: "ورشة البحث", en: "Research workbench" },
    changes: [
      {
        kind: "new",
        text: {
          ar: "ورشة بحثية جديدة: ادّعاءات، وترميز، وعدسات للدور والبناء والاقتران لتحليل لغوي أعمق.",
          en: "A new research workbench — claims, coding, and role / construction / pairing lenses for deeper linguistic analysis.",
        },
        // Example of attaching media (drop the file in public/changelog/ first):
        // media: "changelog/workbench.gif",
        // mediaAlt: { ar: "عرض لورشة البحث", en: "Research workbench in action" },
      },
      {
        kind: "improve",
        text: {
          ar: "تُبرَز الآن نتائج البحث بالعبارات داخل النص، مع حفظ سجلّ لعمليات البحث الأخيرة.",
          en: "Phrase-search results are now highlighted in the text, and recent searches are remembered.",
        },
      },
    ],
  },
  {
    id: "1.2.0",
    date: "2026-06-20",
    title: { ar: "مختبر التحليل الأعمق", en: "Deeper analysis lab" },
    changes: [
      {
        kind: "new",
        text: {
          ar: "تحليلات الفواصل والالتفات والبلاغة والتعدية والحقول الدلالية.",
          en: "Analytics for fawāṣil, iltifāt, rhetoric, valency, and semantic fields.",
        },
      },
      {
        kind: "improve",
        text: {
          ar: "مقاييس واكتشاف وعمق إضافي عبر نوافذ مختبر التحليل.",
          en: "Added metrics, discovery and depth across the analysis-lab modals.",
        },
      },
    ],
  },
];

/* The newest entry's id is the current version. null only if the list is empty. */
export const CURRENT_VERSION = CHANGELOG[0]?.id ?? null;

/* Entries the user hasn't acknowledged yet, newest first.
 * - null lastSeen → caller's decision (we return [] so first-run is silent; the
 *   gate baselines the user to CURRENT_VERSION instead of dumping all history).
 * - unknown id (corrupt/older-than-listed) → show everything, so a stale pointer
 *   never hides real changes. */
export function unseenSince(lastSeenId) {
  if (lastSeenId == null) return [];
  const idx = CHANGELOG.findIndex((e) => e.id === lastSeenId);
  return idx === -1 ? CHANGELOG.slice() : CHANGELOG.slice(0, idx);
}
