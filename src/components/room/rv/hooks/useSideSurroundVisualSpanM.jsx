"use client";

import { useMemo } from "react";
import { SIDE_ALLOW_OVERHANG, FADE_LEN_M } from "@/components/room/rvPlanHelpers";

/**
 * Pure core of the side-surround Y band. Exported so the initial placement
 * authority resolves a newly installed side surround's Y from exactly the same
 * rule the plan view uses.
 */
export function resolveSideSurroundVisualSpan({
  mlpY_m,
  seatingPositions,
  placedSpeakers,
  getModelDimsM,
  lengthM,
  getCanonicalRole,
}) {
  const roomLength = lengthM || 6.0;

  const seatYs = seatingPositions
    ?.map(s => Number(s.y))
    .filter(Number.isFinite) || [];

  const frontRowY_m =
    seatYs.length > 0
      ? Math.min(...seatYs)
      : mlpY_m;

  const zoneMinY_meters = Math.max(0, frontRowY_m - FADE_LEN_M);
  const zoneMaxY_meters = roomLength;

  const list = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  const slSpeaker = list.find(s => getCanonicalRole(s.role) === 'SL');
  const representativeHeightM = slSpeaker ? (getModelDimsM(slSpeaker.model)?.heightM || 0.2) : 0.2;

  const speakerHalfHeight = representativeHeightM / 2;
  const allowedOverhangDistance = SIDE_ALLOW_OVERHANG * representativeHeightM;

  const effectiveMinY_forCenter = zoneMinY_meters - allowedOverhangDistance + speakerHalfHeight;
  const effectiveMaxY_forCenter = zoneMaxY_meters + allowedOverhangDistance - speakerHalfHeight;

  return {
    minY: Math.max(0, effectiveMinY_forCenter),
    maxY: Math.min(roomLength, effectiveMaxY_forCenter),
  };
}

export function useSideSurroundVisualSpanM({
  mlpY_m,
  seatingPositions,
  placedSpeakers,
  getModelDimsM,
  lengthM,
  getCanonicalRole,
}) {
  return useMemo(
    () => resolveSideSurroundVisualSpan({
      mlpY_m,
      seatingPositions,
      placedSpeakers,
      getModelDimsM,
      lengthM,
      getCanonicalRole,
    }),
    [mlpY_m, seatingPositions, placedSpeakers, getModelDimsM, lengthM, getCanonicalRole]
  );
}