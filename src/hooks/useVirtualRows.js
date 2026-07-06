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
 *
 * Keyboard reach: because only the windowed rows exist in the DOM, a keyboard/SR user
 * couldn't reach a row past the rendered window. So the hook also drives a roving-tabindex
 * listbox — spread `listProps` on the scroll container and `rowProps(i)` on each row's
 * focusable element; Arrow/Home/End/PageUp/Down then scroll the target row into the window
 * and move focus to it (focusing a freshly-rendered row finishes scrolling it into view).
 */
export function useVirtualRows({ count, est = 92, overscan = 6, resetKey, initialIndex = 0 }) {
  const scrollRef = useRef(null);
  const sizes = useRef(new Map());     // row index → measured height
  const rowEls = useRef(new Map());    // row index → DOM node (current window)
  const pendingIndex = useRef(null);   // row to keep pinned-to-target until heights settle
  const focusPending = useRef(false);  // a keyboard move asked to focus the active row once it renders
  const [offsets, setOffsets] = useState(() => new Float64Array(1));
  const [scrollTop, setScrollTop] = useState(0);
  const [vh, setVh] = useState(560);
  const [activeIndex, setActiveIndex] = useState(-1); // roving-tabindex cursor (-1 = none yet)

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
    pendingIndex.current = initialIndex > 0 ? Math.min(initialIndex, Math.max(0, count - 1)) : null;
    const top = pendingIndex.current != null ? Math.max(0, o[pendingIndex.current] - 8) : 0;
    setVh(scrollRef.current?.clientHeight || 560);
    setScrollTop(top);
    setOffsets(o);
    setActiveIndex(-1); // new dataset → drop the keyboard cursor
    focusPending.current = false;
  }, [resetKey, rebuild, initialIndex, count]);

  // The open-at pin fights the user if it keeps re-centring while they scroll. Rather
  // than guess "was that scroll the user or us?" from the position (fragile — our own
  // writes, the browser's end-of-list clamp, and StrictMode's double-invoked effects all
  // muddy it), cancel the pin on any GENUINE user input: wheel, touch, key, or a pointer
  // press on the scroller. Those never come from our programmatic scrollTop writes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const cancel = () => { pendingIndex.current = null; };
    const opts = { passive: true };
    el.addEventListener("wheel", cancel, opts);
    el.addEventListener("touchstart", cancel, opts);
    el.addEventListener("pointerdown", cancel, opts);
    el.addEventListener("keydown", cancel);
    return () => {
      el.removeEventListener("wheel", cancel, opts);
      el.removeEventListener("touchstart", cancel, opts);
      el.removeEventListener("pointerdown", cancel, opts);
      el.removeEventListener("keydown", cancel);
    };
  }, [resetKey]);

  // After each paint: measure rendered rows and refine offsets so the window and the
  // scrollbar stay accurate as rows resolve from their estimate. Keeping the viewport
  // visually stable while off-screen rows above resize is left to the BROWSER's native
  // scroll anchoring (CSS overflow-anchor, on by default) — it is far more robust than
  // adjusting scrollTop by hand, which oscillated near the list ends. Positioning the
  // open-at target is done in the rAF effect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    let changed = false;
    rowEls.current.forEach((node, i) => {
      if (!node) return;
      const h = node.offsetHeight;
      if (h && sizes.current.get(i) !== h) { sizes.current.set(i, h); changed = true; }
    });
    if (changed) setOffsets(rebuild());
  });

  // Open-at positioning, done in a post-paint rAF loop rather than a layout effect.
  // A scrollTop write inside a layout effect runs BEFORE the browser has established the
  // element's scroll range; Firefox then clamps the write to 0 and the list is stuck at
  // the top with the target never scrolled into view (Chromium establishes the range
  // earlier, so it happened to work there). requestAnimationFrame fires after layout AND
  // paint, when scrollHeight is final, so the write always sticks. We re-centre each frame
  // as the row heights resolve, stop once the position is stable (or after a frame budget),
  // and bail immediately if the user touches the scroller (the user-input effect clears
  // pendingIndex). The initial scrollTop STATE (set in the reset effect) keeps the target
  // inside the rendered window so its row element exists to measure here.
  // Each frame, re-centre the target using its live rect and SYNC the position into React
  // state (setScrollTop). The state sync is essential: the virtualized window is computed
  // from the scrollTop state, so if we scrolled the element without syncing, the row math
  // and the real scroll position would drift into different coordinate spaces and the list
  // would snap to the wrong rows the moment the pin let go. Stops once stable or after a
  // frame budget, and bails the instant the user touches the scroller (user-input effect
  // clears pendingIndex). The initial scrollTop STATE (reset effect) keeps the target in
  // the rendered window so its row exists to measure here.
  useEffect(() => {
    if (pendingIndex.current == null) return undefined;
    let raf = 0, stable = 0, frames = 0;
    const place = () => {
      raf = 0;
      if (pendingIndex.current == null) return; // cancelled by user input
      const el = scrollRef.current;
      const target = rowEls.current.get(pendingIndex.current);
      if (el && target) {
        const max = Math.max(0, el.scrollHeight - el.clientHeight);
        const rowTop = (target.getBoundingClientRect().top - el.getBoundingClientRect().top) + el.scrollTop;
        const want = Math.min(max, Math.max(0, rowTop - Math.max(0, (el.clientHeight - target.offsetHeight) / 2)));
        const before = el.scrollTop;
        if (Math.abs(before - want) > 1) el.scrollTop = want;
        const after = el.scrollTop; // the browser clamps to its real scroll range
        if (after !== before) setScrollTop(after);
        // Converge when the position actually stops moving — comparing to `want` alone
        // never settles if want exceeds the reachable max (scrollHeight briefly reads
        // larger than the real scroll range), which made the pin fight for the full budget.
        if (Math.abs(after - before) <= 1) stable += 1; else stable = 0;
      }
      frames += 1;
      if (stable >= 3 || frames > 60) { pendingIndex.current = null; return; }
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [resetKey, count]);

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
    if (!el) return;
    // Just mirror the position — the open-at pin is cancelled by the user-input effect
    // above (wheel/touch/pointer/key), so this fires for both our programmatic writes
    // and the user's scroll without needing to tell them apart.
    setScrollTop(el.scrollTop); setVh(el.clientHeight);
  }, []);
  const rowRef = useCallback((i) => (el) => { if (el) rowEls.current.set(i, el); else rowEls.current.delete(i); }, []);

  // After a keyboard move: once the (now in-window) active row has rendered, move focus to
  // its focusable child — which also finishes scrolling it fully into view. Runs each paint
  // but is a no-op unless a move is pending. (Shares the every-render cadence above.)
  useLayoutEffect(() => {
    if (!focusPending.current || activeIndex < 0) return;
    const li = rowEls.current.get(activeIndex);
    const f = li && li.querySelector("button, a, input, [tabindex]");
    if (f) { f.focus(); focusPending.current = false; }
  });

  // Move the roving cursor to row `i`, bringing it into the rendered window (focus() then
  // completes the scroll). Clamped to [0, count-1].
  const moveTo = useCallback((i) => {
    if (!count) return;
    const ni = Math.max(0, Math.min(count - 1, i));
    setActiveIndex(ni);
    focusPending.current = true;
    const el = scrollRef.current;
    if (el && offsets.length === count + 1) {
      const top = offsets[ni], bot = offsets[ni + 1];
      const h = el.clientHeight || vh;
      let st = el.scrollTop;
      if (top < st) st = Math.max(0, top - 4);
      else if (bot > st + h) st = bot - h + 4;
      if (st !== el.scrollTop) { el.scrollTop = st; setScrollTop(st); }
    }
  }, [count, offsets, vh]);

  // Container key handler (listbox semantics) — wired via `listProps`.
  const onKeyDown = useCallback((e) => {
    if (!count) return;
    const cur = activeIndex;
    const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight || vh) / est) - 1);
    let ni = null;
    switch (e.key) {
      case "ArrowDown": ni = cur < 0 ? 0 : cur + 1; break;
      case "ArrowUp": ni = cur < 0 ? 0 : cur - 1; break;
      case "Home": ni = 0; break;
      case "End": ni = count - 1; break;
      case "PageDown": ni = (cur < 0 ? 0 : cur) + page; break;
      case "PageUp": ni = (cur < 0 ? 0 : cur) - page; break;
      default: return;
    }
    e.preventDefault();
    moveTo(ni);
  }, [count, activeIndex, est, vh, moveTo]);

  // Spread on the scroll container; it's the listbox and becomes focusable only while no
  // row holds the roving tabindex (so Tab lands here, then Arrow keys enter the rows).
  const listProps = { role: "listbox", onKeyDown, tabIndex: count && activeIndex < 0 ? 0 : -1 };
  // Spread on each row's focusable element: option semantics + roving tabindex + position.
  const rowProps = useCallback(
    (i) => ({ role: "option", "aria-setsize": count, "aria-posinset": i + 1, tabIndex: i === activeIndex ? 0 : -1 }),
    [count, activeIndex],
  );

  const ready = offsets.length === count + 1;
  const total = ready && count ? offsets[count] : 0;
  let start = 0, end = 0;
  if (ready && count) {
    // Clamp to the content: refined (shrinking) measurements can briefly leave the
    // state scrollTop past the new total — an unclamped binary search then lands at
    // start === count and renders an empty window.
    const st = Math.max(0, Math.min(scrollTop, total - 1));
    for (let lo = 0, hi = count; lo < hi;) { const m = (lo + hi) >> 1; if (offsets[m + 1] <= st) lo = m + 1; else hi = m; start = lo; }
    end = start;
    while (end < count && offsets[end] < st + vh) end++;
    start = Math.max(0, start - overscan);
    end = Math.min(count, end + overscan);
  }
  const padTop = ready ? offsets[start] : 0;
  const padBottom = Math.max(0, total - (ready ? offsets[end] : 0));

  return { scrollRef, rowRef, onScroll, start, end, padTop, padBottom, ready, listProps, rowProps, activeIndex };
}
