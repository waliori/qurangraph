import { useState, useEffect } from "react";

/* Reactive matchMedia. Returns whether `query` currently matches and re-renders
 * when it flips (rotation, resize, plugging in a mouse). SSR/JSDOM-safe: if
 * matchMedia is missing it just returns false and never subscribes. */
export function useMediaQuery(query) {
  const get = () => (typeof matchMedia !== "undefined" ? matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);

  useEffect(() => {
    if (typeof matchMedia === "undefined") return undefined;
    const mql = matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange(); // sync once in case the query changed between render and effect
    // addEventListener is the modern API; older Safari only has addListener.
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

/* True on touch-first devices (phones/tablets): coarse primary pointer OR a
 * narrow viewport. The OR catches desktop windows shrunk to phone widths (the
 * responsive CSS breakpoint is 860px) as well as real touchscreens. */
export function useCompactUI() {
  const coarse = useMediaQuery("(pointer: coarse)");
  const narrow = useMediaQuery("(max-width: 860px)");
  return coarse || narrow;
}
