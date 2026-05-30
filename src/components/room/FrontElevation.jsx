import React, { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { getSpeakerModelMeta, normaliseModelKey } from "@/components/models/speakers/registry";
import { Q43FaceIcon, Q45FaceIcon, Q85FaceIcon, Q63FaceIcon, Evolve11FaceIcon, Evolve21FaceIcon, Evolve31FaceIcon, Evolve42FaceIcon, Evolve63FaceIcon, Evolve84FaceIcon } from "@/components/report/SpeakerFaceIcons";

// Roles displayed in front elevation
const FRONT_ROLES = new Set(["FL", "FC", "FR", "L", "C", "R"]);
const canonFront = (role) => {
  const map = { L: "FL", C: "FC", R: "FR", FL: "FL", FC: "FC", FR: "FR" };
  return map[String(role || "").toUpperCase()] || null;
};

// Convert screen config to viewable width/height in metres
function screenDimsM(screen) {
  if (!screen) return { w: 2.54, h: 1.43 };

  // TV preset widths (inches)
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

export default function FrontElevation({ dimensions, screen, placedSpeakers = [], frontSubs = [], frontSubsCfg, roomElements = [], onLcrSpeakerMoved, onFrontSubMoved, isDraggingRef }) {
  const roomW = Number(dimensions?.widthM ?? dimensions?.width) || 4.5;
  const roomH = Number(dimensions?.heightM ?? dimensions?.height) || 2.8;

  // Internal coordinate system — fixed virtual canvas
  const SVG_W = 640;
  const PADDING = 36;
  const LABEL_TOP = 56; // increased top padding — title breathing room + label rows
  const LABEL_LEFT = 36;
  const drawW = SVG_W - PADDING * 2 - LABEL_LEFT;
  const drawH = Math.round(drawW * (roomH / roomW));
  const SVG_H = drawH + PADDING * 2 + LABEL_TOP;

  const offsetX = PADDING + LABEL_LEFT;
  const offsetY = PADDING + LABEL_TOP;

  // room-metres → SVG px
  const rx = (m) => offsetX + (m / roomW) * drawW;
  const ry = (m) => offsetY + drawH - (m / roomH) * drawH; // y=0 is floor

  // ── Front Elevation drag machinery ──────────────────────────────────────
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const geomRef = useRef({});
  geomRef.current = { offsetX, offsetY, drawW, drawH, roomW, roomH };
  const onMovedRef = useRef(onLcrSpeakerMoved);
  useEffect(() => { onMovedRef.current = onLcrSpeakerMoved; }, [onLcrSpeakerMoved]);
  const onSubMovedRef = useRef(onFrontSubMoved);
  useEffect(() => { onSubMovedRef.current = onFrontSubMoved; }, [onFrontSubMoved]);

  // Alignment guide state
  const [alignGuide, setAlignGuide] = useState(null); // { draggingRole, liveZ } | null
  const setAlignGuideRef = useRef(setAlignGuide);

  // Magnetic snap state
  const [activeSnap, setActiveSnap] = useState(null); // { axis: 'x'|'z', value: number } | null
  const setActiveSnapRef = useRef(setActiveSnap);
  // Live refs so mousemove handler can read current speaker positions without stale closure
  const lcrSpeakersRef = useRef([]);
  const subItemsRef = useRef([]);

  const clientToRoom = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    const { offsetX: ox, offsetY: oy, drawW: dW, drawH: dH, roomW: rW, roomH: rH } = geomRef.current;
    return { mX: (svgP.x - ox) * rW / dW, mZ: (oy + dH - svgP.y) * rH / dH };
  }, []);

  const handleLcrMouseDown = useCallback((e, role, speakerMX, speakerMZ) => {
    e.preventDefault();
    const start = clientToRoom(e.clientX, e.clientY);
    if (!start) return;
    dragRef.current = { role, speakerMX, speakerMZ, startRoomX: start.mX, startRoomZ: start.mZ, axisLocked: null };
    if (isDraggingRef) isDraggingRef.current = true;
    document.body.style.cursor = 'grabbing';
  }, [clientToRoom, isDraggingRef]);

  const handleSubMouseDown = useCallback((e, subIndex, speakerMX, speakerMZ) => {
    e.preventDefault();
    const start = clientToRoom(e.clientX, e.clientY);
    if (!start) return;
    dragRef.current = { type: 'sub', subIndex, speakerMX, speakerMZ, startRoomX: start.mX, startRoomZ: start.mZ, axisLocked: null };
    if (isDraggingRef) isDraggingRef.current = true;
    document.body.style.cursor = 'grabbing';
  }, [clientToRoom, isDraggingRef]);

  useEffect(() => {
    const THRESHOLD_PX = 4;
    const onMouseMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      const curr = clientToRoom(e.clientX, e.clientY);
      if (!curr) return;
      const dX = curr.mX - drag.startRoomX;
      const dZ = curr.mZ - drag.startRoomZ;
      const { drawW: dW, drawH: dH, roomW: rW, roomH: rH } = geomRef.current;
      const dXpx = Math.abs(dX / rW * dW);
      const dZpx = Math.abs(dZ / rH * dH);
      if (!drag.axisLocked) {
        if (Math.max(dXpx, dZpx) < THRESHOLD_PX) return;
        drag.axisLocked = drag.role === 'FC' ? 'z' : (dXpx >= dZpx ? 'x' : 'z');
      }
      const rawX = Math.max(0, Math.min(rW, drag.speakerMX + (drag.axisLocked === 'x' ? dX : 0)));
      const rawZ = Math.max(0, Math.min(rH, drag.speakerMZ + (drag.axisLocked === 'z' ? dZ : 0)));
      // Magnetic snap (50 mm threshold, room-space metres)
      const SNAP_M = 0.05;
      const isDragSub = drag.type === 'sub';
      const isDraggedItem = (s) => isDragSub
        ? (typeof s.index === 'number' && s.index === drag.subIndex)
        : (s.role || s.label) === drag.role;
      const allOtherSpks = [...lcrSpeakersRef.current, ...subItemsRef.current].filter(s => !isDraggedItem(s));
      let snappedX = rawX, snappedZ = rawZ, snapResult = null;
      if (drag.axisLocked === 'x') {
        const xTargets = [
          { value: rW / 2, type: 'centre' },
          ...allOtherSpks.map(s => ({ value: s.x, type: 'speaker' })),
        ];
        let best = null, bestD = SNAP_M;
        xTargets.forEach(t => { const d = Math.abs(rawX - t.value); if (d < bestD) { bestD = d; best = t; } });
        if (best) { snappedX = best.value; snapResult = { axis: 'x', value: best.value }; }
      }
      if (drag.axisLocked === 'z') {
        const isLRPair = !isDragSub && (drag.role === 'FL' || drag.role === 'FR');
        const zTargets = allOtherSpks
          .filter(s => !(isLRPair && (s.role === 'FL' || s.role === 'FR')))
          .map(s => ({ value: s.z, type: 'speaker' }));
        let best = null, bestD = SNAP_M;
        zTargets.forEach(t => { const d = Math.abs(rawZ - t.value); if (d < bestD) { bestD = d; best = t; } });
        if (best) { snappedZ = best.value; snapResult = { axis: 'z', value: best.value }; }
      }
      setActiveSnapRef.current?.(snapResult);
      if (isDragSub) {
        onSubMovedRef.current?.({ index: drag.subIndex, newX: snappedX, newZ: snappedZ, axis: drag.axisLocked });
      } else {
        onMovedRef.current?.({ role: drag.role, newX: snappedX, newZ: snappedZ, axis: drag.axisLocked });
        if (drag.axisLocked === 'z') {
          setAlignGuideRef.current?.({ draggingRole: drag.role, liveZ: snappedZ });
        }
      }
    };
    const onMouseUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      if (isDraggingRef) isDraggingRef.current = false;
      document.body.style.cursor = '';
      setAlignGuideRef.current?.(null);
      setActiveSnapRef.current?.(null);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, [clientToRoom, isDraggingRef]);
  // ────────────────────────────────────────────────────────────────────────

  // Screen
  const screenData = useMemo(() => screenDimsM(screen), [screen]);
  const screenFloorM = Number(screen?.heightFromFloorM) || 0.5;
  const screenCenterX = roomW / 2;
  // Border/frame: use persisted value, else safe visual fallback
  const hasBorderData = Number(screen?.borderThicknessM) > 0;
  const borderM = hasBorderData ? Number(screen.borderThicknessM) : 0.05; // 5cm fallback
  const overallW = screenData.w + borderM * 2;
  const overallH = screenData.h + borderM * 2;

  // LCR speakers — always returns a plain array
  const lcrSpeakers = useMemo(() => {
    if (!Array.isArray(placedSpeakers)) return [];
    return placedSpeakers
      .filter(s => canonFront(s?.role))
      .map(s => {
        const meta = getSpeakerModelMeta(s?.model);
        const wM = (meta && !meta.notFound && meta.widthM) ? meta.widthM : 0.20;
        const hM = (meta && !meta.notFound && meta.heightM) ? meta.heightM : 0.20;
        const x = Number.isFinite(s?.position?.x) ? s.position.x : roomW / 2;
        const z = Number.isFinite(s?.position?.z) ? s.position.z : 1.2;
        const modelKey = normaliseModelKey(s?.model);
        return { role: canonFront(s.role), x, z, wM, hM, label: canonFront(s.role), modelKey };
      });
  }, [placedSpeakers, roomW]);

  // Front subs — always returns a plain array
  const subItems = useMemo(() => {
    const safeSubs = Array.isArray(frontSubs) ? frontSubs : [];
    return safeSubs.map((s, i) => {
      const orientation = s?.orientation || frontSubsCfg?.orientation;
      const meta = getSpeakerModelMeta(s?.model, orientation);
      const wM = (meta && !meta.notFound && meta.widthM) ? meta.widthM : 0.35;
      const hM = (meta && !meta.notFound && meta.heightM) ? meta.heightM : 0.35;
      const x = Number.isFinite(s?.position?.x) ? s.position.x : roomW / 2;
      const z = Number.isFinite(s?.position?.z) ? s.position.z : hM / 2;
      return { x, z, wM, hM, label: "SUB", index: i };
    });
  }, [frontSubs, roomW]);
  // Keep snap refs current on every render
  lcrSpeakersRef.current = lcrSpeakers;
  subItemsRef.current = subItems;

  // Clash detection — recalculates live (also during drag via lcrSpeakers/subItems reactivity)
  const clashes = useMemo(() => {
    const T = 0.05; // 50 mm threshold
    const items = [
      ...lcrSpeakers.map(s => ({
        label: s.label || s.role,
        xMin: s.x - s.wM / 2, xMax: s.x + s.wM / 2,
        zMin: s.z - s.hM / 2, zMax: s.z + s.hM / 2,
      })),
      ...subItems.map(s => ({
        label: s.label || 'SUB',
        xMin: s.x - s.wM / 2, xMax: s.x + s.wM / 2,
        zMin: s.z - s.hM / 2, zMax: s.z + s.hM / 2,
      })),
    ].filter(it => it.xMin != null && it.zMin != null);
    const pairs = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const gapX = Math.max(0, Math.max(a.xMin, b.xMin) - Math.min(a.xMax, b.xMax));
        const gapZ = Math.max(0, Math.max(a.zMin, b.zMin) - Math.min(a.zMax, b.zMax));
        if (gapX < T && gapZ < T) pairs.push(`${a.label} and ${b.label}`);
      }
    }
    return pairs;
  }, [lcrSpeakers, subItems]);

  // Projector element from roomElements
  const projectorEl = useMemo(() => {
    if (!Array.isArray(roomElements)) return null;
    return roomElements.find(el => el?.type === 'projector') || null;
  }, [roomElements]);

  // Riser element from roomElements
  const riserEl = useMemo(() => {
    if (!Array.isArray(roomElements)) return null;
    return roomElements.find(el => el?.type === 'riser') || null;
  }, [roomElements]);

  // Engineering drawing palette — premium technical style
  const ROOM_FILL = "#F4F3F0";
  const ROOM_STROKE = "#B0AEA8";  // lighter grey, less dominant
  const SCREEN_FILL = "#2C2C2C";
  const SCREEN_STROKE = "#1a1a1a";
  const SPEAKER_FILL = "#213428";
  const SPEAKER_STROKE = "#152420";
  const SUB_FILL = "#4A3B30";      // darker than before for contrast
  const SUB_STROKE = "#2E241D";
  const FLOOR_COLOR = "#8C8880";   // construction floor line
  const LABEL_COLOR = "#4A4540";
  const DIM_COLOR = "#9B9890";
  const PROJ_FILL = "#3E4349";
  const RISER_FILL = "rgba(180,170,160,0.18)";
  const RISER_STROKE = "#9B9890";

  /**
   * drawSpeakerFront — reusable helper for rendering a single speaker
   * in the XZ front-elevation plane.
   *
   * @param {string}  key    - React key
   * @param {number}  cx     - SVG centre X (pixels)
   * @param {number}  cy     - SVG centre Y (pixels, position.z mapped via ry)
   * @param {number}  sw     - rendered width in SVG pixels
   * @param {number}  sh     - rendered height in SVG pixels
   * @param {boolean} isRound - true → circle, false → rectangle
   * @param {string}  fill   - body fill colour
   * @param {string}  stroke - body stroke colour
   * @param {string}  label  - text label above speaker
   * @param {number}  zM     - acoustic centre height in metres (for z= annotation)
   * @param {boolean} labelInsideBox - if true, centre label inside the shape; if false, above
   */
  const drawSpeakerFront = ({ key, cx, cy, sw, sh, isRound, fill, stroke, label, zM, modelKey, labelInsideBox = false, onMouseDown }) => {
    const sx = cx - sw / 2;
    const sy = cy - sh / 2;

    // Detect Artcoustic models for face icon rendering
    const mk = modelKey || "";
    const isQ43 = mk.includes("q4-3");
    const isQ45 = mk.includes("q4-5");
    const isQ85 = mk.includes("q8-5");
    const isQ63 = mk.includes("q6-3");
    const isEv11 = mk.includes("evolve-1-1");
    const isEv21 = !isEv11 && mk.includes("evolve-2-1");
    const isEv31 = !isEv11 && mk.includes("evolve-3-1");
    const isEv42 = mk.includes("evolve-4-2");
    const isEv63 = !isEv31 && mk.includes("evolve-6-3");
    const isEv84 = mk.includes("evolve-8-4");
    const hasFaceIcon = isQ43 || isQ45 || isQ85 || isQ63 || isEv11 || isEv21 || isEv31 || isEv42 || isEv63 || isEv84;

    // Artcoustic PNG assets contain internal transparent padding; enlarge the icon so
    // the visible cabinet drawing fills the speaker boundary box with ~2–4px clearance.
    const FACE_ICON_VISIBLE_RATIO = 0.72;
    const adjustedW = hasFaceIcon ? sw / FACE_ICON_VISIBLE_RATIO : sw;
    const adjustedH = hasFaceIcon ? sh / FACE_ICON_VISIBLE_RATIO : sh;
    const adjustedX = hasFaceIcon ? sx - (adjustedW - sw) / 2 : sx;
    const adjustedY = hasFaceIcon ? sy - (adjustedH - sh) / 2 : sy;

    const renderFaceIcon = () => {
      if (isQ43) return <Q43FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isQ45) return <Q45FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isQ85) return <Q85FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isQ63) return <Q63FaceIcon x={adjustedX} y={adjustedY} size={Math.min(adjustedW, adjustedH)} />;
      if (isEv11) return <Evolve11FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isEv21) return <Evolve21FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isEv31) return <Evolve31FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isEv42) return <Evolve42FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isEv63) return <Evolve63FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isEv84) return <Evolve84FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      return null;
    };

    return (
      <g key={key} onMouseDown={onMouseDown} style={onMouseDown ? { cursor: 'grab', userSelect: 'none' } : undefined}>
        {/* Body */}
        {hasFaceIcon ? renderFaceIcon() : isRound ? (
          <circle cx={cx} cy={cy} r={Math.max(6, sw / 2)} fill={fill} stroke={stroke} strokeWidth={1.2} opacity={0.90} />
        ) : (
          <rect x={sx} y={sy} width={sw} height={sh} fill={fill} stroke={stroke} strokeWidth={1.2} rx={2} opacity={0.90} />
        )}
        {/* Acoustic centre dot — fallback only (face icons include their own markers) */}
        {!hasFaceIcon && <circle cx={cx} cy={cy} r={1.8} fill="rgba(255,255,255,0.55)" />}
        {/* Label: above for speakers, inside for subs */}
        {labelInsideBox ? (
          <text x={cx} y={cy + 3} textAnchor="middle" fontSize={9} fill={LABEL_COLOR} fontWeight={700} letterSpacing="0.04em" dominantBaseline="middle">
            {label}
          </text>
        ) : (
          <text x={cx} y={sy - 5} textAnchor="middle" fontSize={9} fill={LABEL_COLOR} fontWeight={700} letterSpacing="0.04em">
            {label}
          </text>
        )}
      </g>
    );
  };

  return (
    <div style={{ width: "100%", padding: 16, background: "#F8F8F7", boxSizing: "border-box" }}>
      {/* Responsive wrapper: aspect-ratio drives height from available width */}
      <div style={{ width: "100%", aspectRatio: `${SVG_W} / ${SVG_H}` }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Title */}
        <text x={offsetX + drawW / 2} y={14} textAnchor="middle" fontSize={10} fontWeight={600} fill={LABEL_COLOR} letterSpacing="0.06em">
          FRONT ELEVATION
        </text>

        {/* Room rectangle — lighter stroke, thinner */}
        <rect
          x={offsetX}
          y={offsetY}
          width={drawW}
          height={drawH}
          fill={ROOM_FILL}
          stroke={ROOM_STROKE}
          strokeWidth={0.8}
        />

        {/* Floor construction line */}
        <line
          x1={offsetX - 6}
          y1={offsetY + drawH}
          x2={offsetX + drawW + 6}
          y2={offsetY + drawH}
          stroke={FLOOR_COLOR}
          strokeWidth={2}
          strokeLinecap="square"
        />
        {/* Floor hatch marks (engineering convention) */}
        {Array.from({ length: Math.floor(drawW / 14) + 1 }, (_, i) => (
          <line
            key={`hatch-${i}`}
            x1={offsetX + i * 14}
            y1={offsetY + drawH}
            x2={offsetX + i * 14 - 6}
            y2={offsetY + drawH + 7}
            stroke={FLOOR_COLOR}
            strokeWidth={0.7}
            opacity={0.55}
          />
        ))}

        {/* Dimension: room width */}
        <line x1={offsetX} y1={offsetY - 10} x2={offsetX + drawW} y2={offsetY - 10} stroke={DIM_COLOR} strokeWidth={0.8} />
        <line x1={offsetX} y1={offsetY - 14} x2={offsetX} y2={offsetY - 6} stroke={DIM_COLOR} strokeWidth={0.8} />
        <line x1={offsetX + drawW} y1={offsetY - 14} x2={offsetX + drawW} y2={offsetY - 6} stroke={DIM_COLOR} strokeWidth={0.8} />
        <text x={offsetX + drawW / 2} y={offsetY - 13} textAnchor="middle" fontSize={9} fill={DIM_COLOR}>
          {roomW.toFixed(2)}m
        </text>

        {/* Dimension: room height (rotated left side) */}
        <line x1={offsetX - 10} y1={offsetY} x2={offsetX - 10} y2={offsetY + drawH} stroke={DIM_COLOR} strokeWidth={0.8} />
        <line x1={offsetX - 14} y1={offsetY} x2={offsetX - 6} y2={offsetY} stroke={DIM_COLOR} strokeWidth={0.8} />
        <line x1={offsetX - 14} y1={offsetY + drawH} x2={offsetX - 6} y2={offsetY + drawH} stroke={DIM_COLOR} strokeWidth={0.8} />
        <text
          x={offsetX - 18}
          y={offsetY + drawH / 2}
          textAnchor="middle"
          fontSize={9}
          fill={DIM_COLOR}
          transform={`rotate(-90, ${offsetX - 18}, ${offsetY + drawH / 2})`}
        >
          {roomH.toFixed(2)}m
        </text>

        {/* Screen: overall frame (black), then viewable area (white) */}
        {(() => {
          // Overall frame rect (viewable + border on all sides)
          const oW = (overallW / roomW) * drawW;
          const oH = (overallH / roomH) * drawH;
          const ox = rx(screenCenterX) - oW / 2;
          const oy = ry(screenFloorM + overallH);

          // Viewable rect
          const sw = (screenData.w / roomW) * drawW;
          const sh = (screenData.h / roomH) * drawH;
          const sx = rx(screenCenterX) - sw / 2;
          const sy = ry(screenFloorM + overallH - borderM) - (sh);
          // sy = top of viewable area in SVG coords
          const syTop = ry(screenFloorM + overallH - borderM);

          const labelViewable = `${(screenData.w * 100).toFixed(0)} × ${(screenData.h * 100).toFixed(0)} cm (viewable)`;
          const labelOverall = `${(overallW * 100).toFixed(0)} × ${(overallH * 100).toFixed(0)} cm overall${!hasBorderData ? ' (est. frame)' : ''}`;

          return (
            <g>
              {/* Black frame */}
              <rect x={ox} y={oy} width={oW} height={oH} fill={SCREEN_STROKE} stroke={SCREEN_STROKE} strokeWidth={1} rx={2} />
              {/* White viewable area */}
              <rect x={sx} y={syTop} width={sw} height={sh} fill="#fff" stroke="#555" strokeWidth={0.5} />
              {/* Screen labels: inside white area top-left if there is room, else below frame */}
              {sw >= 90 && sh >= 36 ? (
                // Enough room — render inside top-left of the white viewable area
                <g>
                  <text x={sx + 5} y={syTop + 11} textAnchor="start" fontSize={7} fill="#888">
                    {labelOverall}
                  </text>
                  <text x={sx + 5} y={syTop + 21} textAnchor="start" fontSize={7} fill="#444" fontWeight={600}>
                    {labelViewable}
                  </text>
                </g>
              ) : (
                // Too small — render below the frame, centred
                <g>
                  <text x={rx(screenCenterX)} y={oy + oH + 12} textAnchor="middle" fontSize={7} fill={DIM_COLOR}>
                    {labelOverall}
                  </text>
                  <text x={rx(screenCenterX)} y={oy + oH + 22} textAnchor="middle" fontSize={7} fill={LABEL_COLOR} fontWeight={600}>
                    {labelViewable}
                  </text>
                </g>
              )}
            </g>
          );
        })()}

        {/* ── drawSpeakerFront ─────────────────────────────────────────────────
           Internal helper: renders a single speaker in the XZ (front elevation)
           plane. rect for rectangular models, circle for round models.
           Designed to be the single rendering path for all front-stage speakers,
           ready to accept product SVG art in future without changing call sites.
           ──────────────────────────────────────────────────────────────────── */}

        {/* Riser outline if element exists */}
        {riserEl && (() => {
          const rW_m = Number(riserEl.length_m) || Number(riserEl.width) || roomW * 0.6;
          const rH_m = Number(riserEl.height_m) || 0.20;
          const rX_m = Number(riserEl.pos_m) || (roomW / 2 - rW_m / 2);
          const rPx_w = (rW_m / roomW) * drawW;
          const rPx_h = (rH_m / roomH) * drawH;
          return (
            <g opacity={0.9}>
              <rect
                x={rx(rX_m)}
                y={ry(rH_m)}
                width={rPx_w}
                height={rPx_h}
                fill={RISER_FILL}
                stroke={RISER_STROKE}
                strokeWidth={0.8}
                strokeDasharray="3 2"
              />
              <text x={rx(rX_m + rW_m / 2)} y={ry(rH_m) - 3} textAnchor="middle" fontSize={7} fill={DIM_COLOR} letterSpacing="0.05em">
                RISER
              </text>
            </g>
          );
        })()}

        {/* LCR Speakers — via drawSpeakerFront helper */}
        {(Array.isArray(lcrSpeakers) ? lcrSpeakers : []).map((spk) =>
          drawSpeakerFront({
            key: spk.role,
            cx: rx(spk.x),
            cy: ry(spk.z),
            sw: Math.max(12, (spk.wM / roomW) * drawW * 1.20),
            sh: Math.max(12, (spk.hM / roomH) * drawH * 1.20),
            isRound: spk.round === true,
            fill: SPEAKER_FILL,
            stroke: SPEAKER_STROKE,
            label: spk.label,
            zM: spk.z,
            modelKey: spk.modelKey ?? "",
            onMouseDown: onLcrSpeakerMoved ? (e) => handleLcrMouseDown(e, spk.role, spk.x, spk.z) : undefined,
          })
        )}

        {/* Front subwoofers — via drawSpeakerFront helper */}
        {(Array.isArray(subItems) ? subItems : []).map((sub, i) =>
          drawSpeakerFront({
            key: `sub-${i}`,
            cx: rx(sub.x),
            cy: ry(sub.z),
            sw: Math.max(12, (sub.wM / roomW) * drawW),
            sh: Math.max(12, (sub.hM / roomH) * drawH),
            isRound: false,
            fill: "#fff",
            stroke: "#4A4540",
            label: sub.label,
            zM: sub.z,
            labelInsideBox: true,
            onMouseDown: onFrontSubMoved ? (e) => handleSubMouseDown(e, i, sub.x, sub.z) : undefined,
          })
        )}

        {/* Projector element if present */}
        {projectorEl && (() => {
          const pX_m = Number.isFinite(Number(projectorEl.x_lens_m)) ? Number(projectorEl.x_lens_m) : (roomW / 2);
          const pZ_m = Number.isFinite(Number(projectorEl.z_lens_m)) ? Number(projectorEl.z_lens_m) : (roomH - 0.3);
          const pW_m = Number(projectorEl.body_width_m) || 0.35;
          const pD_m = Number(projectorEl.body_depth_m) || 0.25;
          const pW_px = Math.max(16, (pW_m / roomW) * drawW);
          const pD_px = Math.max(10, (pD_m / roomH) * drawH);
          const pX_px = rx(pX_m) - pW_px / 2;
          const pY_px = ry(pZ_m) - pD_px / 2;
          return (
            <g opacity={0.88}>
              <rect x={pX_px} y={pY_px} width={pW_px} height={pD_px} fill={PROJ_FILL} stroke="#222" strokeWidth={1} rx={2} />
              {/* Lens circle */}
              <circle cx={rx(pX_m)} cy={ry(pZ_m)} r={Math.max(3, pD_px * 0.28)} fill="#888" stroke="#555" strokeWidth={0.8} />
              <text x={rx(pX_m)} y={pY_px - 4} textAnchor="middle" fontSize={8} fill={DIM_COLOR} letterSpacing="0.05em">
                PROJ
              </text>
            </g>
          );
        })()}

        {/* Vertical alignment guide — visible only during vertical LCR drag, within 5 cm */}
        {alignGuide && (() => {
          const fc = lcrSpeakers.find(s => s.role === 'FC');
          const fl = lcrSpeakers.find(s => s.role === 'FL');
          if (!fc || !fl) return null;
          const isDraggingFC = alignGuide.draggingRole === 'FC';
          const fcZ = isDraggingFC ? alignGuide.liveZ : fc.z;
          const lrZ = (!isDraggingFC) ? alignGuide.liveZ : fl.z;
          const diffM = fcZ - lrZ; // positive = FC is higher than L/R
          if (Math.abs(diffM) > 0.05) return null; // outside 5 cm threshold — hide guide
          const diffCm = Math.round(diffM * 100);
          const isAligned = diffCm === 0;
          const fcY = ry(fcZ);
          const lrY = ry(lrZ);
          const x1 = offsetX + 8;
          const x2 = offsetX + drawW - 8;
          const midX = offsetX + drawW / 2;
          const labelY = (fcY + lrY) / 2;
          const guideColor = isAligned ? '#F59E0B' : '#6B7280';
          const label = isAligned ? 'Aligned' : diffCm > 0 ? `FC ${Math.abs(diffCm)} cm above` : `FC ${Math.abs(diffCm)} cm below`;
          return (
            <g key="align-guide" opacity={0.88}>
              {/* Guide line at L/R height */}
              <line x1={x1} y1={lrY} x2={x2} y2={lrY}
                stroke={guideColor} strokeWidth={isAligned ? 1.5 : 0.9}
                strokeDasharray={isAligned ? '5 2' : '4 3'} />
              {/* Guide line at FC height (only when not aligned) */}
              {!isAligned && (
                <line x1={x1} y1={fcY} x2={x2} y2={fcY}
                  stroke={guideColor} strokeWidth={0.9} strokeDasharray="4 3" />
              )}
              {/* Vertical callout between the two lines */}
              {!isAligned && (
                <line x1={midX} y1={Math.min(fcY, lrY)} x2={midX} y2={Math.max(fcY, lrY)}
                  stroke={guideColor} strokeWidth={0.8} />
              )}
              {/* Label background + text */}
              <rect x={midX - 32} y={labelY - 8} width={64} height={13} fill="white" opacity={0.9} rx={2} />
              <text x={midX} y={labelY + 2} textAnchor="middle" fontSize={8}
                fill={guideColor} fontWeight={isAligned ? 700 : 500}>{label}</text>
            </g>
          );
        })()}

        {/* Magnetic snap guide — visible only during active snap */}
        {activeSnap && (() => {
          const SNAP_COLOR = '#10B981';
          const dragRole = dragRef.current?.role;
          const draggedSpk = lcrSpeakers.find(s => s.role === dragRole);
          const sx = draggedSpk ? rx(draggedSpk.x) : offsetX + drawW / 2;
          const sz = draggedSpk ? ry(draggedSpk.z) : offsetY + drawH / 2;
          return (
            <g key="snap-guide" opacity={0.85}>
              {activeSnap.axis === 'x' && (
                <line x1={rx(activeSnap.value)} y1={offsetY} x2={rx(activeSnap.value)} y2={offsetY + drawH}
                  stroke={SNAP_COLOR} strokeWidth={1.2} strokeDasharray="6 3" />
              )}
              {activeSnap.axis === 'z' && (
                <line x1={offsetX} y1={ry(activeSnap.value)} x2={offsetX + drawW} y2={ry(activeSnap.value)}
                  stroke={SNAP_COLOR} strokeWidth={1.2} strokeDasharray="6 3" />
              )}
              <rect x={sx + 7} y={sz - 8} width={32} height={13} fill={SNAP_COLOR} rx={2} />
              <text x={sx + 23} y={sz + 2} textAnchor="middle" fontSize={7} fill="white" fontWeight={700} letterSpacing="0.06em">SNAP</text>
            </g>
          );
        })()}

        {/* Clash warning — amber popup when objects are within 50 mm */}
        {clashes.length > 0 && (() => {
          const warnW = 162;
          const warnH = 28 + clashes.length * 13;
          const wx = offsetX + drawW - warnW - 6;
          const wy = offsetY + 6;
          return (
            <g key="clash-warning" style={{ pointerEvents: 'none' }}>
              <rect x={wx} y={wy} width={warnW} height={warnH} rx={4}
                fill="#FFFBEB" stroke="#F59E0B" strokeWidth={1.2} />
              <text x={wx + warnW / 2} y={wy + 13} textAnchor="middle" fontSize={8} fill="#92400E" fontWeight={700}>
                ⚠ Speaker/subwoofer clash detected
              </text>
              {clashes.map((pair, ci) => (
                <text key={ci} x={wx + warnW / 2} y={wy + 24 + ci * 13} textAnchor="middle" fontSize={7} fill="#78350F">
                  {pair}
                </text>
              ))}
            </g>
          );
        })()}

        {/* Empty state hint */}
        {lcrSpeakers.length === 0 && frontSubs.length === 0 && (
          <text x={offsetX + drawW / 2} y={offsetY + drawH / 2} textAnchor="middle" fontSize={11} fill={DIM_COLOR}>
            Add speakers in the Controls panel
          </text>
        )}
      </svg>
      </div>
    </div>
  );
}