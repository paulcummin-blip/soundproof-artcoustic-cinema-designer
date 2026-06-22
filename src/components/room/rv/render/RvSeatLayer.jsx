import React from "react";
import RvSeatRowLabels from "@/components/room/rv/render/RvSeatRowLabels";

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
}) {
  if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) {
    if (globalThis.__B44_LOGS) console.log('RvSeatLayer: rendering seats = 0');
    return null;
  }

  const RX_M = 0.10;
  const RY_M = 0.125;

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
              style={{ cursor: 'grab' }}
              onMouseDown={(e) => handleMouseDown(e, seat.id, 'seat')}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleSeatClick(seat);
              }}
            />
            
            {/* Visual seat oval */}
            <ellipse
              cx={seatX}
              cy={seatY}
              rx={RX_M * scale}
              ry={RY_M * scale}
              fill="rgba(0,0,0,0)"
              pointerEvents="none"
              stroke="#4A230F"
              strokeWidth={isPinned ? 2 : 1}
              strokeDasharray={isPinned ? '4 2' : 'none'}
              aria-label="Seat — hover for RP23 and P1 analysis"
            />
          </g>
        );
      })}

      {/* MLP marker renders after all seat hit targets so it sits above them in the SVG stack */}
      {MLPMarker}

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