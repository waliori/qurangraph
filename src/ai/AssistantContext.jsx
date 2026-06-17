import { createContext, useContext } from "react";
import { useAssistant } from "../hooks/useAssistant.js";

/* Two contexts on purpose:
 *   • StateCtx   — the full, VOLATILE assistant state (chat transcript, streaming flag, …). Its
 *     value object is recreated on every chat update, so ONLY the panel (which must re-render as
 *     tokens stream) should consume it.
 *   • ControlCtx — a STABLE surface ({ analyze, onOpenRequest }) for components that merely
 *     TRIGGER the assistant (QuranGraph, the modals). It never changes identity, so subscribing
 *     to it costs nothing during streaming. Mixing these up = a re-render storm (the whole app
 *     re-rendering per token → multi-GB memory blowup). */

/* ═══ Assistant engine context ═══
 *
 * Holds the assistant state ONCE, at the app root, so the chosen provider + the chat
 * transcript survive the panel being closed and reopened (the panel itself mounts/unmounts,
 * but the conversation lives here and persists). Without this, closing the drawer unmounted
 * useAssistant and dropped the transcript on every reopen.
 *
 * The provider is cheap until used: useAssistant only pulls in the (tiny) cloud client after
 * the user opts in (dynamic import), so wrapping the whole app costs nothing for visitors who
 * never enable the assistant.
 */
const StateCtx = createContext(null);
const ControlCtx = createContext(null);

export function AssistantProvider({ children }) {
  const ai = useAssistant();
  return (
    <ControlCtx.Provider value={ai.control}>
      <StateCtx.Provider value={ai}>{children}</StateCtx.Provider>
    </ControlCtx.Provider>
  );
}

// Full volatile state — for the AssistantPanel only.
export function useAssistantCtx() {
  return useContext(StateCtx);
}

// Stable trigger surface ({ analyze, onOpenRequest }) — for anything that only opens/feeds the
// assistant (QuranGraph, modals). Null when there's no provider (e.g. in unit tests).
export function useAssistantControl() {
  return useContext(ControlCtx);
}
