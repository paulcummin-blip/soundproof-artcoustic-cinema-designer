import React from "react";
import { getSpeakerModelMeta, normaliseModelKey } from "@/components/models/speakers/registry";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const mToCm = (m) => Math.round(Number(m) * 100);

// Dynamic font sizing based on local label crowding
const computeDynamicFontSize = (labels, defaultSize = 11) => {
  if (!labels || !labels.length) return defaultSize;
  
  const MIN_FONT = 9;
  const MAX_FONT = defaultSize;
  
  // Helper to compute text bounding box
  const getTextBox = (label, fontSize) => {
    const approxW = label.text.length * fontSize * 0.6;
    const approxH = fontSize * 1.1;
    
    let xMin, xMax, yMin, yMax;
    
    if (label.textAnchor === 'middle') {
      xMin = label.x - approxW / 2;
      xMax = label.x + approxW / 2;
    } else if (label.textAnchor === 'start') {
      xMin = label.x;
      xMax = label.x + approxW;
    } else { // 'end'
      xMin = label.x - approxW;
      xMax = label.x;
    }
    
    yMin = label.y - approxH;
    yMax = label.y;
    
    return { xMin, xMax, yMin, yMax };
  };
  
  // Check if two boxes overlap
  const boxesOverlap = (box1, box2) => {
    return !(box1.xMax < box2.xMin || box1.xMin > box2.xMax ||
             box1.yMax < box2.yMin || box1.yMin > box2.yMax);
  };
  
  // Test font size for overlaps
  for (let fontSize = MAX_FONT; fontSize >= MIN_FONT; fontSize--) {
    const boxes = labels.map(label => getTextBox(label, fontSize));
    
    let hasOverlap = false;
    for (let i = 0; i < boxes.length && !hasOverlap; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (boxesOverlap(boxes[i], boxes[j])) {
          hasOverlap = true;
          break;
        }
      }
    }
    
    if (!hasOverlap) return fontSize;
  }
  
  return MIN_FONT;
};

// Vertical ruler crowding detector for rotated text
const getCrowdedFontSize = (yPxList, baseSize = 11) => {
  if (!yPxList || yPxList.length <= 1) return baseSize;
  
  const sorted = [...yPxList].sort((a, b) => a - b);
  let minDy = Infinity;
  
  for (let i = 1; i < sorted.length; i++) {
    const dy = sorted[i] - sorted[i - 1];
    if (dy < minDy) minDy = dy;
  }
  
  if (minDy < 40) return Math.max(9, baseSize - 3);
  if (minDy < 52) return Math.max(9, baseSize - 2);
  if (minDy < 64) return Math.max(9, baseSize - 1);
  
  return baseSize;
};

