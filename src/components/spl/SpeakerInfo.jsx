// SpeakerInfo.jsx
// ---------------------------------------------------------------------------
// The source-data info panel used on the RP22 Speaker Capability page.
//
// The panel MUST always fit inside the viewport: the user can always see its
// top, scroll its full content, and dismiss it without scrolling the page
// beneath it. To do that the panel is positioned with `position: fixed` and
// measured against the viewport on every open:
//   • it flips above the trigger when there is more room above than below;
//   • its maxHeight is clamped to the available space (never the hard-coded
//     500 px that used to push it off the bottom of laptop screens);
//   • it is clamped horizontally inside the viewport;
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

  const hasContent = (Array.isArray(rows) && rows.length > 0) || dataQuality != null;

  const closePanel = useCallback(() => setOpen(false), []);

  // Track narrow-screen state so hover is disabled on touch-width screens.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => setIsNarrow(window.innerWidth < NARROW_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Measure and position the popover (fixed) whenever it opens on a wide screen.
  useLayoutEffect(() => {
    if (!open || isNarrow) {
      setPopoverStyle(null);
      return;
    }
    if (typeof window === "undefined") return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    const placeBelow = spaceBelow >= spaceAbove || spaceBelow >= 280;
    const available = placeBelow ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(120, Math.min(available, vh - 2 * VIEWPORT_MARGIN));
    const width = Math.min(PANEL_WIDTH, vw - 2 * VIEWPORT_MARGIN);
    let left = rect.right - width;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    if (left + width > vw - VIEWPORT_MARGIN) left = vw - VIEWPORT_MARGIN - width;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    setPopoverStyle({
      position: "fixed",
      left,
      top: placeBelow ? rect.bottom + 8 : Math.max(VIEWPORT_MARGIN, rect.top - maxHeight - 8),
      width,
      maxHeight,
      overflowY: "auto",
      zIndex: 100,
    });
  }, [open, isNarrow]);

  // Close the popover when the page scrolls or the viewport shrinks, so it never
  // detaches from its trigger. The centred modal is unaffected (it is fixed).
  useEffect(() => {
    if (!open || isNarrow) return undefined;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open, isNarrow]);

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
      <div
        style={{ position: "relative", display: "inline-flex", justifyContent: "center" }}
        onMouseEnter={() => {
          if (!isNarrow) setOpen(true);
        }}
        onMouseLeave={() => {
          if (!isNarrow) setOpen(false);
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-label="Show source speaker data"
          onFocus={() => setOpen(true)}
          onBlur={() => {
            if (!isNarrow) setOpen(false);
          }}
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
      {open && !isNarrow && renderPanel(false)}
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
          <div onClick={(e) => e.stopPropagation()}>{renderPanel(true)}</div>
        </div>
      )}
    </>
  );
}