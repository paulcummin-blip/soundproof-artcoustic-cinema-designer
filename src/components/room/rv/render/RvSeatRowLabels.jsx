import React from "react";

export default function RvSeatRowLabels({
  rowFrontWallLabelSeatIds,
  rowDistanceLabelSeatIds,
  seats,
  scale,
  speakerPositionsView,
  exportMode,
  _overlays,
  toPx,
}) {
  if (!Array.isArray(seats) || seats.length === 0) return null;

  const RY_M = 0.125;

  return (
    <>
      {seats.map((seat) => {
        const xM = Number(seat.x ?? seat.position?.x ?? 0);
        const yM = Number(seat.y ?? seat.position?.y ?? 0);
        const [seatX, seatY] = toPx(xM, yM);

        return (
          <React.Fragment key={`labels-${seat.id}`}>
            {/* Front wall distance label (Speaker Positions plan only) */}
            {speakerPositionsView === 'plan' && rowFrontWallLabelSeatIds.has(seat.id) && (
              <text
                x={seatX}
                y={seatY + (RY_M * scale) + 18}
                textAnchor="middle"
                fontSize={11}
                fontFamily={exportMode === 'dimensions' ? 'Century Gothic, sans-serif' : 'system-ui, sans-serif'}
                fill="#1B1A1A"
                fontWeight={600}
                pointerEvents="none"
              >
                Front: {yM.toFixed(2)}m
              </text>
            )}
            
            {/* Row distance label (ROOM_DIMS overlay only) */}
            {_overlays?.ROOM_DIMS && exportMode !== 'dimensions' && rowDistanceLabelSeatIds.has(seat.id) && (
              <text
                x={seatX + 22}
                y={seatY}
                textAnchor="start"
                fontSize={22}
                fill="#1B1A1A"
                pointerEvents="none"
              >
                ⬆️ {yM.toFixed(2)}m
              </text>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}