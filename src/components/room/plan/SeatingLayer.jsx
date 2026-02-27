/**
 * SeatingLayer – renders seat ovals, the MLP green dot, and row distance labels.
 * Extracted from RoomVisualisation to reduce that file's line count.
 */
import React, { useMemo } from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";

export default function SeatingLayer({
  seatingPositions,
  toPx,
  scale,
  clampMlpY,
  mlpDotX_m,
  mlpDotY_m,
  hudPinnedSeatId,
  handleMouseDown,
  handleSeatMouseEnter,
  handleSeatMouseLeave,
  handleSeatClick,
  speakerPositionsView,
  _overlays,
  exportMode,
}) {

  // --- Row front-wall distance labels (only for Speaker Positions plan) ---
  const rowFrontWallLabelSeatIds = useMemo(() => {
    if (speakerPositionsView !== "plan") return new Set();
    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0)
      return new Set();

    const allSeatsWithY = seatingPositions
      .map((s) => ({ seat: s, y: Number(s?.y ?? s?.position?.y ?? 0) }))
      .filter((item) => Number.isFinite(item.y))
      .sort((a, b) => a.y - b.y);

    const rows = [];
    for (const item of allSeatsWithY) {
      const lastRow = rows[rows.length - 1];
      if (!lastRow || Math.abs(item.y - lastRow.y) > 0.2) {
        rows.push({ y: item.y, seats: [item.seat] });
      } else {
        lastRow.seats.push(item.seat);
      }
    }

    const labeledSeatIds = new Set();
    for (const row of rows) {
      const sortedByX = row.seats
        .map((s) => ({ seat: s, x: Number(s?.x ?? s?.position?.x ?? 0) }))
        .filter((item) => Number.isFinite(item.x))
        .sort((a, b) => a.x - b.x);

      if (sortedByX.length === 0) continue;
      const count = sortedByX.length;
      const chosenIndex =
        count % 2 === 1 ? Math.floor(count / 2) : count / 2 - 1;
      const chosenSeat = sortedByX[chosenIndex]?.seat;
      if (chosenSeat?.id) labeledSeatIds.add(chosenSeat.id);
    }

    return labeledSeatIds;
  }, [speakerPositionsView, seatingPositions]);

  // --- Row distance labels (ROOM_DIMS overlay) – furthest-right seat per row ---
  const rowDistanceLabelSeatIds = useMemo(() => {
    if (!_overlays?.ROOM_DIMS) return new Set();
    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0)
      return new Set();

    const allSeatsWithY = seatingPositions
      .map((s) => ({ seat: s, y: Number(s?.y ?? s?.position?.y ?? 0) }))
      .filter((item) => Number.isFinite(item.y))
      .sort((a, b) => a.y - b.y);

    const rows = [];
    for (const item of allSeatsWithY) {
      const lastRow = rows[rows.length - 1];
      if (!lastRow || Math.abs(item.y - lastRow.y) > 0.2) {
        rows.push({ y: item.y, seats: [item.seat] });
      } else {
        lastRow.seats.push(item.seat);
      }
    }

    const labeledSeatIds = new Set();
    for (const row of rows) {
      const sortedByX = row.seats
        .map((s) => ({ seat: s, x: Number(s?.x ?? s?.position?.x ?? 0) }))
        .filter((item) => Number.isFinite(item.x))
        .sort((a, b) => b.x - a.x);

      if (sortedByX.length === 0) continue;
      const furthestRight = sortedByX[0]?.seat;
      if (furthestRight?.id) labeledSeatIds.add(furthestRight.id);
    }

    return labeledSeatIds;
  }, [_overlays?.ROOM_DIMS, seatingPositions]);

  // MLP green-dot marker
  const MLPMarker = useMemo(() => {
    if (!Number.isFinite(mlpDotX_m) || !Number.isFinite(mlpDotY_m)) return null;
    const [x, y] = toPx(mlpDotX_m, mlpDotY_m);
    return (
      <g data-testid="mlp-marker">
        <circle
          cx={x}
          cy={y}
          r={4}
          fill="#22c55e"
          stroke="#ffffff"
          strokeWidth={2}
          opacity={0.9}
        />
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
  }, [toPx, mlpDotX_m, mlpDotY_m, _overlays?.ROOM_DIMS, exportMode]);

  if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) {
    return <g className="seats-layer">{MLPMarker}</g>;
  }

  const RX_M = 0.1;
  const RY_M = 0.125;

  return (
    <g className="seats-layer" style={{ pointerEvents: "auto" }}>
      {MLPMarker}

      {seatingPositions.map((seat) => {
        const xM = Number(seat.x ?? seat.position?.x ?? 0);
        const yM_raw = Number(seat.y ?? seat.position?.y ?? 0);
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
              style={{ cursor: "pointer" }}
              onMouseDown={(e) => handleMouseDown(e, seat.id, "seat")}
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
              strokeWidth={seat.isPrimary ? 2.5 : isPinned ? 2 : 1}
              strokeDasharray={isPinned ? "4 2" : "none"}
              aria-label="Seat — hover for RP23 and P1 analysis"
            />

            {/* Front wall distance label (Speaker Positions plan only) */}
            {speakerPositionsView === "plan" &&
              rowFrontWallLabelSeatIds.has(seat.id) && (
                <text
                  x={seatX}
                  y={seatY + RY_M * scale + 18}
                  textAnchor="middle"
                  fontSize={11}
                  fontFamily={
                    exportMode === "dimensions"
                      ? "Century Gothic, sans-serif"
                      : "system-ui, sans-serif"
                  }
                  fill="#1B1A1A"
                  fontWeight={600}
                  pointerEvents="none"
                >
                  Front: {yM.toFixed(2)}m
                </text>
              )}

            {/* Row distance label (ROOM_DIMS overlay only) */}
            {_overlays?.ROOM_DIMS &&
              exportMode !== "dimensions" &&
              rowDistanceLabelSeatIds.has(seat.id) && (
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
          </g>
        );
      })}
    </g>
  );
}