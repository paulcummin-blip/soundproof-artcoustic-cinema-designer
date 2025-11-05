// components/room/utils/ScreenDepth.js
// Pure, dependency-free screen-depth helper

/**
 * Compute the minimum screen depth (metres) so the screen clears the deepest front object.
 *
 * @param {Object} params
 * @param {Array}  params.frontObjects - speakers/objects at the front wall (each: { role, model, position })
 * @param {Function} params.getDims - (model) => { widthM, depthM }
 * @param {Object} params.lcrAngles - { L: number, R: number } yaw (deg) for FL/FR if aiming is considered
 * @param {Function} params.getCanonicalRole - (role) => canonical role string (e.g. 'FL','FC','FR','SUB','LFE')
 * @param {Function} params.yHalfPhysical - (depthM, widthM, yawDeg) => half-extent in metres (no stroke padding)
 * @param {number} params.wallBufferM - clearance from front wall to object (metres)
 * @param {number} params.screenBufferM - clearance from object to screen plane (metres)
 * @param {boolean} [params.aimAtMLP=false] - whether to use L/R yaw angles for FL/FR
 *
 * @returns {number} minimum screen depth in metres
 */
export function computeMinimumScreenDepthM({
  frontObjects = [],
  getDims,
  lcrAngles = { L: 0, R: 0 },
  getCanonicalRole,
  yHalfPhysical,
  wallBufferM,
  screenBufferM,
  aimAtMLP = false,
}) {
  if (!Array.isArray(frontObjects) || frontObjects.length === 0) {
    return (Number(wallBufferM) || 0) + (Number(screenBufferM) || 0);
  }

  const needs = frontObjects.map((s) => {
    const dims = (typeof getDims === 'function' && getDims(s?.model)) || {};
    const widthM = Number(dims.widthM) || 0;
    const depthM = Number(dims.depthM) || 0;

    const role = typeof getCanonicalRole === 'function'
      ? getCanonicalRole(s?.role)
      : String(s?.role || '').toUpperCase();

    // Only FL/FR get yaw from lcrAngles (if aimAtMLP). FC & subs treated as 0° for physical depth.
    const yawDeg =
      aimAtMLP && role === 'FL' ? (Number(lcrAngles.L) || 0) :
      aimAtMLP && role === 'FR' ? (Number(lcrAngles.R) || 0) :
      0;

    const half = typeof yHalfPhysical === 'function'
      ? yHalfPhysical(depthM, widthM, yawDeg)
      : 0;

    const projectedY = 2 * half;
    return (Number(wallBufferM) || 0) + projectedY + (Number(screenBufferM) || 0);
  });

  const base = (Number(wallBufferM) || 0) + (Number(screenBufferM) || 0);
  return Math.max(...needs, base);
}

export default computeMinimumScreenDepthM;