import React, { useMemo, useCallback } from "react";
import { useRoomCoordinateConverters } from "@/components/room/rv/hooks/useRoomCoordinateConverters";
import { useSideSurroundVisualSpanM } from "@/components/room/rv/hooks/useSideSurroundVisualSpanM";
import { computeRearVisualLanes } from "@/components/room/rvPlanHelpers";

export function useRoomGeometry({
  exportWidthPx,
  exportHeightPx,
  containerW,
  containerH,
  widthM,
  lengthM,
  viewOffsetPx,
  mlp,
  seatingPositions,
  placedSpeakers,
  getModelDimsM,
  getCanonicalRole,
  PADDING,
  TOP_GUTTER_PX,
  CORNER_CLEAR_M,
  BACKWALL_HYSTERESIS_M,
  FADE_LEN_M,
  WALL_BUFFER_M,
  ZONE_DEPTH_M,
  rearModeRef,
}) {
  const effectiveContainerW = Number.isFinite(Number(exportWidthPx))
    ? Number(exportWidthPx)
    : (Number.isFinite(containerW) ? containerW : 0);

  const effectiveContainerH = Number.isFinite(Number(exportHeightPx))
    ? Number(exportHeightPx)
    : (Number.isFinite(containerH) ? containerH : 0);

  const availW = effectiveContainerW - 2 * PADDING;
  const availH = effectiveContainerH - 2 * PADDING - TOP_GUTTER_PX;
  
  const scale = useMemo(() => {
    if (!Number.isFinite(availW) || !Number.isFinite(availH)) return null;
    if (availW <= 0 || availH <= 0) return null;
    if (!Number.isFinite(widthM) || !Number.isFinite(lengthM)) return null;
    if (widthM <= 0 || lengthM <= 0) return null;
    return Math.min(availW / widthM, availH / lengthM);
  }, [availW, availH, widthM, lengthM]);

  const roomRect = useMemo(() => {
    if (!Number.isFinite(scale)) return null;
    return {
      x: PADDING,
      y: PADDING + TOP_GUTTER_PX,
      width: widthM * scale,
      height: lengthM * scale,
    };
  }, [widthM, lengthM, scale]);

  const hasRoomRect = !!roomRect && Number.isFinite((roomRect?.x ?? 0)) && Number.isFinite((roomRect?.y ?? 0));

  const {
    toPx,
    meterToCanvasX,
    meterToCanvasY,
    canvasToRoom,
    roomToCanvas
  } = useRoomCoordinateConverters({
    roomRect,
    scale,
    viewOffsetPx
  });

  // Calculate MLP position for use in zones, now from the internally derived MLP
  const { mlpPxX, mlpPxY, midX_m, mlpY_m } = useMemo(() => {
    const [_mlpPxX, _mlpPxY] = toPx(mlp.x, mlp.y);
    return { mlpPxX: _mlpPxX, mlpPxY: _mlpPxY, midX_m: mlp.x, mlpY_m: mlp.y };
  }, [mlp, toPx]);

  // Memo for the valid Y-range for the *center* of SL/SR speakers — extracted to hook
  const sideSurroundVisualSpanM = useSideSurroundVisualSpanM({ mlpY_m, seatingPositions, placedSpeakers, getModelDimsM, lengthM, getCanonicalRole });

  // Initialize rear mode once (safe guard on mount or when speakers appear)
  React.useEffect(() => {
    const sbl = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SBL');
    if (!sbl) {
      // Rear surrounds not yet hydrated; skip rear mode init this pass
      return;
    }
    const L = lengthM || 0;
    if (!(L > 0)) return;

    // Inlined logic for decideRearMode
    const yMn = Number(sideSurroundVisualSpanM?.minY) || 0;
    const yMx = Math.max(yMn, Math.min(Number(sideSurroundVisualSpanM?.maxY) || 0, L - CORNER_CLEAR_M));
    const hys = BACKWALL_HYSTERESIS_M;
    const py = Number(sbl?.position?.y) || 0;
    rearModeRef.current = py > (yMx + hys) ? 'back' : 'side';
  }, [placedSpeakers, lengthM, sideSurroundVisualSpanM?.minY, sideSurroundVisualSpanM?.maxY, getCanonicalRole, CORNER_CLEAR_M, BACKWALL_HYSTERESIS_M, rearModeRef]);

  // Bounds for side surround speaker placement (in room-meter coordinates)
  const sideSurroundBounds = useMemo(() => {
    return {
      left: {
        yMin: Math.max(0, mlpY_m - FADE_LEN_M),
        yMax: lengthM,
      },
      right: {
        yMin: Math.max(0, mlpY_m - FADE_LEN_M),
        yMax: lengthM,
      }
    };
  }, [mlpY_m, lengthM, FADE_LEN_M]);

  // Visual X lanes for SBL/SBR centers, matching the back-wall overlay
  const rearSurroundVisualLanes = React.useMemo(() => {
    return computeRearVisualLanes(widthM || 0, seatingPositions, FADE_LEN_M);
  }, [widthM, seatingPositions, FADE_LEN_M]);

  // NEW: Define specific corridor zones for SBL/SBR
  const rearSurroundZones = useMemo(() => {
    const W = widthM || 4.5;
    const L = lengthM || 6.0;

    // Side bands (along Y on side walls)
    const sideY1 = Math.max(mlpY_m + FADE_LEN_M, L * 0.60);
    const sideY2 = L - WALL_BUFFER_M - CORNER_CLEAR_M;

    // Rear band (along X on back wall)
    const rearX1 = rearSurroundVisualLanes.left.minX;
    const rearX2 = rearSurroundVisualLanes.right.maxX;
    const rearY = L - WALL_BUFFER_M;

    return {
      leftSideBand: { y1: sideY1, y2: sideY2 },
      rightSideBand: { y1: sideY1, y2: sideY2 },
      rearBand: { x1: rearX1, x2: rearX2, y: rearY },
    };
  }, [widthM, lengthM, mlpY_m, rearSurroundVisualLanes, FADE_LEN_M, WALL_BUFFER_M, CORNER_CLEAR_M]);

  // Enhanced clampToSideBand with wall offset support
  const clampToSideBand = useCallback((speaker, proposedRoomX_m, proposedRoomY_m, wallOffsetM = 0) => {
    const canonicalRole = getCanonicalRole(speaker.role);
    // This function is specifically for SBL/SBR/RL/RW/LW. SL/SR handle their own clamping.
    if (!["RL", "LW", "RW"].includes(canonicalRole)) return { x: proposedRoomX_m, y: proposedRoomY_m };

    const isLeft = ["RL", "LW"].includes(canonicalRole);
    const bandBounds = sideSurroundBounds[isLeft ? "left" : "right"];
    if (!bandBounds) return { x: proposedRoomX_m, y: proposedRoomY_m };

    // Resolve model for accurate dimensions
    const { widthM: wM, depthM: dM } = getModelDimsM(speaker.model);
    const speakerLongSideM = Math.max(wM, dM);
    const speakerShortSideM = Math.min(wM, dM);

    const roomWidth = widthM || 0;
    const roomLength = lengthM || 0;

    let clampedX = proposedRoomX_m;
    let clampedY = proposedRoomY_m;

    // X constraints with wall offset (in meters)
    if (isLeft) {
      const targetX = wallOffsetM + speakerShortSideM / 2;
      clampedX = targetX;
    }
    if (!isLeft) {
      const targetX = roomWidth - (wallOffsetM + speakerShortSideM / 2);
      clampedX = targetX;
    }

    // Y constraints within band bounds and room (in meters)
    const minY = Math.max(bandBounds.yMin, 0 + speakerLongSideM / 2);
    const maxY = Math.min(bandBounds.yMax, roomLength - speakerLongSideM / 2);
    clampedY = Math.max(minY, Math.min(maxY, proposedRoomY_m));

    return { x: clampedX, y: clampedY };
  }, [sideSurroundBounds, widthM, lengthM, getModelDimsM, getCanonicalRole]);

  // ----- Rear Surround corridor helpers (meters) -----
  const RS_BAND_W_M = ZONE_DEPTH_M;

  const lastSeatY_m = React.useMemo(() => {
    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) return mlp.y;
    const ys = (Array.isArray(seatingPositions) ? seatingPositions : [])
      .map(s => Number(s.x))
      .filter(Number.isFinite);
    return ys.length ? Math.max(...ys) : mlp.y;
  }, [seatingPositions, mlp.y]);

  const rsSideCorridor = React.useCallback((side, dims, spk) => {
    const WALL_BUFFER_M_LOCAL = 0.02;
    const CORNER_BUFFER_M_LOCAL = 0.20;

    const halfW = (Number(spk.widthM) || 0) / 2;
    const halfD = (Number(spk.depthM) || 0) / 2;
    const W = widthM || 4.5;
    const L = lengthM || 6.0;

    const x = side === 'left'
      ? (WALL_BUFFER_M_LOCAL + halfD)
      : (W - (WALL_BUFFER_M_LOCAL + halfD));

    const yMin = Math.max(lastSeatY_m + halfW, CORNER_BUFFER_M_LOCAL + halfW);
    const yMax = Math.min(L - RS_BAND_W_M - halfW, L - CORNER_BUFFER_M_LOCAL - halfW);

    return { x, yMin, yMax };
  }, [lastSeatY_m, RS_BAND_W_M, widthM, lengthM]);

  const rsRearCorridor = React.useCallback((side, dims, spk) => {
    const WALL_BUFFER_M_LOCAL = 0.02;
    const CORNER_BUFFER_M_LOCAL = 0.20;

    const halfW = (Number(spk.widthM) || 0) / 2;
    const halfD = (Number(spk.depthM) || 0) / 2;
    const W = widthM || 4.5;
    const L = lengthM || 6.0;

    const y = L - (WALL_BUFFER_M_LOCAL + halfD);

    const seatXs = (Array.isArray(seatingPositions) ? seatingPositions : [])
      .map(s => Number(s.x)).filter(Number.isFinite);
    const leftmostSeatX = seatXs.length ? Math.min(...seatXs) : W * 0.35;
    const rightmostSeatX = seatXs.length ? Math.max(...seatXs) : W * 0.65;

    const fadeM = 0.50;

    const xMinL = CORNER_BUFFER_M_LOCAL + halfW;
    const xMaxL = Math.max(xMinL, Math.min(leftmostSeatX + fadeM, W - CORNER_BUFFER_M_LOCAL) - halfW);

    const xMinR = Math.max(CORNER_BUFFER_M_LOCAL, rightmostSeatX - fadeM) + halfW;
    const xMaxR = W - (CORNER_BUFFER_M_LOCAL + halfW);

    return side === 'left'
      ? { y, xMin: xMinL, xMax: xMaxL }
      : { y, xMin: xMinR, xMax: xMaxR };
  }, [seatingPositions, widthM, lengthM]);

  return {
    effectiveContainerW,
    effectiveContainerH,
    availW,
    availH,
    scale,
    roomRect,
    hasRoomRect,
    toPx,
    meterToCanvasX,
    meterToCanvasY,
    canvasToRoom,
    roomToCanvas,
    mlpPxX,
    mlpPxY,
    midX_m,
    mlpY_m,
    sideSurroundVisualSpanM,
    sideSurroundBounds,
    rearSurroundVisualLanes,
    rearSurroundZones,
    clampToSideBand,
    RS_BAND_W_M,
    lastSeatY_m,
    rsSideCorridor,
    rsRearCorridor,
  };
}