import React from "react";
import { getSpeakerModelMeta, normaliseModelKey } from "@/components/models/speakers/registry";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const mToCm = (m) => Math.round(Number(m) * 100);

const prettyModel = (raw) => {
  if (!raw) return "";
  
  // Try to get display name from registry first
  try {
    const normalised = normaliseModelKey(raw);
    const meta = getSpeakerModelMeta(normalised);
    if (meta?.displayName) return meta.displayName;
    if (meta?.name) return meta.name;
  } catch (e) {
    // fallback
  }
  
  // Fallback formatting
  const s = String(raw);
  return s
    .replace(/_s$/, "")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// Spacing constants (px)
const LCR_STACK_GAP_PX = 52;
const LCR_LINE_TO_TEXT_PX = 14;
const LCR_SIDE_TEXT_GAP_PX = 18;
const LCR_TOP_PAD_PX = 54;

// Side wall constants
const SIDE_LABEL_PAD_PX = 26;
const SIDE_STACK_GAP_PX = 34;
const TOP_CLEAR_M = 0.22;

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

  // --- Seating rows (for height logic) ---
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
    if (rows.length < 2) return 1.2;
    const row2Y = rows[1];
    const row3Y = rows[2];
    if (isNum(row3Y) && speakerY > row3Y) return 1.8;
    if (speakerY > row2Y) return 1.5;
    return 1.2;
  };

  // --- Filter bed speakers (no subs/LFE, no overheads) ---
  const bedSpeakers = (Array.isArray(speakers) ? speakers : []).filter((s) => {
    const role = String(s?.role || "").toUpperCase();
    if (!role) return false;
    if (role === "SUB" || role === "LFE") return false;
    if (role.startsWith("T")) return false;
    const x = s?.position?.x;
    const y = s?.position?.y;
    return isNum(x) && isNum(y);
  });

  // --- Split LCR vs surrounds ---
  const lcrRoles = new Set(["FL","FC","FR","L","C","R"]);
  const lcr = bedSpeakers
    .filter(s => lcrRoles.has(String(s.role || "").toUpperCase()))
    .sort((a,b) => (a.position.x ?? 0) - (b.position.x ?? 0));

  const surrounds = bedSpeakers.filter(s => !lcrRoles.has(String(s.role || "").toUpperCase()));

  // --- Assign wall and laneIndex to surrounds only ---
  const speakersWithLanes = surrounds.map((s) => {
    const xM = s.position.x;
    const yM = s.position.y;
    const role = String(s.role).toUpperCase();

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

  // Group by wall and sort
  const frontGroup = speakersWithLanes.filter(s => s.wall === "front").sort((a, b) => a.xM - b.xM);
  const backGroup = speakersWithLanes.filter(s => s.wall === "back").sort((a, b) => a.xM - b.xM);
  const leftGroup = speakersWithLanes.filter(s => s.wall === "left").sort((a, b) => a.yM - b.yM);
  const rightGroup = speakersWithLanes.filter(s => s.wall === "right").sort((a, b) => a.yM - b.yM);

  frontGroup.forEach((s, idx) => s.laneIndex = idx);
  backGroup.forEach((s, idx) => s.laneIndex = idx);
  leftGroup.forEach((s, idx) => s.laneIndex = idx);
  rightGroup.forEach((s, idx) => s.laneIndex = idx);

  const stroke = "#DCDBD6";
  const dotFill = "#213428";
  const textFill = "#1B1A1A";

  // --- Safe drawing margins INSIDE the clipped viewport (px) ---
  // These ensure nothing can go off-canvas / get clipped.
  const SAFE_TOP_PX = 18;
  const SAFE_SIDE_PX = 18;

  const clampPx = (v, min, max) => Math.max(min, Math.min(max, v));

  const safeTopY = roomRect.y + SAFE_TOP_PX;
  const safeBottomY = roomRect.y + roomRect.height - SAFE_TOP_PX;

  const safeLeftX = roomRect.x + SAFE_SIDE_PX;
  const safeRightX = roomRect.x + roomRect.width - SAFE_SIDE_PX;

  // Helper for distance formatting
  const cm = (m) => `${mToCm(m)}cm`;

  // --- LCR RENDERER (stacked lines, pixel-based) ---
  const renderLcrDims = () => {
    if (!lcr.length) return null;

    const baseY = roomRect.y - LCR_TOP_PAD_PX;

    return (
      <g data-layer="speaker-positions-lcr" pointerEvents="none">
        {lcr.map((s, i) => {
          const xM = s.position.x;
          const role = String(s.role || "").toUpperCase();

          const yLine = baseY - (i * LCR_STACK_GAP_PX);
          const leftCm = mToCm(xM);
          const rightCm = mToCm(W - xM);
          const modelText = prettyModel(s.modelLabel || s.model);

          const xPx = meterToCanvasX(xM);
          const xLeftPx = roomRect.x;
          const xRightPx = roomRect.x + roomRect.width;

          return (
            <g key={`lcr-dim-${role}-${i}`}>
              <line
                x1={xLeftPx}
                y1={yLine}
                x2={xRightPx}
                y2={yLine}
                stroke="#DCDBD6"
                strokeWidth={2}
                markerStart="url(#spk-dim-arrow)"
                markerEnd="url(#spk-dim-arrow)"
              />

              <circle cx={xPx} cy={yLine} r={5} fill="#213428" />

              {/* distances close to the dot */}
              <text
                x={xPx - 14}
                y={yLine - 8}
                textAnchor="end"
                style={{ fontSize: 12, fill: "#1B1A1A" }}
              >
                {leftCm}cm
              </text>
              <text
                x={xPx + 14}
                y={yLine - 8}
                textAnchor="start"
                style={{ fontSize: 12, fill: "#1B1A1A" }}
              >
                {rightCm}cm
              </text>

              <text
                x={xPx}
                y={yLine + 20}
                textAnchor="middle"
                fontSize={13}
                fill="#1B1A1A"
                fontWeight={700}
              >
                {role}
              </text>

              {modelText && (
                <text
                  x={xPx + 18}
                  y={yLine + 36}
                  textAnchor="start"
                  style={{ fontSize: 12, fill: "#3E4349" }}
                >
                  {modelText}
                </text>
              )}

              <text
                x={xPx + 18}
                y={yLine + 52}
                textAnchor="start"
                style={{ fontSize: 12, fill: "#3E4349" }}
              >
                H{mToCm(bedHeightM(s.position.y))}cm
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  // --- SURROUND RENDERER (lanes) ---
  const renderSurroundDims = () => {
    if (!speakersWithLanes.length) return null;

    const scale = roomRect.width / W;

    return speakersWithLanes.map((s, idx) => {
      const { xM, yM, role, wall, laneIndex } = s;
      const hCm = mToCm(bedHeightM(yM));

      const xPx = meterToCanvasX(xM);
      const yPx = meterToCanvasY(yM);

      const xLeftPx = roomRect.x;
      const xRightPx = roomRect.x + roomRect.width;
      const yTopPx = roomRect.y;
      const yBottomPx = roomRect.y + roomRect.height;

      let lineX1, lineY1, lineX2, lineY2, dotX, dotY;
      let leftDistCm, rightDistCm, topDistCm, bottomDistCm;
      let isHorizontal;

      if (wall === "front") {
        const stackOffset = laneIndex * SIDE_STACK_GAP_PX;
        const rulerYpx = roomRect.y - TOP_CLEAR_M * scale - stackOffset;
        lineX1 = xLeftPx;
        lineY1 = rulerYpx;
        lineX2 = xRightPx;
        lineY2 = rulerYpx;
        dotX = xPx;
        dotY = rulerYpx;
        leftDistCm = mToCm(xM);
        rightDistCm = mToCm(W - xM);
        isHorizontal = true;
      } else if (wall === "back") {
        const stackOffset = laneIndex * SIDE_STACK_GAP_PX;
        const rulerYpx = roomRect.y + roomRect.height + (TOP_CLEAR_M * scale) + stackOffset;
        lineX1 = xLeftPx;
        lineY1 = rulerYpx;
        lineX2 = xRightPx;
        lineY2 = rulerYpx;
        dotX = xPx;
        dotY = rulerYpx;
        leftDistCm = mToCm(xM);
        rightDistCm = mToCm(W - xM);
        isHorizontal = true;
      } else if (wall === "left") {
        const stackOffset = laneIndex * SIDE_STACK_GAP_PX;
        const rulerXpx = roomRect.x - (TOP_CLEAR_M * scale) - stackOffset;
        lineX1 = rulerXpx;
        lineY1 = yTopPx;
        lineX2 = rulerXpx;
        lineY2 = yBottomPx;
        dotX = rulerXpx;
        dotY = yPx;
        topDistCm = mToCm(yM);
        bottomDistCm = mToCm(L - yM);
        isHorizontal = false;
      } else {
        const stackOffset = laneIndex * SIDE_STACK_GAP_PX;
        const rulerXpx = roomRect.x + roomRect.width + (TOP_CLEAR_M * scale) + stackOffset;
        lineX1 = rulerXpx;
        lineY1 = yTopPx;
        lineX2 = rulerXpx;
        lineY2 = yBottomPx;
        dotX = rulerXpx;
        dotY = yPx;
        topDistCm = mToCm(yM);
        bottomDistCm = mToCm(L - yM);
        isHorizontal = false;
      }

      const roleText = role;
      const modelText = prettyModel(s?.modelLabel || s?.model);
      const heightText = `H${hCm}cm`;

      return (
        <g key={`${role}-${idx}`} opacity={0.95}>
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

          <circle cx={dotX} cy={dotY} r={5} fill={dotFill} />

          {isHorizontal ? (
            <>
              <text
                x={meterToCanvasX(xM / 2)}
                y={dotY - 8}
                textAnchor="middle"
                style={{ fontSize: 12, fill: textFill }}
              >
                {leftDistCm}cm
              </text>

              <text
                x={meterToCanvasX((xM + W) / 2)}
                y={dotY - 8}
                textAnchor="middle"
                style={{ fontSize: 12, fill: textFill }}
              >
                {rightDistCm}cm
              </text>

              <text
                x={dotX}
                y={dotY + 16}
                textAnchor="middle"
                style={{ fontSize: 12, fill: textFill, fontWeight: 700 }}
              >
                {roleText}
              </text>

              {!!modelText && (
                <text
                  x={dotX}
                  y={dotY + 28}
                  textAnchor="middle"
                  style={{ fontSize: 11, fill: textFill, fontWeight: 400 }}
                >
                  {modelText}
                </text>
              )}

              <text
                x={meterToCanvasX((xM + W) / 2)}
                y={dotY + 16}
                textAnchor="middle"
                style={{ fontSize: 12, fill: textFill, fontWeight: 400 }}
              >
                {heightText}
              </text>
            </>
          ) : (
            <>
              <text
                x={dotX - 12}
                y={meterToCanvasY(yM / 2)}
                textAnchor="middle"
                transform={`rotate(-90, ${dotX - 12}, ${meterToCanvasY(yM / 2)})`}
                style={{ fontSize: 12, fill: textFill }}
              >
                {topDistCm}cm
              </text>

              <text
                x={dotX - 12}
                y={meterToCanvasY((yM + L) / 2)}
                textAnchor="middle"
                transform={`rotate(-90, ${dotX - 12}, ${meterToCanvasY((yM + L) / 2)})`}
                style={{ fontSize: 12, fill: textFill }}
              >
                {bottomDistCm}cm
              </text>

              <g transform={`rotate(-90, ${wall === 'left' ? dotX + SIDE_LABEL_PAD_PX : dotX - SIDE_LABEL_PAD_PX}, ${dotY})`}>
                <text
                  x={wall === 'left' ? dotX + SIDE_LABEL_PAD_PX : dotX - SIDE_LABEL_PAD_PX}
                  y={dotY + 4}
                  textAnchor="middle"
                  style={{ fontSize: 12, fill: textFill, fontWeight: 700 }}
                >
                  {roleText}
                </text>

                {!!modelText && (
                  <text
                    x={wall === 'left' ? dotX + SIDE_LABEL_PAD_PX : dotX - SIDE_LABEL_PAD_PX}
                    y={dotY + 16}
                    textAnchor="middle"
                    style={{ fontSize: 11, fill: textFill, fontWeight: 400 }}
                  >
                    {modelText}
                  </text>
                )}

                <text
                  x={wall === 'left' ? dotX + SIDE_LABEL_PAD_PX : dotX - SIDE_LABEL_PAD_PX}
                  y={dotY + 28}
                  textAnchor="middle"
                  style={{ fontSize: 12, fill: textFill, fontWeight: 400 }}
                >
                  {heightText}
                </text>
              </g>
            </>
          )}
        </g>
      );
    });
  };

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
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#DCDBD6" />
        </marker>
      </defs>

      {renderLcrDims()}
      {renderSurroundDims()}
    </g>
  );
}