import React from "react";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const mToCm = (m) => Math.round(Number(m) * 100);

export default function SpeakerPositionsOverlay({
  speakers = [],
  seatingPositions = [],
  dimensions,
  view = "off", // 'off' | 'plan' | 'both'
  meterToCanvasX,
  meterToCanvasY,
  roomRect,
}) {
  if (!(view === "plan" || view === "both")) return null;

  const W = Number(dimensions?.width ?? dimensions?.widthM ?? 0);
  const L = Number(dimensions?.length ?? dimensions?.lengthM ?? 0);
  if (!(W > 0 && L > 0)) return null;

  if (typeof meterToCanvasX !== "function" || typeof meterToCanvasY !== "function") return null;
  if (!roomRect || !isNum(roomRect.x) || !isNum(roomRect.y) || !isNum(roomRect.width) || !isNum(roomRect.height)) return null;

  // --- Seating rows (used only to choose 120 / 150 / 180 cm height) ---
  const ys = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .map((s) => s?.y)
    .filter(isNum)
    .sort((a, b) => a - b);

  const rows = [];
  for (const y of ys) {
    const last = rows[rows.length - 1];
    if (!last || Math.abs(y - last) > 0.20) rows.push(y);
  }

  const bedHeightM = (speakerY) => {
    // Default 1.2m. Only raise if speaker is BEHIND row 2/row 3.
    if (rows.length < 2) return 1.2;
    const row2Y = rows[1];
    const row3Y = rows[2];
    if (isNum(row3Y) && speakerY > row3Y) return 1.8;
    if (speakerY > row2Y) return 1.5;
    return 1.2;
  };

  // --- Only "bed" speakers (no subs/LFE, no overheads) ---
  const bedSpeakers = (Array.isArray(speakers) ? speakers : []).filter((s) => {
    const role = String(s?.role || "").toUpperCase();
    if (!role) return false;
    if (role === "SUB" || role === "LFE") return false;
    if (role.startsWith("T")) return false; // overheads
    const x = s?.position?.x;
    const y = s?.position?.y;
    return isNum(x) && isNum(y);
  });

  const offPx = 18; // how far outside the wall the measurement line sits

  const stroke = "#DCDBD6";
  const dotFill = "#213428";
  const textFill = "#1B1A1A";

  return (
    <g data-layer="speaker-positions-overlay" pointerEvents="none">
      <defs>
        <marker
          id="spk-dim-arrow"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
        </marker>
      </defs>

      {bedSpeakers.map((s, idx) => {
        const xM = s.position.x;
        const yM = s.position.y;
        const role = String(s.role).toUpperCase();

        // Nearest wall
        const dFront = yM;
        const dBack = L - yM;
        const dLeft = xM;
        const dRight = W - xM;

        let wall = "front";
        let min = dFront;
        if (dBack < min) { wall = "back"; min = dBack; }
        if (dLeft < min) { wall = "left"; min = dLeft; }
        if (dRight < min) { wall = "right"; min = dRight; }

        const hCm = mToCm(bedHeightM(yM));

        // Convert speaker position to canvas
        const xPx = meterToCanvasX(xM);
        const yPx = meterToCanvasY(yM);

        // Room bounds in canvas
        const xLeftPx = roomRect.x;
        const xRightPx = roomRect.x + roomRect.width;
        const yTopPx = roomRect.y;
        const yBottomPx = roomRect.y + roomRect.height;

        // For each wall, draw:
        //  - a full wall-length arrow line
        //  - a "dot" at speaker location projected onto that wall line
        //  - two small distance labels (to each end)
        let lineX1, lineY1, lineX2, lineY2, dotX, dotY;
        let aCm, bCm;
        let aLabel, bLabel;

        if (wall === "front") {
          lineX1 = xLeftPx;  lineY1 = yTopPx - offPx;
          lineX2 = xRightPx; lineY2 = yTopPx - offPx;
          dotX = xPx; dotY = lineY1;
          aCm = mToCm(xM);
          bCm = mToCm(W - xM);
          aLabel = `${aCm}cm`;
          bLabel = `${bCm}cm`;
        } else if (wall === "back") {
          lineX1 = xLeftPx;  lineY1 = yBottomPx + offPx;
          lineX2 = xRightPx; lineY2 = yBottomPx + offPx;
          dotX = xPx; dotY = lineY1;
          aCm = mToCm(xM);
          bCm = mToCm(W - xM);
          aLabel = `${aCm}cm`;
          bLabel = `${bCm}cm`;
        } else if (wall === "left") {
          lineX1 = xLeftPx - offPx; lineY1 = yTopPx;
          lineX2 = xLeftPx - offPx; lineY2 = yBottomPx;
          dotX = lineX1; dotY = yPx;
          aCm = mToCm(yM);
          bCm = mToCm(L - yM);
          aLabel = `${aCm}cm`;
          bLabel = `${bCm}cm`;
        } else {
          // right
          lineX1 = xRightPx + offPx; lineY1 = yTopPx;
          lineX2 = xRightPx + offPx; lineY2 = yBottomPx;
          dotX = lineX1; dotY = yPx;
          aCm = mToCm(yM);
          bCm = mToCm(L - yM);
          aLabel = `${aCm}cm`;
          bLabel = `${bCm}cm`;
        }

        // Label placement (keep it tidy and out of the room area)
        const labelOffset = 10;
        const roleLabel = `${role}  H${hCm}cm`;

        return (
          <g key={`${role}-${idx}`} opacity={0.95}>
            {/* main measurement line */}
            <line
              x1={lineX1}
              y1={lineY1}
              x2={lineX2}
              y2={lineY2}
              stroke={stroke}
              strokeWidth={2}
              markerStart="url(#spk-dim-arrow)"
              markerEnd="url(#spk-dim-arrow)"
            />

            {/* dot at speaker position */}
            <circle cx={dotX} cy={dotY} r={5} fill={dotFill} />

            {/* two distance labels (to each end) */}
            {wall === "front" || wall === "back" ? (
              <>
                <text x={dotX - labelOffset} y={dotY - 8} textAnchor="end" style={{ fontSize: 12, fill: textFill }}>
                  {aLabel}
                </text>
                <text x={dotX + labelOffset} y={dotY - 8} textAnchor="start" style={{ fontSize: 12, fill: textFill }}>
                  {bLabel}
                </text>
                <text x={dotX} y={dotY + 16} textAnchor="middle" style={{ fontSize: 12, fill: textFill, fontWeight: 600 }}>
                  {roleLabel}
                </text>
              </>
            ) : (
              <>
                <text x={dotX - 8} y={dotY - labelOffset} textAnchor="end" style={{ fontSize: 12, fill: textFill }}>
                  {aLabel}
                </text>
                <text x={dotX - 8} y={dotY + labelOffset + 10} textAnchor="end" style={{ fontSize: 12, fill: textFill }}>
                  {bLabel}
                </text>
                <text x={dotX + 10} y={dotY + 4} textAnchor="start" style={{ fontSize: 12, fill: textFill, fontWeight: 600 }}>
                  {roleLabel}
                </text>
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}