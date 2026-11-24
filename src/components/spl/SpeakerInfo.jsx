// SpeakerInfo.jsx
// ---------------------------------------------------------------------------
// The source-data info panel used on the RP22 Speaker Capability page.
//
// The panel MUST always fit inside the viewport: the user can always see its
// top, scroll its full content, and dismiss it without scrolling the page
// beneath it. To do that the panel is positioned with `position: fixed` and
// re-measured against the viewport on every open and on every scroll/resize:
//   • it opens immediately to the RIGHT of the ⓘ button (≈10 px gap), top
//     aligned with the button, and flips to the LEFT when there is no room;
//   • its maxHeight is clamped to the space from its top to the viewport
//     floor, so a tall panel scrolls internally instead of running off-screen;
//   • it is clamped horizontally inside the viewport;
//   • it repositions on page/section scroll so it stays anchored to its
//     trigger (it closes only if the trigger itself scrolls out of view);
//   • on narrow screens (< 640 px) it becomes a centred modal with its own
//     scroll and backdrop, so it never overflows a phone-width column.
//
// The panel accepts either `rows` (a [label, value] list, used by the Artcoustic
// row) or `dataQuality` (a ReactNode, used by the competitor row's status
// section) — or both. It renders a close button so the panel can be dismissed
// from inside, independent of hover.

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Info, X } from "lucide-react";

const BRAND = {
  border: "#DCDBD6",
  soft: "#F1F0EE",
  text: "#1B1A1A",
  subtext: "#3E4349",
  hint: "#625143",
};

const NARROW_BREAKPOINT = 640; // px — below this, use a centred modal
const VIEWPORT_MARGIN = 20; // px gap from the viewport edges
const PANEL_WIDTH = 390; // px preferred popover width

export default function SpeakerInfo({
  rows = null,
  sourceUrl = null,
  datasheetUrl = null,
  dataQuality = null,
  title = "Published / comparison data",
}) {
  const [open, setOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth < NARROW_BREAKPOINT,
  );
  const [popoverStyle, setPopoverStyle] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const hasContent = (Array.isArray(rows) && rows.length > 0) || dataQuality != null;

  const closePanel = useCallback(() => setOpen(false), []);

  // Click is the sole open/close toggle (hover previously opened the panel on
  // mouse-enter, so the click toggle then closed it — making the button appear
  // to do nothing). Close when a pointer goes down outside the trigger and the
  // panel, so clicking a link inside the panel never dismisses it.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      const t = event.target;
      if (triggerRef.current && triggerRef.current.contains(t)) return;
      if (panelRef.current && panelRef.current.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("touchstart", onPointerDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("touchstart", onPointerDown, true);
    };
  }, [open]);

  // Track narrow-screen state so hover is disabled on touch-width screens.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => setIsNarrow(window.innerWidth < NARROW_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Recompute the popover position so it stays anchored to its trigger.
  // Opens to the right of the ⓘ button (≈10 px gap), top-aligned with the
  // button; flips to the left when there is no room on the right; clamps inside
  // the viewport; and scrolls internally when taller than the available space.
  const reposition = useCallback(() => {
    if (typeof window === "undefined") return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // If the trigger has scrolled fully out of view, dismiss rather than float.
    if (rect.bottom < 0 || rect.top > vh) {
      setOpen(false);
      setPopoverStyle(null);
      return;
    }
    const gap = 10; // px between button and panel
    const margin = VIEWPORT_MARGIN;
    const width = Math.min(PANEL_WIDTH, vw - 2 * margin);
    // Horizontal: prefer the right of the button; flip left when it won't fit.
    let left = rect.right + gap;
    if (left + width > vw - margin) left = rect.left - gap - width;
    if (left < margin) left = margin;
    if (left + width > vw - margin) left = vw - margin - width;
    // Vertical: align the panel top with the button top, clamped so the panel
    // always has at least 120 px of scrollable height inside the viewport.
    const minSpace = 120;
    let top = Math.max(margin, Math.min(rect.top, vh - margin - minSpace));
    const maxHeight = Math.max(minSpace, vh - margin - top);
    setPopoverStyle({
      position: "fixed",
      left,
      top,
      width,
      maxHeight,
      overflowY: "auto",
      zIndex: 100,
    });
  }, []);

  // Position the popover whenever it opens on a wide screen.
  useLayoutEffect(() => {
    if (!open || isNarrow) {
      setPopoverStyle(null);
      return;
    }
    reposition();
  }, [open, isNarrow, reposition]);

  // Keep the popover anchored to its trigger while the page or comparison
  // section scrolls, and while the viewport resizes. rAF-throttled so it
  // tracks smoothly without thrashing layout. The centred modal is unaffected.
  useEffect(() => {
    if (!open || isNarrow) return undefined;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(reposition);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, isNarrow, reposition]);

  if (!hasContent) return <div />;

  const renderPanel = (modal) => (
    <div
      style={
        modal
          ? {
              width: "min(420px, calc(100vw - 32px))",
              maxHeight: "calc(100vh - 40px)",
              overflowY: "auto",
              background: "#FFF",
              border: `1px solid ${BRAND.border}`,
              borderRadius: 12,
              padding: 14,
              boxShadow: "0 12px 30px rgba(0,0,0,0.14)",
              color: BRAND.text,
            }
          : {
              ...popoverStyle,
              background: "#FFF",
              border: `1px solid ${BRAND.border}`,
              borderRadius: 12,
              padding: 14,
              boxShadow: "0 12px 30px rgba(0,0,0,0.14)",
              color: BRAND.text,
            }
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
        <button
          type="button"
          aria-label="Close"
          onClick={closePanel}
          style={{ border: 0, background: "transparent", cursor: "pointer", color: BRAND.hint, padding: 2, display: "inline-flex", alignItems: "center" }}
        >
          <X size={14} />
        </button>
      </div>
      {dataQuality}
      {Array.isArray(rows) && rows.length > 0 && (
        <div style={{ display: "grid", gap: 0 }}>
          {rows.map(([label, value], idx) => (
            <div
              key={`${label}-${idx}`}
              style={{
                display: "grid",
                gridTemplateColumns: "1.15fr 1fr",
                gap: 10,
                padding: "6px 0",
                borderTop: idx === 0 ? 0 : `1px solid ${BRAND.soft}`,
                fontSize: 11,
                lineHeight: 1.35,
              }}
            >
              <div style={{ color: BRAND.subtext }}>{label}</div>
              <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{value || "—"}</div>
            </div>
          ))}
        </div>
      )}
      {(sourceUrl || datasheetUrl) && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: `1px solid ${BRAND.border}`,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            fontSize: 11,
          }}
        >
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noreferrer" style={{ color: BRAND.hint, textDecoration: "underline" }}>
              Manufacturer source
            </a>
          )}
          {datasheetUrl && (
            <a href={datasheetUrl} target="_blank" rel="noreferrer" style={{ color: BRAND.hint, textDecoration: "underline" }}>
              Datasheet
            </a>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div style={{ position: "relative", display: "inline-flex", justifyContent: "center" }}>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Show source speaker data"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={{
            width: 26,
            height: 26,
            borderRadius: 999,
            border: `1px solid ${BRAND.border}`,
            background: "#FFF",
            color: BRAND.hint,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <Info size={14} />
        </button>
      </div>
      {open && !isNarrow && (
        <div ref={panelRef}>{renderPanel(false)}</div>
      )}
      {open && isNarrow && (
        <div
          onClick={closePanel}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(0,0,0,0.34)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div ref={panelRef} onClick={(e) => e.stopPropagation()}>{renderPanel(true)}</div>
        </div>
      )}
    </>
  );
}