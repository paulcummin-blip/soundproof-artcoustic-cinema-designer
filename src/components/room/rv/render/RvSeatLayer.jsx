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
  handleSeatMouseEnter,
  handleSeatMouseLeave,
  handleSeatClick,
  clampMlpY,
  MLPMarker,
  onSeatingBlockMouseDown,
  isDraggingBlock,
}) {
  if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) {
    if (globalThis.__B44_LOGS) console.log('RvSeatLayer: rendering seats = 0');
    return null;
  }

  const RX_M = 0.10;
  const RY_M = 0.125;

  if (globalThis.__B44_LOGS) console.log('RvSeatLayer: rendering seats =', seatingPositions.length);

  // Compute seating group bounding box for block drag handle
  const PAD_M = 0.25;
  let blockBounds = null;
  if (seatingPositions.length > 0 && onSeatingBlockMouseDown) {
    const seatXs = seatingPositions.map(s => Number(s.x ?? s.position?.x ?? 0));
    const seatYs = seatingPositions.map(s => clampMlpY(Number(s.y ?? s.position?.y ?? 0)));
    const bbMinX = Math.min(...seatXs) - RX_M - PAD_M;
    const bbMaxX = Math.max(...seatXs) + RX_M + PAD_M;
    const bbMinY = Math.min(...seatYs) - RY_M - PAD_M;
    const bbMaxY = Math.max(...seatYs) + RY_M + PAD_M;
    const [bx1, by1] = toPx(bbMinX, bbMinY);
    const [bx2, by2] = toPx(bbMaxX, bbMaxY);
    blockBounds = { x: bx1, y: by1, w: bx2 - bx1, h: by2 - by1,
      labelX: (bx1 + bx2) / 2, labelY: by1 - 6 };
  }

  return (
    <g className="seats-layer" style={{ pointerEvents: 'auto' }}>
      {/* Seating block group drag handle */}
      {blockBounds && (
        <g data-layer="seat-block-handle">
          <rect
            x={blockBounds.x}
            y={blockBounds.y}
            width={blockBounds.w}
            height={blockBounds.h}
            fill={isDraggingBlock ? 'rgba(33,52,40,0.06)' : 'rgba(33,52,40,0.02)'}
            stroke="#213428"
            strokeWidth={1}
            strokeDasharray="5 3"
            rx={4}
            style={{ cursor: isDraggingBlock ? 'grabbing' : 'grab', pointerEvents: 'all' }}
            onMouseDown={onSeatingBlockMouseDown}
          />
          <text
            x={blockBounds.labelX}
            y={blockBounds.labelY}
            textAnchor="middle"
            fontSize={Math.max(8, scale * 0.12)}
            fill="#213428"
            opacity={0.6}
            style={{ pointerEvents: 'none', userSelect: 'none', fontWeight: 500, letterSpacing: '0.03em' }}
          >
            Move seating layout
          </text>
        </g>
      )}

      {/* MLP marker MUST live in the same layer as seats to prevent transform drift */}
      {MLPMarker}

      {seatingPositions.map((seat) => {
        // accept either { x, y } or { position: { x, y } }
        const xM = Number(
          seat.x ??
          seat.position?.x ??
          0
        );
        const yM_raw = Number(
          seat.y ??
          seat.position?.y ??
          0
        );

        // IMPORTANT: match the MLP clamping so the green dot and seat oval
        // cannot diverge on first load / legacy autosave data.
        const yM = clampMlpY(yM_raw);

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
              style={{ cursor: 'pointer' }}
              onMouseDown={(e) => handleMouseDown(e, seat.id, 'seat')}
              onMouseEnter={() => handleSeatMouseEnter(seat)}
              onMouseLeave={handleSeatMouseLeave}
              onClick={(e) => {
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
              stroke="#213428"
              strokeWidth={isPinned ? 2 : 1}
              strokeDasharray={isPinned ? '4 2' : 'none'}
              aria-label="Seat — hover for RP23 and P1 analysis"
            />
          </g>
        );
      })}

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