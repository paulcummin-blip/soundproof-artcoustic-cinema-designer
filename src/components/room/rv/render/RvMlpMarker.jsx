/**
 * RvMlpMarker
 *
 * Renders the green RSP dot on the plan canvas.
 *
 * PICK-UP / FREE-MOVE / CLICK-TO-PLACE MODEL:
 *
 *   LOCKED (default)
 *     → press and hold green dot for 3.0 seconds
 *     → GRABBED activates (dot does NOT jump — seeded from canonical Y)
 *     → release mouse button (no commit — just ends the long-press gesture)
 *     → RSP follows pointer Y freely (no button held)
 *     → single click places RSP at current floating Y
 *     → LOCKED again
 *
 *   Short click / hold < 3 s → NO ACTION.
 *
 * State is explicit (LOCKED / LONG_PRESS_PENDING / GRABBED). The GRABBED state
 * is owned by the parent via the `grabbed` prop (backed by mlpGrabStore) so it
 * survives mouse-button release and can be cancelled by Escape or Reset.
 *
 * X is always the room centreline — only Y follows the pointer.
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
  grabbed,
  onLongPressActivate,
  onPlaceClick,
}) {
  const timerRef = useRef(null);
  const pointerDownEventRef = useRef(null);
  const [holding, setHolding] = useState(false);

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

    // While GRABBED, a pointer-down is a PLACE click, not a new hold.
    if (grabbed) {
      if (typeof onPlaceClick === "function") onPlaceClick(e);
      return;
    }

    // LOCKED → start the 3 s long-press timer (LONG_PRESS_PENDING).
    pointerDownEventRef.current = e;
    setHolding(true);

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setHolding(false);
      // Activate GRABBED — seed floating Y from the EXACT current canonical
      // RSP Y so the dot never jumps on activation.
      if (typeof onLongPressActivate === "function") {
        onLongPressActivate(mlpDotX_m, mlpDotY_m);
      }
    }, LONG_PRESS_DURATION_MS);
  }, [grabbed, onLongPressActivate, onPlaceClick, mlpDotX_m, mlpDotY_m]);

  const handlePointerUp = useCallback((_e) => {
    if (grabbed) {
      // GRABBED: the parent handles place-on-click. Releasing the button here
      // only ends the long-press gesture — do NOT commit or exit GRABBED.
      return;
    }
    // Short click / hold < 3 s before activation → cancel, no action.
    cancelHold();
  }, [grabbed, cancelHold]);

  const handlePointerLeave = useCallback((_e) => {
    // Cancel hold if the pointer leaves the dot before the 3 s threshold.
    // Once grabbed, the SVG-level mouse-move takes over, so we don't interfere.
    if (holding && !grabbed) {
      cancelHold();
    }
  }, [holding, grabbed, cancelHold]);

  const handlePointerCancel = useCallback((_e) => {
    cancelHold();
  }, [cancelHold]);

  if (!Number.isFinite(mlpDotX_m) || !Number.isFinite(mlpDotY_m)) return null;

  const [x, y] = toPx(mlpDotX_m, mlpDotY_m);
  const isManual = rspMode === "manual_position";

  // Visual feedback states:
  //   default  → subtle pulse ring
  //   holding  → brighter, thicker ring (building up)
  //   grabbed  → solid ring + crosshair cursor (active free-move)
  const ringOpacity = grabbed ? 0.75 : holding ? 0.55 : isManual ? 0.4 : 0.25;
  const ringStrokeWidth = grabbed ? 3 : holding && !grabbed ? 3 : 1.5;
  const dotRadius = grabbed ? 6 : isManual ? 6 : 5;
  const cursor = grabbed ? "crosshair" : "grab";

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