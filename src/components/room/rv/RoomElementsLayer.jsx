import React, { useCallback } from "react";
import { rolesForLayout } from "@/components/utils/surroundRoleMap";

/**
 * RoomElementsLayer – renders door/window/fireplace/built-in elements on the room walls
 * with proximity-to-speaker collision warning colouring.
 */
export default function RoomElementsLayer({
  roomElements,
  widthM,
  lengthM,
  scale,
  meterToCanvasX,
  meterToCanvasY,
  placedSpeakers,
  dolbyLayout,
  appState,
  getModelDimsM,
  getSpeakerVisibility,
  getCanonicalRole,
  isRenderableSpeaker,
}) {
  if (!Array.isArray(roomElements) || roomElements.length === 0) return null;

  const LABEL_INSET_M = 0.10;

  const normalizeElement = (el) => {
    const wallRaw = String(el?.wall || el?.side || 'front').toLowerCase();
    const wall = wallRaw === 'back' ? 'rear' : ['rear','front','left','right'].includes(wallRaw) ? wallRaw : 'front';

    const elLengthM = Number(el?.length_m) || Number(el?.lengthM) || Number(el?.width) || 0.9;
    const thicknessM = Number(el?.thickness_m) || Number(el?.thicknessM) || 0.05;
    const offsetM = Math.max(0, Number(el?.wall_offset_m) || 0);

    const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
    const posFrontRear = n(el?.pos_m) ?? n(el?.x_m) ?? n(el?.x_position) ?? n(el?.y_m) ?? n(el?.y_position) ?? 0;
    const posLeftRight = n(el?.pos_m) ?? n(el?.y_m) ?? n(el?.y_position) ?? n(el?.x_m) ?? n(el?.x_position) ?? 0;
    const posM = (wall === 'left' || wall === 'right') ? posLeftRight : posFrontRear;

    return {
      ...el,
      wall,
      __lengthM: elLengthM,
      __thicknessM: thicknessM,
      __posM: posM,
      __offsetM: offsetM,
      __label: String(el?.label || '').trim(),
    };
  };

  // Build allowed roles for collision filter
  const speakerSystem = appState?.speakerSystem;
  const sevenBedLayoutType = appState?.sevenBedLayoutType;
  const layoutRaw = speakerSystem?.dolbyLayout ?? speakerSystem?.dolbyPreset ?? dolbyLayout ?? "5.1";
  const layoutKey = (typeof layoutRaw === "string" ? layoutRaw : layoutRaw?.layout || "5.1").toString().trim().split(" ")[0].split("_")[0];
  const useWides = !!speakerSystem?.useWidesInsteadOfRears || speakerSystem?.sevenBedLayoutType === "wides" || sevenBedLayoutType === "wides" || false;
  const allowedRoles = new Set(rolesForLayout({ dolbyLayout: layoutKey, useWidesInsteadOfRears: useWides }));

  const extraSurroundPattern = /^(SL|SR)\d+$/;
  const speakersForCollision = (Array.isArray(placedSpeakers) ? placedSpeakers : [])
    .filter(isRenderableSpeaker)
    .filter((s) => {
      const canon = getCanonicalRole(s?.role);
      if (canon === "LFE") return false;
      if (extraSurroundPattern.test(canon)) return allowedRoles.has("SL") || allowedRoles.has("SR");
      if (["SL","SR","SBL","SBR","LW","RW"].includes(canon)) return allowedRoles.has(canon);
      return getSpeakerVisibility(s.role, s.model);
    });

  const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  const getSpeakerAabbM = (sp) => {
    if (!sp?.position) return null;
    const x = Number(sp.position.x), y = Number(sp.position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const dims = getModelDimsM?.(sp.model) || {};
    const w = Math.max(0.01, Number(dims.widthM) || 0.2);
    const d = Math.max(0.01, Number(dims.depthM) || 0.2);
    return { x: x - w / 2, y: y - d / 2, w, h: d };
  };

  return (
    <g data-layer="room-elements" pointerEvents="none">
      {roomElements.map((element, idx) => {
        const e = normalizeElement(element);
        const L = Math.max(0.01, Number(e.__lengthM) || 0.9);
        const T = Math.max(0.01, Number(e.__thicknessM) || 0.05);
        const offset = Math.max(0, Number(e.__offsetM) || 0);
        const rawP = Number(e.__posM) || 0;
        const maxP = (e.wall === 'left' || e.wall === 'right') ? Math.max(0, lengthM - L) : Math.max(0, widthM - L);
        const p = Math.max(0, Math.min(rawP, maxP));

        let rectM = { x: 0, y: 0, w: 0, h: 0 };
        if (e.wall === 'front')       rectM = { x: p, y: offset, w: L, h: T };
        else if (e.wall === 'rear')   rectM = { x: p, y: lengthM - T - offset, w: L, h: T };
        else if (e.wall === 'left')   rectM = { x: offset, y: p, w: T, h: L };
        else if (e.wall === 'right')  rectM = { x: widthM - T - offset, y: p, w: T, h: L };

        const WARN_M = 0.05;
        const warnRectM = { x: rectM.x - WARN_M, y: rectM.y - WARN_M, w: rectM.w + 2 * WARN_M, h: rectM.h + 2 * WARN_M };
        const isNearSpeaker = speakersForCollision.map(getSpeakerAabbM).filter(Boolean).some((aabb) => intersects(warnRectM, aabb));

        const fill   = isNearSpeaker ? 'rgba(199,106,27,0.28)' : 'rgba(220,219,214,0.45)';
        const stroke = isNearSpeaker ? '#C76A1B' : 'rgba(27,26,26,0.55)';

        let labelXM = 0, labelYM = 0;
        if (e.wall === 'front')      { labelXM = rectM.x + 0.02; labelYM = rectM.y + T + LABEL_INSET_M; }
        else if (e.wall === 'rear')  { labelXM = rectM.x + 0.02; labelYM = rectM.y - LABEL_INSET_M; }
        else if (e.wall === 'left')  { labelXM = rectM.x + T + LABEL_INSET_M; labelYM = rectM.y + 0.18; }
        else if (e.wall === 'right') { labelXM = rectM.x - LABEL_INSET_M - 0.10; labelYM = rectM.y + 0.18; }

        return (
          <g key={String(element?.id ?? `el-${idx}`)}>
            <rect
              x={meterToCanvasX(rectM.x)} y={meterToCanvasY(rectM.y)}
              width={Math.max(0, rectM.w * scale)} height={Math.max(0, rectM.h * scale)}
              fill={fill} stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke"
            />
            <text
              x={meterToCanvasX(labelXM)} y={meterToCanvasY(labelYM)}
              fill="#1B1A1A" fillOpacity={0.9} fontSize={11} fontWeight={700}
              style={{ userSelect: 'none' }} textAnchor="end" dominantBaseline="hanging">
              {String(e.__label || `Element ${idx + 1}`)}
            </text>
          </g>
        );
      })}
    </g>
  );
}