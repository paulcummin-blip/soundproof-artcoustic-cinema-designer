"use client";

import { resolveProjectorPosition } from "@/components/room/rv/utils/resolveProjectorPosition";
import {
  skylightRectM,
  skylightClashingSpeakers,
} from "@/components/room/rv/utils/skylightGeometry";

export default function RvRoomElementsLayer({
  hasRoomRect,
  roomElements,
  widthM,
  lengthM,
  heightM,
  scale,
  meterToCanvasX,
  meterToCanvasY,
  placedSpeakers,
  getModelDimsM,
  getSpeakerVisibility,
  getCanonicalRole,
  appState,
  rolesForLayout,
  handleMouseDown,
}) {
  if (!hasRoomRect) return null;

  // Canonical projector position — shared resolver consumed by both
  // Plan View and Side Elevation so they can never diverge.
  const projectorPos = resolveProjectorPosition(roomElements, { widthM, lengthM });

  const LABEL_INSET_M = 0.10;   // 10cm inside the room

  const normalizeElement = (el) => {
    // --- PROJECTOR: dedicated branch ---
    if (el?.type === 'projector') {
      // Consume the shared resolver — body centred on lensY in plan view.
      const label = String(el?.label || '').trim();
      const bodyW = projectorPos?.bodyWidthM ?? (Number(el?.body_width_m) || Number(el?.length_m) || 0.46);
      const bodyD = projectorPos?.bodyDepthM ?? (Number(el?.body_depth_m) || Number(el?.thickness_m) || 0.517);
      const posM = projectorPos?.bodyLeftX ?? (Number.isFinite(Number(el?.x_lens_m)) ? Number(el.x_lens_m) : (Number(el?.pos_m) || 0) + bodyW / 2) - bodyW / 2;
      const lensY = projectorPos?.lensY ?? (Number.isFinite(Number(el?.y_lens_m)) ? Number(el.y_lens_m) : null);

      return {
        ...el,
        wall: 'rear',
        __lengthM: bodyW,
        __thicknessM: bodyD,
        __posM: posM,
        __offsetM: 0,          // unused for projector; lensY is used below
        __lensY: lensY,        // carry lensY so rectM.y can be computed correctly
        __label: label,
      };
    }

    // --- SKYLIGHT: ceiling-mounted, plan X/Y + opening size ---
    if (el?.type === 'skylight') {
      const skylRect = skylightRectM(el, { widthM, lengthM });
      return {
        ...el,
        surface: 'ceiling',
        __lengthM: skylRect.w,
        __widthM: skylRect.h,
        __cx: skylRect.x + skylRect.w / 2,
        __cy: skylRect.y + skylRect.h / 2,
        __label: String(el?.label || '').trim(),
      };
    }

    // --- GENERIC elements ---
    const wallRaw = String(el?.wall || el?.side || 'front').toLowerCase();
    const wall =
      wallRaw === 'back' ? 'rear' :
      wallRaw === 'rear' ? 'rear' :
      wallRaw === 'front' ? 'front' :
      wallRaw === 'left' ? 'left' :
      wallRaw === 'right' ? 'right' : 'front';

    const lengthMVal =
      Number(el?.length_m) ||
      Number(el?.lengthM) ||
      Number(el?.width) ||
      0.9;

    const thicknessM =
      Number(el?.thickness_m) ||
      Number(el?.thicknessM) ||
      0.05;

    const offsetM = Math.max(0, Number(el?.wall_offset_m) || 0);

    const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

    const isNorm = (v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1;

    let posFrontRear;
    if (Number.isFinite(n(el?.pos_m))) {
      posFrontRear = n(el.pos_m);
    } else if (Number.isFinite(n(el?.x_m))) {
      posFrontRear = n(el.x_m);
    } else if (isNorm(el?.x_position)) {
      posFrontRear = Number(el.x_position) * widthM;
    } else {
      posFrontRear = 0;
    }

    let posLeftRight;
    if (Number.isFinite(n(el?.pos_m))) {
      posLeftRight = n(el.pos_m);
    } else if (Number.isFinite(n(el?.y_m))) {
      posLeftRight = n(el.y_m);
    } else if (isNorm(el?.y_position)) {
      posLeftRight = Number(el.y_position) * lengthM;
    } else if (isNorm(el?.x_position)) {
      posLeftRight = Number(el.x_position) * lengthM;
    } else {
      posLeftRight = 0;
    }

    const posM = (wall === 'left' || wall === 'right') ? posLeftRight : posFrontRear;
    const label = String(el?.label || '').trim();

    return {
      ...el,
      wall,
      __lengthM: lengthMVal,
      __thicknessM: thicknessM,
      __posM: posM,
      __offsetM: offsetM,
      __label: label,
    };
  };

  if (!Array.isArray(roomElements) || roomElements.length === 0) return null;

  const rawSpeakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];

  // Build a collision list that matches what is actually RENDERED
  const speakerSystem = appState?.speakerSystem;
  const sevenBedLayoutType = appState?.sevenBedLayoutType;

  const layoutRaw =
    speakerSystem?.dolbyLayout ??
    speakerSystem?.dolbyPreset ??
    appState?.dolbyLayout ??
    "5.1";

  const layoutKey =
    (typeof layoutRaw === "string" ? layoutRaw : layoutRaw?.layout || "5.1")
      .toString()
      .trim()
      .split(" ")[0]
      .split("_")[0];

  const useWidesInsteadOfRears =
    !!speakerSystem?.useWidesInsteadOfRears ||
    speakerSystem?.sevenBedLayoutType === "wides" ||
    sevenBedLayoutType === "wides" ||
    false;

  const allowedRoles = new Set(
    rolesForLayout({
      dolbyLayout: layoutKey,
      useWidesInsteadOfRears: !!useWidesInsteadOfRears,
    })
  );

  const isRenderableSpeaker = (s) => {
    if (!s?.position) return false;
    const x = Number(s.position.x);
    const y = Number(s.position.y);
    return Number.isFinite(x) && Number.isFinite(y);
  };

  const speakersForCollision = rawSpeakers
    .filter(isRenderableSpeaker)
    .filter((s) => {
      const canon = getCanonicalRole(s?.role);

      if (canon === "LFE") return false;

      const extraSurroundPattern = /^(SL|SR)\d+$/;
      const isExtraSurround = extraSurroundPattern.test(canon);
      if (isExtraSurround) {
        return allowedRoles.has("SL") || allowedRoles.has("SR");
      }

      if (["SL","SR","SBL","SBR","LW","RW"].includes(canon)) {
        return allowedRoles.has(canon);
      }

      return getSpeakerVisibility(s.role, s.model);
    });

  return (
    <g data-layer="room-elements">
      {roomElements.map((element, idx) => {
        const e = normalizeElement(element);

        const L = Math.max(0.01, Number(e.__lengthM) || 0.9);
        const T = Math.max(0.01, Number(e.__thicknessM) || 0.05);
        const offset = Math.max(0, Number(e.__offsetM) || 0);
        
        const rawP = Number(e.__posM) || 0;

        const maxP =
          (e.wall === 'left' || e.wall === 'right')
            ? Math.max(0, lengthM - L)
            : Math.max(0, widthM - L);

        const p = Math.max(0, Math.min(rawP, maxP));

        let rectM = { x: 0, y: 0, w: 0, h: 0 };

        if (element?.type === 'skylight') {
          // Ceiling skylight: rectangle centred at (cx, cy) in plan space.
          const W = Math.max(0.01, Number(e.__widthM) || 0);
          rectM = { x: Number(e.__cx) - L / 2, y: Number(e.__cy) - W / 2, w: L, h: W };
        } else if (e.wall === 'front') {
          rectM = { x: p, y: offset, w: L, h: T };
        } else if (e.wall === 'rear') {
          // Projector: consume shared resolver for body-front Y (centred on lensY)
          if (element?.type === 'projector' && projectorPos?.bodyFrontY !== null && projectorPos?.bodyFrontY !== undefined) {
            rectM = { x: p, y: projectorPos.bodyFrontY, w: L, h: T };
          } else if (element?.type === 'projector' && Number.isFinite(e.__lensY)) {
            const bodyFrontY = e.__lensY - T / 2;
            rectM = { x: p, y: bodyFrontY, w: L, h: T };
          } else {
            rectM = { x: p, y: lengthM - T - offset, w: L, h: T };
          }
        } else if (e.wall === 'left') {
          rectM = { x: offset, y: p, w: T, h: L };
        } else if (e.wall === 'right') {
          rectM = { x: widthM - T - offset, y: p, w: T, h: L };
        }

        const intersects = (a, b) =>
          a.x < b.x + b.w &&
          a.x + a.w > b.x &&
          a.y < b.y + b.h &&
          a.y + a.h > b.y;

        const getSpeakerAabbM = (sp) => {
          if (!sp?.position) return null;
          const x = Number(sp.position.x);
          const y = Number(sp.position.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

          const dims = getModelDimsM?.(sp.model) || {};
          const w = Math.max(0.01, Number(dims.widthM) || 0.2);
          const d = Math.max(0.01, Number(dims.depthM) || 0.2);

          return { x: x - w / 2, y: y - d / 2, w, h: d };
        };

        const isSkylight = element?.type === 'skylight';

        // Skylights only clash with in-ceiling (overhead) speakers whose plan
        // footprint overlaps the opening. Wall elements keep their existing
        // proximity-based warning against all renderable speakers.
        const skylightClashes = isSkylight
          ? skylightClashingSpeakers(speakersForCollision, rectM, { heightM, getModelDimsM })
          : [];

        const isNearSpeaker = isSkylight
          ? skylightClashes.length > 0
          : (() => {
              const WARN_M = 0.05;
              const warnRectM = {
                x: rectM.x - WARN_M,
                y: rectM.y - WARN_M,
                w: rectM.w + 2 * WARN_M,
                h: rectM.h + 2 * WARN_M,
              };
              return speakersForCollision
                .map(getSpeakerAabbM)
                .filter(Boolean)
                .some((aabb) => intersects(warnRectM, aabb));
            })();

        const NORMAL_FILL = 'rgba(220,219,214,0.45)';
        const NORMAL_STROKE = 'rgba(27,26,26,0.55)';
        const WARN_FILL = 'rgba(199,106,27,0.28)';
        const WARN_STROKE = '#C76A1B';
        // Skylights read as ceiling openings: a lighter, sky-tinted fill with a
        // dashed outline so they are never confused with solid wall elements.
        const SKYLIGHT_FILL = 'rgba(91,143,168,0.18)';
        const SKYLIGHT_STROKE = 'rgba(46,90,110,0.7)';

        const fill = isSkylight
          ? (isNearSpeaker ? WARN_FILL : SKYLIGHT_FILL)
          : (isNearSpeaker ? WARN_FILL : NORMAL_FILL);
        const stroke = isSkylight
          ? (isNearSpeaker ? WARN_STROKE : SKYLIGHT_STROKE)
          : (isNearSpeaker ? WARN_STROKE : NORMAL_STROKE);
        const strokeDash = isSkylight ? '6 4' : undefined;

        // Label: 0.10m from the element body, centred on the element
        let labelXM, labelYM, labelRotate = 0;

        if (element?.type === 'projector') {
          // Projector: label sits 0.10m to the LEFT of the body, vertically centred, rotated 90°
          labelXM = rectM.x - LABEL_INSET_M;
          labelYM = rectM.y + rectM.h / 2;
          labelRotate = -90;
        } else if (element?.type === 'skylight') {
          // Skylight: label centred on the opening.
          labelXM = rectM.x + rectM.w / 2;
          labelYM = rectM.y + rectM.h / 2;
        } else if (e.wall === 'front') {
          labelXM = rectM.x + rectM.w / 2;
          labelYM = LABEL_INSET_M;
        } else if (e.wall === 'rear') {
          labelXM = rectM.x + rectM.w / 2;
          labelYM = lengthM - LABEL_INSET_M;
        } else if (e.wall === 'left') {
          labelXM = LABEL_INSET_M;
          labelYM = rectM.y + rectM.h / 2;
          labelRotate = -90;
        } else if (e.wall === 'right') {
          labelXM = widthM - LABEL_INSET_M;
          labelYM = rectM.y + rectM.h / 2;
          labelRotate = 90;
        }

        // Clamp to room interior
        labelXM = Math.max(LABEL_INSET_M, Math.min(widthM - LABEL_INSET_M, labelXM));
        labelYM = Math.max(LABEL_INSET_M, Math.min(lengthM - LABEL_INSET_M, labelYM));

        const xPx = meterToCanvasX(rectM.x);
        const yPx = meterToCanvasY(rectM.y);
        const wPx = rectM.w * scale;
        const hPx = rectM.h * scale;

        const labelXpx = meterToCanvasX(labelXM);
        const labelYpx = meterToCanvasY(labelYM);

        const label = String(e.__label || `Element ${idx + 1}`);

        const isProjector = element?.type === 'projector';
        const isGenericEl = !isProjector;
        const dragId = element?.id ?? `el-${idx}`;
        const isDraggable = !!handleMouseDown;

        const onDown = isDraggable ? (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          handleMouseDown(ev, dragId, isProjector ? 'projector' : 'roomElement');
        } : undefined;

        return (
          <g
            key={String(dragId)}
            style={isDraggable ? { cursor: 'grab', pointerEvents: 'all' } : undefined}
            onPointerDown={isSkylight ? onDown : undefined}
            onMouseDown={isSkylight ? undefined : onDown}
          >
            {/* Larger invisible hit target for easier grabbing */}
            {isGenericEl && isDraggable && (
              <rect
                x={xPx - 6}
                y={yPx - 6}
                width={Math.max(0, wPx + 12)}
                height={Math.max(0, hPx + 12)}
                fill="transparent"
                stroke="none"
                pointerEvents="all"
              />
            )}
            <rect
              x={xPx}
              y={yPx}
              width={Math.max(0, wPx)}
              height={Math.max(0, hPx)}
              fill={fill}
              stroke={stroke}
              strokeWidth={2}
              strokeDasharray={strokeDash}
              vectorEffect="non-scaling-stroke"
              pointerEvents={isDraggable ? 'all' : 'none'}
            />
            {/* Orange clash markers on in-ceiling speakers overlapping this skylight */}
            {isSkylight && skylightClashes.map(({ x, y, aabb }) => {
              const rPx = Math.max(4, Math.min(aabb.w, aabb.h) * scale * 0.6);
              return (
                <circle
                  key={`clash-${String(dragId)}-${x}-${y}`}
                  cx={meterToCanvasX(x)}
                  cy={meterToCanvasY(y)}
                  r={rPx}
                  fill="rgba(199,106,27,0.30)"
                  stroke="#C76A1B"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              );
            })}
          <text
              x={labelXpx}
              y={labelYpx}
              fill="#1B1A1A"
              fillOpacity={0.9}
              fontSize={11}
              fontWeight={700}
              style={{ userSelect: 'none' }}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={labelRotate !== 0 ? `rotate(${labelRotate}, ${labelXpx}, ${labelYpx})` : undefined}
              pointerEvents="none"
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}