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
const LCR_MIN_STACK_GAP_PX = 26;   // minimum lane separation
const LCR_MAX_STACK_GAP_PX = 56;   // maximum lane separation (nice airy UI)
const LCR_LINE_TO_TEXT_PX = 14;
const LCR_TOP_PAD_PX = 54;

// Safety margins (px)
const LCR_TOP_SAFE_PX = 18;        // never draw above this Y
const LCR_LABEL_NUDGE_PX = 18;     // small x nudge when two labels would collide

// Side wall constants
const SIDE_LABEL_PAD_PX = 38;
const SIDE_STACK_GAP_PX = 34;
const TOP_CLEAR_M = 0.35;

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

    // Auto lane spacing so we never clip off the top of the SVG
    const lcrCount = lcr.length;

    // How much vertical room exists ABOVE the room?
    const availableAbovePx = Math.max(0, (roomRect.y - LCR_TOP_SAFE_PX) - LCR_TOP_PAD_PX);

    // If we have enough room, use a "nice" gap. If not, compress.
    const idealGap = LCR_MAX_STACK_GAP_PX;
    const maxGapThatFits = lcrCount <= 1 ? idealGap : (availableAbovePx / (lcrCount - 1));
    const laneGapPx = Math.max(LCR_MIN_STACK_GAP_PX, Math.min(idealGap, maxGapThatFits));

    // Base Y is fixed, then lanes stack upwards by laneGapPx.
    // If laneGapPx has been compressed, this guarantees top-most line stays visible.
    const baseY = roomRect.y - LCR_TOP_PAD_PX;

    return (
      <g data-layer="speaker-positions-lcr" pointerEvents="none">
        {lcr.map((s, i) => {
          const xM = s.position.x;
          const role = String(s.role || "").toUpperCase();

          const yLine = baseY - (i * laneGapPx);
          const leftCm = mToCm(xM);
          const rightCm = mToCm(W - xM);

          const xPx = meterToCanvasX(xM);
          
          // Small nudge if two adjacent LCR x positions are close in screen pixels
          let xLabel = xPx;

          const prev = lcr[i - 1];
          if (prev) {
            const prevXPx = meterToCanvasX(prev.position.x);
            if (Math.abs(xPx - prevXPx) < 48) {
              xLabel = xPx + LCR_LABEL_NUDGE_PX;
            }
          }

          const next = lcr[i + 1];
          if (next) {
            const nextXPx = meterToCanvasX(next.position.x);
            if (Math.abs(xPx - nextXPx) < 48) {
              xLabel = xPx - LCR_LABEL_NUDGE_PX;
            }
          }
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

              {/* Role centred under the dot */}
              <text
                x={xPx}
                y={yLine + 16}
                textAnchor="middle"
                style={{ fontSize: 13, fill: "#1B1A1A", fontWeight: 700 }}
              >
                {role}
              </text>

              {/* Height to the right of the role (same line, not bold) */}
              <text
                x={xPx + 18}
                y={yLine + 16}
                textAnchor="start"
                style={{ fontSize: 12, fill: "#3E4349", fontWeight: 400 }}
              >
                {`H${mToCm(bedHeightM(s.position.y))}cm`}
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
      
      // Skip left wall entirely (no dimension overlay for left wall)
      if (wall === "left") return null;
      
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
              {/* distances close to the dot */}
              <text
                x={dotX - 14}
                y={dotY - 8}
                textAnchor="end"
                style={{ fontSize: 12, fill: textFill }}
              >
                {leftDistCm}cm
              </text>
              <text
                x={dotX + 14}
                y={dotY - 8}
                textAnchor="start"
                style={{ fontSize: 12, fill: textFill }}
              >
                {rightDistCm}cm
              </text>

              {/* Role centred under the dot */}
              <text
                x={dotX}
                y={dotY + 16}
                textAnchor="middle"
                style={{ fontSize: 13, fill: textFill, fontWeight: 700 }}
              >
                {roleText}
              </text>

              {/* Height to the right of the role */}
              <text
                x={dotX + 18}
                y={dotY + 16}
                textAnchor="start"
                style={{ fontSize: 12, fill: "#3E4349", fontWeight: 400 }}
              >
                {heightText}
              </text>
            </>
          ) : (
            <>
              {/* distances close to the dot (above / below), not mid-wall */}
              <text
                x={wall === "left" ? dotX - 14 : dotX + 14}
                y={dotY - 8}
                textAnchor={wall === "left" ? "end" : "start"}
                style={{ fontSize: 12, fill: textFill }}
              >
                {topDistCm}cm
              </text>

              <text
                x={wall === "left" ? dotX - 14 : dotX + 14}
                y={dotY + 18}
                textAnchor={wall === "left" ? "end" : "start"}
                style={{ fontSize: 12, fill: textFill }}
              >
                {bottomDistCm}cm
              </text>

              {/* speaker label "under" the dot in the rotated orientation, with H next to it */}
              <g
                transform={
                  wall === "left"
                    ? `translate(${dotX - SIDE_LABEL_PAD_PX}, ${dotY}) rotate(-90)`
                    : `translate(${dotX + SIDE_LABEL_PAD_PX}, ${dotY}) rotate(-90)`
                }
              >
                {/* role centred under dot */}
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  style={{ fontSize: 13, fill: textFill, fontWeight: 700 }}
                >
                  {roleText}
                </text>

                {/* H value next to role, same style as dims */}
                <text
                  x={0}
                  y={0}
                  dx={wall === "left" ? -22 : 22}
                  textAnchor={wall === "left" ? "end" : "start"}
                  style={{ fontSize: 12, fill: "#3E4349", fontWeight: 400 }}
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