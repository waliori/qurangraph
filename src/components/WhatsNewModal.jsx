import { ModalShell } from "./ModalShell.jsx";
import { useI18n } from "../i18n/index.js";

/* ═══ "What's new" / changelog dialog ═══
 *
 * Renders a list of release entries (see src/changelog.js) — each with a title,
 * date, and a list of changes (kind-coloured chip · bilingual text · optional
 * media). The parent decides WHICH entries to pass: on auto-open it's the
 * versions newer than the user last acknowledged; from Help it's the full
 * history. Dismissing records the current version (parent's onClose), so the
 * same entries don't reappear on the next load. Built on ModalShell so it
 * inherits the focus trap, Esc, click-outside and RTL handling for free.
 *
 * Release CONTENT (the { ar, en } strings) is data, not i18n keys — it lives
 * with each entry so a release is one self-contained edit. Only the chrome
 * (title, close, kind labels) goes through t().
 */
const BASE = import.meta.env.BASE_URL || "./";

// Default glyph + accessible label per change kind. `icon` on an entry overrides
// the glyph; the label always comes from i18n so screen readers stay translated.
const KIND = {
  new: { glyph: "✦", label: "changelog.kindNew" },
  improve: { glyph: "↑", label: "changelog.kindImprove" },
  fix: { glyph: "⚙", label: "changelog.kindFix" },
};

// Resolve a { ar, en } content field for the active language (Arabic is the fallback).
function pick(field, lang) {
  if (field == null) return "";
  if (typeof field === "string") return field;
  return field[lang] ?? field.ar ?? field.en ?? "";
}

// Media filename → renderer. Videos (gif-replacement mp4/webm) autoplay muted in a
// loop like a gif; everything else is an <img>. Path is relative to the served base.
function Media({ src, alt }) {
  const url = `${BASE}${src}`;
  if (/\.(mp4|webm)$/i.test(src)) {
    return <video className="ag-cl-media" src={url} muted loop autoPlay playsInline aria-label={alt} />;
  }
  return <img className="ag-cl-media" src={url} alt={alt} loading="lazy" />;
}

export function WhatsNewModal({ open, entries, onClose }) {
  const { t, lang } = useI18n();
  const list = entries || [];
  // The newest entry shown IS the version label. When several unseen releases
  // stack, this is the latest — i.e. the version the user is now on. Rendered
  // verbatim (dir="ltr", no digit localization) since it's an identifier.
  const version = list[0]?.id;

  return (
    <ModalShell open={open} onClose={onClose} closeLabel={t("changelog.close")} ariaLabel={t("changelog.dialogAria")}
      title={<>
        <span className="ag-badge t-verse">{t("changelog.badge")}</span>
        <h2 className="ag-modal-word" style={{ fontFamily: "var(--font-display)" }}>{t("changelog.title")}</h2>
        {version && <span className="ag-cl-ver" dir="ltr">v{version}</span>}
      </>}>
      <div className="ag-cl-body">
        {list.length === 0 && <p className="ag-hint">{t("changelog.empty")}</p>}
        {list.map((v) => (
          <section className="ag-cl-version" key={v.id}>
            <header className="ag-cl-vhead">
              <h3 className="ag-cl-vtitle">{pick(v.title, lang)}</h3>
              {v.date && <time className="ag-cl-vdate" dateTime={v.date}>{v.date}</time>}
            </header>
            <ul className="ag-cl-list">
              {(v.changes || []).map((c, i) => {
                const kind = KIND[c.kind] || KIND.new;
                return (
                  <li className="ag-cl-item" key={i}>
                    <span className={`ag-cl-kind is-${c.kind || "new"}`} title={t(kind.label)} aria-label={t(kind.label)}>
                      {c.icon || kind.glyph}
                    </span>
                    <div className="ag-cl-itemmain">
                      <p className="ag-cl-text">{pick(c.text, lang)}</p>
                      {c.media && <Media src={c.media} alt={pick(c.mediaAlt, lang)} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </ModalShell>
  );
}
