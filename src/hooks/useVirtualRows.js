import { useState, useRef, useCallback, useLayoutEffect, useEffect } from "react";

/* ═══ Measured row virtualization ═══
 *
 * Renders only the rows in (and just around) the viewport, so a list of thousands
 * (every occurrence of اللّٰه, or all 6236 āyāt for context reading) stays instant.
 * Row heights vary, so each rendered row is measured, cached, and the cumulative
 * offsets refined — falling back to `est` for rows not yet seen — keeping the
 * scrollbar and spacers accurate. `resetKey` clears measurements when the dataset
 * changes; `initialIndex` opens the list scrolled to that row.
 *
 * Usage: spread `scrollRef`/`onScroll` on the scroll container; render
 * `padTop`/`padBottom` spacer rows around items [start,end); give each rendered
 * row `ref={rowRef(i)}`.
 */
export function useVirtualRows({ count, est = 92, overscan = 6, resetKey, initialIndex = 0 }) {
  const scrollRef = useRef(null);
  const sizes = useRef(new Map());     // row index → measured height
  const rowEls = useRef(new Map());    // row index → DOM node (current window)
  const pendingIndex = useRef(null);   // row to keep pinned-to-top until heights settle
  const [offsets, setOffsets] = useState(() => new Float64Array(1));
  const [scrollTop, setScrollTop] = useState(0);
  const [vh, setVh] = useState(560);

  const rebuild = useCallback(() => {
    const o = new Float64Array(count + 1);
    for (let i = 0; i < count; i++) o[i + 1] = o[i] + (sizes.current.get(i) ?? est);
    return o;
  }, [count, est]);

  // Reset measurements when the dataset changes; queue an open-at-initialIndex
  // scroll. The state scrollTop makes the window render near the target; the real
  // element.scrollTop is pinned in the post-render effect (after the spacers give
  // the list its height — setting it here would clamp to 0).
  useLayoutEffect(() => {
    sizes.current = new Map();
    const o = rebuild();
    pendingIndex.current = initialIndex > 0 ? Math.min(initialIndex, count) : null;
    const top = pendingIndex.current != null ? Math.max(0, o[pendingIndex.current] - 8) : 0;
    setVh(scrollRef.current?.clientHeight || 560);
    setScrollTop(top);
    setOffsets(o);
  }, [resetKey, rebuild, initialIndex, count]);

  // After each paint: measure rendered rows and refine offsets; while an open-at
  // target is pending, re-pin it to the top each pass (measured heights differ
  // from the estimate, so a one-shot scroll would drift) until heights stop
  // changing. The "changed" guard makes this a no-op once everything is measured.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    let changed = false;
    rowEls.current.forEach((node, i) => {
      if (!node) return;
      const h = node.offsetHeight;
      if (h && sizes.current.get(i) !== h) { sizes.current.set(i, h); changed = true; }
    });
    const o = changed ? rebuild() : offsets;
    if (changed) setOffsets(o);
    const el = scrollRef.current;
    if (pendingIndex.current != null && el && o.length === count + 1) {
      el.scrollTop = Math.max(0, o[Math.min(pendingIndex.current, count)] - 8);
      if (!changed) pendingIndex.current = null; // converged
    }
  });

  // Keep the viewport height in sync with the actual list size. Capturing it only
  // at reset (when the list is still short/empty) renders too few rows and the
  // content "fits" the wrong height — so the last rows become unreachable. A
  // ResizeObserver fixes vh as the list fills out, on window resize, and on zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setVh(el.clientHeight || 560);
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    return () => { if (ro) ro.disconnect(); };
  }, [resetKey]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) { setScrollTop(el.scrollTop); setVh(el.clientHeight); }
  }, []);
  const rowRef = useCallback((i) => (el) => { if (el) rowEls.current.set(i, el); else rowEls.current.delete(i); }, []);

  const ready = offsets.length === count + 1;
  const total = ready && count ? offsets[count] : 0;
  let start = 0, end = 0;
  if (ready && count) {
    for (let lo = 0, hi = count; lo < hi;) { const m = (lo + hi) >> 1; if (offsets[m + 1] <= scrollTop) lo = m + 1; else hi = m; start = lo; }
    end = start;
    while (end < count && offsets[end] < scrollTop + vh) end++;
    start = Math.max(0, start - overscan);
    end = Math.min(count, end + overscan);
  }
  const padTop = ready ? offsets[start] : 0;
  const padBottom = Math.max(0, total - (ready ? offsets[end] : 0));

  return { scrollRef, rowRef, onScroll, start, end, padTop, padBottom, ready };
}
