import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { HighlightedAyah } from "./HighlightedAyah.jsx";

/* OccurrencesModal — a scrollable popup listing every āyah a word (or its root)
 * occurs in, the current verse first. Each row is clickable to re-centre the
 * graph on that āyah. Driven by `occ = { lookup, label, isRoot, keys }`.
 *
 * The list is VIRTUALIZED: only the rows in (and just around) the viewport are
 * rendered, so opening the popup for a very frequent word — اللّٰه has ~2700
 * occurrences — stays instant. Row heights vary (verses differ in length), so
 * each rendered row is measured, its height cached, and the cumulative offsets
 * (kept in state) recomputed from those measurements — falling back to an
 * estimate for rows not yet seen — so the scrollbar and spacers stay accurate. */
const EST = 92;      // initial height estimate for an unmeasured row (px)
const OVERSCAN = 6;  // extra rows rendered above/below the viewport

export function OccurrencesModal({ occ, verseData, searchMode, theme, onNavigate, onClose }) {
  const scrollRef = useRef(null);
  const sizes = useRef(new Map());   // row index → measured height (touched only in effects)
  const rowEls = useRef(new Map());  // row index → DOM node (current window)
  const [offsets, setOffsets] = useState(() => new Float64Array(1));
  const [scrollTop, setScrollTop] = useState(0);
  const [vh, setVh] = useState(560);

  const n = occ?.keys?.length || 0;
  const rebuild = useCallback(() => {
    const o = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) o[i + 1] = o[i] + (sizes.current.get(i) ?? EST);
    return o;
  }, [n]);

  // Esc closes.
  useEffect(() => {
    if (!occ) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [occ, onClose]);

  // Reset measurements + scroll + offsets when a different word/root opens.
  useLayoutEffect(() => {
    sizes.current = new Map();
    if (scrollRef.current) { scrollRef.current.scrollTop = 0; setVh(scrollRef.current.clientHeight); }
    setScrollTop(0);
    setOffsets(rebuild());
  }, [occ?.lookup, occ?.isRoot, rebuild]);

  // After each paint, measure the rendered rows; refine offsets if any changed.
  // Runs every render by design (the window changes as you scroll); the
  // "changed" guard makes it a no-op once heights are known, so no update loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    let changed = false;
    rowEls.current.forEach((el, i) => {
      if (!el) return;
      const h = el.offsetHeight;
      if (h && sizes.current.get(i) !== h) { sizes.current.set(i, h); changed = true; }
    });
    if (changed) setOffsets(rebuild());
  });

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) { setScrollTop(el.scrollTop); setVh(el.clientHeight); }
  }, []);

  if (!occ) return null;
  const primary = occ.lookup;
  const ready = offsets.length === n + 1;
  const total = ready && n ? offsets[n] : 0;

  // Visible window via binary search on the (state) offsets.
  let start = 0, end = 0;
  if (ready && n) {
    for (let lo = 0, hi = n; lo < hi; ) { const m = (lo + hi) >> 1; if (offsets[m + 1] <= scrollTop) lo = m + 1; else hi = m; start = lo; }
    end = start;
    while (end < n && offsets[end] < scrollTop + vh) end++;
    start = Math.max(0, start - OVERSCAN);
    end = Math.min(n, end + OVERSCAN);
  }
  const padTop = ready ? offsets[start] : 0;
  const padBottom = Math.max(0, total - (ready ? offsets[end] : 0));

  const keys = occ.keys;
  const rows = [];
  for (let i = start; i < end; i++) {
    const v = verseData[keys[i]];
    if (!v) continue;
    rows.push(
      <li key={keys[i]} ref={(el) => { if (el) rowEls.current.set(i, el); else rowEls.current.delete(i); }}>
        <button type="button" className={"ag-modal-row" + (i === 0 ? " is-current" : "")}
          onClick={() => onNavigate(v.s, v.a)} title="اجعلها مركز الشبكة">
          <span className="ag-ayah-ref">
            <span className="ag-ayah-surah">{v.sn}</span>
            <span className="ag-ayah-num">{v.a}</span>
          </span>
          <span className="ag-modal-text">
            <HighlightedAyah text={v.text} primaryWord={primary} searchMode={searchMode} theme={theme} />
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="ag-modal-scrim is-open" onClick={onClose}>
      <div className="ag-modal" role="dialog" aria-modal="true" aria-label={`الآيات التي ترد فيها ${occ.label}`}
        onClick={(e) => e.stopPropagation()}>
        <div className="ag-modal-head">
          <div className="ag-modal-title">
            <span className={"ag-badge " + (occ.isRoot ? "t-root" : "t-word")}>{occ.isRoot ? "جذر" : "كلمة"}</span>
            <h2 className="ag-modal-word">{occ.label}</h2>
            <span className="ag-modal-count"><b>{n}</b> آية</span>
          </div>
          <button type="button" className="ag-iconbtn" aria-label="إغلاق" onClick={onClose}>✕</button>
        </div>

        <ul className="ag-modal-list" ref={scrollRef} onScroll={onScroll}>
          <li className="ag-vspace" aria-hidden="true" style={{ height: padTop }} />
          {rows}
          <li className="ag-vspace" aria-hidden="true" style={{ height: padBottom }} />
        </ul>
      </div>
    </div>
  );
}
