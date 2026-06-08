import { useCallback, useEffect, useRef, useState } from "react";
import { Joyride, EVENTS, STATUS, ACTIONS } from "react-joyride";
import { useI18n } from "../i18n/index.js";

/* ═══ Getting-started tour ═══
 *
 * An interactive, end-to-end walkthrough built on react-joyride, run in
 * CONTROLLED mode: the parent owns the step index. On "action" steps (marked
 * `data.gated`) the parent advances the index itself once it detects the user
 * actually performed the action (changed the verse, expanded a word, opened the
 * distribution, opened the tools); the primary button is a "skip this step"
 * fallback. The spotlight lets the user interact with the highlighted control
 * (blockTargetInteraction is off), and action steps over the canvas hide the
 * overlay entirely so the graph is fully draggable.
 *
 * Trigger policy: auto-opens on every load until the user ticks "don't show on
 * startup" (the parent persists that). Relaunch from Help.
 */
const NoArrow = () => null;

const OPTIONS = {
  zIndex: 10000,
  overlayColor: "rgba(4, 6, 12, 0.62)",
  spotlightPadding: 8,
  spotlightRadius: 12,
  skipBeacon: true,
  disableFocusTrap: true, // let the user click the page / the highlighted control
  blockTargetInteraction: false, // spotlighted controls stay interactive
  overlayClickAction: false,
  dismissKeyAction: false,
  skipScroll: true,
  targetWaitTimeout: 4000, // graph nodes (e.g. the كرسي partner verse) can render after a worker re-layout
};
const STYLES = { floater: { width: "min(360px, 92vw)", maxWidth: "92vw" } };

// Thin wrapper: keying the card by step index remounts it each step, so the
// dragged offset resets to its anchored position without a setState-in-effect.
function TourTooltip(props) {
  return <TourCard key={props.index} {...props} />;
}

