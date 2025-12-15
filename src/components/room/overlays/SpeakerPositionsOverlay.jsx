import React from "react";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const mToCm = (m) => Math.round(Number(m) * 100);

export default function SpeakerPositionsOverlay({
  speakers = [],
  seatingPositions = [],
  dimensions,
  view = "off", // 'off' | 'plan' | 'both'

  // NEW: supplied by RoomVisualisation so we draw in the correct coordinate space
  meterToCanvasX,
  meterToCanvasY,
  roomRect,
  scale,
}) {
  if (!(view === "plan" || view === "both")) return null;

  if (typeof meterToCanvasX !== "function" || typeof meterToCanvasY !== "function") return null;
  if (!roomRect || !isNum(roomRect.x) || !isNum(roomRect.y) || !isNum(roomRect.width) || !isNum(roomRect.height)) return null;
  if (!isNum(scale) || scale <= 0) return null;

  const W = Number(dimensions?.width || dimensions?.widthM || 0);
  const L = Number(dimensions?.length || dimensions?.lengthM || 0);
  if (!(W > 0 && L > 0)) return null;

  // Identify seating rows (by Y) so we can set bed height rules
  const ys = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .map((s) => s?.y)
    .filter(isNum)
    .sort((a, b) => a - b);

  const rows = [];
  for (const y of ys) {
    const last = rows[rows.length - 1];
    if (!last || Math.abs(y - last) > 0.2) rows.push(y);
  }

  // Bed height rule:
  // Default 1.2m.
  // If speaker is behind row 2 -> 1.5m.
  // If speaker is behind row 3 -> 1.8m.
  const bedHeightM = (speakerY) => {
    if (rows.length < 2) return 1.2;
    const row2Y = rows[1];
    const row3Y = rows[2];
    if (isNum(row3Y) && speakerY > row3Y) return 1.8;
    if (speakerY > row2Y) return 1.5;
    return 1.2;
  };

  // Filter to bed speakers only (no subs/LFE/overheads)
  const bedSpeakers = (Array.isArray(speakers) ? speakers : []).filter((s) => {
    const role = String(s?.role || "").toUpperCase();
    if (!role) return false;
    if (role === "SUB" || role === "LFE") return false;
    if (role.startsWith("T")) return false; // overheads

    const x = s?.position?.x;
    const y = s?.position?.y;
    return isNum(x) && isNum(y);
  });

  // Styling sizes in metres, converted to canvas px with `scale`
  const strokePx = Math.max(1, Math.round(1.5)); // keep consistent thickness
  const labelPadX_px = Math.round(8);
  const labelPadY_px = Math.round(6);
  const labelW_px = Math.round(280);
  const labelH_px = Math.round(28);
  const fontPx = Math.round(12);

  // Arrow-ish offset from speaker point (in metres, then to px)
  const labelOffsetX_px = Math.round(0.12 * scale);
  const labelOffsetY_px = Math.round(0.10 * scale);

  return (
    <g data-layer="speaker-positions-overlay" pointerEvents="none">
      {bedSpeakers.map((s, idx) => {
        const xM = s.position.x;
        const yM = s.position.y;
        const role = String(s.role).toUpperCase();

        // Nearest wall in metres
        const dFront = yM;
        const dBack = L - yM;
        const dLeft = xM;
        const dRight = W - xM;

        let wall = "front";
        let wallDist = dFront;
        if (dBack < wallDist) {
          wall = "back";
          wallDist = dBack;
        }
        if (dLeft < wallDist) {
          wall = "left";
          wallDist = dLeft;
        }
        if (dRight < wallDist) {
          wall = "right";
          wallDist = dRight;
        }

        // Along-wall distance in metres
        const alongM = wall === "front" || wall === "back" ? xM : yM;
        const runLenM = wall === "front" || wall === "back" ? W : L;
        const nearestEndM = Math.min(alongM, runLenM - alongM);

        // Height in metres, then cm
        const hM = bedHeightM(yM);

        // Start point on nearest wall (metres)
        const x0M = wall === "left" ? 0 : wall === "right" ? W : xM;
        const y0M = wall === "front" ? 0 : wall === "back" ? L : yM;

        // Convert to CANVAS coordinates
        const x0 = meterToCanvasX(x0M);
        const y0 = meterToCanvasY(y0M);
        const x1 = meterToCanvasX(xM);
        const y1 = meterToCanvasY(yM);

        const label = `${role}  ${mToCm(alongM)}cm  ${mToCm(nearestEndM)}cm  H${mToCm(hM)}cm`;

        // Label box position (canvas px)
        const bx = x1 + labelOffsetX_px;
        const by = y1 - labelOffsetY_px - labelH_px;

        return (
          <g key={`${role}-${idx}`}>
            {/* measurement arm */}
            <line
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              stroke="#213428"
              strokeWidth={strokePx}
              opacity={0.65}
            />

            {/* label */}
            <rect
              x={bx}
              y={by}
              width={labelW_px}
              height={labelH_px}
              fill="#FFFFFF"
              stroke="#DCDBD6"
              strokeWidth={1}
              rx={8}
            />
            <text
              x={bx + labelPadX_px}
              y={by + labelH_px - labelPadY_px}
              fontSize={fontPx}
              fill="#1B1A1A"
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}