import { useMemo } from 'react';

export const useSubwooferPlacementOptions = ({
  roomDimensions,
  numberOfSubs,
  placementMode,
  frontEnabled = true,
  rearEnabled = false,
  manualPositions = []
}) => {
  const { length, width, height } = roomDimensions || {};

  return useMemo(() => {
    if (!length || !width || !height || numberOfSubs < 1) return [];

    const subs = [];

    const safeZ = 0.1;
    const safeX = 0.5;
    const thirdX = length / 3;
    const yFront = 0.3;
    const yRear = width - 0.3;

    const addPair = (xLeft, xRight, y) => {
      if (numberOfSubs === 1) {
        // Single sub gets centered on symmetry axis
        subs.push({ id: 1, x: (xLeft + xRight) / 2, y, z: safeZ });
      } else {
        subs.push({ id: 1, x: xLeft, y, z: safeZ });
        subs.push({ id: 2, x: xRight, y, z: safeZ });
      }
    };

    if (placementMode === 'manual') {
      return manualPositions.map((pos, idx) => ({
        id: idx + 1,
        x: Math.min(Math.max(pos.x || 0, 0.2), length - 0.2),
        y: Math.min(Math.max(pos.y || 0, 0.2), width - 0.2),
        z: Math.min(Math.max(pos.z ?? safeZ, 0.1), height - 0.1)
      }));
    }

    if (placementMode === 'frontCorners' && frontEnabled) {
      addPair(safeX, length - safeX, yFront);
    }

    if (placementMode === 'rearCorners' && rearEnabled) {
      addPair(safeX, length - safeX, yRear);
    }

    if (placementMode === 'frontThirds' && frontEnabled) {
      addPair(thirdX, length - thirdX, yFront);
    }

    if (placementMode === 'rearThirds' && rearEnabled) {
      addPair(thirdX, length - thirdX, yRear);
    }

    return subs;
  }, [roomDimensions, numberOfSubs, placementMode, frontEnabled, rearEnabled, manualPositions]);
};