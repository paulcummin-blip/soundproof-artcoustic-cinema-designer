// src/components/roomdesigner/utils/speakerDepthHelpers.js

export const _isNum = (v) => typeof v === "number" && Number.isFinite(v);

export const _degToRad = (deg) => (deg * Math.PI) / 180;

export const _wrap180 = (deg) => {
  let d = deg;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
};

// Projects a rectangle half-extent onto a wall-normal axis, given yaw in degrees.
// This must remain identical to the inline version in RoomDesigner.jsx.
export const _projectHalfExtent = (yawDeg, widthM, depthM) => {
  const t = Math.abs(_degToRad(_wrap180(yawDeg || 0)));
  return (depthM * 0.5) * Math.abs(Math.cos(t)) + (widthM * 0.5) * Math.abs(Math.sin(t));
};

// Helper used by depth calculations. Caller passes getModelDimsM.
export const _getDimsM = (model, getModelDimsM, fallback = { widthM: 0.27, depthM: 0.082 }) => {
  const dims = (typeof getModelDimsM === "function") ? getModelDimsM(model) : null;
  const widthM = _isNum(dims?.widthM) ? dims.widthM : fallback.widthM;
  const depthM = _isNum(dims?.depthM) ? dims.depthM : fallback.depthM;
  return { widthM, depthM };
};