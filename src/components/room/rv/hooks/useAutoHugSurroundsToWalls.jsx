import { useEffect } from "react";
import { sideWallX, rearWallY } from "@/components/room/rv/utils/rvGeometry";
import { getPlanAimDeg } from "@/components/room/rv/utils/rvAiming";

/**
 * useAutoHugSurroundsToWalls
 * Auto-hugs wall-mounted surround speakers (SL/SR/LW/RW/SBL/SBR) to their
 * respective walls whenever room dimensions or speaker list changes.
 * Respects the drag guard and user-positioned lock.
 *
 * Uses the same live yaw as the renderer (getPlanAimDeg) to compute the
 * rotated half-extent toward the wall, preventing any aimed speaker from
 * visually crossing the wall boundary.
 */
export function useAutoHugSurroundsToWalls({
  placedSpeakers,
  widthM,
  lengthM,
  onSetSpeakers,
  isAnyDraggingRef,
  getCanonicalRole,
  getModelDimsM,
  sideSurroundVisualSpanM, // optional: {minY, maxY} from useRoomGeometry
  // Aiming props — same values used by RvSpeakerLayer / getPlanAimDeg
  mlp,
  aimSideSurroundsAtMLP,
  aimRearSurroundsAtMLP,
  aimFrontWidesAtMLP,
  lcrAngleInfo,
}) {
  // ── Effect 1: Side surrounds (SL/SR/SL2/SR2...) and rear surrounds (SBL/SBR) ──
  // Depends on aimSideSurroundsAtMLP. Front Wides are intentionally excluded here
  // so that toggling side surround aiming never repositions LW/RW.
  useEffect(() => {
    if (isAnyDraggingRef.current) return;
    if (!onSetSpeakers || !placedSpeakers?.length) return;

    const W = widthM || 0;
    const L = lengthM || 0;
    if (!(W > 0 && L > 0)) return;

    const yMin_center = Number(sideSurroundVisualSpanM?.minY);
    const yMax_center = Number(sideSurroundVisualSpanM?.maxY);
    const sideSurroundDefaultY = (Number.isFinite(yMin_center) && Number.isFinite(yMax_center) && yMax_center > yMin_center)
      ? (yMin_center + yMax_center) / 2
      : L / 2;

    onSetSpeakers(prev => {
      if (!Array.isArray(prev) || !prev.length) return prev;

      let changed = false;
      const next = prev.map(spk => {
        const canon = getCanonicalRole(spk.role);

        const extraSurroundPattern = /^(SL|SR)\d*$/;
        const isSideSurround = extraSurroundPattern.test(canon);
        const isRearSurround = (canon === 'SBL' || canon === 'SBR');

        // Front Wides (LW/RW) are handled in their own separate effect below
        if (!isSideSurround && !isRearSurround) return spk;
        if (!spk.position || !spk.model) return spk;
        if (spk.positionSource === 'user') return spk;

        const dims = getModelDimsM(spk.model);
        const liveYaw = getPlanAimDeg(
          { x: spk.position?.x, y: spk.position?.y, role: spk.role },
          mlp || null,
          W, L,
          false,
          false,                          // aimFrontWidesAtMLP — not relevant here
          aimSideSurroundsAtMLP || false,
          aimRearSurroundsAtMLP || false,
          lcrAngleInfo || null,
        );

        let targetX = spk.position.x;
        let targetY = spk.position.y;

        if (isSideSurround) {
          const isLeft = canon.startsWith('SL');
          targetX = sideWallX(W, dims, isLeft ? 'L' : 'R', liveYaw);
          targetY = sideSurroundDefaultY;
        }

        if (isRearSurround) {
          targetY = rearWallY(L, dims, liveYaw);
        }

        const currentX = Number(spk.position.x) || 0;
        const currentY = Number(spk.position.y) || 0;

        if (Math.abs(currentX - targetX) > 0.001 || Math.abs(currentY - targetY) > 0.001) {
          changed = true;
          return { ...spk, position: { ...spk.position, x: targetX, y: targetY } };
        }

        return spk;
      });

      return changed ? next : prev;
    });
  }, [widthM, lengthM, placedSpeakers, onSetSpeakers, getModelDimsM, getCanonicalRole,
      mlp, aimSideSurroundsAtMLP, aimRearSurroundsAtMLP, lcrAngleInfo,
      sideSurroundVisualSpanM]);

  // ── Effect 2: Front Wides (LW/RW) only ──
  // Depends on aimFrontWidesAtMLP. Completely decoupled from aimSideSurroundsAtMLP
  // so toggling side surround aiming never repositions LW/RW or invalidates
  // the front wide zone overlay.
  useEffect(() => {
    if (isAnyDraggingRef.current) return;
    if (!onSetSpeakers || !placedSpeakers?.length) return;

    const W = widthM || 0;
    const L = lengthM || 0;
    if (!(W > 0 && L > 0)) return;

    onSetSpeakers(prev => {
      if (!Array.isArray(prev) || !prev.length) return prev;

      let changed = false;
      const next = prev.map(spk => {
        const canon = getCanonicalRole(spk.role);

        const isFrontWide = (canon === 'LW' || canon === 'RW');
        if (!isFrontWide) return spk;
        if (!spk.position || !spk.model) return spk;
        if (spk.positionSource === 'user') return spk;

        const dims = getModelDimsM(spk.model);
        const liveYaw = getPlanAimDeg(
          { x: spk.position?.x, y: spk.position?.y, role: spk.role },
          mlp || null,
          W, L,
          false,
          aimFrontWidesAtMLP || false,
          false,                          // aimSideSurroundsAtMLP — not relevant here
          false,                          // aimRearSurroundsAtMLP — not relevant here
          lcrAngleInfo || null,
        );

        const isLeft = (canon === 'LW');
        const targetX = sideWallX(W, dims, isLeft ? 'L' : 'R', liveYaw);
        const targetY = spk.position.y; // Front Wides keep their Y (user-draggable along wall)

        const currentX = Number(spk.position.x) || 0;

        if (Math.abs(currentX - targetX) > 0.001) {
          changed = true;
          return { ...spk, position: { ...spk.position, x: targetX } };
        }

        return spk;
      });

      return changed ? next : prev;
    });
  }, [widthM, lengthM, placedSpeakers, onSetSpeakers, getModelDimsM, getCanonicalRole,
      mlp, aimFrontWidesAtMLP, lcrAngleInfo]);
}