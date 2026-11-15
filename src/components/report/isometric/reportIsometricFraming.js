// reportIsometricFraming.js
// ---------------------------------------------------------------------------
// Pure camera framing for the report-only isometric view.
//
// The report uses a FIXED orthographic camera (35° azimuth, ≈20° elevation via
// a 70° polar angle measured from vertical), oriented relative to the screen
// wall, and frames the projected bounds of the complete scene so every speaker,
// subwoofer, seat and RSP marker fits the portrait page. It never reads a
// user-saved 3D camera position.
//
// The framing projects the eight corners of the scene's bounding box into
// camera space (right / up axes) and fits the orthographic frustum to the
// largest projected extents, respecting the canvas aspect ratio. This is
// tighter than a bounding-sphere fit and keeps the drawing consistently
// composed across different room proportions.

import * as THREE from "three";

export const REPORT_AZIMUTH_DEG = 35;
export const REPORT_POLAR_DEG = 70;

/**
 * Compute the fixed report isometric camera position and orthographic frustum.
 *
 * @param {THREE.Box3} boundingBox — the scene's world-space bounding box
 * @param {number} aspect — canvas width / height (portrait < 1 for A4 portrait)
 * @param {{azimuthDeg?: number, polarDeg?: number}} [options]
 * @returns {{position: THREE.Vector3, target: THREE.Vector3, left: number, right: number, top: number, bottom: number, near: number, far: number}}
 */
export function computeReportIsometricCamera(boundingBox, aspect, options = {}) {
  const azimuthDeg = Number.isFinite(options.azimuthDeg) ? options.azimuthDeg : REPORT_AZIMUTH_DEG;
  const polarDeg = Number.isFinite(options.polarDeg) ? options.polarDeg : REPORT_POLAR_DEG;

  const center = new THREE.Vector3();
  boundingBox.getCenter(center);

  const azimuth = (azimuthDeg * Math.PI) / 180;
  const polar = (polarDeg * Math.PI) / 180;

  // Direction FROM the target TO the camera (Three.js Y-up; room Y → Z, room Z → Y).
  const dir = new THREE.Vector3(
    Math.sin(polar) * Math.sin(azimuth),
    Math.cos(polar),
    Math.sin(polar) * Math.cos(azimuth),
  );

  const size = boundingBox.getSize(new THREE.Vector3());
  const distance = Math.max(size.length() * 2, 10);
  const camPos = center.clone().add(dir.clone().multiplyScalar(distance));

  // Camera basis: forward (toward target), right, up.
  const forward = center.clone().sub(camPos).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();

  // Project the eight bounding-box corners into camera right/up space.
  const corners = [
    [boundingBox.min.x, boundingBox.min.y, boundingBox.min.z],
    [boundingBox.max.x, boundingBox.min.y, boundingBox.min.z],
    [boundingBox.min.x, boundingBox.max.y, boundingBox.min.z],
    [boundingBox.max.x, boundingBox.max.y, boundingBox.min.z],
    [boundingBox.min.x, boundingBox.min.y, boundingBox.max.z],
    [boundingBox.max.x, boundingBox.min.y, boundingBox.max.z],
    [boundingBox.min.x, boundingBox.max.y, boundingBox.max.z],
    [boundingBox.max.x, boundingBox.max.y, boundingBox.max.z],
  ];

  let maxRight = 0;
  let maxUp = 0;
  for (const [cx, cy, cz] of corners) {
    const relative = new THREE.Vector3(cx, cy, cz).sub(camPos);
    const x = Math.abs(relative.dot(right));
    const y = Math.abs(relative.dot(up));
    if (x > maxRight) maxRight = x;
    if (y > maxUp) maxUp = y;
  }

  const margin = 1.08;
  maxRight *= margin;
  maxUp *= margin;

  // Fit the projected extents to the canvas aspect ratio so nothing clips.
  const projectedAspect = maxRight / Math.max(maxUp, 1e-6);
  let halfWidth;
  let halfHeight;
  if (projectedAspect > aspect) {
    // Width-limited: the scene is wider (in projection) than the canvas.
    halfWidth = maxRight;
    halfHeight = maxRight / aspect;
  } else {
    // Height-limited.
    halfHeight = maxUp;
    halfWidth = maxUp * aspect;
  }

  return {
    position: camPos,
    target: center.clone(),
    left: -halfWidth,
    right: halfWidth,
    top: halfHeight,
    bottom: -halfHeight,
    near: 0.5,
    far: distance * 2 + 10,
  };
}