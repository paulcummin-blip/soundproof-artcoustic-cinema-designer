// Pure math helpers — ZERO React, safe to import anywhere.
export const toRad = (deg) => (deg * Math.PI) / 180;

// RP23: distance from screen front plane to MLP for a given screen *width* at 57.5° H-FOV
export function distanceFor57_5FromWidth(widthM) {
  const halfFov = toRad(57.5 / 2);
  return widthM / (2 * Math.tan(halfFov));
}

// Build row centers from an MLP Y, given spacing & reference mode.
// rows >= 1, spacingM >= 0. For rows === 1 we ignore reference.
export function buildRowCenters(mlpY, rows, spacingM, reference /* 'front' | 'back' | 'average' */) {
  if (rows <= 0) return [];
  if (rows === 1) return [mlpY];

  // We treat row 1 as FRONT, increasing Y goes deeper into room.
  const half = (rows - 1) / 2;
  const indexes = Array.from({ length: rows }, (_, i) => i);

  switch (reference) {
    case 'front': {
      // Front row sits on the dot.
      const base = mlpY;
      return indexes.map(i => base + i * spacingM);
    }
    case 'back': {
      // Back row sits on the dot.
      const base = mlpY - (rows - 1) * spacingM;
      return indexes.map(i => base + i * spacingM);
    }
    case 'average': // symmetric around dot
    default: {
      // Center of the stack sits on the dot (midpoint between front/back).
      // For 2 rows: front = mlp - spacing/2, back = mlp + spacing/2
      // For 3 rows: [mlp - s, mlp, mlp + s], etc.
      return indexes.map(i => mlpY + (i - half) * spacingM);
    }
  }
}

// Safe utility for computing row Y positions from MLP (legacy compatibility)
export function computeRowCentersFromMLP({ mlpY, numRows, spacingM, refMode }) {
  const N = Math.max(1, Number(numRows || 1));
  const s = Math.max(0, Number(spacingM || 1.0));

  if (!Number.isFinite(mlpY)) {
    // Return array of nulls if MLP is invalid
    return Array.from({ length: N }, () => null);
  }

  return buildRowCenters(mlpY, N, s, refMode);
}