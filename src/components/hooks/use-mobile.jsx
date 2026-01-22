import * as React from "react";

// Simple, dependency-free mobile detection hook.
// Matches the common shadcn pattern used by sidebar components.
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);

    const update = () => setIsMobile(Boolean(mq.matches));
    update();

    // Safari support
    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);
    };
  }, [breakpoint]);

  return isMobile;
}