/**
 * RvMlpMarker
 *
 * Renders the green RSP dot on the plan canvas.
 *
 * LONG-PRESS DRAG MODEL (Stage B2 UX cleanup):
 *   The green dot is normally LOCKED. The user must hold the pointer down
 *   on the dot for 3.0 seconds to unlock it for dragging.
 *
 *   pointer down → hold 3s → GRABBED → drag → release → LOCKED
 *
 *   A short click or short hold does NOTHING — the RSP is never accidentally
 *   repositioned. On activation, the draft is seeded with the exact current
 *   effective RSP {x, y} so the dot NEVER jumps.
 *
 *   After release, the canonical mouse-up handler commits the final Y only
 *   (X is always centreline), persists manualRspY_m, and sets rspMode to
 *   manual_position.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";

const LONG_PRESS_DURATION_MS = 3000;

export default function RvMlpMarker({
  toPx,
  mlpDotX_m,
  mlpDotY_m,
  _overlays,
  exportMode,
  rspMode,
  onMouseDown,
  onLongPressActivate,
}) {
  const timerRef = useRef(null);
  const pointerDownEventRef = useRef(null);
  const [holding, setHolding] = useState(false);
  const [grabbed, setGrabbed] = useState(false);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const cancelHold = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
  }, []);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    pointerDownEventRef.current = e;
    setHolding(true);

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setHolding(false);
      setGrabbed(true);

      // Enter the existing drag flow — useMouseDownHandler captures the
      // offset from the current marker position so the first drag frame
      // preserves the grab point.
      const storedEvent = pointerDownEventRef.current;
      if (storedEvent) {
        onMouseDown(storedEvent);
      }

      // Seed the draft with the EXACT current effective RSP so the dot
      // never jumps on activation. This also ensures a no-move release
      // commits the current position and switches to manual_position.
      if (typeof onLongPressActivate === "function") {
        onLongPressActivate(mlpDotX_m, mlpDotY_m);
      }
    }, LONG_PRESS_DURATION_MS);
  }, [onMouseDown, onLongPressActivate, mlpDotX_m, mlpDotY_m]);

  const handlePointerUp = useCallback((e) => {
    if (grabbed) {
      // Grabbed: the SVG's onMouseUp handles the commit. Just clean up.
      setGrabbed(false);
      return;
    }
    // Short click / short hold before 3s — cancel, do nothing.
    cancelHold();
  }, [grabbed, cancelHold]);

  const handlePointerLeave = useCallback((_e) => {
    // Cancel hold if the pointer leaves the dot before the 3s threshold.
    // Once grabbed, pointer capture is not on this element, so we don't
    // interfere with the drag.
    if (holding && !grabbed) {
      cancelHold();
    }
  }, [holding, grabbed, cancelHold]);

  const handlePointerCancel = useCallback((_e) => {
    cancelHold();
    setGrabbed(false);
  }, [cancelHold]);

  if (!Number.isFinite(mlpDotX_m) || !Number.isFinite(mlpDotY_m)) return null;

  const [x, y] = toPx(mlpDotX_m, mlpDotY_m);
  const isManual = rspMode === "manual_position";

  // Visual feedback states:
  //   default  → subtle pulse ring
  //   holding  → brighter, thicker ring (building up)
  //   grabbed  → solid ring + grabbing cursor
  const ringOpacity = grabbed ? 0.7 : holding ? 0.55 : isManual ? 0.4 : 0.25;
  const ringStrokeWidth = holding && !grabbed ? 3 : 1.5;
  const dotRadius = grabbed ? 6 : isManual ? 6 : 5;
  const cursor = grabbed ? "grabbing" : "grab";

  return (
    <g data-testid="mlp-marker" style={{ pointerEvents: "all" }}>
      {/* Invisible oversized hit target — ensures easy grab even at zoom */}
      <circle
        cx={x}
        cy={y}
        r={14}
        fill="transparent"
        pointerEvents="all"
        style={{ cursor }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerCancel}
      />

      {/* Pulse ring — drag affordance, intensity reflects hold/grab state */}
      <circle
        cx={x}
        cy={y}
        r={10}
        fill="none"
        stroke="#22c55e"
        strokeWidth={ringStrokeWidth}
        opacity={ringOpacity}
        pointerEvents="none"
        style={{ transition: "stroke-width 0.2s ease-out, opacity 0.2s ease-out" }}
      />

      {/* Main dot */}
      <circle
        cx={x}
        cy={y}
        r={dotRadius}
        fill="#22c55e"
        stroke="#ffffff"
        strokeWidth={2}
        opacity={0.9}
        pointerEvents="none"
        style={{ cursor, transition: "r 0.2s ease-out" }}
      />

      {/* Label */}
      {_overlays?.ROOM_DIMS && exportMode !== "dimensions" && (
        <text
          x={x}
          y={y + 36}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill="#22c55e"
          pointerEvents="none"
        >
          RSP
        </text>
      )}
    </g>
  );
}