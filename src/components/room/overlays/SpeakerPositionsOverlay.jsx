import React from "react";
import { getSpeakerModelMeta, normaliseModelKey } from "@/components/models/speakers/registry";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const mToCm = (m) => Math.round(Number(m) * 100);

// Dynamic font size so labels never clash in small rooms
const calcFontSize = (pxPositions = [], {
  maxFont = 12,
  minFont = 9,
  large = 90,
  med = 70,
  small = 55,
} = {}) => {
  const xs = (Array.isArray(pxPositions) ? pxPositions : [])
    .filter((v) => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => a - b);

  if (xs.length <= 1) return maxFont;

  let minGap = Infinity;
  for (let i = 1; i < xs.length; i++) {
    minGap = Math.min(minGap, xs[i] - xs[i - 1]);
  }

  if (minGap >= large) return maxFont;       // 12
  if (minGap >= med) return Math.max(minFont, maxFont - 1);   // 11
  if (minGap >= small) return Math.max(minFont, maxFont - 2); // 10
  return minFont;                             // 9
};

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

  // --- FRONT WALL RENDERER (single line, multiple dots) ---
  const renderFrontDims = () => {
    if (!lcr.length) return null;

    const yLine = roomRect.y - LCR_TOP_PAD_PX;
    const xLeftPx = roomRect.x;
    const xRightPx = roomRect.x + roomRect.width;

    // Calculate font size based on spacing
    const xPositions = lcr.map(s => meterToCanvasX(s.position.x));
    const fontSize = calcFontSize(xPositions, xLeftPx, xRightPx);
    const roleFontSize = fontSize + 1;

    return (
      <g data-layer="speaker-positions-front" pointerEvents="none">
        {/* Single dimension line for front wall */}
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

        {/* Dots and labels for each speaker */}
        {lcr.map((s, i) => {
          const xM = s.position.x;
          const role = String(s.role || "").toUpperCase();
          const xPx = meterToCanvasX(xM);
          const leftCm = mToCm(xM);
          const rightCm = mToCm(W - xM);

          // Check for close neighbors to adjust text offset
          let leftOffset = 14;
          let rightOffset = 14;
          
          const prev = lcr[i - 1];
          if (prev) {
            const prevXPx = meterToCanvasX(prev.position.x);
            if (Math.abs(xPx - prevXPx) < 40) {
              leftOffset = 10;
              rightOffset = 10;
            }
          }

          const next = lcr[i + 1];
          if (next) {
            const nextXPx = meterToCanvasX(next.position.x);
            if (Math.abs(xPx - nextXPx) < 40) {
              leftOffset = 10;
              rightOffset = 10;
            }
          }

          return (
            <g key={`front-dim-${role}-${i}`}>
              <circle cx={xPx} cy={yLine} r={5} fill="#213428" />

              {/* Left distance */}
              <text
                x={xPx - leftOffset}
                y={yLine - 8}
                textAnchor="end"
                style={{ fontSize, fill: "#1B1A1A" }}
              >
                {leftCm}cm
              </text>

              {/* Right distance */}
              <text
                x={xPx + rightOffset}
                y={yLine - 8}
                textAnchor="start"
                style={{ fontSize, fill: "#1B1A1A" }}
              >
                {rightCm}cm
              </text>

              {/* Role centred under the dot */}
              <text
                x={xPx}
                y={yLine + 16}
                textAnchor="middle"
                style={{ fontSize: roleFontSize, fill: "#1B1A1A", fontWeight: 700 }}
              >
                {role}
              </text>

              {/* Height to the right of the role */}
              <text
                x={xPx + 18}
                y={yLine + 16}
                textAnchor="start"
                style={{ fontSize, fill: "#3E4349", fontWeight: 400 }}
              >
                {`H${mToCm(bedHeightM(s.position.y))}cm`}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  // --- BACK WALL RENDERER (single line, multiple dots) ---
  const renderBackDims = () => {
    if (!backGroup.length) return null;

    const scale = roomRect.width / W;
    const rulerYpx = roomRect.y + roomRect.height + (TOP_CLEAR_M * scale);

    const xLeftPx = roomRect.x;
    const xRightPx = roomRect.x + roomRect.width;

    // Calculate font size
    const xPositions = backGroup.map(s => meterToCanvasX(s.xM));
    const fontSize = calcFontSize(xPositions, xLeftPx, xRightPx);
    const roleFontSize = fontSize + 1;

    return (
      <g data-layer="speaker-positions-back" pointerEvents="none">
        {/* Single dimension line for back wall */}
        <line
          x1={xLeftPx}
          y1={rulerYpx}
          x2={xRightPx}
          y2={rulerYpx}
          stroke={stroke}
          strokeWidth={2}
          markerStart="url(#spk-dim-arrow)"
          markerEnd="url(#spk-dim-arrow)"
        />

        {/* Dots and labels for each speaker */}
        {backGroup.map((s, idx) => {
          const xPx = meterToCanvasX(s.xM);
          const leftDistCm = mToCm(s.xM);
          const rightDistCm = mToCm(W - s.xM);
          const hCm = mToCm(bedHeightM(s.yM));

          // Check for close neighbors
          let leftOffset = 14;
          let rightOffset = 14;
          
          if (idx > 0) {
            const prevXPx = meterToCanvasX(backGroup[idx - 1].xM);
            if (Math.abs(xPx - prevXPx) < 40) {
              leftOffset = 10;
              rightOffset = 10;
            }
          }

          if (idx < backGroup.length - 1) {
            const nextXPx = meterToCanvasX(backGroup[idx + 1].xM);
            if (Math.abs(xPx - nextXPx) < 40) {
              leftOffset = 10;
              rightOffset = 10;
            }
          }

          return (
            <g key={`back-dim-${s.role}-${idx}`}>
              <circle cx={xPx} cy={rulerYpx} r={5} fill={dotFill} />

              {/* Left distance */}
              <text
                x={xPx - leftOffset}
                y={rulerYpx - 8}
                textAnchor="end"
                style={{ fontSize, fill: textFill }}
              >
                {leftDistCm}cm
              </text>

              {/* Right distance */}
              <text
                x={xPx + rightOffset}
                y={rulerYpx - 8}
                textAnchor="start"
                style={{ fontSize, fill: textFill }}
              >
                {rightDistCm}cm
              </text>

              {/* Role centred under the dot */}
              <text
                x={xPx}
                y={rulerYpx + 16}
                textAnchor="middle"
                style={{ fontSize: roleFontSize, fill: textFill, fontWeight: 700 }}
              >
                {s.role}
              </text>

              {/* Height to the right of the role */}
              <text
                x={xPx + 18}
                y={rulerYpx + 16}
                textAnchor="start"
                style={{ fontSize, fill: "#3E4349", fontWeight: 400 }}
              >
                {`H${hCm}cm`}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  // --- RIGHT WALL RENDERER (single line, multiple dots) ---
  const renderRightDims = () => {
    if (!rightGroup.length) return null;

    const scale = roomRect.width / W;
    const rulerXpx = roomRect.x + roomRect.width + (TOP_CLEAR_M * scale);

    const yTopPx = roomRect.y;
    const yBottomPx = roomRect.y + roomRect.height;

    // Calculate font size based on vertical spacing
    const yPositions = rightGroup.map(s => meterToCanvasY(s.yM));
    const fontSize = calcFontSize(yPositions, yTopPx, yBottomPx);

    return (
      <g data-layer="speaker-positions-right" pointerEvents="none">
        {/* Single dimension line for right wall */}
        <line
          x1={rulerXpx}
          y1={yTopPx}
          x2={rulerXpx}
          y2={yBottomPx}
          stroke={stroke}
          strokeWidth={2}
          markerStart="url(#spk-dim-arrow)"
          markerEnd="url(#spk-dim-arrow)"
        />

        {/* Dots and labels for each speaker */}
        {rightGroup.map((s, idx) => {
          const yPx = meterToCanvasY(s.yM);
          const topDistCm = mToCm(s.yM);
          const bottomDistCm = mToCm(L - s.yM);
          const hCm = mToCm(bedHeightM(s.yM));

          // Check for close neighbors to adjust label position
          let labelNudge = 0;
          
          if (idx > 0) {
            const prevYPx = meterToCanvasY(rightGroup[idx - 1].yM);
            if (Math.abs(yPx - prevYPx) < 50) {
              labelNudge = 4;
            }
          }

          return (
            <g key={`right-dim-${s.role}-${idx}`}>
              <circle cx={rulerXpx} cy={yPx} r={5} fill={dotFill} />

              {/* Top distance (rotated) */}
              <text
                x={rulerXpx - 12}
                y={meterToCanvasY(s.yM / 2)}
                textAnchor="middle"
                transform={`rotate(-90, ${rulerXpx - 12}, ${meterToCanvasY(s.yM / 2)})`}
                style={{ fontSize, fill: textFill }}
              >
                {topDistCm}cm
              </text>

              {/* Bottom distance (rotated) */}
              <text
                x={rulerXpx - 12}
                y={meterToCanvasY((s.yM + L) / 2)}
                textAnchor="middle"
                transform={`rotate(-90, ${rulerXpx - 12}, ${meterToCanvasY((s.yM + L) / 2)})`}
                style={{ fontSize, fill: textFill }}
              >
                {bottomDistCm}cm
              </text>

              {/* Role and height (rotated, to the right of the dot) */}
              <g transform={`rotate(-90, ${rulerXpx - SIDE_LABEL_PAD_PX}, ${yPx + labelNudge})`}>
                <text
                  x={rulerXpx - SIDE_LABEL_PAD_PX}
                  y={yPx + 4 + labelNudge}
                  textAnchor="middle"
                  style={{ fontSize, fill: textFill, fontWeight: 700 }}
                >
                  {s.role}
                  <tspan
                    dx={8}
                    style={{ fontWeight: 400, fill: "#3E4349" }}
                  >
                    {`H${hCm}cm`}
                  </tspan>
                </text>
              </g>
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
      
      // Skip left wall speakers entirely
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
                  <tspan
                    dx={8}
                    style={{ fontWeight: 400, fill: "#3E4349" }}
                  >
                    {heightText}
                  </tspan>
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

      {renderFrontDims()}
      {renderRightDims()}
      {renderBackDims()}
    </g>
  );
}