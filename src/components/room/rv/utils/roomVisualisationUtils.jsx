// Pure utility functions extracted from RoomVisualisation.jsx
// These are coordinate, geometry, and role-mapping helpers with no JSX or state dependencies

const EPS = 0.0001; // Small epsilon for comparisons

// Role helpers
export const rvSafeCanonRole = (role) => String(role || '').toUpperCase();

export const rvIsOverheadRole = (role) => {
  const r = rvSafeCanonRole(role);
  switch (r) {
    case 'TFL':
    case 'TFR':
    case 'TML':
    case 'TMR':
    case 'TRL':
    case 'TRR':
    case 'TFC':
    case 'TRC':
    case 'TBC':
    case 'TL':
    case 'TR':
    case 'TBL':
    case 'TBR':
      return true;
    default:
      return false;
  }
};

// Legacy aliases for backward compatibility
export const canonRoleRV = rvSafeCanonRole;
export const isOverheadRole = rvIsOverheadRole;

// Math helpers
export const degToRad = (deg) => (deg * Math.PI) / 180;

export const rotatedHalfExtentToWall = (yawDeg, widthM_spk, depthM_spk, wallAxis /* "x" | "y" */) => {
  const halfW = Math.max(0, (Number(widthM_spk) || 0) / 2);
  const halfD = Math.max(0, (Number(depthM_spk) || 0) / 2);
  const a = Math.abs(Math.cos(degToRad(Number(yawDeg) || 0)));
  const b = Math.abs(Math.sin(degToRad(Number(yawDeg) || 0)));

  // wallAxis = "x" => left/right wall (normal is X)
  // wallAxis = "y" => front/back wall (normal is Y)
  return wallAxis === "x"
    ? (a * halfW + b * halfD)
    : (b * halfW + a * halfD);
};

// Physical (no stroke) half-extent along +/-Y for a rotated rectangle
export const yHalfExtentM_physical = (depthM, widthM, yawDeg = 0) => {
  const t = Math.abs((yawDeg || 0) * Math.PI / 180);
  return (depthM * 0.5) * Math.abs(Math.cos(t)) +
         (widthM * 0.5) * Math.abs(Math.sin(t));
};

// Seat geometry helpers
export function getSeatBandXBounds(seats) {
  if (!Array.isArray(seats) || seats.length === 0) {
    return { minX: null, maxX: null };
  }

  const xs = seats
    .map(s => Number(s?.position?.x ?? s?.x))
    .filter(Number.isFinite);

  if (!xs.length) {
    return { minX: null, maxX: null };
  }

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
  };
}

// Zone polygon intersection helper — safe fallback if polygons are missing
export function sideSegmentAtX(zonePolygonPoints, x, roomLength = 6.0) {
  const safeMinY = 0.5;
  const safeMaxY = Math.max(roomLength - 0.5, safeMinY + 0.1);

  if (!Array.isArray(zonePolygonPoints) || zonePolygonPoints.length < 3) {
    return { x, minY: safeMinY, maxY: safeMaxY, source: "fallback" };
  }

  try {
    const intersections = [];
    for (let i = 0; i < zonePolygonPoints.length; i++) {
      const p1 = zonePolygonPoints[i];
      const p2 = zonePolygonPoints[(i + 1) % zonePolygonPoints.length];

      if (!p1 || !p2 || typeof p1.x !== 'number' || typeof p1.y !== 'number' ||
          typeof p2.x !== 'number' || typeof p2.y !== 'number') continue;

      // intersect with vertical line at x (tolerant)
      if ((p1.x <= x + EPS && p2.x >= x - EPS) || (p1.x >= x - EPS && p2.x <= x + EPS)) {
        if (Math.abs(p1.x - p2.x) > EPS) {
          const t = (x - p1.x) / (p2.x - p1.x);
          const y = p1.y + t * (p2.y - p1.y);
          if (Number.isFinite(y) && t >= -EPS && t <= 1 + EPS) intersections.push(y);
        } else if (Math.abs(p1.x - x) < EPS) {
          intersections.push(p1.y, p2.y);
        }
      }
    }

    if (intersections.length >= 2) {
      return {
        x,
        minY: Math.min(...intersections),
        maxY: Math.max(...intersections),
        source: "poly"
      };
    }

    // fallback if nothing sensible found
    return { x, minY: safeMinY, maxY: safeMaxY, source: "fallback" };
  } catch {
    return { x, minY: safeMinY, maxY: safeMaxY, source: "fallback" };
  }
}

// Safe role accessor — works with Map or plain object; always returns an array
export function getByRoleArray(mapOrObj, role) {
  if (!mapOrObj || !role) return [];
  // If it's a Map, use .get()
  if (typeof mapOrObj.get === 'function') {
    return mapOrObj.get(role) || [];
  }
  // If it's a plain object (fallback in some cases), use direct property access
  return mapOrObj[role] || [];
}

// Front-channel role check (LCR + subs)
export const isFrontObject = (role = "") => {
  const r = String(role || '').toUpperCase();
  return r === "FL" || r === "FC" || r === "FR" || r.includes("SUB");
};