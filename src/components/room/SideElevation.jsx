import React, { useMemo } from "react";
import { getSpeakerModelMeta } from "../models/speakers/registry";
import SeatPersonIcon from "../roomdesigner/SeatPersonIcon";
import {
  Evolve11FaceIcon, Evolve21FaceIcon, Evolve31FaceIcon,
  Evolve42FaceIcon, Evolve63FaceIcon, Evolve84FaceIcon,
  Q43FaceIcon, Q45FaceIcon, Q63FaceIcon, Q85FaceIcon,
} from "../report/SpeakerFaceIcons";

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

// Speaker model → face icon component map (normalise key: lowercase, spaces→hyphens, strip _s)
const normModelKey = (m) => String(m || '').toLowerCase().replace(/\s+/g, '-').replace(/_s$/, '');
const FACE_ICON_MAP = {
  'evolve-1-1': Evolve11FaceIcon,
  'evolve-2-1': Evolve21FaceIcon,
  'evolve-3-1': Evolve31FaceIcon,
  'evolve-4-2': Evolve42FaceIcon,
  'evolve-6-3': Evolve63FaceIcon,
  'evolve-8-4': Evolve84FaceIcon,
  'q4-3': Q43FaceIcon,        'spitfire-q4-3': Q43FaceIcon,
  'q4-5': Q45FaceIcon,        'spitfire-q4-5': Q45FaceIcon,
  'q6-3': Q63FaceIcon,        'spitfire-q6-3': Q63FaceIcon,
  'q8-5': Q85FaceIcon,        'spitfire-q8-5': Q85FaceIcon,
};

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
// Determine which wall-side a speaker role belongs to
const getRoleSide = (role) => {
  const r = String(role || '').toUpperCase();
  if (r.endsWith('R')) return 'right';
  if (r.endsWith('L')) return 'left';
  return null; // centre / ambiguous
};

