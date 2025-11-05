// /components/utils/viewingGeometry.js
// Converts a *viewable width* in inches to meters. (Not diagonal.)
export function computeScreenWidthMeters(opts) {
  const wIn = Number(opts?.visibleWidthInches);
  if (!Number.isFinite(wIn) || wIn <= 0) return undefined;
  return wIn * 0.0254; // inches -> meters
}

export function distanceForHorizontalFOV(targetFovDeg, screenWidthM) {
  const targetFovRad = (targetFovDeg * Math.PI) / 180;
  return (screenWidthM / 2) / Math.tan(targetFovRad / 2);
}