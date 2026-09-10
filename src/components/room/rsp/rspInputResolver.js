// Shared RSP input resolver — gathers the COMPLETE set of inputs required by
// computeEffectiveRsp() from appState + screen + seatingPositions.
//
// Every RSP consumer (RoomVisualisation, RvStaticCanvas, useClientReportAuthority,
// RP22Report) calls this resolver so that computeEffectiveRsp() receives
// identical inputs regardless of the rendering surface.
//
// This module does NOT compute the RSP itself — computeEffectiveRsp() remains
// the sole calculation authority. This resolver only normalises the inputs.

import { useMemo } from "react";
import { computeMLPAndPrimary } from "@/components/utils/computeMLPAndPrimary";
import {
  resolveRspScreenWidthM,
  resolveRspScreenFrontPlaneM,
} from "./screenGeometryResolver";

/**
 * Resolve a designated RSP seat object from its ID + the seating array.
 * Returns { id, x, y, z } or null when the seat is missing or has invalid coords.
 *
 * @param {string|null} designatedRspSeatId
 * @param {Array} seatingPositions
 * @returns {{ id: string, x: number, y: number, z: number }|null}
 */
export function resolveDesignatedRspSeat(designatedRspSeatId, seatingPositions) {
  if (!designatedRspSeatId || !Array.isArray(seatingPositions)) return null;
  const seat = seatingPositions.find((s) => s?.id === designatedRspSeatId);
  if (!seat) return null;
  const x = Number(seat.x);
  const y = Number(seat.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const z = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;
  return { id: seat.id, x, y, z };
}

/**
 * Compute row-derived RSP Y values from seating geometry.
 * Returns { front_row_center, middle_row_center, back_row_center, all_rows_average }
 * or {} when no seats are available.
 *
 * @param {Array} seatingPositions
 * @param {number} roomWidthM
 * @param {number} roomLengthM
 * @returns {object}
 */
export function resolveRowDerivedRspYByMode(seatingPositions, roomWidthM, roomLengthM) {
  if (!Array.isArray(seatingPositions) || !seatingPositions.length) return {};
  try {
    const result = computeMLPAndPrimary(seatingPositions, roomWidthM, roomLengthM, "front");
    return result?.rowDerivedRspYByMode ?? {};
  } catch {
    return {};
  }
}

/**
 * Gather all inputs required by computeEffectiveRsp() from appState + screen
 * + seatingPositions. Pure function — no side effects.
 *
 * @param {object} appState - from useAppState()
 * @param {object} screen - screen state object
 * @param {Array} seatingPositions
 * @param {number} roomWidthM
 * @param {number} roomLengthM
 * @returns {object} inputs ready to spread into computeEffectiveRsp() / useEffectiveRsp()
 */
export function resolveRspInputs({ appState, screen, seatingPositions, roomWidthM, roomLengthM }) {
  const rspMode = appState?.rspMode || "auto_from_screen";
  const manualRspY_m = appState?.manualRspY_m ?? null;
  const manualRspX_m = appState?.manualRspX_m ?? null;
  const designatedRspSeatId = appState?.designatedRspSeatId ?? null;

  const designatedRspSeat = resolveDesignatedRspSeat(designatedRspSeatId, seatingPositions);
  const rowDerivedRspYByMode = resolveRowDerivedRspYByMode(seatingPositions, roomWidthM, roomLengthM);
  const screenFrontPlaneM = resolveRspScreenFrontPlaneM(appState?.screenFrontPlaneM, screen);
  const screenWidthM = resolveRspScreenWidthM(screen);
  const currentMlpY_m = appState?.mlpY_m ?? null;

  return {
    rspMode,
    manualRspY_m,
    manualRspX_m,
    roomWidthM,
    screenFrontPlaneM,
    screenWidthM,
    seatingPositions,
    currentMlpY_m,
    rowDerivedRspYByMode,
    designatedRspSeat,
  };
}

/**
 * React hook wrapper around resolveRspInputs with memoisation.
 * Call this in any component that needs RSP inputs for useEffectiveRsp.
 *
 * @param {object} opts - { appState, screen, seatingPositions, roomWidthM, roomLengthM }
 * @returns {object} memoised RSP inputs
 */
export function useRspInputs({ appState, screen, seatingPositions, roomWidthM, roomLengthM }) {
  return useMemo(
    () => resolveRspInputs({ appState, screen, seatingPositions, roomWidthM, roomLengthM }),
    [
      appState?.rspMode,
      appState?.manualRspY_m,
      appState?.manualRspX_m,
      appState?.designatedRspSeatId,
      appState?.screenFrontPlaneM,
      appState?.mlpY_m,
      screen?.tvPresetKey,
      screen?.tvWidthMm,
      screen?.visibleWidthInches,
      screen?.manualWidthM,
      screen?.manualHeightM,
      screen?.aspectRatio,
      screen?.floatDepthM,
      screen?.screenPlaneY_m,
      screen?.manualSize,
      seatingPositions,
      roomWidthM,
      roomLengthM,
    ]
  );
}