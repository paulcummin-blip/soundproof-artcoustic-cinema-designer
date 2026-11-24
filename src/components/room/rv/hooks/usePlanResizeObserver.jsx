import { useEffect } from "react";

/**
 * usePlanResizeObserver
 * Watches the plan container element for size changes and updates
 * containerW / containerH state accordingly.
 * Runs once on mount (deps=[]) — measures from the live DOM node.
 */
// The clipped panel height changes during outer-page scrolling. It must not
// become a second zoom authority. Fit to a stable viewport-sized drawing;
// the existing scroll container still owns how much of that drawing is visible.
export function planFitHeight(viewportHeight, toolbarHeight) {
  return Math.max(420, Math.floor(viewportHeight - toolbarHeight - 32));
}

export function usePlanResizeObserver({ planBoundsRef, setContainerW, setContainerH }) {
  useEffect(() => {
    const el = planBoundsRef.current;
    if (!el) return;

    const win = el.ownerDocument.defaultView;
    const applySize = (wRaw, hRaw) => {
      const w = Math.round((wRaw || 0) * 10) / 10;
      const h = Math.round((hRaw || 0) * 10) / 10;

      if (!(w > 0 && h > 0)) return;

      setContainerW((prev) => (prev === w ? prev : w));
      setContainerH((prev) => {
        const section = el.closest('section');
        const toolbarHeight = section
          ? Math.max(0, el.getBoundingClientRect().top - section.getBoundingClientRect().top)
          : 0;
        const next = section
          ? planFitHeight(win.innerHeight, toolbarHeight)
          : Math.max(420, h);
        return prev === next ? prev : next;
      });
    };

    // IMPORTANT: Force a measurement even if ResizeObserver never fires
    const measureNow = () => {
      try {
        const r = el.getBoundingClientRect();
        applySize(r.width, r.height);
      } catch (e) {
        // ignore
      }
    };

    // 1) immediate
    measureNow();

    // 2) next paint (catches "tab just became visible" / layout settling)
    const raf1 = requestAnimationFrame(() => {
      measureNow();

      // 3) one more paint later (catches shadcn Tabs / Collapsible layout timing)
      const raf2 = requestAnimationFrame(() => measureNow());
      // stash raf2 so we can cancel it too
      (measureNow).__raf2 = raf2;
    });

    const ro = new ResizeObserver((entries) => {
      if (!entries[0]) return;
      // Always use the same border-box measurements, including initial mount.
      measureNow();
    });

    ro.observe(el);
    win.addEventListener("resize", measureNow);

    return () => {
      win.removeEventListener("resize", measureNow);
      try { ro.disconnect(); } catch (e) {}
      try { cancelAnimationFrame(raf1); } catch (e) {}
      try { cancelAnimationFrame((measureNow).__raf2); } catch (e) {}
    };
  }, []); // NOTE: run once; we measure from the live DOM node
}