// Font scaling: default slightly smaller than before, shrink further if crowded
const calcFontSize = (basePx, roomWidthPx) => {
  const w = Number(roomWidthPx) || 0;
  if (w < 260) return Math.max(9, basePx - 3);
  if (w < 360) return Math.max(10, basePx - 2);
  if (w < 520) return Math.max(11, basePx - 1);
  return basePx;
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
const LCR_TOP_PAD_PX = 27; // 50% closer to the room

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
  getSpeakerVisibility,
  getCanonicalRole,
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

  // Row Y positions (front to back), clustered from seating positions
  const rowYs = (() => {
    const ys = (Array.isArray(seatingPositions) ? seatingPositions : [])
      .map((s) => s?.y)
      .filter(isNum)
      .sort((a, b) => a - b);

    const out = [];
    for (const y of ys) {
      const last = out[out.length - 1];
      if (!last || Math.abs(y - last) > 0.20) out.push(y);
    }
    return out;
  })();

  // Raked seating heights by row count
  const rowHeightsM = (() => {
    if (rowYs.length <= 1) return [1.2];
    if (rowYs.length === 2) return [1.2, 1.5];
    return [1.2, 1.5, 1.8]; // 3+ rows
  })();

  // Midpoints between rows (used to "step up" along side walls)
  const rowMid12 = (rowYs.length >= 2) ? ((rowYs[0] + rowYs[1]) / 2) : null;
  const rowMid23 = (rowYs.length >= 3) ? ((rowYs[1] + rowYs[2]) / 2) : null;

  const bedHeightM = (role, speakerY) => {
    const r = String(role || "").toUpperCase();

    // Front Wides always match Row 1 height
    if (r === "LW" || r === "RW") return rowHeightsM[0];

    // Rear speakers always match the last row height
    if (r === "SBL" || r === "SBR" || r === "RBL" || r === "RBR") {
      return rowHeightsM[rowHeightsM.length - 1];
    }

    // If only one row, everything is Row 1 height
    if (rowHeightsM.length === 1 || !isNum(speakerY)) return rowHeightsM[0];

    // Two rows: step up after midpoint
    if (rowHeightsM.length === 2) {
      return (speakerY > rowMid12) ? rowHeightsM[1] : rowHeightsM[0];
    }

    // Three rows: step at each midpoint
    if (speakerY > rowMid23) return rowHeightsM[2];
    if (speakerY > rowMid12) return rowHeightsM[1];
    return rowHeightsM[0];
  };

  const overheadHeightCm = () => {
    const Hm = Number(
      dimensions?.height ??
      dimensions?.heightM ??
      dimensions?.roomHeight ??
      dimensions?.roomHeightM ??
      dimensions?.ceilingHeight ??
      dimensions?.ceilingHeightM ??
      0
    );

    if (!(Hm > 0)) return null;
    return mToCm(Hm);
  };

  // Helper to check if speaker has valid position
  const hasPos = (s) => s?.position && isNum(s.position.x) && isNum(s.position.y);

  // --- Filter bed speakers (no subs/LFE, no overheads) ---
  // CRITICAL: Use same visibility filter as plan view to hide unused FW/RW
  const bedSpeakers = (Array.isArray(speakers) ? speakers : []).filter((s) => {
    const role = String(s?.role || "").toUpperCase();
    if (!role) return false;
    if (role === "SUB" || role === "LFE") return false;
    if (role.startsWith("T")) return false;
    if (!hasPos(s)) return false;
    
    // CRITICAL: Reuse plan view visibility logic to hide unused speakers (FW/RW when not in layout)
    if (typeof getSpeakerVisibility === "function") {
      return getSpeakerVisibility(role, s.model) !== false;
    }
    
    return true;
  });

  // --- Overhead speakers (separate from bed speakers) ---
  // CRITICAL: Use same visibility filter as plan view to hide inactive overheads
  const overheadSpeakers = (Array.isArray(speakers) ? speakers : []).filter((s) => {
    const role = String(s?.role || "").toUpperCase();
    if (!role) return false;
    if (!role.startsWith("T")) return false;
    if (!hasPos(s)) return false;
    
    // CRITICAL: Reuse plan view visibility logic
    if (typeof getSpeakerVisibility === "function") {
      return getSpeakerVisibility(role, s.model) !== false;
    }
    
    return true;
  });

  // Split overheads into left/right columns by room midline
  const overheadLeft = overheadSpeakers
    .filter((s) => (s.position.x ?? 0) < (W / 2))
    .sort((a, b) => (a.position.y ?? 0) - (b.position.y ?? 0));

  const overheadRight = overheadSpeakers
    .filter((s) => (s.position.x ?? 0) >= (W / 2))
    .sort((a, b) => (a.position.y ?? 0) - (b.position.y ?? 0));

  // Overhead rows should ONLY exist if the corresponding overhead roles exist.
  // Front row: TF*
  // Mid row:   TM*
  // Rear row:  TB*
  const overheadRows = (() => {
    const rows = [];

    const front = overheadSpeakers.filter(s => String(s.role || "").toUpperCase().startsWith("TF"));
    const mid   = overheadSpeakers.filter(s => String(s.role || "").toUpperCase().startsWith("TM"));
    const rear  = overheadSpeakers.filter(s => String(s.role || "").toUpperCase().startsWith("TB"));

    const makeRow = (label, list) => {
      if (!list.length) return null;
      const items = list
        .map(s => ({ s, xM: s.position.x, yM: s.position.y }))
        .sort((a,b) => a.xM - b.xM);

      // Use average y as the ruler line Y (stable even if slightly uneven)
      const yM = items.reduce((sum, it) => sum + it.yM, 0) / items.length;

      return { label, yM, items };
    };

    const rFront = makeRow("front", front);
    const rMid   = makeRow("mid", mid);
    const rRear  = makeRow("rear", rear);

    if (rFront) rows.push(rFront);
    if (rMid)   rows.push(rMid);
    if (rRear)  rows.push(rRear);

    return rows;
  })();

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

    // Build label slots for dynamic font sizing
    const distanceLabels = [];
    const roleLabels = [];
    
    lcr.forEach((s, i) => {
      const xPx = meterToCanvasX(s.position.x);
      const leftCm = mToCm(s.position.x);
      const rightCm = mToCm(W - s.position.x);
      const hCm = mToCm(bedHeightM(s.role, s.position.y));
      
      distanceLabels.push(
        { x: xPx - 14, y: yLine - 8, text: `${leftCm}cm`, textAnchor: 'end' },
        { x: xPx + 14, y: yLine - 8, text: `${rightCm}cm`, textAnchor: 'start' }
      );
      
      roleLabels.push(
        { x: xPx, y: yLine + 16, text: String(s.role || '').toUpperCase(), textAnchor: 'middle' },
        { x: xPx + 18, y: yLine + 16, text: `H${hCm}cm`, textAnchor: 'start' }
      );
    });
    
    const fontSize = computeDynamicFontSize(distanceLabels, 11);
    const roleFontSize = computeDynamicFontSize(roleLabels, 12);

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
          const hCm = mToCm(bedHeightM(s.role, s.position.y));

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
                {`H${hCm}cm`}
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

    // Build label slots for dynamic font sizing
    const wallYpx = roomRect.y + roomRect.height;
    const labelYpx = wallYpx + 16;
    const distTextY = Math.min(rulerYpx + 12, wallYpx + 34);
    
    const distanceLabels = [];
    const roleLabels = [];
    
    backGroup.forEach((s, idx) => {
      const xPx = meterToCanvasX(s.xM);
      const leftDistCm = mToCm(s.xM);
      const rightDistCm = mToCm(W - s.xM);
      const hCm = mToCm(bedHeightM(s.role, s.yM));
      
      distanceLabels.push(
        { x: xPx - 14, y: distTextY, text: `${leftDistCm}cm`, textAnchor: 'end' },
        { x: xPx + 14, y: distTextY, text: `${rightDistCm}cm`, textAnchor: 'start' }
      );
      
      roleLabels.push(
        { x: xPx, y: labelYpx, text: String(s.role || '').toUpperCase(), textAnchor: 'middle' },
        { x: xPx + 18, y: labelYpx, text: `H${hCm}cm`, textAnchor: 'start' }
      );
    });
    
    const fontSize = computeDynamicFontSize(distanceLabels, 11);
    const roleFontSize = computeDynamicFontSize(roleLabels, 12);



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
          const hCm = mToCm(bedHeightM(s.role, s.yM));

          return (
            <g key={`back-dim-${s.role}-${idx}`}>
              <circle cx={xPx} cy={rulerYpx} r={5} fill={dotFill} />

              {/* Left distance (below the line, kept visible) */}
              <text
                x={xPx - 14}
                y={distTextY}
                textAnchor="end"
                style={{ fontSize, fill: textFill }}
              >
                {mToCm(s.xM)}cm
              </text>

              {/* Right distance (below the line, kept visible) */}
              <text
                x={xPx + 14}
                y={distTextY}
                textAnchor="start"
                style={{ fontSize, fill: textFill }}
              >
                {mToCm(W - s.xM)}cm
              </text>

              {/* Role + H: same consistent gap as LCR/sides */}
              <text
                x={xPx}
                y={labelYpx}
                textAnchor="middle"
                style={{ fontSize: roleFontSize, fill: textFill, fontWeight: 700 }}
              >
                {s.role}
              </text>

              <text
                x={xPx + 18}
                y={labelYpx}
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

    // Compute crowded font sizes for vertical ruler
    const yList = rightGroup.map(s => meterToCanvasY(s.yM)).sort((a, b) => a - b);
    const baseSize = calcFontSize(11, roomRect.width);
    const roleSize = calcFontSize(12, roomRect.width);
    const crowdedSize = getCrowdedFontSize(yList, baseSize);
    const crowdedRoleSize = Math.max(9, Math.min(roleSize, crowdedSize + 1));

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
          const hCm = mToCm(bedHeightM(s.role, s.yM));

          const dotX = rulerXpx;
          const dotY = yPx;

          // Treat this like LCR rotated:
          // left of dot = distance to BACK wall (rear) = L - yM
          // right of dot = distance to FRONT wall      = yM
          const distLeft = mToCm(L - s.yM);
          const distRight = mToCm(s.yM);

          const distDx = 14;   // same as LCR
          const distY = 12;    // flip to opposite side of dot
          const roleY = 16;    // same as LCR
          const hDx = 18;      // same as LCR

          // Compute stagger for very close dots
          let stagger = 0;
          if (idx > 0) {
            const prevYPx = meterToCanvasY(rightGroup[idx - 1].yM);
            if (Math.abs(yPx - prevYPx) < 44) {
              stagger = (idx % 2 === 0) ? -6 : 6;
            }
          }

          // Place ROLE + H between the wall edge and the ruler line
          // For right wall, label goes to the LEFT of the ruler line
          const labelX = dotX - SIDE_LABEL_PAD_PX;

          return (
            <g key={`right-dim-${s.role}-${idx}`}>
              <circle cx={dotX} cy={dotY} r={5} fill={dotFill} />

              {/* Distances either side of dot (like LCR), rotated as a unit */}
              <g transform={`translate(${dotX}, ${dotY}) rotate(-90)`}>
                <text
                  x={-distDx}
                  y={distY + stagger}
                  textAnchor="end"
                  style={{ fontSize: crowdedSize, fill: textFill }}
                >
                  {distLeft}cm
                </text>

                <text
                  x={distDx}
                  y={distY + stagger}
                  textAnchor="start"
                  style={{ fontSize: crowdedSize, fill: textFill }}
                >
                  {distRight}cm
                </text>
              </g>

              {/* Role + H identical spacing to LCR, positioned between wall and ruler, rotated as a unit */}
              <g transform={`translate(${labelX}, ${dotY}) rotate(-90)`}>
                <text
                  x={0}
                  y={roleY}
                  textAnchor="middle"
                  style={{ fontSize: crowdedRoleSize, fill: textFill, fontWeight: 700 }}
                >
                  {s.role}
                </text>

                <text
                  x={hDx}
                  y={roleY}
                  textAnchor="start"
                  style={{ fontSize: crowdedSize, fill: "#3E4349", fontWeight: 400 }}
                >
                  {`H${hCm}cm`}
                </text>
              </g>
            </g>
          );
        })}
      </g>
    );
  };

  // --- OVERHEAD VERTICAL RULERS (left + right columns, inside the room) ---
  const renderOverheadVerticalDims = () => {
    const Hcm = overheadHeightCm(); // may be null, that's ok

    // Left overhead ruler: dynamically sit ~20px to the LEFT of the left-most overhead icon edge,
    // but never outside the room (keep a small safety inset so it won't clip).
    const GAP_PX = 20;
    const SAFE_INSET_PX = 12;

    // approximate overhead icon radius on plan (matches your overhead dots visually)
    const ICON_R_PX = 12;

    // Find the left-most overhead icon edge in pixels (fallback to a safe inset if none)
    const leftMostOhEdgePx = overheadLeft.length
      ? Math.min(...overheadLeft.map(s => meterToCanvasX(s.position.x) - ICON_R_PX))
      : (roomRect.x + SAFE_INSET_PX);

    // Desired ruler X: 20px left of that edge
    const desiredLeftRulerX = leftMostOhEdgePx - GAP_PX;

    // Clamp so it always stays inside the roomRect
    const xLeftRuler = Math.max(roomRect.x + SAFE_INSET_PX, desiredLeftRulerX);

    // (we're no longer drawing the right overhead ruler)

    const yTopPx = roomRect.y;
    const yBottomPx = roomRect.y + roomRect.height;

    // Compute crowded font size for overhead vertical ruler
    const yList = overheadLeft.map(s => meterToCanvasY(s.position.y)).sort((a, b) => a - b);
    const baseSize = calcFontSize(11, roomRect.width);
    const crowdedSize = getCrowdedFontSize(yList, baseSize);

    const drawColumn = (list, rulerX, keyPrefix) => {
      if (!list.length) return null;

      return list.map((s, idx) => {
        const role = String(s.role || "").toUpperCase();
        const yM = s.position.y;
        const yPx = meterToCanvasY(yM);

        // distances to front/back walls
        const distFront = mToCm(yM);
        const distBack = mToCm(L - yM);

        const distDx = 14;
        const distY  = 12;
        const rot    = -90;
        
        // Compute stagger for very close dots
        let stagger = 0;
        if (idx > 0) {
          const prevYPx = meterToCanvasY(list[idx - 1].position.y);
          if (Math.abs(yPx - prevYPx) < 44) {
            stagger = (idx % 2 === 0) ? -6 : 6;
          }
        }

        return (
          <g key={`${keyPrefix}-${role}-${idx}`}>
            {/* dot on the vertical ruler */}
            <circle cx={rulerX} cy={yPx} r={5} fill={dotFill} />

            {/* distances either side of the dot (like LCR), but turned 90° */}
            {/* IMPORTANT: keep the same "rear on the left, front on the right" reading order */}
            <g transform={`translate(${rulerX}, ${yPx}) rotate(${rot})`}>
              <text
                x={-distDx}
                y={distY + stagger}
                textAnchor="end"
                style={{ fontSize: crowdedSize, fill: textFill }}
              >
                {distBack}cm
              </text>

              <text
                x={distDx}
                y={distY + stagger}
                textAnchor="start"
                style={{ fontSize: crowdedSize, fill: textFill }}
              >
                {distFront}cm
              </text>
            </g>
          </g>
        );
      });
    };

    return (
      <g data-layer="speaker-positions-overheads-vertical" pointerEvents="none">
        {/* Left vertical ruler */}
        {overheadLeft.length ? (
          <line
            x1={xLeftRuler}
            y1={yTopPx}
            x2={xLeftRuler}
            y2={yBottomPx}
            stroke={stroke}
            strokeWidth={2}
            markerStart="url(#spk-dim-arrow)"
            markerEnd="url(#spk-dim-arrow)"
          />
        ) : null}

        {drawColumn(overheadLeft, xLeftRuler, "ohL")}
      </g>
    );
  };

  // --- OVERHEAD HORIZONTAL RULERS (front/mid/rear rows, inside the room) ---
  const renderOverheadHorizontalDims = () => {
    const Hcm = overheadHeightCm(); // may be null, that's ok
    if (!overheadRows.length) return null;

    const xLeftPx = roomRect.x;
    const xRightPx = roomRect.x + roomRect.width;

    // --- Clash avoidance: push horizontal overhead rulers DOWN if they intersect the LEFT vertical ruler label lane ---

    const ICON_R_PX = 12;
    const GAP_FROM_ICON_PX = 20;

    // Left vertical ruler X (same logic as your dynamic left ruler)
    const leftOverheadMinXPx = overheadLeft.length
      ? Math.min(...overheadLeft.map(s => meterToCanvasX(s.position.x)))
      : null;

    const xLeftRuler = (leftOverheadMinXPx != null)
      ? (leftOverheadMinXPx - ICON_R_PX - GAP_FROM_ICON_PX)
      : null;

    // The vertical ruler's label lane sits to the RIGHT of the ruler (you used +22 before)
    const VERT_LABEL_LANE_LEFT_X  = (xLeftRuler != null) ? (xLeftRuler + 10) : null;
    const VERT_LABEL_LANE_RIGHT_X = (xLeftRuler != null) ? (xLeftRuler + 70) : null;

    // Build "blocked Y bands" around each left-column overhead dot (where the vertical distances + label text live)
    const blockedYBands = (overheadLeft || []).map((s) => {
      const y = meterToCanvasY(s.position.y);
      // Wider band to cover the real footprint of the rotated vertical distance text
      return { yMin: y - 46, yMax: y + 46 };
    });

    const overlapsBand = (y, band) => y >= band.yMin && y <= band.yMax;

    // If the horizontal line is within any blocked Y band, push it down by STEP_PX until clear
    const pushRowDownIfNeeded = (yPx) => {
      if (xLeftRuler == null) return yPx;

      let y = yPx;
      const STEP_PX = 24; // bigger step so it clears in one move
      const MAX_PUSH = 8;

      let loops = 0;
      while (loops < MAX_PUSH) {
        const hit = blockedYBands.some((b) => overlapsBand(y, b));
        if (!hit) break;
        y += STEP_PX;
        loops += 1;
      }
      return y;
    };

    return (
      <g data-layer="speaker-positions-overheads-horizontal" pointerEvents="none">
        {(() => {
          const row = overheadRows[0];
          if (!row) return null;

          const ySpeakerPx = meterToCanvasY(row.yM);

          // Keep the horizontal ruler a clean distance away from:
          // 1) the overhead icon edges
          // 2) the vertical ruler's label block (so it never clashes)
          //
          // Tunables:
          const ICON_R_PX = 12;
          const GAP_FROM_ICON_PX = 20;
          const SAFE_INSET_PX = 12;

          // This should match what you used for the vertical ruler label placement.
          // In your vertical overhead code you used: translate(rulerX + 22, ...) then rotate(-90)
          // That label block projects into the room by roughly this much:
          const V_LABEL_PROJECT_PX = 70;

          // If the vertical ruler exists, keep the horizontal line to the RIGHT of that label zone.
          // (We can't literally "move a horizontal line right", so instead we shift the y a bit
          // so the nearby text doesn't sit on top of the line.)
          const avoidLabelExtraY = overheadLeft.length ? 10 : 0;

          // Desired y: just BELOW the overhead icons for that row
          // Extra clearance so the horizontal ruler never clashes with the vertical ruler text lane
          const EXTRA_CLEAR_PX = overheadLeft.length ? 28 : 0;
          let yPxRaw = ySpeakerPx + ICON_R_PX + GAP_FROM_ICON_PX + avoidLabelExtraY + EXTRA_CLEAR_PX;

          // Clamp so it stays inside the room (and doesn't sit on the border)
          yPxRaw = Math.max(roomRect.y + SAFE_INSET_PX, Math.min(roomRect.y + roomRect.height - SAFE_INSET_PX, yPxRaw));

          const yPx = pushRowDownIfNeeded(yPxRaw);

          // Build label slots for this overhead horizontal ruler
          const distanceLabels = [];
          row.items.forEach((it, idx) => {
            const xPx = meterToCanvasX(it.xM);
            const distTextY = yPx + 12;
            const leftDist = mToCm(it.xM);
            const rightDist = mToCm(W - it.xM);
            
            distanceLabels.push(
              { x: xPx - 14, y: distTextY, text: `${leftDist}cm`, textAnchor: 'end' },
              { x: xPx + 14, y: distTextY, text: `${rightDist}cm`, textAnchor: 'start' }
            );
          });
          
          const fontSize = computeDynamicFontSize(distanceLabels, 11);

          return (
            <g key={`oh-row-top`}>
              <line
                x1={xLeftPx}
                y1={yPx}
                x2={xRightPx}
                y2={yPx}
                stroke={stroke}
                strokeWidth={2}
                markerStart="url(#spk-dim-arrow)"
                markerEnd="url(#spk-dim-arrow)"
              />

              {row.items.map((it, idx) => {
                const xPx = meterToCanvasX(it.xM);
                const distTextY = yPx + 12;

                return (
                  <g key={`oh-top-${idx}`}>
                    <circle cx={xPx} cy={yPx} r={5} fill={dotFill} />

                    <text
                      x={xPx - 14}
                      y={distTextY}
                      textAnchor="end"
                      style={{ fontSize, fill: textFill }}
                    >
                      {mToCm(it.xM)}cm
                    </text>

                    <text
                      x={xPx + 14}
                      y={distTextY}
                      textAnchor="start"
                      style={{ fontSize, fill: textFill }}
                    >
                      {mToCm(W - it.xM)}cm
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })()}
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
             {/*
               SIDE WALLS (vertical): Make it identical to LCR, just rotated.
               Layout in "imagined horizontal" LCR form:
                 WALL, [ROLE H], ruler line with dot, leftDist | dot | rightDist
               For side walls we map:
                 leftDist  = distance to BACK wall  (rear)  = (L - yM)
                 rightDist = distance to FRONT wall (front) = yM
             */}

             {(() => {
               // Compute stagger for very close dots on surround rulers
               let stagger = 0;
               if (wall === 'right' && idx > 0) {
                 const prevYPx = meterToCanvasY(rightGroup[idx - 1].yM);
                 if (Math.abs(yPx - prevYPx) < 44) {
                   stagger = (idx % 2 === 0) ? -6 : 6;
                 }
               }

               // Match LCR spacing
               const baseSize = calcFontSize(11, roomRect.width); // one size smaller by default
               const roleSize = calcFontSize(12, roomRect.width); // one size smaller than LCR role
               const distDx = 14;    // same as LCR distance offset
               const distY = -8;     // same as LCR distance baseline above dot
               const roleY = 16;     // same as LCR role baseline below dot
               const hDx = 18;       // same as LCR H offset to the right of role

               // Distances (swap mapping so it reads "rear on left, front on right" in the imagined horizontal view)
               const distLeft = mToCm(L - yM); // rear wall
               const distRight = mToCm(yM);    // front wall

               // Rotation: turn the whole LCR layout 90° so text reads the right way on a vertical ruler
               const rot = -90;

               // Put the ROLE/H label BETWEEN wall and ruler.
               // Right wall: wallX < labelX < lineX (label sits just inside the ruler)
               // Left wall:  lineX < labelX < wallX
               const wallX = wall === "right" ? (roomRect.x + roomRect.width) : roomRect.x;
               const labelX = wall === "right"
                 ? (dotX - SIDE_LABEL_PAD_PX)   // between wall and ruler
                 : (dotX + SIDE_LABEL_PAD_PX);  // between wall and ruler

                return (
                  <>
                    {/* Distances: either side of dot (like LCR), rotated as a unit */}
                    <g transform={`translate(${dotX}, ${dotY}) rotate(${rot})`}>
                      <text
                        x={-distDx}
                        y={distY + stagger}
                        textAnchor="end"
                        style={{ fontSize: baseSize, fill: textFill }}
                      >
                        {distLeft}cm
                      </text>

                      <text
                        x={distDx}
                        y={distY + stagger}
                        textAnchor="start"
                        style={{ fontSize: baseSize, fill: textFill }}
                      >
                        {distRight}cm
                      </text>
                    </g>

                    {/* Role + H: identical spacing to LCR, but positioned between wall and ruler, rotated as a unit */}
                    <g transform={`translate(${labelX}, ${dotY}) rotate(${rot})`}>
                      <text
                        x={0}
                        y={roleY}
                        textAnchor="middle"
                        style={{ fontSize: roleSize, fill: textFill, fontWeight: 700 }}
                      >
                        {roleText}
                      </text>

                      <text
                        x={hDx}
                        y={roleY}
                        textAnchor="start"
                        style={{ fontSize: baseSize, fill: "#3E4349", fontWeight: 400 }}
                      >
                        {heightText}
                      </text>
                    </g>
                  </>
                );
                })()}
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
      {renderOverheadVerticalDims()}
      {renderOverheadHorizontalDims()}
    </g>
  );
}