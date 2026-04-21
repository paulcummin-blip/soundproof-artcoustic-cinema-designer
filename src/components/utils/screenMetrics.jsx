export const M_PER_IN = 0.0254;

export const RP23 = {
  defaultFovDeg: 57.5,
  levels: [
    { name: "L4", min: 50, max: 65 },
    { name: "L3", min: 45, max: 70 },
    { name: "L2", min: 40, max: 80 },
    { name: "L1", min: 33, max: 90 },
  ],
};

const toRad = (deg) => (deg * Math.PI) / 180;

export function aspectHeight(widthM, aspect) {
  return aspect === "16:9" ? widthM * 9 / 16 : widthM / 2.35;
}

export function computeScreenMetrics(widthIn, aspect, borderThicknessM) {
  const viewWm = (Number(widthIn) || 0) * M_PER_IN;
  const viewHm = aspectHeight(viewWm, aspect);
  // borderThicknessM is per-side; default 0.08 m (8 cm) for projector screens
  const border = Number.isFinite(Number(borderThicknessM)) ? Number(borderThicknessM) : 0.08;
  const overallWm = viewWm + border * 2;
  const overallHm = viewHm + border * 2;

  // RP23 57.5° FOV distance calculation
  const distance57 = (viewWm / 2) / Math.tan(toRad(RP23.defaultFovDeg / 2));

  return { 
    viewWm, 
    viewHm, 
    overallWm, 
    overallHm, 
    distance57 
  };
}

export function distanceForFov(viewWidthM = 0, angleDeg = 57.5) {
  const w = Number(viewWidthM) || 0;
  const a = Number(angleDeg) || 0;
  if (w <= 0 || a <= 0) return null;
  const rad = (a * Math.PI) / 180;
  return (w / 2) / Math.tan(rad / 2);
}

export function fovForDistance(viewWm, distance) {
  return 2 * Math.atan((viewWm / 2) / distance) * (180 / Math.PI);
}

export function rp23LevelForAngle(angleDeg) {
  for (const L of RP23.levels) {
    if (angleDeg >= L.min && angleDeg <= L.max) return L.name;
  }
  return "L0";
}

export function clampViewingOffset(offset) {
  return Number(offset) || 0;
}