function TourCard({
  index, size, step, isLastStep,
  backProps, primaryProps, skipProps, closeProps, tooltipProps,
  dontShow, onDontShow, dir, t,
}) {
  const gated = !!step.data?.gated;
  const cardRef = useRef(null);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);

  // Clamp a desired offset so the whole card stays within the viewport (8px
  // margin). `off` is the currently-applied offset, so the card's base position
  // is its measured rect minus `off`.
  const clamp = (next) => {
    const el = cardRef.current;
    if (!el) return next;
    const r = el.getBoundingClientRect();
    const baseL = r.left - off.x, baseT = r.top - off.y;
    const x = Math.min(window.innerWidth - 8 - r.width - baseL, Math.max(8 - baseL, next.x));
    const y = Math.min(window.innerHeight - 8 - r.height - baseT, Math.max(8 - baseT, next.y));
    return { x, y };
  };
  const onGrabDown = (e) => {
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: off.x, oy: off.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onGrabMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    setOff(clamp({ x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
  };
  const onGrabUp = () => { dragRef.current = null; };
  // Nudge fully into view once placed (react-joyride can anchor a card partly
  // off-screen next to an edge target), and again on resize / rotate.
  useEffect(() => {
    const id = requestAnimationFrame(() => setOff((o) => clamp(o)));
    const h = () => setOff((o) => clamp(o));
    window.addEventListener("resize", h);
    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", h); };
  });

  return (
    <div ref={cardRef} className="ag-tour" dir={dir} {...tooltipProps} aria-label={t("tour.ariaLabel")}
      style={{ transform: `translate(${off.x}px, ${off.y}px)` }}>
      <div className="ag-tour-grab" title={t("tour.ariaLabel")}
        onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={onGrabUp}>⋮⋮</div>
      <button type="button" className="ag-tour-x" {...closeProps} title={t("tour.close")} aria-label={t("tour.close")}>✕</button>
      {step.title && <div className="ag-tour-title">{step.title}</div>}
      <div className="ag-tour-body">{step.content}</div>

      {gated && <div className="ag-tour-hint"><span className="ag-tour-pulse" aria-hidden="true" />{t("tour.yourTurn")}</div>}

      <div className="ag-tour-dots" aria-hidden="true">
        {Array.from({ length: size }).map((_, i) => (
          <span key={i} className={"ag-tour-dot" + (i === index ? " is-on" : i < index ? " is-done" : "")} />
        ))}
      </div>

      <label className="ag-tour-dont">
        <input type="checkbox" checked={dontShow} onChange={(e) => onDontShow(e.target.checked)} />
        <span>{t("tour.dontShow")}</span>
      </label>

      <div className="ag-tour-nav">
        <button type="button" className="ag-tour-skip" {...skipProps}>{t("tour.skip")}</button>
        <span className="ag-tour-spacer" />
        <span className="ag-tour-count">{t("tour.progress", { c: index + 1, n: size })}</span>
        {index > 0 && <button type="button" className="ag-btn ag-tour-btn" {...backProps}>{t("tour.back")}</button>}
        <button type="button" className={"ag-btn ag-tour-btn" + (gated ? "" : " is-gold")} {...primaryProps}>
          {isLastStep ? t("tour.done") : gated ? t("tour.skipStep") : t("tour.next")}
        </button>
      </div>
    </div>
  );
}

export function Tour({ run, stepIndex, steps, onStepChange, onEnd }) {
  const { t, dir } = useI18n();
  const [dontShow, setDontShow] = useState(false);
  const dontShowRef = useRef(false);
  const endedRef = useRef(false);

  useEffect(() => { if (run) endedRef.current = false; }, [run]);
  const setDS = useCallback((v) => { dontShowRef.current = v; setDontShow(v); }, []);

  const handleEvent = useCallback((data) => {
    const { type, status, action, index } = data;
    if ((type === EVENTS.TOUR_END || status === STATUS.FINISHED || status === STATUS.SKIPPED) && !endedRef.current) {
      endedRef.current = true;
      onEnd(dontShowRef.current);
      return;
    }
    if (type === EVENTS.STEP_AFTER) {
      onStepChange(index + (action === ACTIONS.PREV ? -1 : 1));
    } else if (type === EVENTS.TARGET_NOT_FOUND && !steps[index]?.data?.gated) {
      // Only skip a missing target on non-action steps. On a gated step the
      // target (e.g. a freshly-laid-out node) may just be slow; never auto-skip
      // it — the user's action (or the Skip button) advances instead.
      onStepChange(index + 1);
    }
  }, [onStepChange, onEnd, steps]);

  const Tooltip = useCallback(
    (props) => <TourTooltip {...props} dontShow={dontShow} onDontShow={setDS} dir={dir} t={t} />,
    [dontShow, setDS, dir, t],
  );

  // Pulse a ring on the current step's target element (the dimmed overlay alone
  // isn't enough on hideOverlay steps; this works for HTML controls and SVG
  // nodes alike). Skip centred steps (their target is the whole stage).
  useEffect(() => {
    if (!run) return undefined;
    const step = steps[stepIndex];
    // Skip centred steps and large "subject" panels (data.noRing) — ring only
    // specific controls/nodes, not whole panels.
    const sel = step && step.placement !== "center" && !step.data?.noRing && typeof step.target === "string" ? step.target : null;
    if (!sel) return undefined;
    let el = null, timer = 0, tries = 0;
    const apply = () => {
      el = document.querySelector(sel);
      if (el) el.classList.add("qg-tour-target");
      else if (tries++ < 25) timer = window.setTimeout(apply, 100); // target may appear after the before-hook
    };
    timer = window.setTimeout(apply, 40);
    return () => { window.clearTimeout(timer); if (el) el.classList.remove("qg-tour-target"); };
  }, [run, stepIndex, steps]);

  if (!steps?.length) return null;

  return (
    <Joyride
      run={run}
      stepIndex={stepIndex}
      steps={steps}
      continuous
      showProgress={false}
      onEvent={handleEvent}
      tooltipComponent={Tooltip}
      arrowComponent={NoArrow}
      options={OPTIONS}
      styles={STYLES}
    />
  );
}
