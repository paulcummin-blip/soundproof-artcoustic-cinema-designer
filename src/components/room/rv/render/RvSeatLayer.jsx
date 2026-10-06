import React from "react";
import RvSeatRowLabels from "@/components/room/rv/render/RvSeatRowLabels";

const sameSeat = (a, b) => a != null && b != null && String(a) === String(b);

export default function RvSeatLayer({
  seatingPositions,
  toPx,
  scale,
  exportMode,
  speakerPositionsView,
  rowFrontWallLabelSeatIds,
  rowDistanceLabelSeatIds,
  _overlays,
  hudPinnedSeatId,
  handleMouseDown,
  handleSeatClick,
  MLPMarker,
  // Seat press-and-hold gesture: single click selects, double click opens the
  // HUD, a 1.5 s hold holds the measurement guides, and movement past the drag
  // threshold drags. Supplied only by the interactive plan; the static and
  // export canvases keep the legacy direct wiring.
  seatGesture,
  selectedSeatId,
  dimensionSeatId,
}) {
  if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) {
    if (globalThis.__B44_LOGS) console.log('RvSeatLayer: rendering seats = 0');
    return null;
  }

  const RX_M = 0.10;
  const RY_M = 0.125;
  const hasSeatGesture = typeof seatGesture?.onSeatPointerDown === 'function';

  if (globalThis.__B44_LOGS) console.log('RvSeatLayer: rendering seats =', seatingPositions.length);

  return (
    <g className="seats-layer" style={{ pointerEvents: 'auto' }}>
      {seatingPositions.map((seat) => {
        // accept either { x, y } or { position: { x, y } }
        const xM = Number(
          seat.x ??
          seat.position?.x ??
          0
        );
        const yM = Number(
          seat.y ??
          seat.position?.y ??
          0
        );

        const [seatX, seatY] = toPx(xM, yM);
        const isPinned = hudPinnedSeatId === seat.id;
        const isSelected = sameSeat(selectedSeatId, seat.id);
        const isDimensional = sameSeat(dimensionSeatId, seat.id);

        const hitTargetProps = hasSeatGesture
          ? {
              onPointerDown: (e) => seatGesture.onSeatPointerDown(e, seat),
              onDoubleClick: (e) => e.stopPropagation(),
            }
          : {
              onMouseDown: (e) => handleMouseDown(e, seat.id, 'seat'),
              onDoubleClick: (e) => {
                e.stopPropagation();
                handleSeatClick(seat);
              },
            };

        return (
          <g key={seat.id}>
            {/* Invisible hit target (2× larger for easier hover) */}
            <ellipse
              cx={seatX}
              cy={seatY}
              rx={RX_M * scale * 2}
              ry={RY_M * scale * 2}
              fill="transparent"
              pointerEvents="all"
              style={{
                cursor: 'grab',
                // Hold, double tap and drag must work without the page scrolling
                // under the finger. Only set while the gesture layer is active.
                touchAction: hasSeatGesture ? 'none' : undefined,
              }}
              {...hitTargetProps}
            />

            {/* Dimensional-mode feedback — a quiet outer ring while this seat's
                measurement guides are held on screen. */}
            {isDimensional && (
              <ellipse
                cx={seatX}
                cy={seatY}
                rx={RX_M * scale * 1.35}
                ry={RY_M * scale * 1.35}
                fill="none"
                stroke="#213428"
                strokeWidth={1}
                strokeDasharray="2 3"
                opacity={0.55}
                pointerEvents="none"
              />
            )}

            {/* Visual seat oval */}
            <ellipse
              cx={seatX}
              cy={seatY}
              rx={RX_M * scale}
              ry={RY_M * scale}
              fill={isSelected ? 'rgba(33,52,40,0.10)' : 'rgba(0,0,0,0)'}
              pointerEvents="none"
              stroke={isSelected ? '#213428' : '#4A230F'}
              strokeWidth={isPinned || isSelected ? 2 : 1}
              strokeDasharray={isPinned ? '4 2' : 'none'}
              aria-label="Seat — hover for RP23 and P1 analysis"
            />
          </g>
        );
      })}

      {/* Keep the RSP grab target above seats, but route its double-click to
          the exact seat hit ellipse beneath the pointer (not the nearest seat).
          Use the same SVG coordinates/radii as the visible seat layer so this
          remains correct when the canvas is zoomed or resized. */}
      {React.isValidElement(MLPMarker) ? React.cloneElement(MLPMarker, {
        onSeatDoubleClick: (e) => {
          const svg = e.currentTarget.ownerSVGElement;
          const ctm = svg?.getScreenCTM();
          if (!ctm || !(scale > 0)) return;
          const point = svg.createSVGPoint();
          point.x = e.clientX;
          point.y = e.clientY;
          const pointer = point.matrixTransform(ctm.inverse());
          // Last rendered seat wins, matching normal SVG hit-target stacking.
          const seat = [...seatingPositions].reverse().find((candidate) => {
            const [cx, cy] = toPx(
              Number(candidate.x ?? candidate.position?.x ?? 0),
              Number(candidate.y ?? candidate.position?.y ?? 0)
            );
            const dx = (pointer.x - cx) / (RX_M * scale * 2);
            const dy = (pointer.y - cy) / (RY_M * scale * 2);
            return dx * dx + dy * dy <= 1;
          });
          if (seat) handleSeatClick(seat);
        },
      }) : MLPMarker}

      {/* Seat row labels extracted to component */}
      <RvSeatRowLabels
        rowFrontWallLabelSeatIds={rowFrontWallLabelSeatIds}
        rowDistanceLabelSeatIds={rowDistanceLabelSeatIds}
        seats={seatingPositions}
        scale={scale}
        speakerPositionsView={speakerPositionsView}
        exportMode={exportMode}
        _overlays={_overlays}
        toPx={toPx}
      />
    </g>
  );
}