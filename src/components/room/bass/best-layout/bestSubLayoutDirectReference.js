import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";

export function computeBestSubLayoutDirectReference({ roomDims, rspPosition, seatingPositions, sources, physicsOptions, pointsPerOctave }) {
  return computeNormalizedRoomTransfer({
    roomDims,
    rspPosition,
    seatingPositions,
    subsForSimulation: sources,
    physicsOptions: {
      ...physicsOptions,
      enableModes: false,
      enableReflections: false,
      debugDisableModalContribution: true,
      disableLateField: true,
    },
    pointsPerOctave,
    preparedModes: [],
  });
}