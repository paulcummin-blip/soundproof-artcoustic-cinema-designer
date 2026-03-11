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
  useEffect(() => {
    if (isAnyDraggingRef.current) return;
    if (!onSetSpeakers || !placedSpeakers?.length) return;

    const W = widthM || 0;
    const L = lengthM || 0;
    if (!(W > 0 && L > 0)) return;

    // Compute the canonical Y midpoint for side surrounds
    // Use sideSurroundVisualSpanM when available (same logic as resetSideSurroundsToDefault)
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

        // Detect ALL wall-mounted surrounds:
        // - Side surrounds: SL/SR/SL2/SR2/SL3/SR3...
        // - Front Wides: LW/RW
        // - Rear surrounds: SBL/SBR
        const extraSurroundPattern = /^(SL|SR)\d*$/;
        const isSideSurround = extraSurroundPattern.test(canon);
        const isFrontWide = (canon === 'LW' || canon === 'RW');
        const isRearSurround = (canon === 'SBL' || canon === 'SBR');

        // Process ALL wall-mounted surrounds
        if (!isSideSurround && !isFrontWide && !isRearSurround) return spk;
        if (!spk.position || !spk.model) return spk;

        // [B44 POSITION LOCK] Skip user-positioned speakers (they've been manually placed)
        if (spk.positionSource === 'user') return spk;

        // Get speaker icon dimensions
        const dims = getModelDimsM(spk.model);

        // Compute the live yaw exactly as the renderer does — this accounts for
        // "aim at MLP" mode and produces the correct rotated half-extent.
        const liveYaw = getPlanAimDeg(
          spk,
          mlp || null,
          W,
          L,
          false,              // aimLeftRightAtMLP — only for LCR, not used here
          aimFrontWidesAtMLP || false,
          aimSideSurroundsAtMLP || false,
          aimRearSurroundsAtMLP || false,
          lcrAngleInfo || null,
        );

        let targetX = spk.position.x; // Default: keep current X
        let targetY = spk.position.y; // Default: keep current Y

        // Side wall speakers: snap X to wall using live yaw, and Y to span midpoint
        if (isSideSurround || isFrontWide) {
          const isLeft = canon.startsWith('SL') || canon === 'LW';
          targetX = sideWallX(W, dims, isLeft ? 'L' : 'R', liveYaw);
          // For SL/SR only: also snap Y to the canonical midpoint (not seed position)
          if (isSideSurround) {
            targetY = sideSurroundDefaultY;
          }
        }

        // Rear wall speakers: icon edge 1cm from wall, using live yaw
        if (isRearSurround) {
          targetY = rearWallY(L, dims, liveYaw);
        }

        const currentX = Number(spk.position.x) || 0;
        const currentY = Number(spk.position.y) || 0;

        // Only update if position has actually changed (prevents jitter)
        if (Math.abs(currentX - targetX) > 0.001 || Math.abs(currentY - targetY) > 0.001) {
          changed = true;
          return {
            ...spk,
            position: { ...spk.position, x: targetX, y: targetY }
          };
        }

        return spk;
      });

      return changed ? next : prev;
    });
  }, [widthM, lengthM, placedSpeakers, onSetSpeakers, getModelDimsM, getCanonicalRole,
      mlp, aimSideSurroundsAtMLP, aimRearSurroundsAtMLP, aimFrontWidesAtMLP, lcrAngleInfo]);
}