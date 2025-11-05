// hooks/useSubwooferPlacementOptions.jsx
import { useMemo, useRef } from 'react';

// Coordinate convention (used across the app):
// x = room width (left ↔ right), range [0 .. width]
// y = room length (front ↔ back), range [0 .. length]
// z = height from floor

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const useSubwooferPlacementOptions = ({
  roomDimensions,        // { width, length, height }
  numberOfSubs = 1,      // 1..4
  placementMode = 'frontCorners', // 'manual' | 'frontCorners' | 'rearCorners' | 'frontThirds' | 'rearThirds' | 'midWall'
  frontEnabled = true,
  rearEnabled = false,
  manualPositions = [],  // [{x,y,z?}, ...] using app axis convention
  edgeClearance = 0.3,   // meters from walls
}) => {
  const { width, length, height } = roomDimensions || {};
  const nextIdRef = useRef(1);
  const nextId = () => nextIdRef.current++;

  return useMemo(() => {
    if (!width || !length || !height || numberOfSubs < 1) return [];

    const subs = [];
    const zSafe = 0.1;

    const xLeft  = edgeClearance;
    const xRight = width - edgeClearance;
    const xThird = width / 3;                       // thirds along the WIDTH (x)
    const yFront = edgeClearance;                   // near screen/front wall
    const yRear  = length - edgeClearance;          // near rear wall
    const yMid   = length / 2;
    const xMid   = width / 2;

    const pushSub = (x, y, z = zSafe) => {
      subs.push({
        id: nextId(),
        role: 'SUB',
        label: 'SUB',
        position: {
          x: clamp(x, edgeClearance, width  - edgeClearance),
          y: clamp(y, edgeClearance, length - edgeClearance),
          z: clamp(z ?? zSafe, 0.1, Math.max(0.1, height - 0.1)),
        },
      });
    };

    // Manual mode passes through (but still clamps + shapes)
    if (placementMode === 'manual') {
      manualPositions.slice(0, numberOfSubs).forEach(pos => {
        pushSub(pos?.x ?? xMid, pos?.y ?? yFront, pos?.z ?? zSafe);
      });
      return subs;
    }

    const addFrontPair = () => {
      if (numberOfSubs === 1) {
        pushSub(xMid, yFront);
      } else if (numberOfSubs === 2) {
        pushSub(xLeft,  yFront);
        pushSub(xRight, yFront);
      } else if (numberOfSubs >= 4) {
        // quad: front corners now, rear corners later (if enabled)
        pushSub(xLeft,  yFront);
        pushSub(xRight, yFront);
      } else { // 3 subs: center + a mirrored pair is common
        pushSub(xMid,  yFront);
        pushSub(xLeft, yFront);
        pushSub(xRight, yFront);
      }
    };

    const addRearPair = () => {
      if (numberOfSubs === 1) {
        pushSub(xMid, yRear);
      } else if (numberOfSubs === 2) {
        pushSub(xLeft,  yRear);
        pushSub(xRight, yRear);
      } else if (numberOfSubs >= 4) {
        pushSub(xLeft,  yRear);
        pushSub(xRight, yRear);
      } else { // 3 subs: center + pair (rear)
        pushSub(xMid,  yRear);
        pushSub(xLeft, yRear);
        pushSub(xRight, yRear);
      }
    };

    const addFrontThirds = () => {
      if (numberOfSubs === 1) {
        pushSub(xMid, yFront);
      } else {
        pushSub(xThird,        yFront);
        pushSub(width - xThird, yFront);
        if (numberOfSubs >= 3) pushSub(xMid, yFront);
      }
    };

    const addRearThirds = () => {
      if (numberOfSubs === 1) {
        pushSub(xMid, yRear);
      } else {
        pushSub(xThird,         yRear);
        pushSub(width - xThird, yRear);
        if (numberOfSubs >= 3) pushSub(xMid, yRear);
      }
    };

    const addMidWall = () => {
      // midpoints on side walls are often useful for 2-sub patterns
      if (numberOfSubs === 1) {
        pushSub(xMid, yMid);
      } else {
        pushSub(xLeft,  yMid);
        pushSub(xRight, yMid);
        if (numberOfSubs >= 3) pushSub(xMid, yMid);
      }
    };

    // Apply selected mode(s)
    switch (placementMode) {
      case 'frontCorners':
        if (frontEnabled) addFrontPair();
        if (rearEnabled && numberOfSubs >= 4) addRearPair(); // fill to 4 if asked
        break;
      case 'rearCorners':
        if (rearEnabled) addRearPair();
        if (frontEnabled && numberOfSubs >= 4) addFrontPair();
        break;
      case 'frontThirds':
        if (frontEnabled) addFrontThirds();
        if (rearEnabled && numberOfSubs >= 4) addRearThirds();
        break;
      case 'rearThirds':
        if (rearEnabled) addRearThirds();
        if (frontEnabled && numberOfSubs >= 4) addFrontThirds();
        break;
      case 'midWall':
        addMidWall();
        break;
      default:
        // sensible fallback = front corners
        addFrontPair();
    }

    // Trim to requested count (keeps order deterministic)
    return subs.slice(0, numberOfSubs);
  }, [
    width, length, height,
    numberOfSubs, placementMode,
    frontEnabled, rearEnabled,
    manualPositions, edgeClearance,
  ]);
};