import { useEffect } from "react";
import { resolveWallHugTarget } from "@/components/room/placement/wallHugAuthority";

/**
 * useAutoHugSurroundsToWalls
 * Auto-hugs wall-mounted surround speakers (SL/SR/LW/RW/SBL/SBR) to their
 * respective walls whenever room dimensions or speaker list changes.
 * Respects the drag guard and user-positioned lock.
 *
 * The target itself comes from resolveWallHugTarget — the ONE wall authority,
 * shared with initial placement — so a newly installed speaker is already at
 * this position and this effect finds nothing to change. It remains the safety
 * net for room resizes, format changes and aim toggles.
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
        if (!spk.position || !spk.model) return spk;
        if (spk.positionSource === 'user') return spk;

        // Front Wides (LW/RW) are handled in their own separate effect below.
        const target = resolveWallHugTarget({
          role: spk.role,
          model: spk.model,
          roomDims: { widthM: W, lengthM: L },
          mlp,
          aimState: { aimSideSurroundsAtMLP, aimRearSurroundsAtMLP },
          lcrAngleInfo,
          sideSurroundDefaultY,
          position: spk.position,
          getModelDimsM,
          kinds: ['side', 'rear'],
        });
        if (!target) return spk;

        const currentX = Number(spk.position.x) || 0;
        const currentY = Number(spk.position.y) || 0;

        if (Math.abs(currentX - target.x) > 0.001 || Math.abs(currentY - target.y) > 0.001) {
          changed = true;
          return { ...spk, position: { ...spk.position, x: target.x, y: target.y } };
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
        if (!spk.position || !spk.model) return spk;
        if (spk.positionSource === 'user') return spk;

        // Front Wides keep their Y (user-draggable along the wall); only X is
        // wall-pinned, by the same authority the initial placement uses.
        const target = resolveWallHugTarget({
          role: spk.role,
          model: spk.model,
          roomDims: { widthM: W, lengthM: L },
          mlp,
          aimState: { aimFrontWidesAtMLP },
          lcrAngleInfo,
          position: spk.position,
          getModelDimsM,
          kinds: ['wide'],
        });
        if (!target) return spk;

        const currentX = Number(spk.position.x) || 0;

        if (Math.abs(currentX - target.x) > 0.001) {
          changed = true;
          return { ...spk, position: { ...spk.position, x: target.x } };
        }

        return spk;
      });

      return changed ? next : prev;
    });
  }, [widthM, lengthM, placedSpeakers, onSetSpeakers, getModelDimsM, getCanonicalRole,
      mlp, aimFrontWidesAtMLP, lcrAngleInfo]);
}