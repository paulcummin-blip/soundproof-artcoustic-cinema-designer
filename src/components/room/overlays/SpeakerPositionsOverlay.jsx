import React from "react";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const mToCm = (m) => Math.round(Number(m) * 100);

// Lane spacing constants
const LANE_GAP_M = 0.18;
const TOP_CLEAR_M = 0.22;
const TEXT_LINE1_DY_M = -0.10;  // dims line
const TEXT_LINE2_DY_M = 0.06;   // ID + height line

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

  // --- Assign wall and laneIndex to each speaker ---
  const speakersWithLanes = bedSpeakers.map((s) => {
    const xM = s.position.x;
    const yM = s.position.y;
    const role = String(s.role).toUpperCase();

    // Determine nearest wall
    const dFront = yM;
    const dBack = L - yM;
    const dLeft = xM;
    const dRight = W - xM;

    let wall = "front";
    let min = dFront;
    if (dBack < min) { wall = "back"; min = dBack; }
    if (dLeft < min) { wall = "left"; min = dLeft; }
    if (dRight < min) { wall = "right"; min = dRight; }

    return { ...s, wall, xM, yM, role };
  });

  // Group by wall and sort along wall axis
  const frontGroup = speakersWithLanes.filter(s => s.wall === "front").sort((a, b) => a.xM - b.xM);
  const backGroup = speakersWithLanes.filter(s => s.wall === "back").sort((a, b) => a.xM - b.xM);
  const leftGroup = speakersWithLanes.filter(s => s.wall === "left").sort((a, b) => a.yM - b.yM);
  const rightGroup = speakersWithLanes.filter(s => s.wall === "right").sort((a, b) => a.yM - b.yM);

  // Assign lane indices
  frontGroup.forEach((s, idx) => s.laneIndex = idx);
  backGroup.forEach((s, idx) => s.laneIndex = idx);
  leftGroup.forEach((s, idx) => s.laneIndex = idx);
  rightGroup.forEach((s, idx) => s.laneIndex = idx);

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

      {speakersWithLanes.map((s, idx) => {
        const { xM, yM, role, wall, laneIndex } = s;
        const hCm = mToCm(bedHeightM(yM));

        // Convert speaker centre to canvas coordinates
        const xPx = meterToCanvasX(xM);
        const yPx = meterToCanvasY(yM);

        // Room bounds in canvas
        const xLeftPx = roomRect.x;
        const xRightPx = roomRect.x + roomRect.width;
        const yTopPx = roomRect.y;
        const yBottomPx = roomRect.y + roomRect.height;

        // Calculate ruler position based on wall and lane
        let rulerYm, rulerXm, lineX1, lineY1, lineX2, lineY2, dotX, dotY;
        let leftDistCm, rightDistCm, topDistCm, bottomDistCm;
        let isHorizontal;

        if (wall === "front") {
          rulerYm = -TOP_CLEAR_M - (laneIndex * LANE_GAP_M);
          const rulerYpx = meterToCanvasY(rulerYm);
          lineX1 = xLeftPx;
          lineY1 = rulerYpx;
          lineX2 = xRightPx;
          lineY2 = rulerYpx;
          dotX = xPx;  // ALWAYS speaker centre
          dotY = rulerYpx;
          leftDistCm = mToCm(xM);
          rightDistCm = mToCm(W - xM);
          isHorizontal = true;
        } else if (wall === "back") {
          rulerYm = L + TOP_CLEAR_M + (laneIndex * LANE_GAP_M);
          const rulerYpx = meterToCanvasY(rulerYm);
          lineX1 = xLeftPx;
          lineY1 = rulerYpx;
          lineX2 = xRightPx;
          lineY2 = rulerYpx;
          dotX = xPx;  // ALWAYS speaker centre
          dotY = rulerYpx;
          leftDistCm = mToCm(xM);
          rightDistCm = mToCm(W - xM);
          isHorizontal = true;
        } else if (wall === "left") {
          rulerXm = -TOP_CLEAR_M - (laneIndex * LANE_GAP_M);
          const rulerXpx = meterToCanvasX(rulerXm);
          lineX1 = rulerXpx;
          lineY1 = yTopPx;
          lineX2 = rulerXpx;
          lineY2 = yBottomPx;
          dotX = rulerXpx;
          dotY = yPx;  // ALWAYS speaker centre
          topDistCm = mToCm(yM);
          bottomDistCm = mToCm(L - yM);
          isHorizontal = false;
        } else {
          // right
          rulerXm = W + TOP_CLEAR_M + (laneIndex * LANE_GAP_M);
          const rulerXpx = meterToCanvasX(rulerXm);
          lineX1 = rulerXpx;
          lineY1 = yTopPx;
          lineX2 = rulerXpx;
          lineY2 = yBottomPx;
          dotX = rulerXpx;
          dotY = yPx;  // ALWAYS speaker centre
          topDistCm = mToCm(yM);
          bottomDistCm = mToCm(L - yM);
          isHorizontal = false;
        }

        const roleText = role;
        const modelText = String(s?.modelLabel || s?.model || "").trim();
        const heightText = `H${hCm}cm`;

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

            {/* labels */}
            {isHorizontal ? (
              <>
                {/* Left dimension label */}
                <text
                  x={meterToCanvasX(xM / 2)}
                  y={meterToCanvasY(wall === "front" ? rulerYm : rulerYm) + (meterToCanvasY(TEXT_LINE1_DY_M) - meterToCanvasY(0))}
                  textAnchor="middle"
                  style={{ fontSize: 12, fill: textFill }}
                >
                  {leftDistCm}cm
                </text>

                {/* Right dimension label */}
                <text
                  x={meterToCanvasX((xM + W) / 2)}
                  y={meterToCanvasY(wall === "front" ? rulerYm : rulerYm) + (meterToCanvasY(TEXT_LINE1_DY_M) - meterToCanvasY(0))}
                  textAnchor="middle"
                  style={{ fontSize: 12, fill: textFill }}
                >
                  {rightDistCm}cm
                </text>

                {/* Speaker ID (bold) centred on speaker */}
                <text
                  x={dotX}
                  y={meterToCanvasY(wall === "front" ? rulerYm : rulerYm) + (meterToCanvasY(TEXT_LINE2_DY_M) - meterToCanvasY(0))}
                  textAnchor="middle"
                  style={{ fontSize: 12, fill: textFill, fontWeight: 700 }}
                >
                  {roleText}
                </text>

                {/* Model centred on speaker (optional) */}
                {!!modelText && (
                  <text
                    x={dotX}
                    y={meterToCanvasY(wall === "front" ? rulerYm : rulerYm) + (meterToCanvasY(TEXT_LINE2_DY_M + 0.12) - meterToCanvasY(0))}
                    textAnchor="middle"
                    style={{ fontSize: 11, fill: textFill, fontWeight: 400 }}
                  >
                    {modelText}
                  </text>
                )}

                {/* Height aligned with right dimension zone */}
                <text
                  x={meterToCanvasX((xM + W) / 2)}
                  y={meterToCanvasY(wall === "front" ? rulerYm : rulerYm) + (meterToCanvasY(TEXT_LINE2_DY_M) - meterToCanvasY(0))}
                  textAnchor="middle"
                  style={{ fontSize: 12, fill: textFill, fontWeight: 400 }}
                >
                  {heightText}
                </text>
              </>
            ) : (
              <>
                {/* Top dimension label (rotated) */}
                <text
                  x={meterToCanvasX(wall === "left" ? rulerXm : rulerXm) + (meterToCanvasX(TEXT_LINE1_DY_M) - meterToCanvasX(0))}
                  y={meterToCanvasY(yM / 2)}
                  textAnchor="middle"
                  transform={`rotate(-90, ${meterToCanvasX(wall === "left" ? rulerXm : rulerXm) + (meterToCanvasX(TEXT_LINE1_DY_M) - meterToCanvasX(0))}, ${meterToCanvasY(yM / 2)})`}
                  style={{ fontSize: 12, fill: textFill }}
                >
                  {topDistCm}cm
                </text>

                {/* Bottom dimension label (rotated) */}
                <text
                  x={meterToCanvasX(wall === "left" ? rulerXm : rulerXm) + (meterToCanvasX(TEXT_LINE1_DY_M) - meterToCanvasX(0))}
                  y={meterToCanvasY((yM + L) / 2)}
                  textAnchor="middle"
                  transform={`rotate(-90, ${meterToCanvasX(wall === "left" ? rulerXm : rulerXm) + (meterToCanvasX(TEXT_LINE1_DY_M) - meterToCanvasX(0))}, ${meterToCanvasY((yM + L) / 2)})`}
                  style={{ fontSize: 12, fill: textFill }}
                >
                  {bottomDistCm}cm
                </text>

                {/* Speaker ID */}
                <text
                  x={dotX + 10}
                  y={dotY + 4}
                  textAnchor="start"
                  style={{ fontSize: 12, fill: textFill, fontWeight: 700 }}
                >
                  {roleText}
                </text>

                {/* Model */}
                {!!modelText && (
                  <text
                    x={dotX + 10}
                    y={dotY + 16}
                    textAnchor="start"
                    style={{ fontSize: 11, fill: textFill, fontWeight: 400 }}
                  >
                    {modelText}
                  </text>
                )}

                {/* Height */}
                <text
                  x={dotX + 10}
                  y={dotY + 28}
                  textAnchor="start"
                  style={{ fontSize: 12, fill: textFill, fontWeight: 400 }}
                >
                  {heightText}
                </text>
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}