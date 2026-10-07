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
  // Seat gesture: a completed single click shows that seat's information in the
  // active mode — its HUD in HUD mode, its dimensions in Dimensions mode — and
  // movement past the drag threshold drags the seating block instead, showing no
  // overlay at all. There is no hold timer and no long press: holding a seat
  // activates nothing, and a drag never activates the HUD or the dimensions.
  // Supplied only by the interactive plan; the static and export canvases keep
  // the legacy direct wiring.
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

  // Is the visible RSP sitting on a seat? If so the seat owns the pointer: the
  // marker is status only and must not become a second layer the designer has to
  // click around. Read from the marker element itself so the coordinates are the
  // ones actually drawn, grow the seat target by the marker's own grab radius
  // (its r=14 hit circle), and use the same SVG radii as the seat hit targets
  // below, so the test stays correct when the canvas is zoomed.
  const RSP_GRAB_RADIUS_PX = 14;
  const rspX = Number(MLPMarker?.props?.mlpDotX_m);
  const rspY = Number(MLPMarker?.props?.mlpDotY_m);
  const rspSeatOwnsPointer = Number.isFinite(rspX) && Number.isFinite(rspY) && scale > 0
    && seatingPositions.some((seat) => {
      const [seatX, seatY] = toPx(
        Number(seat.x ?? seat.position?.x ?? 0),
        Number(seat.y ?? seat.position?.y ?? 0)
      );
      const [dotX, dotY] = toPx(rspX, rspY);
      const dx = (dotX - seatX) / (RX_M * scale * 2 + RSP_GRAB_RADIUS_PX);
      const dy = (dotY - seatY) / (RY_M * scale * 2 + RSP_GRAB_RADIUS_PX);
      return dx * dx + dy * dy <= 1;
    });

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
              // The seat's own click must never reach the plan background
              // handler, which dismisses the pinned HUD.
              onClick: (e) => e.stopPropagation(),
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
                // Hold and drag must work without the page scrolling under the
                // finger. Only set while the gesture layer is active.
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

      {/* The RSP marker is status, never a second interactive layer: where the
          dot sits on a seat the seat keeps the pointer, so one click opens that
          seat's HUD and the seat can still be dragged out from under it. */}
      {React.isValidElement(MLPMarker) ? React.cloneElement(MLPMarker, {
        seatOwnsPointer: rspSeatOwnsPointer,
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