"use client";

import { useMemo } from "react";
import { SIDE_ALLOW_OVERHANG, FADE_LEN_M } from "@/components/room/rvPlanHelpers";

export function useSideSurroundVisualSpanM({
  mlpY_m,
  seatingPositions,
  placedSpeakers,
  getModelDimsM,
  lengthM,
  getCanonicalRole,
}) {
  return useMemo(() => {
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

    const slSpeaker = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SL');
    const representativeHeightM = slSpeaker ? (getModelDimsM(slSpeaker.model)?.heightM || 0.2) : 0.2;

    const speakerHalfHeight = representativeHeightM / 2;
    const allowedOverhangDistance = SIDE_ALLOW_OVERHANG * representativeHeightM;

    const effectiveMinY_forCenter = zoneMinY_meters - allowedOverhangDistance + speakerHalfHeight;
    const effectiveMaxY_forCenter = zoneMaxY_meters + allowedOverhangDistance - speakerHalfHeight;

    return {
      minY: Math.max(0, effectiveMinY_forCenter),
      maxY: Math.min(roomLength, effectiveMaxY_forCenter),
    };
  }, [mlpY_m, seatingPositions, placedSpeakers, getModelDimsM, lengthM, getCanonicalRole]);
}