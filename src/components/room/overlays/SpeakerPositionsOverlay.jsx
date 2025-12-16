import React from "react";
import { getSpeakerModelMeta, normaliseModelKey } from "@/components/models/speakers/registry";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const mToCm = (m) => Math.round(Number(m) * 100);

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
    const Hm = Number(dimensions?.height ?? dimensions?.heightM ?? 0);
    if (!(Hm > 0)) return 0;
    return mToCm(Hm);
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

  // --- Overhead speakers (separate from bed speakers) ---
  const overheadSpeakers = (Array.isArray(speakers) ? speakers : []).filter((s) => {
    const role = String(s?.role || "").toUpperCase();
    if (!role) return false;
    if (!role.startsWith("T")) return false;
    const x = s?.position?.x;
    const y = s?.position?.y;
    return isNum(x) && isNum(y);
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

    // Calculate font size
    const fontSize = calcFontSize(11, roomRect.width);
    const roleFontSize = calcFontSize(12, roomRect.width);

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

    // Calculate font size
    const fontSize = calcFontSize(11, roomRect.width);
    const roleFontSize = calcFontSize(12, roomRect.width);

    // Keep rear speaker ID/H spacing consistent (not glued to the back wall)
    const wallYpx = roomRect.y + roomRect.height;
    const labelYpx = wallYpx + 16;

    // Keep rear distances visible even when the ruler line is near the bottom
    const distTextY = Math.min(rulerYpx + 12, wallYpx + 34);

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

          const hCm = mToCm(bedHeightM(s.role, s.yM));

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

              {/* Left distance (below the line, kept visible) */}
              <text
                x={xPx - leftOffset}
                y={distTextY}
                textAnchor="end"
                style={{ fontSize, fill: textFill }}
              >
                {leftDistCm}cm
              </text>

              {/* Right distance (below the line, kept visible) */}
              <text
                x={xPx + rightOffset}
                y={distTextY}
                textAnchor="start"
                style={{ fontSize, fill: textFill }}
              >
                {rightDistCm}cm
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

    // Calculate font size (match LCR)
    const fontSize = calcFontSize(11, roomRect.width);
    const roleFontSize = calcFontSize(12, roomRect.width);

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

          // Font sizes (match your "one smaller" defaults)
          const baseSize = calcFontSize(11, roomRect.width);
          const roleSize = calcFontSize(12, roomRect.width);

          const distDx = 14;   // same as LCR
          const distY = 12;    // flip to opposite side of dot
          const roleY = 16;    // same as LCR
          const hDx = 18;      // same as LCR

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
                  y={distY}
                  textAnchor="end"
                  style={{ fontSize: baseSize, fill: textFill }}
                >
                  {distLeft}cm
                </text>

                <text
                  x={distDx}
                  y={distY}
                  textAnchor="start"
                  style={{ fontSize: baseSize, fill: textFill }}
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
                  style={{ fontSize: roleSize, fill: textFill, fontWeight: 700 }}
                >
                  {s.role}
                </text>

                <text
                  x={hDx}
                  y={roleY}
                  textAnchor="start"
                  style={{ fontSize: baseSize, fill: "#3E4349", fontWeight: 400 }}
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
    const Hcm = overheadHeightCm();
    if (!Hcm) return null;

    const roomFontBasis = Math.min(roomRect.width, roomRect.height);
    const fontSize = calcFontSize(11, roomFontBasis);
    const roleFontSize = calcFontSize(12, roomFontBasis);

    // Put the two vertical rulers slightly inside the room so they never clip
    const insetPx = 26;
    const xLeftRuler = roomRect.x + insetPx;
    const xRightRuler = roomRect.x + roomRect.width - insetPx;

    const yTopPx = roomRect.y;
    const yBottomPx = roomRect.y + roomRect.height;

    const drawColumn = (list, rulerX, keyPrefix) => {
      if (!list.length) return null;

      return list.map((s, idx) => {
        const role = String(s.role || "").toUpperCase();
        const yM = s.position.y;
        const yPx = meterToCanvasY(yM);

        // distances to front/back walls
        const distFront = mToCm(yM);
        const distBack = mToCm(L - yM);

        // Keep it identical to LCR spacing, just rotated
        const distDx = 14;
        const distY = 12;  // BELOW the (imagined) line & dot
        const roleY = 16;
        const hDx = 18;

        // Small nudge if two dots are close
        let nudge = 0;
        if (idx > 0) {
          const prevYPx = meterToCanvasY(list[idx - 1].position.y);
          if (Math.abs(yPx - prevYPx) < 44) nudge = 6;
        }

        // rotate -90 so "left/right of dot" becomes "above/below dot" on the vertical ruler
        const rot = -90;

        return (
          <g key={`${keyPrefix}-${role}-${idx}`}>
            {/* dot on the vertical ruler */}
            <circle cx={rulerX} cy={yPx} r={5} fill={dotFill} />

            {/* distances either side of the dot (like LCR), but turned 90° */}
            <g transform={`translate(${rulerX}, ${yPx}) rotate(${rot})`}>
              <text
                x={-distDx}
                y={distY}
                textAnchor="end"
                style={{ fontSize, fill: textFill }}
              >
                {distBack}cm
              </text>

              <text
                x={distDx}
                y={distY}
                textAnchor="start"
                style={{ fontSize, fill: textFill }}
              >
                {distFront}cm
              </text>
            </g>

            {/* ID + H: same relationship as LCR, placed to the room-side of the ruler */}
            <g transform={`translate(${rulerX + 22}, ${yPx + nudge}) rotate(${rot})`}>
              <text
                x={0}
                y={roleY}
                textAnchor="middle"
                style={{ fontSize: roleFontSize, fill: textFill, fontWeight: 700 }}
              >
                {role}
              </text>

              <text
                x={hDx}
                y={roleY}
                textAnchor="start"
                style={{ fontSize, fill: "#3E4349", fontWeight: 400 }}
              >
                {`H${Hcm}cm`}
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

        {/* Right vertical ruler */}
        {overheadRight.length ? (
          <line
            x1={xRightRuler}
            y1={yTopPx}
            x2={xRightRuler}
            y2={yBottomPx}
            stroke={stroke}
            strokeWidth={2}
            markerStart="url(#spk-dim-arrow)"
            markerEnd="url(#spk-dim-arrow)"
          />
        ) : null}

        {drawColumn(overheadLeft, xLeftRuler, "ohL")}
        {drawColumn(overheadRight, xRightRuler, "ohR")}
      </g>
    );
  };

  // --- OVERHEAD HORIZONTAL RULERS (front/mid/rear rows, inside the room) ---
  const renderOverheadHorizontalDims = () => {
    const Hcm = overheadHeightCm();
    if (!Hcm) return null;
    if (!overheadRows.length) return null;

    const roomFontBasis = Math.min(roomRect.width, roomRect.height);
    const fontSize = calcFontSize(11, roomFontBasis);
    const roleFontSize = calcFontSize(12, roomFontBasis);

    const xLeftPx = roomRect.x;
    const xRightPx = roomRect.x + roomRect.width;

    return (
      <g data-layer="speaker-positions-overheads-horizontal" pointerEvents="none">
        {overheadRows.map((row, rIdx) => {
          const yPx = meterToCanvasY(row.yM);

          return (
            <g key={`oh-row-${rIdx}`}>
              {/* ruler line */}
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

              {/* dots + labels */}
              {row.items.map((it, idx) => {
                const s = it.s;
                const role = String(s.role || "").toUpperCase();
                const xPx = meterToCanvasX(it.xM);

                const leftDist = mToCm(it.xM);
                const rightDist = mToCm(W - it.xM);

                // tighten if neighbours are close
                let leftOffset = 14;
                let rightOffset = 14;
                if (idx > 0) {
                  const prevXPx = meterToCanvasX(row.items[idx - 1].xM);
                  if (Math.abs(xPx - prevXPx) < 40) {
                    leftOffset = 10;
                    rightOffset = 10;
                  }
                }
                if (idx < row.items.length - 1) {
                  const nextXPx = meterToCanvasX(row.items[idx + 1].xM);
                  if (Math.abs(xPx - nextXPx) < 40) {
                    leftOffset = 10;
                    rightOffset = 10;
                  }
                }

                return (
                  <g key={`oh-row-${rIdx}-${role}-${idx}`}>
                    <circle cx={xPx} cy={yPx} r={5} fill={dotFill} />

                    {/* distances BELOW the line */}
                    <text
                      x={xPx - leftOffset}
                      y={yPx + 12}
                      textAnchor="end"
                      style={{ fontSize, fill: textFill }}
                    >
                      {leftDist}cm
                    </text>

                    <text
                      x={xPx + rightOffset}
                      y={yPx + 12}
                      textAnchor="start"
                      style={{ fontSize, fill: textFill }}
                    >
                      {rightDist}cm
                    </text>

                    {/* ID + H: same line relationship as your other rulers */}
                    <text
                      x={xPx}
                      y={yPx + 28}
                      textAnchor="middle"
                      style={{ fontSize: roleFontSize, fill: textFill, fontWeight: 700 }}
                    >
                      {role}
                    </text>

                    <text
                      x={xPx + 18}
                      y={yPx + 28}
                      textAnchor="start"
                      style={{ fontSize, fill: "#3E4349", fontWeight: 400 }}
                    >
                      {`H${Hcm}cm`}
                    </text>
                  </g>
                );
              })}
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
              {/*
                SIDE WALLS (vertical): Make it identical to LCR, just rotated.
                Layout in "imagined horizontal" LCR form:
                  WALL, [ROLE H], ruler line with dot, leftDist | dot | rightDist
                For side walls we map:
                  leftDist  = distance to BACK wall  (rear)  = (L - yM)
                  rightDist = distance to FRONT wall (front) = yM
              */}

              {(() => {
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
                        y={distY}
                        textAnchor="end"
                        style={{ fontSize: baseSize, fill: textFill }}
                      >
                        {distLeft}cm
                      </text>

                      <text
                        x={distDx}
                        y={distY}
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