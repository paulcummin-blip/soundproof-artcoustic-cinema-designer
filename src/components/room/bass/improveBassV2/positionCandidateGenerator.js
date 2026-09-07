// positionCandidateGenerator.js
// Stage 11B: Local 100mm-grid subwoofer position candidate generation.
//
// Three phases of escalating physical search:
//   Phase A — Symmetric: front/rear pairs move together (left-right mirror preserved)
//   Phase B — Asymmetric pair: front and rear pairs move independently (each pair still mirrored)
//   Phase C — Individual: one sub moves independently
//
// All candidates use canonical geometry authority:
//   - subHalfExtents for cabinet footprint
//   - deriveSubWallOrientation for wall-aware rotation
//   - cabinet model dimensions from the speaker registry (never hardcoded)
//
// Deduplication: identical physical states are filtered out.

import { subHalfExtents, deriveSubWallOrientation } from "../../rv/utils/subWallOrientation.js";

const GRID_M = 0.1; // 100 mm
const SYM_MAX_M = 0.3; // ±300 mm for symmetric
const ASYM_MAX_M = 0.2; // ±200 mm for asymmetric/individual
const CLEARANCE_M = 0.01; // 10 mm wall clearance
const MIN_SUB_SEPARATION_M = 0.15; // minimum centre-to-centre distance

// ── Geometry helpers ────────────────────────────────────────────────────

function isPhysicallyValid(x, y, roomDims, subWidthM, subDepthM) {
  const W = Number(roomDims?.widthM) || 0;
  const L = Number(roomDims?.lengthM) || 0;
  if (W <= 0 || L <= 0) return false;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

  const { rotationDeg } = deriveSubWallOrientation({ x, y, widthM: W, lengthM: L, subWidthM, subDepthM });
  const { halfX, halfY } = subHalfExtents(subWidthM, subDepthM, rotationDeg);

  if (x < halfX + CLEARANCE_M || x > W - halfX - CLEARANCE_M) return false;
  if (y < halfY + CLEARANCE_M || y > L - halfY - CLEARANCE_M) return false;
  return true;
}

function validateCandidateSet(positions, roomDims, subWidthM, subDepthM) {
  for (const pos of positions) {
    if (!isPhysicallyValid(pos.x, pos.y, roomDims, subWidthM, subDepthM)) return false;
  }
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const dist = Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y);
      if (dist < MIN_SUB_SEPARATION_M) return false;
    }
  }
  return true;
}

function dedupKey(positions) {
  return positions.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join("|");
}

// ── Layout identification ────────────────────────────────────────────────

/**
 * Identify front/rear and left/right pairs from current positions.
 * Front = smaller Y, Rear = larger Y.
 * Within each pair, left = smaller X, right = larger X.
 */
function identifyLayout(positions) {
  if (!positions?.length) return null;

  const indexed = positions.map((p, i) => ({ ...p, originalIndex: i }));
  const sortedByY = [...indexed].sort((a, b) => a.y - b.y);

  if (positions.length === 1) {
    return { type: "single", subs: [{ ...sortedByY[0], role: "single" }] };
  }

  if (positions.length === 2) {
    const sortedByX = [...indexed].sort((a, b) => a.x - b.x);
    return {
      type: "pair",
      left: { ...sortedByX[0], role: "left" },
      right: { ...sortedByX[1], role: "right" },
    };
  }

  // 4 subs: split by Y into front/rear pairs
  const halfCount = Math.ceil(sortedByY.length / 2);
  const frontSubs = sortedByY.slice(0, halfCount).sort((a, b) => a.x - b.x);
  const rearSubs = sortedByY.slice(halfCount).sort((a, b) => a.x - b.x);

  return {
    type: "quad",
    frontLeft: frontSubs[0] || null,
    frontRight: frontSubs[1] || null,
    rearLeft: rearSubs[0] || null,
    rearRight: rearSubs[1] || null,
  };
}

