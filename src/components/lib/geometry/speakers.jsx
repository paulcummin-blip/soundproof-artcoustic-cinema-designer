/** Geometry helpers for speaker placement/rendering */

/**
 * Compute effective front projection depth when a rectangular box is angled on-wall.
 * angleDeg: 0 = flat; 10–15° typical. Adds a 0.10 m bracket by default.
 * @param {number} dFlatM
 * @param {number} angleDeg
 * @param {number} addBracketM
 */
export function effectiveDepthAtAngle(dFlatM, angleDeg, addBracketM = 0.10) {
  const d = Number(dFlatM) || 0;
  const a = Number(angleDeg) || 0;
  if (a <= 0) return d;
  const theta = (a * Math.PI) / 180;
  const added = d * Math.sin(theta); // front corner projection
  return d + addBracketM + added;
}