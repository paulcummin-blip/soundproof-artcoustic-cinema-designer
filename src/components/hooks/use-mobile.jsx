import * as React from "react";

// Simple, safe mobile media query hook
// - No external deps
// - Works in SSR-safe environments (guards window)
// - Returns true when viewport matches "(max-width: 768px)"
export function useMobile(breakpointPx = 768) {
  const getMatch = () => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(`(max-width: ${breakpointPx}px)`).matches;
  };

  const [isMobile, setIsMobile] = React.useState(getMatch);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mql = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = () => setIsMobile(mql.matches);

    // Initial sync
    setIsMobile(mql.matches);

    // Modern + legacy listeners
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);

    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, [breakpointPx]);

  return isMobile;
}