// ── Movement helpers ─────────────────────────────────────────────────────

function moveLateralPair(leftSub, rightSub, deltaMm, roomWidthM) {
  // Inward: left X increases, right X decreases
  // Outward: left X decreases, right X increases
  const delta = deltaMm / 1000;
  const centerline = roomWidthM / 2;
  const leftInward = leftSub.x < centerline;
  const rightInward = rightSub.x >= centerline;

  return {
    left: { x: leftSub.x + (leftInward ? delta : -delta), y: leftSub.y },
    right: { x: rightSub.x + (rightInward ? -delta : delta), y: rightSub.y },
  };
}

function moveDepthPair(subs, deltaMm) {
  const delta = deltaMm / 1000;
  return subs.map((s) => ({ x: s.x, y: s.y + delta }));
}

// ── Phase A: Symmetric candidates ────────────────────────────────────────

function generateSymmetricQuad(layout, roomDims, subWidthM, subDepthM) {
  const candidates = [];
  const seen = new Set();
  const W = Number(roomDims.widthM);
  const { frontLeft, frontRight, rearLeft, rearRight } = layout;

  function tryAdd(label, positions, movement) {
    // Reconstruct full position array in original order
    const full = new Array(4);
    full[frontLeft.originalIndex] = positions[0];
    full[frontRight.originalIndex] = positions[1];
    full[rearLeft.originalIndex] = positions[2];
    full[rearRight.originalIndex] = positions[3];

    if (!validateCandidateSet(full, roomDims, subWidthM, subDepthM)) return;
    const key = dedupKey(full);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ id: `sym-${label}`, label, coordinates: full, movement, phase: "symmetric" });
  }

  const frontPair = [frontLeft, frontRight];
  const rearPair = [rearLeft, rearRight];

  for (const deltaMm of [100, 200, 300]) {
    for (const dir of [1, -1]) {
      const dirLabel = dir > 0 ? "inward" : "outward";

      // Front pair lateral
      const fLat = moveLateralPair(frontLeft, frontRight, dir * deltaMm, W);
      tryAdd(`front-${dirLabel}-${deltaMm}`,
        [fLat.left, fLat.right, rearLeft, rearRight],
        `Front pair ${dirLabel} ${deltaMm} mm`);

      // Rear pair lateral
      const rLat = moveLateralPair(rearLeft, rearRight, dir * deltaMm, W);
      tryAdd(`rear-${dirLabel}-${deltaMm}`,
        [frontLeft, frontRight, rLat.left, rLat.right],
        `Rear pair ${dirLabel} ${deltaMm} mm`);

      // Front pair depth
      const fDepth = moveDepthPair(frontPair, dir * deltaMm);
      tryAdd(`front-depth-${dir > 0 ? "back" : "fwd"}-${deltaMm}`,
        [fDepth[0], fDepth[1], rearLeft, rearRight],
        `Front pair ${dir > 0 ? "backward" : "forward"} ${deltaMm} mm`);

      // Rear pair depth
      const rDepth = moveDepthPair(rearPair, dir * deltaMm);
      tryAdd(`rear-depth-${dir > 0 ? "back" : "fwd"}-${deltaMm}`,
        [frontLeft, frontRight, rDepth[0], rDepth[1]],
        `Rear pair ${dir > 0 ? "backward" : "forward"} ${deltaMm} mm`);

      // Coordinated lateral (both pairs same direction)
      const fLatCoord = moveLateralPair(frontLeft, frontRight, dir * deltaMm, W);
      const rLatCoord = moveLateralPair(rearLeft, rearRight, dir * deltaMm, W);
      tryAdd(`both-${dirLabel}-${deltaMm}`,
        [fLatCoord.left, fLatCoord.right, rLatCoord.left, rLatCoord.right],
        `Both pairs ${dirLabel} ${deltaMm} mm`);

      // Coordinated depth (both toward center or apart)
      const fDepthCoord = moveDepthPair(frontPair, dir * deltaMm);
      const rDepthCoord = moveDepthPair(rearPair, -dir * deltaMm);
      tryAdd(`both-depth-${dir > 0 ? "apart" : "together"}-${deltaMm}`,
        [fDepthCoord[0], fDepthCoord[1], rDepthCoord[0], rDepthCoord[1]],
        `Both pairs ${dir > 0 ? "apart" : "together"} ${deltaMm} mm`);
    }
  }

  return candidates;
}

