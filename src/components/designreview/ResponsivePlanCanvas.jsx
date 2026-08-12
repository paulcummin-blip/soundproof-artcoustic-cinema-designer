/**
 * ResponsivePlanCanvas.jsx
 * -------------------------
 * Wraps RvStaticCanvas so the plan drawing fills the available Design Review
 * content width — matching the visual fill of the Elevation drawings.
 *
 * Measures the container width via ResizeObserver, then computes
 * exportWidthPx / exportHeightPx so the room is width-limited (preserving
 * aspect ratio) and the SVG viewBox tightly fits the room + canonical gutters.
 *
 * Reuses the SAME canonical plan renderer (RvStaticCanvas) — no second renderer.
 */

import React, { useState, useRef, useEffect, useMemo } from "react";
import RvStaticCanvas from "@/components/report/RvStaticCanvas";
import { PADDING } from "@/components/room/rv/RenderPrimitives";

// Must match RvStaticCanvas constants (not exported there)
const TOP_GUTTER_PX = 150;
const BOTTOM_GUTTER_PX = 220;

export default function ResponsivePlanCanvas(props) {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect?.width;
        if (Number.isFinite(w) && w > 0) {
          setContainerWidth(Math.round(w));
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const widthM = Number(props.appState?.roomDims?.widthM) || 4.5;
  const lengthM = Number(props.appState?.roomDims?.lengthM) || 6.0;

  const exportDims = useMemo(() => {
    if (containerWidth < 100) return null;
    // Width-limited scale: room fills the available width
    const availW = containerWidth - 2 * PADDING;
    if (availW <= 0) return null;
    const scale = availW / widthM;
    const roomHeightPx = lengthM * scale;
    // Need enough height for room + gutters
    const exportHeightPx = Math.ceil(roomHeightPx + 2 * PADDING + TOP_GUTTER_PX);
    return { exportWidthPx: containerWidth, exportHeightPx };
  }, [containerWidth, widthM, lengthM]);

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      {exportDims ? (
        <RvStaticCanvas
          {...props}
          exportWidthPx={exportDims.exportWidthPx}
          exportHeightPx={exportDims.exportHeightPx}
        />
      ) : (
        <div style={{ height: 200 }} />
      )}
    </div>
  );
}