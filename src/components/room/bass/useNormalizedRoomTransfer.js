// useNormalizedRoomTransfer.js — Phase 2A: Small API hook for the
// normalized room-transfer engine.
//
// Pure, synchronous, memoized. Does NOT invoke EQ fitting, candidate search,
// product capability, or RP22 grading. Does NOT wire into the visible graph
// (deferred to Phase 2B).
//
// Usage:
//   const result = useNormalizedRoomTransfer({ roomDims, rspPosition, ... });

import { useMemo } from "react";
import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";

export function useNormalizedRoomTransfer({
  roomDims,
  rspPosition,
  seatingPositions,
  subsForSimulation,
  physicsOptions,
}) {
  return useMemo(() => computeNormalizedRoomTransfer({
    roomDims,
    rspPosition,
    seatingPositions,
    subsForSimulation,
    physicsOptions,
  }), [roomDims, rspPosition, seatingPositions, subsForSimulation, physicsOptions]);
}