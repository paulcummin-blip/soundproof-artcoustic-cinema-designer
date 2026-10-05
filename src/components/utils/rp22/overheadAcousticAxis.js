/**
 * overheadAcousticAxis.js
 * -----------------------
 * THE single authority for a ceiling-mounted (overhead) speaker's acoustic axis.
 *
 * A ceiling speaker's CABINET normal is the ceiling vertical (straight down), but its
 * ACOUSTIC AXIS is not: it starts as the ceiling normal and is rotated by the model's
 * built-in tilt, in the vertical plane containing the speaker→RSP direction, so the axis
 * is aimed at the listening area.
 *
 * 0° IS THE ACOUSTIC AXIS. Every effective off-axis angle is measured from that aimed
 * axis, by vector geometry — never by subtracting the tilt as a scalar from a
 * ceiling-vertical angle. A scalar subtraction double-applies the tilt, because the
 * geometric angle to the RSP direction already contains the tilt's effect.
 *
 * Worked example — Spitfire Cloud, built-in tilt 22°: a listener 22° from ceiling
 * vertical in the direction of tilt sits at ~0° effective off-axis, not 22°.
 *
 * Consumed by the P17 engine (rp22HfOffAxis.jsx) and the seat-HUD metrics path
 * (computeSeatHudMetrics.jsx) so both report the same axis and the same angle.
 *
 * Pure: no React, no SDK, no writes.
 */

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Built-in acoustic-axis tilt (towards the MLP), in degrees, for models whose registry
 * metadata does not state it. Registry `builtInTiltDeg` / `polarModel.axisTiltDeg` always win.
 */
export function getOverheadTiltDeg(modelKey) {
  const key = (modelKey || "").toString().toLowerCase();

  // Mikro: flat baffle, no tilt
  if (key.includes("mikro")) return 0;

  // Architect 2-1: ~5° angled tweeter
  if (key.includes("architect-2-1")) return 5;

  // Architect 4-2: ~5° angled tweeter
  if (key.includes("architect-4-2")) return 5;

  // Architect PAS2-2: ~20° angled baffle
  if (key.includes("pas2-2") || key.includes("architect pas")) {
    return 20;
  }

  // Default: no built-in tilt
  return 0;
}

/**
 * The model's built-in acoustic-axis tilt in degrees. The declared measured-dataset axis
 * tilt wins, then the registry's built-in tilt, then the table above. Never invented.
 */
export function resolveOverheadTiltDeg(modelMeta, modelKey) {
  const polarTilt = modelMeta?.polarModel?.axisTiltDeg;
  if (isNum(Number(polarTilt))) return Number(polarTilt);
  const builtIn = modelMeta?.builtInTiltDeg;
  if (isNum(Number(builtIn))) return Number(builtIn);
  return getOverheadTiltDeg(modelKey) ?? 0;
}

// ── P17 overhead aimed-axis geometry ───────────────────────────────────────
// The built-in acoustic-axis tilt (5° Architect 2-1, 22° Spitfire Cloud, 20° PAS2-2) is
// directed toward the RSP as a true 3D axis vector — NOT a scalar subtraction from the raw
// vertical angle. The axis starts as the ceiling-normal (straight down) and is rotated by
// `tiltDeg` in the vertical plane containing the speaker→RSP horizontal direction. This makes
// the tilt benefit seats toward the RSP while seats away from the aiming direction no longer
// receive a free angular discount.
//
// Speaker acoustic origin = cabinet centre at ceiling height (no tweeter/driver offset).
export function buildOverheadAimedFrame(speakerPos, rspPos, tiltDeg) {
  if (!speakerPos || !rspPos) return null;
  const spkX = Number(speakerPos.x);
  const spkY = Number(speakerPos.y);
  const rspX = Number(rspPos.x);
  const rspY = Number(rspPos.y);
  if (!Number.isFinite(spkX) || !Number.isFinite(spkY) || !Number.isFinite(rspX) || !Number.isFinite(rspY)) return null;

  const t = Number.isFinite(Number(tiltDeg)) ? (Number(tiltDeg) * Math.PI) / 180 : 0;
  const sinT = Math.sin(t);
  const cosT = Math.cos(t);

  // Horizontal unit vector from speaker toward RSP (the tilt direction).
  const dx = rspX - spkX;
  const dy = rspY - spkY;
  const dh = Math.hypot(dx, dy);

  // Speaker directly above the RSP — no preferred tilt direction. Collapse to the untilted
  // (straight-down) axis with an arbitrary orthonormal frame.
  if (dh <= 1e-6) {
    return {
      forward: { x: 0, y: 0, z: -1 },
      up: { x: 0, y: 0, z: 1 },
      right: { x: 1, y: 0, z: 0 },
      tiltDeg: 0,
      horizontalDir: { x: 0, y: 0 },
    };
  }

  const Hx = dx / dh;
  const Hy = dy / dh;

  // forward = H·sin(t) + D·cos(t),  D = (0,0,-1)  → aimed acoustic axis (into the room)
  const forward = { x: Hx * sinT, y: Hy * sinT, z: -cosT };
  // up = (Hx·cos t, Hy·cos t, sin t)  → in the tilt plane, perpendicular to forward
  const up = { x: Hx * cosT, y: Hy * cosT, z: sinT };
  // right = (Hy, -Hx, 0)  → horizontal, perpendicular to the tilt plane (pitch axis)
  const right = { x: Hy, y: -Hx, z: 0 };

  return { forward, up, right, tiltDeg: Number.isFinite(Number(tiltDeg)) ? Number(tiltDeg) : 0, horizontalDir: { x: Hx, y: Hy } };
}

