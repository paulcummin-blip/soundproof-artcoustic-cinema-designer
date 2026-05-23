import React from "react";
import RvSeatRowLabels from "@/components/room/rv/render/RvSeatRowLabels";

// Top-down sofa icon — listener head coordinate is the exact anchor point
function SofaTopViewIcon({ cx, cy, scale, isPinned, screenWall = 'front' }) {
  const sw   = Math.max(20, 0.60 * scale);  // sofa width
  const sfwd = Math.max(5,  0.20 * scale);  // extension toward screen
  const srear = Math.max(14, 0.55 * scale); // extension away from screen
  const arm  = Math.max(2,  0.07 * scale);  // armrest width
  const headR = Math.max(4.5, sw * 0.12);

  const rotMap = { front: 0, back: 180, left: -90, right: 90 };
  const rot = rotMap[screenWall] ?? 0;

  const fillBase = isPinned ? 'rgba(33,52,40,0.14)' : 'rgba(33,52,40,0.07)';
  const fillBody = isPinned ? 'rgba(33,52,40,0.24)' : 'rgba(33,52,40,0.12)';
  const fillHead = isPinned ? 'rgba(33,52,40,0.34)' : 'rgba(33,52,40,0.20)';
  const sw2 = isPinned ? 1.3 : 0.85;

  return (
    <g transform={`rotate(${rot}, ${cx}, ${cy})`} pointerEvents="none">
      {/* Left armrest */}
      <rect x={cx - sw/2 - arm} y={cy - sfwd} width={arm} height={sfwd + srear}
        fill={fillBase} stroke="#213428" strokeWidth={sw2 * 0.55} rx={2} />
      {/* Right armrest */}
      <rect x={cx + sw/2} y={cy - sfwd} width={arm} height={sfwd + srear}
        fill={fillBase} stroke="#213428" strokeWidth={sw2 * 0.55} rx={2} />
      {/* Sofa body */}
      <rect x={cx - sw/2} y={cy - sfwd} width={sw} height={sfwd + srear}
        fill={fillBase} stroke="#213428" strokeWidth={sw2} rx={3} />
      {/* Backrest band */}
      <rect x={cx - sw/2} y={cy + srear - srear * 0.22} width={sw} height={srear * 0.22}
        fill={fillBody} stroke="#213428" strokeWidth={0.5} rx={2} />
      {/* Torso oval */}
      <ellipse cx={cx} cy={cy + srear * 0.22} rx={sw * 0.27} ry={srear * 0.28}
        fill={fillBody} stroke="#213428" strokeWidth={0.5} />
      {/* Head circle — exactly at listener ear coordinate */}
      <circle cx={cx} cy={cy} r={headR}
        fill={fillHead} stroke="#213428" strokeWidth={sw2} />
    </g>
  );
}

export default function RvSeatLayer({
  seatingPositions,
  toPx,
  scale,
  screenWall = 'front',
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
            
            {/* Sofa icon — head circle at listener ear coordinate */}
            <SofaTopViewIcon
              cx={seatX}
              cy={seatY}
              scale={scale}
              isPinned={isPinned}
              screenWall={screenWall}
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