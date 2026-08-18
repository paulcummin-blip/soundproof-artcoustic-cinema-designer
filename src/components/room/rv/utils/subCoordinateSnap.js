// subCoordinateSnap.js — pure magnetic coordinate snap helper for subwoofers.
//
// Given a pre-clamped candidate position and a set of guide coordinates (from
// getSubPlacementGuideCoordinates), returns the nearest snap target within
// tolerance, or null. This is a UI interaction helper only — it contains no
// acoustic or RP22 logic.

/**
 * Find the nearest coordinate snap for a dragged subwoofer.
 *
 * @param {object} opts
 * @param {number} opts.candidateX       - pre-clamped dragged X (metres)
 * @param {number} opts.candidateY       - pre-clamped dragged Y (metres)
 * @param {object} opts.guideCoordinates - from getSubPlacementGuideCoordinates
 * @param {number} opts.toleranceM       - snap tolerance in metres
 * @returns {{type:'coordinate', x:number, y:number, snapX:number|null, snapY:number|null, xLabel:string|null, yLabel:string|null, intersectionType:string} | null}
 */
export function findCoordinateSnap({ candidateX, candidateY, guideCoordinates, toleranceM }) {
  if (!guideCoordinates) return null;
  if (!Number.isFinite(candidateX) || !Number.isFinite(candidateY)) return null;

  const tol = Number.isFinite(toleranceM) ? Math.abs(toleranceM) : 0.05;

  const xCandidates = [
    { value: guideCoordinates.leftX, label: "LEFT WALL" },
    { value: guideCoordinates.quarterX1, label: "1/4" },
    { value: guideCoordinates.midX, label: "1/2" },
    { value: guideCoordinates.quarterX3, label: "3/4" },
    { value: guideCoordinates.rightX, label: "RIGHT WALL" },
  ];

  const yCandidates = [
    { value: guideCoordinates.frontY, label: "FRONT WALL" },
    { value: guideCoordinates.quarterY1, label: "1/4" },
    { value: guideCoordinates.midY, label: "1/2" },
    { value: guideCoordinates.quarterY3, label: "3/4" },
    { value: guideCoordinates.rearY, label: "REAR WALL" },
  ];

  let snapX = null;
  let xLabel = null;
  for (const c of xCandidates) {
    if (Number.isFinite(c.value) && Math.abs(candidateX - c.value) <= tol) {
      snapX = c.value;
      xLabel = c.label;
      break;
    }
  }

  let snapY = null;
  let yLabel = null;
  for (const c of yCandidates) {
    if (Number.isFinite(c.value) && Math.abs(candidateY - c.value) <= tol) {
      snapY = c.value;
      yLabel = c.label;
      break;
    }
  }

  if (snapX === null && snapY === null) return null;

  const x = snapX !== null ? snapX : candidateX;
  const y = snapY !== null ? snapY : candidateY;

  let intersectionType;
  if (snapX !== null && snapY !== null) {
    const isWallX = xLabel === "LEFT WALL" || xLabel === "RIGHT WALL";
    const isWallY = yLabel === "FRONT WALL" || yLabel === "REAR WALL";
    if (isWallX && isWallY) intersectionType = "corner";
    else if (isWallX || isWallY) intersectionType = "wall-interior";
    else intersectionType = "interior-intersection";
  } else if (snapX !== null) {
    intersectionType = "x-only";
  } else {
    intersectionType = "y-only";
  }

  return { type: "coordinate", x, y, snapX, snapY, xLabel, yLabel, intersectionType };
}