function generateSymmetricPair(layout, roomDims, subWidthM, subDepthM) {
  const candidates = [];
  const seen = new Set();
  const W = Number(roomDims.widthM);
  const { left, right } = layout;

  function tryAdd(label, positions, movement) {
    if (!validateCandidateSet(positions, roomDims, subWidthM, subDepthM)) return;
    const key = dedupKey(positions);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ id: `sym-${label}`, label, coordinates: positions, movement, phase: "symmetric" });
  }

  for (const deltaMm of [100, 200, 300]) {
    for (const dir of [1, -1]) {
      const dirLabel = dir > 0 ? "inward" : "outward";
      const lat = moveLateralPair(left, right, dir * deltaMm, W);
      tryAdd(`${dirLabel}-${deltaMm}`, [lat.left, lat.right], `Both ${dirLabel} ${deltaMm} mm`);

      // Depth
      const depth = moveDepthPair([left, right], dir * deltaMm);
      tryAdd(`depth-${dir > 0 ? "back" : "fwd"}-${deltaMm}`, depth, `Both ${dir > 0 ? "backward" : "forward"} ${deltaMm} mm`);
    }
  }

  return candidates;
}

// ── Phase B: Asymmetric pair candidates ──────────────────────────────────

function generateAsymmetricPairQuad(layout, roomDims, subWidthM, subDepthM) {
  const candidates = [];
  const seen = new Set();
  const W = Number(roomDims.widthM);
  const { frontLeft, frontRight, rearLeft, rearRight } = layout;

  function tryAdd(label, positions, movement) {
    const full = new Array(4);
    full[frontLeft.originalIndex] = positions[0];
    full[frontRight.originalIndex] = positions[1];
    full[rearLeft.originalIndex] = positions[2];
    full[rearRight.originalIndex] = positions[3];
    if (!validateCandidateSet(full, roomDims, subWidthM, subDepthM)) return;
    const key = dedupKey(full);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ id: `asym-${label}`, label, coordinates: full, movement, phase: "asymmetric-pair" });
  }

  for (const deltaMm of [100, 200]) {
    for (const fDir of [1, -1]) {
      for (const rDir of [1, -1]) {
        if (fDir === rDir) continue; // skip symmetric (already covered)
        const fLabel = fDir > 0 ? "in" : "out";
        const rLabel = rDir > 0 ? "in" : "out";
        const fLat = moveLateralPair(frontLeft, frontRight, fDir * deltaMm, W);
        const rLat = moveLateralPair(rearLeft, rearRight, rDir * deltaMm, W);
        tryAdd(`front-${fLabel}-rear-${rLabel}-${deltaMm}`,
          [fLat.left, fLat.right, rLat.left, rLat.right],
          `Front ${fLabel} ${deltaMm} mm, Rear ${rLabel} ${deltaMm} mm`);

        // Asymmetric depth
        const fDepth = moveDepthPair([frontLeft, frontRight], fDir * deltaMm);
        const rDepth = moveDepthPair([rearLeft, rearRight], rDir * deltaMm);
        tryAdd(`front-d${fDir > 0 ? "bk" : "fw"}-rear-d${rDir > 0 ? "bk" : "fw"}-${deltaMm}`,
          [fDepth[0], fDepth[1], rDepth[0], rDepth[1]],
          `Front ${fDir > 0 ? "back" : "fwd"} ${deltaMm} mm, Rear ${rDir > 0 ? "back" : "fwd"} ${deltaMm} mm`);

        // Mixed: front lateral + rear depth
        tryAdd(`front-${fLabel}-lat-rear-d${rDir > 0 ? "bk" : "fw"}-${deltaMm}`,
          [fLat.left, fLat.right, rDepth[0], rDepth[1]],
          `Front ${fLabel} ${deltaMm} mm, Rear ${rDir > 0 ? "back" : "fwd"} ${deltaMm} mm`);

        // Mixed: front depth + rear lateral
        tryAdd(`front-d${fDir > 0 ? "bk" : "fw"}-rear-${rLabel}-lat-${deltaMm}`,
          [fDepth[0], fDepth[1], rLat.left, rLat.right],
          `Front ${fDir > 0 ? "back" : "fwd"} ${deltaMm} mm, Rear ${rLabel} ${deltaMm} mm`);
      }
    }
  }

  return candidates;
}

