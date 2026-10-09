import React, { useLayoutEffect, useRef, useState } from "react";
import { computeTooltipPlacement } from "./speakerTooltipPlacement";

/**
 * The compact speaker information card shown on hover or tap in the Room
 * Designer drawings.
 *
 * Deliberately non-interactive: it must never intercept a speaker drag or a
 * canvas pan, so the pointer passes straight through it. It is a DOM element
 * rather than SVG content, so it can never be clipped by the drawing viewBox.
 *
 * Position comes from computeTooltipPlacement — anchored to the hovered
 * speaker, flipped and clamped inside the visible drawing area.
 */
export default function SpeakerInfoTooltip({
  visible,
  title,
  lines = [],
  anchor,
  bounds,
  exclusions = [],
}) {
  const ref = useRef(null);
  const [size, setSize] = useState(null);

  // Measure the card so placement works from its real size, in any language.
  useLayoutEffect(() => {
    if (!visible) {
      setSize(null);
      return;
    }
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setSize((prev) =>
      prev && Math.abs(prev.width - rect.width) < 0.5 && Math.abs(prev.height - rect.height) < 0.5
        ? prev
        : { width: rect.width, height: rect.height },
    );
  }, [visible, title, lines]);

  if (!visible || !anchor || !bounds) return null;

  const placement = size
    ? computeTooltipPlacement({ anchor, size, bounds, exclusions })
    : { left: anchor.right + 10, top: anchor.top };

  return (
    <div
      ref={ref}
      data-testid="speaker-info-tooltip"
      aria-hidden="true"
      style={{
        position: "absolute",
        left: placement.left,
        top: placement.top,
        // Held hidden until measured, so it never flashes at a guessed spot.
        visibility: size ? "visible" : "hidden",
        pointerEvents: "none",
        zIndex: 4000,
        background: "#FFFFFF",
        border: "1px solid #DCDBD6",
        borderRadius: 8,
        boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
        padding: "7px 10px",
        fontFamily: "Didact Gothic, sans-serif",
        color: "#3E4349",
        fontSize: 11.5,
        lineHeight: 1.45,
        whiteSpace: "nowrap",
      }}
    >
      {title && (
        <div style={{ fontWeight: 700, color: "#213428", marginBottom: lines.length ? 3 : 0 }}>
          {title}
        </div>
      )}
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}