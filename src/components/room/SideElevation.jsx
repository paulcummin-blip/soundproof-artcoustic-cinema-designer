import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
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
  // Explicit wide-speaker overrides (LW/RW end in W, not L/R)
  if (r === 'LW') return 'left';
  if (r === 'RW') return 'right';
  // Extra surround roles: SL2, SL3, SR2, SR3, etc.
  if (/^SL\d+$/.test(r)) return 'left';
  if (/^SR\d+$/.test(r)) return 'right';
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
  frontSubs = [],        // same array as FrontElevation receives (appState.subwoofers filtered group==='front')
  frontSubsCfg = null,   // for orientation fallback
  rearSubs = [],         // appState.subwoofers filtered group==='rear'
  rearSubsCfg = null,    // for orientation fallback
  wall = 'right', // 'left' | 'right' — which side wall is being viewed
  onScreenHeightFromFloorChange = null,
  onSideSpeakerMoved = null,
  onFrontSubHeightChange = null,
  onRearSubHeightChange = null,
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

  // Draggable floor height — local state for live updates, synced from prop when not dragging
  const isDraggingRef = useRef(false);
  const [liveFloorM, setLiveFloorM] = useState(() => Number(screen?.heightFromFloorM) || 0.5);
  useEffect(() => {
    if (!isDraggingRef.current) {
      setLiveFloorM(Number(screen?.heightFromFloorM) || 0.5);
    }
  }, [screen?.heightFromFloorM]);
  const screenFloorM = liveFloorM;
  const screenTopM   = screenFloorM + screenData.h;
  // Screen front plane Y — same source of truth as Plan View
  const screenFrontY = Number(screen?.screenPlaneY_m) > 0
    ? Number(screen.screenPlaneY_m)
    : Number(screen?.screenFrontPlane_m) > 0
      ? Number(screen.screenFrontPlane_m)
      : Number(screen?.screen_front_plane_m) > 0
        ? Number(screen.screen_front_plane_m)
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
      // seatingPositions uses rowNumber (1-based); fall back to rowIndex/row for legacy
      const rowIdx = seat.rowNumber ?? seat.rowIndex ?? seat.row ?? 0;
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

  // --- Drag handlers for vertical screen dragging ---
  const svgRef = useRef(null);
  const dragStartRef = useRef(null);
  const listenersRef = useRef(null); // tracks active window listeners for unmount cleanup

  // Cleanup: remove any active drag listeners if component unmounts mid-drag
  useEffect(() => {
    return () => {
      if (listenersRef.current) {
        window.removeEventListener('mousemove', listenersRef.current.move);
        window.removeEventListener('mouseup', listenersRef.current.up);
        listenersRef.current = null;
      }
      if (speakerListenersRef.current) {
        window.removeEventListener('mousemove', speakerListenersRef.current.move);
        window.removeEventListener('mouseup', speakerListenersRef.current.up);
        speakerListenersRef.current = null;
      }
    };
  }, []);

  // Speaker vertical drag state
  const speakerDragRef = useRef(null);
  const speakerListenersRef = useRef(null);
  const [liveSpeakerDrag, setLiveSpeakerDrag] = useState(null); // { role, z } | null
  const [activeSnapZ, setActiveSnapZ] = useState(null); // snapped Z in room-metres while dragging, null when not snapping
  const activeSnapZRef = useRef(null);
  const speakersForSnapRef = useRef([]); // draggable side speaker z values — updated each render

  // Sub vertical-only drag state — local only, committed once on mouseup
  const [liveSubDrag, setLiveSubDrag] = useState(null); // { group, liveBottomHeightM } | null
  const liveSubDragRef = useRef(null);

  // Sightline overlay toggle
  const [showSightlines, setShowSightlines] = useState(false);

  const handleSpeakerMouseDown = useCallback((e, role, startZ) => {
    if (!onSideSpeakerMoved) return;
    e.preventDefault();
    e.stopPropagation();
    const svgEl = svgRef.current;
    if (!svgEl) return;
    speakerDragRef.current = { role, startClientY: e.clientY, startZ };
    setLiveSpeakerDrag({ role, z: startZ });
    const handleMove = (me) => {
      const svgRect = svgEl.getBoundingClientRect();
      const svgScale = svgRect.height / SVG_H;
      const deltaZ = -((me.clientY - speakerDragRef.current.startClientY) / svgScale / drawH) * roomH;
      const rawZ = Math.max(0.05, Math.min(roomH - 0.05, speakerDragRef.current.startZ + deltaZ));
      // Magnetic snap — same 50 mm threshold as Front Elevation
      const SNAP_M = 0.05;
      const others = speakersForSnapRef.current.filter(s => s.role !== role);
      let snapHit = null;
      for (const other of others) {
        if (Math.abs(rawZ - other.z) < SNAP_M) {
          if (snapHit === null || Math.abs(rawZ - other.z) < Math.abs(rawZ - snapHit)) {
            snapHit = other.z;
          }
        }
      }
      activeSnapZRef.current = snapHit;
      setActiveSnapZ(snapHit);
      setLiveSpeakerDrag({ role, z: snapHit !== null ? snapHit : rawZ });
    };
    const handleUp = (me) => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      speakerListenersRef.current = null;
      const svgRect = svgEl.getBoundingClientRect();
      const svgScale = svgRect.height / SVG_H;
      const deltaZ = -((me.clientY - speakerDragRef.current.startClientY) / svgScale / drawH) * roomH;
      const rawZ = Math.max(0.05, Math.min(roomH - 0.05, speakerDragRef.current.startZ + deltaZ));
      // Use snapped value if a snap was active at release
      const finalZ = activeSnapZRef.current !== null ? activeSnapZRef.current : rawZ;
      speakerDragRef.current = null;
      activeSnapZRef.current = null;
      setActiveSnapZ(null);
      setLiveSpeakerDrag(null);
      onSideSpeakerMoved({ role, newZ: Math.round(finalZ * 1000) / 1000 });
    };
    speakerListenersRef.current = { move: handleMove, up: handleUp };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [onSideSpeakerMoved, roomH, drawH, SVG_H]);

  const handleSubMouseDown = useCallback((e, group, startBottomHeightM, subHeightM) => {
    const handler = group === 'front' ? onFrontSubHeightChange : onRearSubHeightChange;
    if (!handler) return;
    e.preventDefault();
    e.stopPropagation();
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const startClientY = e.clientY;
    liveSubDragRef.current = { group, liveBottomHeightM: startBottomHeightM };
    setLiveSubDrag({ group, liveBottomHeightM: startBottomHeightM });
    const handleMove = (me) => {
      const svgRect = svgEl.getBoundingClientRect();
      const svgScale = svgRect.height / SVG_H;
      const deltaZ = -((me.clientY - startClientY) / svgScale / drawH) * roomH;
      const raw = startBottomHeightM + deltaZ;
      const clamped = Math.max(0, Math.min(roomH - subHeightM, raw));
      liveSubDragRef.current = { group, liveBottomHeightM: clamped };
      setLiveSubDrag({ group, liveBottomHeightM: clamped });
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      const final = liveSubDragRef.current?.liveBottomHeightM ?? startBottomHeightM;
      handler(Math.round(final * 1000) / 1000);
      liveSubDragRef.current = null;
      setLiveSubDrag(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [onFrontSubHeightChange, onRearSubHeightChange, roomH, drawH, SVG_H]);

  const handleScreenMouseDown = useCallback((e) => {
    if (!onScreenHeightFromFloorChange) return;
    e.preventDefault();
    e.stopPropagation();
    const svgEl = svgRef.current;
    if (!svgEl) return;
    isDraggingRef.current = true;
    dragStartRef.current = { clientY: e.clientY, floorM: liveFloorM };

    const handleMove = (me) => {
      const svgRect = svgEl.getBoundingClientRect();
      const svgScale = svgRect.height / SVG_H;
      const deltaClientY = me.clientY - dragStartRef.current.clientY;
      const deltaM = -(deltaClientY / svgScale / drawH) * roomH;
      const minFloor = 0.05;
      const maxFloor = roomH - screenData.h - 0.05;
      const newFloor = Math.max(minFloor, Math.min(maxFloor, dragStartRef.current.floorM + deltaM));
      setLiveFloorM(newFloor);
    };

    const handleUp = (me) => {
      isDraggingRef.current = false;
      listenersRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      const svgRect = svgEl.getBoundingClientRect();
      const svgScale = svgRect.height / SVG_H;
      const deltaClientY = me.clientY - dragStartRef.current.clientY;
      const deltaM = -(deltaClientY / svgScale / drawH) * roomH;
      const minFloor = 0.05;
      const maxFloor = roomH - screenData.h - 0.05;
      const newFloor = Math.max(minFloor, Math.min(maxFloor, dragStartRef.current.floorM + deltaM));
      const rounded = Math.round(newFloor * 100) / 100;
      setLiveFloorM(rounded);
      onScreenHeightFromFloorChange(rounded);
    };

    listenersRef.current = { move: handleMove, up: handleUp };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [onScreenHeightFromFloorChange, liveFloorM, roomH, screenData.h, drawH, SVG_H]);

  // Populate snap targets — draggable side/rear surround speakers, updated every render
  const isDraggableSideRole = (r) => {
    const u = String(r || '').toUpperCase();
    return ['LW','RW','SL','SR','SBL','SBR'].includes(u) || /^(SL|SR)\d+$/.test(u);
  };
  speakersForSnapRef.current = Array.isArray(placedSpeakers)
    ? placedSpeakers
        .filter(s => isDraggableSideRole(s?.role) && Number.isFinite(s?.position?.z))
        .map(s => ({ role: String(s.role).toUpperCase(), z: s.position.z }))
    : [];

  // Hoisted so the topmost screen drag hit rect (rendered after all speakers) can reference these
  const sxPx       = rx(screenFrontY);
  const frameTopPx = rz(frameTopM);
  const frameBotPx = rz(frameBottomM);

  return (
    <div style={{ width: "100%", padding: 16, background: "#F8F8F7", boxSizing: "border-box" }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <button
          onClick={() => setShowSightlines(s => !s)}
          style={{ fontSize: 10, padding: '3px 10px', borderRadius: 4, border: '1px solid #B0AEA8', background: showSightlines ? '#213428' : '#F4F3F0', color: showSightlines ? '#fff' : '#4A4540', cursor: 'pointer', letterSpacing: '0.03em' }}
        >
          {showSightlines ? '◉ Hide Sightlines' : '○ Show Sightlines'}
        </button>
      </div>
      <div style={{ width: "100%", aspectRatio: `${SVG_W} / ${SVG_H}` }}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Title */}
          <text x={offsetX + drawW / 2} y={14}
            textAnchor="middle" fontSize={10} fontWeight={600}
            fill={LABEL_COLOR} letterSpacing="0.06em">
            {`${String(wall || 'left').toUpperCase()} WALL ELEVATION`}
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
          <line x1={offsetX} y1={offsetY - 40} x2={offsetX + drawW} y2={offsetY - 40}
            stroke={DIM_COLOR} strokeWidth={0.8} />
          <line x1={offsetX} y1={offsetY - 44} x2={offsetX} y2={offsetY - 36}
            stroke={DIM_COLOR} strokeWidth={0.8} />
          <line x1={offsetX + drawW} y1={offsetY - 44} x2={offsetX + drawW} y2={offsetY - 36}
            stroke={DIM_COLOR} strokeWidth={0.8} />
          <text x={offsetX + drawW / 2} y={offsetY - 51}
            textAnchor="middle" fontSize={9} fill={DIM_COLOR}>
            {roomL.toFixed(2)}m
          </text>

          {/* Dimension: room height (vertical, left side) */}
          <line x1={offsetX - 40} y1={offsetY} x2={offsetX - 40} y2={offsetY + drawH}
            stroke={DIM_COLOR} strokeWidth={0.8} />
          <line x1={offsetX - 44} y1={offsetY} x2={offsetX - 36} y2={offsetY}
            stroke={DIM_COLOR} strokeWidth={0.8} />
          <line x1={offsetX - 44} y1={offsetY + drawH} x2={offsetX - 36} y2={offsetY + drawH}
            stroke={DIM_COLOR} strokeWidth={0.8} />
          <text x={offsetX - 60} y={offsetY + drawH / 2}
            textAnchor="middle" fontSize={9} fill={DIM_COLOR}
            transform={`rotate(-90, ${offsetX - 60}, ${offsetY + drawH / 2})`}>
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
              <g
                onMouseDown={handleScreenMouseDown}
                style={{ cursor: onScreenHeightFromFloorChange ? 'ns-resize' : 'default' }}
                title="Drag screen up/down"
              >
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
                {/* Screen drag hit rect moved to end of SVG so it sits above all speaker layers */}
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

          {/* Front subwoofers — side profile, sourced from frontSubs (same as FrontElevation / Plan View) */}
          {(() => {
            const safeSubs = Array.isArray(frontSubs) ? frontSubs : [];
            if (!safeSubs.length) return null;
            const isDraggingFront = liveSubDrag?.group === 'front';
            return (
              <g opacity={0.88}>
                {safeSubs.map((sub, i) => {
                  const orientation = sub?.orientation || frontSubsCfg?.orientation;
                  const meta = getSpeakerModelMeta(sub?.model, orientation) || {};
                  const subHeightM = Number(meta.heightM) > 0 ? Number(meta.heightM) : 0.40;
                  const subDepthM  = Number(meta.depthM)  > 0 ? Number(meta.depthM)  : 0.35;
                  const subCentreY = Number.isFinite(sub?.position?.y) ? Number(sub.position.y) : 0.01;
                  const frontX = rx(subCentreY - subDepthM / 2);
                  const backX  = rx(subCentreY + subDepthM / 2);
                  const svgW   = Math.max(4, backX - frontX);
                  const staticBottom = Number.isFinite(sub?.bottomHeightM) ? sub.bottomHeightM
                    : Number.isFinite(sub?.position?.z) ? sub.position.z - subHeightM / 2
                    : 0;
                  const bottomZ = isDraggingFront ? liveSubDrag.liveBottomHeightM : staticBottom;
                  const topZ   = bottomZ + subHeightM;
                  const svgTop = rz(topZ);
                  const svgBot = rz(bottomZ);
                  const svgH   = Math.max(4, svgBot - svgTop);
                  const label  = `SUB${i + 1}`;
                  const canDrag = !!onFrontSubHeightChange;
                  return (
                    <g key={`fsub-${i}`}
                      onMouseDown={canDrag ? (e) => handleSubMouseDown(e, 'front', staticBottom, subHeightM) : undefined}
                      style={{ cursor: canDrag ? 'ns-resize' : 'default' }}>
                      <rect
                        x={frontX} y={svgTop}
                        width={svgW} height={svgH}
                        fill="#fff" stroke="#4A4540" strokeWidth={0.9} rx={1} />
                      {/* Front face baffle line */}
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
                      {/* Front sub dimension labels */}
                      {Number.isFinite(bottomZ) && (
                        <text x={frontX - 4} y={(svgTop + svgBot) / 2 - 6} textAnchor="end" fontSize={6.5} fill={DIM_COLOR} letterSpacing="0.02em">
                          B{Math.round(bottomZ * 100)}cm
                        </text>
                      )}
                      {Number.isFinite(subDepthM) && Number.isFinite(subHeightM) && (
                        <text x={frontX - 4} y={(svgTop + svgBot) / 2 + 13} textAnchor="end" fontSize={6} fill={DIM_COLOR} opacity={0.85}>
                          {Math.round(subDepthM * 100)}×{Math.round(subHeightM * 100)}cm
                        </text>
                      )}
                      {canDrag && (
                        <rect
                          x={frontX - 7} y={svgTop - 7}
                          width={svgW + 14} height={svgH + 14}
                          fill="transparent" pointerEvents="all"
                          style={{ cursor: 'ns-resize' }}
                          onMouseDown={(e) => handleSubMouseDown(e, 'front', staticBottom, subHeightM)}
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })()}

          {/* Rear subwoofers — side profile, mirroring front sub style, against rear wall */}
          {(() => {
            const safeRearSubs = Array.isArray(rearSubs) ? rearSubs : [];
            if (!safeRearSubs.length) return null;
            const isDraggingRear = liveSubDrag?.group === 'rear';
            return (
              <g opacity={0.88}>
                {safeRearSubs.map((sub, i) => {
                  const orientation = sub?.orientation || rearSubsCfg?.orientation;
                  const meta = getSpeakerModelMeta(sub?.model, orientation) || {};
                  const subHeightM = Number(meta.heightM) > 0 ? Number(meta.heightM) : 0.40;
                  const subDepthM  = Number(meta.depthM)  > 0 ? Number(meta.depthM)  : 0.35;
                  const subCentreY = Number.isFinite(sub?.position?.y)
                    ? Number(sub.position.y)
                    : roomL - subDepthM / 2;
                  const frontX = rx(subCentreY - subDepthM / 2);
                  const backX  = rx(subCentreY + subDepthM / 2);
                  const svgW   = Math.max(4, backX - frontX);
                  const staticBottom = Number.isFinite(sub?.bottomHeightM) ? sub.bottomHeightM
                    : Number.isFinite(sub?.position?.z) ? sub.position.z - subHeightM / 2
                    : 0;
                  const bottomZ = isDraggingRear ? liveSubDrag.liveBottomHeightM : staticBottom;
                  const topZ   = bottomZ + subHeightM;
                  const svgTop = rz(topZ);
                  const svgBot = rz(bottomZ);
                  const svgH   = Math.max(4, svgBot - svgTop);
                  const label  = `RSUB${i + 1}`;
                  const canDrag = !!onRearSubHeightChange;
                  return (
                    <g key={`rsub-${i}`}
                      onMouseDown={canDrag ? (e) => handleSubMouseDown(e, 'rear', staticBottom, subHeightM) : undefined}
                      style={{ cursor: canDrag ? 'ns-resize' : 'default' }}>
                      <rect
                        x={frontX} y={svgTop}
                        width={svgW} height={svgH}
                        fill="#fff" stroke="#4A4540" strokeWidth={0.9} rx={1} />
                      {/* Front face baffle line */}
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
                      {/* Rear sub dimension labels */}
                      {Number.isFinite(bottomZ) && (
                        <text x={frontX - 4} y={(svgTop + svgBot) / 2 - 6} textAnchor="end" fontSize={6.5} fill={DIM_COLOR} letterSpacing="0.02em">
                          B{Math.round(bottomZ * 100)}cm
                        </text>
                      )}
                      {Number.isFinite(subDepthM) && Number.isFinite(subHeightM) && (
                        <text x={frontX - 4} y={(svgTop + svgBot) / 2 + 13} textAnchor="end" fontSize={6} fill={DIM_COLOR} opacity={0.85}>
                          {Math.round(subDepthM * 100)}×{Math.round(subHeightM * 100)}cm
                        </text>
                      )}
                      {canDrag && (
                        <rect
                          x={frontX - 7} y={svgTop - 7}
                          width={svgW + 14} height={svgH + 14}
                          fill="transparent" pointerEvents="all"
                          style={{ cursor: 'ns-resize' }}
                          onMouseDown={(e) => handleSubMouseDown(e, 'rear', staticBottom, subHeightM)}
                        />
                      )}
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
            const elH = Number.isFinite(Number(el?.height)) ? Number(el.height)
              : Number.isFinite(el?.height_m) ? el.height_m
              : el.type === 'door' ? 2.1 : 1.0;
            const elW = Number.isFinite(el?.length_m) ? el.length_m : 0.9;
            const elZ = Number.isFinite(Number(el?.z_position)) ? Number(el.z_position) : 0;
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
                  {el.label || el.name || (el.type === 'door' ? 'Door' : el.type === 'window' ? 'Window' : el.type ? el.type.charAt(0).toUpperCase() + el.type.slice(1) : 'Element')}
                </text>
                {/* Dimension: element height */}
                <text x={px + pw + 3} y={(rz(elZ + elH) + rz(elZ)) / 2 - 3}
                  textAnchor="start" fontSize={6} fill={DIM_COLOR} letterSpacing="0.02em">
                  h{Math.round(elH * 100)}cm
                </text>
                {/* Dimension: bottom from floor (only shown when above floor) */}
                {elZ > 0.001 && (
                  <text x={px + pw + 3} y={(rz(elZ + elH) + rz(elZ)) / 2 + 6}
                    textAnchor="start" fontSize={6} fill={DIM_COLOR} letterSpacing="0.02em">
                    +{Math.round(elZ * 100)}cm
                  </text>
                )}
              </g>
            );
          })}

          {/* Platform risers — drawn before seat icons so they appear behind */}
          {seatRows.map((row, i) => {
            if (i === 0 || row.platformH <= 0) return null;
            const prevRow = seatRows[i - 1];
            // Seat icon spans: front = cx - 0.90m, back = cx + 0.08m (from SeatPersonIcon geometry)
            const SEAT_FRONT_M = 0.90;
            const SEAT_BACK_M = 0.08;
            const x1 = rx(prevRow.y + SEAT_BACK_M);  // back edge of row-in-front chair → riser front
            const x2 = rx(row.y + SEAT_BACK_M);       // back edge of raised row chair → riser back
            if (x2 <= x1 + 2) return null; // skip if rows are too close
            const platformTopY = rz(row.platformH);
            const floorY = rz(0);
            return (
              <rect key={`plat-${i}`}
                x={x1} y={platformTopY}
                width={x2 - x1} height={floorY - platformTopY}
                fill="#EAE8E3" stroke="#B0AEA8" strokeWidth={0.7}
                opacity={0.80}
              />
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

            const roleUp = String(spk.role || '').toUpperCase();
            const isDraggable = !!onSideSpeakerMoved && (['LW','RW','SL','SR'].includes(roleUp) || /^(SL|SR)\d+$/.test(roleUp));
            const effectiveZ = (liveSpeakerDrag && liveSpeakerDrag.role === roleUp) ? liveSpeakerDrag.z : spk.z;
            const spkX   = rx(spk.y);
            const svgTop = rz(effectiveZ + spkHeightM / 2);
            const svgBot = rz(effectiveZ - spkHeightM / 2);
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
            const adjustedIconY = rz(effectiveZ) - adjustedIconH / 2;

            const sideSpkHCm = Number.isFinite(effectiveZ) ? Math.round(effectiveZ * 100) : null;
            const sideSpkWCm = Number.isFinite(spkWidthM) ? Math.round(spkWidthM * 100) : null;
            const sideSpkDimHCm = Number.isFinite(spkHeightM) ? Math.round(spkHeightM * 100) : null;
            // Dim labels to the right of the cabinet box
            const sideDimX = spkX + svgW / 2 + 4;
            return (
              <g key={`spk-${i}`} opacity={0.85}
                onMouseDown={isDraggable ? (e) => handleSpeakerMouseDown(e, roleUp, effectiveZ) : undefined}
                style={{ cursor: isDraggable ? 'ns-resize' : 'default' }}
              >
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
                {/* Vertical dimension line — floor to speaker centre */}
                {sideSpkHCm !== null && (() => {
                  const dimX = spkX + svgW / 2 + 7;
                  const floorPx = rz(0);
                  const centrePx = rz(effectiveZ);
                  return (
                    <g opacity={0.75}>
                      {/* Vertical line */}
                      <line x1={dimX} y1={floorPx} x2={dimX} y2={centrePx} stroke={DIM_COLOR} strokeWidth={0.7} />
                      {/* Tick at floor */}
                      <line x1={dimX - 3} y1={floorPx} x2={dimX + 3} y2={floorPx} stroke={DIM_COLOR} strokeWidth={0.7} />
                      {/* Tick at centre */}
                      <line x1={dimX - 3} y1={centrePx} x2={dimX + 3} y2={centrePx} stroke={DIM_COLOR} strokeWidth={0.7} />
                      {/* Label — rotated vertically beside the line */}
                      {(() => {
                        const midY = (floorPx + centrePx) / 2;
                        return (
                          <text
                            x={dimX + 4} y={midY}
                            textAnchor="middle" fontSize={6.5} fill={DIM_COLOR} letterSpacing="0.02em"
                            transform={`rotate(-90, ${dimX + 4}, ${midY})`}>
                            H{sideSpkHCm}cm
                          </text>
                        );
                      })()}
                    </g>
                  );
                })()}
                {sideSpkWCm !== null && sideSpkDimHCm !== null && (
                  <text x={spkX + svgW / 2 + 7} y={svgBot + 8} textAnchor="start" fontSize={6} fill={DIM_COLOR} opacity={0.75}>
                    {sideSpkWCm}×{sideSpkDimHCm}cm
                  </text>
                )}
                {isDraggable && (
                  <rect
                    x={cabinetX - 7} y={cabinetY - 7}
                    width={svgW + 14} height={svgH + 14}
                    fill="transparent"
                    pointerEvents="all"
                    style={{ cursor: 'ns-resize' }}
                    onMouseDown={(e) => handleSpeakerMouseDown(e, roleUp, effectiveZ)}
                  />
                )}
              </g>
            );
          })}

          {/* Rear-wall surround speakers — side profile, one per height group */}
          {rearWallGroups.map((grp, i) => {
            const meta = getSpeakerModelMeta(grp.model) || {};
            const spkDepthM  = Number(meta.depthM)  > 0 ? Number(meta.depthM)  : 0.082;
            const spkHeightM = Number(meta.heightM) > 0 ? Number(meta.heightM) : 0.27;
            const grpRole = grp.roles[0] || '';
            const isDraggableGrp = !!onSideSpeakerMoved && grp.roles.some(r => ['SBL','SBR'].includes(r));
            const effectiveGrpZ = (liveSpeakerDrag && grp.roles.includes(liveSpeakerDrag.role)) ? liveSpeakerDrag.z : grp.z;
            const frontX = rx(roomL - spkDepthM); // front face of speaker
            const backX  = rx(roomL);             // rear wall
            const svgW   = Math.max(3, backX - frontX);
            const svgTop  = rz(effectiveGrpZ + spkHeightM / 2);
            const svgBot  = rz(effectiveGrpZ - spkHeightM / 2);
            const svgH   = Math.max(3, svgBot - svgTop);
            const label  = grp.roles.length > 1
              ? grp.roles.join('/')
              : grp.roles[0];
            return (
              <g key={`rear-${i}`} opacity={0.92}
                onMouseDown={isDraggableGrp ? (e) => handleSpeakerMouseDown(e, grpRole, effectiveGrpZ) : undefined}
                style={{ cursor: isDraggableGrp ? 'ns-resize' : 'default' }}
              >
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
                {/* Vertical dimension line — floor to group centre, outside room (right of rear wall) */}
                {Number.isFinite(effectiveGrpZ) && (() => {
                  const dimX = offsetX + drawW + 12;
                  const floorPx = rz(0);
                  const centrePx = rz(effectiveGrpZ);
                  return (
                    <g opacity={0.75}>
                      <line x1={dimX} y1={floorPx} x2={dimX} y2={centrePx} stroke={DIM_COLOR} strokeWidth={0.7} />
                      <line x1={dimX - 3} y1={floorPx} x2={dimX + 3} y2={floorPx} stroke={DIM_COLOR} strokeWidth={0.7} />
                      <line x1={dimX - 3} y1={centrePx} x2={dimX + 3} y2={centrePx} stroke={DIM_COLOR} strokeWidth={0.7} />
                      {(() => {
                        const midY = (floorPx + centrePx) / 2;
                        return (
                          <text
                            x={dimX + 4} y={midY}
                            textAnchor="middle" fontSize={6.5} fill={DIM_COLOR} letterSpacing="0.02em"
                            transform={`rotate(-90, ${dimX + 4}, ${midY})`}>
                            H{Math.round(effectiveGrpZ * 100)}cm
                          </text>
                        );
                      })()}
                    </g>
                  );
                })()}
                {Number.isFinite(spkDepthM) && Number.isFinite(spkHeightM) && (
                  <text x={frontX - 4} y={svgBot + 8} textAnchor="end" fontSize={6} fill={DIM_COLOR} opacity={0.75}>
                    {Math.round(spkDepthM * 100)}×{Math.round(spkHeightM * 100)}cm
                  </text>
                )}
                {isDraggableGrp && (
                  <rect
                    x={frontX - 7} y={svgTop - 7}
                    width={svgW + 14} height={svgH + 14}
                    fill="transparent"
                    pointerEvents="all"
                    style={{ cursor: 'ns-resize' }}
                    onMouseDown={(e) => handleSpeakerMouseDown(e, grpRole, effectiveGrpZ)}
                  />
                )}
              </g>
            );
          })}

          {/* Magnetic snap guide — same style as Front Elevation */}
          {activeSnapZ !== null && (() => {
            // AFF: bottom of dragged cabinet at snapped height
            const draggedSp = liveSpeakerDrag && Array.isArray(placedSpeakers)
              ? placedSpeakers.find(s => String(s?.role || '').toUpperCase() === liveSpeakerDrag.role)
              : null;
            const snapMeta = draggedSp ? (getSpeakerModelMeta(draggedSp.model) || {}) : {};
            const snapItemHM = Number(snapMeta.heightM) > 0 ? Number(snapMeta.heightM) : 0.27;
            const snapAffText = `${activeSnapZ.toFixed(2)}m AFF`;
            return (
              <g key="snap-guide-z" opacity={0.85}>
                <line
                  x1={offsetX} y1={rz(activeSnapZ)}
                  x2={offsetX + drawW} y2={rz(activeSnapZ)}
                  stroke="#10B981" strokeWidth={1.2} strokeDasharray="6 3" />
                <rect x={offsetX + drawW - 48} y={rz(activeSnapZ) - 8} width={44} height={23} fill="#10B981" rx={2} />
                <text x={offsetX + drawW - 26} y={rz(activeSnapZ) + 2} textAnchor="middle" fontSize={7} fill="white" fontWeight={700} letterSpacing="0.04em">{activeSnapZ.toFixed(2)}m</text>
                <text x={offsetX + drawW - 26} y={rz(activeSnapZ) + 13} textAnchor="middle" fontSize={6.5} fill="white" fontWeight={600}>{snapAffText}</text>
              </g>
            );
          })()}

          {/* Centre height AFF badge — visible during any vertical speaker drag */}
          {liveSpeakerDrag && (() => {
            const affZ = liveSpeakerDrag.z;
            const py = rz(affZ);
            return (
              <g key="spk-aff-badge" opacity={0.92}>
                <rect x={offsetX + drawW - 54} y={py - 9} width={50} height={14} fill="#213428" rx={2} />
                <text x={offsetX + drawW - 29} y={py + 1} textAnchor="middle" fontSize={7.5} fill="white" fontWeight={700} letterSpacing="0.04em">
                  {affZ.toFixed(2)}m AFF
                </text>
              </g>
            );
          })()}

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

          {/* ── Sightline overlay ── */}
          {showSightlines && seatRows.length > 0 && (() => {
            const ROW_COLORS = ['#213428', '#625143', '#3E4349', '#B45309', '#1B1A1A'];
            const stx = rx(screenFrontY);
            const sTop = rz(screenTopM);
            const sBot = rz(screenFloorM);
            return (
              <g key="sightline-overlay">
                {/* Sightlines + eye points per row */}
                {seatRows.map((row, i) => {
                  const ex = rx(row.y);
                  const ez = rz(row.earZ);
                  const col = ROW_COLORS[i % ROW_COLORS.length];
                  return (
                    <g key={`sl-row-${i}`}>
                      {/* Sightline to top of viewable image */}
                      <line x1={ex} y1={ez} x2={stx} y2={sTop}
                        stroke={col} strokeWidth={0.7} strokeDasharray="5 3" opacity={0.6} fill="none" />
                      {/* Sightline to bottom of viewable image */}
                      <line x1={ex} y1={ez} x2={stx} y2={sBot}
                        stroke={col} strokeWidth={0.7} strokeDasharray="3 3" opacity={0.6} fill="none" />
                      {/* Eye point */}
                      <circle cx={ex} cy={ez} r={3.5} fill={col} opacity={0.9} />
                      <text x={ex + 6} y={ez + 1} fontSize={7} fill={col} fontWeight={600}>
                        R{i + 1}
                      </text>
                    </g>
                  );
                })}
                {/* Projector throw lines */}
                {projectorEl && Number.isFinite(projectorEl.y_lens_m) && Number.isFinite(projectorEl.z_lens_m) && (
                  <g>
                    <line
                      x1={rx(projectorEl.y_lens_m)} y1={rz(projectorEl.z_lens_m)}
                      x2={stx} y2={sTop}
                      stroke="#B45309" strokeWidth={0.8} strokeDasharray="6 2" opacity={0.8} fill="none" />
                    <line
                      x1={rx(projectorEl.y_lens_m)} y1={rz(projectorEl.z_lens_m)}
                      x2={stx} y2={sBot}
                      stroke="#B45309" strokeWidth={0.8} strokeDasharray="6 2" opacity={0.8} fill="none" />
                  </g>
                )}
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

          {/* Screen drag hit area — rendered last so it sits above all speaker/sub layers */}
          {onScreenHeightFromFloorChange && (
            <rect
              x={sxPx - 15} y={frameTopPx}
              width={30} height={frameBotPx - frameTopPx}
              fill="transparent" pointerEvents="all"
              style={{ cursor: 'ns-resize' }}
              onMouseDown={handleScreenMouseDown}
            />
          )}
        </svg>
      </div>
    </div>
  );
}