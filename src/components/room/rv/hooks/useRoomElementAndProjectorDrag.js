/**
 * useRoomElementAndProjectorDrag.js
 *
 * Extracted from RoomVisualisation to keep it under the file size limit.
 * Contains handleRoomElementDrag and handleProjectorDrag — the existing
 * room element (door/window) and projector drag handlers. These do NOT
 * handle custom walls (those live in useCustomWallDrag).
 */

import { useCallback } from "react";
import { skylightRectM } from "@/components/room/rv/utils/skylightGeometry";

export function useRoomElementAndProjectorDrag({
  onSetRoomElements,
  roomElements,
  widthM,
  lengthM,
  screenFrontPlaneM,
  setRoomElementDragInfo,
  setProjectorDragInfo,
}) {
  const handleRoomElementDrag = useCallback((elementId, roomPos) => {
    if (!onSetRoomElements) return;
    const el = Array.isArray(roomElements)
      ? roomElements.find(re => String(re?.id) === String(elementId))
      : null;
    if (!el) return;
    if (el.type === 'skylight') {
      const rect = skylightRectM(el, { widthM, lengthM });
      const clampCentre = (value, span, roomSpan) => span > roomSpan
        ? roomSpan / 2
        : Math.max(span / 2, Math.min(roomSpan - span / 2, value));
      const x = clampCentre(roomPos.x, rect.w, widthM);
      const y = clampCentre(roomPos.y, rect.h, lengthM);
      setRoomElementDragInfo({
        visible: true, surface: 'ceiling',
        rectM: { x: x - rect.w / 2, y: y - rect.h / 2, w: rect.w, h: rect.h },
      });
      onSetRoomElements(prev =>
        (Array.isArray(prev) ? prev : []).map(re =>
          String(re?.id) === String(elementId) ? { ...re, x_m: x, y_m: y } : re
        )
      );
      return;
    }
    const wall = String(el?.wall || 'front').toLowerCase();
    const isFrontRear = wall === 'front' || wall === 'rear';
    const elLen = Number(el?.length_m) || 0.9;
    const wallLength = isFrontRear ? widthM : lengthM;
    const raw = isFrontRear ? roomPos.x : roomPos.y;
    const clamped = Math.max(0, Math.min(wallLength - elLen, raw - elLen / 2));
    const distA = clamped;
    const distB = Math.max(0, wallLength - elLen - clamped);
    setRoomElementDragInfo({
      visible: true, wall, posM: clamped, lengthM: elLen,
      distA, distB,
      labelA: isFrontRear ? 'Left Distance' : 'Front Distance',
      labelB: isFrontRear ? 'Right Distance' : 'Rear Distance',
    });
    onSetRoomElements(prev =>
      (Array.isArray(prev) ? prev : []).map(re =>
        String(re?.id) === String(elementId)
          ? { ...re, pos_m: clamped, x_m: clamped, y_m: clamped }
          : re
      )
    );
  }, [onSetRoomElements, roomElements, widthM, lengthM, setRoomElementDragInfo]);

  const handleProjectorDrag = useCallback((projectorId, roomPos) => {
    if (!onSetRoomElements) return;
    const rawY = roomPos.y;
    const projEl = Array.isArray(roomElements)
      ? roomElements.find(e => e?.type === 'projector')
      : null;
    const bodyD = Number(projEl?.body_depth_m) || 0.517;
    const halfD = bodyD / 2;
    const clampedY = Math.max(halfD, Math.min(lengthM - halfD, rawY));

    const lensX = Number(projEl?.x_lens_m) || (widthM / 2);
    const screenY = Number.isFinite(Number(screenFrontPlaneM)) ? Number(screenFrontPlaneM) : 0;
    const screenAtFront = screenY <= lengthM / 2;
    const frontFaceY = screenAtFront ? (clampedY - halfD) : (clampedY + halfD);
    const rearFaceY = screenAtFront ? (clampedY + halfD) : (clampedY - halfD);
    const rearWallY = screenAtFront ? lengthM : 0;
    const throwDist = Math.max(0, Math.abs(frontFaceY - screenY));
    const rearWallDist = Math.max(0, Math.abs(rearFaceY - rearWallY));
    setProjectorDragInfo({
      visible: true,
      x: lensX, y: clampedY, widthM, lengthM,
      distLeft: lensX,
      distRight: Math.max(0, widthM - lensX),
      screenY,
      frontFaceY,
      rearFaceY,
      rearWallY,
      throwDist,
      rearWallDist,
    });

    onSetRoomElements(prev =>
      (Array.isArray(prev) ? prev : []).map(el =>
        el?.type === 'projector' ? { ...el, y_lens_m: clampedY } : el
      )
    );
  }, [onSetRoomElements, roomElements, lengthM, widthM, screenFrontPlaneM, setProjectorDragInfo]);

  return { handleRoomElementDrag, handleProjectorDrag };
}