// Signed horizontal/vertical off-axis components (degrees) of a target direction relative to the
// aimed frame. vertical = elevation in the tilt plane (fore/aft vs RSP aim); horizontal = azimuth
// perpendicular to the tilt plane (left/right of RSP aim). Used to interrogate measured H/V polar
// datasets relative to the AIMED axis (not room +Y).
export function aimedFrameOffAxisDeg(frame, targetVec) {
  if (!frame || !targetVec) return { horizontalOffAxis: null, verticalOffAxis: null };
  const vx = Number(targetVec.x), vy = Number(targetVec.y), vz = Number(targetVec.z);
  if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) return { horizontalOffAxis: null, verticalOffAxis: null };
  const m = Math.hypot(vx, vy, vz);
  if (m <= 1e-9) return { horizontalOffAxis: 0, verticalOffAxis: 0 };
  const v = { x: vx / m, y: vy / m, z: vz / m };

  // Vertical component: project v into the tilt plane (remove the `right` component).
  const dRight = dot3(v, frame.right);
  const vVert = { x: v.x - dRight * frame.right.x, y: v.y - dRight * frame.right.y, z: v.z - dRight * frame.right.z };
  const mVert = Math.hypot(vVert.x, vVert.y, vVert.z);
  let verticalOffAxis = 0;
  if (mVert > 1e-9) {
    let c = dot3(frame.forward, vVert) / mVert;
    c = Math.max(-1, Math.min(1, c));
    verticalOffAxis = (Math.acos(c) * 180) / Math.PI;
    if (dot3(vVert, frame.up) < 0) verticalOffAxis = -verticalOffAxis;
  }

  // Horizontal component: project v into the plane perpendicular to `up`.
  const dUp = dot3(v, frame.up);
  const vHoriz = { x: v.x - dUp * frame.up.x, y: v.y - dUp * frame.up.y, z: v.z - dUp * frame.up.z };
  const mHoriz = Math.hypot(vHoriz.x, vHoriz.y, vHoriz.z);
  let horizontalOffAxis = 0;
  if (mHoriz > 1e-9) {
    let c = dot3(frame.forward, vHoriz) / mHoriz;
    c = Math.max(-1, Math.min(1, c));
    horizontalOffAxis = (Math.acos(c) * 180) / Math.PI;
    if (dot3(vHoriz, frame.right) < 0) horizontalOffAxis = -horizontalOffAxis;
  }

  return { horizontalOffAxis, verticalOffAxis };
}

// Total 3D off-axis angle (degrees, 0..180) between the aimed acoustic axis and a target vector.
// This IS the effective off-axis angle P17 grades.
export function aimedAxisOffAxisDeg(frame, targetVec) {
  if (!frame || !targetVec) return 0;
  const vx = Number(targetVec.x), vy = Number(targetVec.y), vz = Number(targetVec.z);
  const m = Math.hypot(vx, vy, vz);
  if (m <= 1e-9) return 0;
  let c = dot3(frame.forward, { x: vx, y: vy, z: vz }) / m;
  c = Math.max(-1, Math.min(1, c));
  return (Math.acos(c) * 180) / Math.PI;
}

/**
 * The GEOMETRIC angle from ceiling vertical (straight down) to a target vector — the
 * "how far from straight down" angle. Display evidence only: it is NEVER graded and never
 * fed to a polar lookup, because a tilted product's coverage is measured off its axis.
 */
export function geometricCeilingAngleDeg(targetVec) {
  if (!targetVec) return null;
  const m = Math.hypot(Number(targetVec.x) || 0, Number(targetVec.y) || 0, Number(targetVec.z) || 0);
  if (m <= 1e-9) return null;
  let c = (Number(targetVec.z) || 0) * -1 / m;   // dot with (0,0,-1)
  c = Math.max(-1, Math.min(1, c));
  return (Math.acos(c) * 180) / Math.PI;
}