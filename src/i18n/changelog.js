/* Strings for the "what's new" / changelog dialog (changelog.*). Arabic is the
 * source language and the fallback. The release CONTENT itself lives in
 * src/changelog.js (per-entry { ar, en }); only the chrome is translated here. */
export const ar = {
  "changelog.dialogAria": "ما الجديد في آيات.network",
  "changelog.title": "ما الجديد",
  "changelog.badge": "جديد",
  "changelog.close": "إغلاق",
  "changelog.openFromHelp": "ما الجديد",
  "changelog.version": "الإصدار",
  "changelog.empty": "لا توجد تحديثات جديدة بعد.",
  // Change-kind labels (also used as the icon chip's accessible title)
  "changelog.kindNew": "جديد",
  "changelog.kindImprove": "تحسين",
  "changelog.kindFix": "إصلاح",
  // Platform labels on the demo media (shown when both a desktop and a phone clip exist)
  "changelog.platDesktop": "على الحاسوب",
  "changelog.platMobile": "على الهاتف",
};

export const en = {
  "changelog.dialogAria": "What's new in آيات.network",
  "changelog.title": "What’s new",
  "changelog.badge": "New",
  "changelog.close": "Close",
  "changelog.openFromHelp": "What’s new",
  "changelog.version": "Version",
  "changelog.empty": "No new updates yet.",
  "changelog.kindNew": "New",
  "changelog.kindImprove": "Improved",
  "changelog.kindFix": "Fixed",
  "changelog.platDesktop": "On desktop",
  "changelog.platMobile": "On phone",
};
