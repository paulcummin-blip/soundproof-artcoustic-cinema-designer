// src/components/utils/frontWideMedian.js
// RP22 Front Wide "median angle" (spatial midpoint) helper
// Used by: frontWideZones overlay + P7 calculation + Median Angle Reset
//
// Median angle definition (RP22):
// - Find spatial midpoint between FL and SL (left) and FR and SR (right)
// - Compute azimuth from MLP to that midpoint
// - Front wide target lies on that azimuth ray at the side wall (with inset)

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

const norm360 = (deg) => ((deg % 360) + 360) % 360;

const circDeltaDeg = (a, b) => {
  const d = Math.abs(norm360(a) - norm360(b)) % 360;
  return d > 180 ? 360 - d : d;
};

// Our app convention used elsewhere: atan2(dx, dy) where dx is X (left/right), dy is Y (front/back)
const azFromToDeg = (from, to) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return norm360((Math.atan2(dx, dy) * 180) / Math.PI);
};

const getXY = (s) => {
  if (!s) return null;
  const p = s.position || s.pos || s;
  const x = p?.x;
  const y = p?.y;
  if (!isNum(x) || !isNum(y)) return null;
  return { x, y };
};

const normaliseRole = (r) => {
  const x = String(r || "").trim().toUpperCase();
  // map common aliases
  if (x === "L") return "FL";
  if (x === "R") return "FR";
  if (x === "LS") return "SL";
  if (x === "RS") return "SR";
  if (x === "FWL") return "LW";
  if (x === "FWR") return "RW";
  return x;
};

const pickByRole = (speakers) => {
  const map = new Map();
  for (const s of speakers || []) {
    const role = normaliseRole(s?.role);
    if (!role) continue;
    // prefer first with a valid position
    if (!map.has(role)) map.set(role, s);
    else {
      const a = map.get(role);
      if (!getXY(a) && getXY(s)) map.set(role, s);
    }
  }
  return map;
};

const intersectRayWithWall = ({ mlp, azDeg, wallX, wallInset, lengthM }) => {
  // Ray: mlp + t * dir, dir from az
  const az = (norm360(azDeg) * Math.PI) / 180;
  const dx = Math.sin(az);
  const dy = Math.cos(az);

  if (!isNum(dx) || !isNum(dy) || Math.abs(dx) < 1e-9) return null;

  const xTarget = wallX;
  const t = (xTarget - mlp.x) / dx;
  if (!isNum(t) || t <= 0) return null;

  const y = mlp.y + t * dy;
  if (!isNum(y)) return null;

  // clamp inside room (with inset)
  const yClamped = Math.max(wallInset, Math.min(lengthM - wallInset, y));
  return { x: xTarget, y: yClamped };
};

export function computeFrontWideMedianData({
  placedSpeakers,
  mlpPoint,
  widthM,
  lengthM,
  wallInset = 0.05,
}) {
  const mlp = getXY(mlpPoint);
  if (!mlp || !isNum(widthM) || !isNum(lengthM) || widthM <= 0 || lengthM <= 0) {
    return { status: "no_data" };
  }

  const byRole = pickByRole(placedSpeakers);

  const FL = getXY(byRole.get("FL"));
  const FR = getXY(byRole.get("FR"));
  const SL = getXY(byRole.get("SL"));
  const SR = getXY(byRole.get("SR"));
  const LW = getXY(byRole.get("LW"));
  const RW = getXY(byRole.get("RW"));

  const haveLeftAnchors = !!(FL && SL);
  const haveRightAnchors = !!(FR && SR);

  if (!haveLeftAnchors && !haveRightAnchors) {
    return { status: "missing_anchors" };
  }

  const left = (() => {
    if (!haveLeftAnchors) return null;
    const mid = { x: (FL.x + SL.x) / 2, y: (FL.y + SL.y) / 2 };
    const medianAz = azFromToDeg(mlp, mid);
    const wallX = wallInset; // left wall
    const target = intersectRayWithWall({
      mlp,
      azDeg: medianAz,
      wallX,
      wallInset,
      lengthM,
    });
    const actualAz = LW ? azFromToDeg(mlp, LW) : null;
    const dev = LW && isNum(actualAz) ? circDeltaDeg(actualAz, medianAz) : null;
    return { mid, medianAz, target, actualAz, dev };
  })();

  const right = (() => {
    if (!haveRightAnchors) return null;
    const mid = { x: (FR.x + SR.x) / 2, y: (FR.y + SR.y) / 2 };
    const medianAz = azFromToDeg(mlp, mid);
    const wallX = widthM - wallInset; // right wall
    const target = intersectRayWithWall({
      mlp,
      azDeg: medianAz,
      wallX,
      wallInset,
      lengthM,
    });
    const actualAz = RW ? azFromToDeg(mlp, RW) : null;
    const dev = RW && isNum(actualAz) ? circDeltaDeg(actualAz, medianAz) : null;
    return { mid, medianAz, target, actualAz, dev };
  })();

  const hasWides = !!(LW && RW);
  const devs = [left?.dev, right?.dev].filter((v) => isNum(v));
  const maxDev = devs.length ? Math.max(...devs) : null;

  return {
    status: "ok",
    mlp,
    hasWides,
    left,
    right,
    maxDev,
  };
}

export function gradeP7FromMaxDev(maxDev) {
  if (!isNum(maxDev)) return { level: null, label: "—" };
  // thresholds: L4 <=2, L3 <=5, L2 <=7, L1 <=10, else FAIL
  if (maxDev <= 2) return { level: 4, label: "L4" };
  if (maxDev <= 5) return { level: 3, label: "L3" };
  if (maxDev <= 7) return { level: 2, label: "L2" };
  if (maxDev <= 10) return { level: 1, label: "L1" };
  return { level: 0, label: "FAIL" };
}