// ── Phase C: Individual sub movement ──────────────────────────────────────

function generateIndividualCandidates(currentPositions, roomDims, subWidthM, subDepthM) {
  const candidates = [];
  const seen = new Set();

  for (let subIdx = 0; subIdx < currentPositions.length; subIdx++) {
    for (const deltaMm of [100, 200]) {
      for (const axis of ["x", "y"]) {
        for (const dir of [1, -1]) {
          const delta = (dir * deltaMm) / 1000;
          const positions = currentPositions.map((p, i) =>
            i === subIdx
              ? { x: axis === "x" ? p.x + delta : p.x, y: axis === "y" ? p.y + delta : p.y }
              : { x: p.x, y: p.y }
          );
          if (!validateCandidateSet(positions, roomDims, subWidthM, subDepthM)) continue;
          const key = dedupKey(positions);
          if (seen.has(key)) continue;
          seen.add(key);
          const dirLabel = axis === "x" ? (dir > 0 ? "right" : "left") : (dir > 0 ? "back" : "forward");
          candidates.push({
            id: `ind-sub${subIdx + 1}-${axis}-${dirLabel}-${deltaMm}`,
            label: `Sub ${subIdx + 1} ${dirLabel} ${deltaMm} mm`,
            coordinates: positions,
            movement: `Sub ${subIdx + 1} ${dirLabel} ${deltaMm} mm`,
            phase: "individual",
          });
        }
      }
    }
  }

  return candidates;
}

// ── Public API ───────────────────────────────────────────────────────────

export function generateSymmetricCandidates(currentPositions, roomDims, cabinetDims) {
  const subWidthM = cabinetDims?.widthM || 0.5;
  const subDepthM = cabinetDims?.depthM || 0.3;
  const layout = identifyLayout(currentPositions);
  if (!layout) return [];

  if (layout.type === "quad") return generateSymmetricQuad(layout, roomDims, subWidthM, subDepthM);
  if (layout.type === "pair") return generateSymmetricPair(layout, roomDims, subWidthM, subDepthM);
  return []; // single sub — no symmetric movement
}

export function generateAsymmetricPairCandidates(currentPositions, roomDims, cabinetDims) {
  const subWidthM = cabinetDims?.widthM || 0.5;
  const subDepthM = cabinetDims?.depthM || 0.3;
  const layout = identifyLayout(currentPositions);
  if (!layout) return [];

  if (layout.type === "quad") return generateAsymmetricPairQuad(layout, roomDims, subWidthM, subDepthM);
  return []; // pair/single — no asymmetric pair movement
}

export function generateIndividualCandidatesForPhase(currentPositions, roomDims, cabinetDims) {
  const subWidthM = cabinetDims?.widthM || 0.5;
  const subDepthM = cabinetDims?.depthM || 0.3;
  return generateIndividualCandidates(currentPositions, roomDims, subWidthM, subDepthM);
}

export { identifyLayout };