import React, { useMemo } from "react";
import SeatPersonIcon from "../roomdesigner/SeatPersonIcon";

// ---------------------------------------------------------------------------
// SideElevation – static read-only engineering drawing
// Plane: Y (room depth) → horizontal, Z (height) → vertical
// ---------------------------------------------------------------------------

const ROOM_FILL     = "#F4F3F0";
const ROOM_STROKE   = "#B0AEA8";
const FLOOR_COLOR   = "#8C8880";
const SCREEN_FILL   = "#2C2C2C";
const SCREEN_STROKE = "#1a1a1a";
const LABEL_COLOR   = "#4A4540";
const DIM_COLOR     = "#9B9890";
const PROJ_FILL     = "#3E4349";
const SEAT_COLOR    = "#213428";
const SPK_COLOR     = "#213428";
const DOOR_STROKE   = "#7C6F65";
const DOOR_FILL     = "rgba(180,168,155,0.18)";

// Derive screen dimensions from screen config (same logic as FrontElevation)
function screenDimsM(screen) {
  if (!screen) return { w: 2.54, h: 1.43 };
  const TV_INCHES = { tv65: 55.55, tv77: 67.36, tv83: 72.52, tv100: 87.80 };
  let wInches = 0;
  if (screen.tvPresetKey && TV_INCHES[screen.tvPresetKey]) {
    wInches = TV_INCHES[screen.tvPresetKey];
  } else if (screen.manualMode && Number(screen.manualWidthM) > 0) {
    return { w: Number(screen.manualWidthM), h: Number(screen.manualHeightM) || Number(screen.manualWidthM) * (9 / 16) };
  } else {
    wInches = Number(screen.visibleWidthInches) || 100;
  }
  const wM = wInches * 0.0254;
  const ar = screen.aspectRatio === "2.35:1" ? (2.35 / 1) : (16 / 9);
  return { w: wM, h: wM / ar };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function SideElevation({
  dimensions,
  screen,
  seatingPositions,
  mlpPoint,
  roomElements,
  placedSpeakers,
}) {
  const roomL = Number(dimensions?.lengthM ?? dimensions?.length) || 6.0;
  const roomH = Number(dimensions?.heightM ?? dimensions?.height) || 2.8;

  // --- SVG layout constants (same approach as FrontElevation) ---
  const SVG_W    = 640;
  const PADDING  = 36;
  const LABEL_TOP  = 56;
  const LABEL_LEFT = 36;
  const drawW = SVG_W - PADDING * 2 - LABEL_LEFT;
  const drawH = Math.round(drawW * (roomH / roomL));
  const SVG_H = drawH + PADDING * 2 + LABEL_TOP;

  const offsetX = PADDING + LABEL_LEFT;
  const offsetY = PADDING + LABEL_TOP;

  // Room-metres → SVG px
  // Y (0 = front wall) → left; Z (0 = floor) → bottom
  const rx = (yM) => offsetX + (yM / roomL) * drawW;
  const rz = (zM) => offsetY + drawH - (zM / roomH) * drawH;

  // --- Screen ---
  const screenData  = useMemo(() => screenDimsM(screen), [screen]);
  const screenFloorM = Number(screen?.heightFromFloorM) || 0.5;
  const screenTopM   = screenFloorM + screenData.h;
  // Screen front plane Y
  const screenFrontY = Number(screen?.screenPlaneY_m) > 0
    ? Number(screen.screenPlaneY_m)
    : Number(screen?.floatDepthM) || 0.20;
  // Border thickness
  const borderM      = Number(screen?.borderThicknessM) > 0 ? Number(screen.borderThicknessM) : 0.05;
  const frameTopM    = screenTopM + borderM;      // top of frame (above viewable)
  const frameBottomM = Math.max(0, screenFloorM - borderM); // bottom of frame (below viewable)

  // --- Projector ---
  const projectorEl = useMemo(() => {
    if (!Array.isArray(roomElements)) return null;
    return roomElements.find(el => el?.type === 'projector') ?? null;
  }, [roomElements]);

  // --- Doors / windows ---
  const openingEls = useMemo(() => {
    if (!Array.isArray(roomElements)) return [];
    return roomElements.filter(el => el?.type === 'door' || el?.type === 'window');
  }, [roomElements]);

  // --- Seat rows: pick one representative Y per row from seatingPositions ---
  const seatRows = useMemo(() => {
    const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
    if (!seats.length) return [];

    // Group by row index
    const byRow = new Map();
    seats.forEach(seat => {
      const rowIdx = seat.rowIndex ?? seat.row ?? 0;
      if (!byRow.has(rowIdx)) byRow.set(rowIdx, []);
      byRow.get(rowIdx).push(seat);
    });

    const rows = [];
    byRow.forEach((rowSeats, rowIdx) => {
      // Pick centre seat of the row
      const centre = rowSeats[Math.floor(rowSeats.length / 2)];
      const y = Number.isFinite(centre?.y) ? centre.y : null;
      // Ear height: prefer explicit rowEarHeight, then z, then 1.10
      const earZ = Number.isFinite(centre?.rowEarHeight) ? centre.rowEarHeight
        : Number.isFinite(centre?.z) ? centre.z
        : 1.10;
      const platformH = Number.isFinite(centre?.platformHeightM) ? centre.platformHeightM : 0;
      if (y === null) return;
      rows.push({ rowIdx, y, earZ, platformH, seats: rowSeats });
    });

    return rows.sort((a, b) => a.y - b.y);
  }, [seatingPositions]);

  // RSP from mlpPoint or primary seat
  const rspY = Number.isFinite(mlpPoint?.y) ? mlpPoint.y
    : seatRows.length ? seatRows[Math.floor(seatRows.length / 2)].y
    : roomL * 0.6;
  const rspZ = Number.isFinite(mlpPoint?.z) ? mlpPoint.z
    : seatRows.length ? seatRows[Math.floor(seatRows.length / 2)].earZ
    : 1.2;

  // --- Speakers: LCR + surround y/z markers ---
  const speakerMarkers = useMemo(() => {
    if (!Array.isArray(placedSpeakers)) return [];
    return placedSpeakers
      .filter(s => Number.isFinite(s?.position?.y) && Number.isFinite(s?.position?.z))
      .map(s => ({
        role: String(s.role || ""),
        y: s.position.y,
        z: s.position.z,
      }));
  }, [placedSpeakers]);

  // Hatch count for floor line
  const hatchCount = Math.floor(drawW / 14) + 1;

  return (
    <div style={{ width: "100%", padding: 16, background: "#F8F8F7", boxSizing: "border-box" }}>
      <div style={{ width: "100%", aspectRatio: `${SVG_W} / ${SVG_H}` }}>
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Title */}
          <text x={offsetX + drawW / 2} y={14}
            textAnchor="middle" fontSize={10} fontWeight={600}
            fill={LABEL_COLOR} letterSpacing="0.06em">
            SIDE ELEVATION
          </text>

          {/* Room rectangle */}
          <rect x={offsetX} y={offsetY} width={drawW} height={drawH}
            fill={ROOM_FILL} stroke={ROOM_STROKE} strokeWidth={0.8} />

          {/* Floor line */}
          <line
            x1={offsetX - 6} y1={offsetY + drawH}
            x2={offsetX + drawW + 6} y2={offsetY + drawH}
            stroke={FLOOR_COLOR} strokeWidth={2} strokeLinecap="square" />
          {Array.from({ length: hatchCount }, (_, i) => (
            <line key={`h-${i}`}
              x1={offsetX + i * 14} y1={offsetY + drawH}
              x2={offsetX + i * 14 - 6} y2={offsetY + drawH + 7}
              stroke={FLOOR_COLOR} strokeWidth={0.7} opacity={0.5} />
          ))}

          {/* Dimension: room length (horizontal) */}
          <line x1={offsetX} y1={offsetY - 10} x2={offsetX + drawW} y2={offsetY - 10}
            stroke={DIM_COLOR} strokeWidth={0.8} />
          <line x1={offsetX} y1={offsetY - 14} x2={offsetX} y2={offsetY - 6}
            stroke={DIM_COLOR} strokeWidth={0.8} />
          <line x1={offsetX + drawW} y1={offsetY - 14} x2={offsetX + drawW} y2={offsetY - 6}
            stroke={DIM_COLOR} strokeWidth={0.8} />
          <text x={offsetX + drawW / 2} y={offsetY - 13}
            textAnchor="middle" fontSize={9} fill={DIM_COLOR}>
            {roomL.toFixed(2)}m
          </text>

          {/* Dimension: room height (vertical, left side) */}
          <line x1={offsetX - 10} y1={offsetY} x2={offsetX - 10} y2={offsetY + drawH}
            stroke={DIM_COLOR} strokeWidth={0.8} />
          <line x1={offsetX - 14} y1={offsetY} x2={offsetX - 6} y2={offsetY}
            stroke={DIM_COLOR} strokeWidth={0.8} />
          <line x1={offsetX - 14} y1={offsetY + drawH} x2={offsetX - 6} y2={offsetY + drawH}
            stroke={DIM_COLOR} strokeWidth={0.8} />
          <text x={offsetX - 18} y={offsetY + drawH / 2}
            textAnchor="middle" fontSize={9} fill={DIM_COLOR}
            transform={`rotate(-90, ${offsetX - 18}, ${offsetY + drawH / 2})`}>
            {roomH.toFixed(2)}m
          </text>

          {/* Screen frame */}
          {(() => {
            const sxPx = rx(screenFrontY);
            const frameTopPx = rz(frameTopM);
            const frameBotPx = rz(frameBottomM);
            const frameH_px  = frameBotPx - frameTopPx;   // equal border top & bottom
            const viewTopPx  = rz(screenTopM);
            const viewH_px   = rz(screenFloorM) - rz(screenTopM);
            const FRAME_W = 7;
            return (
              <g>
                {/* Frame casing — equal border on all 4 sides */}
                <rect
                  x={sxPx - FRAME_W / 2} y={frameTopPx}
                  width={FRAME_W} height={frameH_px}
                  fill={SCREEN_STROKE} stroke="none" rx={1} />
                {/* Viewable image area — inset equally on all sides */}
                <rect
                  x={sxPx - FRAME_W / 2 + 1.5} y={viewTopPx}
                  width={FRAME_W - 3} height={viewH_px}
                  fill="#fff" stroke="#999" strokeWidth={0.4} />
                {/* Screen label */}
                <text x={sxPx} y={offsetY - 4}
                  textAnchor="middle" fontSize={7.5} fill={SCREEN_STROKE}
                  letterSpacing="0.04em">
                  SCREEN
                </text>
                {/* Screen bottom height dim */}
                <line x1={sxPx + 8} y1={rz(0)} x2={sxPx + 8} y2={rz(screenFloorM)}
                  stroke={DIM_COLOR} strokeWidth={0.6} strokeDasharray="3 2" />
                <line x1={sxPx + 5} y1={rz(screenFloorM)} x2={sxPx + 11} y2={rz(screenFloorM)}
                  stroke={DIM_COLOR} strokeWidth={0.7} />
                <text x={sxPx + 13} y={rz(screenFloorM) + 3}
                  fontSize={7} fill={DIM_COLOR} textAnchor="start">
                  {screenFloorM.toFixed(2)}m
                </text>
                {/* Screen top height dim */}
                <line x1={sxPx + 8} y1={rz(screenTopM)} x2={sxPx + 11} y2={rz(screenTopM)}
                  stroke={DIM_COLOR} strokeWidth={0.7} />
                <text x={sxPx + 13} y={rz(screenTopM) + 3}
                  fontSize={7} fill={DIM_COLOR} textAnchor="start">
                  {screenTopM.toFixed(2)}m
                </text>
              </g>
            );
          })()}

          {/* LCR Speakers — faintly rendered behind screen wall */}
          {(() => {
            const lcrRoles = new Set(['FL', 'FC', 'FR', 'L', 'C', 'R']);
            const lcrSpks = Array.isArray(placedSpeakers)
              ? placedSpeakers.filter(s => lcrRoles.has(String(s?.role || '').toUpperCase()))
              : [];
            if (!lcrSpks.length) return null;
            return (
              <g opacity={0.35}>
                {lcrSpks.map((spk, i) => {
                  const spkY = Number(spk?.position?.y);
                  const spkZ = Number(spk?.position?.z);
                  if (!Number.isFinite(spkY) || !Number.isFinite(spkZ)) return null;
                  // Cabinet fallback: 0.27m wide (depth in Y) × 0.37m tall
                  const cabDepth = 0.12; // Y-axis depth → horizontal SVG extent
                  const cabH    = 0.37; // Z-axis height → vertical SVG extent
                  const svgX   = rx(spkY);
                  const svgTop = rz(spkZ + cabH / 2);
                  const svgCabH = rz(spkZ - cabH / 2) - svgTop;
                  const svgCabW = Math.max(3, (cabDepth / roomL) * drawW);
                  return (
                    <g key={`lcr-sv-${i}`}>
                      <rect
                        x={svgX - svgCabW / 2} y={svgTop}
                        width={svgCabW} height={svgCabH}
                        fill={SPK_COLOR} stroke={SPK_COLOR} strokeWidth={0.5} rx={1} />
                      <text x={svgX} y={svgTop - 4}
                        textAnchor="middle" fontSize={6} fill={SPK_COLOR} fontWeight={600}>
                        {spk.role}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })()}

          {/* Doors / Windows */}
          {openingEls.map((el, i) => {
            const elY = Number.isFinite(el?.y_lens_m) ? el.y_lens_m
              : Number.isFinite(el?.pos_m) ? el.pos_m
              : null;
            if (elY === null) return null;
            const elH = Number.isFinite(el?.height_m) ? el.height_m
              : el.type === 'door' ? 2.1 : 1.0;
            const elW = Number.isFinite(el?.length_m) ? el.length_m : 0.9;
            const elZ = 0;
            const px  = rx(elY);
            const pw  = (elW / roomL) * drawW;
            return (
              <g key={`el-${i}`} opacity={0.85}>
                <rect
                  x={px} y={rz(elZ + elH)}
                  width={pw} height={rz(elZ) - rz(elZ + elH)}
                  fill={DOOR_FILL} stroke={DOOR_STROKE} strokeWidth={0.8} strokeDasharray="3 2" />
                <text x={px + pw / 2} y={rz(elZ + elH) - 3}
                  textAnchor="middle" fontSize={7} fill={DOOR_STROKE} letterSpacing="0.04em">
                  {el.type === 'door' ? 'DOOR' : 'WIN'}
                </text>
              </g>
            );
          })}

          {/* Seat rows */}
          {seatRows.map((row, i) => {
            const isRsp = Math.abs(row.y - rspY) < 0.15;
            const label = isRsp ? "RSP" : `R${i + 1}`;
            return (
              <SeatPersonIcon
                key={`row-${row.rowIdx}`}
                view="side"
                cx={rx(row.y)}
                cy={rz(row.earZ)}
                scale={(drawH / roomH)}
                earHeightM={row.earZ}
                platformHeightM={row.platformH}
                label={label}
                isRsp={isRsp}
              />
            );
          })}

          {/* If no seating data, show RSP from mlpPoint */}
          {seatRows.length === 0 && Number.isFinite(mlpPoint?.y) && (
            <SeatPersonIcon
              view="side"
              cx={rx(rspY)}
              cy={rz(rspZ)}
              scale={(drawH / roomH)}
              earHeightM={rspZ}
              platformHeightM={0}
              label="RSP"
              isRsp={true}
            />
          )}

          {/* Ear/eye height guide line */}
          {(seatRows.length > 0 || Number.isFinite(mlpPoint?.y)) && (() => {
            const earZ = seatRows.length > 0
              ? seatRows[Math.floor(seatRows.length / 2)].earZ
              : rspZ;
            return (
              <line
                x1={offsetX} y1={rz(earZ)}
                x2={offsetX + drawW} y2={rz(earZ)}
                stroke={SEAT_COLOR} strokeWidth={0.5}
                strokeDasharray="6 4" opacity={0.3} />
            );
          })()}

          {/* Speaker height markers */}
          {speakerMarkers.map((spk, i) => (
            <g key={`spk-${i}`} opacity={0.55}>
              <line
                x1={rx(spk.y) - 5} y1={rz(spk.z)}
                x2={rx(spk.y) + 5} y2={rz(spk.z)}
                stroke={SPK_COLOR} strokeWidth={1.2} />
              <text
                x={rx(spk.y) - 7} y={rz(spk.z) - 2}
                textAnchor="end" fontSize={6.5} fill={SPK_COLOR} fontWeight={500}>
                {spk.role}
              </text>
            </g>
          ))}

          {/* Projector */}
          {projectorEl && (() => {
            const pY = Number.isFinite(projectorEl.y_lens_m) ? projectorEl.y_lens_m : null;
            const pZ = Number.isFinite(projectorEl.z_lens_m) ? projectorEl.z_lens_m : roomH - 0.3;
            if (pY === null) return null;
            const pBodyD = Number(projectorEl.body_depth_m) || 0.30;
            const pBodyH = Number(projectorEl.body_height_m) || 0.12;
            const px  = rx(pY);
            const pz  = rz(pZ);
            const pbW = (pBodyD / roomL) * drawW;
            const pbH = (pBodyH / roomH) * drawH;
            return (
              <g opacity={0.88}>
                <rect
                  x={px} y={pz - pbH / 2}
                  width={pbW} height={pbH}
                  fill={PROJ_FILL} stroke="#222" strokeWidth={0.9} rx={1.5} />
                <circle cx={px} cy={pz} r={Math.max(3, pbH * 0.3)}
                  fill="#888" stroke="#555" strokeWidth={0.7} />
                {/* PROJ label — below projector body to avoid geometry clash */}
                <text x={px + pbW / 2} y={pz + pbH / 2 + 13}
                  textAnchor="middle" fontSize={7.5} fill={DIM_COLOR}
                  letterSpacing="0.04em">
                  PROJ
                </text>
                {/* Height dim — right of body, clear of body edge */}
                <text x={px + pbW + 10} y={pz + 3}
                  fontSize={7} fill={DIM_COLOR} textAnchor="start">
                  {pZ.toFixed(2)}m
                </text>
                {/* Beam lines to screen */}
                <line
                  x1={px} y1={pz}
                  x2={rx(screenFrontY)} y2={rz(screenTopM)}
                  stroke="#B45309" strokeWidth={0.6}
                  strokeDasharray="5 3" opacity={0.55} />
                <line
                  x1={px} y1={pz}
                  x2={rx(screenFrontY)} y2={rz(screenFloorM)}
                  stroke="#B45309" strokeWidth={0.6}
                  strokeDasharray="5 3" opacity={0.55} />
              </g>
            );
          })()}

          {/* Front wall indicator (left edge = front) */}
          <text x={offsetX + 3} y={offsetY + drawH - 4}
            fontSize={7} fill={DIM_COLOR} opacity={0.7}>
            FRONT
          </text>
          <text x={offsetX + drawW - 3} y={offsetY + drawH - 4}
            textAnchor="end" fontSize={7} fill={DIM_COLOR} opacity={0.7}>
            REAR
          </text>
        </svg>
      </div>
    </div>
  );
}