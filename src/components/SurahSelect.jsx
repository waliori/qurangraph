import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/index.js";
import { norm } from "../arabic-utils.js";
import { latinSkeleton, isLatinQuery, arabicSkeletons } from "../romanize.js";

/* ═══ Searchable surah picker ═══
 *
 * A native <select> can't be filtered by name, so this is a lightweight combobox:
 * a trigger button that opens a panel with a search box + a scrollable, filtered list.
 * Filtering matches the surah number, the Arabic name (diacritic-folded substring), OR a
 * romanized query — so "fatiha"/"baqara" reach الفاتحة/البقرة even without an Arabic keyboard.
 * Keyboard: type to filter, ↑/↓ to move, Enter to choose, Esc to close.
 */
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function SurahSelect({ value, onChange, surahList }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const current = useMemo(() => surahList.find((s) => s.id === value), [surahList, value]);
  // Pre-fold each name once + a Latin skeleton for romanized matching (114 entries, cheap).
  const index = useMemo(() => surahList.map((s) => ({ s, folded: fold(s.name), sk: arabicSkeletons(norm(s.name))[0] })), [surahList]);

  const matches = useMemo(() => {
    const raw = query.trim();
    if (!raw) return surahList;
    if (isLatinQuery(raw)) {
      const sk = latinSkeleton(raw);
      return index.filter(({ s, sk: nsk }) => String(s.id) === raw || (sk && nsk.includes(sk))).map((e) => e.s);
    }
    const q = fold(raw);
    return index.filter(({ s, folded }) => folded.includes(q) || String(s.id).includes(q)).map((e) => e.s);
  }, [index, query, surahList]);

  // Close on outside click / Escape; focus the search box on open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", onDown, true);
    inputRef.current?.focus();
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open, matches]);

  const choose = (id) => { onChange(id); setOpen(false); };
  const toggle = () => setOpen((o) => {
    if (!o) { setQuery(""); setActive(Math.max(0, surahList.findIndex((s) => s.id === value))); }
    return !o;
  });

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(matches.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (matches[active]) choose(matches[active].id); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  };

  return (
    <div className="ag-select ag-combo" ref={rootRef}>
      <button type="button" className="ag-combo-btn" aria-haspopup="listbox" aria-expanded={open}
        aria-label={t("common.select.surah")} onClick={toggle}>
        {current ? `${current.id}. ${current.name}` : t("common.select.surah")}
      </button>
      {open && (
        <div className="ag-combo-pop" role="dialog">
          <input ref={inputRef} type="text" className="ag-combo-input" value={query}
            placeholder={t("common.select.searchSurah")} aria-label={t("common.select.searchSurah")}
            aria-controls={listId} onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown} />
          <ul className="ag-combo-list" role="listbox" id={listId} ref={listRef} aria-label={t("common.select.surah")}>
            {matches.length === 0
              ? <li className="ag-combo-empty">{t("common.select.noResults")}</li>
              : matches.map((s, i) => (
                <li key={s.id} role="option" aria-selected={s.id === value} data-active={i === active}
                  className={"ag-combo-opt" + (s.id === value ? " is-current" : "") + (i === active ? " is-active" : "")}
                  onMouseEnter={() => setActive(i)} onClick={() => choose(s.id)}>
                  <span className="ag-combo-num">{s.id}</span>{s.name}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
