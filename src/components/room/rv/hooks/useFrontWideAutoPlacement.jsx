import { useEffect } from "react";
import { xHalfExtentSideWall } from "@/components/room/rv/utils/rvGeometry";

/**
 * useFrontWideAutoPlacement
 * Auto-positions front-wide speakers (LW/RW) to zone medians when zones change.
 * Respects user-locked positions and drag state guards.
 */
export function useFrontWideAutoPlacement({
  isAnyDraggingRef,
  isDraggingFW,
  placedSpeakers,
  widthM,
  lengthM,
  frontWideZones,
  speakersEpoch,
  fwOffsetRef,
  onSetSpeakers,
  getModelDimsM,
  getCanonicalRole,
  clamp,
  SIDE_ALLOW_OVERHANG,
}) {
  useEffect(() => {
    if (isAnyDraggingRef.current) return;
    if (!onSetSpeakers) return;
    if (isDraggingFW.current) return;

    const lwSpeaker = placedSpeakers?.find(s => getCanonicalRole(s.role) === 'LW');
    const rwSpeaker = placedSpeakers?.find(s => getCanonicalRole(s.role) === 'RW');

    // Only attempt FW positioning when LW/RW are actually present
    if (!lwSpeaker && !rwSpeaker) return;

    if (frontWideZones?.status !== 'ok') return;

    const W = widthM || 4.5;
    const L = lengthM || 6.0;
    const WALL_BUFFER_FW = 0.02;

    // [FIX] Settle tolerance to prevent flicker (1mm)
    const POS_TOL = 0.001;
    const roundMm = (v) => Math.round((Number(v) || 0) * 1000) / 1000;

    onSetSpeakers((prev) => {
      const list = Array.isArray(prev) ? prev : [];

      let changed = false;

      const next = list.map((s) => {
        const role = getCanonicalRole(s?.role);
        if (role !== "LW" && role !== "RW") return s;

        if (s.positionSource === "user") return s;

        // Validate model independently per side — do not block one side because of the other
        const modelStr = String(s.model || '').toLowerCase();
        if (!modelStr || modelStr === 'off' || modelStr === 'none') return s;

        const zone = role === "LW" ? frontWideZones.left : frontWideZones.right;
        if (!zone || !zone.medianY) return s;

        const dims = getModelDimsM(s.model);
        const halfWidth = (Number(dims?.widthM) || 0.20) / 2;
        const spkYaw = s.yaw ?? s.rotationDeg ?? s.rotation_deg ?? null;
        const halfExtent = xHalfExtentSideWall(
          Number(dims?.depthM) || 0.082,
          Number(dims?.widthM) || 0.20,
          spkYaw ?? 0
        );

        const xAtWall = role === "LW"
          ? (WALL_BUFFER_FW + halfExtent)
          : (W - WALL_BUFFER_FW - halfExtent);

        const sideOffsetKey = role === "LW" ? "L" : "R";
        const currentOffset = fwOffsetRef.current[sideOffsetKey] || 0;

        const targetYWithOffset = zone.medianY + currentOffset;
        const yMinClamped = (zone.yMin || 0) + (halfWidth * SIDE_ALLOW_OVERHANG);
        const yMaxClamped = (zone.yMax || L) - (halfWidth * SIDE_ALLOW_OVERHANG);

        const yClamped = roundMm(clamp(targetYWithOffset, yMinClamped, yMaxClamped));
        const xAtWallRounded = roundMm(xAtWall);

        const currentY = s.position?.y ?? 0;
        const currentX = s.position?.x ?? 0;

        if (Math.abs(currentY - yClamped) > POS_TOL || Math.abs(currentX - xAtWallRounded) > POS_TOL) {
          changed = true;
          return {
            ...s,
            position: { ...(s.position || {}), x: xAtWallRounded, y: yClamped, z: s.position?.z ?? 1.1 }
          };
        }

        return s;
      });

      return changed ? next : prev;
    });
    
  }, [
    frontWideZones,
    widthM,
    lengthM,
    speakersEpoch,
    getModelDimsM,
    onSetSpeakers,
    getCanonicalRole,
    isAnyDraggingRef,
    isDraggingFW,
    placedSpeakers,
    fwOffsetRef,
    clamp,
    SIDE_ALLOW_OVERHANG,
  ]);
}