export default function SideElevation({
  dimensions,
  screen,
  seatingPositions,
  mlpPoint,
  roomElements,
  placedSpeakers,
  wall = 'right', // 'left' | 'right' — which side wall is being viewed
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

  // --- Doors / windows: only show elements on the viewed wall ---
  const openingEls = useMemo(() => {
    if (!Array.isArray(roomElements)) return [];
    return roomElements.filter(el => {
      if (el?.type !== 'door' && el?.type !== 'window') return false;
      // If the element has a wall property, filter strictly; otherwise include it
      if (el.wall) return el.wall === wall;
      return true;
    });
  }, [roomElements, wall]);

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

  // --- Speakers: LCR + surround y/z markers, filtered to viewed wall ---
  const speakerMarkers = useMemo(() => {
    if (!Array.isArray(placedSpeakers)) return [];
    return placedSpeakers
      .filter(s => {
        if (!Number.isFinite(s?.position?.y) || !Number.isFinite(s?.position?.z)) return false;
        const role = String(s.role || '').toUpperCase();
        const lcrRoles = new Set(['FL', 'FC', 'FR', 'L', 'C', 'R']);
        // LCR speakers are front-wall — always include them (shown faintly)
        if (lcrRoles.has(role)) return true;
        // For side/surround/overhead speakers, filter by which wall side they're on
        const side = getRoleSide(role);
        if (side === null) return true; // centre roles: SC etc — always show
        return side === wall;
      })
      .map(s => ({
        role: String(s.role || ""),
        model: String(s.model || ""),
        y: s.position.y,
        z: s.position.z,
      }));
  }, [placedSpeakers, wall]);

  // Rear-wall surround roles (overlap in side elevation)
  const REAR_ROLES = new Set(['SBL','SBR','SCL','SCR','SC']);

  // Group rear-wall speakers by similar height — filtered to viewed wall side
  const rearWallGroups = useMemo(() => {
    if (!Array.isArray(placedSpeakers)) return [];
    const rearSpks = placedSpeakers.filter(s => {
      const role = String(s?.role || '').toUpperCase();
      if (!REAR_ROLES.has(role)) return false;
      if (!Number.isFinite(s?.position?.z)) return false;
      const side = getRoleSide(role);
      if (side === null) return true; // SC (centre) — show on both
      return side === wall;
    });
    const groups = [];
    rearSpks.forEach(s => {
      const z = s.position.z;
      const existing = groups.find(g => Math.abs(g.z - z) <= 0.02);
      if (existing) {
        existing.roles.push(String(s.role).toUpperCase());
        existing.model = existing.model || s.model;
      } else {
        groups.push({ z, roles: [String(s.role).toUpperCase()], model: s.model || '' });
      }
    });
    return groups;
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

          {/* Front-stage speakers — architectural side profile, wall-filtered */}
          {(() => {
            const LCR_ROLES = new Set(['FL', 'FC', 'FR', 'L', 'C', 'R']);
            const allLcr = Array.isArray(placedSpeakers)
              ? placedSpeakers.filter(s => LCR_ROLES.has(String(s?.role || '').toUpperCase()))
              : [];
            if (!allLcr.length) return null;

            const canon = (s) => String(s?.role || '').toUpperCase().replace(/^L$/, 'FL').replace(/^C$/, 'FC').replace(/^R$/, 'FR');
            const hasFL = allLcr.some(s => canon(s) === 'FL');
            const hasFR = allLcr.some(s => canon(s) === 'FR');
            const hasFC = allLcr.some(s => canon(s) === 'FC');
            const isIntegrated = hasFC && !hasFL && !hasFR;

            // Determine which roles to render for this wall view
            const visibleRoles = new Set();
            if (isIntegrated) {
              visibleRoles.add('FC');
            } else {
              // Separate LCR or soundbar-override: show wall-appropriate main speaker only
              // FC (centre) is hidden because it cannot be meaningfully shown in side profile
              if (wall === 'right') visibleRoles.add('FR');
              else visibleRoles.add('FL');
            }

            const toRender = allLcr.filter(s => visibleRoles.has(canon(s)));
            if (!toRender.length) return null;

            return (
              <g opacity={0.82}>
                {toRender.map((spk, i) => {
                  const spkY = Number(spk?.position?.y);
                  const spkZ = Number(spk?.position?.z);
                  if (!Number.isFinite(spkY) || !Number.isFinite(spkZ)) return null;

                  // Use product dimensions as source of truth
                  const meta = getSpeakerModelMeta(spk.model) || {};
                  const spkDepthM  = Number(meta.depthM)  > 0 ? Number(meta.depthM)  : 0.10;
                  const spkHeightM = Number(meta.heightM) > 0 ? Number(meta.heightM) : 0.30;

                  // Side profile: depth along Y axis (horizontal), height along Z (vertical)
                  const frontX = rx(spkY - spkDepthM / 2); // front face of cabinet
                  const backX  = rx(spkY + spkDepthM / 2); // rear of cabinet
                  const svgW   = Math.max(3, backX - frontX);
                  const svgTop = rz(spkZ + spkHeightM / 2);
                  const svgBot = rz(spkZ - spkHeightM / 2);
                  const svgH   = Math.max(3, svgBot - svgTop);

                  const role = canon(spk);
                  return (
                    <g key={`lcr-side-${i}`}>
                      {/* Cabinet outline — white fill, clean dark stroke */}
                      <rect
                        x={frontX} y={svgTop}
                        width={svgW} height={svgH}
                        fill="#fff" stroke="#4A4540" strokeWidth={0.9} rx={1} />
                      {/* Front-face baffle line (left edge = front of speaker facing into room) */}
                      <line
                        x1={frontX} y1={svgTop}
                        x2={frontX} y2={svgBot}
                        stroke="#4A4540" strokeWidth={1.4} />
                      <text
                        x={frontX - 4} y={(svgTop + svgBot) / 2 + 3}
                        textAnchor="end" fontSize={6}
                        fill={LABEL_COLOR} fontWeight={600}>
                        {role}
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

          {/* Ear-height construction line — thin dashed, passes through head centres */}
          {(seatRows.length > 0 || Number.isFinite(mlpPoint?.y)) && (() => {
            const earZ = seatRows.length > 0
              ? seatRows[Math.floor(seatRows.length / 2)].earZ
              : rspZ;
            return (
              <line
                x1={offsetX} y1={rz(earZ)}
                x2={offsetX + drawW} y2={rz(earZ)}
                stroke="#B0AEA8" strokeWidth={0.5}
                strokeDasharray="4 4" opacity={0.55}
                strokeLinecap="round" />
            );
          })()}

          {/* Speaker height markers (non-LCR surrounds/wides) */}
          {speakerMarkers.map((spk, i) => {
            const lcrRoles = new Set(['FL', 'FC', 'FR', 'L', 'C', 'R']);
            if (lcrRoles.has(String(spk.role || '').toUpperCase())) return null;

            const role = String(spk.role || '').toUpperCase();
            const isCeiling = /^T[A-Z]/.test(role);
            if (REAR_ROLES.has(role)) return null; // drawn separately as side-profile

            if (isCeiling) {
              // Side-profile ceiling insert: body sits ABOVE ceiling line, grille flush with ceiling
              const meta = getSpeakerModelMeta(spk.model) || {};
              const widthM = Number(meta.widthM) > 0 ? Number(meta.widthM) : 0.165;
              const depthM = 0.074;
              const svgGrille = rz(roomH);                          // ceiling line
              const svgBodyTop = svgGrille - (depthM / roomH) * drawH; // above ceiling
              const svgBodyH   = svgGrille - svgBodyTop;
              const svgHalfW   = Math.max(4, (widthM / roomL) * drawW / 2);
              const cx = rx(spk.y);
              return (
                <g key={`spk-${i}`} opacity={0.88}>
                  {/* Body above ceiling */}
                  <rect
                    x={cx - svgHalfW} y={svgBodyTop}
                    width={svgHalfW * 2} height={svgBodyH}
                    fill={SPK_COLOR} stroke={SPK_COLOR} strokeWidth={0.5} rx={1} />
                  {/* Grille line flush with ceiling */}
                  <line
                    x1={cx - svgHalfW} y1={svgGrille}
                    x2={cx + svgHalfW} y2={svgGrille}
                    stroke="#fff" strokeWidth={1} opacity={0.6} />
                  {/* Label above body */}
                  <text
                    x={cx} y={svgBodyTop - 3}
                    textAnchor="middle" fontSize={6}
                    fill={SPK_COLOR} fontWeight={600}>
                    {spk.role}
                  </text>
                </g>
              );
            }

            const meta = getSpeakerModelMeta(spk.model) || {};
            const spkHeightM = Number(meta.heightM) > 0 ? Number(meta.heightM) : 0.27;
            const spkWidthM  = Number(meta.widthM)  > 0 ? Number(meta.widthM)  : 0.18;

            const spkX   = rx(spk.y);
            const svgTop = rz(spk.z + spkHeightM / 2);
            const svgBot = rz(spk.z - spkHeightM / 2);
            const svgH   = Math.max(3, svgBot - svgTop);
            const svgW   = Math.max(3, (spkWidthM / roomL) * drawW);
            const ix     = spkX - svgW / 2;

            const FaceIcon = FACE_ICON_MAP[normModelKey(spk.model)];

            // Product dimensions are the source of truth for the visible cabinet box.
            // The FaceIcon PNG assets contain internal transparent padding, so the outer SVG icon
            // is enlarged beyond the cabinet box (then clipped) so the visible artwork fills it exactly.
            const FACE_ICON_VISIBLE_RATIO = 0.72; // fraction of the PNG canvas occupied by visible artwork; scaled down to enlarge internal cabinet drawing closer to box edges (~2–4px clearance)
            const clipId = `spk-clip-${i}`;

            // True-size cabinet box (product heightM × widthM)
            const cabinetX = ix;       // = spkX - svgW / 2
            const cabinetY = svgTop;   // = rz(spk.z + spkHeightM / 2)

            // Enlarged icon dimensions so visible artwork fills the cabinet box
            const adjustedIconW = svgW / FACE_ICON_VISIBLE_RATIO;
            const adjustedIconH = svgH / FACE_ICON_VISIBLE_RATIO;
            const adjustedIconX = spkX - adjustedIconW / 2;
            const adjustedIconY = rz(spk.z) - adjustedIconH / 2;

            return (
              <g key={`spk-${i}`} opacity={0.85}>
                {FaceIcon ? (
                  <>
                    {/* Define clip region = true cabinet box */}
                    <defs>
                      <clipPath id={clipId}>
                        <rect x={cabinetX} y={cabinetY} width={svgW} height={svgH} />
                      </clipPath>
                    </defs>
                    {/* True-size white cabinet background */}
                    <rect
                      x={cabinetX} y={cabinetY}
                      width={svgW} height={svgH}
                      fill="#fff" stroke="#4A4540" strokeWidth={0.9} rx={1} />
                    {/* FaceIcon enlarged so its visible artwork fills the cabinet box, clipped to it */}
                    <g clipPath={`url(#${clipId})`}>
                      <FaceIcon x={adjustedIconX} y={adjustedIconY} width={adjustedIconW} height={adjustedIconH} />
                    </g>
                  </>
                ) : (
                  <rect
                    x={cabinetX} y={cabinetY}
                    width={svgW} height={svgH}
                    fill={SPK_COLOR} stroke={SPK_COLOR} strokeWidth={1} rx={2} />
                )}
                <text
                  x={spkX}
                  y={svgTop - 3}
                  textAnchor="middle"
                  fontSize={6}
                  fill={SPK_COLOR}
                  fontWeight={600}>
                  {spk.role}
                </text>
              </g>
            );
          })}

          {/* Rear-wall surround speakers — side profile, one per height group */}
          {rearWallGroups.map((grp, i) => {
            const meta = getSpeakerModelMeta(grp.model) || {};
            const spkDepthM  = Number(meta.depthM)  > 0 ? Number(meta.depthM)  : 0.082;
            const spkHeightM = Number(meta.heightM) > 0 ? Number(meta.heightM) : 0.27;
            const frontX = rx(roomL - spkDepthM); // front face of speaker
            const backX  = rx(roomL);             // rear wall
            const svgW   = Math.max(3, backX - frontX);
            const svgTop  = rz(grp.z + spkHeightM / 2);
            const svgBot  = rz(grp.z - spkHeightM / 2);
            const svgH   = Math.max(3, svgBot - svgTop);
            const label  = grp.roles.length > 1
              ? grp.roles.join('/')
              : grp.roles[0];
            return (
              <g key={`rear-${i}`} opacity={0.92}>
                {/* Cabinet outline — white fill, clean dark stroke */}
                <rect
                  x={frontX} y={svgTop}
                  width={svgW} height={svgH}
                  fill="#fff" stroke="#4A4540" strokeWidth={0.9} rx={1} />
                {/* Front face line (the visible baffle edge) */}
                <line
                  x1={frontX} y1={svgTop}
                  x2={frontX} y2={svgBot}
                  stroke="#4A4540" strokeWidth={1.4} />
                <text
                  x={frontX - 4} y={(svgTop + svgBot) / 2 + 3}
                  textAnchor="end" fontSize={6}
                  fill={LABEL_COLOR} fontWeight={600}>
                  {label}
                </text>
              </g>
            );
          })}

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