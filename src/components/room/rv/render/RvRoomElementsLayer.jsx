"use client";

export default function RvRoomElementsLayer({
  hasRoomRect,
  roomElements,
  widthM,
  lengthM,
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

  const LABEL_INSET_M = 0.10;   // 10cm inside the room

  const normalizeElement = (el) => {
    // --- PROJECTOR: dedicated branch ---
    if (el?.type === 'projector') {
      const bodyW = Number(el?.body_width_m) || Number(el?.length_m) || 0.46;
      const bodyD = Number(el?.body_depth_m) || Number(el?.thickness_m) || 0.517;
      const lensX = Number.isFinite(Number(el?.x_lens_m)) ? Number(el.x_lens_m) : (Number(el?.pos_m) || 0) + bodyW / 2;
      const lensY = Number.isFinite(Number(el?.y_lens_m)) ? Number(el.y_lens_m) : null;

      // For rear-wall rendering: rectM.y = lengthM - T - offsetM
      // We want the body front edge at lensY - bodyD/2 (body centred on lens Y in plan)
      // So: offsetM = lengthM - (lensY - bodyD/2) - bodyD
      //             = lengthM - lensY - bodyD/2
      // We'll pass lensY as a special field and compute offsetM in the render block.
      // The body left edge in X is lensX - bodyW/2.
      const posM = lensX - bodyW / 2; // left edge of body in room X coords
      const label = String(el?.label || '').trim();

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

    const posFrontRear =
      n(el?.pos_m) ??
      n(el?.x_m) ??
      n(el?.x_position) ??
      n(el?.y_m) ??
      n(el?.y_position) ??
      0;

    const posLeftRight =
      n(el?.pos_m) ??
      n(el?.y_m) ??
      n(el?.y_position) ??
      n(el?.x_m) ??
      n(el?.x_position) ??
      0;

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

        if (e.wall === 'front') {
          rectM = { x: p, y: offset, w: L, h: T };
        } else if (e.wall === 'rear') {
          // Projector: position body so it is centred on lensY in plan view
          if (element?.type === 'projector' && Number.isFinite(e.__lensY)) {
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

        const WARN_M = 0.05;
        const warnRectM = {
          x: rectM.x - WARN_M,
          y: rectM.y - WARN_M,
          w: rectM.w + 2 * WARN_M,
          h: rectM.h + 2 * WARN_M,
        };

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

        const isNearSpeaker = speakersForCollision
          .map(getSpeakerAabbM)
          .filter(Boolean)
          .some((aabb) => intersects(warnRectM, aabb));

        const NORMAL_FILL = 'rgba(220,219,214,0.45)';
        const NORMAL_STROKE = 'rgba(27,26,26,0.55)';
        const WARN_FILL = 'rgba(199,106,27,0.28)';
        const WARN_STROKE = '#C76A1B';

        const fill = isNearSpeaker ? WARN_FILL : NORMAL_FILL;
        const stroke = isNearSpeaker ? WARN_STROKE : NORMAL_STROKE;

        // Label: 0.10m from the element body, centred on the element
        let labelXM, labelYM, labelRotate = 0;

        if (element?.type === 'projector') {
          // Projector: label sits 0.10m to the LEFT of the body, vertically centred, rotated 90°
          labelXM = rectM.x - LABEL_INSET_M;
          labelYM = rectM.y + rectM.h / 2;
          labelRotate = -90;
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
            onMouseDown={onDown}
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
              vectorEffect="non-scaling-stroke"
              pointerEvents={isDraggable ? 'all' : 'none'}
            />
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