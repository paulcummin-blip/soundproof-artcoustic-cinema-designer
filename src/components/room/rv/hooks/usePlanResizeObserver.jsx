import { useEffect } from "react";

/**
 * usePlanResizeObserver
 * Watches the plan container element for size changes and updates
 * containerW / containerH state accordingly.
 * Runs once on mount (deps=[]) — measures from the live DOM node.
 */
export function usePlanResizeObserver({ planBoundsRef, setContainerW, setContainerH }) {
  useEffect(() => {
    const el = planBoundsRef.current;
    if (!el) return;

    const applySize = (wRaw, hRaw) => {
      const w = Math.round((wRaw || 0) * 10) / 10;
      const h = Math.round((hRaw || 0) * 10) / 10;

      if (!(w > 0 && h > 0)) return;

      setContainerW((prev) => (prev === w ? prev : w));
      setContainerH((prev) => {
        const next = Math.max(420, h);
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
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      applySize(cr.width, cr.height);
    });

    ro.observe(el);

    return () => {
      try { ro.disconnect(); } catch (e) {}
      try { cancelAnimationFrame(raf1); } catch (e) {}
      try { cancelAnimationFrame((measureNow).__raf2); } catch (e) {}
    };
  }, []); // NOTE: run once; we measure from the live DOM node
}